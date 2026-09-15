import { collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { Anime, Episode, ServerLink } from '../types';
import { fetchMultiServerRawDataset, MultiServerItem } from './multiServerService';
import axios from 'axios';

export interface MultiServerSyncStats {
  totalChecked: number;
  newAnimeAdded: number;
  existingAnimeUpdated: number;
  episodesAdded: number;
  episodesUpdated: number;
  episodesSkipped: number;
  durationMs: number;
}

export interface MultiServerSyncSettings {
  autoSyncEnabled: boolean;
  intervalMinutes: number;
  lastSyncTimestamp: number;
  lastSyncStatus: 'idle' | 'running' | 'success' | 'error';
  lastSyncMessage: string;
  yume_last_sync_cursor?: number;
  lastSyncStats?: MultiServerSyncStats;
}

export interface AnimeComparisonResult {
  animeId: string;
  title: string;
  anilistId: number | string;
  malId: number | string;
  poster: string;
  multiserverEpCount: number;
  multiserverEpisodes: number[];
  localAnimeExists: boolean;
  localAnimeId?: string;
  localEpCount: number;
  localMultiEpCount: number;
  missingEpisodeNumbers: number[];
  episodesNeedingMultiServer: number[];
  status: 'fully_synced' | 'new_episodes_available' | 'needs_multi_server' | 'not_imported';
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'skip';
  message: string;
}

const SETTINGS_DOC_ID = 'multiserver_sync';
const LOCAL_STORAGE_KEY = 'yoru_multiserver_sync_settings';

export const DEFAULT_MULTISERVER_SETTINGS: MultiServerSyncSettings = {
  autoSyncEnabled: false,
  intervalMinutes: 60,
  lastSyncTimestamp: 0,
  lastSyncStatus: 'idle',
  lastSyncMessage: 'Ready to sync',
};

function cleanTitleForMatch(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a stream URL is alive by using our robust verify-link backend
 */
async function verifyStreamLink(url: string): Promise<boolean> {
  try {
    const res = await axios.post('/api/verify-link', { url }, { timeout: 6000 });
    return res.data?.status === 'alive';
  } catch {
    return false;
  }
}

/**
 * Resolves MyAnimeList ID from AniList ID via AniList GraphQL
 */
async function fetchMalId(aniId: string | number): Promise<string | undefined> {
  try {
    const res = await axios.post(
      'https://graphql.anilist.co',
      {
        query: `query ($id: Int) { Media(id: $id) { idMal } }`,
        variables: { id: Number(aniId) }
      },
      { timeout: 5000 }
    );
    const idMal = res.data?.data?.Media?.idMal;
    return idMal ? String(idMal) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get sync settings from Firestore or localStorage fallback
 */
export async function getMultiServerSyncSettings(): Promise<MultiServerSyncSettings> {
  let localSettings: MultiServerSyncSettings | null = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) localSettings = JSON.parse(stored);
    } catch {
      // Ignore
    }
  }

  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = { ...DEFAULT_MULTISERVER_SETTINGS, ...(snap.data() as MultiServerSyncSettings) };
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
      }
      return data;
    }
  } catch (err) {
    // Expected when permission restricted or offline
  }

  return localSettings || DEFAULT_MULTISERVER_SETTINGS;
}

/**
 * Save sync settings to Firestore and localStorage
 */
export async function saveMultiServerSyncSettings(
  settings: Partial<MultiServerSyncSettings>
): Promise<boolean> {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const current = localStorage.getItem(LOCAL_STORAGE_KEY);
      const parsed = current ? JSON.parse(current) : DEFAULT_MULTISERVER_SETTINGS;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ ...parsed, ...settings }));
    } catch {
      // Ignore
    }
  }

  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    await setDoc(docRef, settings, { merge: true });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Scans MultiServer and compares against local Firestore
 * Returns comparison for all items so UI can render status and pending changes
 */
export async function scanMultiServerComparison(
  onProgress?: (current: number, total: number, msg: string) => void
): Promise<AnimeComparisonResult[]> {
  const { rawItems } = await fetchMultiServerRawDataset();
  if (rawItems.length === 0) return [];

  // Fetch local anime
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

  // Fetch all local episodes
  const epSnap = await getDocs(collection(db, 'episodes'));
  const epsByAnimeId = new Map<string, Episode[]>();
  epSnap.docs.forEach(d => {
    const ep = d.data() as Episode;
    if (ep.animeId) {
      if (!epsByAnimeId.has(ep.animeId)) epsByAnimeId.set(ep.animeId, []);
      epsByAnimeId.get(ep.animeId)!.push({ ...ep, id: d.id });
    }
  });

  const results: AnimeComparisonResult[] = [];
  const total = rawItems.length;

  for (let i = 0; i < total; i++) {
    const item = rawItems[i];
    onProgress?.(i + 1, total, `Analyzing ${item.title}...`);

    const aniIdStr = String(item.anilist_id || item.anime_id);
    const malIdStr = item.mal_id ? String(item.mal_id) : '';
    const cleanTitle = cleanTitleForMatch(item.title);
    const itemSlug = (item.title || item.anime_id).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const matchedLocal =
      mapByAniList.get(aniIdStr) ||
      (malIdStr ? mapByMal.get(malIdStr) : undefined) ||
      mapBySlug.get(itemSlug) ||
      mapByTitle.get(cleanTitle) ||
      mapById.get(`ms_${aniIdStr}`) ||
      mapById.get(item.anime_id);

    const msEps = item.episodes_available || [];

    if (!matchedLocal) {
      results.push({
        animeId: item.anime_id,
        title: item.title,
        anilistId: item.anilist_id,
        malId: item.mal_id,
        poster: item.cover_image,
        multiserverEpCount: msEps.length,
        multiserverEpisodes: msEps,
        localAnimeExists: false,
        localEpCount: 0,
        localMultiEpCount: 0,
        missingEpisodeNumbers: msEps,
        episodesNeedingMultiServer: [],
        status: 'not_imported'
      });
    } else {
      const localEps = epsByAnimeId.get(matchedLocal.id) || [];
      const localEpMap = new Map<number, Episode>();
      let localMultiCount = 0;

      localEps.forEach(ep => {
        localEpMap.set(ep.episodeNumber, ep);
        const hasMulti = ep.servers?.some(s =>
          s.serverType === 'multi' ||
          s.serverName === 'YUME' ||
          s.serverName === 'Multi' ||
          s.serverName === 'MultiServer' ||
          (s.embedLink && (s.embedLink.includes('yumestream.pages.dev') || s.embedLink.includes('multiserver.pages.dev')))
        );
        if (hasMulti) localMultiCount++;
      });

      const missingEpisodeNumbers: number[] = [];
      const episodesNeedingMultiServer: number[] = [];

      msEps.forEach(epNum => {
        const localEp = localEpMap.get(epNum);
        if (!localEp) {
          missingEpisodeNumbers.push(epNum);
        } else {
          const hasMulti = localEp.servers?.some(s =>
            s.serverType === 'multi' ||
            s.serverName === 'YUME' ||
            s.serverName === 'Multi' ||
            s.serverName === 'MultiServer' ||
            (s.embedLink && (s.embedLink.includes('yumestream.pages.dev') || s.embedLink.includes('multiserver.pages.dev')))
          );
          if (!hasMulti) {
            episodesNeedingMultiServer.push(epNum);
          }
        }
      });

      let status: AnimeComparisonResult['status'] = 'fully_synced';
      if (missingEpisodeNumbers.length > 0) {
        status = 'new_episodes_available';
      } else if (episodesNeedingMultiServer.length > 0) {
        status = 'needs_multi_server';
      }

      results.push({
        animeId: item.anime_id,
        title: item.title,
        anilistId: item.anilist_id,
        malId: item.mal_id,
        poster: item.cover_image || matchedLocal.poster || '',
        multiserverEpCount: msEps.length,
        multiserverEpisodes: msEps,
        localAnimeExists: true,
        localAnimeId: matchedLocal.id,
        localEpCount: localEps.length,
        localMultiEpCount: localMultiCount,
        missingEpisodeNumbers,
        episodesNeedingMultiServer,
        status
      });
    }
  }

  return results;
}

export interface SyncOptions {
  onLog?: (entry: SyncLogEntry) => void;
  onProgress?: (current: number, total: number, percent: number) => void;
  filterMode?: 'all' | 'missing_only' | 'new_anime_only';
  specificAnimeIds?: string[];
  shouldStop?: () => boolean;
}

/**
 * Main Incremental Sync Runner
 * Implements exact user logic:
 * - Checks if anime exists
 * - If not, creates anime with all episodes
 * - If exists, adds only missing episodes
 * - If episode exists and already has Multi server, skips it
 * - If episode exists and lacks Multi server, appends Multi server link
 * - Unlimited and fast batch processing
 */
export async function runMultiServerSetSync(options: SyncOptions = {}): Promise<{
  success: boolean;
  message: string;
  stats: MultiServerSyncStats;
}> {
  const startTime = Date.now();
  const stats: MultiServerSyncStats = {
    totalChecked: 0,
    newAnimeAdded: 0,
    existingAnimeUpdated: 0,
    episodesAdded: 0,
    episodesUpdated: 0,
    episodesSkipped: 0,
    durationMs: 0
  };

  const addLog = (message: string, type: SyncLogEntry['type'] = 'info') => {
    const timeStr = new Date().toLocaleTimeString();
    options.onLog?.({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: timeStr,
      type,
      message
    });
  };

  try {
    addLog(`Initiating connection to https://yumestream.pages.dev/set...`, 'info');
    await saveMultiServerSyncSettings({ lastSyncStatus: 'running', lastSyncMessage: 'Syncing in progress...' });

    const { rawItems } = await fetchMultiServerRawDataset();
    if (!rawItems || rawItems.length === 0) {
      addLog('No anime found in MultiServer dataset.', 'warning');
      const finalStats = { ...stats, durationMs: Date.now() - startTime };
      await saveMultiServerSyncSettings({
        lastSyncStatus: 'success',
        lastSyncMessage: 'No items in MultiServer dataset',
        lastSyncTimestamp: Date.now(),
        lastSyncStats: finalStats
      });
      return { success: true, message: 'No items found', stats: finalStats };
    }

    addLog(`Successfully retrieved ${rawItems.length} anime entries from MultiServer dataset.`, 'success');

    // Filter items if specific IDs or filterMode is active
    let targetItems = rawItems;
    if (options.specificAnimeIds && options.specificAnimeIds.length > 0) {
      const idSet = new Set(options.specificAnimeIds.map(String));
      targetItems = rawItems.filter(it => idSet.has(String(it.anime_id)) || idSet.has(String(it.anilist_id)));
    }

    // Fetch existing anime from local Firestore
    addLog('Querying local Firestore for existing anime database...', 'info');
    const animeCollection = collection(db, 'anime');
    const existingSnap = await getDocs(animeCollection);
    const existingAnimeList: Anime[] = existingSnap.docs.map(d => ({ ...(d.data() as Anime), id: d.id }));

    const mapById = new Map<string, Anime>();
    const mapByAniList = new Map<string, Anime>();
    const mapByMal = new Map<string, Anime>();
    const mapBySlug = new Map<string, Anime>();
    const mapByTitle = new Map<string, Anime>();

    existingAnimeList.forEach(a => {
      if (a.id) mapById.set(a.id, a);
      if (a.aniListId) mapByAniList.set(String(a.aniListId), a);
      if (a.malId) mapByMal.set(String(a.malId), a);
      if (a.slug) mapBySlug.set(a.slug.toLowerCase(), a);
      if (a.title) mapByTitle.set(cleanTitleForMatch(a.title), a);
    });

    addLog(`Found ${existingAnimeList.length} local anime in database. Starting incremental episode comparison...`, 'info');

    const totalToProcess = targetItems.length;

    for (let i = 0; i < totalToProcess; i++) {
      if (options.shouldStop?.()) {
        addLog('Sync operation manually paused by user.', 'warning');
        break;
      }

      const item = targetItems[i];
      stats.totalChecked++;
      const percent = Math.round(((i + 1) / totalToProcess) * 100);
      options.onProgress?.(i + 1, totalToProcess, percent);

      const aniIdStr = String(item.anilist_id || item.anime_id);
      const malIdStr = item.mal_id ? String(item.mal_id) : '';
      const cleanTitle = cleanTitleForMatch(item.title);
      const itemSlug = (item.title || item.anime_id).toLowerCase().replace(/[^a-z0-9]+/g, '-');

      // Check if anime already exists in local database
      const matchedAnime: Anime | undefined =
        mapByAniList.get(aniIdStr) ||
        (malIdStr ? mapByMal.get(malIdStr) : undefined) ||
        mapBySlug.get(itemSlug) ||
        mapByTitle.get(cleanTitle) ||
        mapById.get(`ms_${aniIdStr}`) ||
        mapById.get(item.anime_id);

      const msEpisodes = item.episodes_available || [];
      const anilistOrId = item.anilist_id || item.anime_id;

      // Resolve MAL ID if missing
      let effectiveMalId = malIdStr || (matchedAnime?.malId ? String(matchedAnime.malId) : '');
      if (!effectiveMalId && /^\d+$/.test(aniIdStr)) {
        try {
          effectiveMalId = (await fetchMalId(aniIdStr)) || '';
        } catch {}
      }

      // Check Sub and Dub availability for both AL (HD-1) and MAL (HD-2)
      // Rule: "kono anime multi theke jokhon add korba.. oitar sub & dub o add korba check kore ofc.. jodi dub na thake add korba na tao 2ta server a al & mal"
      const sampleEp = msEpisodes[0] || 1;
      const aniSubUrl = `https://megaplay.buzz/stream/ani/${aniIdStr}/${sampleEp}/sub`;
      const aniDubUrl = `https://megaplay.buzz/stream/ani/${aniIdStr}/${sampleEp}/dub`;

      const [hasAniSub, hasAniDub] = await Promise.all([
        verifyStreamLink(aniSubUrl),
        verifyStreamLink(aniDubUrl)
      ]);

      let hasMalSub = false;
      let hasMalDub = false;
      if (effectiveMalId) {
        const malSubUrl = `https://megaplay.buzz/stream/mal/${effectiveMalId}/${sampleEp}/sub`;
        const malDubUrl = `https://megaplay.buzz/stream/mal/${effectiveMalId}/${sampleEp}/dub`;
        const [mSub, mDub] = await Promise.all([
          verifyStreamLink(malSubUrl),
          hasAniDub ? verifyStreamLink(malDubUrl) : Promise.resolve(false)
        ]);
        hasMalSub = mSub;
        hasMalDub = mDub;
      }

      const hasDub = hasAniDub || hasMalDub;

      // Helper to construct exact server links for an episode
      const buildEpisodeServers = (epNum: number): ServerLink[] => {
        const srvs: ServerLink[] = [];

        // 1. AL Server (HD-1)
        if (hasAniSub || !effectiveMalId) {
          srvs.push({
            serverName: 'HD-1',
            serverType: 'sub',
            embedLink: `https://megaplay.buzz/stream/ani/${aniIdStr}/${epNum}/sub`
          });
        }
        // Add dub only if dub stream is verified alive
        if (hasAniDub) {
          srvs.push({
            serverName: 'HD-1',
            serverType: 'dub',
            embedLink: `https://megaplay.buzz/stream/ani/${aniIdStr}/${epNum}/dub`
          });
        }

        // 2. MAL Server (HD-2)
        if (effectiveMalId) {
          if (hasMalSub || hasAniSub) {
            srvs.push({
              serverName: 'HD-2',
              serverType: 'sub',
              embedLink: `https://megaplay.buzz/stream/mal/${effectiveMalId}/${epNum}/sub`
            });
          }
          // Add dub only if dub stream is verified alive
          if (hasMalDub || hasAniDub) {
            srvs.push({
              serverName: 'HD-2',
              serverType: 'dub',
              embedLink: `https://megaplay.buzz/stream/mal/${effectiveMalId}/${epNum}/dub`
            });
          }
        }

        // 3. YUME Multi Server
        srvs.push({
          serverName: 'YUME',
          serverType: 'multi',
          embedLink: `https://yumestream.pages.dev/${anilistOrId}/${epNum}`
        });

        return srvs;
      };

      if (!matchedAnime) {
        // =========================================================
        // CASE 1: NEW ANIME (Does NOT exist in local database)
        // =========================================================
        if (options.filterMode === 'missing_only') {
          addLog(`[SKIP] "${item.title}" is a new anime (Skipped due to 'Missing Only' mode).`, 'skip');
          continue;
        }

        addLog(`[NEW ANIME] Importing "${item.title}" (${msEpisodes.length} eps | Sub: ✓ | Dub: ${hasDub ? '✓' : 'None'} | AL & MAL servers)...`, 'info');

        const newAnimeId = `ms_${aniIdStr}`;
        const finalSlug = itemSlug || `anime-${aniIdStr}`;

        let currentBatch = writeBatch(db);
        let batchCount = 0;

        // Create new Anime document
        const newAnimeDoc: Anime = {
          id: newAnimeId,
          title: item.title,
          nativeTitle: item.japanese || item.title,
          slug: finalSlug,
          aniListId: aniIdStr,
          malId: effectiveMalId || undefined,
          format: item.format || (item.type === 'Movie' ? 'Movie' : 'TV'),
          totalEpisodes: item.episodes || item.total_episodes || msEpisodes.length || 12,
          episodeDuration: item.duration || '24 mins',
          status: item.status === 'FINISHED' ? 'Finished' : 'Releasing',
          startDate: '',
          endDate: '',
          season: item.premiered || (item.season ? `Season ${item.season}` : '2026'),
          averageScore: typeof item.score === 'number' ? `${item.score}%` : (item.score || '85%'),
          studios: Array.isArray(item.studios) && item.studios.length > 0 ? item.studios.join(', ') : 'MultiServer',
          genres: item.genres && item.genres.length > 0 ? item.genres : ['Anime'],
          poster: item.cover_image || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&q=80&w=600',
          backdrop: item.banner_image || item.backdrop_image || item.cover_image || '',
          synopsis: item.synopsis || `Watch ${item.title} online on YORU.`,
          seasons: [{ id: 's1', name: 'Season 1', order: 1 }],
          subEpisodesCount: msEpisodes.length,
          dubEpisodesCount: hasDub ? msEpisodes.length : 0,
          multiEpisodesCount: msEpisodes.length,
          // 11 Rich Metadata Fields
          coverImage: item.cover_image || undefined,
          bannerImage: item.banner_image || item.backdrop_image || undefined,
          japanese: item.japanese || undefined,
          synonyms: item.synonyms || undefined,
          aired: item.aired || undefined,
          premiered: item.premiered || undefined,
          duration: item.duration || '24 mins',
          malScore: item.mal_score || undefined,
          episodes: item.episodes || item.total_episodes || msEpisodes.length || 12,
          country: item.country || 'Japan',
          source: item.source || 'Original',
          franchiseGroupId: item.group_id || undefined,
          franchiseGroupName: item.group_title || undefined,
          recentlyAddedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          published: true
        };

        // Clean undefined keys
        Object.keys(newAnimeDoc).forEach(key => {
          if (newAnimeDoc[key as keyof Anime] === undefined) {
            delete newAnimeDoc[key as keyof Anime];
          }
        });

        currentBatch.set(doc(db, 'anime', newAnimeId), newAnimeDoc);
        batchCount++;

        // Add all episodes for this new anime with AL, MAL, and Multi servers
        for (const epNum of msEpisodes) {
          const epDocId = `${newAnimeId}_s1_${epNum}`;
          const epDetail = item.episode_details?.find(d => d.number === epNum);
          const episodeData: Episode = {
            id: epDocId,
            animeId: newAnimeId,
            seasonId: 's1',
            episodeNumber: epNum,
            title: epDetail?.title || `Episode ${epNum}`,
            isFiller: false,
            servers: buildEpisodeServers(epNum),
            thumbnailUrl: epDetail?.thumbnail || item.backdrop_image || item.cover_image || '',
            createdAt: Date.now(),
            published: true
          };

          currentBatch.set(doc(db, 'episodes', epDocId), episodeData);
          batchCount++;

          if (batchCount >= 400) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            batchCount = 0;
          }
        }

        if (batchCount > 0) {
          await currentBatch.commit();
        }

        // Update local maps so duplicates in the same run are respected
        mapById.set(newAnimeDoc.id, newAnimeDoc);
        mapByAniList.set(aniIdStr, newAnimeDoc);
        mapBySlug.set(finalSlug, newAnimeDoc);
        mapByTitle.set(cleanTitle, newAnimeDoc);

        stats.newAnimeAdded++;
        stats.episodesAdded += msEpisodes.length;
        addLog(`✓ Successfully added "${item.title}" with ${msEpisodes.length} episodes (AL & MAL Sub: ✓, Dub: ${hasDub ? '✓' : 'None'}, Multi: ✓).`, 'success');

      } else {
        // =========================================================
        // CASE 2: EXISTING ANIME (Incremental Episode Check)
        // User rule: "ja already ekhane ache skip.. jodi new episode add hoy.. to tokhon baki episode gulo add korbe"
        // =========================================================
        if (options.filterMode === 'new_anime_only') {
          addLog(`[SKIP] "${item.title}" already exists (Skipped due to 'New Anime Only' mode).`, 'skip');
          continue;
        }

        // Query existing episodes for this anime from Firestore
        const epQuery = query(collection(db, 'episodes'), where('animeId', '==', matchedAnime.id));
        const epSnap = await getDocs(epQuery);
        const existingEpisodes: Episode[] = epSnap.docs.map(d => ({ ...(d.data() as Episode), id: d.id }));

        const existingEpMap = new Map<number, Episode>();
        let existingMultiCount = 0;

        for (const ep of existingEpisodes) {
          existingEpMap.set(ep.episodeNumber, ep);
          const hasMulti = ep.servers?.some(s =>
            s.serverType === 'multi' ||
            s.serverName === 'YUME' ||
            s.serverName === 'Multi' ||
            s.serverName === 'MultiServer' ||
            (s.embedLink && (s.embedLink.includes('yumestream.pages.dev') || s.embedLink.includes('multiserver.pages.dev')))
          );
          if (hasMulti) existingMultiCount++;
        }

        let animeNewEpsCount = 0;
        let animeUpdatedEpsCount = 0;
        let animeSkippedEpsCount = 0;

        let currentBatch = writeBatch(db);
        let batchCount = 0;

        for (const epNum of msEpisodes) {
          const existingEp = existingEpMap.get(epNum);
          const neededServers = buildEpisodeServers(epNum);

          if (!existingEp) {
            // SUB-CASE 2A: EPISODE DOES NOT EXIST AT ALL LOCALLY (e.g. had 2, now 20)
            const epDocId = `${matchedAnime.id}_s1_${epNum}`;
            const epDetail = item.episode_details?.find(d => d.number === epNum);
            const episodeData: Episode = {
              id: epDocId,
              animeId: matchedAnime.id,
              seasonId: 's1',
              episodeNumber: epNum,
              title: epDetail?.title || `Episode ${epNum}`,
              isFiller: false,
              servers: neededServers,
              thumbnailUrl: epDetail?.thumbnail || matchedAnime.backdrop || matchedAnime.poster || item.cover_image || '',
              createdAt: Date.now(),
              published: true
            };

            currentBatch.set(doc(db, 'episodes', epDocId), episodeData);
            batchCount++;
            animeNewEpsCount++;
            stats.episodesAdded++;

          } else {
            // SUB-CASE 2B: EPISODE EXISTS LOCALLY
            // Check if needed servers (Multi, AL Sub/Dub, MAL Sub/Dub) are present
            const currentServers = [...(existingEp.servers || [])];
            let modified = false;

            for (const srv of neededServers) {
              const alreadyHas = currentServers.some(s =>
                (s.serverName === srv.serverName && s.serverType === srv.serverType) ||
                s.embedLink === srv.embedLink
              );
              if (!alreadyHas) {
                currentServers.push(srv);
                modified = true;
              }
            }

            if (modified) {
              currentBatch.update(doc(db, 'episodes', existingEp.id), {
                servers: currentServers,
                updatedAt: Date.now()
              });
              batchCount++;
              animeUpdatedEpsCount++;
              stats.episodesUpdated++;
            } else {
              // SKIP! "ja already ekhane ache skip"
              animeSkippedEpsCount++;
              stats.episodesSkipped++;
            }
          }

          if (batchCount >= 400) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            batchCount = 0;
          }
        }

        // Recalculate total multi episodes count for this anime
        const newMultiCount = Math.max(existingMultiCount + animeNewEpsCount + animeUpdatedEpsCount, msEpisodes.length);
        const highestEpNum = Math.max(
          matchedAnime.totalEpisodes || 0,
          ...msEpisodes,
          ...existingEpisodes.map(e => e.episodeNumber)
        );

        if (animeNewEpsCount > 0 || animeUpdatedEpsCount > 0 || (!matchedAnime.coverImage && item.cover_image)) {
          const animeUpdatePayload: any = {
            multiEpisodesCount: newMultiCount,
            subEpisodesCount: Math.max(matchedAnime.subEpisodesCount || 0, newMultiCount),
            ...(hasDub ? { dubEpisodesCount: Math.max(matchedAnime.dubEpisodesCount || 0, newMultiCount) } : {}),
            ...(effectiveMalId && !matchedAnime.malId ? { malId: effectiveMalId } : {}),
            ...(item.cover_image && !matchedAnime.coverImage ? { coverImage: item.cover_image } : {}),
            ...(item.banner_image && !matchedAnime.bannerImage ? { bannerImage: item.banner_image } : {}),
            ...(item.japanese && !matchedAnime.japanese ? { japanese: item.japanese } : {}),
            ...(item.synonyms && (!matchedAnime.synonyms || (Array.isArray(matchedAnime.synonyms) && matchedAnime.synonyms.length === 0)) ? { synonyms: item.synonyms } : {}),
            ...(item.aired && !matchedAnime.aired ? { aired: item.aired } : {}),
            ...(item.premiered && !matchedAnime.premiered ? { premiered: item.premiered } : {}),
            ...(item.duration && !matchedAnime.duration ? { duration: item.duration } : {}),
            ...(item.mal_score && !matchedAnime.malScore ? { malScore: item.mal_score } : {}),
            ...(item.country && !matchedAnime.country ? { country: item.country } : {}),
            ...(item.source && !matchedAnime.source ? { source: item.source } : {}),
            ...(item.group_id && !matchedAnime.franchiseGroupId ? { franchiseGroupId: item.group_id } : {}),
            ...(item.group_title && !matchedAnime.franchiseGroupName ? { franchiseGroupName: item.group_title } : {}),
            updatedAt: Date.now()
          };

          if (highestEpNum > (matchedAnime.totalEpisodes || 0)) {
            animeUpdatePayload.totalEpisodes = highestEpNum;
          }

          currentBatch.update(doc(db, 'anime', matchedAnime.id), animeUpdatePayload);
          batchCount++;
        }

        if (batchCount > 0) {
          await currentBatch.commit();
        }

        if (animeNewEpsCount > 0 || animeUpdatedEpsCount > 0) {
          stats.existingAnimeUpdated++;
          addLog(
            `✓ [UPDATED] "${matchedAnime.title}": Added ${animeNewEpsCount} new episodes, updated ${animeUpdatedEpsCount} existing, skipped ${animeSkippedEpsCount} already synced.`,
            'success'
          );
        } else {
          addLog(
            `[SKIP] "${matchedAnime.title}": All ${msEpisodes.length} episodes already synced.`,
            'skip'
          );
        }
      }
    }

    stats.durationMs = Date.now() - startTime;
    const summaryMsg = `Sync complete: ${stats.newAnimeAdded} new anime, ${stats.episodesAdded} new episodes added, ${stats.episodesUpdated} episodes updated, ${stats.episodesSkipped} skipped in ${(stats.durationMs / 1000).toFixed(1)}s`;

    addLog(summaryMsg, 'success');

    await saveMultiServerSyncSettings({
      lastSyncStatus: 'success',
      lastSyncMessage: summaryMsg,
      lastSyncTimestamp: Date.now(),
      lastSyncStats: stats
    });

    return {
      success: true,
      message: summaryMsg,
      stats
    };

  } catch (error: any) {
    const errorMsg = `Sync failed: ${error.message || 'Unknown error'}`;
    addLog(errorMsg, 'error');

    stats.durationMs = Date.now() - startTime;
    await saveMultiServerSyncSettings({
      lastSyncStatus: 'error',
      lastSyncMessage: errorMsg,
      lastSyncTimestamp: Date.now(),
      lastSyncStats: stats
    });

    return {
      success: false,
      message: errorMsg,
      stats
    };
  }
}

/**
 * Syncs a single anime on demand
 */
export async function syncSingleMultiServerAnime(
  animeId: string,
  onLog?: (entry: SyncLogEntry) => void
): Promise<{ success: boolean; message: string; stats: MultiServerSyncStats }> {
  return runMultiServerSetSync({
    specificAnimeIds: [animeId],
    onLog
  });
}

// Re-export Authoritative YUME Incremental Sync Engine
export {
  runYumeIncrementalSync,
  runYumeSetSync,
  getYumeSyncSettings,
  saveYumeSyncSettings,
  getYumeSyncCursor,
  setYumeSyncCursor,
  resetYumeSyncCursor,
  checkYumeSyncStatus,
  fetchYumeRecentUpdates,
  fetchYumeCatalog,
  fetchYumeAnimeById,
  buildYumeEmbedUrl,
  mergeAuthoritativeYumeServer
} from './yumeSyncService';

