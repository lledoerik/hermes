import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Movies from './pages/Movies';
import Series from './pages/Series';
import Details from './pages/Details';
import Player from './pages/Player';
import Search from './pages/Search';
import Admin from './pages/Admin';
import Books from './pages/Books';
import BookReader from './pages/BookReader';
import Audiobooks from './pages/Audiobooks';
import AudiobookPlayer from './pages/AudiobookPlayer';
import Login from './pages/Login';
import './App.css';

function App() {
  return (
    <AuthProvider>
    <Router>
      <div className="app">
        {/* Animated Background */}
        <div className="animated-bg">
          <div className="bubble bubble-1"></div>
          <div className="bubble bubble-2"></div>
          <div className="bubble bubble-3"></div>
        </div>

        <Routes>
          {/* Player route without Navbar */}
          <Route path="/play/:type/:id" element={<Player />} />

          {/* Book Reader without Navbar */}
          <Route path="/read/:id" element={<BookReader />} />

          {/* Audiobook Player without Navbar */}
          <Route path="/listen/:id" element={<AudiobookPlayer />} />

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
                    <Route path="/books" element={<Books />} />
                    <Route path="/audiobooks" element={<Audiobooks />} />
                    <Route path="/movies/:id" element={<Details />} />
                    <Route path="/series/:id" element={<Details />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/admin" element={<Admin />} />
                  </Routes>
                </main>
              </>
            }
          />
        </Routes>
      </div>
    </Router>
    </AuthProvider>
  );
}

export default App;
