import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Anime, Episode, Season, ServerLink } from '../../types';
import { collection, doc, getDoc, getDocs, setDoc, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { normalizeEpisodes, autoDetectServer } from '../../lib/episodeUtils';

export const EpisodeManager = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<string>('');
  
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [seasonToDelete, setSeasonToDelete] = useState<string | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkTitles, setBulkTitles] = useState('');
  const [bulkLinks, setBulkLinks] = useState('');
  const [showAutoAddModal, setShowAutoAddModal] = useState(false);
  const [autoAddConfig, setAutoAddConfig] = useState({ startEp: 1, endEpSub: 12, endEpDub: 12, endEpMulti: 12, anilistId: '', malId: '' });

  useEffect(() => {
    if (!id) return;
    async function load() {
      const snap = await getDoc(doc(db, 'anime', id!));
      if (snap.exists()) {
        const data = snap.data() as Anime;
        setAnime(data);
        setSeasons(data.seasons || [{ id: 's1', name: 'Season 1', order: 1 }]);
        setActiveSeason(data.seasons?.[0]?.id || 's1');
        setAutoAddConfig(prev => ({ ...prev, anilistId: data.aniListId || '' }));
        if (data.aniListId) {
          fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query ($id: Int) { Media(id: $id) { idMal } }`,
              variables: { id: parseInt(data.aniListId) }
            })
          })
          .then(res => res.json())
          .then(resData => {
            if (resData?.data?.Media?.idMal) {
              setAutoAddConfig(prev => ({ ...prev, malId: resData.data.Media.idMal.toString() }));
            }
          })
          .catch(e => console.error('Error fetching MAL ID', e));
        }
      }
      
      const epQ = query(collection(db, 'episodes'), where('animeId', '==', id));
      const epSnap = await getDocs(epQ);
      const rawDocs = epSnap.docs.map(d => ({ ...d.data(), id: d.id }));
      const normalizedEps = normalizeEpisodes(rawDocs);
      setEpisodes(normalizedEps);
      setIsLoading(false);
    }
    load();
  }, [id]);

  const activeEpisodes = episodes.filter(e => e.seasonId === activeSeason);

  const addSeason = () => {
    const nextNum = seasons.length > 0 ? Math.max(...seasons.map(s => parseInt(s.id.replace('s', '')) || 0)) + 1 : 1;
    const newSeasonId = `s${nextNum}_${Date.now()}`;
    const newSeason = { id: newSeasonId, name: `Season ${seasons.length + 1}`, order: seasons.length + 1 };
    setSeasons([...seasons, newSeason]);
    setActiveSeason(newSeason.id);
  };

  const updateSeasonName = (seasonId: string, newName: string) => {
    setSeasons(seasons.map(s => s.id === seasonId ? { ...s, name: newName } : s));
  };

  const confirmRemoveSeason = () => {
    if (!seasonToDelete) return;
    setSeasons(seasons.filter(s => s.id !== seasonToDelete));
    if (activeSeason === seasonToDelete) {
      setActiveSeason(seasons.find(s => s.id !== seasonToDelete)?.id || '');
    }
    setSeasonToDelete(null);
  };

  const saveChanges = async () => {
    if (!id || !anime) return;
    setIsSaving(true);
    try {
      // 1. Fetch all existing documents in Firestore for this anime
      const epQ = query(collection(db, 'episodes'), where('animeId', '==', id));
      const existingSnap = await getDocs(epQ);

      const batch = writeBatch(db);
      
      let subCount = 0;
      let dubCount = 0;
      let multiCount = 0;

      for (const ep of episodes) {
        if (ep.servers?.some(s => s.serverType === 'sub')) subCount++;
        if (ep.servers?.some(s => s.serverType === 'dub')) dubCount++;
        if (ep.servers?.some(s => s.serverType === 'multi')) multiCount++;
      }

      // Save seasons and counts
      const animeRef = doc(db, 'anime', id);
      batch.update(animeRef, { 
        seasons,
        subEpisodesCount: subCount,
        dubEpisodesCount: dubCount,
        multiEpisodesCount: multiCount
      });

      // Keep track of valid new doc IDs
      const validDocIds = new Set<string>();

      for (const ep of episodes) {
        const newEpId = `${id}_${ep.seasonId}_${ep.episodeNumber}`;
        validDocIds.add(newEpId);
        const epRef = doc(db, 'episodes', newEpId);
        batch.set(epRef, {
          id: newEpId,
          animeId: ep.animeId || id,
          seasonId: ep.seasonId,
          episodeNumber: ep.episodeNumber,
          title: ep.title || `Episode ${ep.episodeNumber}`,
          isFiller: ep.isFiller || false,
          servers: ep.servers || [],
          thumbnailUrl: ep.thumbnailUrl || '',
          createdAt: ep.createdAt || Date.now(),
          published: ep.published !== undefined ? ep.published : true
        });
      }

      // Delete any obsolete or duplicate documents
      for (const docSnap of existingSnap.docs) {
        if (!validDocIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      }

      await batch.commit();
      alert('Changes saved successfully!');
    } catch (error) {
      console.error('Error saving:', error);
      alert('Error saving changes');
    } finally {
      setIsSaving(false);
    }
  };

  const addEpisodeRow = () => {
    const nextNum = activeEpisodes.length > 0 ? Math.max(...activeEpisodes.map(e => e.episodeNumber)) + 1 : 1;
    setEpisodes([...episodes, {
      id: `temp_${Date.now()}`,
      animeId: id!,
      seasonId: activeSeason,
      episodeNumber: nextNum,
      title: `Episode ${nextNum}`,
      isFiller: false,
      servers: [],
      thumbnailUrl: anime?.backdrop || '',
      createdAt: Date.now(),
      published: true
    }]);
  };

  const removeEpisode = (epId: string) => {
    setEpisodes(episodes.filter(e => e.id !== epId));
  };

  const updateEpisode = (epId: string, field: keyof Episode, value: any) => {
    setEpisodes(episodes.map(e => e.id === epId ? { ...e, [field]: value } : e));
  };

  const addServer = (epId: string) => {
    setEpisodes(episodes.map(e => {
      if (e.id === epId) {
        return {
          ...e,
          servers: [...(e.servers || []), { serverName: '', embedLink: '', serverType: 'sub' }]
        };
      }
      return e;
    }));
  };

  const removeServer = (epId: string, serverIndex: number) => {
    setEpisodes(episodes.map(e => {
      if (e.id === epId) {
        const newServers = [...e.servers];
        newServers.splice(serverIndex, 1);
        return { ...e, servers: newServers };
      }
      return e;
    }));
  };

  const updateServer = (epId: string, serverIndex: number, field: keyof ServerLink, value: any) => {
    setEpisodes(episodes.map(e => {
      if (e.id === epId) {
        const newServers = [...e.servers];
        newServers[serverIndex] = { ...newServers[serverIndex], [field]: value };
        
        // Auto-detect server logic
        if (field === 'embedLink') {
          const detected = autoDetectServer(value);
          if (detected.serverName) {
            newServers[serverIndex].serverName = detected.serverName;
            newServers[serverIndex].serverType = detected.serverType;
          }
        }

        if (field === 'serverName') {
          const nameLower = String(value || '').trim().toLowerCase();
          if (nameLower === 'vidstream' || nameLower === 'abyss') {
            newServers[serverIndex].serverType = 'multi';
          }
        }
        
        return { ...e, servers: newServers };
      }
      return e;
    }));
  };

  const handleAutoGenerate = () => {
    const { startEp, endEpSub, endEpDub, endEpMulti, anilistId, malId } = autoAddConfig;
    const maxEp = Math.max(endEpSub, endEpDub, endEpMulti);
    let newEps = [...episodes];
    
    for (let i = startEp; i <= maxEp; i++) {
      let ep = newEps.find(e => e.episodeNumber === i && e.seasonId === activeSeason);
      if (!ep) {
        ep = {
          id: `temp_${Date.now()}_${i}`,
          animeId: id!,
          seasonId: activeSeason,
          episodeNumber: i,
          title: `Episode ${i}`,
          isFiller: false,
          servers: [],
          thumbnailUrl: anime?.backdrop || '',
          createdAt: Date.now(),
          published: true
        };
        newEps.push(ep);
      }
      
      // We only add new servers if they don't already exist in this episode to avoid dupes
      if (anilistId) {
        if (i <= endEpSub && !ep.servers.some(s => s.serverName === 'HD-1' && s.serverType === 'sub')) {
          ep.servers.push({ serverName: 'HD-1', embedLink: `https://megaplay.buzz/stream/ani/${anilistId}/${i}/sub`, serverType: 'sub' });
        }
        if (i <= endEpDub && !ep.servers.some(s => s.serverName === 'HD-1' && s.serverType === 'dub')) {
          ep.servers.push({ serverName: 'HD-1', embedLink: `https://megaplay.buzz/stream/ani/${anilistId}/${i}/dub`, serverType: 'dub' });
        }
        if (i <= endEpMulti && !ep.servers.some(s => (s.serverName === 'YUME' || s.serverName === 'Multi') && s.serverType === 'multi')) {
          ep.servers.push({ serverName: 'YUME', embedLink: `https://yumestream.pages.dev/${anilistId}/${i}`, serverType: 'multi' });
        }
      }
      if (malId) {
        if (i <= endEpSub && !ep.servers.some(s => s.serverName === 'HD-2' && s.serverType === 'sub')) {
          ep.servers.push({ serverName: 'HD-2', embedLink: `https://megaplay.buzz/stream/mal/${malId}/${i}/sub`, serverType: 'sub' });
        }
        if (i <= endEpDub && !ep.servers.some(s => s.serverName === 'HD-2' && s.serverType === 'dub')) {
          ep.servers.push({ serverName: 'HD-2', embedLink: `https://megaplay.buzz/stream/mal/${malId}/${i}/dub`, serverType: 'dub' });
        }
      }
    }
    
    setEpisodes(newEps);
    setShowAutoAddModal(false);
  };

  const handleBulkImport = () => {
    const parseLines = (text: string) => {
      const results: {epNum: number, val: string}[] = [];
      const lines = text.split('\n');
      for (const line of lines) {
        // Matches: 1: 'https...' or 1: "Title" or 1: Title
        const match = line.match(/^(\d+)\s*:\s*['"]?(.*?)['"]?,?\s*$/);
        if (match) {
          results.push({ epNum: parseInt(match[1]), val: match[2].trim() });
        }
      }
      return results;
    };

    let newEps = [...episodes];
    let createdCount = 0;
    
    // Process titles
    if (bulkTitles.trim()) {
      const titleData = parseLines(bulkTitles);
      titleData.forEach(({epNum, val}) => {
        const existingIdx = newEps.findIndex(e => e.episodeNumber === epNum && e.seasonId === activeSeason);
        if (existingIdx >= 0) {
          newEps[existingIdx].title = val;
        } else {
          newEps.push({
            id: `temp_${Date.now()}_${epNum}`,
            animeId: id!,
            seasonId: activeSeason,
            episodeNumber: epNum,
            title: val,
            isFiller: false,
            servers: [],
            thumbnailUrl: anime?.backdrop || '',
            createdAt: Date.now(),
            published: true
          });
          createdCount++;
        }
      });
    }

    // Process links
    if (bulkLinks.trim()) {
      const linkData = parseLines(bulkLinks);
      linkData.forEach(({epNum, val}) => {
        let ep = newEps.find(e => e.episodeNumber === epNum && e.seasonId === activeSeason);
        if (!ep) {
          ep = {
            id: `temp_${Date.now()}_${epNum}`,
            animeId: id!,
            seasonId: activeSeason,
            episodeNumber: epNum,
            title: `Episode ${epNum}`,
            isFiller: false,
            servers: [],
            thumbnailUrl: anime?.backdrop || '',
            createdAt: Date.now(),
            published: true
          };
          newEps.push(ep);
        }
        
        // Handle server logic
        const detected = autoDetectServer(val);
        
        // Check if embedLink already exists in this episode
        const existingServerIdx = ep.servers.findIndex(s => s.embedLink === val);
        if (existingServerIdx === -1) {
          ep.servers.push({
            serverName: detected.serverName || 'HD-1',
            embedLink: val,
            serverType: detected.serverType || 'sub'
          });
        }
      });
    }

    setEpisodes(newEps);
    setShowBulkModal(false);
    setBulkTitles('');
    setBulkLinks('');
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 text-yoru-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 relative">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header - Sticky with solid opaque background */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sticky top-0 z-40 bg-[#0c0d12] border border-yoru-border rounded-xl p-4 shadow-2xl">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Link to="/admin/anime" className="p-2 bg-yoru-surface border border-yoru-border rounded-lg hover:border-yoru-accent transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5 text-yoru-text" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-widest text-white truncate">Episodes</h1>
              <p className="text-xs sm:text-sm text-yoru-text-muted mt-0.5 truncate">{anime?.title} ({episodes.length} total)</p>
            </div>
          </div>
          <button
            onClick={saveChanges}
            disabled={isSaving}
            className="w-full sm:w-auto bg-yoru-accent hover:bg-yoru-accent/90 text-yoru-bg px-6 py-2.5 rounded-lg font-bold text-sm uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_25px_rgba(255,255,255,0.35)] disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Seasons Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {seasons.map((season, idx) => (
            <button
              key={`${season.id}-${idx}`}
              onClick={() => setActiveSeason(season.id)}
              className={clsx(
                "px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors border",
                activeSeason === season.id 
                  ? "bg-yoru-surface border-white/20 text-white" 
                  : "bg-transparent border-transparent text-yoru-text-muted hover:text-white hover:bg-yoru-surface/50"
              )}
            >
              {season.name}
            </button>
          ))}
          <button
            onClick={addSeason}
            className="px-4 py-2 text-sm font-bold uppercase tracking-widest text-yoru-text-muted hover:text-white transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Season
          </button>
        </div>

        {/* Season Editor & Controls */}
        <div className="bg-yoru-surface border border-yoru-border p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted whitespace-nowrap">
              Season Name
            </label>
            <input 
              type="text" 
              value={seasons.find(s => s.id === activeSeason)?.name || ''}
              onChange={e => updateSeasonName(activeSeason, e.target.value)}
              className="bg-yoru-bg border border-yoru-border px-3 py-1.5 text-sm text-white focus:outline-none focus:border-yoru-accent w-48"
            />
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSeasonToDelete(activeSeason)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-yoru-error hover:text-yoru-error/80 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove Season
            </button>
            <button 
              onClick={() => setShowAutoAddModal(true)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white hover:text-yoru-accent transition-colors ml-4"
            >
              <Plus className="w-3.5 h-3.5" /> Auto Add
            </button>
            <button 
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white hover:text-yoru-accent transition-colors ml-4"
            >
              <Plus className="w-3.5 h-3.5" /> Bulk Import
            </button>
            <button 
              onClick={addEpisodeRow}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white hover:text-yoru-accent transition-colors ml-4"
            >
              <Plus className="w-3.5 h-3.5" /> Add Episode Row
            </button>
          </div>
        </div>

        {/* Episodes Table-like UI */}
        <div className="bg-yoru-surface border border-yoru-border overflow-hidden">
          {/* Header Row */}
          <div className="grid grid-cols-[80px_1fr_60px_60px] gap-4 bg-yoru-bg border-b border-yoru-border px-4 py-3 text-xs font-bold uppercase tracking-widest text-yoru-text-muted">
            <div>EP #</div>
            <div>TITLE</div>
            <div className="text-center">FILLER</div>
            <div className="text-center">REMOVE</div>
          </div>

          {/* Episode List */}
          <div className="divide-y divide-yoru-border/50">
            {activeEpisodes.sort((a,b) => a.episodeNumber - b.episodeNumber).map((ep) => (
              <div key={ep.id} className="p-4 bg-yoru-surface/50 group/ep hover:bg-yoru-surface transition-colors">
                {/* EP Main Row */}
                <div className="grid grid-cols-[80px_1fr_60px_60px] gap-4 items-center mb-3">
                  <input 
                    type="number" 
                    value={ep.episodeNumber}
                    onChange={e => updateEpisode(ep.id, 'episodeNumber', parseInt(e.target.value) || 0)}
                    className="w-16 bg-yoru-bg border border-yoru-border px-2 py-1.5 text-white focus:outline-none focus:border-yoru-accent text-center text-sm font-bold"
                  />
                  <input 
                    type="text" 
                    value={ep.title}
                    onChange={e => updateEpisode(ep.id, 'title', e.target.value)}
                    className="w-full bg-yoru-bg border border-yoru-border px-3 py-1.5 text-white focus:outline-none focus:border-yoru-accent text-sm"
                  />
                  <div className="flex justify-center">
                    <input 
                      type="checkbox" 
                      checked={ep.isFiller}
                      onChange={e => updateEpisode(ep.id, 'isFiller', e.target.checked)}
                      className="w-4 h-4 bg-yoru-bg border-yoru-border text-orange-500 cursor-pointer transition-colors"
                      title="Mark as Filler"
                    />
                  </div>
                  <div className="flex justify-center">
                    <button 
                      onClick={() => removeEpisode(ep.id)} 
                      className="p-1.5 text-yoru-text-muted hover:text-red-400 transition-colors bg-yoru-bg/50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Servers Section */}
                <div className="pl-[96px] pr-[136px] space-y-2">
                  <div className="grid grid-cols-[1fr_120px_100px_40px] gap-3 text-[10px] font-bold uppercase tracking-widest text-yoru-text-muted/70 px-1">
                    <div>Embed Link</div>
                    <div>Server</div>
                    <div>Type</div>
                    <div></div>
                  </div>
                  {ep.servers?.map((server, sIdx) => (
                    <div key={sIdx} className="grid grid-cols-[1fr_120px_100px_40px] gap-3 items-center group/srv">
                      <input 
                        type="text" 
                        placeholder="https://..."
                        value={server.embedLink}
                        onChange={e => updateServer(ep.id, sIdx, 'embedLink', e.target.value)}
                        className="w-full bg-yoru-bg/80 border border-white/5 px-3 py-1.5 text-white focus:outline-none focus:border-yoru-accent text-xs"
                      />
                      <input 
                        type="text" 
                        value={server.serverName}
                        onChange={e => updateServer(ep.id, sIdx, 'serverName', e.target.value)}
                        className="w-full bg-yoru-bg/80 border border-white/5 px-2 py-1.5 text-white focus:outline-none focus:border-yoru-accent text-xs text-center"
                      />
                      <select
                        value={server.serverType || 'sub'}
                        onChange={e => updateServer(ep.id, sIdx, 'serverType', e.target.value)}
                        className="w-full bg-yoru-bg/80 border border-white/5 px-2 py-1.5 text-white focus:outline-none focus:border-yoru-accent text-xs"
                      >
                        <option value="sub">SUB</option>
                        <option value="dub">DUB</option>
                        <option value="multi">MULTI</option>
                      </select>
                      <button 
                        onClick={() => removeServer(ep.id, sIdx)} 
                        className="text-yoru-text-muted hover:text-red-400 opacity-50 group-hover/srv:opacity-100 transition-all p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  
                  <button
                    onClick={() => addServer(ep.id)}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-yoru-text-muted hover:text-white transition-colors mt-2"
                  >
                    <Plus className="w-3 h-3" /> Add Server
                  </button>
                </div>

              </div>
            ))}
          </div>
          
          {activeEpisodes.length === 0 && (
            <div className="text-center py-12 text-yoru-text-muted text-sm">
              No episodes in this season. Click "Add Episode Row" or "Bulk Import" to start.
            </div>
          )}
        </div>
      </div>

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-yoru-surface border border-yoru-border max-w-3xl w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white mb-2">Bulk Import Episodes</h3>
            <p className="text-sm text-yoru-text-muted">
              Use format: <code>1: 'Episode Name'</code> or <code>1: 'https://link'</code>
            </p>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted">
                  Bulk Episode Titles
                </label>
                <textarea 
                  value={bulkTitles}
                  onChange={e => setBulkTitles(e.target.value)}
                  placeholder="1: 'First Episode'
2: 'Second Episode'"
                  className="w-full h-64 bg-yoru-bg border border-yoru-border p-3 text-sm text-white focus:outline-none focus:border-yoru-accent font-mono resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted">
                  Bulk Embed Links
                </label>
                <textarea 
                  value={bulkLinks}
                  onChange={e => setBulkLinks(e.target.value)}
                  placeholder="1: 'https://as-cdn21.top/video/...'
1: 'https://animesalt.link/multi-lang-plyr/...'
2: 'https://as-cdn21.top/video/...'"
                  className="w-full h-64 bg-yoru-bg border border-yoru-border p-3 text-sm text-white focus:outline-none focus:border-yoru-accent font-mono resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button 
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 text-sm font-bold uppercase tracking-widest text-yoru-text-muted hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleBulkImport}
                className="bg-yoru-accent hover:bg-yoru-accent/90 text-yoru-bg px-6 py-2 text-sm font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Add Modal */}
      {showAutoAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-yoru-surface border border-yoru-border max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white mb-2">Auto Add Episodes</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted">Start Ep</label>
                <input 
                  type="number" 
                  value={autoAddConfig.startEp} 
                  onChange={e => setAutoAddConfig({...autoAddConfig, startEp: parseInt(e.target.value) || 1})}
                  className="w-full bg-yoru-bg border border-yoru-border px-4 py-2 text-sm text-white focus:outline-none focus:border-yoru-accent"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted">End Ep (Sub)</label>
                <input 
                  type="number" 
                  value={autoAddConfig.endEpSub} 
                  onChange={e => setAutoAddConfig({...autoAddConfig, endEpSub: parseInt(e.target.value) || 12})}
                  className="w-full bg-yoru-bg border border-yoru-border px-4 py-2 text-sm text-white focus:outline-none focus:border-yoru-accent"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted">End Ep (Dub)</label>
                <input 
                  type="number" 
                  value={autoAddConfig.endEpDub} 
                  onChange={e => setAutoAddConfig({...autoAddConfig, endEpDub: parseInt(e.target.value) || 12})}
                  className="w-full bg-yoru-bg border border-yoru-border px-4 py-2 text-sm text-white focus:outline-none focus:border-yoru-accent"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted">End Ep (YUME Multi)</label>
                <input 
                  type="number" 
                  value={autoAddConfig.endEpMulti} 
                  onChange={e => setAutoAddConfig({...autoAddConfig, endEpMulti: parseInt(e.target.value) || 12})}
                  className="w-full bg-yoru-bg border border-yoru-border px-4 py-2 text-sm text-white focus:outline-none focus:border-yoru-accent"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted">Anilist ID</label>
                <input 
                  type="text" 
                  value={autoAddConfig.anilistId} 
                  onChange={e => setAutoAddConfig({...autoAddConfig, anilistId: e.target.value})}
                  className="w-full bg-yoru-bg border border-yoru-border px-4 py-2 text-sm text-white focus:outline-none focus:border-yoru-accent"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted">MAL ID</label>
                <input 
                  type="text" 
                  value={autoAddConfig.malId} 
                  onChange={e => setAutoAddConfig({...autoAddConfig, malId: e.target.value})}
                  className="w-full bg-yoru-bg border border-yoru-border px-4 py-2 text-sm text-white focus:outline-none focus:border-yoru-accent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button 
                onClick={() => setShowAutoAddModal(false)}
                className="px-4 py-2 text-sm font-bold uppercase tracking-widest text-yoru-text-muted hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleAutoGenerate}
                className="bg-yoru-accent hover:bg-yoru-accent/90 text-yoru-bg px-6 py-2 text-sm font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Season Modal */}
      {seasonToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-yoru-surface border border-yoru-border max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Delete Season</h3>
            <p className="text-sm text-yoru-text-muted mb-6">
              Are you sure you want to delete this season? Episodes inside it will be orphaned unless moved.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setSeasonToDelete(null)}
                className="px-4 py-2 text-sm font-bold uppercase tracking-widest text-yoru-text-muted hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmRemoveSeason}
                className="bg-yoru-error hover:bg-yoru-error/90 text-white px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating Save Changes Pill for effortless 1-click save anywhere while scrolling */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={saveChanges}
          disabled={isSaving}
          className="bg-yoru-accent hover:bg-yoru-accent/90 text-black px-5 py-2.5 rounded-full font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-[0_4px_25px_rgba(255,255,255,0.35)] hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer border border-white/20"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
};
