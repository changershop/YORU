import React, { useEffect, useState, useMemo } from 'react';
import { Anime } from '../types';
import { getAllAnime, getLatestReleasesAnime, getRecentlyAddedAnime, getAnimeReleaseTimestamp } from '../lib/data';
import { AnimeCard } from '../components/AnimeCard';
import { SkeletonAnimeCard } from '../components/SkeletonAnimeCard';
import { Sparkles, Clock, Radio, Film, ArrowRight, Flame, Search as SearchIcon, X, Tv } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

type ReleaseTab = 'latest' | 'added' | 'airing';
type FormatFilter = 'all' | 'tv' | 'movie';

export const RecentAnime = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: ReleaseTab = rawTab === 'added' || rawTab === 'airing' ? rawTab : 'latest';

  const [allAnime, setAllAnime] = useState<Anime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const data = await getAllAnime();
        setAllAnime(data);
      } catch (err) {
        console.error("Failed to load anime data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const handleTabChange = (tab: ReleaseTab) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'latest') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    setSearchParams(params, { replace: true });
  };

  const filteredAnimeList = useMemo(() => {
    let list: Anime[] = [];

    if (activeTab === 'added') {
      // Sort by recently added timestamp
      list = [...allAnime].sort((a, b) => {
        const timeA = a.recentlyAddedAt || a.createdAt || 0;
        const timeB = b.recentlyAddedAt || b.createdAt || 0;
        return timeB - timeA;
      });
    } else if (activeTab === 'airing') {
      // Currently releasing / ongoing anime
      list = allAnime
        .filter(a => {
          const st = (a.status || '').toLowerCase();
          return st === 'releasing' || st === 'ongoing' || (a as any).isRecent === true;
        })
        .sort((a, b) => getAnimeReleaseTimestamp(b) - getAnimeReleaseTimestamp(a));
    } else {
      // Latest releases (by release date and recent updates)
      list = getLatestReleasesAnime(allAnime, 0);
    }

    // Format filter
    if (formatFilter === 'tv') {
      list = list.filter(a => (a.format || 'TV').toUpperCase() === 'TV');
    } else if (formatFilter === 'movie') {
      list = list.filter(a => (a.format || '').toUpperCase() === 'MOVIE');
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(a =>
        a.title?.toLowerCase().includes(q) ||
        a.nativeTitle?.toLowerCase().includes(q) ||
        a.genres?.some(g => g.toLowerCase().includes(q))
      );
    }

    return list;
  }, [allAnime, activeTab, formatFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-yoru-bg pb-24 pt-24 md:pt-28">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 space-y-8">
        
        {/* Page Header */}
        <div className="border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-yoru-accent mb-2">
              <Flame className="w-4 h-4" />
              <span>Catalog & Updates</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              Latest Releases
            </h1>
            <p className="text-yoru-text-muted text-sm mt-1 max-w-2xl">
              Discover newly released seasons, newest broadcast episodes, and freshly updated anime series.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/80 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Last Synchronized: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
            <span className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/80">
              {isLoading ? 'Loading...' : `${filteredAnimeList.length} ${filteredAnimeList.length === 1 ? 'Title' : 'Titles'}`}
            </span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Main Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-white/5 border border-white/10 rounded-xl max-w-fit">
            <button
              onClick={() => handleTabChange('latest')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                activeTab === 'latest'
                  ? "bg-white text-yoru-bg shadow-sm"
                  : "text-yoru-text-muted hover:text-white"
              )}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Latest Releases</span>
            </button>
            <button
              onClick={() => handleTabChange('added')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                activeTab === 'added'
                  ? "bg-white text-yoru-bg shadow-sm"
                  : "text-yoru-text-muted hover:text-white"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Recently Added</span>
            </button>
            <button
              onClick={() => handleTabChange('airing')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                activeTab === 'airing'
                  ? "bg-white text-yoru-bg shadow-sm"
                  : "text-yoru-text-muted hover:text-white"
              )}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Currently Airing</span>
            </button>
          </div>

          {/* Secondary Controls: Format Chips + Search */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Format Chips */}
            <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-lg">
              <button
                onClick={() => setFormatFilter('all')}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                  formatFilter === 'all' ? "bg-white/20 text-white" : "text-yoru-text-muted hover:text-white"
                )}
              >
                All
              </button>
              <button
                onClick={() => setFormatFilter('tv')}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                  formatFilter === 'tv' ? "bg-white/20 text-white" : "text-yoru-text-muted hover:text-white"
                )}
              >
                TV
              </button>
              <button
                onClick={() => setFormatFilter('movie')}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                  formatFilter === 'movie' ? "bg-white/20 text-white" : "text-yoru-text-muted hover:text-white"
                )}
              >
                Movie
              </button>
            </div>

            {/* Quick in-page Search */}
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <SearchIcon className="w-3.5 h-3.5 text-yoru-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter titles..."
                className="w-full pl-8 pr-7 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-yoru-accent/50 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {[...Array(12)].map((_, i) => (
              <SkeletonAnimeCard key={i} />
            ))}
          </div>
        ) : filteredAnimeList.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {filteredAnimeList.map((anime, index) => (
              <motion.div
                key={anime.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
              >
                <AnimeCard anime={anime} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-yoru-surface border border-yoru-border rounded-2xl p-12 text-center max-w-md mx-auto my-12 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-yoru-accent">
              <Film className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">No Matching Releases</h3>
              <p className="text-xs text-yoru-text-muted leading-relaxed">
                {searchQuery
                  ? `No anime found matching "${searchQuery}". Try changing your keywords.`
                  : "No anime found in this category. Check back soon or explore our comprehensive catalog!"}
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              {(searchQuery || formatFilter !== 'all') ? (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFormatFilter('all');
                  }}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition-colors"
                >
                  Clear Filters
                </button>
              ) : null}
              <Link
                to="/browse"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-yoru-accent text-yoru-bg font-bold text-xs uppercase tracking-wider hover:bg-yoru-accent/90 transition-colors"
              >
                <span>Browse All Anime</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
