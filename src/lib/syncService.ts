import { collection, doc, setDoc, query, where, getDocs, updateDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Anime, Episode, ServerLink } from '../types';
import axios from 'axios';

export interface MultiServerSyncEvent {
  eventId?: string;
  action?: 'add_episode' | 'update_episode' | 'delete_episode' | 'delete_server' | 'sync_episode' | 'sync_all' | 'full_dump';
  anilistId: number | string;
  episodeNumber?: number;
  embedUrl?: string; // Must default to https://yumestream.pages.dev/{anilistId}/{episodeNumber}
  serverName?: string; // Default: 'YUME'
  serverType?: 'multi' | 'sub' | 'dub'; // Default: 'multi'
  customTitle?: string;
  timestamp?: number;
  secretKey?: string;
}

export interface SyncResponseResult {
  success: boolean;
  message: string;
  eventId?: string;
  isDuplicate?: boolean;
  isNewAnime?: boolean;
  animeId?: string;
  animeTitle?: string;
  episodeNumber?: number;
  totalEpisodes?: number;
  serversCount?: number;
  serverUrl?: string;
  retainedNativeServers?: string[];
}

const SETTINGS_DOC_ID = 'multiserver_sync';
const LOCAL_EVENT_CACHE_KEY = 'processed_multiserver_event_ids';
const DEFAULT_SECRET_KEY = process.env.SYNC_SECRET_KEY || 'yoru_embed_sync_secret_2026';

// In-memory LRU set for fast dedup during runtime
const inMemoryProcessedEventIds = new Set<string>();

/**
 * Check and mark eventId as processed to guarantee idempotency
 */
export async function isEventAlreadyProcessed(eventId?: string): Promise<boolean> {
  if (!eventId) return false;

  const cleanId = String(eventId).trim();
  if (inMemoryProcessedEventIds.has(cleanId)) {
    return true;
  }

  // Check localStorage if in browser environment
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(LOCAL_EVENT_CACHE_KEY);
      if (raw) {
        const parsed: string[] = JSON.parse(raw);
        if (parsed.includes(cleanId)) {
          inMemoryProcessedEventIds.add(cleanId);
          return true;
        }
      }
    }
  } catch (e) {
    // Ignore local storage error
  }

  // Check Firestore settings
  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const events: string[] = data.processedEventIds || [];
      if (events.includes(cleanId)) {
        inMemoryProcessedEventIds.add(cleanId);
        return true;
      }
    }
  } catch (err) {
    // Fail-open for checking if Firestore has permission restrictions
  }

  return false;
}

/**
 * Record eventId in persistence after successful processing
 */
export async function recordProcessedEventId(eventId?: string): Promise<void> {
  if (!eventId) return;
  const cleanId = String(eventId).trim();
  inMemoryProcessedEventIds.add(cleanId);

  // Update localStorage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(LOCAL_EVENT_CACHE_KEY);
      let list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(cleanId)) {
        list.push(cleanId);
        if (list.length > 500) list = list.slice(-500); // keep last 500
        localStorage.setItem(LOCAL_EVENT_CACHE_KEY, JSON.stringify(list));
      }
    }
  } catch (e) {
    // Ignore
  }

  // Update Firestore
  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    let events: string[] = snap.exists() ? (snap.data().processedEventIds || []) : [];
    if (!events.includes(cleanId)) {
      events.push(cleanId);
      if (events.length > 500) events = events.slice(-500);
      await setDoc(docRef, {
        processedEventIds: events,
        lastEventId: cleanId,
        lastSyncedAt: Date.now()
      }, { merge: true });
    }
  } catch (err) {
    // Non-blocking
  }
}

export const verifySecretKey = (key?: string): boolean => {
  if (!key) return false;
  const normalized = key.trim();
  return (
    normalized === DEFAULT_SECRET_KEY.trim() ||
    normalized === 'mse_sync_secret_key_2026' ||
    normalized === 'yoru_embed_sync_secret_2026'
  );
};

export const buildMultiServerEmbedUrl = (anilistId: number | string, episodeNumber: number | string): string => {
  return `https://yumestream.pages.dev/${anilistId}/${episodeNumber}`;
};

export const fetchAniListMetadata = async (id: number) => {
  const query = `
    query ($id: Int) {
      Media (id: $id, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        episodes
        coverImage {
          extraLarge
          large
        }
        bannerImage
        genres
        description
        status
        startDate {
          year
        }
        duration
        studios(isMain: true) {
          nodes {
            name
          }
        }
        format
        averageScore
      }
    }
  `;

  const res = await axios.post('https://graphql.anilist.co', {
    query,
    variables: { id }
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
  });

  return res.data?.data?.Media;
};

export const fetchFillers = async (malId: number): Promise<Set<number>> => {
  const fillers = new Set<number>();
  try {
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage && page <= 5) {
      const res = await axios.get(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`, { timeout: 8000 });
      const data = res.data;
      if (data && data.data) {
        for (const ep of data.data) {
          if (ep.filler) fillers.add(ep.mal_id);
        }
      }
      hasNextPage = data?.pagination?.has_next_page || false;
      page++;
      if (hasNextPage) await new Promise(r => setTimeout(r, 400));
    }
  } catch (err) {
    // Fail silently if Jikan is rate-limited
  }
  return fillers;
};

/**
 * Identify if a server entry is managed by MultiServer
 */
export const isMultiServerEntry = (server: ServerLink): boolean => {
  if (!server) return false;
  const name = (server.serverName || '').toLowerCase().trim();
  const link = (server.embedLink || '').toLowerCase().trim();
  return (
    server.serverType === 'multi' ||
    name === 'yume' ||
    name === 'multiserver' ||
    name === 'multi' ||
    link.includes('yumestream.pages.dev') ||
    link.includes('multiserver.pages.dev')
  );
};

/**
 * Core Handler for MultiServer Manager Sync Events
 * STRICT GUARANTEE: Never modifies or removes non-MultiServer servers (HD-1, HD-2, custom).
 */
export async function handleMultiServerSync(event: MultiServerSyncEvent): Promise<SyncResponseResult> {
  const aniIdNum = Number(event.anilistId);
  if (!aniIdNum || isNaN(aniIdNum)) {
    return { success: false, message: 'Invalid or missing anilistId', eventId: event.eventId };
  }

  // 1. Idempotency Check
  if (event.eventId) {
    const alreadyProcessed = await isEventAlreadyProcessed(event.eventId);
    if (alreadyProcessed) {
      return {
        success: true,
        isDuplicate: true,
        message: `Event '${event.eventId}' was already processed. Safely ignored.`,
        eventId: event.eventId
      };
    }
  }

  const targetEpNum = event.episodeNumber ? Number(event.episodeNumber) : 1;
  const action = event.action || 'sync_episode';
  const serverName = event.serverName?.trim() || 'YUME';
  const serverType = event.serverType || 'multi';
  const embedUrl = event.embedUrl?.trim() || buildMultiServerEmbedUrl(aniIdNum, targetEpNum);

  // 2. Query Anime in Firestore by aniListId
  const q = query(collection(db, 'anime'), where('aniListId', '==', String(aniIdNum)));
  const querySnapshot = await getDocs(q);

  let animeDocRef: any;
  let animeId: string;
  let animeData: any = null;
  let isNewAnime = false;

  if (querySnapshot.empty) {
    // If action is delete and anime doesn't exist, nothing to do
    if (action === 'delete_episode' || action === 'delete_server') {
      if (event.eventId) await recordProcessedEventId(event.eventId);
      return {
        success: true,
        message: `Anime with AniList ID ${aniIdNum} does not exist. No MultiServer to delete.`,
        eventId: event.eventId
      };
    }

    // New Anime -> Fetch AniList metadata, generate anime, populate default HD-1 / HD-2 and MultiServer
    isNewAnime = true;
    const meta = await fetchAniListMetadata(aniIdNum);
    if (!meta) {
      return { success: false, message: `Could not fetch metadata for AniList ID ${aniIdNum}`, eventId: event.eventId };
    }

    const title = meta.title.english || meta.title.romaji || meta.title.native || `Anime ${aniIdNum}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `anime-${aniIdNum}`;
    const totalEpisodes = meta.episodes || Math.max(targetEpNum, 1);

    animeDocRef = doc(collection(db, 'anime'));
    animeId = animeDocRef.id;

    const newAnime: Anime = {
      id: animeId,
      title: title,
      nativeTitle: meta.title.native || meta.title.romaji || '',
      slug: slug,
      aniListId: String(aniIdNum),
      poster: meta.coverImage?.extraLarge || meta.coverImage?.large || '',
      backdrop: meta.bannerImage || meta.coverImage?.extraLarge || '',
      synopsis: meta.description?.replace(/<[^>]*>?/gm, '') || 'No synopsis available.',
      genres: meta.genres || [],
      format: meta.format || 'TV',
      status: meta.status || 'FINISHED',
      startDate: meta.startDate?.year ? String(meta.startDate.year) : '',
      endDate: '',
      season: '',
      averageScore: meta.averageScore ? String(meta.averageScore) : '',
      studios: meta.studios?.nodes?.[0]?.name || '',
      episodeDuration: meta.duration ? `${meta.duration} mins` : '',
      totalEpisodes: totalEpisodes,
      seasons: [{ id: 's1', name: 'Season 1', order: 1 }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      published: true
    };

    await setDoc(animeDocRef, newAnime);
    animeData = newAnime;

    // Fillers detection
    let fillerSet = new Set<number>();
    if (meta.idMal && totalEpisodes > 0) {
      fillerSet = await fetchFillers(meta.idMal);
    }

    // Generate episodes with default Sub & Dub (MegaPlay HD-1/HD-2) + MultiServer
    const epsToCreate = Math.max(totalEpisodes, targetEpNum);
    for (let epNum = 1; epNum <= epsToCreate; epNum++) {
      const epServers: ServerLink[] = [
        { serverName: 'HD-1', serverType: 'sub', embedLink: `https://megaplay.buzz/stream/ani/${aniIdNum}/${epNum}/sub` },
        { serverName: 'HD-1', serverType: 'dub', embedLink: `https://megaplay.buzz/stream/ani/${aniIdNum}/${epNum}/dub` },
        { serverName: 'YUME', serverType: 'multi', embedLink: `https://yumestream.pages.dev/${aniIdNum}/${epNum}` }
      ];

      if (meta.idMal) {
        epServers.push(
          { serverName: 'HD-2', serverType: 'sub', embedLink: `https://megaplay.buzz/stream/mal/${meta.idMal}/${epNum}/sub` },
          { serverName: 'HD-2', serverType: 'dub', embedLink: `https://megaplay.buzz/stream/mal/${meta.idMal}/${epNum}/dub` }
        );
      }

      // Add MultiServer ONLY to the target episode requested by Manager
      if (epNum === targetEpNum) {
        epServers.push({
          serverName: serverName,
          serverType: serverType,
          embedLink: embedUrl
        });
      }

      const epDocId = `${animeId}_s1_${epNum}`;
      const epDocRef = doc(db, 'episodes', epDocId);
      const isFiller = fillerSet.has(epNum);

      const newEp: Episode = {
        id: epDocId,
        animeId: animeId,
        seasonId: 's1',
        episodeNumber: epNum,
        title: `Episode ${epNum}`,
        servers: epServers,
        thumbnailUrl: meta.coverImage?.large || '',
        isFiller: isFiller,
        createdAt: Date.now(),
        published: true
      };

      await setDoc(epDocRef, newEp);
    }

    if (event.eventId) await recordProcessedEventId(event.eventId);

    return {
      success: true,
      isNewAnime: true,
      eventId: event.eventId,
      message: `Successfully created new Anime "${title}" with ${epsToCreate} episodes (Preserved HD-1/HD-2 Sub & Dub + MultiServer)`,
      animeId: animeId,
      animeTitle: title,
      episodeNumber: targetEpNum,
      totalEpisodes: epsToCreate,
      serverUrl: embedUrl,
      retainedNativeServers: ['HD-1 (sub)', 'HD-1 (dub)', 'HD-2 (sub)', 'HD-2 (dub)']
    };
  } else {
    // Existing Anime
    animeDocRef = querySnapshot.docs[0].ref;
    animeId = animeDocRef.id;
    animeData = querySnapshot.docs[0].data() as Anime;

    const epQuery = query(
      collection(db, 'episodes'),
      where('animeId', '==', animeId),
      where('episodeNumber', '==', targetEpNum)
    );
    const epSnap = await getDocs(epQuery);

    if (!epSnap.empty) {
      // Existing Episode
      const existingEpDoc = epSnap.docs[0];
      const existingEpData = existingEpDoc.data() as Episode;
      const currentServers: ServerLink[] = Array.isArray(existingEpData.servers) ? [...existingEpData.servers] : [];

      // 🛡️ Filter and strictly isolate native non-MultiServer servers
      const nativeServers = currentServers.filter(s => !isMultiServerEntry(s));
      const retainedNames = nativeServers.map(s => `${s.serverName} (${s.serverType})`);

      let finalServers: ServerLink[] = [];

      if (action === 'delete_episode' || action === 'delete_server') {
        // Remove ONLY the MultiServer entry. Keep all native servers untouched!
        finalServers = [...nativeServers];

        await setDoc(existingEpDoc.ref, { servers: finalServers }, { merge: true });
        if (event.eventId) await recordProcessedEventId(event.eventId);

        return {
          success: true,
          eventId: event.eventId,
          message: `Removed MultiServer entry from Episode ${targetEpNum} of "${animeData.title}". Retained ${nativeServers.length} native servers.`,
          animeId: animeId,
          animeTitle: animeData.title,
          episodeNumber: targetEpNum,
          totalEpisodes: animeData.totalEpisodes,
          serversCount: finalServers.length,
          retainedNativeServers: retainedNames
        };
      } else {
        // Add or Update MultiServer entry
        const multiServerEntry: ServerLink = {
          serverName: serverName,
          serverType: serverType,
          embedLink: embedUrl
        };

        // Combine retained native servers + single updated MultiServer entry (No duplicates)
        finalServers = [...nativeServers, multiServerEntry];

        await setDoc(existingEpDoc.ref, { servers: finalServers }, { merge: true });
        if (event.eventId) await recordProcessedEventId(event.eventId);

        return {
          success: true,
          eventId: event.eventId,
          message: `Updated MultiServer entry on Episode ${targetEpNum} of "${animeData.title}". Retained ${nativeServers.length} native servers.`,
          animeId: animeId,
          animeTitle: animeData.title,
          episodeNumber: targetEpNum,
          totalEpisodes: animeData.totalEpisodes,
          serversCount: finalServers.length,
          serverUrl: embedUrl,
          retainedNativeServers: retainedNames
        };
      }
    } else {
      // Episode does not exist yet
      if (action === 'delete_episode' || action === 'delete_server') {
        if (event.eventId) await recordProcessedEventId(event.eventId);
        return {
          success: true,
          eventId: event.eventId,
          message: `Episode ${targetEpNum} does not exist. Nothing to remove.`,
          animeId: animeId,
          animeTitle: animeData.title,
          episodeNumber: targetEpNum
        };
      }

      // Create new episode with standard fallback Sub/Dub + MultiServer
      const epDocId = `${animeId}_s1_${targetEpNum}`;
      const epDocRef = doc(db, 'episodes', epDocId);

      const servers: ServerLink[] = [
        { serverName: 'HD-1', serverType: 'sub', embedLink: `https://megaplay.buzz/stream/ani/${aniIdNum}/${targetEpNum}/sub` },
        { serverName: 'HD-1', serverType: 'dub', embedLink: `https://megaplay.buzz/stream/ani/${aniIdNum}/${targetEpNum}/dub` },
        { serverName: serverName, serverType: serverType, embedLink: embedUrl }
      ];

      const newEp: Episode = {
        id: epDocId,
        animeId: animeId,
        seasonId: 's1',
        episodeNumber: targetEpNum,
        title: `Episode ${targetEpNum}`,
        servers: servers,
        thumbnailUrl: animeData.poster || '',
        isFiller: false,
        createdAt: Date.now(),
        published: true
      };

      await setDoc(epDocRef, newEp);

      // Expand anime totalEpisodes if needed
      if (targetEpNum > (animeData.totalEpisodes || 0)) {
        await updateDoc(animeDocRef, {
          totalEpisodes: targetEpNum,
          updatedAt: Date.now()
        });
      }

      if (event.eventId) await recordProcessedEventId(event.eventId);

      return {
        success: true,
        eventId: event.eventId,
        message: `Created new Episode ${targetEpNum} for "${animeData.title}" with HD-1 Sub/Dub and MultiServer.`,
        animeId: animeId,
        animeTitle: animeData.title,
        episodeNumber: targetEpNum,
        totalEpisodes: Math.max(animeData.totalEpisodes || 0, targetEpNum),
        serverUrl: embedUrl,
        retainedNativeServers: ['HD-1 (sub)', 'HD-1 (dub)']
      };
    }
  }
}

// Backward-compatible alias
export const handleEmbedSync = handleMultiServerSync;
