import express from "express";
import path from "path";
import axios from "axios";
import { createServer as createViteServer } from "vite";
import { handleEmbedSync, verifySecretKey } from "./src/lib/syncService";
import { runAnikotoRecentSync, getAnikotoSyncSettings, saveAnikotoSyncSettings } from "./src/lib/anikotoSyncService";
import { fetchMultiServerDataset } from "./src/lib/multiServerService";
import {
  runYumeIncrementalSync,
  getYumeSyncSettings,
  saveYumeSyncSettings,
  resetYumeSyncCursor,
  checkYumeSyncStatus
} from "./src/lib/yumeSyncService";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Embed Manager Webhook / Sync API
  const handleSyncRequest = async (req: express.Request, res: express.Response) => {
    try {
      const apiKey = req.headers["x-sync-key"] || req.headers["x-api-key"] || req.query.key || req.body?.secretKey;
      
      // Verify authorization
      if (!verifySecretKey(apiKey as string)) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized: Invalid or missing API key (provide 'x-sync-key' or 'x-api-key' header)"
        });
      }

      const payload = req.body;
      if (!payload || (!payload.anilistId && !payload.id)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request: 'anilistId' is required in JSON payload"
        });
      }

      const syncResult = await handleEmbedSync({
        eventId: payload.eventId || req.headers["x-event-id"] as string,
        anilistId: payload.anilistId || payload.id,
        episodeNumber: payload.episodeNumber || payload.episode,
        embedUrl: payload.embedUrl || payload.url || payload.link,
        serverName: payload.serverName || "MultiServer",
        serverType: payload.serverType || "multi",
        action: payload.action || "sync_episode",
        customTitle: payload.customTitle || payload.title
      });

      return res.status(syncResult.success ? 200 : 400).json(syncResult);
    } catch (error: any) {
      console.error("Embed sync error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Internal server error during sync"
      });
    }
  };

  // Webhook / Ingest listeners for MultiServer Manager
  app.post("/api/sync-manager", handleSyncRequest);
  app.post("/api/webhook/sync-manager", handleSyncRequest);
  app.post("/api/sync/dispatch", handleSyncRequest);

  // MultiServer Manager Direct Sync Connectors
  app.get(["/api/manager/sync/full", "/api/multiserver/set"], async (req, res) => {
    try {
      const dataset = await fetchMultiServerDataset(true);
      return res.json({
        status: "success",
        source: "https://multiserver.pages.dev/set",
        totalAnime: dataset.anime.length,
        anime: dataset.anime,
        episodes: dataset.episodesByAnimeId,
        franchises: dataset.franchises,
        updatedAt: dataset.timestamp
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Failed to contact MultiServer Manager" });
    }
  });

  app.get("/api/manager/sync/events", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"] || req.query.key || "mse_sync_secret_key_2026";
      const managerUrl = "https://multiserver.pages.dev/api/sync/events";

      const response = await axios.get(managerUrl, {
        headers: { "x-api-key": apiKey as string, "Accept": "application/json" },
        timeout: 15000,
        validateStatus: () => true
      });

      return res.status(response.status).json(response.data);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Failed to contact MultiServer Manager events" });
    }
  });

  app.post("/api/manager/sync/retry/:eventId", async (req, res) => {
    try {
      const { eventId } = req.params;
      const apiKey = req.headers["x-api-key"] || "mse_sync_secret_key_2026";
      const managerUrl = `https://multiserver.pages.dev/api/sync/retry/${eventId}`;

      const response = await axios.post(managerUrl, req.body, {
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        timeout: 15000,
        validateStatus: () => true
      });

      return res.status(response.status).json(response.data);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Failed to retry event" });
    }
  });

  // GitHub Repo fetch & sync endpoint
  app.post("/api/github/fetch-repo", async (req, res) => {
    try {
      const { owner = "Simoon66", repo = "multiserver", path = "", token } = req.body;
      const cleanPath = path.replace(/^\/+/, '');
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;

      const activeToken = token && token.trim() 
        ? token.trim() 
        : (process.env.GITHUB_TOKEN || '');

      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Yoru-Streaming-App'
      };
      if (activeToken) {
        headers['Authorization'] = `token ${activeToken}`;
      }

      const ghRes = await axios.get(url, { headers, timeout: 12000 });
      return res.json({ success: true, data: ghRes.data });
    } catch (err: any) {
      const status = err.response?.status;
      const ghMsg = err.response?.data?.message || err.message;
      let friendlyError = ghMsg || "Failed to fetch from GitHub repository";

      if (status === 404) {
        friendlyError = "Repository not found or Private. If 'Simoon66/multiserver' is private, please provide a valid GitHub Personal Access Token (PAT).";
      } else if (status === 401) {
        friendlyError = "Invalid GitHub Token. Please check that your Personal Access Token has 'repo' scope permissions.";
      } else if (status === 403) {
        friendlyError = "GitHub API rate limit exceeded or access forbidden. Please provide a GitHub Personal Access Token.";
      }

      console.warn(`GitHub fetch warning (${status || 500}):`, friendlyError);
      return res.status(status || 500).json({
        success: false,
        error: friendlyError
      });
    }
  });

  app.get("/api/sync-manager/status", (req, res) => {
    res.json({
      status: "online",
      endpoint: "/api/sync-manager",
      supportedServers: ["YUME", "HD-1", "HD-2"],
      format: "https://yumestream.pages.dev/{anilist/mal id}/{episode}"
    });
  });

  app.post("/api/verify-link", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      // Simulate browser request to avoid basic blocking
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Referer": "https://megaplay.buzz/"
        },
        timeout: 8000,
        validateStatus: (status) => true, // Don't throw on 4xx/5xx
      });

      if (response.status === 404) {
        return res.json({ status: "dead", reason: "Status 404" });
      }

      const html = response.data.toString();
      const lowerHtml = html.toLowerCase();
      const errorStrings = [
        "oops! something went wrong",
        "error code: 404",
        "error code: 410",
        "error code:",
        "error - megaplay",
        "error-container"
      ];

      for (const errStr of errorStrings) {
        if (lowerHtml.includes(errStr)) {
          return res.json({ status: "dead", reason: `Found string: ${errStr}` });
        }
      }

      return res.json({ status: "alive" });
    } catch (error: any) {
      return res.json({ status: "dead", reason: error.message });
    }
  });

  // YUME / MultiServer Proxy API Routes
  const handleYumeProxy = async (req: any, res: any) => {
    try {
      const allParam = (req.params as any).all;
      let targetPath = Array.isArray(allParam) ? allParam.join('/') : (allParam || req.params[0] || '');
      if (typeof targetPath === 'string' && targetPath.startsWith('/')) {
        targetPath = targetPath.substring(1);
      }
      const baseRemote = process.env.YUME_API_URL ? process.env.YUME_API_URL.replace(/\/$/, '') : 'https://yumestream.pages.dev';
      const targetUrl = new URL(baseRemote.endsWith('/api') ? `${baseRemote}/${targetPath}` : `${baseRemote}/api/${targetPath}`);
      for (const [key, value] of Object.entries(req.query)) {
        targetUrl.searchParams.append(key, String(value));
      }
      console.log(`[YUME Proxy] Fetching: ${targetUrl.toString()}`);
      
      let response: Response;
      try {
        response = await fetch(targetUrl.toString());
      } catch (fetchErr) {
        // Fallback to legacy domain if yumestream isn't responding
        const fallbackBase = 'https://multiserver.pages.dev';
        const fallbackUrl = new URL(fallbackBase.endsWith('/api') ? `${fallbackBase}/${targetPath}` : `${fallbackBase}/api/${targetPath}`);
        for (const [key, value] of Object.entries(req.query)) {
          fallbackUrl.searchParams.append(key, String(value));
        }
        console.log(`[YUME Proxy] Fallback fetching: ${fallbackUrl.toString()}`);
        response = await fetch(fallbackUrl.toString());
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        return res.json(data);
      } else {
        const text = await response.text();
        return res.status(response.status).send(text);
      }
    } catch (err: any) {
      console.error("[YUME Proxy] Error:", err);
      res.status(500).json({ error: "YUME proxy failed", details: err.message });
    }
  };

  app.get("/api/yume/proxy/*all", handleYumeProxy);
  app.get("/api/multiserver/proxy/*all", handleYumeProxy);

  app.get("/api/anikoto/proxy/*all", async (req, res) => {
    try {
      const allParam = (req.params as any).all;
      let targetPath = Array.isArray(allParam) ? allParam.join('/') : (allParam || req.params[0] || '');
      
      if (typeof targetPath === 'string' && targetPath.startsWith('/')) {
        targetPath = targetPath.substring(1);
      }
      
      const targetUrl = new URL(`https://anikotoapi.site/${targetPath}`);
      for (const [key, value] of Object.entries(req.query)) {
        targetUrl.searchParams.append(key, String(value));
      }
      console.log(`[Proxy] Fetching: ${targetUrl.toString()}`);
      
      const response = await fetch(targetUrl.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'curl/7.88.1',
        },
      });
      
      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: 'API Error', data });
      }
      res.json(data);
    } catch (err: any) {
      console.error(`[Proxy Error] ${err.message} for ${req.url}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Anikoto Auto-Sync State
  let isAnikotoSyncing = false;

  app.get("/api/anikoto/status", async (req, res) => {
    try {
      const settings = await getAnikotoSyncSettings();
      return res.json({
        success: true,
        isSyncInProgress: isAnikotoSyncing,
        settings
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/anikoto/settings", async (req, res) => {
    try {
      const { autoSyncEnabled, intervalMinutes } = req.body;
      const updateData: any = {};
      if (typeof autoSyncEnabled === 'boolean') updateData.autoSyncEnabled = autoSyncEnabled;
      if (typeof intervalMinutes === 'number') updateData.intervalMinutes = intervalMinutes;

      await saveAnikotoSyncSettings(updateData);
      const settings = await getAnikotoSyncSettings();
      return res.json({ success: true, settings });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/anikoto/sync-now", async (req, res) => {
    if (isAnikotoSyncing) {
      return res.status(409).json({
        success: false,
        message: "A sync process is already running. Please wait for it to complete."
      });
    }

    try {
      isAnikotoSyncing = true;
      const page = Number(req.query.page) || 1;
      const perPage = req.query.perPage !== undefined ? Number(req.query.perPage) : 0;
      console.log(`[Anikoto Sync] Starting manual sync (Page ${page}, Limit ${perPage === 0 ? 'Unlimited' : perPage})...`);
      const result = await runAnikotoRecentSync({
        page,
        perPage,
        unlimited: perPage === 0,
        onLog: (msg, type) => console.log(`[Manual Anikoto Sync ${type}] ${msg}`)
      });
      return res.json(result);
    } catch (err: any) {
      console.error("[Anikoto Sync] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      isAnikotoSyncing = false;
    }
  });

  // ==========================================
  // YUME Authoritative Sync Engine Backend APIs
  // ==========================================
  let isYumeSyncing = false;

  // Heartbeat / Status
  app.get("/api/yume/status", async (req, res) => {
    try {
      const [settings, heartbeat] = await Promise.all([
        getYumeSyncSettings(),
        checkYumeSyncStatus()
      ]);
      return res.json({
        success: true,
        isSyncInProgress: isYumeSyncing,
        heartbeat,
        settings
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Direct Heartbeat Endpoint as requested in spec: GET <YUME_API_URL>/api/v1/sync/status
  app.get("/api/v1/sync/status", async (req, res) => {
    try {
      const heartbeat = await checkYumeSyncStatus();
      return res.json({
        status: heartbeat.alive ? "ok" : "degraded",
        service: "YUME Sync Engine",
        authoritative: true,
        ...heartbeat.data
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // Settings
  app.get("/api/yume/settings", async (req, res) => {
    try {
      const settings = await getYumeSyncSettings();
      return res.json({ success: true, settings });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/yume/settings", async (req, res) => {
    try {
      const { autoSyncEnabled, intervalMinutes, yume_last_sync_cursor } = req.body;
      const updateData: any = {};
      if (typeof autoSyncEnabled === 'boolean') updateData.autoSyncEnabled = autoSyncEnabled;
      if (typeof intervalMinutes === 'number') updateData.intervalMinutes = intervalMinutes;
      if (typeof yume_last_sync_cursor === 'number') updateData.yume_last_sync_cursor = yume_last_sync_cursor;

      await saveYumeSyncSettings(updateData);
      const settings = await getYumeSyncSettings();
      return res.json({ success: true, settings });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reset Cursor
  app.post("/api/yume/reset-cursor", async (req, res) => {
    try {
      await resetYumeSyncCursor();
      const settings = await getYumeSyncSettings();
      return res.json({ success: true, message: "Cursor reset to 0", cursor: settings.yume_last_sync_cursor });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Manual or Triggered Incremental Sync
  app.post("/api/yume/sync-now", async (req, res) => {
    if (isYumeSyncing) {
      return res.status(409).json({
        success: false,
        message: "A YUME sync process is currently running. Please wait for completion."
      });
    }

    try {
      isYumeSyncing = true;
      const forceFull = Boolean(req.body?.forceFull || req.query.forceFull === 'true');
      const since = req.body?.since !== undefined ? Number(req.body.since) : undefined;
      console.log(`[YUME Sync] Triggering sync (forceFull: ${forceFull}, since: ${since ?? 'stored cursor'})...`);

      const result = await runYumeIncrementalSync({
        forceFull,
        since,
        onLog: (msg, type) => console.log(`[YUME Sync ${type.toUpperCase()}] ${msg}`)
      });

      return res.json(result);
    } catch (err: any) {
      console.error("[YUME Sync] Execution Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      isYumeSyncing = false;
    }
  });

  // Periodic Automated Sync Engine for YUME
  setInterval(async () => {
    if (isYumeSyncing) return;
    try {
      const settings = await getYumeSyncSettings();
      if (!settings.autoSyncEnabled) return;

      const intervalMs = (settings.intervalMinutes || 60) * 60 * 1000;
      const timeSinceLastSync = Date.now() - (settings.lastSyncTimestamp || 0);

      if (timeSinceLastSync >= intervalMs) {
        console.log(`[YUME Automated Background Sync] Running scheduled sync (Interval: ${settings.intervalMinutes}m)...`);
        isYumeSyncing = true;
        try {
          await runYumeIncrementalSync({
            onLog: (msg, type) => console.log(`[Auto YUME Sync ${type}] ${msg}`)
          });
        } finally {
          isYumeSyncing = false;
        }
      }
    } catch (err) {
      console.error("[YUME Auto Sync Scheduler Error]:", err);
    }
  }, 60 * 1000); // Check every minute

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Use *all for Express v5
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
