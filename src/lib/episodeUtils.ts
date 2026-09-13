import { Episode, ServerLink } from '../types';

/**
 * Automatically detects server name and type from a given embed link.
 */
export function autoDetectServer(link: string): { serverName: string; serverType: 'sub' | 'dub' | 'multi' } {
  const cleanLink = String(link || '').trim().toLowerCase();
  let serverName = 'HD-1';
  let serverType: 'sub' | 'dub' | 'multi' = 'sub';

  if (
    cleanLink.includes('yumestream.pages.dev') ||
    cleanLink.includes('multiserver.pages.dev')
  ) {
    serverName = 'YUME';
    serverType = 'multi';
  } else if (
    cleanLink.includes('as-cdn21.top') || 
    cleanLink.includes('as-cdn') || 
    cleanLink.includes('vidstream')
  ) {
    serverName = 'VidStream';
  } else if (
    cleanLink.includes('animesalt') ||
    cleanLink.includes('multi-lang-plyr') ||
    cleanLink.includes('player.php?data=')
  ) {
    serverName = 'Abyss';
  } else if (cleanLink.includes('/ani/')) {
    serverName = 'HD-1';
  } else if (cleanLink.includes('/mal/')) {
    serverName = 'HD-2';
  }

  if (cleanLink.includes('/dub') || cleanLink.includes('type=dub')) {
    serverType = 'dub';
  } else if (
    cleanLink.includes('/multi') ||
    cleanLink.includes('multi-lang') ||
    serverName === 'YUME' ||
    serverName === 'Abyss' ||
    serverName === 'VidStream'
  ) {
    serverType = 'multi';
  } else {
    serverType = 'sub';
  }

  return { serverName, serverType };
}

/**
 * Normalizes a single server link object to standard form:
 * - Names: "HD-1", "HD-2", "VidStream", "Abyss", etc.
 * - Types: 'sub' | 'dub' | 'multi'
 * - Non-empty embedLink
 */
export function normalizeServer(s: any): ServerLink | null {
  if (!s) return null;
  const embedLink = String(s.embedLink || s.link || '').trim();
  if (!embedLink) return null;

  let serverName = String(s.serverName || s.name || '').trim();
  let serverType: 'sub' | 'dub' | 'multi' = s.serverType || 'sub';

  // Normalize legacy names
  if (serverName === 'AniList Sub' || serverName === 'AniList') {
    serverName = 'HD-1';
    serverType = 'sub';
  } else if (serverName === 'AniList Dub') {
    serverName = 'HD-1';
    serverType = 'dub';
  } else if (serverName === 'MAL Sub' || serverName === 'MAL') {
    serverName = 'HD-2';
    serverType = 'sub';
  } else if (serverName === 'MAL Dub') {
    serverName = 'HD-2';
    serverType = 'dub';
  } else if (serverName === 'Multi' || serverName === 'MultiServer' || serverName.toLowerCase() === 'multiserver') {
    serverName = 'YUME';
    serverType = 'multi';
  }

  const detected = autoDetectServer(embedLink);

  if (!serverName) {
    serverName = detected.serverName;
  } else if (detected.serverName === 'YUME' && serverName !== 'YUME') {
    serverName = 'YUME';
  }

  // Infer serverType if missing or if server is YUME/VidStream/Abyss (default to multi)
  if (!s.serverType) {
    serverType = detected.serverType;
  } else if (serverName === 'YUME' || serverName === 'VidStream' || serverName === 'Abyss' || detected.serverName === 'YUME' || detected.serverName === 'VidStream' || detected.serverName === 'Abyss') {
    // If not explicitly set to dub, default to multi for YUME, VidStream and Abyss
    if (s.serverType !== 'dub') {
      serverType = 'multi';
    }
  }

  // Modernize legacy multiserver.pages.dev URL to yumestream.pages.dev
  const finalEmbedLink = embedLink.includes('multiserver.pages.dev')
    ? embedLink.replace(/https?:\/\/multiserver\.pages\.dev/g, 'https://yumestream.pages.dev')
    : embedLink;

  return { serverName, embedLink: finalEmbedLink, serverType };
}

/**
 * Takes raw Firestore documents (flat or nested, with possible duplicates)
 * and aggregates them into clean, deduplicated Episode objects grouped by season and episode number.
 */
export function normalizeEpisodes(rawDocs: any[]): Episode[] {
  if (!Array.isArray(rawDocs)) return [];
  const map = new Map<string, Episode>();

  for (const raw of rawDocs) {
    if (!raw) continue;
    const seasonId = String(raw.seasonId || 's1').trim() || 's1';
    const epNum = parseInt(String(raw.episodeNumber), 10);
    if (isNaN(epNum) || epNum <= 0) continue;

    const key = `${seasonId}_${epNum}`;
    let ep = map.get(key);

    if (!ep) {
      ep = {
        id: raw.id || `${raw.animeId || 'anime'}_${seasonId}_${epNum}`,
        animeId: raw.animeId || '',
        seasonId: seasonId,
        episodeNumber: epNum,
        title: raw.title || `Episode ${epNum}`,
        isFiller: Boolean(raw.isFiller),
        servers: [],
        thumbnailUrl: raw.thumbnailUrl || '',
        createdAt: raw.createdAt || Date.now(),
        published: raw.published !== undefined ? raw.published : true,
      };
      map.set(key, ep);
    }

    // Merge servers from array
    if (Array.isArray(raw.servers)) {
      for (const s of raw.servers) {
        const norm = normalizeServer(s);
        if (norm) {
          const exists = ep.servers.some(
            existing => existing.embedLink === norm.embedLink ||
              (existing.serverName === norm.serverName && existing.serverType === norm.serverType && existing.embedLink === norm.embedLink)
          );
          if (!exists) {
            ep.servers.push(norm);
          }
        }
      }
    }

    // Merge flat/legacy server fields if present
    if (raw.embedLink) {
      const norm = normalizeServer({
        serverName: raw.serverName,
        embedLink: raw.embedLink,
        serverType: raw.serverType
      });
      if (norm) {
        const exists = ep.servers.some(
          existing => existing.embedLink === norm.embedLink ||
            (existing.serverName === norm.serverName && existing.serverType === norm.serverType)
        );
        if (!exists) {
          ep.servers.push(norm);
        }
      }
    }

    // Keep highest-quality thumbnail / title
    if (!ep.thumbnailUrl && raw.thumbnailUrl) ep.thumbnailUrl = raw.thumbnailUrl;
    if (raw.title && raw.title !== `Episode ${epNum}` && ep.title === `Episode ${epNum}`) {
      ep.title = raw.title;
    }
    if (raw.isFiller) ep.isFiller = true;
  }

  return Array.from(map.values()).sort((a, b) => a.episodeNumber - b.episodeNumber);
}
