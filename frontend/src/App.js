import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
import './App.css';

function App() {
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
          {/* Player route without Navbar */}
          <Route path="/play/:type/:id" element={<Player />} />

          {/* Book Reader without Navbar */}
          <Route path="/read/:id" element={<BookReader />} />

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
  );
}

export default App;
