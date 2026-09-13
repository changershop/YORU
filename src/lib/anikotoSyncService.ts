import { collection, doc, setDoc, query, where, getDocs, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Anime, Episode, ServerLink, AnikotoSyncSettings, AnikotoSyncStats } from '../types';
import axios from 'axios';

const SETTINGS_DOC_ID = 'anikoto_sync';
const LOCAL_STORAGE_KEY = 'yoru_anikoto_sync_settings';
const isNode = typeof window === 'undefined';
const ANIKOTO_BASE_URL = isNode ? 'https://anikotoapi.site' : '/api/anikoto/proxy';

export interface AnikotoRecentItem {
  id: number;
  title: string;
  alternative?: string;
  native?: string;
  slug?: string;
  poster?: string;
  background_image?: string;
  is_sub?: number;
  is_dub?: number;
  episodes?: string;
  description?: string;
  status?: string;
  score?: string;
  aired?: string;
  year?: number;
  season?: string;
  ani_id?: string;
  duration?: string;
  terms_by_type?: {
    genre?: string[];
    studios?: string[];
    type?: string[];
    [key: string]: any;
  };
  updated_at?: string;
}

export interface AnikotoEpisodeItem {
  id: number;
  title?: string;
  jp_title?: string;
  number: number;
  episode_embed_id?: string;
  embed_url?: {
    sub?: string;
    dub?: string;
    [key: string]: any;
  };
  updated_at?: string;
}

export interface AnikotoSeriesResponse {
  ok: boolean;
  data?: {
    anime?: AnikotoRecentItem;
    episodes?: AnikotoEpisodeItem[];
  };
  anime?: AnikotoRecentItem;
  episodes?: AnikotoEpisodeItem[];
}

export const DEFAULT_ANIKOTO_SETTINGS: AnikotoSyncSettings = {
  autoSyncEnabled: true,
  intervalMinutes: 60, // 24 times a day (every 60 minutes)
  lastSyncStatus: 'idle',
};

/**
 * Helper delay to be polite to API rate limits (60 req / 120 sec)
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalizes title for loose comparison
 */
function cleanTitleForMatch(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetches current Anikoto Sync settings from Firestore or localStorage fallback
 */
export async function getAnikotoSyncSettings(): Promise<AnikotoSyncSettings> {
  let localSettings: AnikotoSyncSettings | null = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) localSettings = JSON.parse(stored);
    } catch (e) {
      // Ignore JSON parse error
    }
  }

  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = { ...DEFAULT_ANIKOTO_SETTINGS, ...(snap.data() as AnikotoSyncSettings) };
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
      }
      return data;
    }
  } catch (err) {
    // Expected when not logged in or firestore permissions are restricted
  }

  return localSettings || DEFAULT_ANIKOTO_SETTINGS;
}

/**
 * Saves Anikoto Sync settings to Firestore and localStorage
 */
export async function saveAnikotoSyncSettings(
  settings: Partial<AnikotoSyncSettings>
): Promise<boolean> {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const current = localStorage.getItem(LOCAL_STORAGE_KEY);
      const parsed = current ? JSON.parse(current) : DEFAULT_ANIKOTO_SETTINGS;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ ...parsed, ...settings }));
    } catch (e) {
      // Ignore local storage error
    }
  }

  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    await setDoc(docRef, settings, { merge: true });
    return true;
  } catch (err) {
    // Graceful fallback to localStorage
    return false;
  }
}

/**
 * Core engine to check https://anikotoapi.site/recent-anime
 * - Fetches recent anime
 * - Checks if anime exists:
 *   - If not exists -> adds anime & episodes (with sub/dub servers)
 *   - If exists -> checks all episodes:
 *     - If new episode -> adds it
 *     - If existing episode -> checks sub/dub. If previously only sub and now dub added, updates with dub!
 *     - If already up to date -> skips it!
 */
export async function runAnikotoRecentSync(options?: {
  page?: number;
  perPage?: number;
  unlimited?: boolean;
  onLog?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  onProgress?: (current: number, total: number) => void;
}): Promise<{
  success: boolean;
  message: string;
  stats: AnikotoSyncStats;
}> {
  const isUnlimited = options?.unlimited !== undefined ? options.unlimited : (options?.perPage === 0 || !options?.perPage);
  const page = options?.page || 1;
  const perPage = isUnlimited ? 100 : (options?.perPage || 100);
  const log = options?.onLog || ((msg, type) => console.log(`[AnikotoSync ${type}] ${msg}`));
  const progress = options?.onProgress || (() => {});

  const startTime = Date.now();
  const stats: AnikotoSyncStats = {
    totalChecked: 0,
    newAnimeAdded: 0,
    episodesAdded: 0,
    episodesUpdated: 0,
    skippedCount: 0,
    durationMs: 0,
  };

  try {
    let recentData: AnikotoRecentItem[] = [];

    if (isUnlimited) {
      log(`Unlimited scan initiated. Fetching all available recent anime pages from ${ANIKOTO_BASE_URL}/recent-anime...`, 'info');
      let currPage = 1;
      let hasMore = true;

      while (hasMore && currPage <= 5) {
        try {
          const pageRes = await axios.get(`${ANIKOTO_BASE_URL}/recent-anime`, {
            params: { page: currPage, per_page: 100 },
            timeout: 15000,
            headers: {
              Accept: 'application/json',
              ...(isNode && { 'User-Agent': 'curl/7.88.1' })
            },
          });

          let pageItems: AnikotoRecentItem[] = [];
          if (Array.isArray(pageRes.data)) {
            pageItems = pageRes.data;
          } else if (Array.isArray(pageRes.data?.data)) {
            pageItems = pageRes.data.data;
          } else if (Array.isArray(pageRes.data?.anime)) {
            pageItems = pageRes.data.anime;
          }

          if (!pageItems || pageItems.length === 0) {
            hasMore = false;
          } else {
            recentData.push(...pageItems);
            log(`Fetched page ${currPage}: ${pageItems.length} items (Total: ${recentData.length})...`, 'info');
            if (pageItems.length < 100) {
              hasMore = false;
            } else {
              currPage++;
              await delay(200);
            }
          }
        } catch (pageErr: any) {
          log(`Finished pagination at page ${currPage}: ${pageErr.message}`, 'info');
          hasMore = false;
        }
      }
    } else {
      log(`Connecting to ${ANIKOTO_BASE_URL}/recent-anime (Page ${page}, limit ${perPage})...`, 'info');
      const recentRes = await axios.get(`${ANIKOTO_BASE_URL}/recent-anime`, {
        params: { page, per_page: perPage },
        timeout: 15000,
        headers: {
          Accept: 'application/json',
          ...(isNode && { 'User-Agent': 'curl/7.88.1' })
        },
      });

      if (Array.isArray(recentRes.data)) {
        recentData = recentRes.data;
      } else if (Array.isArray(recentRes.data?.data)) {
        recentData = recentRes.data.data;
      } else if (Array.isArray(recentRes.data?.anime)) {
        recentData = recentRes.data.anime;
      }
    }
    
    if (!recentData || recentData.length === 0) {
      log('No recent anime returned from Anikoto API.', 'warning');
      return {
        success: true,
        message: 'No recent anime found from API',
        stats,
      };
    }

    log(`Retrieved ${recentData.length} recent anime from Anikoto. Scanning database for matching titles...`, 'info');

    // 2. Fetch existing anime from Firestore to build fast in-memory indexes
    const animeCollection = collection(db, 'anime');
    const existingSnap = await getDocs(animeCollection);
    const existingAnimeList: Anime[] = existingSnap.docs.map((d) => d.data() as Anime);

    const mapById = new Map<string, Anime>();
    const mapBySlug = new Map<string, Anime>();
    const mapByTitle = new Map<string, Anime>();
    const mapByAniList = new Map<string, Anime>();

    for (const a of existingAnimeList) {
      if (a.id) mapById.set(a.id, a);
      if (a.slug) mapBySlug.set(a.slug.toLowerCase(), a);
      if (a.title) mapByTitle.set(cleanTitleForMatch(a.title), a);
      if (a.aniListId) mapByAniList.set(String(a.aniListId), a);
    }

    const totalToProcess = recentData.length;

    // 3. Process each recent anime
    for (let i = 0; i < totalToProcess; i++) {
      const item = recentData[i];
      stats.totalChecked++;
      progress(i + 1, totalToProcess);

      const itemCleanTitle = cleanTitleForMatch(item.title);
      const itemSlug = (item.slug || '').toLowerCase();
      const itemAniId = item.ani_id ? String(item.ani_id) : undefined;
      const directId = `anikoto_${item.id}`;

      // Check if anime already exists in Firestore
      let matchedAnime: Anime | undefined =
        mapById.get(directId) ||
        (itemSlug ? mapBySlug.get(itemSlug) : undefined) ||
        (itemAniId ? mapByAniList.get(itemAniId) : undefined) ||
        mapByTitle.get(itemCleanTitle);

      // Fetch series episode details from Anikoto
      await delay(160); // Respect rate limit politely
      let episodesFromApi: AnikotoEpisodeItem[] = [];
      try {
        const seriesRes = await axios.get<AnikotoSeriesResponse>(`${ANIKOTO_BASE_URL}/series/${item.id}`, {
          timeout: 15000,
          headers: { 
            Accept: 'application/json',
            ...(isNode && { 'User-Agent': 'curl/7.88.1' })
          },
        });
        episodesFromApi = seriesRes.data?.data?.episodes || seriesRes.data?.episodes || [];
      } catch (err: any) {
        log(`Warning: Failed to fetch episodes for "${item.title}" (ID ${item.id}): ${err.message}`, 'warning');
      }

      if (!matchedAnime) {
        // ==========================================
        // NEW ANIME: Add to Firestore
        // ==========================================
        let subCount = 0;
        let dubCount = 0;
        
        for (const ep of episodesFromApi) {
          if (ep.embed_url?.sub) subCount++;
          if (ep.embed_url?.dub) dubCount++;
        }

        if (subCount === 0 && dubCount === 0) {
          log(`Skipped new anime "${item.title}" (0 sub and dub episodes)`, 'warning');
          stats.skippedCount++;
          continue;
        }

        log(`[NEW] Adding new anime: "${item.title}"...`, 'info');

        const newAnimeId = directId;
        const finalSlug = item.slug || item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Create episode documents
        for (const ep of episodesFromApi) {
          const servers: ServerLink[] = [];
          if (item.ani_id) {
            servers.push({
              serverName: 'YUME',
              serverType: 'multi',
              embedLink: `https://yumestream.pages.dev/${item.ani_id}/${ep.number}`
            });
          }
          if (ep.embed_url?.sub) {
            servers.push({
              serverName: 'VidStream-2',
              embedLink: ep.embed_url.sub,
              serverType: 'sub',
            });
            subCount++;
          }
          if (ep.embed_url?.dub) {
            servers.push({
              serverName: 'VidStream-2',
              embedLink: ep.embed_url.dub,
              serverType: 'dub',
            });
            dubCount++;
          }

          const epDocId = `${newAnimeId}_e${ep.number}`;
          const episodeData: Episode = {
            id: epDocId,
            animeId: newAnimeId,
            seasonId: 's1',
            episodeNumber: ep.number,
            title: ep.title || `Episode ${ep.number}`,
            isFiller: false,
            servers,
            thumbnailUrl: item.background_image || item.poster || '',
            createdAt: Date.now(),
            published: true,
          };

          await setDoc(doc(db, 'episodes', epDocId), episodeData);
        }

        const newAnime: Anime = {
          id: newAnimeId,
          title: item.title,
          nativeTitle: item.native || item.alternative || item.title,
          slug: finalSlug,
          aniListId: item.ani_id ? String(item.ani_id) : undefined,
          format: item.terms_by_type?.type?.[0] || 'TV',
          totalEpisodes: parseInt(item.episodes || '0') || episodesFromApi.length || (item.is_sub || 12),
          episodeDuration: item.duration || '24 mins',
          status: item.status === 'Finished Airing' ? 'Finished' : 'Releasing',
          startDate: item.aired || `${item.year || new Date().getFullYear()}`,
          endDate: '',
          season: item.season ? `${item.season.charAt(0).toUpperCase() + item.season.slice(1)} ${item.year || ''}`.trim() : '2026',
          averageScore: item.score ? `${Math.round(parseFloat(item.score) * 10)}%` : '84%',
          studios: item.terms_by_type?.studios?.join(', ') || 'Unknown Studio',
          genres: item.terms_by_type?.genre?.length ? item.terms_by_type.genre : ['Anime', 'Action'],
          isAdult: Boolean(
            item.terms_by_type?.genre?.some((g: string) => ['Hentai', 'Adult', '18+', 'Ecchi'].includes(g)) ||
            /\b18\+\b/i.test(item.title)
          ) || undefined,
          poster: item.poster || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&q=80&w=600',
          backdrop: item.background_image || item.poster || '',
          synopsis: item.description || `Watch ${item.title} online with English Sub and Dub on YORU.`,
          seasons: [{ id: 's1', name: 'Season 1', order: 1 }],
          subEpisodesCount: subCount,
          dubEpisodesCount: dubCount,
          recentlyAddedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          published: true,
        };

        Object.keys(newAnime).forEach(key => {
          if (newAnime[key as keyof Anime] === undefined) {
            delete newAnime[key as keyof Anime];
          }
        });

        await setDoc(doc(db, 'anime', newAnimeId), newAnime);

        // Update local maps so duplicates in the same batch are handled properly
        mapById.set(newAnime.id, newAnime);
        mapBySlug.set(newAnime.slug.toLowerCase(), newAnime);
        mapByTitle.set(itemCleanTitle, newAnime);

        stats.newAnimeAdded++;
        stats.episodesAdded += episodesFromApi.length;
        log(`✓ Added "${item.title}" with ${episodesFromApi.length} eps (Sub: ${subCount}, Dub: ${dubCount})`, 'success');
      } else {
        // ==========================================
        // EXISTING ANIME: Check sub/dub & new episodes
        // ==========================================
        // Fetch existing episodes from Firestore
        const epQuery = query(collection(db, 'episodes'), where('animeId', '==', matchedAnime.id));
        const epSnap = await getDocs(epQuery);
        const existingEpisodes: Episode[] = epSnap.docs.map((d) => d.data() as Episode);
        const existingEpMap = new Map<number, Episode>();
        for (const ep of existingEpisodes) {
          existingEpMap.set(ep.episodeNumber, ep);
        }

        let animeNewEpsCount = 0;
        let animeUpdatedEpsCount = 0;
        let newlyAddedDub = 0;
        let newlyAddedSub = 0;

        for (const ep of episodesFromApi) {
          const existingEp = existingEpMap.get(ep.number);

          if (!existingEp) {
            // New episode that didn't exist before!
            const servers: ServerLink[] = [];
            const animeIdTarget = matchedAnime.aniListId || matchedAnime.malId;
            if (animeIdTarget) {
              servers.push({
                serverName: 'YUME',
                serverType: 'multi',
                embedLink: `https://yumestream.pages.dev/${animeIdTarget}/${ep.number}`
              });
            }
            if (ep.embed_url?.sub) {
              servers.push({
                serverName: 'VidStream-2',
                embedLink: ep.embed_url.sub,
                serverType: 'sub',
              });
            }
            if (ep.embed_url?.dub) {
              servers.push({
                serverName: 'VidStream-2',
                embedLink: ep.embed_url.dub,
                serverType: 'dub',
              });
            }

            const epDocId = `${matchedAnime.id}_e${ep.number}`;
            const episodeData: Episode = {
              id: epDocId,
              animeId: matchedAnime.id,
              seasonId: 's1',
              episodeNumber: ep.number,
              title: ep.title || `Episode ${ep.number}`,
              isFiller: false,
              servers,
              thumbnailUrl: matchedAnime.backdrop || matchedAnime.poster || '',
              createdAt: Date.now(),
              published: true,
            };

            await setDoc(doc(db, 'episodes', epDocId), episodeData);
            existingEpMap.set(ep.number, episodeData);
            animeNewEpsCount++;
            stats.episodesAdded++;
          } else {
            // Episode exists: Check if new sub or dub is now available!
            // "hote pare klk oitar shudhu sub chilo ajk dub add hoise.. tai check korbe... jta nai oita add korbe"
            let serversModified = false;
            const currentServers = [...(existingEp.servers || [])];

            // Normalize any legacy Megaplay server names to VidStream-2
            for (const s of currentServers) {
              if (s.serverName === 'Megaplay Sub' || s.serverName === 'Megaplay Dub' || /megaplay/i.test(s.serverName || '')) {
                s.serverName = 'VidStream-2';
                serversModified = true;
              }
            }

            // 1. Check Sub
            if (ep.embed_url?.sub) {
              const hasSub = currentServers.some(
                (s) => s.serverType === 'sub' || s.embedLink === ep.embed_url?.sub
              );
              if (!hasSub) {
                currentServers.push({
                  serverName: 'VidStream-2',
                  embedLink: ep.embed_url.sub,
                  serverType: 'sub',
                });
                serversModified = true;
                newlyAddedSub++;
              }
            }

            // 2. Check Dub
            if (ep.embed_url?.dub) {
              const hasDub = currentServers.some(
                (s) => s.serverType === 'dub' || s.embedLink === ep.embed_url?.dub
              );
              if (!hasDub) {
                currentServers.push({
                  serverName: 'VidStream-2',
                  embedLink: ep.embed_url.dub,
                  serverType: 'dub',
                });
                serversModified = true;
                newlyAddedDub++;
              }
            }

            // If servers changed (e.g. dub was added today), update the episode document
            if (serversModified) {
              await updateDoc(doc(db, 'episodes', existingEp.id), {
                servers: currentServers,
              });
              existingEp.servers = currentServers;
              animeUpdatedEpsCount++;
              stats.episodesUpdated++;
            }
          }
        }

        // Did we add new episodes or update existing episodes with sub/dub?
        if (animeNewEpsCount > 0 || animeUpdatedEpsCount > 0) {
          // Recalculate total sub & dub counts
          let totalSub = 0;
          let totalDub = 0;
          for (const ep of existingEpMap.values()) {
            if (ep.servers?.some((s) => s.serverType === 'sub' || !s.serverType)) totalSub++;
            if (ep.servers?.some((s) => s.serverType === 'dub')) totalDub++;
          }

          // Update anime document and mark recentlyAddedAt to push it to the top!
          const animeUpdatePayload: Partial<Anime> = {
            subEpisodesCount: totalSub,
            dubEpisodesCount: totalDub,
            totalEpisodes: Math.max(matchedAnime.totalEpisodes || 0, existingEpMap.size),
            updatedAt: Date.now(),
            recentlyAddedAt: Date.now(),
          };

          await updateDoc(doc(db, 'anime', matchedAnime.id), animeUpdatePayload);

          log(
            `⚡ Updated "${matchedAnime.title}": ${animeNewEpsCount} new eps added, ${animeUpdatedEpsCount} eps updated (${newlyAddedDub} new Dub, ${newlyAddedSub} new Sub).`,
            'success'
          );
        } else {
          // Already completely up to date!
          stats.skippedCount++;
          log(`Skipped "${matchedAnime.title}": Already has all ${episodesFromApi.length} episodes with current sub/dub.`, 'info');
        }
      }
    }

    stats.durationMs = Date.now() - startTime;
    const finalMessage = `Sync complete! Scanned: ${stats.totalChecked}, New Anime: ${stats.newAnimeAdded}, Eps Added: ${stats.episodesAdded}, Eps Updated with Sub/Dub: ${stats.episodesUpdated}, Skipped: ${stats.skippedCount} in ${(stats.durationMs / 1000).toFixed(1)}s`;

    log(finalMessage, 'success');

    // Save sync settings status
    await saveAnikotoSyncSettings({
      lastSyncTimestamp: Date.now(),
      lastSyncStatus: 'success',
      lastSyncMessage: finalMessage,
      lastSyncStats: stats,
    });

    return {
      success: true,
      message: finalMessage,
      stats,
    };
  } catch (err: any) {
    const errorMsg = err.message || 'An error occurred during Anikoto sync';
    log(`Sync Error: ${errorMsg}`, 'error');
    stats.durationMs = Date.now() - startTime;

    await saveAnikotoSyncSettings({
      lastSyncTimestamp: Date.now(),
      lastSyncStatus: 'error',
      lastSyncMessage: errorMsg,
      lastSyncStats: stats,
    });

    return {
      success: false,
      message: errorMsg,
      stats,
    };
  }
}

/**
 * Cleanup Utility: Finds and removes Anime documents that have 0 Sub and 0 Dub episodes.
 */
export async function cleanupEmptyAnime(
  onLog: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void
): Promise<{ success: boolean; removedCount: number }> {
  try {
    onLog('Starting cleanup: scanning for anime with 0 episodes...', 'info');
    const animeCollection = collection(db, 'anime');
    const snap = await getDocs(animeCollection);
    
    let removedCount = 0;
    for (const d of snap.docs) {
      const anime = d.data() as Anime;
      const subCount = anime.subEpisodesCount || 0;
      const dubCount = anime.dubEpisodesCount || 0;
      const totalCount = anime.totalEpisodes || 0;
      
      // Target anikoto imported empty ones (also any others with zero counts)
      if (subCount === 0 && dubCount === 0 && (totalCount === 0 || anime.id.startsWith('anikoto_'))) {
        try {
          await deleteDoc(doc(db, 'anime', anime.id));
          removedCount++;
          onLog(`Removed empty anime: "${anime.title}"`, 'warning');
        } catch (delErr: any) {
          onLog(`Failed to remove "${anime.title}": ${delErr.message}`, 'error');
        }
      }
    }
    
    onLog(`Cleanup complete. Removed ${removedCount} empty anime.`, 'success');
    return { success: true, removedCount };
  } catch (err: any) {
    onLog(`Cleanup error: ${err.message}`, 'error');
    return { success: false, removedCount: 0 };
  }
}

