import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navigation } from './components/Navigation';
import { Footer } from './components/Footer';
import { BackToTop } from './components/BackToTop';
import { SkipToContent } from './components/SkipToContent';
import { useUtmTracking } from './hooks/useUtmTracking';
import { Landing } from './pages/Landing';
import { Home } from './pages/Home';
import { AnimeDetail } from './pages/AnimeDetail';
import { Watch } from './pages/Watch';
import { Search } from './pages/Search';
import { Watchlist } from './pages/Watchlist';
import { DownloadsPage, SettingsPage } from './pages/Placeholders';
import { ProfilePage } from './pages/Profile';
import { CommunityHome } from './pages/Community/CommunityHome';
import { CommunityPostPage } from './pages/Community/CommunityPostPage';
import { Leaderboard } from './pages/Community/Leaderboard';
import { MembersDirectory } from './pages/Community/MembersDirectory';
import { AdminLayout } from './pages/Admin/AdminLayout';
import { Dashboard } from './pages/Admin/Dashboard';
import { AnimeList } from './pages/Admin/AnimeList';
import { AnimeEditor } from './pages/Admin/AnimeEditor';
import { EpisodeManager } from './pages/Admin/EpisodeManager';
import { AutoImport } from './pages/Admin/AutoImport';
import { SpotlightManager } from './pages/Admin/SpotlightManager';
import { CommunityManager } from './pages/Admin/CommunityManager';
import { ReportManager } from './pages/Admin/ReportManager';
import { RecentAnimeSync } from './pages/Admin/RecentAnimeSync';
import { MultiServerSync } from './pages/Admin/MultiServerSync';
import { RecentAnime } from './pages/RecentAnime';
import { SectionPage } from './pages/SectionPage';
import { NotFound } from './pages/NotFound';
import ScrollToTop from './components/ScrollToTop';

function AppLayout() {
  useUtmTracking();

  return (
    <div className="flex flex-col min-h-screen relative">
      <SkipToContent targetId="main-content" />
      <Navigation />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/recent" element={<RecentAnime />} />
          <Route path="/section/:sectionId" element={<SectionPage />} />
          <Route path="/browse" element={<Search />} />
          <Route path="/genres" element={<Search />} />
          <Route path="/search" element={<Search />} />
          <Route path="/anime/:slug" element={<AnimeDetail />} />
          <Route path="/watch/:slug" element={<Watch />} />
          <Route path="/watch/:slug/:episodeNum" element={<Watch />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:userId" element={<ProfilePage />} />
          <Route path="/user/:username" element={<ProfilePage />} />
          <Route path="/community" element={<CommunityHome />} />
          <Route path="/community/post/:postId" element={<CommunityPostPage />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/members" element={<MembersDirectory />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <BackToTop />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Landing />} />
            
            {/* Public App */}
            <Route path="/*" element={<AppLayout />} />
            
            {/* Admin App */}
            <Route path="/admin" element={<AdminLayout />}>
               <Route index element={<Dashboard />} />
               <Route path="multiserver-sync" element={<MultiServerSync />} />
               <Route path="recent-sync" element={<RecentAnimeSync />} />
               <Route path="spotlights" element={<SpotlightManager />} />
               <Route path="reports" element={<ReportManager />} />
               <Route path="community" element={<CommunityManager />} />
               <Route path="anime" element={<AnimeList />} />
               <Route path="anime/new" element={<AnimeEditor />} />
               <Route path="auto-import" element={<AutoImport />} />
               <Route path="anime/:id/edit" element={<AnimeEditor />} />
               <Route path="anime/:id/episodes" element={<EpisodeManager />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
