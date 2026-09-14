import { Anime, Episode, ServerLink, Season, LinkedSeason } from '../types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

/**
 * Parses any date representation into an exact millisecond timestamp.
 * Returns null if no valid date could be extracted.
 * Strictly avoids falling back to current time, DB creation time, or sync time.
 */
export function parseDateToTimestamp(rawDate: any): number | null {
  if (!rawDate) return null;

  // 1. If it's already a numeric timestamp
  if (typeof rawDate === 'number') {
    if (isNaN(rawDate) || rawDate <= 0) return null;
    // Check if seconds instead of ms
    if (rawDate < 10000000000) return rawDate * 1000;
    return rawDate;
  }

  // 2. If it's an object with year, month, day (e.g. AniList GraphQL format)
  if (typeof rawDate === 'object') {
    const y = Number(rawDate.year);
    if (!y || isNaN(y) || y < 1950 || y > 2050) return null;
    const m = Math.max(0, Math.min(11, (Number(rawDate.month) || 1) - 1));
    const d = Math.max(1, Math.min(31, Number(rawDate.day) || 1));
    return new Date(y, m, d).getTime();
  }

  if (typeof rawDate !== 'string') return null;
  const str = rawDate.trim();
  if (!str) return null;

  // 3. Check for standard ISO / parseable date string (e.g. "2023-09-29", "Sep 29, 2023")
  const directParsed = Date.parse(str);
  if (!isNaN(directParsed) && directParsed > 0) {
    return directParsed;
  }

  // 4. Match "Month Day, Year" or "Month Year" (e.g. "Sep 29, 2023" or "Sep 2023")
  const mdyMatch = str.match(/([A-Za-z]+)\s+(\d{1,2})?,?\s*(\d{4})/);
  if (mdyMatch) {
    const monthStr = mdyMatch[1].toLowerCase();
    const month = MONTH_MAP[monthStr];
    const day = mdyMatch[2] ? parseInt(mdyMatch[2], 10) : 1;
    const year = parseInt(mdyMatch[3], 10);
    if (month !== undefined && year >= 1950 && year <= 2050) {
      return new Date(year, month, Math.max(1, day)).getTime();
    }
  }

  // 5. Match Season + Year (e.g. "Fall 2023", "Spring 2024", "Winter 2021")
  const seasonMatch = str.match(/\b(winter|spring|summer|fall|autumn)\s*(\d{4})\b/i);
  if (seasonMatch) {
    const s = seasonMatch[1].toLowerCase();
    const y = parseInt(seasonMatch[2], 10);
    const month = s.includes('fall') || s.includes('autumn') ? 9 : s.includes('summer') ? 6 : s.includes('spring') ? 3 : 0;
    return new Date(y, month, 1).getTime();
  }

  // 6. Match isolated 4-digit Year (e.g. "2023")
  const yearMatch = str.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    return new Date(y, 0, 1).getTime();
  }

  return null;
}

/**
 * Returns canonical start/release timestamp of an anime.
 * Strictly uses official aired dates (aired_from, startDate, aired, season, seasonYear).
 * NEVER returns updatedAt, createdAt, or Date.now().
 */
export function getCanonicalReleaseTimestamp(anime: Partial<Anime> | null | undefined): number | null {
  if (!anime) return null;

  // 1. Primary: aired_from
  if (anime.aired_from) {
    const ts = parseDateToTimestamp(anime.aired_from);
    if (ts !== null) return ts;
  }

  // 2. startDate
  if (anime.startDate) {
    // If it's a range like "Sep 29, 2023 to Mar 22, 2024", take the first part
    const startPart = anime.startDate.split(/\s+to\s+|\s*-\s*/i)[0];
    const ts = parseDateToTimestamp(startPart);
    if (ts !== null) return ts;
  }

  // 3. aired string (often contains "Sep 29, 2023 to Mar 22, 2024")
  if (anime.aired) {
    const startPart = anime.aired.split(/\s+to\s+|\s*-\s*/i)[0];
    const ts = parseDateToTimestamp(startPart);
    if (ts !== null) return ts;
  }

  // 4. premiered / season (e.g. "Fall 2023")
  if (anime.premiered) {
    const ts = parseDateToTimestamp(anime.premiered);
    if (ts !== null) return ts;
  }
  if (anime.season) {
    const ts = parseDateToTimestamp(anime.season);
    if (ts !== null) return ts;
  }

  // 5. seasonYear
  if (anime.seasonYear && typeof anime.seasonYear === 'number' && anime.seasonYear >= 1950) {
    return new Date(anime.seasonYear, 0, 1).getTime();
  }

  return null;
}

/**
 * Returns canonical end timestamp of an anime.
 */
export function getCanonicalEndTimestamp(anime: Partial<Anime> | null | undefined): number | null {
  if (!anime) return null;

  // 1. Primary: aired_to
  if (anime.aired_to) {
    const ts = parseDateToTimestamp(anime.aired_to);
    if (ts !== null) return ts;
  }

  // 2. endDate
  if (anime.endDate) {
    const endPart = anime.endDate.split(/\s+to\s+|\s*-\s*/i).pop();
    const ts = parseDateToTimestamp(endPart);
    if (ts !== null) return ts;
  }

  // 3. aired string (end part)
  if (anime.aired && (anime.aired.includes(' to ') || anime.aired.includes(' - '))) {
    const parts = anime.aired.split(/\s+to\s+|\s*-\s*/i);
    if (parts.length > 1) {
      const ts = parseDateToTimestamp(parts[parts.length - 1]);
      if (ts !== null) return ts;
    }
  }

  return getCanonicalReleaseTimestamp(anime);
}

/**
 * Formats a clean date string from year, month, day components
 */
export function formatYearMonthDay(date: { year?: number; month?: number; day?: number } | null | undefined): string {
  if (!date || !date.year) return '';
  if (date.month && date.day) {
    return `${MONTH_NAMES[date.month - 1]} ${date.day}, ${date.year}`;
  }
  if (date.month) {
    return `${MONTH_NAMES[date.month - 1]} ${date.year}`;
  }
  return String(date.year);
}

/**
 * Clean display string for an anime's Aired field
 */
export function formatAiredDisplay(anime: Partial<Anime> | null | undefined): string {
  if (!anime) return '-';
  if (anime.aired_text && anime.aired_text.trim()) return anime.aired_text.trim();
  if (anime.aired && anime.aired.trim()) return anime.aired.trim();

  const start = anime.startDate?.trim() || (anime.aired_from ? String(anime.aired_from).trim() : '');
  const end = anime.endDate?.trim() || (anime.aired_to ? String(anime.aired_to).trim() : '');

  if (start && end && start !== end) {
    return `${start} to ${end}`;
  }
  if (start) {
    return start;
  }
  if (anime.premiered && anime.premiered.trim()) {
    return anime.premiered.trim();
  }
  if (anime.season && anime.season.trim() && anime.season !== 'UNKNOWN' && anime.season !== '1') {
    return anime.season.trim();
  }
  return '-';
}

/**
 * Normalizes a server link object.
 */
export function normalizeServer(raw: any): ServerLink | null {
  if (!raw) return null;
  const rawLink = String(raw.embedLink || raw.link || '').trim();
  if (!rawLink) return null;

  // Modernize legacy URLs
  let embedLink = rawLink;
  if (embedLink.includes('multiserver.pages.dev')) {
    embedLink = embedLink.replace(/https?:\/\/multiserver\.pages\.dev/g, 'https://yumestream.pages.dev');
  }

  let serverName = String(raw.serverName || raw.name || '').trim();
  let serverType: 'sub' | 'dub' | 'multi' = raw.serverType || 'sub';

  const lowerLink = embedLink.toLowerCase();

  // Detect server name & type if not explicitly supplied
  if (lowerLink.includes('yumestream.pages.dev')) {
    serverName = 'YUME';
    serverType = 'multi';
  } else if (lowerLink.includes('as-cdn') || lowerLink.includes('vidstream')) {
    serverName = serverName || 'VidStream';
    serverType = lowerLink.includes('dub') ? 'dub' : 'multi';
  } else if (lowerLink.includes('animesalt') || lowerLink.includes('multi-lang') || lowerLink.includes('player.php?data=')) {
    serverName = serverName || 'Abyss';
    serverType = lowerLink.includes('dub') ? 'dub' : 'multi';
  } else if (lowerLink.includes('/ani/') || lowerLink.includes('megaplay.buzz/stream/ani/')) {
    serverName = 'HD-1';
    serverType = lowerLink.includes('/dub') ? 'dub' : 'sub';
  } else if (lowerLink.includes('/mal/') || lowerLink.includes('megaplay.buzz/stream/mal/')) {
    serverName = 'HD-2';
    serverType = lowerLink.includes('/dub') ? 'dub' : 'sub';
  }

  // Standardize legacy server names
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
  } else if (serverName.toLowerCase() === 'multi' || serverName.toLowerCase() === 'multiserver') {
    serverName = 'YUME';
    serverType = 'multi';
  }

  if (!serverName) serverName = 'HD-1';

  return { serverName, embedLink, serverType };
}

/**
 * Normalizes an Episode document/payload into a clean, lightweight Episode object.
 * Discards any nested, duplicate Anime metadata that may have been sent by legacy servers.
 */
export function normalizeEpisode(raw: any, defaultAnimeId = ''): Episode | null {
  if (!raw) return null;

  const epNum = parseInt(String(raw.episodeNumber ?? raw.episode_number ?? raw.number), 10);
  if (isNaN(epNum) || epNum <= 0) return null;

  const animeId = String(raw.animeId || raw.anime_id || defaultAnimeId || '').trim();
  const seasonId = String(raw.seasonId || raw.season_id || 's1').trim() || 's1';
  const id = String(raw.id || `${animeId || 'anime'}_${seasonId}_${epNum}`);

  const servers: ServerLink[] = [];

  // Parse servers array
  if (Array.isArray(raw.servers)) {
    for (const s of raw.servers) {
      const norm = normalizeServer(s);
      if (norm) {
        const exists = servers.some(
          ex => ex.embedLink === norm.embedLink ||
            (ex.serverName === norm.serverName && ex.serverType === norm.serverType && ex.embedLink === norm.embedLink)
        );
        if (!exists) servers.push(norm);
      }
    }
  }

  // Parse flat/legacy single server fields
  if (raw.embedLink || raw.embed_url || raw.link) {
    const norm = normalizeServer({
      serverName: raw.serverName || raw.server_name,
      serverType: raw.serverType || raw.server_type,
      embedLink: raw.embedLink || raw.embed_url || raw.link
    });
    if (norm) {
      const exists = servers.some(
        ex => ex.embedLink === norm.embedLink ||
          (ex.serverName === norm.serverName && ex.serverType === norm.serverType)
      );
      if (!exists) servers.push(norm);
    }
  }

  return {
    id,
    animeId,
    seasonId,
    episodeNumber: epNum,
    title: raw.title || `Episode ${epNum}`,
    isFiller: Boolean(raw.isFiller ?? raw.is_filler),
    servers,
    thumbnailUrl: raw.thumbnailUrl || raw.thumbnail_url || raw.coverImage || raw.cover_image || '',
    createdAt: Number(raw.createdAt || raw.created_at) || Date.now(),
    published: raw.published !== undefined ? Boolean(raw.published) : true,
    airDate: raw.airDate || raw.air_date || raw.aired_at ? String(raw.airDate || raw.air_date || raw.aired_at) : undefined,
    duration: raw.duration ? String(raw.duration) : undefined
  };
}

/**
 * Normalizes an Anime document/payload into a clean, complete Anime object.
 * Handles both camelCase and snake_case properties from Firestore or API backends.
 */
export function normalizeAnime(raw: any): Anime {
  if (!raw) {
    throw new Error('normalizeAnime received null or undefined');
  }

  const id = String(raw.id || raw.anime_id || raw._id || '').trim();
  const aniListId = raw.aniListId || raw.anilist_id || raw.id_anilist || undefined;
  const malId = raw.malId || raw.mal_id || raw.id_mal || undefined;

  const rawTitle = raw.title;
  let title = '';
  let nativeTitle = '';
  let englishTitle = raw.englishTitle || raw.english_title || undefined;
  let romajiTitle = raw.romajiTitle || raw.romaji_title || undefined;

  if (typeof rawTitle === 'object' && rawTitle !== null) {
    title = rawTitle.english || rawTitle.romaji || rawTitle.native || `Anime ${id}`;
    nativeTitle = rawTitle.native || rawTitle.romaji || '';
    englishTitle = englishTitle || rawTitle.english;
    romajiTitle = romajiTitle || rawTitle.romaji;
  } else {
    title = String(rawTitle || raw.name || `Anime ${id}`);
    nativeTitle = String(raw.nativeTitle || raw.native_title || raw.japanese || '');
  }

  const slug = String(raw.slug || '').trim() ||
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') ||
    id;

  const format = String(raw.format || raw.type || 'TV').toUpperCase();
  const totalEpisodes = Number(raw.totalEpisodes ?? raw.total_episodes ?? raw.episodes_count ?? raw.episodes ?? 0);
  const status = String(raw.status || 'Finished');

  // Dates & Aired information
  let startDate = String(raw.startDate || raw.start_date || raw.aired_from || '').trim();
  let endDate = String(raw.endDate || raw.end_date || raw.aired_to || '').trim();
  const aired = raw.aired || raw.aired_text || undefined;
  const premiered = raw.premiered || undefined;

  // Extract start and end dates from aired string if not already present
  if ((!startDate || startDate === '2026') && aired) {
    const parts = String(aired).split(/\s+to\s+|\s*-\s*/i);
    if (parts[0] && parts[0].trim()) startDate = parts[0].trim();
    if (parts[1] && parts[1].trim() && !endDate) endDate = parts[1].trim();
  }

  let season = String(raw.season || raw.season_name || premiered || '').trim();
  if (season === 'UNKNOWN') season = '';

  // Clean synopsis
  let synopsis = String(raw.synopsis || raw.description || '').trim();
  if (synopsis.includes('<') && synopsis.includes('>')) {
    synopsis = synopsis.replace(/<[^>]*>?/gm, '').trim();
  }

  // Images
  const poster = String(raw.poster || raw.coverImage || raw.cover_image || raw.image || '').trim();
  const backdrop = String(raw.backdrop || raw.bannerImage || raw.banner_image || raw.backdrop_image || poster).trim();

  // Seasons and linked seasons
  let seasons: Season[] = [];
  if (Array.isArray(raw.seasons) && raw.seasons.length > 0) {
    seasons = raw.seasons;
  } else {
    seasons = [{ id: 's1', name: 'Season 1', order: 1 }];
  }

  let linkedSeasons: LinkedSeason[] = [];
  if (Array.isArray(raw.linkedSeasons)) {
    linkedSeasons = raw.linkedSeasons;
  }

  // Genres
  let genres: string[] = [];
  if (Array.isArray(raw.genres)) {
    genres = raw.genres.filter(g => typeof g === 'string' && g.trim());
  } else if (typeof raw.genres === 'string') {
    genres = raw.genres.split(',').map((g: string) => g.trim()).filter(Boolean);
  }
  if (genres.length === 0) genres = ['Anime'];

  // Studios
  let studios = '';
  if (Array.isArray(raw.studios)) {
    studios = raw.studios.join(', ');
  } else if (typeof raw.studios === 'string') {
    studios = raw.studios;
  }

  return {
    id,
    aniListId: aniListId ? String(aniListId) : undefined,
    malId: malId ? String(malId) : undefined,
    title,
    nativeTitle,
    englishTitle,
    romajiTitle,
    japanese: raw.japanese || nativeTitle || undefined,
    synonyms: raw.synonyms,
    slug,
    format,
    totalEpisodes,
    episodeDuration: String(raw.episodeDuration || raw.duration || '24 mins'),
    status,
    startDate,
    endDate,
    aired_from: raw.aired_from || startDate || undefined,
    aired_to: raw.aired_to || endDate || undefined,
    aired_status: raw.aired_status || status || undefined,
    aired_text: raw.aired_text || aired || undefined,
    aired: aired || (startDate && endDate && startDate !== endDate ? `${startDate} to ${endDate}` : startDate || undefined),
    premiered: premiered || (season ? season : undefined),
    season: season || '1',
    seasonYear: raw.seasonYear || raw.season_year ? Number(raw.seasonYear || raw.season_year) : undefined,
    averageScore: String(raw.averageScore || raw.score || raw.malScore || '85%'),
    malScore: raw.malScore || raw.mal_score || undefined,
    studios,
    genres,
    poster,
    backdrop,
    synopsis,
    seasons,
    seasonGroupId: raw.seasonGroupId || raw.group_id || undefined,
    seasonNumber: raw.seasonNumber ? Number(raw.seasonNumber) : undefined,
    linkedSeasons,
    subEpisodesCount: raw.subEpisodesCount !== undefined ? Number(raw.subEpisodesCount) : undefined,
    dubEpisodesCount: raw.dubEpisodesCount !== undefined ? Number(raw.dubEpisodesCount) : undefined,
    multiEpisodesCount: raw.multiEpisodesCount !== undefined ? Number(raw.multiEpisodesCount) : undefined,
    isAdult: Boolean(raw.isAdult || raw.is18Plus),
    is18Plus: Boolean(raw.isAdult || raw.is18Plus),
    country: raw.country || undefined,
    source: raw.source || undefined,
    episodes: totalEpisodes,
    franchiseGroupId: raw.franchiseGroupId || undefined,
    franchiseGroupName: raw.franchiseGroupName || undefined,
    franchiseWatchOrder: raw.franchiseWatchOrder || undefined,
    recentlyAddedAt: raw.recentlyAddedAt ? Number(raw.recentlyAddedAt) : undefined,
    createdAt: Number(raw.createdAt || raw.created_at) || Date.now(),
    updatedAt: Number(raw.updatedAt || raw.updated_at) || Date.now(),
    published: raw.published !== undefined ? Boolean(raw.published) : true,
    isBanned: Boolean(raw.isBanned)
  };
}
