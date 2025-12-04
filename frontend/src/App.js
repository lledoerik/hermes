import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LibraryProvider, useLibrary } from './context/LibraryContext';
import Navbar from './components/Navbar';
import LoadingScreen from './components/LoadingScreen';
import Home from './pages/Home';
import Movies from './pages/Movies';
import Series from './pages/Series';
import Details from './pages/Details';
import DebridPlayer from './pages/DebridPlayer';
import Search from './pages/Search';
import Admin from './pages/Admin';
import Books from './pages/Books';
import BookReader from './pages/BookReader';
import Audiobooks from './pages/Audiobooks';
import AudiobookPlayer from './pages/AudiobookPlayer';
import TV from './pages/TV';
import Programs from './pages/Programs';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Watchlist from './pages/Watchlist';
import './App.css';

// Component per protegir rutes només per admins
function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }
  return children;
}

// Component per redirigir rutes legacy de /stream/ a /debrid/
function StreamRedirect() {
  const newPath = window.location.pathname.replace('/stream/', '/debrid/') + window.location.search;
  return <Navigate to={newPath} replace />;
}

// Main app content with loading screen
function AppContent() {
  const { initialLoading, loadingProgress, preloadData } = useLibrary();

  // Preload data on mount
  useEffect(() => {
    preloadData();
  }, [preloadData]);

  if (initialLoading) {
    return <LoadingScreen progress={loadingProgress} />;
  }

  return (
    <Router>
      <div className="app">
        {/* Animated Background */}
        <div className="animated-bg">
          <div className="bubble bubble-1"></div>
          <div className="bubble bubble-2"></div>
          <div className="bubble bubble-3"></div>
        </div>

        <Routes>
          {/* Player local desactivat - redirigir a home */}
          <Route path="/play/:type/:id" element={<Navigate to="/" replace />} />

          {/* Rutes de streaming legacy - redirigir a DebridPlayer */}
          <Route path="/stream/:type/:tmdbId" element={<StreamRedirect />} />

          {/* Debrid Player - Real-Debrid streaming amb reproductor HTML5 */}
          <Route path="/debrid/:type/:tmdbId" element={<DebridPlayer />} />

          {/* Book Reader without Navbar - només admin */}
          <Route path="/read/:id" element={<AdminRoute><BookReader /></AdminRoute>} />

          {/* Audiobook Player without Navbar - només admin */}
          <Route path="/listen/:id" element={<AdminRoute><AudiobookPlayer /></AdminRoute>} />

          {/* Login without Navbar */}
          <Route path="/login" element={<Login />} />

          {/* All other routes with Navbar */}
          <Route
            path="*"
            element={
              <>
                <Navbar />
                <main className="main-content">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/movies" element={<Movies />} />
                    <Route path="/series" element={<Series />} />
                    <Route path="/books" element={<AdminRoute><Books /></AdminRoute>} />
                    <Route path="/audiobooks" element={<AdminRoute><Audiobooks /></AdminRoute>} />
                    <Route path="/tv" element={<AdminRoute><TV /></AdminRoute>} />
                    <Route path="/programs" element={<AdminRoute><Programs /></AdminRoute>} />
                    <Route path="/movies/:id" element={<Details />} />
                    <Route path="/series/:id" element={<Details />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/watchlist" element={<Watchlist />} />
                  </Routes>
                </main>
              </>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <LibraryProvider>
        <AppContent />
      </LibraryProvider>
    </AuthProvider>
  );
}

export default App;
