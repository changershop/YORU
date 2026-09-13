import React, { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Film, ListVideo, Users, Activity, History, RotateCw, Clock, ExternalLink, Server, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getAnikotoSyncSettings, saveAnikotoSyncSettings, runAnikotoRecentSync } from '../../lib/anikotoSyncService';
import { AnikotoSyncSettings } from '../../types';

export const Dashboard = () => {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ anime: 0, episodes: 0, users: 0 });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [syncSettings, setSyncSettings] = useState<AnikotoSyncSettings | null>(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        const animeCount = await getCountFromServer(collection(db, 'anime'));
        const epsCount = await getCountFromServer(collection(db, 'episodes'));
        const usersCount = await getCountFromServer(collection(db, 'users'));
        setStats({
          anime: animeCount.data().count,
          episodes: epsCount.data().count,
          users: usersCount.data().count
        });
      } catch (e) {
        console.error(e);
      }
    }
    
    async function fetchAuditLogs() {
      try {
        const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(10));
        const snap = await getDocs(q);
        setAuditLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) {
        console.error('Error fetching audit logs:', e);
      }
    }

    async function loadSyncSettings() {
      try {
        const s = await getAnikotoSyncSettings();
        setSyncSettings(s);
      } catch (e) {
        console.error('Error loading sync settings:', e);
      }
    }

    fetchStats();
    loadSyncSettings();
    if (profile?.role === 'admin' || profile?.role === 'moderator') {
      fetchAuditLogs();
    }
  }, [profile]);

  const handleToggleSwitch = async () => {
    if (!syncSettings) return;
    const newVal = !syncSettings.autoSyncEnabled;
    setSyncSettings(prev => prev ? { ...prev, autoSyncEnabled: newVal } : null);
    await saveAnikotoSyncSettings({ autoSyncEnabled: newVal });
  };

  const handleManualSync = async () => {
    if (isSyncingNow) return;
    setIsSyncingNow(true);
    try {
      await runAnikotoRecentSync({ page: 1, perPage: 20 });
      const updated = await getAnikotoSyncSettings();
      setSyncSettings(updated);
    } catch (e) {
      console.error('Manual sync error:', e);
    } finally {
      setIsSyncingNow(false);
    }
  };

  const cards = [
    { title: 'Total Anime', value: stats.anime, icon: Film, color: 'text-blue-500' },
    { title: 'Total Episodes', value: stats.episodes, icon: ListVideo, color: 'text-purple-500' },
    { title: 'Active Users', value: stats.users, icon: Users, color: 'text-green-500' },
    { title: 'System Status', value: 'Online', icon: Activity, color: 'text-yoru-accent' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Dashboard Overview</h1>
        <p className="text-xs text-yoru-text-muted mt-1">Platform management and server configuration</p>
      </div>

      {/* Anikoto Recent Anime 24x Auto-Sync Quick Control */}
      <div className="bg-yoru-surface border border-yoru-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 bg-yoru-accent/10 border border-yoru-accent/20 rounded-xl text-yoru-accent shrink-0">
            <RotateCw className={`w-5 h-5 ${isSyncingNow ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">Recent Anime Auto-Sync (anikotoapi.site)</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                syncSettings?.autoSyncEnabled 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}>
                {syncSettings?.autoSyncEnabled ? '24x Daily Active (Hourly)' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-yoru-text-muted mt-0.5">
              Auto-adds new releases, scans episodes, and attaches new Dub tracks to existing shows.
              {syncSettings?.lastSyncTimestamp && (
                <span className="ml-2 text-zinc-400">
                  Last checked: {new Date(syncSettings.lastSyncTimestamp).toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Quick Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={syncSettings?.autoSyncEnabled ?? true}
            onClick={handleToggleSwitch}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              syncSettings?.autoSyncEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                syncSettings?.autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>

          {/* Sync Button */}
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncingNow}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-yoru-surface-elevated hover:bg-white/10 text-white border border-yoru-border transition-colors flex items-center gap-1.5"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin text-yoru-accent' : ''}`} />
            <span>{isSyncingNow ? 'Checking...' : 'Check Now'}</span>
          </button>

          <Link
            to="/admin/recent-sync"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-yoru-accent/10 hover:bg-yoru-accent/20 text-yoru-accent border border-yoru-accent/30 transition-colors flex items-center gap-1"
          >
            <span>Live Logs</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* MultiServer Set Sync Quick Card */}
      <div className="bg-yoru-surface border border-indigo-500/20 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg bg-gradient-to-r from-indigo-950/20 to-transparent">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400 shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">YUME Multi-Server Sync (yumestream.pages.dev)</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-indigo-500/10 text-indigo-300 border-indigo-500/30">
                YUME Server
              </span>
            </div>
            <p className="text-xs text-yoru-text-muted mt-0.5">
              Syncs all anime & episodes from YUME Stream. Skips existing, adds new episodes, and attaches YUME server links.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/admin/multiserver-sync"
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-colors flex items-center gap-1.5"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Open Sync Console</span>
            <ExternalLink className="w-3 h-3 ml-0.5" />
          </Link>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map(c => (
          <div key={c.title} className="bg-yoru-surface border border-yoru-border p-6 flex items-center gap-4 rounded-2xl shadow-xl">
            <div className={`p-4 bg-yoru-surface-elevated rounded-full ${c.color}`}>
              <c.icon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted">{c.title}</div>
              <div className="text-2xl font-black text-white mt-0.5">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-white">
            <History className="w-5 h-5 text-yoru-accent" />
            <h2 className="text-lg font-bold">Recent Role Changes</h2>
          </div>
          <div className="bg-yoru-surface border border-yoru-border rounded-xl p-4 space-y-3 max-h-96 overflow-y-auto">
            {auditLogs.length > 0 ? (
              auditLogs.map(log => (
                <div key={log.id} className="text-sm bg-yoru-surface-elevated p-3 rounded-lg border border-white/5">
                  <div className="text-white/80 font-medium">
                    <span className="text-white font-bold">{log.performedByEmail || 'Unknown'}</span> changed role for <span className="text-white font-bold">{log.targetUserEmail || 'Unknown'}</span>
                  </div>
                  <div className="text-xs text-yoru-text-muted mt-1 flex items-center gap-2">
                    <span className="line-through">{log.oldRole}</span> 
                    <span>→</span> 
                    <span className="text-yoru-accent font-bold uppercase tracking-wider">{log.newRole}</span>
                    <span className="mx-2">•</span>
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-yoru-text-muted text-center py-8">No recent role changes</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
