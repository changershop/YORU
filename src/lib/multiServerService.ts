import { Anime, Episode, LinkedSeason, FranchiseGroup, FranchiseWatchOrderItem, Season } from '../types';
import { db } from './firebase';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, collectionGroup, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { fetchAniListAiredDates } from './anilistDateService';
import { normalizeAnime, normalizeEpisode } from './normalizers';

export const MULTISERVER_FIREBASE_CONFIG = {
  projectId: "ai-studio-applet-webapp-da80e",
  appId: "1:1003173197683:web:7e3b4aa36fa28c8ac13706",
  apiKey: "AIzaSyBlqzME9XchQwSTsOvK9mwtFj8q-8bz4xk",
  authDomain: "ai-studio-applet-webapp-da80e.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-275461e9-2fee-4ae9-a370-41c81e004bf4",
  storageBucket: "ai-studio-applet-webapp-da80e.firebasestorage.app",
  messagingSenderId: "1003173197683"
};

export interface MultiServerItem {
  order: number;
  type: string;
  season: string;
  title: string;
  anime_id: string;
  anilist_id: number | string;
  mal_id: number | string;
  episodes_available: number[];
  episode_details?: any[];
  episodes_count: number;
  total_episodes?: number;
  cover_image: string;
  backdrop_image?: string;
  banner_image?: string;
  status?: string;
  format?: string;
  synopsis?: string;
  genres?: string[];
  studios?: string[];
  score?: string | number;
  // 11 Rich Metadata Fields from Data Server
  japanese?: string;
  synonyms?: string[] | string;
  aired?: string;
  premiered?: string;
  duration?: string;
  mal_score?: string | number;
  episodes?: number;
  country?: string;
  source?: string;
  group_id?: string;
  group_title?: string;
  isCanon?: boolean;
}

export interface MultiServerGroup {
  group_id: string;
  title: string;
  slug: string;
  is_franchise: boolean;
  total_entries: number;
  cover_image?: string;
  banner_image?: string;
  items: MultiServerItem[];
}

export interface MultiServerRecentEpisode {
  anime_id: string;
  anilist_id: number | string;
  mal_id: number | string;
  group_id: string;
  group_title: string;
  title: string;
  season: string;
  latest_episode_number: number;
  available_episodes: number[];
  embed_url: string;
  updated_at: number | string;
}

const CACHE_KEY = 'multiserver_set_v4';
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface MultiServerCache {
  timestamp: number;
  anime: Anime[];
  episodesByAnimeId: Record<string, Episode[]>;
  franchises: MultiServerGroup[];
  rawItems: MultiServerItem[];
}

let inMemoryCache: MultiServerCache | null = null;
let fetchPromise: Promise<MultiServerCache> | null = null;

function getRemoteFirestore() {
  const existingApp = getApps().find(a => a.name === 'multiserver-remote');
  const remoteApp = existingApp || initializeApp(MULTISERVER_FIREBASE_CONFIG, 'multiserver-remote');
  return getFirestore(remoteApp, MULTISERVER_FIREBASE_CONFIG.firestoreDatabaseId);
}

function loadLocalCache(): MultiServerCache | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: MultiServerCache = JSON.parse(raw);
    if (Date.now() - parsed.timestamp < CACHE_TTL_MS && Array.isArray(parsed.anime) && parsed.anime.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore cache load error
  }
  return null;
}

function saveLocalCache(cache: MultiServerCache) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Local storage full or unavailable
  }
}

/**
 * Directly queries the MultiServer Firestore to generate the complete dataset (/set)
 * Works in any environment (Cloudflare Pages https://yorulive.pages.dev/, Node, local browser)
 */
export async function fetchMultiServerRawDataset(): Promise<{ groups: MultiServerGroup[]; rawItems: MultiServerItem[] }> {
  try {
    const remoteDb = getRemoteFirestore();
    const [franchisesSnap, animeSnap, episodesSnap] = await Promise.all([
      getDocs(collection(remoteDb, 'franchises')),
      getDocs(collection(remoteDb, 'anime')),
      getDocs(collectionGroup(remoteDb, 'episodes'))
    ]);

    // Map episodes by animeId
    const episodesByAnimeId: Record<string, number[]> = {};
    const episodeDetailsByAnimeId: Record<string, any[]> = {};
    episodesSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.hidden && data.animeId && data.number !== undefined) {
        const aId = String(data.animeId);
        if (!episodesByAnimeId[aId]) {
          episodesByAnimeId[aId] = [];
          episodeDetailsByAnimeId[aId] = [];
        }
        const num = Number(data.number);
        if (!episodesByAnimeId[aId].includes(num)) {
          episodesByAnimeId[aId].push(num);
          episodeDetailsByAnimeId[aId].push({
            number: num,
            title: data.title || `Episode ${num}`,
            thumbnail: data.thumbnailUrl || ''
          });
        }
      }
    });

    Object.keys(episodesByAnimeId).forEach(aId => {
      episodesByAnimeId[aId].sort((a, b) => a - b);
      episodeDetailsByAnimeId[aId].sort((a, b) => a.number - b.number);
    });

    // Map anime docs by id
    const animeById: Record<string, any> = {};
    animeSnap.docs.forEach(docSnap => {
      animeById[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
    });

    const franchiseCoveredAnimeIds = new Set<string>();
    const groups: MultiServerGroup[] = [];
    const allItems: MultiServerItem[] = [];

    // 1. Process Franchises
    franchisesSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const rawItems = Array.isArray(data.items) ? data.items : [];
      const items: MultiServerItem[] = [];
      const seen = new Set<string>();

      rawItems.forEach((it: any, idx: number) => {
        const aId = String(it.animeId);
        if (!aId || seen.has(aId)) return;
        seen.add(aId);
        franchiseCoveredAnimeIds.add(aId);

        const animeData = animeById[aId] || {};
        const epNums = episodesByAnimeId[aId] || [];
        const epDetails = episodeDetailsByAnimeId[aId] || [];
        const itemTitle = it.customTitle ||
          animeData.title?.english ||
          animeData.title?.romaji ||
          animeData.title?.native ||
          `Anime ${aId}`;

        const seasonNum = it.seasonNumber !== undefined && it.seasonNumber !== null && String(it.seasonNumber).trim() !== ''
          ? String(it.seasonNumber).trim()
          : it.type === 'Movie' ? 'Movie' : it.type === 'Special' ? 'Special' : it.type === 'OVA' ? 'OVA' : '1';

        const itemCover = animeData.coverImage || animeData.cover_image || animeData.poster || data.coverImage || '';
        const itemBanner = animeData.bannerImage || animeData.banner_image || animeData.backdrop || data.bannerImage || itemCover;
        const itemJapanese = animeData.japanese || animeData.animeInfo?.japanese || animeData.title?.native || '';
        const itemSynonyms = animeData.synonyms || animeData.animeInfo?.synonyms || (animeData.title?.romaji ? [animeData.title.romaji] : []);
        const itemAired = animeData.aired || animeData.animeInfo?.aired || (animeData.startDate ? `${animeData.startDate} to ${animeData.endDate || '?'}` : '');
        const itemPremiered = animeData.premiered || animeData.animeInfo?.premiered || (animeData.season ? String(animeData.season) : '');
        const itemDuration = animeData.duration || animeData.animeInfo?.duration || animeData.episodeDuration || '24m';
        const itemStatus = animeData.status || animeData.animeInfo?.status || 'FINISHED';
        const itemMalScore = animeData.malScore || animeData.mal_score || animeData.animeInfo?.malScore || animeData.averageScore || '';
        const itemEpisodesCount = animeData.episodes || animeData.animeInfo?.episodes || animeData.totalEpisodes || epNums.length || 12;
        const itemCountry = animeData.country || animeData.animeInfo?.country || 'Japan';
        const itemSource = animeData.source || animeData.animeInfo?.source || 'Original';
        const itemGenres = animeData.genres || animeData.animeInfo?.genres || ['Anime'];

        const itemObj: MultiServerItem = {
          order: Number(it.order) || idx + 1,
          type: it.type || 'Season',
          season: seasonNum,
          title: itemTitle,
          anime_id: aId,
          anilist_id: animeData.anilistId || (isNaN(Number(aId)) ? aId : Number(aId)),
          mal_id: animeData.malId || '',
          status: itemStatus,
          format: animeData.format || (it.type === 'Movie' ? 'MOVIE' : 'TV'),
          episodes_available: epNums,
          episode_details: epDetails,
          episodes_count: epNums.length,
          total_episodes: itemEpisodesCount,
          cover_image: itemCover,
          backdrop_image: itemBanner,
          banner_image: itemBanner,
          synopsis: animeData.description || '',
          genres: itemGenres,
          studios: Array.isArray(animeData.studios) ? animeData.studios : [],
          score: itemMalScore || animeData.averageScore || '85%',
          japanese: itemJapanese,
          synonyms: itemSynonyms,
          aired: itemAired,
          premiered: itemPremiered,
          duration: itemDuration,
          mal_score: itemMalScore,
          episodes: itemEpisodesCount,
          country: itemCountry,
          source: itemSource,
          group_id: String(data.slug || docSnap.id || `grp_${docSnap.id}`).trim().toLowerCase().replace(/\s+/g, '-'),
          group_title: data.title || 'Untitled Franchise',
          isCanon: it.isCanon !== undefined ? it.isCanon : true
        };

        items.push(itemObj);
        allItems.push(itemObj);
      });

      items.sort((a, b) => a.order - b.order);
      const groupId = String(data.slug || docSnap.id || `grp_${docSnap.id}`).trim().toLowerCase().replace(/\s+/g, '-');
      groups.push({
        group_id: groupId,
        title: data.title || 'Untitled Franchise',
        slug: data.slug || docSnap.id,
        is_franchise: true,
        total_entries: items.length,
        cover_image: data.coverImage || (items[0]?.cover_image || ''),
        banner_image: data.bannerImage || (items[0]?.banner_image || ''),
        items
      });
    });

    // 2. Process Standalone Anime
    Object.values(animeById).forEach(animeData => {
      const aId = String(animeData.id);
      if (!franchiseCoveredAnimeIds.has(aId)) {
        const epNums = episodesByAnimeId[aId] || [];
        const epDetails = episodeDetailsByAnimeId[aId] || [];
        const animeTitle = animeData.title?.english ||
          animeData.title?.romaji ||
          animeData.title?.native ||
          `Anime ${aId}`;

        const itemCover = animeData.coverImage || animeData.cover_image || animeData.poster || '';
        const itemBanner = animeData.bannerImage || animeData.banner_image || animeData.backdrop || itemCover;
        const itemJapanese = animeData.japanese || animeData.animeInfo?.japanese || animeData.title?.native || '';
        const itemSynonyms = animeData.synonyms || animeData.animeInfo?.synonyms || (animeData.title?.romaji ? [animeData.title.romaji] : []);
        const itemAired = animeData.aired || animeData.animeInfo?.aired || (animeData.startDate ? `${animeData.startDate} to ${animeData.endDate || '?'}` : '');
        const itemPremiered = animeData.premiered || animeData.animeInfo?.premiered || (animeData.season ? String(animeData.season) : '');
        const itemDuration = animeData.duration || animeData.animeInfo?.duration || animeData.episodeDuration || '24m';
        const itemStatus = animeData.status || animeData.animeInfo?.status || 'FINISHED';
        const itemMalScore = animeData.malScore || animeData.mal_score || animeData.animeInfo?.malScore || animeData.averageScore || '';
        const itemEpisodesCount = animeData.episodes || animeData.animeInfo?.episodes || animeData.totalEpisodes || epNums.length || 12;
        const itemCountry = animeData.country || animeData.animeInfo?.country || 'Japan';
        const itemSource = animeData.source || animeData.animeInfo?.source || 'Original';
        const itemGenres = animeData.genres || animeData.animeInfo?.genres || ['Anime'];

        const itemObj: MultiServerItem = {
          order: 1,
          type: animeData.format === 'MOVIE' ? 'Movie' : 'Season',
          season: '1',
          title: animeTitle,
          anime_id: aId,
          anilist_id: animeData.anilistId || (isNaN(Number(aId)) ? aId : Number(aId)),
          mal_id: animeData.malId || '',
          status: itemStatus,
          format: animeData.format || 'TV',
          episodes_available: epNums,
          episode_details: epDetails,
          episodes_count: epNums.length,
          total_episodes: itemEpisodesCount,
          cover_image: itemCover,
          backdrop_image: itemBanner,
          banner_image: itemBanner,
          synopsis: animeData.description || '',
          genres: itemGenres,
          studios: Array.isArray(animeData.studios) ? animeData.studios : [],
          score: itemMalScore || animeData.averageScore || '85%',
          japanese: itemJapanese,
          synonyms: itemSynonyms,
          aired: itemAired,
          premiered: itemPremiered,
          duration: itemDuration,
          mal_score: itemMalScore,
          episodes: itemEpisodesCount,
          country: itemCountry,
          source: itemSource,
          group_id: `single_${aId}`,
          group_title: animeTitle,
          isCanon: true
        };

        allItems.push(itemObj);
        const singleGroupId = `single_${itemObj.anilist_id || itemObj.mal_id || aId}`;
        groups.push({
          group_id: singleGroupId,
          title: animeTitle,
          slug: `single-${aId}`,
          is_franchise: false,
          total_entries: 1,
          cover_image: itemCover,
          banner_image: itemBanner,
          items: [itemObj]
        });
      }
    });

    return { groups, rawItems: allItems };
  } catch (err) {
    console.error('Failed to fetch raw dataset from MultiServer Firestore', err);
    return { groups: [], rawItems: [] };
  }
}

/**
 * Fetch and assemble all data from multiserver.pages.dev/set
 */
export async function fetchMultiServerDataset(forceRefresh = false): Promise<MultiServerCache> {
  if (!forceRefresh) {
    if (inMemoryCache && Date.now() - inMemoryCache.timestamp < CACHE_TTL_MS) {
      return inMemoryCache;
    }
    const local = loadLocalCache();
    if (local) {
      inMemoryCache = local;
      return local;
    }
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      const { groups, rawItems } = await fetchMultiServerRawDataset();

      // Batch-fetch accurate AniList aired dates (Start Date, End Date, Season)
      const allAniListIds = rawItems.map(i => i.anilist_id).filter(Boolean);
      const aniListDatesMap = await fetchAniListAiredDates(allAniListIds);

      const assembledAnime: Anime[] = [];
      const assembledEpisodes: Record<string, Episode[]> = {};

      groups.forEach(group => {
        const uniqueItems = Array.from(
          new Map(group.items.map(item => [item.anime_id, item])).values()
        ).sort((a, b) => a.order - b.order);

        if (uniqueItems.length === 0) return;

        const mainItem = uniqueItems[0];
        const isFranchise = group.is_franchise && uniqueItems.length > 1;
        const groupId = group.group_id;

        // 1. Build unified LinkedSeasons across all anime in this franchise
        const linkedSeasons: LinkedSeason[] = isFranchise ? uniqueItems.map((item, idx) => {
          const itemType = item.type || 'Season';
          let seasonName = '';

          if (itemType === 'Movie') {
            seasonName = item.title && item.title.toLowerCase().includes('movie')
              ? item.title
              : `🎬 ${item.title || 'Movie ' + (item.season || '')}`.trim();
          } else if (itemType === 'Special') {
            seasonName = `⭐ ${item.season || 'Special'}${item.title ? ': ' + item.title : ''}`;
          } else if (itemType === 'OVA') {
            seasonName = `💿 OVA ${item.season || ''}${item.title ? ': ' + item.title : ''}`;
          } else {
            // Clean season naming: avoid redundant "Season Season" or "Season 1: Season 1"
            const rawTitle = (item.title || '').trim();
            if (rawTitle && !rawTitle.toLowerCase().startsWith('season')) {
              seasonName = `Season ${item.season || idx + 1}: ${rawTitle}`;
            } else if (rawTitle) {
              seasonName = rawTitle;
            } else {
              seasonName = `Season ${item.season || idx + 1}`;
            }
          }

          seasonName = seasonName.replace(/Season Season/gi, 'Season').trim();

          const itemSlug = item.anime_id === mainItem.anime_id
            ? groupId
            : `ms_${item.anime_id}`;

          return {
            animeId: item.anime_id,
            seasonNumber: item.order || idx + 1,
            seasonName: seasonName,
            slug: itemSlug,
            title: seasonName
          };
        }) : [];

        // 2. Build Season Tabs matching the episodes' seasonId
        const seasonTabs: Season[] = isFranchise ? uniqueItems.map((item, idx) => ({
          id: String(item.anime_id),
          name: linkedSeasons[idx]?.seasonName || `Season ${idx + 1}`,
          order: item.order || idx + 1
        })) : [{ id: 's1', name: 'Season 1', order: 1 }];

        // 3. Resolve accurate canonical release dates from AniList
        const mainAniDate = aniListDatesMap.get(String(mainItem.anilist_id));
        const mainStart = mainAniDate?.startDate || (mainItem.aired ? mainItem.aired.split(/\s+to\s+|\s*-\s*/i)[0].trim() : '') || (mainItem.premiered ? String(mainItem.premiered) : '');
        const mainEnd = mainAniDate?.endDate || (mainItem.aired && (mainItem.aired.includes(' to ') || mainItem.aired.includes(' - ')) ? mainItem.aired.split(/\s+to\s+|\s*-\s*/i).pop()?.trim() : '') || '';
        const mainAired = mainAniDate?.aired || mainItem.aired || (mainStart && mainEnd && mainStart !== mainEnd ? `${mainStart} to ${mainEnd}` : mainStart);
        const mainPrem = mainAniDate?.season || mainItem.premiered || '';

        const primaryId = isFranchise ? groupId : `ms_${mainItem.anime_id}`;
        const primarySlug = isFranchise ? groupId : (mainItem.title ? mainItem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : `ms-${mainItem.anime_id}`);

        const animeObj: Anime = {
          id: primaryId,
          aniListId: String(mainItem.anilist_id || mainItem.anime_id),
          malId: mainItem.mal_id ? String(mainItem.mal_id) : undefined,
          title: group.title,
          nativeTitle: mainItem.japanese || group.title,
          slug: primarySlug,
          format: mainItem.type === 'Movie' ? 'Movie' : 'TV',
          totalEpisodes: mainItem.total_episodes || mainItem.episodes_count || 12,
          episodeDuration: mainItem.duration || '24 mins',
          status: mainItem.status === 'FINISHED' ? 'Finished' : 'Releasing',
          studios: Array.isArray(mainItem.studios) && mainItem.studios.length > 0 ? mainItem.studios.join(', ') : 'MultiServer',
          genres: mainItem.genres && mainItem.genres.length > 0 ? mainItem.genres : ['Anime'],
          startDate: mainStart,
          endDate: mainEnd,
          aired_from: mainStart || undefined,
          aired_to: mainEnd || undefined,
          aired_text: mainAired || undefined,
          aired: mainAired || undefined,
          premiered: mainPrem || undefined,
          season: mainPrem || (isFranchise ? 'Franchise' : '1'),
          seasonYear: mainAniDate?.seasonYear,
          averageScore: typeof mainItem.score === 'number' ? `${mainItem.score}%` : (mainItem.score || '85%'),
          poster: mainItem.cover_image || 'https://images.unsplash.com/photo-1542451313056-b7c8e626645f?auto=format&fit=crop&q=80&w=600',
          backdrop: mainItem.backdrop_image || mainItem.cover_image || '',
          synopsis: mainItem.synopsis || group.items[0]?.synopsis || 'Imported from MultiServer.',
          seasons: seasonTabs,
          seasonGroupId: isFranchise ? groupId : undefined,
          linkedSeasons: linkedSeasons,
          subEpisodesCount: 0,
          dubEpisodesCount: 0,
          multiEpisodesCount: mainItem.episodes_available?.length || 0,
          recentlyAddedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          published: true
        };

        assembledAnime.push(animeObj);

        // 4. For franchise groups, also register individual member anime objects so navigation & search work seamlessly
        if (isFranchise) {
          uniqueItems.forEach((item, idx) => {
            const itemAniDate = aniListDatesMap.get(String(item.anilist_id));
            const iStart = itemAniDate?.startDate || (item.aired ? item.aired.split(/\s+to\s+|\s*-\s*/i)[0].trim() : '') || (item.premiered ? String(item.premiered) : '');
            const iEnd = itemAniDate?.endDate || (item.aired && (item.aired.includes(' to ') || item.aired.includes(' - ')) ? item.aired.split(/\s+to\s+|\s*-\s*/i).pop()?.trim() : '') || '';
            const iAired = itemAniDate?.aired || item.aired || (iStart && iEnd && iStart !== iEnd ? `${iStart} to ${iEnd}` : iStart);
            const iPrem = itemAniDate?.season || item.premiered || '';

            const memberAnime: Anime = {
              id: `ms_${item.anime_id}`,
              aniListId: String(item.anilist_id || item.anime_id),
              malId: item.mal_id ? String(item.mal_id) : undefined,
              title: item.title || `${group.title} - Season ${item.season || idx + 1}`,
              nativeTitle: item.japanese || group.title,
              slug: item.anime_id === mainItem.anime_id ? groupId : `ms_${item.anime_id}`,
              format: item.type === 'Movie' ? 'Movie' : 'TV',
              totalEpisodes: item.total_episodes || item.episodes_count || 12,
              episodeDuration: item.duration || '24 mins',
              status: item.status === 'FINISHED' ? 'Finished' : 'Releasing',
              studios: Array.isArray(item.studios) && item.studios.length > 0 ? item.studios.join(', ') : 'MultiServer',
              genres: item.genres && item.genres.length > 0 ? item.genres : ['Anime'],
              startDate: iStart,
              endDate: iEnd,
              aired_from: iStart || undefined,
              aired_to: iEnd || undefined,
              aired_text: iAired || undefined,
              aired: iAired || undefined,
              premiered: iPrem || undefined,
              season: iPrem || `Season ${item.season || idx + 1}`,
              seasonYear: itemAniDate?.seasonYear,
              averageScore: typeof item.score === 'number' ? `${item.score}%` : (item.score || '85%'),
              poster: item.cover_image || animeObj.poster,
              backdrop: item.backdrop_image || item.cover_image || animeObj.backdrop,
              synopsis: item.synopsis || animeObj.synopsis,
              seasons: seasonTabs,
              linkedSeasons: linkedSeasons,
              seasonGroupId: groupId,
              seasonNumber: item.order || idx + 1,
              subEpisodesCount: 0,
              dubEpisodesCount: 0,
              multiEpisodesCount: item.episodes_available?.length || 0,
              recentlyAddedAt: Date.now(),
              createdAt: Date.now(),
              updatedAt: Date.now(),
              published: true
            };

            if (item.anime_id !== mainItem.anime_id) {
              assembledAnime.push(memberAnime);
            }
          });
        }

        // 5. Build Episodes for this group and index by group ID and individual item IDs
        uniqueItems.forEach(item => {
          const seasonIdForEp = isFranchise ? String(item.anime_id) : 's1';
          const itemEps: Episode[] = (item.episodes_available || []).map(epNum => {
            const anilistOrId = item.anilist_id || item.mal_id || item.anime_id;
            return {
              id: `${item.anime_id}_${epNum}`,
              animeId: primaryId,
              seasonId: seasonIdForEp,
              episodeNumber: epNum,
              title: `Episode ${epNum}`,
              isFiller: false,
              servers: [
                {
                  serverName: 'YUME',
                  serverType: 'multi',
                  embedLink: `https://yumestream.pages.dev/${anilistOrId}/${epNum}`
                }
              ],
              thumbnailUrl: item.cover_image || animeObj.poster,
              createdAt: Date.now(),
              published: true
            };
          });

          if (!assembledEpisodes[primaryId]) {
            assembledEpisodes[primaryId] = [];
          }
          assembledEpisodes[primaryId].push(...itemEps);

          // Index by individual anime IDs for instant lookup
          assembledEpisodes[item.anime_id] = itemEps.map(e => ({ ...e, animeId: item.anime_id }));
          assembledEpisodes[`ms_${item.anime_id}`] = itemEps.map(e => ({ ...e, animeId: `ms_${item.anime_id}` }));
        });
      });

      const result: MultiServerCache = {
        timestamp: Date.now(),
        anime: assembledAnime,
        episodesByAnimeId: assembledEpisodes,
        franchises: groups,
        rawItems
      };

      inMemoryCache = result;
      saveLocalCache(result);
      return result;
    } catch (err) {
      console.warn("fetchMultiServerDataset error", err);
      return { timestamp: Date.now(), anime: [], episodesByAnimeId: {}, franchises: [], rawItems: [] };
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export async function getMultiServerAnime(): Promise<Anime[]> {
  const dataset = await fetchMultiServerDataset();
  return dataset.anime;
}

export async function getMultiServerAnimeBySlug(slugOrId: string): Promise<Anime | null> {
  const dataset = await fetchMultiServerDataset();
  const clean = String(slugOrId).toLowerCase().trim();
  return dataset.anime.find(a => 
    a.slug.toLowerCase() === clean || 
    a.id.toLowerCase() === clean ||
    (a.aniListId && a.aniListId.toLowerCase() === clean)
  ) || null;
}

export async function getMultiServerEpisodesForAnime(animeIdOrSlug: string): Promise<Episode[]> {
  const dataset = await fetchMultiServerDataset();
  
  if (dataset.episodesByAnimeId[animeIdOrSlug]) {
    return dataset.episodesByAnimeId[animeIdOrSlug];
  }

  const bareId = animeIdOrSlug.replace(/^ms_/, '');
  if (dataset.episodesByAnimeId[bareId]) {
    return dataset.episodesByAnimeId[bareId];
  }
  if (dataset.episodesByAnimeId[`ms_${bareId}`]) {
    return dataset.episodesByAnimeId[`ms_${bareId}`];
  }
  
  const target = dataset.anime.find(a => 
    a.slug.toLowerCase() === animeIdOrSlug.toLowerCase() || 
    a.id.toLowerCase() === animeIdOrSlug.toLowerCase() ||
    (a.aniListId && a.aniListId.toLowerCase() === animeIdOrSlug.toLowerCase()) ||
    (a.aniListId && a.aniListId.toLowerCase() === bareId.toLowerCase())
  );
  if (target && dataset.episodesByAnimeId[target.id]) {
    return dataset.episodesByAnimeId[target.id];
  }
  
  return [];
}

/**
 * Fetch daily/recent episodes from collectionGroup('episodes')
 */
export async function fetchMultiServerRecentEpisodes(): Promise<MultiServerRecentEpisode[]> {
  try {
    const dataset = await fetchMultiServerDataset();
    const recentList: MultiServerRecentEpisode[] = [];

    for (const item of dataset.rawItems) {
      if (item.episodes_available && item.episodes_available.length > 0) {
        const latestEpNum = Math.max(...item.episodes_available);
        const anilistOrId = item.anilist_id || item.mal_id || item.anime_id;
        recentList.push({
          anime_id: item.anime_id,
          anilist_id: item.anilist_id,
          mal_id: item.mal_id,
          group_id: `single_${anilistOrId}`,
          group_title: item.title,
          title: item.title,
          season: item.season || '1',
          latest_episode_number: latestEpNum,
          available_episodes: item.episodes_available,
          embed_url: `https://yumestream.pages.dev/${anilistOrId}/${latestEpNum}`,
          updated_at: Date.now()
        });
      }
    }

    return recentList;
  } catch (e) {
    return [];
  }
}

export async function syncMultiServerToFirestore(onProgress?: (msg: string) => void): Promise<{ success: boolean; animeCount: number; epCount: number; error?: string }> {
  return { success: true, animeCount: 0, epCount: 0 };
}

/**
 * Fetch franchise groups from the Data Server and map them with local Firestore anime
 */
export async function fetchFranchiseGroups(): Promise<FranchiseGroup[]> {
  try {
    const { groups } = await fetchMultiServerRawDataset();
    // Only real franchise groups or groups with multiple entries
    const franchiseGroups = groups.filter(g => g.is_franchise || g.items.length > 1);

    // Query local anime to map matching local IDs and slugs
    let localAnimeList: Anime[] = [];
    try {
      const snap = await getDocs(collection(db, 'anime'));
      localAnimeList = snap.docs.map(d => ({ ...(d.data() as Anime), id: d.id }));
    } catch (e) {
      console.warn('Could not load local anime for franchise matching:', e);
    }

    const result: FranchiseGroup[] = franchiseGroups.map(g => {
      const items: FranchiseWatchOrderItem[] = g.items.map(item => {
        const aniIdStr = String(item.anilist_id || item.anime_id);
        const malIdStr = item.mal_id ? String(item.mal_id) : '';
        const itemSlug = (item.title || item.anime_id).toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const matched = localAnimeList.find(local => 
          (local.aniListId && String(local.aniListId) === aniIdStr) ||
          (malIdStr && local.malId && String(local.malId) === malIdStr) ||
          (local.id === `ms_${aniIdStr}` || local.id === item.anime_id) ||
          (local.slug && local.slug.toLowerCase() === itemSlug) ||
          (local.title && local.title.toLowerCase().trim() === item.title.toLowerCase().trim())
        );

        return {
          order: item.order,
          type: item.type || 'Season',
          season: item.season,
          anime_id: item.anime_id,
          title: item.title,
          cover_image: item.cover_image,
          banner_image: item.banner_image,
          episodes_available: item.episodes_available,
          episodes_count: item.episodes_count,
          localAnimeId: matched ? matched.id : undefined,
          localSlug: matched ? matched.slug : undefined,
          isCanon: item.isCanon !== undefined ? item.isCanon : true
        };
      });

      return {
        id: g.group_id,
        group_id: g.group_id,
        title: g.title,
        name: g.title,
        slug: g.slug,
        cover_image: g.cover_image,
        banner_image: g.banner_image,
        total_entries: items.length,
        items,
        updatedAt: Date.now()
      };
    });

    return result;
  } catch (err) {
    console.error('Error fetching franchise groups:', err);
    return [];
  }
}

/**
 * Apply franchise watch order to local Firestore anime and update the franchise document
 */
export async function applyFranchiseWatchOrder(group: FranchiseGroup): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  const batch = writeBatch(db);

  // 1. Save to franchises collection
  const franchiseRef = doc(db, 'franchises', group.group_id);
  batch.set(franchiseRef, {
    ...group,
    updatedAt: Date.now()
  });

  // 2. Update each matched local anime with the franchise watch order
  for (const item of group.items) {
    if (item.localAnimeId) {
      const animeRef = doc(db, 'anime', item.localAnimeId);
      batch.update(animeRef, {
        franchiseGroupId: group.group_id,
        franchiseGroupName: group.title,
        franchiseWatchOrder: group.items,
        updatedAt: Date.now()
      });
      updatedCount++;
    }
  }

  await batch.commit();
  return { updatedCount };
}

/**
 * Auto-match all franchise groups from Data Server with local Firestore anime
 */
export async function autoMatchAllFranchiseGroups(onProgress?: (curr: number, total: number, name: string) => void): Promise<{ totalGroups: number; totalUpdatedAnime: number }> {
  const groups = await fetchFranchiseGroups();
  let totalUpdatedAnime = 0;

  for (let i = 0; i < groups.length; i++) {
    const grp = groups[i];
    onProgress?.(i + 1, groups.length, grp.title);
    const res = await applyFranchiseWatchOrder(grp);
    totalUpdatedAnime += res.updatedCount;
  }

  return { totalGroups: groups.length, totalUpdatedAnime };
}
