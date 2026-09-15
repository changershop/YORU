import React, { useState, useEffect, useRef } from 'react';
import { 
  RotateCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Database, 
  Sparkles, 
  Layers, 
  Terminal, 
  ExternalLink,
  ShieldCheck,
  Check,
  Play,
  Square,
  Search,
  ArrowUpRight,
  Filter,
  PlusCircle,
  RefreshCw,
  Server,
  Zap,
  CheckCheck,
  AlertTriangle,
  FileJson,
  Upload,
  X,
  FileCode
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { 
  getMultiServerSyncSettings,
  saveMultiServerSyncSettings,
  runMultiServerSetSync,
  scanMultiServerComparison,
  syncSingleMultiServerAnime,
  runYumeIncrementalSync,
  runYumeSetSync,
  resetYumeSyncCursor,
  syncYumePayloadDirect,
  isYumeStartSignalValid,
  isYumeEndSignalValid,
  getYumePageAnimeCount,
  extractYumeItems,
  MultiServerSyncSettings,
  MultiServerSyncStats,
  AnimeComparisonResult,
  SyncLogEntry
} from '../../lib/multiServerSyncService';

export const MultiServerSync: React.FC = () => {
  const [settings, setSettings] = useState<MultiServerSyncSettings>({
    autoSyncEnabled: false,
    intervalMinutes: 60,
    lastSyncTimestamp: 0,
    lastSyncStatus: 'idle',
    lastSyncMessage: 'Ready to sync'
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [comparisonList, setComparisonList] = useState<AnimeComparisonResult[]>([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [scanLimit, setScanLimit] = useState<number | ''>('');
  const [activeTab, setActiveTab] = useState<'all' | 'missing' | 'new_anime' | 'synced'>('all');
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [syncingSingleId, setSyncingSingleId] = useState<string | null>(null);

  // Direct Payload Import Modal state
  const [isPayloadModalOpen, setIsPayloadModalOpen] = useState(false);
  const [payloadInput, setPayloadInput] = useState('');
  const [isPayloadParsing, setIsPayloadParsing] = useState(false);
  const [payloadAnalysis, setPayloadAnalysis] = useState<{
    validJson: boolean;
    hasStartSignal: boolean;
    hasEndSignal: boolean;
    animeCount: number;
    groupsCount: number;
    error?: string;
  } | null>(null);

  const stopSignalRef = useRef(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const addLog = (message: string, type: SyncLogEntry['type'] = 'info') => {
    const entry: SyncLogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };
    setLogs(prev => [...prev.slice(-400), entry]);
  };

  // Initial load: settings + scan comparison
  useEffect(() => {
    async function init() {
      setIsLoadingSettings(true);
      try {
        const data = await getMultiServerSyncSettings();
        setSettings(data);
      } catch (err) {
        console.error('Failed to load MultiServer sync settings:', err);
      } finally {
        setIsLoadingSettings(false);
      }
      runScan();
    }
    init();
  }, []);

  const runScan = async () => {
    setIsScanning(true);
    addLog('Scanning https://yumestream.pages.dev/set against local database...', 'info');
    try {
      const results = await scanMultiServerComparison((curr, tot, msg) => {
        // Optional progress during scan
      });
      setComparisonList(results);
      addLog(`Scan completed: detected ${results.length} total anime entries on YUME MultiServer.`, 'success');
    } catch (err: any) {
      addLog(`Scan error: ${err.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleAutoSync = async () => {
    const nextVal = !settings.autoSyncEnabled;
    setSettings(prev => ({ ...prev, autoSyncEnabled: nextVal }));
    await saveMultiServerSyncSettings({ autoSyncEnabled: nextVal });
    addLog(`Auto-sync set to ${nextVal ? 'ENABLED' : 'DISABLED'}.`, 'info');
  };

  const handleIntervalChange = async (minutes: number) => {
    setSettings(prev => ({ ...prev, intervalMinutes: minutes }));
    await saveMultiServerSyncSettings({ intervalMinutes: minutes });
    addLog(`Auto-sync interval set to every ${minutes} minutes.`, 'info');
  };

  const handleStartSync = async (mode: 'all' | 'missing_only' | 'new_anime_only' = 'all') => {
    if (isSyncing) return;
    setIsSyncing(true);
    stopSignalRef.current = false;
    setProgress({ current: 0, total: 0, percent: 0 });

    addLog(`>>> Starting MultiServer Set Sync [Mode: ${mode.toUpperCase()}] <<<`, 'info');

    try {
      const res = await runMultiServerSetSync({
        filterMode: mode,
        limit: typeof scanLimit === 'number' && scanLimit > 0 ? scanLimit : undefined,
        onLog: entry => setLogs(prev => [...prev.slice(-400), entry]),
        onProgress: (current, total, percent) => {
          setProgress({ current, total, percent });
        },
        shouldStop: () => stopSignalRef.current
      });

      if (res.success) {
        addLog(`=== ${res.message} ===`, 'success');
      } else {
        addLog(`=== Sync encountered an issue: ${res.message} ===`, 'error');
      }

      // Refresh comparison list after sync
      await runScan();
      const updatedSettings = await getMultiServerSyncSettings();
      setSettings(updatedSettings);

    } catch (err: any) {
      addLog(`Unexpected sync failure: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStopSync = () => {
    stopSignalRef.current = true;
    addLog('Requesting sync to stop...', 'warning');
  };

  const handleRunIncrementalSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    stopSignalRef.current = false;
    addLog('>>> Starting Authoritative YUME Incremental Sync (Zero Redundancy Engine) <<<', 'info');

    try {
      const res = await runYumeIncrementalSync({
        onLog: (msg, type) => addLog(msg, type),
        onProgress: (current, total, title) => {
          setProgress({ current, total, percent: Math.round((current / (total || 1)) * 100) });
        },
        stopSignalRef
      });

      if (res.success) {
        addLog(`=== ${res.message} ===`, 'success');
      } else {
        addLog(`=== Sync issue: ${res.message} ===`, 'error');
      }

      const updatedSettings = await getMultiServerSyncSettings();
      setSettings(updatedSettings);
      await runScan();
    } catch (err: any) {
      addLog(`Unexpected sync failure: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRunSetSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    stopSignalRef.current = false;
    addLog('>>> Starting Authoritative YUME /set Catalog Sync (Stream Verified) <<<', 'info');

    try {
      const res = await runYumeSetSync({
        onLog: (msg, type) => addLog(msg, type),
        onProgress: (current, total, title) => {
          setProgress({ current, total, percent: Math.round((current / (total || 1)) * 100) });
        },
        stopSignalRef
      });

      if (res.success) {
        addLog(`=== ${res.message} ===`, 'success');
      } else {
        addLog(`=== Sync issue: ${res.message} ===`, 'error');
      }

      const updatedSettings = await getMultiServerSyncSettings();
      setSettings(updatedSettings);
      await runScan();
    } catch (err: any) {
      addLog(`Unexpected sync failure: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetCursor = async () => {
    if (!window.confirm('Reset the YUME sync cursor to 0? The next incremental sync will evaluate recent updates from the beginning.')) return;
    try {
      await resetYumeSyncCursor();
      const updated = await getMultiServerSyncSettings();
      setSettings(updated);
      addLog('YUME sync cursor successfully reset to 0.', 'warning');
    } catch (err: any) {
      addLog(`Failed to reset cursor: ${err.message}`, 'error');
    }
  };

  const handleSyncSingle = async (animeId: string, title: string) => {
    if (syncingSingleId || isSyncing) return;
    setSyncingSingleId(animeId);
    addLog(`Starting single sync for "${title}"...`, 'info');

    try {
      const res = await syncSingleMultiServerAnime(animeId, entry => {
        setLogs(prev => [...prev.slice(-400), entry]);
      });
      if (res.success) {
        addLog(`Single sync complete for "${title}": ${res.message}`, 'success');
        await runScan();
      } else {
        addLog(`Single sync failed for "${title}": ${res.message}`, 'error');
      }
    } catch (err: any) {
      addLog(`Error during single sync: ${err.message}`, 'error');
    } finally {
      setSyncingSingleId(null);
    }
  };

  // Inspect and analyze raw JSON payload in real time
  const handlePayloadInputChange = (raw: string) => {
    setPayloadInput(raw);
    if (!raw.trim()) {
      setPayloadAnalysis(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const isStart = isYumeStartSignalValid(parsed);
      const isEnd = isYumeEndSignalValid(parsed);
      const animeCount = getYumePageAnimeCount(parsed);
      const items = extractYumeItems(parsed);
      const groupsCount = parsed.total_groups || (Array.isArray(parsed.groups) ? parsed.groups.length : 0);

      setPayloadAnalysis({
        validJson: true,
        hasStartSignal: isStart,
        hasEndSignal: isEnd,
        animeCount: items.length || animeCount,
        groupsCount,
        error: undefined
      });
    } catch (e: any) {
      setPayloadAnalysis({
        validJson: false,
        hasStartSignal: false,
        hasEndSignal: false,
        animeCount: 0,
        groupsCount: 0,
        error: e.message
      });
    }
  };

  // Run direct payload commit to Firestore
  const handleExecuteDirectPayloadSync = async () => {
    if (!payloadInput.trim() || isSyncing) return;

    let parsed: any;
    try {
      parsed = JSON.parse(payloadInput);
    } catch (err: any) {
      addLog(`JSON Parse Error: ${err.message}`, 'error');
      return;
    }

    setIsSyncing(true);
    setIsPayloadParsing(true);
    stopSignalRef.current = false;
    addLog('>>> Starting Direct YUME Stream & Payload Verification <<<', 'info');

    try {
      const res = await syncYumePayloadDirect(parsed, {
        onLog: (msg, type) => addLog(msg, type),
        onProgress: (current, total, title) => {
          setProgress({ current, total, percent: Math.round((current / (total || 1)) * 100) });
        },
        stopSignalRef
      });

      if (res.success) {
        addLog(`=== ${res.message} ===`, 'success');
        setIsPayloadModalOpen(false);
        setPayloadInput('');
        setPayloadAnalysis(null);
      } else {
        addLog(`=== Payload Sync Issue: ${res.message} ===`, 'error');
      }

      const updatedSettings = await getMultiServerSyncSettings();
      setSettings(updatedSettings);
      await runScan();
    } catch (err: any) {
      addLog(`Unexpected direct payload error: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
      setIsPayloadParsing(false);
    }
  };

  // Computed summary counts
  const totalMultiServerAnime = comparisonList.length;
  const totalMultiServerEpisodes = comparisonList.reduce((acc, it) => acc + it.multiserverEpCount, 0);
  const animeWithNewEpisodes = comparisonList.filter(it => it.status === 'new_episodes_available');
  const notImportedAnime = comparisonList.filter(it => it.status === 'not_imported');
  const fullySyncedAnime = comparisonList.filter(it => it.status === 'fully_synced');
  const totalPendingNewEps = animeWithNewEpisodes.reduce((acc, it) => acc + it.missingEpisodeNumbers.length, 0);

  // Filtered list
  const filteredList = comparisonList.filter(item => {
    const q = filterQuery.toLowerCase().trim();
    const matchesQuery = !q ||
      item.title.toLowerCase().includes(q) ||
      String(item.anilistId).includes(q) ||
      String(item.animeId).includes(q);

    if (!matchesQuery) return false;

    if (activeTab === 'missing') return item.status === 'new_episodes_available';
    if (activeTab === 'new_anime') return item.status === 'not_imported';
    if (activeTab === 'synced') return item.status === 'fully_synced';
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Source Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-yoru-surface/60 border border-yoru-border/50 p-6 rounded-2xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                MultiServer Set Sync
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-normal">
                  Live Firestore Direct
                </span>
              </h1>
              <p className="text-xs text-yoru-muted mt-0.5 flex items-center gap-2">
                <span>Source:</span>
                <a 
                  href="https://yumestream.pages.dev/set" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline underline-offset-2"
                >
                  https://yumestream.pages.dev/set
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="text-zinc-600">•</span>
                <span>Active Target:</span>
                <span className="text-emerald-400 font-medium">yorulive.pages.dev</span>
              </p>
            </div>
          </div>
        </div>

        {/* Top Control Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={runScan}
            disabled={isScanning || isSyncing}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-200"
          >
            <RotateCw className={`w-4 h-4 mr-2 ${isScanning ? 'animate-spin text-indigo-400' : ''}`} />
            {isScanning ? 'Scanning...' : 'Scan / Refresh'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetCursor}
            disabled={isScanning || isSyncing}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            title="Reset cursor to 0 for a complete re-scan"
          >
            <RotateCw className="w-3.5 h-3.5 mr-1.5" />
            Reset Cursor
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPayloadModalOpen(true)}
            disabled={isScanning || isSyncing}
            className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10"
            title="Import or paste raw Yume JSON response payload directly"
          >
            <FileJson className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
            Import Raw Payload
          </Button>

          {isSyncing ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStopSync}
              className="bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30"
            >
              <Square className="w-4 h-4 mr-2 fill-current" />
              Stop Sync
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRunSetSync}
                disabled={isScanning}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/25 border border-indigo-500/40"
              >
                <Database className="w-4 h-4 mr-2" />
                YUME /set Sync (Skip Existing)
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={handleRunIncrementalSync}
                disabled={isScanning}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-600/25 border border-emerald-500/40"
              >
                <Zap className="w-4 h-4 mr-2 fill-current" />
                YUME /recent Sync (No Skips)
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Authoritative YUME Engine Status Card */}
      <div className="bg-gradient-to-r from-emerald-950/30 via-indigo-950/30 to-purple-950/20 border border-emerald-500/30 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">Authoritative YUME Incremental Engine</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Zero Redundancy
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Stream Verified
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              YUME is the authoritative source for episode names, numbers, audio, and player embeds with payload start/end stream verification.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="bg-black/40 border border-zinc-700/60 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className="text-zinc-400">Scan Limit:</span>
            <input 
              type="number"
              placeholder="Unlimited"
              value={scanLimit}
              onChange={(e) => setScanLimit(e.target.value ? Number(e.target.value) : '')}
              className="bg-zinc-900 border border-zinc-700 text-emerald-400 font-medium text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500 w-24"
            />
          </div>
          <div className="bg-black/40 border border-zinc-700/60 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-400">Sync Cursor:</span>
            <span className="font-mono text-emerald-400 font-medium">
              {settings.yume_last_sync_cursor ? `${settings.yume_last_sync_cursor} (${new Date(settings.yume_last_sync_cursor * 1000).toLocaleTimeString()})` : '0 (Initial)'}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-yoru-surface/40 border border-yoru-border/40 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-yoru-muted font-medium">MultiServer Total</span>
            <Database className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{totalMultiServerAnime}</span>
            <span className="text-xs text-yoru-muted">Anime</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {totalMultiServerEpisodes} total episodes in set
          </div>
        </div>

        <div className="bg-yoru-surface/40 border border-yoru-border/40 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-yoru-muted font-medium">New Episodes Ready</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400">+{totalPendingNewEps}</span>
            <span className="text-xs text-yoru-muted">Episodes</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Across {animeWithNewEpisodes.length} existing anime
          </div>
        </div>

        <div className="bg-yoru-surface/40 border border-yoru-border/40 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-yoru-muted font-medium">Not In Database</span>
            <PlusCircle className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-purple-400">{notImportedAnime.length}</span>
            <span className="text-xs text-yoru-muted">Anime</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            New series ready to import
          </div>
        </div>

        <div className="bg-yoru-surface/40 border border-yoru-border/40 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-yoru-muted font-medium">Fully Synced</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{fullySyncedAnime.length}</span>
            <span className="text-xs text-yoru-muted">Anime</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Up to date with MultiServer
          </div>
        </div>
      </div>

      {/* Auto-Sync Configuration Bar */}
      <div className="bg-yoru-surface/30 border border-yoru-border/40 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div 
            onClick={handleToggleAutoSync}
            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              settings.autoSyncEnabled ? 'bg-indigo-600 justify-end' : 'bg-zinc-800 justify-start'
            }`}
          >
            <div className="bg-white w-4 h-4 rounded-full shadow-md" />
          </div>
          <div>
            <div className="text-sm font-medium text-white flex items-center gap-2">
              Background Auto-Sync
              {settings.autoSyncEnabled ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">ACTIVE</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">DISABLED</span>
              )}
            </div>
            <div className="text-xs text-yoru-muted">
              Periodically checks https://yumestream.pages.dev/set for newly uploaded episodes
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 text-xs text-yoru-muted">
            <Clock className="w-3.5 h-3.5" />
            <span>Interval:</span>
          </div>
          <select
            value={settings.intervalMinutes}
            onChange={e => handleIntervalChange(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every 1 hour (Recommended)</option>
            <option value={120}>Every 2 hours</option>
            <option value={360}>Every 6 hours</option>
            <option value={1440}>Every 24 hours</option>
          </select>

          {/* Quick Filter Sync Triggers */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStartSync('missing_only')}
            disabled={isSyncing || animeWithNewEpisodes.length === 0}
            className="text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            Sync Missing Only ({totalPendingNewEps})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStartSync('new_anime_only')}
            disabled={isSyncing || notImportedAnime.length === 0}
            className="text-xs border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
          >
            <PlusCircle className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
            Add New Anime ({notImportedAnime.length})
          </Button>
        </div>
      </div>

      {/* Progress Bar (when active) */}
      {isSyncing && (
        <div className="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-xl space-y-2 animate-pulse">
          <div className="flex items-center justify-between text-xs text-indigo-200 font-medium">
            <span>Syncing dataset items... ({progress.current} of {progress.total})</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Live Console Terminal */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="text-xs font-mono text-zinc-400 ml-2 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              sync-console — https://yumestream.pages.dev/set
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                autoScroll ? 'bg-indigo-500/20 text-indigo-300' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setLogs([])}
              className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              Clear Logs
            </button>
          </div>
        </div>

        <div 
          ref={logContainerRef}
          className="p-4 font-mono text-xs max-h-64 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800"
        >
          {logs.length === 0 ? (
            <div className="text-zinc-600 italic py-4 text-center">
              Console idle. Click "Scan / Refresh" or "Sync All" to start.
            </div>
          ) : (
            logs.map(entry => {
              let colorClass = 'text-zinc-300';
              let badge = 'INFO';
              let badgeBg = 'bg-blue-500/10 text-blue-400 border-blue-500/20';

              if (entry.type === 'success') {
                colorClass = 'text-emerald-300';
                badge = 'DONE';
                badgeBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
              } else if (entry.type === 'warning') {
                colorClass = 'text-amber-300';
                badge = 'WARN';
                badgeBg = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
              } else if (entry.type === 'error') {
                colorClass = 'text-rose-400 font-semibold';
                badge = 'FAIL';
                badgeBg = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
              } else if (entry.type === 'skip') {
                colorClass = 'text-zinc-500';
                badge = 'SKIP';
                badgeBg = 'bg-zinc-800 text-zinc-400 border-zinc-700';
              }

              return (
                <div key={entry.id} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="text-zinc-600 select-none text-[11px] shrink-0">[{entry.timestamp}]</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded border uppercase font-bold shrink-0 ${badgeBg}`}>
                    {badge}
                  </span>
                  <span className={colorClass}>{entry.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Dataset Comparison & Interactive Table */}
      <div className="bg-yoru-surface/40 border border-yoru-border/40 rounded-2xl overflow-hidden">
        {/* Table Controls */}
        <div className="p-4 border-b border-yoru-border/40 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('all')}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                activeTab === 'all' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              All Detected ({comparisonList.length})
            </button>
            <button
              onClick={() => setActiveTab('missing')}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                activeTab === 'missing' 
                  ? 'bg-amber-600 text-white' 
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              New Episodes Available ({animeWithNewEpisodes.length})
            </button>
            <button
              onClick={() => setActiveTab('new_anime')}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                activeTab === 'new_anime' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              Not in Database ({notImportedAnime.length})
            </button>
            <button
              onClick={() => setActiveTab('synced')}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                activeTab === 'synced' 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              Fully Synced ({fullySyncedAnime.length})
            </button>
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search anime or AniList ID..."
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Table List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/60 text-zinc-400 uppercase tracking-wider text-[10px] border-b border-zinc-800">
              <tr>
                <th className="py-3 px-4">Anime</th>
                <th className="py-3 px-4">MultiServer Range</th>
                <th className="py-3 px-4">Local Database</th>
                <th className="py-3 px-4">Comparison Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    {isScanning ? 'Scanning remote dataset...' : 'No anime found matching your criteria.'}
                  </td>
                </tr>
              ) : (
                filteredList.map(item => {
                  const msRange = item.multiserverEpisodes.length > 0
                    ? `Ep ${Math.min(...item.multiserverEpisodes)} - ${Math.max(...item.multiserverEpisodes)} (${item.multiserverEpCount} eps)`
                    : '0 episodes';

                  return (
                    <tr key={item.animeId} className="hover:bg-zinc-900/30 transition-colors">
                      {/* Anime Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={item.poster || 'https://images.unsplash.com/photo-1542451313056-b7c8e626645f?auto=format&fit=crop&q=80&w=120'}
                            alt={item.title}
                            className="w-10 h-14 object-cover rounded-lg border border-zinc-800 bg-zinc-900"
                          />
                          <div>
                            <div className="font-semibold text-white text-sm line-clamp-1">{item.title}</div>
                            <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                              <span>AniList: {item.anilistId}</span>
                              {item.malId && <span>• MAL: {item.malId}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* MultiServer Episodes */}
                      <td className="py-3 px-4 text-zinc-300">
                        <div className="font-medium text-indigo-300">{msRange}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          YUME server embed links verified
                        </div>
                      </td>

                      {/* Local Database Status */}
                      <td className="py-3 px-4">
                        {item.localAnimeExists ? (
                          <div>
                            <div className="text-zinc-200 font-medium">
                              {item.localEpCount} total eps in DB
                            </div>
                            <div className="text-[10px] text-emerald-400 mt-0.5">
                              {item.localMultiEpCount} with YUME server
                            </div>
                          </div>
                        ) : (
                          <div className="text-zinc-500 italic">Not in local database</div>
                        )}
                      </td>

                      {/* Comparison Badge */}
                      <td className="py-3 px-4">
                        {item.status === 'new_episodes_available' && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            +{item.missingEpisodeNumbers.length} New Episodes Available
                          </div>
                        )}

                        {item.status === 'not_imported' && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                            <PlusCircle className="w-3 h-3 text-purple-400" />
                            Ready to Import ({item.multiserverEpCount} eps)
                          </div>
                        )}

                        {item.status === 'needs_multi_server' && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                            <Zap className="w-3 h-3 text-blue-400" />
                            Needs YUME Server Link ({item.episodesNeedingMultiServer.length})
                          </div>
                        )}

                        {item.status === 'fully_synced' && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Fully Synced (Skipped)
                          </div>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSyncing || syncingSingleId === item.animeId}
                          onClick={() => handleSyncSingle(item.animeId, item.title)}
                          className={`text-xs ${
                            item.status === 'fully_synced' 
                              ? 'border-zinc-800 text-zinc-500 hover:text-zinc-300' 
                              : 'border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/20'
                          }`}
                        >
                          {syncingSingleId === item.animeId ? (
                            <RotateCw className="w-3.5 h-3.5 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5 mr-1" />
                          )}
                          {item.status === 'fully_synced' ? 'Re-check' : 'Sync Now'}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Direct Raw Payload Import Modal */}
      {isPayloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/90">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <FileJson className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Import Raw YUME API Payload</h2>
                  <p className="text-xs text-zinc-400">Paste raw JSON from Yume API to verify stream signals and sync into Firestore</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPayloadModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Raw JSON Payload (Supports Grouped, Recent, and Set structures)
                </label>
                <textarea
                  value={payloadInput}
                  onChange={e => handlePayloadInputChange(e.target.value)}
                  placeholder={`Paste Yume JSON response here...\ne.g. {\n  "_start": "FETCH_START",\n  "fetch_start": true,\n  "anime_count": 20,\n  "groups": [...],\n  "fetch_complete": true,\n  "_end": "FETCH_END"\n}`}
                  rows={10}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
                />
              </div>

              {/* Analysis & Stream Verification Box */}
              {payloadAnalysis && (
                <div className="bg-zinc-950/60 border border-zinc-800 p-3.5 rounded-xl space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                    <span>Stream Signals & Schema Analysis</span>
                    {payloadAnalysis.validJson ? (
                      <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                        <Check className="w-3 h-3" /> Valid JSON
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1 text-[11px]">
                        <AlertCircle className="w-3 h-3" /> Invalid JSON: {payloadAnalysis.error}
                      </span>
                    )}
                  </div>

                  {payloadAnalysis.validJson && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
                        <span className="text-[10px] text-zinc-400 block">Start Signal</span>
                        <span className={`text-xs font-bold ${payloadAnalysis.hasStartSignal ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {payloadAnalysis.hasStartSignal ? '✓ Verified' : 'Optional / Missing'}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
                        <span className="text-[10px] text-zinc-400 block">End Signal</span>
                        <span className={`text-xs font-bold ${payloadAnalysis.hasEndSignal ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {payloadAnalysis.hasEndSignal ? '✓ Verified' : 'Optional / Missing'}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
                        <span className="text-[10px] text-zinc-400 block">Anime Count</span>
                        <span className="text-xs font-bold text-indigo-400">
                          {payloadAnalysis.animeCount} Entries
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
                        <span className="text-[10px] text-zinc-400 block">Groups / Franchises</span>
                        <span className="text-xs font-bold text-purple-400">
                          {payloadAnalysis.groupsCount} Groups
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-900/90">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPayloadInput('');
                  setPayloadAnalysis(null);
                }}
                disabled={!payloadInput || isSyncing}
                className="text-xs border-zinc-800 text-zinc-400 hover:text-white"
              >
                Clear
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPayloadModalOpen(false)}
                  className="text-xs border-zinc-800 text-zinc-400 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExecuteDirectPayloadSync}
                  disabled={!payloadAnalysis?.validJson || isSyncing || isPayloadParsing}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/25"
                >
                  {isSyncing || isPayloadParsing ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Syncing Payload...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 mr-1.5 fill-current" />
                      Commit to Firestore
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
