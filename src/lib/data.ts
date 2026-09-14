import { collection, getDocs, doc, getDoc, query, where, limit, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Anime, Episode, SpotlightSlide } from '../types';
import { getMultiServerAnime, getMultiServerAnimeBySlug, getMultiServerEpisodesForAnime } from './multiServerService';
import { 
  normalizeAnime, 
  normalizeEpisode, 
  normalizeServer, 
  getCanonicalReleaseTimestamp, 
  getCanonicalEndTimestamp 
} from './normalizers';
import { fetchAniListAiredDates, getCachedAniListAired } from './anilistDateService';

// Module-level in-memory cache for high-performance instant navigation
let animeCache: { data: Anime[]; timestamp: number } | null = null;
let animeCachePromise: Promise<Anime[]> | null = null;
const ANIME_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

export function invalidateAnimeCache() {
  animeCache = null;
  animeCachePromise = null;
}

export function mergeAnimeDatasets(localList: Anime[], multiList: Anime[]): Anime[] {
  const map = new Map<string, Anime>();
  const aniListMap = new Map<string, Anime>();
  const slugMap = new Map<string, Anime>();

  // 1. Index local items (pass through standard normalizer)
  localList.forEach(raw => {
    const a = normalizeAnime(raw);
    map.set(a.id, a);
    if (a.aniListId) aniListMap.set(String(a.aniListId), a);
    if (a.slug) slugMap.set(a.slug.toLowerCase(), a);
  });

  // 2. Merge multiServer items (pass through standard normalizer)
  multiList.forEach(rawM => {
    const m = normalizeAnime(rawM);
    const existing = map.get(m.id) || 
      (m.aniListId ? aniListMap.get(String(m.aniListId)) : null) || 
      (m.slug ? slugMap.get(m.slug.toLowerCase()) : null);

    if (existing) {
      existing.linkedSeasons = (existing.linkedSeasons && existing.linkedSeasons.length > 0) ? existing.linkedSeasons : m.linkedSeasons;
      if (m.seasons && (!existing.seasons || existing.seasons.length <= 1)) {
        existing.seasons = m.seasons;
      }
      if (m.subEpisodesCount && (!existing.subEpisodesCount || m.subEpisodesCount > existing.subEpisodesCount)) {
        existing.subEpisodesCount = m.subEpisodesCount;
      }
      if (m.multiEpisodesCount) existing.multiEpisodesCount = m.multiEpisodesCount;
      if (m.dubEpisodesCount) existing.dubEpisodesCount = m.dubEpisodesCount;
      if (!existing.poster || existing.poster.includes('unsplash')) existing.poster = m.poster;
      if (!existing.backdrop) existing.backdrop = m.backdrop;
      if (!existing.synopsis || existing.synopsis === 'No synopsis available.') existing.synopsis = m.synopsis;
      if (!existing.genres || existing.genres.length === 0) existing.genres = m.genres;

      // Preserve accurate dates from MultiServer/AniList over generic fallback
      if (m.startDate && (!existing.startDate || existing.startDate.includes('2026'))) {
        existing.startDate = m.startDate;
      }
      if (m.endDate && !existing.endDate) {
        existing.endDate = m.endDate;
      }
      if (m.aired && (!existing.aired || existing.aired.includes('2026'))) {
        existing.aired = m.aired;
      }
      if (m.aired_from && !existing.aired_from) existing.aired_from = m.aired_from;
      if (m.aired_to && !existing.aired_to) existing.aired_to = m.aired_to;
      if (m.premiered && (!existing.premiered || existing.premiered.includes('2026'))) existing.premiered = m.premiered;
      if (m.season && (!existing.season || existing.season.includes('2026'))) existing.season = m.season;
      if (m.seasonYear && !existing.seasonYear) existing.seasonYear = m.seasonYear;
    } else {
      map.set(m.id, m);
      if (m.aniListId) aniListMap.set(String(m.aniListId), m);
      if (m.slug) slugMap.set(m.slug.toLowerCase(), m);
    }
  });

  return Array.from(map.values());
}

// Mock data fallback
export const mockAnimeList: Anime[] = [
  {
    id: "a1",
    title: "Shadows of the Eclipse",
    nativeTitle: "エクリプスの影",
    slug: "shadows-of-the-eclipse",
    synopsis: "In a world where the sun never truly rises, a young warrior discovers the power of the twilight to combat the creatures of the eternal night.",
    poster: "https://images.unsplash.com/photo-1542451313056-b7c8e626645f?auto=format&fit=crop&q=80&w=600",
    backdrop: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=1920",
    genres: ["Action", "Dark Fantasy", "Supernatural"],
    format: "TV",
    status: "Releasing",
    startDate: "Sep 29, 2026",
    endDate: "",
    season: "Fall 2026",
    averageScore: "91%",
    studios: "MAPPA",
    episodeDuration: "24 mins",
    totalEpisodes: 24,
    seasons: [{ id: 's1', name: 'Season 1', order: 1 }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    published: true,
  },
  {
    id: "a2",
    title: "Neon Echoes",
    nativeTitle: "ネオン・エコーズ",
    slug: "neon-echoes",
    synopsis: "A cyberpunk detective story set in Neo-Dhaka, where digital memories are traded like currency, and someone is erasing the city's past.",
    poster: "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=600",
    backdrop: "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?auto=format&fit=crop&q=80&w=1920",
    genres: ["Sci-Fi", "Mystery", "Cyberpunk"],
    format: "TV",
    status: "Finished",
    startDate: "Jan 10, 2025",
    endDate: "Mar 25, 2025",
    season: "Winter 2025",
    averageScore: "85%",
    studios: "Bones",
    episodeDuration: "23 mins",
    totalEpisodes: 12,
    seasons: [{ id: 's1', name: 'Season 1', order: 1 }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    published: true,
  }
];

export const mockEpisodes: Episode[] = [
  {
    id: "e1",
    animeId: "a1",
    seasonId: "s1",
    episodeNumber: 1,
    title: "The Long Night Begins",
    servers: [
      {
        serverName: "HD-1",
        serverType: "sub",
        embedLink: "https://www.youtube.com/embed/aqz-KE-bpKQ"
      }
    ],
    thumbnailUrl: "https://images.unsplash.com/photo-1505322022379-7c3353ee6291?auto=format&fit=crop&q=80&w=800",
    isFiller: false,
    createdAt: Date.now(),
    published: true,
  },
  {
    id: "e2",
    animeId: "a1",
    seasonId: "s1",
    episodeNumber: 2,
    title: "Shadow Stalker",
    servers: [
      {
        serverName: "HD-1",
        serverType: "sub",
        embedLink: "https://www.youtube.com/embed/aqz-KE-bpKQ"
      }
    ],
    thumbnailUrl: "https://images.unsplash.com/photo-1509205477838-a534e43a8ce9?auto=format&fit=crop&q=80&w=800",
    isFiller: false,
    createdAt: Date.now(),
    published: true,
  }
];

export async function getAllAnime(forceRefresh = false): Promise<Anime[]> {
  const now = Date.now();

  // Return fresh in-memory cache if available
  if (!forceRefresh && animeCache && (now - animeCache.timestamp < ANIME_CACHE_TTL)) {
    return animeCache.data;
  }

  // Deduplicate in-flight promises so parallel calls do not trigger multiple Firestore queries
  if (animeCachePromise) {
    return animeCachePromise;
  }

  animeCachePromise = (async () => {
    try {
      const [localSnap, multiList] = await Promise.all([
        getDocs(collection(db, 'anime')).catch(() => null),
        getMultiServerAnime().catch(() => [])
      ]);

      const localList: Anime[] = localSnap && !localSnap.empty
        ? localSnap.docs.map(doc => doc.data() as Anime)
        : [];

      const merged = mergeAnimeDatasets(localList, multiList);
      const filtered = merged.filter(a => a.published && !a.isBanned);
      const finalResult = filtered.length > 0 ? filtered : mockAnimeList;

      animeCache = {
        data: finalResult,
        timestamp: Date.now()
      };

      return finalResult;
    } catch (e) {
      console.warn("getAllAnime error:", e);
      return mockAnimeList;
    } finally {
      animeCachePromise = null;
    }
  })();

  return animeCachePromise;
}

export async function getTrendingAnime(maxCount = 10, prefetchedAnime?: Anime[]): Promise<Anime[]> {
  try {
    const [allAnimeList, progressSnap] = await Promise.all([
      prefetchedAnime ? Promise.resolve(prefetchedAnime) : getAllAnime(),
      getDocs(collection(db, 'watchProgress')).catch(() => null)
    ]);

    const all = [...allAnimeList];

    // Aggregate real watch progress counts per anime
    const watchCountMap = new Map<string, number>();
    if (progressSnap && !progressSnap.empty) {
      progressSnap.docs.forEach(d => {
        const data = d.data();
        if (data.animeId) {
          watchCountMap.set(data.animeId, (watchCountMap.get(data.animeId) || 0) + 1);
        }
      });
    }

    all.sort((a, b) => {
      const countA = watchCountMap.get(a.id) || 0;
      const countB = watchCountMap.get(b.id) || 0;
      if (countB !== countA) return countB - countA;
      const scoreA = parseFloat(a.averageScore || '0') || 0;
      const scoreB = parseFloat(b.averageScore || '0') || 0;
      return scoreB - scoreA;
    });

    return all.slice(0, maxCount);
  } catch (e) {
    console.warn("Failed to fetch trending anime", e);
    return mockAnimeList.slice(0, maxCount);
  }
}

export async function getAnimeBySlug(slug: string): Promise<Anime | null> {
  try {
    // 1. Check in-memory cache first if already loaded
    if (animeCache && animeCache.data.length > 0) {
      const clean = slug.toLowerCase().trim();
      const inCache = animeCache.data.find(a => 
        a.slug?.toLowerCase() === clean || 
        a.id.toLowerCase() === clean ||
        (a.aniListId && a.aniListId.toLowerCase() === clean)
      );
      if (inCache) return inCache;
    }

    let localAnime: Anime | null = null;
    try {
      const q = query(collection(db, 'anime'), where('slug', '==', slug), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        localAnime = normalizeAnime(querySnapshot.docs[0].data());
      }
    } catch {
      // ignore
    }

    const multiAnime = await getMultiServerAnimeBySlug(slug);

    if (localAnime && multiAnime) {
      const normalizedMulti = normalizeAnime(multiAnime);
      return normalizeAnime({
        ...localAnime,
        linkedSeasons: (normalizedMulti.linkedSeasons && normalizedMulti.linkedSeasons.length > 0) 
          ? normalizedMulti.linkedSeasons 
          : localAnime.linkedSeasons,
        seasons: (normalizedMulti.seasons && normalizedMulti.seasons.length > 1)
          ? normalizedMulti.seasons
          : localAnime.seasons,
        subEpisodesCount: normalizedMulti.subEpisodesCount || localAnime.subEpisodesCount,
        multiEpisodesCount: normalizedMulti.multiEpisodesCount || localAnime.multiEpisodesCount,
        dubEpisodesCount: normalizedMulti.dubEpisodesCount || localAnime.dubEpisodesCount,
        poster: localAnime.poster && !localAnime.poster.includes('unsplash') ? localAnime.poster : normalizedMulti.poster,
        backdrop: localAnime.backdrop || normalizedMulti.backdrop,
        synopsis: localAnime.synopsis && localAnime.synopsis !== 'No synopsis available.' ? localAnime.synopsis : normalizedMulti.synopsis,
        startDate: normalizedMulti.startDate || localAnime.startDate,
        endDate: normalizedMulti.endDate || localAnime.endDate,
        aired: normalizedMulti.aired || localAnime.aired,
        premiered: normalizedMulti.premiered || localAnime.premiered
      });
    }

    if (localAnime) return normalizeAnime(localAnime);
    if (multiAnime) return normalizeAnime(multiAnime);

    const mockMatch = mockAnimeList.find(a => a.slug === slug);
    return mockMatch ? normalizeAnime(mockMatch) : null;
  } catch (e) {
    const mockMatch = mockAnimeList.find(a => a.slug === slug);
    return mockMatch ? normalizeAnime(mockMatch) : null;
  }
}

export async function getEpisodesForAnime(animeId: string): Promise<Episode[]> {
  try {
    let localEps: Episode[] = [];
    try {
      const q = query(collection(db, 'episodes'), where('animeId', '==', animeId));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        localEps = querySnapshot.docs.map(doc => normalizeEpisode(doc.data()));
      }
    } catch {
      // ignore
    }

    const multiEpsRaw = await getMultiServerEpisodesForAnime(animeId);
    const multiEps = multiEpsRaw.map(e => normalizeEpisode(e));

    if (localEps.length === 0) {
      if (multiEps.length > 0) return multiEps;
      return mockEpisodes.filter(e => e.animeId === animeId).map(e => normalizeEpisode(e));
    }

    if (multiEps.length === 0) {
      return localEps;
    }

    // Merge episodes and server links
    const epByNum = new Map<number, Episode>();
    localEps.forEach(e => epByNum.set(e.episodeNumber, { ...e }));

    multiEps.forEach(me => {
      const existing = epByNum.get(me.episodeNumber);
      if (existing) {
        const serverSet = new Set((existing.servers || []).map(s => s.embedLink));
        const combined = [...(existing.servers || [])];
        (me.servers || []).forEach(ms => {
          if (!serverSet.has(ms.embedLink)) {
            serverSet.add(ms.embedLink);
            combined.push(normalizeServer(ms));
          }
        });
        existing.servers = combined;
      } else {
        epByNum.set(me.episodeNumber, me);
      }
    });

    return Array.from(epByNum.values()).sort((a, b) => a.episodeNumber - b.episodeNumber);
  } catch (e) {
    return mockEpisodes.filter(e => e.animeId === animeId).map(e => normalizeEpisode(e));
  }
}

export function getAnimeReleaseTimestamp(anime: Anime): number {
  const ts = getCanonicalReleaseTimestamp(anime);
  if (ts !== null && !isNaN(ts)) return ts;
  return 0;
}

export function getAnimeEndTimestamp(anime: Anime): number {
  const ts = getCanonicalEndTimestamp(anime);
  if (ts !== null && !isNaN(ts)) return ts;
  return getAnimeReleaseTimestamp(anime);
}

export async function getRecentlyAddedAnime(maxCount = 10, prefetchedAnime?: Anime[]): Promise<Anime[]> {
  try {
    const all = prefetchedAnime || await getAllAnime();
    const sorted = [...all];

    // Sort strictly by when it was added to the site (recentlyAddedAt or createdAt)
    sorted.sort((a, b) => {
      const timeA = a.recentlyAddedAt || a.createdAt || 0;
      const timeB = b.recentlyAddedAt || b.createdAt || 0;
      return timeB - timeA;
    });

    return typeof maxCount === 'number' && maxCount > 0 ? sorted.slice(0, maxCount) : sorted;
  } catch (e) {
    console.warn("Failed to fetch recently added", e);
    return [];
  }
}

export function getLatestReleasesAnime(allAnime: Anime[], maxCount = 10): Anime[] {
  const now = Date.now();
  // Old dates (> 1 year ago) are excluded
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  // Finished anime is excluded unless it ended recently (within last 120 days)
  const RECENT_FINISHED_MS = 120 * 24 * 60 * 60 * 1000;

  const validReleases: { anime: Anime; releaseTime: number }[] = [];

  for (const a of allAnime) {
    const releaseTime = getCanonicalReleaseTimestamp(a);
    // Exclude if no legitimate release date can be determined
    if (releaseTime === null || isNaN(releaseTime) || releaseTime === 0) continue;

    // Exclude anime with release dates older than 1 year
    if (now - releaseTime > ONE_YEAR_MS) {
      continue;
    }

    // Exclude future anime announced too far in advance (> 45 days ahead)
    if (releaseTime - now > 45 * 24 * 60 * 60 * 1000) {
      continue;
    }

    // Finished anime check: cannot be finished unless it ended recently
    const isFinished = (a.status || '').toLowerCase() === 'finished';
    if (isFinished) {
      const endTime = getCanonicalEndTimestamp(a) || releaseTime;
      const isRecentlyFinished = (now - endTime) <= RECENT_FINISHED_MS;
      if (!isRecentlyFinished) {
        continue;
      }
    }

    validReleases.push({ anime: a, releaseTime });
  }

  validReleases.sort((a, b) => b.releaseTime - a.releaseTime);
  const sorted = validReleases.map(v => v.anime);
  return typeof maxCount === 'number' && maxCount > 0 ? sorted.slice(0, maxCount) : sorted;
}

export function getLatestCompletedAnime(allAnime: Anime[], maxCount = 10): Anime[] {
  return [...allAnime]
    .filter(a => {
      const isFinished = (a.status || '').toLowerCase() === 'finished';
      const isTV = (a.format || 'TV').toUpperCase() === 'TV';
      return isFinished && isTV;
    })
    .sort((a, b) => getAnimeEndTimestamp(b) - getAnimeEndTimestamp(a))
    .slice(0, maxCount);
}

export function getLatestMovies(allAnime: Anime[], maxCount = 10): Anime[] {
  return [...allAnime]
    .filter(a => (a.format || '').toUpperCase() === 'MOVIE')
    .sort((a, b) => {
      const timeA = a.recentlyAddedAt || a.createdAt || getAnimeReleaseTimestamp(a);
      const timeB = b.recentlyAddedAt || b.createdAt || getAnimeReleaseTimestamp(b);
      return timeB - timeA;
    })
    .slice(0, maxCount);
}


export interface HistoryItem {
  animeId: string;
  slug: string;
  title: string;
  coverImage: string;
  backdrop: string;
  episodeNumber: number;
  seasonId?: string;
  updatedAt: number;
}

export async function getWatchHistory(userId: string): Promise<HistoryItem[]> {
  try {
    const q = query(
      collection(db, 'watchProgress'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    const progressList = snap.docs.map(d => d.data());
    progressList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    
    // Take top 4
    const top4 = progressList.slice(0, 4);
    
    const historyItems: HistoryItem[] = [];
    for (const prog of top4) {
      const animeSnap = await getDoc(doc(db, 'anime', prog.animeId));
      if (!animeSnap.exists()) continue;
      const animeData = animeSnap.data();
      
      let epNumber = 1;
      let seasonId = 's1';
      if (prog.lastWatchedEpisode) {
        const epSnap = await getDoc(doc(db, 'episodes', prog.lastWatchedEpisode));
        if (epSnap.exists()) {
          epNumber = epSnap.data().episodeNumber;
          seasonId = epSnap.data().seasonId || 's1';
        }
      }
      
      historyItems.push({
        animeId: prog.animeId,
        slug: animeData.slug,
        title: animeData.title,
        coverImage: animeData.poster,
        backdrop: animeData.backdrop,
        episodeNumber: epNumber,
        seasonId: seasonId,
        updatedAt: prog.updatedAt || 0
      });
    }
    return historyItems;
  } catch(e) {
    console.error("Failed to fetch watch history:", e);
    return [];
  }
}

export async function clearWatchHistory(userId?: string): Promise<boolean> {
  try {
    localStorage.removeItem('yoru_watch_history');
    if (userId) {
      const q = query(
        collection(db, 'watchProgress'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    }
    return true;
  } catch (e) {
    console.error("Failed to clear watch history:", e);
    return false;
  }
}

export async function removeWatchHistoryItem(animeId: string, userId?: string): Promise<boolean> {
  try {
    try {
      const history = JSON.parse(localStorage.getItem('yoru_watch_history') || '[]');
      const filtered = history.filter((h: any) => h.animeId !== animeId);
      localStorage.setItem('yoru_watch_history', JSON.stringify(filtered));
      localStorage.removeItem(`yoru_watched_${animeId}`);
    } catch (e) {
      console.warn("Failed to remove from local watch history:", e);
    }

    if (userId) {
      const q = query(
        collection(db, 'watchProgress'),
        where('userId', '==', userId),
        where('animeId', '==', animeId)
      );
      const snap = await getDocs(q);
      const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      try {
        await deleteDoc(doc(db, 'watchProgress', `${userId}_${animeId}`));
      } catch (err) {
        // Document might already be deleted by the query batch
      }
    }
    return true;
  } catch (e) {
    console.error("Failed to remove watch history item:", e);
    return false;
  }
}

export async function getSpotlightSlides(): Promise<SpotlightSlide[]> {
  try {
    const q = query(
      collection(db, 'spotlights'),
      where('active', '==', true)
    );
    const snap = await getDocs(q);
    if (snap.empty) return [];
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SpotlightSlide));
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    return list;
  } catch (e) {
    console.warn("Failed to fetch spotlight slides:", e);
    return [];
  }
}

export async function getAllSpotlightSlides(): Promise<SpotlightSlide[]> {
  try {
    const snap = await getDocs(collection(db, 'spotlights'));
    if (snap.empty) return [];
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SpotlightSlide));
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    return list;
  } catch (e) {
    console.error("Failed to fetch all spotlight slides:", e);
    return [];
  }
}

