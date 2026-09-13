import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface ServerConfig {
  abyssBaseDomain: string;
  dynamicOverrideEnabled: boolean;
  lastUpdated?: number;
  lastMigratedFrom?: string;
  lastMigratedTo?: string;
  lastMigratedCount?: number;
}

const SETTINGS_DOC_ID = 'server_config';

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  abyssBaseDomain: 'https://animesalt.link',
  dynamicOverrideEnabled: true,
};

let cachedConfig: ServerConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute client cache

/**
 * Fetch server configuration from Firestore (cached for 1 minute)
 */
export async function getServerConfig(forceFresh = false): Promise<ServerConfig> {
  const now = Date.now();
  if (!forceFresh && cachedConfig && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      cachedConfig = { ...DEFAULT_SERVER_CONFIG, ...(snap.data() as Partial<ServerConfig>) };
    } else {
      cachedConfig = DEFAULT_SERVER_CONFIG;
    }
  } catch (err) {
    console.warn('Could not fetch server settings from Firestore, using default/cached config:', err);
    if (!cachedConfig) cachedConfig = DEFAULT_SERVER_CONFIG;
  }

  lastFetchTime = now;
  return cachedConfig;
}

/**
 * Save server configuration to Firestore
 */
export async function saveServerConfig(config: Partial<ServerConfig>): Promise<void> {
  const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
  const updated: ServerConfig = {
    ...(cachedConfig || DEFAULT_SERVER_CONFIG),
    ...config,
    lastUpdated: Date.now(),
  };

  await setDoc(docRef, updated, { merge: true });
  cachedConfig = updated;
  lastFetchTime = Date.now();
}

/**
 * Normalizes a base URL/domain by ensuring protocol and stripping trailing slashes.
 * e.g. "animesalt.link/" -> "https://animesalt.link"
 */
export function normalizeBaseDomain(input: string): string {
  let clean = input.trim();
  if (!clean) return '';
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `https://${clean}`;
  }
  return clean.replace(/\/+$/, '');
}

/**
 * Dynamically rewrites AnimeSalt/Abyss and YUME/MultiServer embed URLs on the fly.
 */
export function applyDynamicDomainOverride(
  embedLink: string,
  config?: ServerConfig | null
): string {
  if (!embedLink || typeof embedLink !== 'string') return embedLink;

  let trimmed = embedLink.trim();

  // MultiServer -> YUME Stream migration (https://yumestream.pages.dev/{id}/{episode})
  if (trimmed.includes('multiserver.pages.dev')) {
    trimmed = trimmed.replace(/https?:\/\/multiserver\.pages\.dev/g, 'https://yumestream.pages.dev');
  }

  const conf = config || cachedConfig;
  if (!conf || !conf.dynamicOverrideEnabled || !conf.abyssBaseDomain) {
    return trimmed;
  }

  const cleanTargetBase = conf.abyssBaseDomain.replace(/\/+$/, '');

  // Check if link is an Abyss/AnimeSalt/multi-lang-plyr link
  const isAbyssLink =
    trimmed.includes('animesalt.') ||
    trimmed.includes('/multi-lang-plyr/') ||
    trimmed.includes('player.php?data=');

  if (!isAbyssLink) return embedLink;

  try {
    // If it's a full URL, rewrite the origin
    const urlObj = new URL(trimmed);
    const targetObj = new URL(cleanTargetBase);

    // Only rewrite if host differs or if it's an anime salt domain
    if (urlObj.hostname.includes('animesalt') || trimmed.includes('/multi-lang-plyr/')) {
      urlObj.protocol = targetObj.protocol;
      urlObj.host = targetObj.host;
      urlObj.port = targetObj.port;
      return urlObj.toString();
    }
  } catch {
    // Fallback regex replacement for non-standard or relative formats
    return trimmed.replace(
      /^https?:\/\/[^\/]+/i,
      cleanTargetBase
    );
  }

  return embedLink;
}
