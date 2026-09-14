import { collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { Anime, Episode, ServerLink, YumeRecentItem, YumeSyncResponse, YumeSyncSettings, YumeSyncStats } from '../types';
import axios from 'axios';

const SETTINGS_DOC_ID = 'yume_sync';
const LEGACY_SETTINGS_DOC_ID = 'multiserver_sync';
const LOCAL_STORAGE_SETTINGS_KEY = 'yoru_yume_sync_settings';
const LOCAL_STORAGE_CURSOR_KEY = 'yume_last_sync_cursor';

export const DEFAULT_YUME_SETTINGS: YumeSyncSettings = {
  autoSyncEnabled: false,
  intervalMinutes: 60,
  lastSyncTimestamp: 0,
  lastSyncStatus: 'idle',
  lastSyncMessage: 'Ready to sync with authoritative YUME API',
  yume_last_sync_cursor: 0
};

const isNode = typeof window === 'undefined';
export const YUME_REMOTE_BASE_URL = 'https://yumestream.pages.dev';

/**
 * Resolves appropriate base API URL depending on client/server environment
 */
export function getYumeApiBaseUrl(): string {
  if (isNode) {
    return process.env.YUME_API_URL || YUME_REMOTE_BASE_URL;
  }
  // In browser, use proxy route to prevent any CORS/preflight issues
  return '/api/yume/proxy';
}

/**
 * Normalizes title for loose fuzzy comparison
 */
export function cleanTitleForMatch(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks heartbeat / sync status of YUME API
 * Endpoint: GET <YUME_API_URL>/api/v1/sync/status
 */
export async function checkYumeSyncStatus(): Promise<{ alive: boolean; data?: any; error?: string }> {
  const baseUrl = getYumeApiBaseUrl();
  const directUrl = `${baseUrl}/v1/sync/status`;

  try {
    const res = await axios.get(directUrl, { timeout: 8000 });
    return { alive: res.status >= 200 && res.status < 300, data: res.data };
  } catch (err: any) {
    // Try fallback without /v1/ if needed
    try {
      const fallbackUrl = `${baseUrl}/sync/status`;
      const fallbackRes = await axios.get(fallbackUrl, { timeout: 6000 });
      return { alive: fallbackRes.status >= 200 && fallbackRes.status < 300, data: fallbackRes.data };
    } catch {
      return { alive: false, error: err.message };
    }
  }
}

/**
 * Reads persistent Yume sync settings (including yume_last_sync_cursor) from Firestore & localStorage
 */
export async function getYumeSyncSettings(): Promise<YumeSyncSettings> {
  let localSettings: Partial<YumeSyncSettings> = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      if (stored) localSettings = JSON.parse(stored);
      const cursorVal = localStorage.getItem(LOCAL_STORAGE_CURSOR_KEY);
      if (cursorVal) {
        localSettings.yume_last_sync_cursor = Number(cursorVal) || 0;
      }
    } catch {
      // Ignore localStorage parse error
    }
  }

  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = { ...DEFAULT_YUME_SETTINGS, ...localSettings, ...(snap.data() as Partial<YumeSyncSettings>) };
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(data));
        localStorage.setItem(LOCAL_STORAGE_CURSOR_KEY, String(data.yume_last_sync_cursor || 0));
      }
      return data;
    }

    // Check legacy multiserver doc if yume_sync not created yet
    const legacyDocRef = doc(db, 'settings', LEGACY_SETTINGS_DOC_ID);
    const legacySnap = await getDoc(legacyDocRef);
    if (legacySnap.exists()) {
      const legacyData = legacySnap.data() as any;
      const merged: YumeSyncSettings = {
        ...DEFAULT_YUME_SETTINGS,
        autoSyncEnabled: Boolean(legacyData.autoSyncEnabled),
        intervalMinutes: Number(legacyData.intervalMinutes) || 60,
        lastSyncTimestamp: Number(legacyData.lastSyncTimestamp) || 0,
        lastSyncStatus: legacyData.lastSyncStatus || 'idle',
        lastSyncMessage: legacyData.lastSyncMessage || 'Ready to sync',
        yume_last_sync_cursor: Number(legacyData.yume_last_sync_cursor) || 0
      };
      return merged;
    }
  } catch (err) {
    // Offline or restricted
  }

  return { ...DEFAULT_YUME_SETTINGS, ...localSettings };
}

/**
 * Saves Yume sync settings & updates persistence
 */
export async function saveYumeSyncSettings(
  settings: Partial<YumeSyncSettings>
): Promise<boolean> {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const current = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      const parsed = current ? JSON.parse(current) : DEFAULT_YUME_SETTINGS;
      const next = { ...parsed, ...settings };
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(next));
      if (settings.yume_last_sync_cursor !== undefined) {
        localStorage.setItem(LOCAL_STORAGE_CURSOR_KEY, String(settings.yume_last_sync_cursor));
      }
    } catch {
      // Ignore local storage error
    }
  }

  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    await setDoc(docRef, settings, { merge: true });

    // Also mirror to legacy settings doc for backward compatibility
    try {
      const legacyRef = doc(db, 'settings', LEGACY_SETTINGS_DOC_ID);
      await setDoc(legacyRef, settings, { merge: true });
    } catch {
      // Non-critical
    }

    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Returns current yume_last_sync_cursor (Unix timestamp in seconds)
 */
export async function getYumeSyncCursor(): Promise<number> {
  const settings = await getYumeSyncSettings();
  return settings.yume_last_sync_cursor || 0;
}

/**
 * Updates yume_last_sync_cursor directly
 */
export async function setYumeSyncCursor(cursor: number): Promise<boolean> {
  return saveYumeSyncSettings({ yume_last_sync_cursor: cursor });
}

/**
 * Resets yume_last_sync_cursor back to 0 for a complete re-scan
 */
export async function resetYumeSyncCursor(): Promise<boolean> {
  return setYumeSyncCursor(0);
}

/**
 * Fetches recent updates from YUME API with incremental cursor support
 * Endpoint: GET <YUME_API_URL>/api/recent?since={yume_last_sync_cursor}
 * (Fallback: /api/v1/recent?since={...})
 */
export async function fetchYumeRecentUpdates(sinceCursor?: number): Promise<YumeSyncResponse> {
  const baseUrl = getYumeApiBaseUrl();
  const queryParams = (sinceCursor !== undefined && sinceCursor > 0) ? `?since=${sinceCursor}` : '';

  let responseData: any = null;

  // Primary endpoint: /api/recent?since=...
  try {
    const res = await axios.get(`${baseUrl}/recent${queryParams}`, { timeout: 15000 });
    responseData = res.data;
  } catch (primaryErr) {
    // Fallback endpoint: /api/v1/recent?since=...
    try {
      const fallbackRes = await axios.get(`${baseUrl}/v1/recent${queryParams}`, { timeout: 15000 });
      responseData = fallbackRes.data;
    } catch (fallbackErr) {
      // Direct external fallback if in browser and proxy had issue
      if (!isNode) {
        const directRes = await axios.get(`${YUME_REMOTE_BASE_URL}/api/recent${queryParams}`, { timeout: 15000 });
        responseData = directRes.data;
      } else {
        throw primaryErr;
      }
    }
  }

  // Normalize API response schema
  const items: YumeRecentItem[] = Array.isArray(responseData?.recent)
    ? responseData.recent
    : Array.isArray(responseData?.items)
    ? responseData.items
    : Array.isArray(responseData?.data)
    ? responseData.data
    : Array.isArray(responseData)
    ? responseData
    : [];

  const syncCursor = typeof responseData?.sync_cursor === 'number'
    ? responseData.sync_cursor
    : typeof responseData?.cursor === 'number'
    ? responseData.cursor
    : undefined;

  const skipped = typeof responseData?.skipped === 'number'
    ? responseData.skipped
    : (typeof responseData?.skipped_count === 'number' ? responseData.skipped_count : 0);

  return {
    sync_cursor: syncCursor,
    recent: items,
    items,
    skipped,
    total: typeof responseData?.total === 'number' ? responseData.total : items.length,
    count: items.length,
    timestamp: responseData?.timestamp || Math.floor(Date.now() / 1000)
  };
}

/**
 * Fetches complete grouped catalog from YUME API
 * Endpoint: GET <YUME_API_URL>/api/set (or /api/v1/set)
 */
export async function fetchYumeCatalog(): Promise<any> {
  const baseUrl = getYumeApiBaseUrl();
  try {
    const res = await axios.get(`${baseUrl}/set`, { timeout: 20000 });
    return res.data;
  } catch {
    const fallbackRes = await axios.get(`${baseUrl}/v1/set`, { timeout: 20000 });
    return fallbackRes.data;
  }
}

/**
 * Fetches single anime lookup from YUME API
 * Endpoint: GET <YUME_API_URL>/api/v1/anime/:id
 */
export async function fetchYumeAnimeById(id: string | number): Promise<any> {
  const baseUrl = getYumeApiBaseUrl();
  try {
    const res = await axios.get(`${baseUrl}/v1/anime/${id}`, { timeout: 10000 });
    return res.data;
  } catch {
    const fallbackRes = await axios.get(`${baseUrl}/anime/${id}`, { timeout: 10000 });
    return fallbackRes.data;
  }
}

/**
 * Builds authoritative YUME embed URL
 * Format: https://yumestream.pages.dev/{anilist or mal id}/{episodeNumber}
 */
export function buildYumeEmbedUrl(anilistOrMalId: number | string, episodeNumber: number | string): string {
  const cleanId = String(anilistOrMalId).trim();
  const cleanEp = Number(episodeNumber) || 1;
  return `https://yumestream.pages.dev/${cleanId}/${cleanEp}`;
}

/**
 * Merges servers with YUME as the HIGHEST PRIORITY and authoritative source of truth.
 * - YUME server is placed first (index 0).
 * - Existing YUME / MultiServer entries are updated to authoritative URL.
 * - Other servers (e.g. VidStream, HD-1) are preserved after YUME.
 */
export function mergeAuthoritativeYumeServer(
  existingServers: ServerLink[] = [],
  embedUrl: string
): ServerLink[] {
  const cleanUrl = embedUrl.trim();

  // Filter out any older multi or yume server entry to prevent duplicates
  const otherServers = existingServers.filter(s => {
    const name = (s.serverName || '').toLowerCase().trim();
    const link = (s.embedLink || '').toLowerCase().trim();
    const isYumeOrMulti =
      s.serverType === 'multi' ||
      name === 'yume' ||
      name === 'multi' ||
      name === 'multiserver' ||
      link.includes('yumestream.pages.dev') ||
      link.includes('multiserver.pages.dev');
    return !isYumeOrMulti;
  });

  const authoritativeServer: ServerLink = {
    serverName: 'YUME',
    serverType: 'multi',
    embedLink: cleanUrl
  };

  // YUME sits at index 0 (Authoritative Highest Priority)
  return [authoritativeServer, ...otherServers];
}

export interface YumeSyncOptions {
  since?: number;
  forceFull?: boolean;
  onLog?: (message: string, type: 'info' | 'success' | 'warning' | 'error' | 'skip') => void;
  onProgress?: (current: number, total: number, itemName?: string) => void;
  stopSignalRef?: { current: boolean };
}

/**
 * Main Authoritative Incremental Synchronization Engine
 * Following strict specifications:
 * 1. Checks heartbeat / status
 * 2. Reads yume_last_sync_cursor (Unix timestamp in seconds)
 * 3. Sends GET /api/recent?since={yume_last_sync_cursor}
 * 4. Matches anime by anilist_id (primary) > mal_id (secondary) > title
 * 5. Updates episode title & prioritizes YUME embed URL as authoritative source
 * 6. Updates yume_last_sync_cursor with sync_cursor value from API response root
 */
export async function runYumeIncrementalSync(options: YumeSyncOptions = {}): Promise<{
  success: boolean;
  message: string;
  stats: YumeSyncStats;
  newCursor: number;
}> {
  const startTime = Date.now();
  const log = (msg: string, type: 'info' | 'success' | 'warning' | 'error' | 'skip' = 'info') => {
    if (options.onLog) options.onLog(msg, type);
    console.log(`[YUME Sync ${type.toUpperCase()}] ${msg}`);
  };

  const stats: YumeSyncStats = {
    totalChecked: 0,
    newAnimeAdded: 0,
    existingAnimeUpdated: 0,
    episodesAdded: 0,
    episodesUpdated: 0,
    episodesSkipped: 0,
    durationMs: 0,
    skippedByCursor: 0
  };

  try {
    // 1. Load sync settings & cursor
    const settings = await getYumeSyncSettings();
    const effectiveCursor = options.forceFull
      ? 0
      : (options.since !== undefined ? options.since : (settings.yume_last_sync_cursor || 0));

    log(`Authoritative YUME Sync initializing... (Cursor: ${effectiveCursor > 0 ? `${effectiveCursor} [${new Date(effectiveCursor * 1000).toISOString()}]` : '0 (Full Sync)'})`, 'info');
    await saveYumeSyncSettings({
      lastSyncStatus: 'running',
      lastSyncMessage: `Syncing with cursor ${effectiveCursor}...`
    });

    // 2. Fetch incremental recent items from YUME API
    log(`Calling GET /api/recent?since=${effectiveCursor}...`, 'info');
    const response = await fetchYumeRecentUpdates(effectiveCursor);
    const recentItems = response.recent || [];
    stats.skippedByCursor = response.skipped || 0;

    log(`YUME API returned ${recentItems.length} updated anime entries (${response.skipped || 0} unchanged records automatically skipped by server cursor).`, 'info');

    if (recentItems.length === 0) {
      const nextCursor = response.sync_cursor || effectiveCursor || Math.floor(Date.now() / 1000);
      stats.durationMs = Date.now() - startTime;
      await saveYumeSyncSettings({
        lastSyncStatus: 'success',
        lastSyncMessage: `Zero redundancy: 0 updates, ${response.skipped || 0} skipped records.`,
        lastSyncTimestamp: Date.now(),
        yume_last_sync_cursor: nextCursor,
        lastSyncStats: stats
      });
      log(`Zero updates required. Cursor updated to ${nextCursor}.`, 'success');
      return { success: true, message: 'Up to date. No new records found.', stats, newCursor: nextCursor };
    }

    // 3. Load local Firestore anime for authoritative matching
    log('Indexing local Firestore anime library for matching...', 'info');
    const animeSnap = await getDocs(collection(db, 'anime'));
    const localAnimeList: Anime[] = animeSnap.docs.map(d => ({ ...(d.data() as Anime), id: d.id }));

    const mapByAniList = new Map<string, Anime>();
    const mapByMal = new Map<string, Anime>();
    const mapBySlug = new Map<string, Anime>();
    const mapByTitle = new Map<string, Anime>();
    const mapById = new Map<string, Anime>();

    localAnimeList.forEach(a => {
      if (a.id) mapById.set(a.id, a);
      if (a.aniListId) mapByAniList.set(String(a.aniListId), a);
      if (a.malId) mapByMal.set(String(a.malId), a);
      if (a.slug) mapBySlug.set(a.slug.toLowerCase(), a);
      if (a.title) mapByTitle.set(cleanTitleForMatch(a.title), a);
    });

    // Process each recent item
    let itemIndex = 0;
    for (const item of recentItems) {
      if (options.stopSignalRef?.current) {
        log('Sync stopped by user signal.', 'warning');
        break;
      }

      itemIndex++;
      stats.totalChecked++;
      options.onProgress?.(itemIndex, recentItems.length, item.title);

      const aniIdStr = item.anilist_id !== null && item.anilist_id !== undefined ? String(item.anilist_id) : '';
      const malIdStr = item.mal_id !== null && item.mal_id !== undefined ? String(item.mal_id) : '';
      const itemTitleClean = cleanTitleForMatch(item.title);

      // Match Priority:
      // 1. anilist_id (primary)
      // 2. mal_id (secondary)
      // 3. title fuzzy match
      let matchedAnime = (aniIdStr && mapByAniList.get(aniIdStr)) ||
                         (malIdStr && mapByMal.get(malIdStr)) ||
                         (itemTitleClean && mapByTitle.get(itemTitleClean)) ||
                         mapById.get(item.anime_id) ||
                         mapById.get(`ms_${aniIdStr || item.anime_id}`) ||
                         null;

      // If Anime does not exist, create it with authoritative YUME data
      if (!matchedAnime) {
        const newAnimeId = `yume_${aniIdStr || malIdStr || item.anime_id}`;
        const generatedSlug = (item.title || newAnimeId)
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();

        const newAnime: Anime = {
          id: newAnimeId,
          title: item.title,
          nativeTitle: item.title,
          slug: generatedSlug,
          aniListId: aniIdStr || undefined,
          malId: malIdStr || undefined,
          format: item.format || 'TV',
          status: item.status || 'Releasing',
          totalEpisodes: item.total_episodes_available || item.latest_episode_number || 12,
          episodeDuration: '24 mins',
          startDate: '',
          endDate: '',
          season: item.season || '1',
          averageScore: '85%',
          studios: 'YUME Media',
          genres: ['Anime', 'Action'],
          poster: item.cover_image || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&q=80&w=600',
          backdrop: item.banner_image || item.cover_image || '',
          synopsis: `Watch ${item.title} online with authoritative Hindi Dub and Multi-Server streaming on YORU.`,
          seasons: [{ id: 's1', name: `Season ${item.season || '1'}`, order: 1 }],
          published: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          recentlyAddedAt: Date.now()
        };

        await setDoc(doc(db, 'anime', newAnimeId), newAnime);
        matchedAnime = newAnime;

        mapById.set(newAnime.id, newAnime);
        if (aniIdStr) mapByAniList.set(aniIdStr, newAnime);
        if (malIdStr) mapByMal.set(malIdStr, newAnime);
        if (itemTitleClean) mapByTitle.set(itemTitleClean, newAnime);

        stats.newAnimeAdded++;
        log(`✓ Created new anime entry: "${item.title}" (AniList: ${aniIdStr || 'N/A'}, MAL: ${malIdStr || 'N/A'})`, 'success');
      } else {
        // Update existing anime metadata if missing
        let animeNeedsUpdate = false;
        const animeUpdate: Partial<Anime> = {};

        if (!matchedAnime.aniListId && aniIdStr) {
          animeUpdate.aniListId = aniIdStr;
          animeNeedsUpdate = true;
        }
        if (!matchedAnime.malId && malIdStr) {
          animeUpdate.malId = malIdStr;
          animeNeedsUpdate = true;
        }
        if ((!matchedAnime.poster || matchedAnime.poster.includes('unsplash')) && item.cover_image) {
          animeUpdate.poster = item.cover_image;
          animeNeedsUpdate = true;
        }
        if (!matchedAnime.backdrop && item.banner_image) {
          animeUpdate.backdrop = item.banner_image;
          animeNeedsUpdate = true;
        }

        if (animeNeedsUpdate) {
          animeUpdate.updatedAt = Date.now();
          await updateDoc(doc(db, 'anime', matchedAnime.id), animeUpdate);
          stats.existingAnimeUpdated++;
        }
      }

      // 4. Authoritative Episode Processing
      // Extract target episodes from YUME recent item
      const latestEpNum = item.latest_episode_number || 1;
      const latestEpTitle = item.latest_episode_name || item.latest_episode_title || `Episode ${latestEpNum}`;
      const primaryEmbedUrl = item.embed_url || item.embed_mal_url || buildYumeEmbedUrl(aniIdStr || malIdStr || item.anime_id, latestEpNum);

      // Fetch existing local episodes for this matched anime
      const epSnap = await getDocs(query(collection(db, 'episodes'), where('animeId', '==', matchedAnime.id)));
      const existingEpMap = new Map<number, { docId: string; episode: Episode }>();
      epSnap.docs.forEach(d => {
        const ep = d.data() as Episode;
        existingEpMap.set(ep.episodeNumber, { docId: d.id, episode: { ...ep, id: d.id } });
      });

      // Episode target list: Include latest_episode_number plus any in available_episodes
      const episodesToSync = new Set<number>();
      if (latestEpNum) episodesToSync.add(latestEpNum);
      if (Array.isArray(item.available_episodes)) {
        item.available_episodes.forEach(num => {
          if (typeof num === 'number' && num > 0) episodesToSync.add(num);
        });
      }

      for (const epNum of Array.from(episodesToSync)) {
        const isLatest = epNum === latestEpNum;
        const currentEpTitle = isLatest ? latestEpTitle : `Episode ${epNum}`;
        const currentEmbedUrl = isLatest
          ? primaryEmbedUrl
          : buildYumeEmbedUrl(aniIdStr || malIdStr || item.anime_id, epNum);

        const existingRecord = existingEpMap.get(epNum);

        if (!existingRecord) {
          // INSERT NEW EPISODE
          const epDocId = `${matchedAnime.id}_e${epNum}`;
          const newEp: Episode = {
            id: epDocId,
            animeId: matchedAnime.id,
            seasonId: 's1',
            episodeNumber: epNum,
            title: currentEpTitle,
            isFiller: false,
            servers: [
              {
                serverName: 'YUME',
                serverType: 'multi',
                embedLink: currentEmbedUrl
              }
            ],
            thumbnailUrl: item.cover_image || matchedAnime.poster || '',
            createdAt: Date.now(),
            published: true
          };

          await setDoc(doc(db, 'episodes', epDocId), newEp);
          existingEpMap.set(epNum, { docId: epDocId, episode: newEp });
          stats.episodesAdded++;
          log(`+ Inserted Episode ${epNum} for "${matchedAnime.title}" [YUME Authoritative]`, 'success');
        } else {
          // UPDATE EXISTING EPISODE (AUTHORITATIVE PRIORITY)
          const { docId, episode } = existingRecord;
          const updatedServers = mergeAuthoritativeYumeServer(episode.servers || [], currentEmbedUrl);

          const epUpdate: Partial<Episode> = {
            servers: updatedServers
          };

          // Overwrite title with YUME's authoritative title if latest or if generic
          if (isLatest && latestEpTitle && latestEpTitle !== `Episode ${epNum}`) {
            epUpdate.title = latestEpTitle;
          }

          // Update thumbnail if missing
          if (!episode.thumbnailUrl && item.cover_image) {
            epUpdate.thumbnailUrl = item.cover_image;
          }

          await updateDoc(doc(db, 'episodes', docId), epUpdate);
          stats.episodesUpdated++;
          log(`✓ Updated Episode ${epNum} for "${matchedAnime.title}" with authoritative YUME stream`, 'info');
        }
      }

      // Recalculate authoritative episode counts and cache on the Anime document
      try {
        const allEpSnapPost = await getDocs(query(collection(db, 'episodes'), where('animeId', '==', matchedAnime.id)));
        const subEps = new Set<number>();
        const dubEps = new Set<number>();
        const multiEps = new Set<number>();

        allEpSnapPost.docs.forEach(d => {
          const epData = d.data() as Episode;
          const num = epData.episodeNumber || 1;
          if (Array.isArray(epData.servers)) {
            epData.servers.forEach((s: any) => {
              if (s.serverType === 'sub') subEps.add(num);
              if (s.serverType === 'dub') dubEps.add(num);
              if (s.serverType === 'multi') multiEps.add(num);
            });
          }
        });

        await updateDoc(doc(db, 'anime', matchedAnime.id), {
          subEpisodesCount: subEps.size,
          dubEpisodesCount: dubEps.size,
          multiEpisodesCount: multiEps.size,
          updatedAt: Date.now()
        });
      } catch (countErr) {
        log(`Failed to update episode counts for "${matchedAnime.title}"`, 'warning');
      }
    }

    // 5. Update yume_last_sync_cursor from API response root
    let finalCursor = response.sync_cursor;
    if (!finalCursor || finalCursor <= 0) {
      // Find maximum updated_at in batch or current time
      const maxItemUpdated = recentItems.reduce((max, it) => Math.max(max, it.updated_at || 0), 0);
      finalCursor = maxItemUpdated > 0 ? maxItemUpdated : Math.floor(Date.now() / 1000);
    }

    stats.durationMs = Date.now() - startTime;
    await saveYumeSyncSettings({
      lastSyncStatus: 'success',
      lastSyncMessage: `Successfully synced ${recentItems.length} anime entries (${stats.episodesAdded} added, ${stats.episodesUpdated} updated).`,
      lastSyncTimestamp: Date.now(),
      yume_last_sync_cursor: finalCursor,
      lastSyncStats: stats
    });

    log(`Sync batch finished in ${(stats.durationMs / 1000).toFixed(1)}s. Cursor advanced to ${finalCursor}.`, 'success');

    return {
      success: true,
      message: `Sync completed: ${stats.episodesAdded} added, ${stats.episodesUpdated} updated, ${stats.skippedByCursor} skipped.`,
      stats,
      newCursor: finalCursor
    };
  } catch (err: any) {
    stats.durationMs = Date.now() - startTime;
    const errorMsg = err.response?.data?.message || err.message || 'Unknown sync error';
    log(`Sync failed: ${errorMsg}`, 'error');

    await saveYumeSyncSettings({
      lastSyncStatus: 'error',
      lastSyncMessage: `Sync failed: ${errorMsg}`,
      lastSyncTimestamp: Date.now(),
      lastSyncStats: stats
    });

    return {
      success: false,
      message: errorMsg,
      stats,
      newCursor: 0
    };
  }
}
