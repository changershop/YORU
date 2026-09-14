import axios from 'axios';
import { formatYearMonthDay } from './normalizers';

export interface AniListAiredInfo {
  startDate: string;
  endDate: string;
  season: string;
  seasonYear?: number;
  aired: string;
}

const LOCAL_STORAGE_KEY = 'anilist_dates_cache_v1';

function getLocalCache(): Record<string, AniListAiredInfo> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalCache(cache: Record<string, AniListAiredInfo>) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // LocalStorage full or private browsing
  }
}

// In-memory runtime cache initialized from localStorage
const inMemoryCache: Map<string, AniListAiredInfo> = new Map();
if (typeof window !== 'undefined') {
  const stored = getLocalCache();
  Object.entries(stored).forEach(([k, v]) => inMemoryCache.set(k, v));
}

/**
 * Returns cached AniList date if already resolved.
 */
export function getCachedAniListAired(aniListId: string | number): AniListAiredInfo | null {
  const key = String(aniListId).trim();
  return inMemoryCache.get(key) || null;
}

/**
 * Batched lookup for AniList IDs.
 * Queries AniList GraphQL for any IDs not already in memory/localStorage cache.
 */
export async function fetchAniListAiredDates(aniListIds: (string | number)[]): Promise<Map<string, AniListAiredInfo>> {
  const result = new Map<string, AniListAiredInfo>();
  const missingIds: number[] = [];

  for (const rawId of aniListIds) {
    const key = String(rawId).trim();
    if (!key) continue;
    const cached = inMemoryCache.get(key);
    if (cached) {
      result.set(key, cached);
    } else {
      const numId = parseInt(key, 10);
      if (!isNaN(numId) && numId > 0 && !missingIds.includes(numId)) {
        missingIds.push(numId);
      }
    }
  }

  if (missingIds.length === 0) {
    return result;
  }

  // Chunk in batches of 50 (AniList limit)
  const CHUNK_SIZE = 50;
  for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
    const chunk = missingIds.slice(i, i + CHUNK_SIZE);
    try {
      const query = `
        query ($ids: [Int]) {
          Page(page: 1, perPage: 50) {
            media(id_in: $ids, type: ANIME) {
              id
              startDate { year month day }
              endDate { year month day }
              season
              seasonYear
            }
          }
        }
      `;

      const res = await axios.post(
        'https://graphql.anilist.co',
        { query, variables: { ids: chunk } },
        { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
      );

      const mediaList = res.data?.data?.Page?.media;
      if (Array.isArray(mediaList)) {
        const stored = getLocalCache();
        for (const item of mediaList) {
          const idKey = String(item.id);
          const start = formatYearMonthDay(item.startDate);
          const end = formatYearMonthDay(item.endDate);

          let seasonName = '';
          if (item.season && item.seasonYear) {
            const capitalized = item.season.charAt(0).toUpperCase() + item.season.slice(1).toLowerCase();
            seasonName = `${capitalized} ${item.seasonYear}`;
          } else if (item.seasonYear) {
            seasonName = String(item.seasonYear);
          }

          let aired = '';
          if (start && end && start !== end) {
            aired = `${start} to ${end}`;
          } else if (start) {
            aired = start;
          } else if (seasonName) {
            aired = seasonName;
          }

          const info: AniListAiredInfo = {
            startDate: start,
            endDate: end,
            season: seasonName,
            seasonYear: item.seasonYear || undefined,
            aired
          };

          inMemoryCache.set(idKey, info);
          stored[idKey] = info;
          result.set(idKey, info);
        }
        saveLocalCache(stored);
      }
    } catch (e) {
      // In case of AniList rate limit or network issue, continue gracefully
      console.warn('AniList batch date fetch error:', e);
    }
  }

  return result;
}
