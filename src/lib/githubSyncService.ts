import { collection, doc, setDoc, query, where, getDocs, updateDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { handleEmbedSync } from './syncService';
import axios from 'axios';

export interface GitHubSyncSettings {
  token?: string;
  repoOwner: string; // e.g. "Simoon66"
  repoName: string; // e.g. "multiserver"
  branch?: string; // default "main"
  filePath?: string; // default e.g. "data.json" or logs or search root
  lastSyncedAt?: number;
  autoSyncEnabled?: boolean;
}

const GITHUB_SYNC_DOC_ID = 'github_multiserver_sync';
const LOCAL_STORAGE_KEY = 'yoru_github_sync_settings';

export const DEFAULT_GITHUB_TOKEN = '';

export async function getGitHubSyncSettings(): Promise<GitHubSyncSettings> {
  let localData: Partial<GitHubSyncSettings> = {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) localData = JSON.parse(raw);
  } catch (e) {
    // Ignore local storage error
  }

  try {
    const docRef = doc(db, 'settings', GITHUB_SYNC_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as GitHubSyncSettings;
      return {
        token: data.token || '',
        repoOwner: data.repoOwner || 'Simoon66',
        repoName: data.repoName || 'multiserver',
        branch: data.branch || 'main',
        filePath: data.filePath || '',
        autoSyncEnabled: !!data.autoSyncEnabled,
        ...localData
      };
    }
  } catch (err) {
    console.warn("Could not fetch github sync settings from db:", err);
  }

  return {
    token: '',
    repoOwner: 'Simoon66',
    repoName: 'multiserver',
    branch: 'main',
    filePath: '',
    autoSyncEnabled: false,
    ...localData
  };
}

export async function saveGitHubSyncSettings(settings: Partial<GitHubSyncSettings>): Promise<void> {
  try {
    const current = await getGitHubSyncSettings();
    const merged = { ...current, ...settings, updatedAt: Date.now() };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    // Ignore
  }

  try {
    const docRef = doc(db, 'settings', GITHUB_SYNC_DOC_ID);
    await setDoc(docRef, {
      ...settings,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.warn("Could not persist to Firestore settings collection:", err);
  }
}

export interface GitHubFileItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url?: string;
  size?: number;
}

/**
 * Fetch files or directories from Simoon66/multiserver repo via GitHub API
 */
export async function fetchGitHubRepoContents(
  owner = 'Simoon66',
  repo = 'multiserver',
  path = '',
  token?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const cleanPath = path.replace(/^\/+/, '');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Yoru-Streaming-App'
    };
    if (token && token.trim()) {
      headers['Authorization'] = `token ${token.trim()}`;
    }

    const res = await axios.get(url, { headers, timeout: 10000 });
    return { success: true, data: res.data };
  } catch (err: any) {
    const errorMsg = err.response?.data?.message || err.message || 'Failed to fetch repo';
    return { success: false, error: errorMsg };
  }
}

/**
 * Parses raw file content or JSON from GitHub and executes sync for all items
 */
export async function syncFromGitHubData(
  jsonData: any, 
  customDomain = 'https://yumestream.pages.dev'
): Promise<{ total: number; synced: number; failed: number; results: any[] }> {
  const results: any[] = [];
  let total = 0;
  let synced = 0;
  let failed = 0;

  // If payload is an array of anime/episode items
  const items: any[] = Array.isArray(jsonData) 
    ? jsonData 
    : (jsonData.animes || jsonData.episodes || jsonData.data || [jsonData]);

  for (const item of items) {
    const anilistId = item.anilistId || item.id || item.aniId || item.mediaId;
    if (!anilistId) continue;

    const episodes = item.episodes || (item.episodeNumber ? [item.episodeNumber] : [1]);
    const episodeList = Array.isArray(episodes) ? episodes : [Number(episodes)];

    for (const ep of episodeList) {
      total++;
      const epNum = typeof ep === 'object' ? (ep.number || ep.episode || 1) : Number(ep);
      const embedUrl = (typeof ep === 'object' && ep.embedUrl) 
        ? ep.embedUrl 
        : `${customDomain.replace(/\/+$/, '')}/${anilistId}/${epNum}`;

      try {
        const syncRes = await handleEmbedSync({
          anilistId: Number(anilistId),
          episodeNumber: epNum,
          embedUrl: embedUrl,
          serverName: item.serverName || 'YUME',
          serverType: 'multi',
          customTitle: item.title
        });

        if (syncRes.success) {
          synced++;
        } else {
          failed++;
        }
        results.push(syncRes);
      } catch (err: any) {
        failed++;
        results.push({
          success: false,
          anilistId,
          episodeNumber: epNum,
          message: err.message
        });
      }
    }
  }

  // Update last synced time
  await saveGitHubSyncSettings({ lastSyncedAt: Date.now() });

  return { total, synced, failed, results };
}
