import React, { useState, useMemo } from 'react';
import { Loader2, DownloadCloud, AlertTriangle, CheckCircle, XCircle, Layers, Check, Info } from 'lucide-react';
import { collection, doc, setDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Anime, Episode } from '../../types';
import { syncSeasonGroup } from '../../lib/seasonGroupService';
import axios from 'axios';

interface LogItem {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

interface ParsedImportItem {
  id: number;
  label?: string;
  seasonGroupId?: string;
  seasonNumber?: number;
  groupLabel?: string;
}

export const AutoImport = () => {
  const [inputIds, setInputIds] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [groupAllAsSeasons, setGroupAllAsSeasons] = useState(false);

  // Server type toggles requested by user
  const [importSub, setImportSub] = useState(true);
  const [importDub, setImportDub] = useState(true);
  const [importMulti, setImportMulti] = useState(true);

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setLogs(prev => [...prev, { message, type }]);
  };

  /**
   * Parses inputs like:
   * 10, 255, (895, 897,) 555
   * or (20 {naruto}, 1735 {naruto shippuden})
   * or 20 {naruto}, 1735 {naruto shippuden} (when groupAllAsSeasons is checked)
   */
  const parsedItems: ParsedImportItem[] = useMemo(() => {
    if (!inputIds.trim()) return [];

    const items: ParsedImportItem[] = [];
    let text = inputIds;

    // First find any bracketed groups: ( ... ) or [ ... ]
    const bracketRegex = /[\(\[]([^()\[\]]+)[\)\]]/g;
    let match: RegExpExecArray | null;
    let groupCounter = 1;
    const bracketRanges: { start: number; end: number; content: string; groupKey: string }[] = [];

    while ((match = bracketRegex.exec(text)) !== null) {
      bracketRanges.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        groupKey: `sg_${Date.now()}_grp${groupCounter++}`
      });
    }

    // If there were explicit brackets
    if (bracketRanges.length > 0) {
      let lastIndex = 0;

      bracketRanges.forEach((br, bIdx) => {
        // Text before bracket (standalone items)
        const beforeText = text.substring(lastIndex, br.start);
        parsePlainItems(beforeText, items);

        // Bracketed group items (Season 1, Season 2, ...)
        const groupTokens = br.content.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
        let seasonNum = 1;

        groupTokens.forEach(token => {
          const parsed = extractIdAndLabel(token);
          if (parsed) {
            items.push({
              id: parsed.id,
              label: parsed.label,
              seasonGroupId: br.groupKey,
              seasonNumber: seasonNum++,
              groupLabel: `Franchise Group ${bIdx + 1}`
            });
          }
        });

        lastIndex = br.end;
      });

      // Text after last bracket
      const remainingText = text.substring(lastIndex);
      parsePlainItems(remainingText, items);

    } else if (groupAllAsSeasons) {
      // No brackets, but "Merge all IDs as Seasons" toggle is checked
      const groupKey = `sg_${Date.now()}_all`;
      const tokens = text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
      let seasonNum = 1;

      tokens.forEach(token => {
        const parsed = extractIdAndLabel(token);
        if (parsed) {
          items.push({
            id: parsed.id,
            label: parsed.label,
            seasonGroupId: groupKey,
            seasonNumber: seasonNum++,
            groupLabel: `Franchise Group (Merged)`
          });
        }
      });
    } else {
      // Standard standalone items
      parsePlainItems(text, items);
    }

    return items;
  }, [inputIds, groupAllAsSeasons]);

  function extractIdAndLabel(token: string): { id: number; label?: string } | null {
    // Check for pattern like: 20 {naruto} or 1735
    const match = token.match(/(\d+)(?:\s*\{([^}]+)\})?/);
    if (!match) return null;
    const id = parseInt(match[1], 10);
    if (Number.isNaN(id) || id <= 0) return null;
    return {
      id,
      label: match[2]?.trim()
    };
  }

  function parsePlainItems(rawStr: string, list: ParsedImportItem[]) {
    const tokens = rawStr.split(/[,;\n\s]+/).map(s => s.trim()).filter(Boolean);
    tokens.forEach(tok => {
      const parsed = extractIdAndLabel(tok);
      if (parsed) {
        // avoid duplicate if already in list
        if (!list.some(it => it.id === parsed.id)) {
          list.push({
            id: parsed.id,
            label: parsed.label
          });
        }
      }
    });
  }

  const verifyLink = async (url: string): Promise<boolean> => {
    try {
      const res = await axios.post('/api/verify-link', { url });
      return res.data.status === 'alive';
    } catch (e) {
      return false;
    }
  };

  const fetchAniListMetadata = async (id: number) => {
    const queryStr = `
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          id
          idMal
          isAdult
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
      query: queryStr,
      variables: { id }
    });

    return res.data?.data?.Media;
  };

  const fetchFillers = async (malId: number): Promise<Set<number>> => {
    const fillers = new Set<number>();
    try {
      let page = 1;
      let hasNextPage = true;
      while (hasNextPage) {
        const res = await axios.get(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
        const data = res.data;
        if (data && data.data) {
          for (const ep of data.data) {
            if (ep.filler) fillers.add(ep.mal_id);
          }
        }
        hasNextPage = data?.pagination?.has_next_page || false;
        if (hasNextPage) await new Promise(r => setTimeout(r, 400));
      }
    } catch (err) {
      // silently fail if Jikan is rate limited
    }
    return fillers;
  };

  const startImport = async () => {
    if (isProcessing) return;

    if (parsedItems.length === 0) {
      addLog('No valid AniList IDs found in input.', 'error');
      return;
    }

    if (parsedItems.length > 20) {
      addLog('Maximum 20 IDs allowed in a single batch to prevent API rate limits.', 'error');
      return;
    }

    if (!importSub && !importDub && !importMulti) {
      addLog('Please enable at least one server type (Sub, Dub, or Multi).', 'error');
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    setProgress({ current: 0, total: parsedItems.length });
    addLog(`Starting bulk import for ${parsedItems.length} anime...`, 'info');
    addLog(`Active Server Filters: ${[importSub && 'SUB', importDub && 'DUB', importMulti && 'MULTI'].filter(Boolean).join(', ')}`, 'info');

    // Keep track of which season groups were touched so we can finalize linkedSeasons at the end
    const touchedGroups = new Set<string>();

    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const aniId = item.id;
      setProgress({ current: i + 1, total: parsedItems.length });
      
      const seasonInfo = item.seasonGroupId 
        ? ` [Season ${item.seasonNumber || 1}${item.label ? ` - ${item.label}` : ''}]` 
        : '';
      addLog(`\n[${i + 1}/${parsedItems.length}] Processing AniList ID: ${aniId}${seasonInfo}...`, 'info');

      try {
        // 1. Fetch AniList Metadata
        addLog(`Fetching metadata from AniList...`, 'info');
        const meta = await fetchAniListMetadata(aniId);
        
        if (!meta) {
          addLog(`Could not find anime with AniList ID ${aniId}`, 'error');
          continue;
        }

        const title = item.label || meta.title.english || meta.title.romaji || meta.title.native || `Anime ${aniId}`;
        const totalEpisodes = meta.episodes || 0;
        
        addLog(`Found: "${title}" (${totalEpisodes} episodes)`, 'success');

        if (totalEpisodes === 0) {
          addLog(`Anime "${title}" has 0 episodes in AniList. Skipping import.`, 'warning');
          continue;
        }

        // Fetch fillers if MAL ID exists
        let fillerSet = new Set<number>();
        if (meta.idMal && totalEpisodes > 0) {
          addLog(`Fetching filler list from Jikan (MAL ID: ${meta.idMal})...`, 'info');
          fillerSet = await fetchFillers(meta.idMal);
        }

        // 2. Pre-check servers (Episode 1) respecting toggles
        addLog(`Pre-checking server availability...`, 'info');
        
        const servers = {
          aniSub: false,
          aniDub: false,
          malSub: false,
          malDub: false,
          multi: false
        };

        if (totalEpisodes > 0) {
          // Check Sub servers if enabled
          if (importSub) {
            servers.aniSub = await verifyLink(`https://megaplay.buzz/stream/ani/${aniId}/1/sub`);
            if (servers.aniSub) addLog(`✓ HD-1 (Sub) server verified`, 'success');
            
            if (meta.idMal) {
              servers.malSub = await verifyLink(`https://megaplay.buzz/stream/mal/${meta.idMal}/1/sub`);
              if (servers.malSub) addLog(`✓ HD-2 (Sub) server verified`, 'success');
            }
          }

          // Check Dub servers if enabled
          if (importDub) {
            servers.aniDub = await verifyLink(`https://megaplay.buzz/stream/ani/${aniId}/1/dub`);
            if (servers.aniDub) addLog(`✓ HD-1 (Dub) server verified`, 'success');

            if (meta.idMal) {
              servers.malDub = await verifyLink(`https://megaplay.buzz/stream/mal/${meta.idMal}/1/dub`);
              if (servers.malDub) addLog(`✓ HD-2 (Dub) server verified`, 'success');
            }
          }

          // Check YUME Multi server if enabled
          if (importMulti) {
            const targetId = aniId || meta.idMal;
            servers.multi = await verifyLink(`https://yumestream.pages.dev/${targetId}/1`);
            if (servers.multi) addLog(`✓ YUME server verified`, 'success');
          }
        }

        const hasAnyServer = servers.aniSub || servers.aniDub || servers.malSub || servers.malDub || servers.multi;

        // Skip anime if no valid episodes/servers exist (ensures 0 sub and dub won't clutter database)
        if (!hasAnyServer) {
          addLog(`No valid servers found for "${title}". Skipping creation to prevent empty anime.`, 'warning');
          continue;
        }

        // 3. Save Anime document to Firestore
        // Notice: Every anime gets its OWN standalone document so it appears distinctly in Search & Catalog!
        const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `anime-${aniId}`;
        const q = query(collection(db, 'anime'), where('aniListId', '==', String(aniId)));
        const querySnapshot = await getDocs(q);
        
        let animeDocRef;
        let animeId;
        const now = Date.now();

        if (querySnapshot.empty) {
          // Check if slug is already used
          const slugQ = query(collection(db, 'anime'), where('slug', '==', baseSlug));
          const slugSnap = await getDocs(slugQ);
          const finalSlug = slugSnap.empty ? baseSlug : `${baseSlug}-${aniId}`;

          addLog(`Creating new anime record...`, 'info');
          animeDocRef = doc(collection(db, 'anime'));
          animeId = animeDocRef.id;
          
          const newAnime: Partial<Anime> = {
            id: animeId,
            title: title,
            nativeTitle: meta.title.native || meta.title.romaji || '',
            slug: finalSlug,
            aniListId: String(aniId),
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
            createdAt: now,
            updatedAt: now,
            published: true
          };

          const isAdult = Boolean(meta.isAdult || meta.genres?.some((g: string) => ['Hentai', 'Adult', '18+'].includes(g)));
          if (isAdult) {
            newAnime.isAdult = true;
          }

          if (item.seasonGroupId) {
            newAnime.seasonGroupId = item.seasonGroupId;
            newAnime.seasonNumber = item.seasonNumber || 1;
          }

          await setDoc(animeDocRef, newAnime);
        } else {
          animeDocRef = querySnapshot.docs[0].ref;
          animeId = animeDocRef.id;

          addLog(`Updating existing anime record...`, 'info');
          const updateData: any = {
            updatedAt: now,
            totalEpisodes: totalEpisodes,
            status: meta.status || 'FINISHED'
          };
          if (meta.isAdult !== undefined) {
            updateData.isAdult = Boolean(meta.isAdult || meta.genres?.some((g: string) => ['Hentai', 'Adult', '18+'].includes(g)));
          }
          if (item.seasonGroupId) {
            updateData.seasonGroupId = item.seasonGroupId;
            updateData.seasonNumber = item.seasonNumber || 1;
          }
          await updateDoc(animeDocRef, updateData);
        }

        if (item.seasonGroupId) {
          touchedGroups.add(item.seasonGroupId);
        }

        // 4. Populate Episodes
        let addedEps = 0;
        addLog(`Generating episodes...`, 'info');
        
        const epQuery = query(collection(db, 'episodes'), where('animeId', '==', animeId));
        const existingEpsSnap = await getDocs(epQuery);
        
        const existingEpsMap = new Map();
        existingEpsSnap.docs.forEach(d => {
          existingEpsMap.set(d.data().episodeNumber, { ...d.data(), id: d.id });
        });

        for (let epNum = 1; epNum <= totalEpisodes; epNum++) {
          const availableServers = [];
          
          if (servers.aniSub) availableServers.push({ serverName: 'HD-1', serverType: 'sub', embedLink: `https://megaplay.buzz/stream/ani/${aniId}/${epNum}/sub` });
          if (servers.aniDub) availableServers.push({ serverName: 'HD-1', serverType: 'dub', embedLink: `https://megaplay.buzz/stream/ani/${aniId}/${epNum}/dub` });
          if (servers.multi) {
            const targetId = aniId || meta.idMal;
            availableServers.push({ serverName: 'YUME', serverType: 'multi', embedLink: `https://yumestream.pages.dev/${targetId}/${epNum}` });
          }
          if (servers.malSub) availableServers.push({ serverName: 'HD-2', serverType: 'sub', embedLink: `https://megaplay.buzz/stream/mal/${meta.idMal}/${epNum}/sub` });
          if (servers.malDub) availableServers.push({ serverName: 'HD-2', serverType: 'dub', embedLink: `https://megaplay.buzz/stream/mal/${meta.idMal}/${epNum}/dub` });

          if (availableServers.length === 0) continue;

          const existingEp = existingEpsMap.get(epNum);
          const epDocId = existingEp ? existingEp.id : `${animeId}_s1_${epNum}`;
          const epDocRef = doc(db, 'episodes', epDocId);
          const isFiller = fillerSet.has(epNum);
          
          if (existingEp) {
            let updated = false;
            const currentServers = Array.isArray(existingEp.servers) ? [...existingEp.servers] : [];
            
            for (const newSrv of availableServers) {
              const exists = currentServers.some(s => s.serverName === newSrv.serverName && s.serverType === newSrv.serverType);
              if (!exists) {
                currentServers.push(newSrv);
                updated = true;
              }
            }
            
            if (updated) {
              await setDoc(epDocRef, { servers: currentServers }, { merge: true });
              addedEps++;
            }
          } else {
            const newEp = {
              id: epDocId,
              animeId: animeId,
              seasonId: 's1',
              episodeNumber: epNum,
              title: `Episode ${epNum}`,
              servers: availableServers,
              thumbnailUrl: meta.coverImage?.large || '',
              isFiller: isFiller,
              createdAt: now,
              published: true
            };
            await setDoc(epDocRef, newEp);
            addedEps++;
          }
        }
        
        // 5. Aggregate episode counts
        const allEpsQuery = query(collection(db, 'episodes'), where('animeId', '==', animeId));
        const allEpsSnap = await getDocs(allEpsQuery);
        let subCount = 0;
        let dubCount = 0;
        let multiCount = 0;
        
        allEpsSnap.forEach(d => {
          const data = d.data();
          if (data.servers?.some((s: any) => s.serverType === 'sub')) subCount++;
          if (data.servers?.some((s: any) => s.serverType === 'dub')) dubCount++;
          if (data.servers?.some((s: any) => s.serverType === 'multi')) multiCount++;
        });

        await setDoc(animeDocRef, { 
          subEpisodesCount: subCount,
          dubEpisodesCount: dubCount,
          multiEpisodesCount: multiCount
        }, { merge: true });

        addLog(`✓ Finished: "${title}" (Sub: ${subCount}, Dub: ${dubCount}, Multi: ${multiCount})`, 'success');

      } catch (err: any) {
        addLog(`Error processing ID ${aniId}: ${err.message}`, 'error');
      }
    }

    // 6. Finalize Season Groups across all member anime
    if (touchedGroups.size > 0) {
      addLog(`\nSynchronizing linked seasons across franchise groups...`, 'info');
      for (const groupId of Array.from(touchedGroups)) {
        try {
          const linked = await syncSeasonGroup(groupId);
          if (linked.length > 0) {
            addLog(`✓ Linked ${linked.length} seasons for franchise group: ${linked.map(l => l.title).join(' → ')}`, 'success');
          }
        } catch (e: any) {
          addLog(`Could not sync group ${groupId}: ${e.message}`, 'warning');
        }
      }
    }

    addLog('\nBulk import completed!', 'success');
    setIsProcessing(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Auto Anime Fetcher</h1>
          <p className="text-yoru-text-muted text-sm mt-1">
            Bulk import anime using AniList IDs. Supports brackets for franchise seasons and server toggles.
          </p>
        </div>
      </div>
      
      <div className="bg-yoru-surface border border-yoru-border p-6 rounded-xl space-y-6">
        
        {/* AniList IDs Text Area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-yoru-text-muted">
            <span>AniList IDs & Seasons</span>
            <span className="text-yoru-accent">Max 20 IDs</span>
          </div>
          <textarea
            value={inputIds}
            onChange={(e) => setInputIds(e.target.value)}
            disabled={isProcessing}
            placeholder={'e.g. 10, 255, (895, 897,) 555\nor (20 {naruto}, 1735 {naruto shippuden})'}
            className="w-full h-32 bg-[#1a1c23] border border-yoru-border rounded-lg p-4 text-white focus:outline-none focus:border-yoru-accent resize-none font-mono text-sm disabled:opacity-50"
          />
          <div className="text-xs text-yoru-text-muted space-y-1">
            <p>• IDs in brackets <code className="text-yoru-accent bg-white/5 px-1 py-0.5 rounded">(895, 897)</code> will be imported as Season 1, Season 2, etc.</p>
            <p>• You can optionally include title hints inside braces, e.g. <code className="text-yoru-accent bg-white/5 px-1 py-0.5 rounded">20 &#123;naruto&#125;, 1735 &#123;naruto shippuden&#125;</code></p>
          </div>
        </div>

        {/* Server Selection Toggles (Sub, Dub, Multi) */}
        <div className="bg-yoru-bg border border-yoru-border p-4 rounded-lg space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted block">
            Servers to Import:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            {/* Sub Toggle */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-yoru-surface border border-yoru-border/60 cursor-pointer hover:border-yoru-accent/50 transition-colors">
              <input
                type="checkbox"
                checked={importSub}
                onChange={(e) => setImportSub(e.target.checked)}
                disabled={isProcessing}
                className="w-4 h-4 rounded text-yoru-accent bg-yoru-bg border-yoru-border focus:ring-0 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  Sub Servers
                </span>
                <span className="text-[11px] text-yoru-text-muted">HD-1 & HD-2 Sub</span>
              </div>
            </label>

            {/* Dub Toggle */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-yoru-surface border border-yoru-border/60 cursor-pointer hover:border-yoru-accent/50 transition-colors">
              <input
                type="checkbox"
                checked={importDub}
                onChange={(e) => setImportDub(e.target.checked)}
                disabled={isProcessing}
                className="w-4 h-4 rounded text-yoru-accent bg-yoru-bg border-yoru-border focus:ring-0 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Dub Servers
                </span>
                <span className="text-[11px] text-yoru-text-muted">HD-1 & HD-2 Dub</span>
              </div>
            </label>

            {/* Multi / YUME Toggle */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-yoru-surface border border-yoru-border/60 cursor-pointer hover:border-yoru-accent/50 transition-colors">
              <input
                type="checkbox"
                checked={importMulti}
                onChange={(e) => setImportMulti(e.target.checked)}
                disabled={isProcessing}
                className="w-4 h-4 rounded text-yoru-accent bg-yoru-bg border-yoru-border focus:ring-0 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  YUME (Multi)
                </span>
                <span className="text-[11px] text-yoru-text-muted">yumestream.pages.dev</span>
              </div>
            </label>

          </div>
        </div>

        {/* Merge all IDs fallback switch */}
        <div className="flex items-center gap-3 bg-yoru-bg border border-yoru-border p-4 rounded-lg">
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={groupAllAsSeasons} 
              onChange={(e) => setGroupAllAsSeasons(e.target.checked)}
              disabled={isProcessing}
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yoru-accent"></div>
          </label>
          <div>
            <span className="text-sm font-bold text-white tracking-wide block">
              Merge ALL listed IDs as Seasons into one Franchise Group
            </span>
            <span className="text-xs text-yoru-text-muted">
              Use this if you did not enclose IDs in brackets <code className="text-yoru-accent">(...)</code>.
            </span>
          </div>
        </div>

        {/* Parsed Structure Preview */}
        {parsedItems.length > 0 && (
          <div className="bg-yoru-bg border border-white/10 rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-white">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-yoru-accent" />
                Detected Structure ({parsedItems.length} Titles)
              </span>
              <span className="text-yoru-text-muted font-mono">Ready to import</span>
            </div>
            
            <div className="flex flex-wrap gap-2 pt-1">
              {parsedItems.map((item, idx) => (
                <div
                  key={`${item.id}-${idx}`}
                  className={`text-xs px-2.5 py-1 rounded-md border font-mono flex items-center gap-1.5 ${
                    item.seasonGroupId
                      ? 'bg-yoru-accent/10 border-yoru-accent/30 text-white'
                      : 'bg-white/5 border-white/10 text-yoru-text-muted'
                  }`}
                >
                  <span className="font-bold text-white">{item.id}</span>
                  {item.label && <span className="text-yoru-accent italic">"{item.label}"</span>}
                  {item.seasonNumber && (
                    <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-yoru-accent font-sans uppercase font-bold">
                      S{item.seasonNumber}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress bar */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-yoru-text-muted uppercase tracking-widest">
              <span>Progress</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-yoru-bg h-2 rounded-full overflow-hidden border border-yoru-border">
              <div 
                className="bg-yoru-accent h-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
        
        <button
          onClick={startImport}
          disabled={isProcessing || parsedItems.length === 0}
          className="bg-yoru-accent hover:bg-yoru-accent/90 disabled:opacity-50 text-yoru-bg px-6 py-3 rounded text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors w-full shadow-lg shadow-yoru-accent/20 cursor-pointer"
        >
          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
          {isProcessing ? 'Importing Anime...' : `Start Bulk Import (${parsedItems.length} items)`}
        </button>
      </div>
      
      {/* Console Logs */}
      {logs.length > 0 && (
        <div className="bg-[#1a1c23] border border-yoru-border rounded-xl p-4 h-96 overflow-y-auto font-mono text-xs shadow-inner">
          <h4 className="text-white/50 mb-4 font-bold uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
            Console Logs
            {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
          </h4>
          <div className="space-y-2 pb-4">
            {logs.map((log, idx) => {
              let color = 'text-white/70';
              let Icon = null;
              
              if (log.type === 'error') {
                color = 'text-red-400';
                Icon = XCircle;
              } else if (log.type === 'success') {
                color = 'text-green-400';
                Icon = CheckCircle;
              } else if (log.type === 'warning') {
                color = 'text-yellow-400';
                Icon = AlertTriangle;
              }

              return (
                <div key={idx} className={`flex items-start gap-2 ${color} ${log.message.startsWith('\n') ? 'mt-4' : ''}`}>
                  {Icon && <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                  <span className="whitespace-pre-wrap leading-relaxed">{log.message.trim()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
