import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { Anime, Episode } from '../types';
import { getAnimeBySlug, getEpisodesForAnime } from '../lib/data';
import { useAuth } from '../contexts/AuthContext';
import { Maximize, SkipBack, SkipForward, Server, Flag, Lightbulb, PlayCircle, Loader2, Check, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../components/ui/Button';
import { WatchlistButton } from '../components/WatchlistButton';
import { CommentSection } from '../components/CommentSection';
import { ReportModal } from '../components/ReportModal';
import { normalizeEpisodes } from '../lib/episodeUtils';
import { getServerConfig, applyDynamicDomainOverride, ServerConfig } from '../lib/serverSettings';
import { is18PlusAnime } from '../lib/utils';

export const Watch = () => {
  const { slug, episodeNum } = useParams();
  const [searchParams] = useSearchParams();
  const seasonParam = searchParams.get('season');
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [anime, setAnime] = useState<Anime | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [activeServerIdx, setActiveServerIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  
  const [autoplay, setAutoplay] = useState(() => {
    try {
      const stored = localStorage.getItem('yoru_autoplay');
      return stored !== null ? stored === 'true' : true;
    } catch { return true; }
  });
  const [autoNext, setAutoNext] = useState(() => {
    try {
      const stored = localStorage.getItem('yoru_autonext');
      return stored !== null ? stored === 'true' : true;
    } catch { return true; }
  });
  const [isLightDimmed, setIsLightDimmed] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState<string[]>([]);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const toggleAutoplay = () => {
    const next = !autoplay;
    setAutoplay(next);
    try { localStorage.setItem('yoru_autoplay', String(next)); } catch {}
  };

  const toggleAutoNext = () => {
    const next = !autoNext;
    setAutoNext(next);
    try { localStorage.setItem('yoru_autonext', String(next)); } catch {}
  };
  
  const CHUNK_SIZE = 100;
  const [selectedChunkIdx, setSelectedChunkIdx] = useState(0);
  const [jumpInput, setJumpInput] = useState('');

  const playerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentEpisode) {
      const chunkForCurrent = Math.max(0, Math.floor((currentEpisode.episodeNumber - 1) / CHUNK_SIZE));
      setSelectedChunkIdx(chunkForCurrent);
    }
  }, [currentEpisode?.episodeNumber]);

  useEffect(() => {
    // Removed document.body.style.overflow = 'hidden' to allow scrolling in light mode
  }, [isLightDimmed]);

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;
      try {
        getServerConfig().then(cfg => setServerConfig(cfg)).catch(() => {});
        let animeData: Anime | null = null;
        const q = query(collection(db, 'anime'), where('slug', '==', slug));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          animeData = querySnapshot.docs[0].data() as Anime;
        } else {
          animeData = await getAnimeBySlug(slug);
        }
        
        if (animeData) {
          setAnime(animeData);
          
          let allEps: Episode[] = [];
          const epQ = query(collection(db, 'episodes'), where('animeId', '==', animeData.id));
          const epSnap = await getDocs(epQ);
          if (!epSnap.empty) {
            const rawDocs = epSnap.docs.map(d => ({ ...d.data(), id: d.id }));
            allEps = normalizeEpisodes(rawDocs);
          } else {
            const fetched = await getEpisodesForAnime(animeData.id);
            allEps = normalizeEpisodes(fetched);
          }
          setEpisodes(allEps);
          
          // Determine best active season
          const seasons = animeData.seasons && animeData.seasons.length > 0 
            ? animeData.seasons 
            : [{ id: 's1', name: 'Season 1', order: 1 }];

          let targetSeasonId = seasonParam;
          if (!targetSeasonId || !allEps.some(e => e.seasonId === targetSeasonId)) {
            if (seasonParam && seasons.some(s => s.id === seasonParam)) {
              targetSeasonId = seasonParam;
            } else if (allEps.length > 0) {
              targetSeasonId = allEps[0].seasonId;
            } else {
              targetSeasonId = seasons[0]?.id || 's1';
            }
          }

          let targetEpisodeNum = episodeNum ? parseInt(episodeNum, 10) : null;

          // Smart Resume Logic if no episode number in URL
          if (!episodeNum) {
            let lastWatchedId: string | null = null;
            if (user) {
              const progressRef = doc(db, 'watchProgress', `${user.uid}_${animeData.id}`);
              const progressDoc = await getDoc(progressRef);
              if (progressDoc.exists()) {
                const data = progressDoc.data();
                lastWatchedId = data.lastWatchedEpisode || null;
                setWatchedEpisodes(data.watchedEpisodeIds || []);
              }
            } else {
              const history = JSON.parse(localStorage.getItem('yoru_watch_history') || '[]');
              const item = history.find((h: any) => h.animeId === animeData.id);
              if (item) {
                targetEpisodeNum = item.episodeNumber;
              }
            }
            
            if (lastWatchedId) {
              const lastWatchedEp = allEps.find(e => e.id === lastWatchedId);
              if (lastWatchedEp) {
                targetEpisodeNum = lastWatchedEp.episodeNumber;
                targetSeasonId = lastWatchedEp.seasonId;
              }
            }

            if (!targetEpisodeNum && allEps.length > 0) {
              const seasonEps = allEps.filter(e => e.seasonId === targetSeasonId);
              const firstEp = seasonEps.length > 0 ? seasonEps[0] : allEps[0];
              targetEpisodeNum = firstEp.episodeNumber;
              targetSeasonId = firstEp.seasonId;
            }
            
            if (targetEpisodeNum) {
              navigate(`/watch/${animeData.slug}/${targetEpisodeNum}?season=${targetSeasonId}`, { replace: true });
              return; 
            }
          }

          // Load cached local watched episodes
          try {
            const localSaved = JSON.parse(localStorage.getItem(`yoru_watched_${animeData.id}`) || '[]');
            if (Array.isArray(localSaved) && localSaved.length > 0) {
              setWatchedEpisodes(prev => Array.from(new Set([...prev, ...localSaved])));
            }
          } catch (e) {}

          if (user) {
            const progressRef = doc(db, 'watchProgress', `${user.uid}_${animeData.id}`);
            const progressDoc = await getDoc(progressRef);
            if (progressDoc.exists()) {
              const firestoreWatched = progressDoc.data().watchedEpisodeIds || [];
              setWatchedEpisodes(prev => Array.from(new Set([...prev, ...firestoreWatched])));
            }
          }
          
          // Find selected episode
          if (targetEpisodeNum !== null) {
            let selectedEp = allEps.find(e => 
              e.episodeNumber === targetEpisodeNum && 
              e.seasonId === targetSeasonId
            );

            // Fallback: if not found in target season, search across all seasons
            if (!selectedEp) {
              selectedEp = allEps.find(e => e.episodeNumber === targetEpisodeNum);
            }

            // Fallback: take first available episode in season or overall
            if (!selectedEp && allEps.length > 0) {
              const seasonEps = allEps.filter(e => e.seasonId === targetSeasonId);
              selectedEp = seasonEps[0] || allEps[0];
            }

            if (selectedEp) {
              setCurrentEpisode(selectedEp);
              
              const savedType = localStorage.getItem('preferredServerType') || 'sub';
              const savedName = localStorage.getItem('preferredServerName') || 'HD-1';
              
              if (selectedEp.servers && selectedEp.servers.length > 0) {
                let sIdx = selectedEp.servers.findIndex(s => (s.serverType || 'sub') === savedType && s.serverName === savedName);
                if (sIdx === -1) sIdx = selectedEp.servers.findIndex(s => (s.serverType || 'sub') === savedType);
                if (sIdx === -1) sIdx = 0;
                setActiveServerIdx(sIdx);
              } else {
                setActiveServerIdx(0);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error loading watch page data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, episodeNum, seasonParam, user, navigate]);

  // Current active season identifier
  const currentSeasonId = currentEpisode?.seasonId || seasonParam || 's1';
  const seasonEpisodes = episodes.filter(e => e.seasonId === currentSeasonId);
  const uniqueEpisodes = [...seasonEpisodes].sort((a, b) => a.episodeNumber - b.episodeNumber);

  const currentEpisodeServers = currentEpisode?.servers || [];
  const activeServer = currentEpisodeServers[activeServerIdx] || currentEpisodeServers[0] || null;
  const initialEmbedLink = activeServer?.embedLink || (currentEpisode as any)?.embedLink || '';
  const rawEmbedLink = applyDynamicDomainOverride(initialEmbedLink, serverConfig);

  let finalIframeSrc = '';
  if (rawEmbedLink) {
    try {
      const url = new URL(rawEmbedLink.startsWith('//') ? `https:${rawEmbedLink}` : rawEmbedLink);
      // Only inject autoplay parameters for known providers (like YouTube) that support it.
      // Other third-party anime embeds (like Megaplay, AnimeSalt) either don't support it 
      // or don't use standard parameters, so we gracefully leave them unmodified to prevent breaking.
      if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
        if (autoplay) {
          url.searchParams.set('autoplay', '1');
        } else {
          url.searchParams.set('autoplay', '0');
        }
      }
      finalIframeSrc = url.toString();
    } catch (e) {
      finalIframeSrc = rawEmbedLink;
    }
  }

  useEffect(() => {
    setIframeLoaded(false);
  }, [finalIframeSrc, currentEpisode?.id, activeServerIdx]);

  useEffect(() => {
    if (currentEpisode && anime) {
      const epKey = `${currentEpisode.seasonId}_${currentEpisode.episodeNumber}`;
      const epFullId = currentEpisode.id;
      const epNumStr = String(currentEpisode.episodeNumber);

      const markWatched = async () => {
        let isNewEpisode = false;
        
        setWatchedEpisodes(prev => {
          isNewEpisode = !prev.includes(epFullId);
          const updated = Array.from(new Set([...prev, epFullId, epKey, epNumStr]));
          try {
            localStorage.setItem(`yoru_watched_${anime.id}`, JSON.stringify(updated));
          } catch (e) {}

          if (user) {
            const progressRef = doc(db, 'watchProgress', `${user.uid}_${anime.id}`);
            setDoc(progressRef, {
              userId: user.uid,
              animeId: anime.id,
              watchedEpisodeIds: updated,
              lastWatchedEpisode: epFullId,
              updatedAt: Date.now()
            }, { merge: true }).catch(err => console.error("Error updating watchProgress:", err));
          }
          return updated;
        });

        if (user && isNewEpisode) {
          import('firebase/firestore').then(({ increment, updateDoc }) => {
            const userRef = doc(db, 'users', user.uid);
            updateDoc(userRef, { watchCount: increment(1) }).catch(e => console.warn("Failed to increment watch count", e));
          });
        }

        try {
          const history = JSON.parse(localStorage.getItem('yoru_watch_history') || '[]');
          const newHistoryItem = {
            animeId: anime.id,
            slug: anime.slug,
            title: anime.title,
            coverImage: anime.poster,
            backdrop: anime.backdrop,
            episodeNumber: currentEpisode.episodeNumber,
            seasonId: currentEpisode.seasonId,
            updatedAt: Date.now()
          };
          const existingIdx = history.findIndex((h: any) => h.animeId === anime.id);
          if (existingIdx !== -1) history.splice(existingIdx, 1);
          history.unshift(newHistoryItem);
          localStorage.setItem('yoru_watch_history', JSON.stringify(history.slice(0, 10)));
        } catch (e) {
          console.error("Local storage save error", e);
        }
      };

      const timer = setTimeout(markWatched, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentEpisode?.id, currentEpisode?.seasonId, currentEpisode?.episodeNumber, user?.uid, anime?.id]);

  const currentIndex = currentEpisode ? uniqueEpisodes.findIndex(e => e.episodeNumber === currentEpisode.episodeNumber) : -1;
  const nextEpisode = currentIndex >= 0 && currentIndex < uniqueEpisodes.length - 1 ? uniqueEpisodes[currentIndex + 1] : null;
  const prevEpisode = currentIndex > 0 ? uniqueEpisodes[currentIndex - 1] : null;

  // Note: Third-party cross-origin embeds (Megaplay, AnimeSalt, etc.) in this app
  // do not expose a reliable public API or standard postMessage for "ended" events.
  // As per strict instructions, we gracefully leave Auto Next functionally unsupported 
  // for these providers rather than falsely triggering it with generic hacks or timers.
  // The toggle state remains in the UI and persists, but will only be active if a provider 
  // with a documented API is implemented in the future.

  if (loading) return (
    <div className="min-h-screen bg-[#0A0B0E] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-yoru-accent animate-spin" />
    </div>
  );

  if (!anime || !currentEpisode) return (
    <div className="min-h-screen bg-[#0A0B0E] flex items-center justify-center text-white p-6">
      <div className="text-center space-y-4 max-w-md">
        <AlertCircle className="w-12 h-12 text-yoru-accent mx-auto" />
        <h2 className="text-2xl font-bold uppercase tracking-widest text-white">Episode Not Found</h2>
        <p className="text-sm text-yoru-text-muted">
          No episodes are available for this season yet.
        </p>
        <Button onClick={() => navigate(anime ? `/anime/${anime.slug}` : '/')} variant="primary" size="md">
          Back to Anime
        </Button>
      </div>
    </div>
  );

  const handleServerChange = (sIdx: number) => {
    setActiveServerIdx(sIdx);
    const newServer = currentEpisodeServers[sIdx];
    if (newServer) {
      if (newServer.serverType) localStorage.setItem('preferredServerType', newServer.serverType);
      if (newServer.serverName) localStorage.setItem('preferredServerName', newServer.serverName);
    }
  };

  const toggleTheaterMode = () => setIsTheaterMode(!isTheaterMode);
  const isCompact = uniqueEpisodes.length > 30;
  const totalChunks = Math.ceil(uniqueEpisodes.length / CHUNK_SIZE);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(jumpInput.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= uniqueEpisodes.length) {
      const targetEp = uniqueEpisodes.find(ep => ep.episodeNumber === num);
      if (targetEp) {
        const targetChunk = Math.max(0, Math.floor((num - 1) / CHUNK_SIZE));
        setSelectedChunkIdx(targetChunk);
        navigate(`/watch/${anime.slug}/${targetEp.episodeNumber}?season=${currentSeasonId}`);
        setJumpInput('');
      }
    }
  };

  const displayedEpisodes = uniqueEpisodes.length > CHUNK_SIZE
    ? uniqueEpisodes.slice(selectedChunkIdx * CHUNK_SIZE, (selectedChunkIdx + 1) * CHUNK_SIZE)
    : uniqueEpisodes;

  return (
    <div className={clsx("min-h-screen pt-[60px] md:pt-[72px] pb-24 transition-colors duration-500", isLightDimmed ? "bg-[#030407]" : "bg-[#0A0B0E]")}>
      
      {/* Light Dimmer Overlay */}
      {isLightDimmed && (
        <div 
          className="fixed inset-0 bg-black/95 z-[9990] transition-opacity duration-500 cursor-pointer" 
          onClick={() => setIsLightDimmed(false)}
        />
      )}

      {/* Report Modal */}
      {anime && currentEpisode && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          animeTitle={anime.title}
          episodeNumber={currentEpisode.episodeNumber}
          animeId={anime.id}
          seasonId={currentSeasonId}
          episodeId={currentEpisode.id}
        />
      )}

      <div className="w-full flex flex-col relative">
        
        {/* TOP SECTION: Player & Toolbar */}
        <div className={clsx("w-full mx-auto transition-all duration-500 flex flex-col",
          isTheaterMode ? "max-w-full" : "max-w-[1440px] px-0 md:px-6 lg:px-8 pt-0 md:pt-4"
        )}>
          <div className={clsx("w-full mx-auto flex flex-col shadow-2xl transition-all duration-500",
            !isLightDimmed && "overflow-hidden",
            isLightDimmed ? "bg-transparent relative z-[9999]" : "bg-[#0F1117]",
            isTheaterMode ? "max-w-full rounded-none border-0" : clsx(
              "max-w-[1100px] rounded-none md:rounded-2xl border-0 md:border",
              isLightDimmed ? "border-transparent" : "border-white/5"
            )
          )}>
            {/* Player */}
            <div className={clsx("relative w-full bg-black transition-all duration-500", 
              isTheaterMode ? "h-[40vh] sm:h-[60vh] md:h-[75vh] lg:h-[85vh] max-h-[calc(100vh-60px)] md:max-h-[calc(100vh-80px)]" : "aspect-video max-h-[calc(100vh-140px)] md:max-h-[calc(100vh-160px)]",
              "z-10"
            )}>
              {finalIframeSrc ? (
                <>
                  {!iframeLoaded && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                      <Loader2 className="w-10 h-10 text-yoru-accent animate-spin mb-4" />
                      <p className="text-white/70 text-sm font-medium animate-pulse tracking-wide">Loading video player...</p>
                    </div>
                  )}
                  <iframe
                    key={`${currentEpisode.id}_${activeServerIdx}`}
                    src={finalIframeSrc}
                    allowFullScreen
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    className={clsx(
                      "absolute inset-0 w-full h-full border-0 transition-opacity duration-500",
                      iframeLoaded ? "opacity-100" : "opacity-0"
                    )}
                    onLoad={() => setIframeLoaded(true)}
                  />
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#07080B] text-center p-6 space-y-3">
                  <PlayCircle className="w-12 h-12 text-yoru-accent/60 animate-pulse" />
                  <p className="text-white font-bold tracking-wide text-sm">No streaming embed link available for this server.</p>
                  <p className="text-xs text-yoru-text-muted">Please select another server below or check back later.</p>
                </div>
              )}
            </div>

            {/* Quick Control Ribbon - Standardized button heights and normalized grouping */}
            <div 
              className={clsx(
                "flex flex-wrap items-center justify-between p-3 md:p-3.5 gap-3 relative z-10 border-t overflow-hidden transition-colors duration-500",
                isLightDimmed ? "bg-transparent border-transparent" : "bg-[#0F1117] border-white/5"
              )}
              onClick={(e) => {
                if (isLightDimmed) {
                  setIsLightDimmed(false);
                }
              }}
            >
              {isLightDimmed && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-0 transition-opacity duration-500" />
              )}
              <div className="flex items-center gap-2.5 flex-wrap relative z-10">
                <button 
                  onClick={toggleTheaterMode} 
                  className="h-9 min-h-[36px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-yoru-text-muted hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                  title="Toggle Theater Mode"
                  aria-label="Toggle Theater Mode"
                >
                  <Maximize className="w-4 h-4" /> 
                  <span className="hidden sm:inline">{isTheaterMode ? 'Collapse' : 'Expand'}</span>
                </button>
                
                {/* Unified playback controls group */}
                <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-lg min-h-[36px]">
                  <label className="flex items-center gap-2 cursor-pointer group" onClick={(e) => { e.preventDefault(); toggleAutoplay(); }}>
                    <div className={clsx("w-7 h-4 rounded-full relative transition-colors duration-300", autoplay ? "bg-yoru-accent" : "bg-white/20")}>
                      <div className={clsx("absolute top-[2px] w-3 h-3 rounded-full shadow-md transition-all duration-300", autoplay ? "left-[14px] bg-black" : "left-[2px] bg-white")} />
                    </div>
                    <span className="text-xs font-medium text-yoru-text-muted group-hover:text-white transition-colors">Auto Play</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer group" onClick={(e) => { e.preventDefault(); toggleAutoNext(); }}>
                    <div className={clsx("w-7 h-4 rounded-full relative transition-colors duration-300", autoNext ? "bg-yoru-accent" : "bg-white/20")}>
                      <div className={clsx("absolute top-[2px] w-3 h-3 rounded-full shadow-md transition-all duration-300", autoNext ? "left-[14px] bg-black" : "left-[2px] bg-white")} />
                    </div>
                    <span className="text-xs font-medium text-yoru-text-muted group-hover:text-white transition-colors hidden sm:inline">Auto Next</span>
                  </label>
                </div>

                <button 
                  onClick={() => setIsLightDimmed(!isLightDimmed)} 
                  className={clsx(
                    "h-9 min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer",
                    isLightDimmed ? "bg-yoru-accent/15 text-yoru-accent font-bold" : "bg-white/5 text-yoru-text-muted hover:bg-white/10 hover:text-white"
                  )}
                  title="Dim Background Lights"
                  aria-label="Dim Background Lights"
                >
                  <Lightbulb className={clsx("w-4 h-4", isLightDimmed && "fill-yoru-accent")} /> 
                  <span className="hidden sm:inline">Light</span>
                </button>
              </div>

              <div className="flex items-center gap-2 relative z-10">
                <button 
                  disabled={!prevEpisode}
                  onClick={() => prevEpisode && navigate(`/watch/${anime.slug}/${prevEpisode.episodeNumber}?season=${currentSeasonId}`)}
                  className="h-9 w-9 min-h-[36px] min-w-[36px] rounded-lg bg-white/5 hover:bg-white/10 text-yoru-text-muted hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors flex items-center justify-center cursor-pointer"
                  title="Previous Episode"
                  aria-label="Previous Episode"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                <button 
                  disabled={!nextEpisode}
                  onClick={() => nextEpisode && navigate(`/watch/${anime.slug}/${nextEpisode.episodeNumber}?season=${currentSeasonId}`)}
                  className="h-9 w-9 min-h-[36px] min-w-[36px] rounded-lg bg-white/5 hover:bg-white/10 text-yoru-text-muted hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors flex items-center justify-center cursor-pointer"
                  title="Next Episode"
                  aria-label="Next Episode"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
                
                <button 
                  onClick={() => setIsReportModalOpen(true)}
                  className="h-9 min-h-[36px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-yoru-text-muted hover:text-white transition-colors hidden sm:flex items-center gap-1.5 cursor-pointer"
                  title="Report playback issue"
                  aria-label="Report playback issue"
                >
                  <Flag className="w-3.5 h-3.5" /> <span>Report</span>
                </button>
              </div>
            </div>
          </div>

          {/* Accessible Primary Page Heading H1 */}
          <div className="w-full max-w-[1100px] mx-auto px-4 md:px-0 mt-4 md:mt-5 mb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-yoru-text-muted">
                {is18PlusAnime(anime) && (
                  <span className="px-1.5 py-0.5 rounded bg-red-600/95 text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                    18+
                  </span>
                )}
                <span>{anime.title}</span>
                {anime.seasonNumber ? (
                  <>
                    <span>•</span>
                    <span className="uppercase text-yoru-accent font-bold">Season {anime.seasonNumber}</span>
                  </>
                ) : (
                  <>
                    <span>•</span>
                    <span className="uppercase">{currentSeasonId}</span>
                  </>
                )}
              </div>
              <h1 className="text-base sm:text-lg md:text-xl font-bold text-white tracking-tight mt-0.5">
                {currentEpisode.title && currentEpisode.title !== `Episode ${currentEpisode.episodeNumber}`
                  ? `Episode ${currentEpisode.episodeNumber}: ${currentEpisode.title}`
                  : `${anime.title} — Episode ${currentEpisode.episodeNumber}`}
              </h1>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <WatchlistButton animeId={anime.id} size="sm" variant="secondary" />
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: Servers & Episodes */}
        <div className="w-full max-w-[1440px] mx-auto px-0 md:px-6 lg:px-8 mt-2 md:mt-6">
           <div className="w-full max-w-[1100px] mx-auto flex flex-col gap-3 md:gap-4">

          {/* 2. Server Selection Hub */}
          <div className="bg-[#0F1117] md:rounded-2xl p-4 md:p-6 border-b md:border border-white/5 flex flex-col gap-4">
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-2 text-xs font-semibold text-yoru-text-muted">
                 <Server className="w-4 h-4 text-yoru-accent" /> Servers
               </div>
               {currentEpisodeServers.length > 0 && (
                 <span className="text-xs font-medium text-white/60 bg-white/5 px-2.5 py-1 rounded-md">
                   {currentEpisodeServers.length} Available
                 </span>
               )}
             </div>
             
             {currentEpisodeServers.length > 0 ? (
               <div className="flex flex-col gap-3">
                 {(['sub', 'dub', 'multi'] as const).map((type) => {
                   const serversOfType = currentEpisodeServers
                     .map((s, originalIdx) => ({ s, originalIdx }))
                     .filter(({ s }) => (s.serverType === type) || (!s.serverType && type === 'sub'));

                   if (serversOfType.length === 0) return null;

                   return (
                     <div key={type} className="flex items-center gap-3">
                       <span className="text-xs font-semibold text-white/50 w-14 shrink-0 uppercase tracking-wide">
                         {type}:
                       </span>
                        <div className="flex flex-wrap gap-2">
                          {serversOfType.map(({ s: serverEp, originalIdx }) => {
                            const isActive = activeServerIdx === originalIdx;
                            const isMegaPlay = /megaplay/i.test(serverEp.serverName || '') || 
                                               /megaplay\.buzz/i.test(serverEp.embedLink || '');
                            const isYume = /yume/i.test(serverEp.serverName || '') ||
                                           /yumestream\.pages\.dev/i.test(serverEp.embedLink || '') ||
                                           /multiserver/i.test(serverEp.serverName || '') ||
                                           /multiserver\.pages\.dev/i.test(serverEp.embedLink || '') ||
                                           serverEp.serverName === 'Multi' ||
                                           (serverEp.serverType === 'multi' && !/abyss|vidstream/i.test(serverEp.serverName || ''));
                            const displayName = isMegaPlay ? 'VidStream-2' : isYume ? 'YUME' : (serverEp.serverName || `Server ${originalIdx + 1}`);

                            return (
                              <button
                                key={`${type}-${originalIdx}-${serverEp.serverName}`}
                                onClick={() => handleServerChange(originalIdx)}
                                className={clsx(
                                  "h-9 min-h-[36px] px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 border flex items-center justify-center cursor-pointer",
                                  isActive
                                    ? "bg-yoru-accent text-[#030407] border-yoru-accent font-bold shadow-[0_0_12px_rgba(255,255,255,0.25)]"
                                    : "bg-white/5 text-yoru-text-muted border-transparent hover:bg-white/10 hover:text-white"
                                )}
                              >
                                {displayName}
                              </button>
                            );
                          })}
                        </div>
                     </div>
                   );
                 })}
               </div>
             ) : (
               <div className="text-xs text-yoru-text-muted py-1 flex items-center gap-2">
                 <AlertCircle className="w-3.5 h-3.5 text-yoru-warning" /> No servers configured for this episode yet.
               </div>
             )}
          </div>

          {/* 3. Dynamic Episode Selector */}
          <div className="bg-[#0F1117] md:rounded-2xl p-4 md:p-6 border-b md:border border-white/5 mt-2 md:mt-0">
             {/* Header with Title, Count, Season, and Jump-to-Episode */}
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-white">Episodes</h2>
                  <span className="text-xs font-semibold text-yoru-text-muted px-2.5 py-1 bg-white/5 rounded-md">
                    {uniqueEpisodes.length} {uniqueEpisodes.length === 1 ? 'Episode' : 'Episodes'}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Jump to Episode input */}
                  {uniqueEpisodes.length > 20 && (
                    <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={uniqueEpisodes.length}
                        value={jumpInput}
                        onChange={(e) => setJumpInput(e.target.value)}
                        placeholder="Jump to ep..."
                        className="w-24 sm:w-28 h-8 px-2.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-colors"
                        aria-label="Jump to episode number"
                      />
                      <button
                        type="submit"
                        disabled={!jumpInput.trim()}
                        className="h-8 px-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
                      >
                        Go
                      </button>
                    </form>
                  )}

                  {/* Franchise / Linked Season Selector (Cross-Anime Seasons) */}
                  {anime.linkedSeasons && anime.linkedSeasons.length > 1 ? (
                    <select 
                      value={anime.id}
                      onChange={(e) => {
                        const targetAnimeId = e.target.value;
                        const targetSeason = anime.linkedSeasons?.find(ls => ls.animeId === targetAnimeId);
                        if (targetSeason && targetSeason.slug) {
                          navigate(`/watch/${targetSeason.slug}/1`);
                        }
                      }}
                      className="bg-white/5 border border-white/10 text-xs font-semibold text-white rounded-lg px-3 py-1.5 h-8 outline-none hover:border-white/20 focus:border-white/30 transition-colors cursor-pointer"
                      aria-label="Select Franchise Season"
                    >
                      {anime.linkedSeasons
                        .sort((a, b) => (a.seasonNumber || 1) - (b.seasonNumber || 1))
                        .map((s, idx) => (
                          <option key={`${s.animeId}-${idx}`} value={s.animeId} className="bg-[#0F1117] text-white">
                          {s.seasonName ? s.seasonName.replace(/Season Season/g, 'Season') : (s.title || `Season ${s.seasonNumber}`)}
                          </option>
                        ))}
                    </select>
                  ) : anime.seasons && anime.seasons.length > 1 ? (
                    <select 
                      value={currentSeasonId}
                      onChange={(e) => {
                        const newSeason = e.target.value;
                        const targetEpInNewSeason = episodes.find(ep => ep.seasonId === newSeason)?.episodeNumber || 1;
                        navigate(`/watch/${anime.slug}/${targetEpInNewSeason}?season=${newSeason}`);
                      }}
                      className="bg-white/5 border border-white/10 text-xs font-medium text-white rounded-lg px-3 py-1.5 h-8 outline-none hover:border-white/20 focus:border-white/30 transition-colors cursor-pointer"
                    >
                      {anime.seasons.sort((a,b)=>a.order-b.order).map((s, idx) => (
                        <option key={`${s.id}-${idx}`} value={s.id} className="bg-[#0F1117] text-white">
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
             </div>

             {/* Episode Status Legend */}
             <div className="flex flex-wrap items-center gap-4 text-xs text-yoru-text-muted mb-4 pb-3 border-b border-white/5">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-yoru-accent text-[#030407] font-bold text-[9px] flex items-center justify-center shadow-sm">
                    ●
                  </span>
                  <span className="text-white/90 font-medium">Currently Playing</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-white/10 border border-white/10 text-white/50 flex items-center justify-center text-[9px] font-bold">
                    ✓
                  </span>
                  <span>Watched</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  </span>
                  <span>Filler</span>
                </div>
             </div>

             {/* Range / Chunk selector tabs for large anime */}
             {uniqueEpisodes.length > CHUNK_SIZE && (
               <div className="flex flex-wrap items-center gap-1.5 mb-5">
                 {Array.from({ length: totalChunks }).map((_, idx) => {
                   const start = idx * CHUNK_SIZE + 1;
                   const end = Math.min((idx + 1) * CHUNK_SIZE, uniqueEpisodes.length);
                   const isSelected = idx === selectedChunkIdx;
                   const containsActive = currentEpisode.episodeNumber >= start && currentEpisode.episodeNumber <= end;

                   return (
                     <button
                       key={idx}
                       onClick={() => setSelectedChunkIdx(idx)}
                       className={clsx(
                         "h-8 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer",
                         isSelected
                           ? "bg-white text-[#030407] font-bold shadow-sm"
                           : "bg-white/5 text-yoru-text-muted hover:bg-white/10 hover:text-white"
                       )}
                     >
                       <span>{start}–{end}</span>
                       {containsActive && (
                         <span className={clsx("w-1.5 h-1.5 rounded-full", isSelected ? "bg-[#030407]" : "bg-yoru-accent animate-pulse")} />
                       )}
                     </button>
                   );
                 })}
               </div>
             )}

             {/* Render Grid or List based on episode count */}
             {uniqueEpisodes.length === 0 ? (
               <div className="text-center py-12 text-yoru-text-muted text-xs font-medium">
                 No episodes found in this season.
               </div>
              ) : isCompact ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-1.5 sm:gap-2">
                 {displayedEpisodes.map((ep) => {
                    const isActive = ep.episodeNumber === currentEpisode.episodeNumber;
                    const isWatched = watchedEpisodes.includes(ep.id) ||
                      watchedEpisodes.includes(`${ep.seasonId}_${ep.episodeNumber}`) ||
                      watchedEpisodes.includes(String(ep.episodeNumber)) ||
                      watchedEpisodes.some(wid =>
                        wid === ep.id ||
                        wid === `${ep.seasonId}_${ep.episodeNumber}` ||
                        wid.endsWith(`_${ep.seasonId}_${ep.episodeNumber}`) ||
                        wid.endsWith(`_${ep.episodeNumber}`)
                      );

                    return (
                      <button
                        key={`${ep.seasonId}_${ep.episodeNumber}`}
                        onClick={() => navigate(`/watch/${anime.slug}/${ep.episodeNumber}?season=${currentSeasonId}`)}
                        title={`Episode ${ep.episodeNumber}${ep.isFiller ? ' (Filler)' : ''}${isActive ? ' (Currently playing)' : isWatched ? ' (Watched)' : ''}`}
                        aria-label={`Episode ${ep.episodeNumber}${ep.isFiller ? ' (Filler)' : ''}${isActive ? ' (Currently playing)' : isWatched ? ' (Watched)' : ''}`}
                        aria-current={isActive ? 'true' : undefined}
                        className={clsx(
                          "aspect-square h-9 sm:h-10 max-h-[42px] sm:max-h-[46px] w-full flex flex-col items-center justify-center rounded-md text-xs sm:text-sm font-bold transition-all duration-150 relative cursor-pointer",
                          isActive
                            ? "bg-yoru-accent text-[#030407] font-black shadow-[0_0_12px_rgba(255,255,255,0.4)] ring-2 ring-white/60 scale-105 z-10"
                            : isWatched
                              ? "bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white"
                              : ep.isFiller
                                ? "bg-amber-500/10 text-amber-200/90 border border-amber-500/35 hover:bg-amber-500/20 hover:text-white"
                                : "bg-white/5 text-yoru-text-muted hover:bg-white/10 hover:text-white"
                        )}
                      >
                        {/* Always display the episode number clearly */}
                        <span className="leading-none">{ep.episodeNumber}</span>
                        {isActive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#030407] mt-0.5" />
                        ) : ep.isFiller ? (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                        ) : isWatched ? (
                          <span className="text-[8px] text-white/30 leading-none mt-0.5">✓</span>
                        ) : null}
                      </button>
                    );
                 })}
               </div>
             ) : (
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedEpisodes.map((ep) => {
                    const isActive = ep.episodeNumber === currentEpisode.episodeNumber;
                    const isWatched = watchedEpisodes.includes(ep.id) ||
                      watchedEpisodes.includes(`${ep.seasonId}_${ep.episodeNumber}`) ||
                      watchedEpisodes.includes(String(ep.episodeNumber)) ||
                      watchedEpisodes.some(wid =>
                        wid === ep.id ||
                        wid === `${ep.seasonId}_${ep.episodeNumber}` ||
                        wid.endsWith(`_${ep.seasonId}_${ep.episodeNumber}`) ||
                        wid.endsWith(`_${ep.episodeNumber}`)
                      );

                    return (
                      <button
                        key={`${ep.seasonId}_${ep.episodeNumber}`}
                        onClick={() => navigate(`/watch/${anime.slug}/${ep.episodeNumber}?season=${currentSeasonId}`)}
                        title={`Episode ${ep.episodeNumber}${ep.isFiller ? ' (Filler)' : ''}${isActive ? ' (Currently playing)' : isWatched ? ' (Watched)' : ''}`}
                        aria-label={`Episode ${ep.episodeNumber}${ep.isFiller ? ' (Filler)' : ''}${isActive ? ' (Currently playing)' : isWatched ? ' (Watched)' : ''}`}
                        aria-current={isActive ? 'true' : undefined}
                        className={clsx(
                          "flex items-center justify-between p-3 rounded-lg text-left transition-all duration-200 border cursor-pointer",
                          isActive
                            ? "bg-yoru-accent/15 text-white border-yoru-accent shadow-[0_0_12px_rgba(255,255,255,0.15)] font-bold"
                            : isWatched
                              ? "bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white"
                              : ep.isFiller
                                ? "bg-amber-500/10 text-amber-200/90 border-amber-500/30 hover:bg-amber-500/20"
                                : "bg-white/5 text-yoru-text-muted border-transparent hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                           <div className={clsx(
                             "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs",
                             isActive
                               ? "bg-yoru-accent text-[#030407] font-black"
                               : ep.isFiller
                                 ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                 : isWatched
                                   ? "bg-white/5 text-white/30"
                                   : "bg-white/10 text-white"
                           )}>
                             {/* Always show episode number */}
                             {ep.episodeNumber}
                           </div>
                           <span className="text-xs font-semibold truncate leading-tight flex-1">
                             {ep.title || `Episode ${ep.episodeNumber}`}
                           </span>
                        </div>
                        {isActive ? (
                          <span className="w-2 h-2 rounded-full bg-yoru-accent animate-pulse shrink-0 ml-2" />
                        ) : isWatched ? (
                          <Check className="w-4 h-4 shrink-0 ml-2 text-white/30" />
                        ) : null}
                      </button>
                    );
                  })}
               </div>
             )}
          </div>

              <CommentSection animeId={anime.id} episodeId={currentEpisode.id} />
           </div>
        </div>

      </div>
    </div>
  );
};
