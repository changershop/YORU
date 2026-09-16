import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, User, LogIn, Home, Compass, Bookmark, Settings, X, Loader2, Filter, Shuffle, Menu, LogOut, Sparkles, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { signInWithGoogle, logout, db } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Anime } from '../types';
import { getAllAnime } from '../lib/data';
import { Button } from './ui/Button';
import { cn, is18PlusAnime } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { AuthModal } from './AuthModal';
import { ConfirmationModal } from './ui/ConfirmationModal';

export const Logo = ({ className }: { className?: string }) => (
  <div className={cn("flex items-center gap-3 group", className)}>
    <div className="relative w-8 h-8 flex items-center justify-center bg-white rounded shadow-[0_0_15px_rgba(255,255,255,0.1)] group-hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-shadow duration-500">
      <div className="w-3.5 h-3.5 bg-yoru-bg rotate-45 rounded-sm transition-transform duration-500 group-hover:rotate-90" />
    </div>
    <span className="text-xl md:text-2xl font-black tracking-[0.25em] text-white">YORU</span>
  </div>
);

export const Navigation = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  
  useEffect(() => {
    if (!user) {
      setWatchlistCount(0);
      return;
    }
    const q = query(collection(db, 'watchlist'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setWatchlistCount(snap.size);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
        return;
      }
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isSearchOpen]);

  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery, isSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchResults = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const all = await getAllAnime();
        const term = searchQuery.toLowerCase().trim();
        const results = all
          .filter(a => 
            a.title?.toLowerCase().includes(term) || 
            a.nativeTitle?.toLowerCase().includes(term) ||
            a.slug?.toLowerCase().includes(term)
          )
          .slice(0, 6);
        setSearchResults(results);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    };
    const timeoutId = setTimeout(fetchResults, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleOpenAuth = () => setIsAuthModalOpen(true);
    window.addEventListener('open-auth-modal', handleOpenAuth);
    return () => window.removeEventListener('open-auth-modal', handleOpenAuth);
  }, []);

  const handleLogin = () => {
    setIsAuthModalOpen(true);
  };

  const mobileNav = [
    { name: 'Home', path: '/home', icon: Home },
    { name: 'Browse', path: '/browse', icon: Compass },
    { name: 'Watchlist', path: '/watchlist', icon: Bookmark },
    { name: 'Profile', path: user ? '/profile' : '#login', icon: User, action: !user ? handleLogin : undefined },
  ];

  return (
    <>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <nav 
        className={cn(
          "fixed top-0 w-full z-[100] transition-all duration-500 hidden md:block",
          isScrolled 
            ? "bg-yoru-bg/80 backdrop-blur-2xl border-b border-white/5 py-4 shadow-2xl" 
            : "bg-gradient-to-b from-yoru-bg/90 to-transparent py-6"
        )}
      >
        <div className="w-full px-4 md:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            
            <div className="flex items-center gap-8">
              <Link to="/home">
                <Logo />
              </Link>
            </div>

            <div className="hidden md:flex flex-1 max-w-2xl mx-8 items-center gap-2">
              <div ref={searchRef} className="relative flex-1">
                <div className="flex items-center bg-yoru-surface-elevated/50 border border-white/10 rounded-full px-4 py-2 focus-within:border-yoru-accent transition-colors backdrop-blur-md">
                  <Search className="w-4 h-4 text-yoru-text-muted shrink-0" />
                  <input
                    type="text"
                    placeholder="Search anime..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsSearchOpen(true);
                    }}
                    onFocus={() => setIsSearchOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsSearchOpen(false);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setFocusedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setFocusedIndex(prev => (prev > -1 ? prev - 1 : -1));
                      } else if (e.key === 'Enter') {
                        if (focusedIndex >= 0 && focusedIndex < searchResults.length) {
                          setIsSearchOpen(false);
                          navigate(`/anime/${searchResults[focusedIndex].slug}`);
                        } else if (searchQuery) {
                          setIsSearchOpen(false);
                          navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                        }
                      }
                    }}
                    className="w-full bg-transparent border-none text-white text-sm focus:outline-none focus:ring-0 placeholder-white/30 ml-3"
                  />
                  {isSearching ? (
                     <Loader2 className="w-4 h-4 text-yoru-accent animate-spin shrink-0" />
                  ) : searchQuery ? (
                    <button onClick={() => setSearchQuery('')} className="text-white/30 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
                
                <AnimatePresence>
                  {isSearchOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-yoru-surface-elevated/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] overflow-hidden z-50"
                    >
                      <div className="max-h-96 overflow-y-auto">
                        {searchResults.length > 0 ? (
                          <div className="p-2 space-y-1">
                            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-yoru-text-muted">Results</div>
                            {searchResults.map((anime, idx) => (
                              <Link 
                                key={anime.id}
                                to={`/anime/${anime.slug}`}
                                onClick={() => setIsSearchOpen(false)}
                                className={cn(
                                  "flex items-center gap-3 p-2 rounded-lg transition-colors group",
                                  focusedIndex === idx ? "bg-white/10" : "hover:bg-white/5"
                                )}
                              >
                                <div className="relative shrink-0">
                                  <img src={anime.poster} alt={anime.title} className="w-10 h-14 object-cover rounded shadow-sm group-hover:shadow-md transition-shadow" />
                                  {is18PlusAnime(anime) && (
                                    <span className="absolute top-0.5 left-0.5 px-1 py-0.2 bg-red-600/95 text-white text-[8px] font-black rounded shadow">
                                      18+
                                    </span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className={cn(
                                    "text-sm font-bold truncate transition-colors",
                                    focusedIndex === idx ? "text-yoru-accent" : "text-white group-hover:text-yoru-accent"
                                  )}>{anime.title}</h4>
                                  <p className="text-[10px] text-yoru-text-muted truncate mt-0.5">{anime.nativeTitle}</p>
                                </div>
                              </Link>
                            ))}
                            <Link 
                              to="/search" 
                              onClick={() => setIsSearchOpen(false)}
                              className="block p-3 text-center text-xs font-bold uppercase tracking-widest text-yoru-accent hover:bg-yoru-accent/10 rounded-lg transition-colors mt-2"
                            >
                              View All Results
                            </Link>
                          </div>
                        ) : searchQuery && !isSearching ? (
                          <div className="p-8 text-center text-sm text-yoru-text-muted">
                            No anime found matching "{searchQuery}"
                          </div>
                        ) : !searchQuery ? (
                          <div className="p-6 text-center">
                            <Search className="w-8 h-8 text-white/10 mx-auto mb-3" />
                            <p className="text-xs font-medium text-yoru-text-muted">Type to search for an anime</p>
                          </div>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Link
                to={`/search${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ''}`}
                className="p-2.5 text-yoru-text-muted hover:text-white bg-yoru-surface-elevated/50 border border-white/10 rounded-full hover:border-yoru-accent transition-all shrink-0"
                title="Filter Anime"
              >
                <Filter className="w-5 h-5" />
              </Link>

              <button
                onClick={async () => {
                  try {
                    const all = await getAllAnime();
                    const published = all.filter(a => a.published);
                    if (published.length > 0) {
                      const random = published[Math.floor(Math.random() * published.length)];
                      navigate(`/anime/${random.slug}`);
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="p-2.5 text-yoru-text-muted hover:text-yoru-accent bg-yoru-surface-elevated/50 border border-white/10 rounded-full hover:border-yoru-accent transition-all shrink-0"
                title="Random Anime"
              >
                <Shuffle className="w-5 h-5" />
              </button>
            </div>

            <div className="hidden md:flex items-center gap-4 relative">
              {user ? (
                <div className="flex items-center gap-6">
                  <Link to="/watchlist" className="relative group p-2 hover:bg-white/5 rounded-full transition-colors flex items-center justify-center" title="Watchlist">
                    <Bookmark className={cn("w-5 h-5 transition-colors duration-300", location.pathname === '/watchlist' ? "text-yoru-accent" : "text-yoru-text-muted group-hover:text-white")} />
                    {watchlistCount > 0 && (
                      <span className="absolute top-1 right-1.5 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] border border-yoru-surface" />
                    )}
                  </Link>
                  {profile?.role === 'admin' && (
                    <Link to="/admin" className="relative group">
                      <span className={cn(
                        "text-xs font-bold uppercase tracking-widest transition-colors duration-300",
                        location.pathname.startsWith('/admin') ? "text-white" : "text-yoru-text-muted group-hover:text-white"
                      )}>
                        Admin
                      </span>
                      {location.pathname.startsWith('/admin') && (
                        <motion.div
                          layoutId="nav-indicator"
                          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-yoru-accent rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                      )}
                    </Link>
                  )}
                  <Link to="/profile" className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/10 hover:border-yoru-accent transition-all duration-300 shadow-lg block shrink-0" aria-label="User Profile">
                    {profile?.photoURL || user.photoURL ? (
                      <img src={(profile?.photoURL || user.photoURL) as string} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-yoru-surface-elevated flex items-center justify-center">
                        <User className="w-5 h-5 text-yoru-text-muted" />
                      </div>
                    )}
                  </Link>
                </div>
              ) : (
                <Button variant="primary" size="md" onClick={handleLogin} className="gap-2">
                  <LogIn className="w-4 h-4" /> Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Top Nav (Just Logo and Search) */}
      <nav className={cn(
          "fixed top-0 w-full z-[100] transition-all duration-300 md:hidden",
          isScrolled || isSearchOpen ? "bg-yoru-bg/95 backdrop-blur-2xl border-b border-white/5 py-3" : "bg-gradient-to-b from-yoru-bg/90 to-transparent py-4"
        )}>
         <div className="px-4 flex flex-col gap-3 relative">
            <div className="flex justify-between items-center h-10">
              {isSearchOpen ? (
                <div className="flex items-center gap-2 w-full">
                  <button onClick={() => setIsSearchOpen(false)} className="p-2 -ml-2 text-white/70 hover:text-white shrink-0">
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-full px-3 py-1.5 focus-within:border-yoru-accent transition-colors">
                    <Search className="w-4 h-4 text-yoru-text-muted shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search anime..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsSearchOpen(false);
                        } else if (e.key === 'Enter') {
                          if (focusedIndex >= 0 && focusedIndex < searchResults.length) {
                            setIsSearchOpen(false);
                            navigate(`/anime/${searchResults[focusedIndex].slug}`);
                          } else if (searchQuery) {
                            setIsSearchOpen(false);
                            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                          }
                        }
                      }}
                      className="w-full bg-transparent border-none text-white text-sm focus:outline-none focus:ring-0 placeholder-white/30 ml-2"
                    />
                    {isSearching ? (
                       <Loader2 className="w-4 h-4 text-yoru-accent animate-spin shrink-0" />
                    ) : searchQuery ? (
                      <button onClick={() => setSearchQuery('')} className="text-white/30 hover:text-white p-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <Link
                    to={`/search${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ''}`}
                    onClick={() => setIsSearchOpen(false)}
                    className="p-1.5 text-yoru-text-muted hover:text-white bg-white/5 border border-white/10 rounded-full transition-all shrink-0 ml-1"
                  >
                    <Filter className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <>
                  <Link to="/home">
                    <Logo className="scale-75 origin-left" />
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setIsSearchOpen(true)} className="p-2 text-white/70 hover:text-white bg-white/5 backdrop-blur-md rounded-full border border-white/10" aria-label="Search">
                      <Search className="w-4 h-4" />
                    </button>
                    <Link to="/watchlist" className="relative p-2 text-white/70 hover:text-white bg-white/5 rounded-full border border-white/10" aria-label="Watchlist">
                       <Bookmark className="w-4 h-4" />
                       {watchlistCount > 0 && (
                         <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-yoru-bg" />
                       )}
                    </Link>
                    <button
                      onClick={() => setIsMobileMenuOpen(true)}
                      className="p-2 text-white/80 hover:text-white bg-white/5 rounded-full border border-white/10"
                      aria-label="Open Navigation Menu"
                      title="Menu"
                    >
                      <Menu className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>

            <AnimatePresence>
                {isSearchOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-4 right-4 mt-2 bg-yoru-surface-elevated/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] overflow-hidden z-[110]"
                  >
                    
                    <div className="max-h-[60vh] overflow-y-auto">
                      {searchResults.length > 0 ? (
                        <div className="p-2 space-y-1">
                          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-yoru-text-muted">Results</div>
                          {searchResults.map((anime, idx) => (
                            <Link 
                              key={anime.id}
                              to={`/anime/${anime.slug}`}
                              onClick={() => setIsSearchOpen(false)}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-lg transition-colors group",
                                focusedIndex === idx ? "bg-white/10" : "hover:bg-white/5"
                              )}
                            >
                              <div className="relative shrink-0">
                                <img src={anime.poster} alt={anime.title} className="w-10 h-14 object-cover rounded shadow-sm group-hover:shadow-md transition-shadow" />
                                {is18PlusAnime(anime) && (
                                  <span className="absolute top-0.5 left-0.5 px-1 py-0.2 bg-red-600/95 text-white text-[8px] font-black rounded shadow">
                                    18+
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className={cn(
                                  "text-sm font-bold truncate transition-colors",
                                  focusedIndex === idx ? "text-yoru-accent" : "text-white group-hover:text-yoru-accent"
                                )}>{anime.title}</h4>
                                <p className="text-[10px] text-yoru-text-muted truncate mt-0.5">{anime.nativeTitle}</p>
                              </div>
                            </Link>
                          ))}
                          <Link 
                            to="/search" 
                            onClick={() => setIsSearchOpen(false)}
                            className="block p-3 text-center text-xs font-bold uppercase tracking-widest text-yoru-accent hover:bg-yoru-accent/10 rounded-lg transition-colors mt-2"
                          >
                            View All Results
                          </Link>
                        </div>
                      ) : searchQuery && !isSearching ? (
                        <div className="p-8 text-center text-sm text-yoru-text-muted">
                          No anime found matching "{searchQuery}"
                        </div>
                      ) : !searchQuery ? (
                        <div className="p-6 text-center">
                          <Search className="w-8 h-8 text-white/10 mx-auto mb-3" />
                          <p className="text-xs font-medium text-yoru-text-muted">Type to search for an anime</p>
                        </div>
                      ) : null}
                    </div>

                  </motion.div>
                )}
            </AnimatePresence>
         </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-[100] bg-yoru-bg/90 backdrop-blur-2xl border-t border-white/10 md:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-around px-2 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
          {mobileNav.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && item.path !== '/home' && location.pathname.startsWith(item.path));
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                onClick={() => {
                  if (item.action) {
                    item.action();
                  } else {
                    navigate(item.path);
                  }
                }}
                className="relative flex flex-col items-center justify-center w-16 py-1 gap-1 transition-all group"
              >
                {isActive && (
                  <motion.div 
                    layoutId="mobile-nav-bg"
                    className="absolute inset-0 bg-white/5 rounded-xl -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={cn("w-5 h-5 transition-colors duration-300", isActive ? "text-yoru-accent" : "text-yoru-text-muted group-hover:text-white/80")} />
                <span className={cn(
                  "text-[9px] font-bold tracking-wider uppercase leading-tight transition-colors duration-300",
                  isActive ? "text-yoru-accent" : "text-yoru-text-muted"
                )}>
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slide-out Mobile Menu Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[150] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute top-0 right-0 bottom-0 w-[85%] max-w-xs bg-[#0c0e17] border-l border-white/10 p-6 flex flex-col justify-between shadow-2xl overflow-y-auto"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <Logo className="scale-75 origin-left" />
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-white/5 border border-white/5"
                    aria-label="Close menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {user ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 shrink-0">
                      {profile?.photoURL || user.photoURL ? (
                        <img src={(profile?.photoURL || user.photoURL) as string} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-white/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-zinc-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-white truncate">{profile?.username || user.displayName || 'Anime Enthusiast'}</h4>
                      <p className="text-[10px] text-yoru-text-muted truncate">{user.email}</p>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleLogin();
                    }}
                    className="w-full gap-2 text-xs py-2.5 font-bold"
                  >
                    <LogIn className="w-4 h-4" /> Sign In / Join YORU
                  </Button>
                )}

                <div className="space-y-1">
                  <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Navigation</div>
                  {[
                    { name: 'Home', path: '/home', icon: Home },
                    { name: 'Recent Episodes', path: '/recent', icon: Sparkles },
                    { name: 'Browse Anime', path: '/browse', icon: Compass },
                    { name: 'Community Discussions', path: '/community', icon: Shield },
                    { name: 'My Watchlist', path: '/watchlist', icon: Bookmark, badge: watchlistCount },
                    ...(profile?.role === 'admin' ? [{ name: 'Admin Dashboard', path: '/admin', icon: Settings }] : []),
                    ...(user ? [{ name: 'My Profile & History', path: '/profile', icon: User }] : []),
                  ].map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition",
                          isActive
                            ? "bg-white/10 text-white font-semibold"
                            : "text-zinc-400 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4 text-indigo-400" />
                          <span>{item.name}</span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-600 text-white">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {user && (
                <div className="pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setIsLogoutConfirmOpen(true);
                    }}
                    className="flex items-center gap-2 text-xs text-rose-400 hover:text-rose-300 w-full px-3 py-2 rounded-xl hover:bg-rose-500/10 transition font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reusable Confirmation Modal for Logout */}
      <ConfirmationModal
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={async () => {
          try {
            await logout();
            setIsLogoutConfirmOpen(false);
            navigate('/home');
          } catch (e) {
            console.error(e);
          }
        }}
        title="Sign Out from YORU"
        message="Are you sure you want to sign out? Your watch progress and active stream sessions are safely synced."
        confirmText="Sign Out"
        variant="danger"
      />
    </>
  );
};
