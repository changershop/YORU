import React from 'react';
import { Anime } from '../types';
import { AnimeCard } from './AnimeCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { formatYearDisplay } from '../lib/normalizers';
import { useFramerDragScroll } from '../hooks/useFramerDragScroll';

interface TrendingRowProps {
  animeList: Anime[];
  maxItems?: number;
}

export const TrendingRow: React.FC<TrendingRowProps> = ({ 
  animeList, 
  maxItems = 10 
}) => {
  const items = animeList.slice(0, maxItems);

  const {
    containerRef,
    innerRef,
    constraints,
    x,
    isDragging,
    scroll,
    handleDragStart,
    handleDragEnd
  } = useFramerDragScroll(items.length);

  if (items.length === 0) return null;

  return (
    <div className="relative group/trending">
      {/* Left Scroll Arrow Button */}
      <button
        type="button"
        onClick={() => scroll('left')}
        aria-label="Scroll left"
        className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-yoru-surface/90 border border-white/10 items-center justify-center text-white opacity-0 group-hover/trending:opacity-100 transition-opacity hover:bg-white hover:text-black shadow-xl cursor-pointer"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Right Scroll Arrow Button */}
      <button
        type="button"
        onClick={() => scroll('right')}
        aria-label="Scroll right"
        className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-yoru-surface/90 border border-white/10 items-center justify-center text-white opacity-0 group-hover/trending:opacity-100 transition-opacity hover:bg-white hover:text-black shadow-xl cursor-pointer"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Horizontal Carousel */}
      <div
        ref={containerRef}
        className="w-full overflow-hidden"
      >
        <motion.div
          ref={innerRef}
          drag="x"
          dragConstraints={constraints}
          dragElastic={0.15}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          style={{ x }}
          className="flex gap-4 sm:gap-5 md:gap-6 pb-6 pt-2 pl-4 xs:pl-6 sm:pl-8 md:pl-10 pr-6 cursor-grab active:cursor-grabbing select-none"
        >
          {items.map((anime, index) => {
            return (
              <div
                key={anime.id}
                className="relative shrink-0 flex flex-col w-[160px] xs:w-[180px] sm:w-[205px] md:w-[230px] lg:w-[255px] select-none group"
                onClickCapture={(e) => {
                  if (isDragging) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
              >
                {/* Poster & Rank Container */}
                <div className="relative w-full h-[188px] xs:h-[210px] sm:h-[240px] md:h-[270px] lg:h-[300px]">
                  
                  {/* Giant Outlined Rank Number on the Left (Layered Behind slightly but mostly visible) */}
                  <div 
                    className="absolute left-0 bottom-4 xs:bottom-5 sm:bottom-6 md:bottom-7 lg:bottom-8 select-none pointer-events-none z-0"
                    style={{
                      transform: 'translate(-8%, 0%)'
                    }}
                  >
                    <span 
                      className="font-black text-[95px] xs:text-[110px] sm:text-[125px] md:text-[140px] lg:text-[155px] leading-[0.7] block select-none"
                      style={{
                        fontFamily: "'Impact', 'Arial Black', sans-serif",
                        WebkitTextStroke: '2px rgba(255, 255, 255, 0.95)',
                        color: '#030407', // Matching page background for real cutout look
                        textShadow: '0.8rem 0 3rem rgba(3, 4, 7, 0.95)',
                      }}
                    >
                      {index + 1}
                    </span>
                  </div>

                  {/* Poster Card (Positioned Absolutely to the Right of the Slot) */}
                  <div className="absolute right-0 top-0 bottom-0 w-[125px] xs:w-[140px] sm:w-[160px] md:w-[180px] lg:w-[200px] z-10">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
                      className="h-full w-full"
                    >
                      <AnimeCard anime={anime} showTitle={false} />
                    </motion.div>
                  </div>
                </div>

                {/* Title & Date (Positioned naturally below the poster, matching its width and right-aligned inside the slot) */}
                <div className="w-full flex justify-end">
                  <div className="w-[125px] xs:w-[140px] sm:w-[160px] md:w-[180px] lg:w-[200px] mt-2.5 space-y-1 flex flex-col justify-between">
                    <h3 className="text-[12px] md:text-sm font-semibold leading-tight line-clamp-2 text-white group-hover:text-yoru-accent transition-colors duration-300">
                      {anime.title}
                    </h3>
                    {formatYearDisplay(anime) && (
                      <div className="text-[11px] text-yoru-text-muted">
                        {formatYearDisplay(anime)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
};
