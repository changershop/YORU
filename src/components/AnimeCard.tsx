import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Anime } from '../types';
import { Link } from 'react-router-dom';
import { Play, Plus, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, normalizeTitle, is18PlusAnime } from '../lib/utils';
import { formatAiredDisplay, formatYearDisplay } from '../lib/normalizers';
import { Button } from './ui/Button';
import { WatchlistButton } from './WatchlistButton';
import { useAnimeEpisodeCounts } from '../hooks/useAnimeEpisodeCounts';

interface AnimeCardProps {
  anime: Anime;
  showTitle?: boolean;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({ anime, showTitle = true }) => {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [floatingPos, setFloatingPos] = useState<{ x: 'left' | 'right', y: 'top' | 'bottom' | 'center' }>({ x: 'right', y: 'center' });
  const [coords, setCoords] = useState<{ left: number; top: number; transform: string } | null>(null);
  const counts = useAnimeEpisodeCounts(anime);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const isCloseToRightEdge = window.innerWidth - rect.right < 320;
      let xDir: 'left' | 'right' = isCloseToRightEdge ? 'left' : 'right';

      // Sit exactly 12px next to the poster boundary
      const left = xDir === 'right' 
        ? rect.right + 12 
        : rect.left - 290 - 12;

      // The poster height is roughly width * 1.5 because of 2:3 ratio
      const posterHeight = rect.width * 1.5;
      const posterCenterY = rect.top + (posterHeight / 2);

      // Clamping within viewport heights (assuming 360px maximum tooltip height for robust safety)
      const tooltipHeight = 360;
      const topEdge = posterCenterY - (tooltipHeight / 2);
      const maxTopEdge = window.innerHeight - tooltipHeight - 16;
      const clampedTopEdge = Math.max(16, Math.min(maxTopEdge, topEdge));

      setFloatingPos({ x: xDir, y: 'center' });
      setCoords({
        left,
        top: clampedTopEdge,
        transform: ''
      });
    }
  };

  useEffect(() => {
    if (!isHovered) return;
    const handleScroll = () => {
      setIsHovered(false);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isHovered]);

  const displayTitle = normalizeTitle(anime.title);

  return (
    <div 
      ref={cardRef}
      className={cn("anime-poster-card group relative block w-full", isHovered ? "z-50" : "z-10")}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link 
        to={`/anime/${anime.slug}`} 
        className="block w-full transition-all duration-300"
        aria-label={`${displayTitle}, ${anime.format || 'Anime'}, ${anime.status || ''}`}
        draggable={false}
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-yoru-surface-elevated ring-1 ring-yoru-border group-hover:ring-yoru-accent/50 group-hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)] transition-all duration-300 rounded-lg">
          
          <img 
            src={anime.poster} 
            alt="" 
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            loading="lazy"
            draggable={false}
          />
          
          {/* 18+ Tag on top of poster */}
          {is18PlusAnime(anime) && (
            <div 
              className="absolute top-2 left-2 z-20 flex items-center justify-center px-1.5 py-0.5 rounded bg-red-600/95 text-white text-[10px] font-black uppercase tracking-wider shadow-[0_2px_8px_rgba(220,38,38,0.6)] border border-red-500/60 backdrop-blur-sm pointer-events-none select-none"
              aria-label="18+ Adult Content"
            >
              18+
            </div>
          )}

          {/* Consistent bottom gradient overlay for legible badges */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-10" />
          
          {/* Server Episode Badges */}
          <div className="absolute bottom-2 left-2 flex items-center flex-wrap gap-1.5 z-20" aria-hidden="true">
            {counts.sub > 0 && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#030407]/90 text-white text-[11px] font-bold tracking-wider border border-white/20 backdrop-blur-sm shadow-md">
                <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="3" />
                  <path d="M10 10H8.5a1.5 1.5 0 0 0-1.5 1.5v1A1.5 1.5 0 0 0 8.5 15H10" />
                  <path d="M17 10h-1.5a1.5 1.5 0 0 0-1.5 1.5v1a1.5 1.5 0 0 0 1.5 1.5H17" />
                </svg>
                <span>{counts.sub}</span>
              </div>
            )}
            {counts.dub > 0 && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#030407]/90 text-white text-[11px] font-bold tracking-wider border border-white/20 backdrop-blur-sm shadow-md">
                <Mic className="w-3.5 h-3.5 shrink-0" />
                <span>{counts.dub}</span>
              </div>
            )}
            {counts.multi > 0 && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#030407]/90 text-white text-[11px] font-bold tracking-wider border border-white/20 backdrop-blur-sm shadow-md">
                <svg aria-hidden="true" className="h-3.5 w-3.5 text-yoru-accent shrink-0" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="m13 19 3.5-9 3.5 9m-6.125-2h5.25M3 7h7m0 0h2m-2 0c0 1.63-.793 3.926-2.239 5.655M7.5 6.818V5m.261 7.655C6.79 13.82 5.521 14.725 4 15m3.761-2.345L5 10m2.761 2.655L10.2 15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
                </svg>
                <span>{counts.multi}</span>
              </div>
            )}
          </div>
          
          <div className="absolute inset-0 bg-gradient-to-t from-[#030407]/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300" aria-hidden="true">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-full border border-white/20 text-white transform scale-75 group-hover:scale-100 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
          </div>
        </div>
        
        {showTitle && (
          <div className="mt-2.5 space-y-1 flex flex-col justify-between">
            <h3 className="text-[13px] md:text-sm font-semibold leading-tight line-clamp-2 text-white group-hover:text-yoru-accent transition-colors duration-300">
              {displayTitle}
            </h3>
            <div className="flex gap-2 items-center text-xs font-medium text-yoru-text-muted mt-1">
              {anime.status && anime.status !== 'FINISHED' && (
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-white text-[10px] font-semibold tracking-wider">
                  {anime.status}
                </span>
              )}
              {(formatYearDisplay(anime)) && (
                <span className="text-[11px] text-yoru-text-muted">{formatYearDisplay(anime)}</span>
              )}
            </div>
          </div>
        )}
      </Link>

      {createPortal(
        <AnimatePresence>
          {isHovered && coords && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98, x: floatingPos.x === 'right' ? -10 : 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.98, x: floatingPos.x === 'right' ? -10 : 10 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'fixed',
                left: coords.left,
                top: coords.top,
                width: '290px',
                zIndex: 9999
              }}
              className="bg-zinc-950/90 backdrop-blur-md border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)] rounded-2xl p-4.5 hidden lg:block cursor-default"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              <div className="flex flex-col gap-3">
                <h3 className="text-base font-extrabold text-white leading-snug line-clamp-2">
                  {anime.title}
                </h3>
                
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-zinc-400">
                  <span className="flex items-center gap-0.5 text-yellow-500 font-extrabold">
                    ⭐ {(() => {
                      if (!anime.averageScore) return '8.5';
                      const scoreStr = String(anime.averageScore);
                      const parsed = parseFloat(scoreStr.replace(/[^0-9.]/g, ''));
                      if (isNaN(parsed)) return '8.5';
                      // If it's a percentage (e.g. 85), divide by 10 to get 8.5
                      return scoreStr.includes('%') || parsed > 10 ? (parsed / 10).toFixed(1) : parsed.toFixed(1);
                    })()}
                  </span>
                  {anime.format && (
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-semibold text-[10px] uppercase">
                      {anime.format}
                    </span>
                  )}
                  {counts.sub > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-semibold text-[10px] flex items-center gap-1">
                      <svg aria-hidden="true" className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="3" />
                        <path d="M10 10H8.5a1.5 1.5 0 0 0-1.5 1.5v1A1.5 1.5 0 0 0 8.5 15H10" />
                        <path d="M17 10h-1.5a1.5 1.5 0 0 0-1.5 1.5v1a1.5 1.5 0 0 0 1.5 1.5H17" />
                      </svg>
                      <span>{counts.sub}</span>
                    </span>
                  )}
                  {counts.dub > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-semibold text-[10px] flex items-center gap-1">
                      <Mic className="w-3 h-3 shrink-0" />
                      <span>{counts.dub}</span>
                    </span>
                  )}
                  {counts.multi > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-semibold text-[10px] flex items-center gap-1">
                      <svg aria-hidden="true" className="h-3 w-3 text-yoru-accent shrink-0" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="m13 19 3.5-9 3.5 9m-6.125-2h5.25M3 7h7m0 0h2m-2 0c0 1.63-.793 3.926-2.239 5.655M7.5 6.818V5m.261 7.655C6.79 13.82 5.521 14.725 4 15m3.761-2.345L5 10m2.761 2.655L10.2 15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"/>
                      </svg>
                      <span>{counts.multi}</span>
                    </span>
                  )}
                </div>

                <p className="text-[11.5px] text-zinc-400 line-clamp-3 leading-relaxed mt-0.5">
                  {anime.synopsis}
                </p>

                <div className="space-y-1 text-[11px] mt-1 text-zinc-500 border-t border-white/5 pt-2.5">
                  <div className="flex"><span className="w-16 font-medium text-zinc-400 shrink-0">Aired:</span><span className="text-zinc-300 truncate flex-1">{formatAiredDisplay(anime)}</span></div>
                  <div className="flex"><span className="w-16 font-medium text-zinc-400 shrink-0">Status:</span><span className="text-zinc-300">{anime.status || 'Finished'}</span></div>
                  <div className="flex"><span className="w-16 font-medium text-zinc-400 shrink-0">Genres:</span><span className="text-zinc-300 truncate flex-1">{anime.genres?.slice(0,3).join(', ')}</span></div>
                </div>
                
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                  <Link to={`/watch/${anime.slug}/1`} className="flex-1">
                    <Button variant="primary" className="w-full gap-1.5 py-2 text-xs rounded-full">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" /> Watch Now
                    </Button>
                  </Link>
                  <WatchlistButton 
                    animeId={anime.id!} 
                    variant="secondary" 
                    size="icon" 
                    showText={false} 
                    className="shrink-0 rounded-full w-9 h-9 border border-white/15 bg-white/5 text-zinc-300 hover:bg-white/20 hover:text-white hover:border-white/30 transition-all flex items-center justify-center" 
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
