import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MediaRow from '../components/MediaRow';
import './Home.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : `http://${window.location.hostname}:8000`;

axios.defaults.baseURL = API_URL;

// Icons as SVG components
const MovieIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
    <line x1="7" y1="2" x2="7" y2="22"></line>
    <line x1="17" y1="2" x2="17" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <line x1="2" y1="7" x2="7" y2="7"></line>
    <line x1="2" y1="17" x2="7" y2="17"></line>
    <line x1="17" y1="17" x2="22" y2="17"></line>
    <line x1="17" y1="7" x2="22" y2="7"></line>
  </svg>
);

const SeriesIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const TVIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const BookIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

const AudiobookIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
  </svg>
);

function Home() {
  const [series, setSeries] = useState([]);
  const [movies, setMovies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    try {
      const [seriesRes, moviesRes, statsRes] = await Promise.all([
        axios.get('/api/library/series'),
        axios.get('/api/library/movies'),
        axios.get('/api/library/stats')
      ]);
      setSeries(seriesRes.data);
      setMovies(moviesRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error carregant biblioteca:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Hermes</div>
        <div className="loading-tagline">El transport més ràpid de l'Olimp</div>
      </div>
    );
  }

  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-bg">
          <div className="hero-bubble hero-bubble-1"></div>
          <div className="hero-bubble hero-bubble-2"></div>
        </div>

        <div className="hero-content">
          {/* Search Bar */}
          <div className="search-container">
            <form className="search-bar" onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="Què et ve de gust veure?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit">🔍</button>
            </form>
          </div>

          {/* Categories Grid */}
          <div className="categories-grid">
            {/* Pel·lícules */}
            <Link to="/movies" className="category-card active">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-movies"></div>
                <div className="floating-bubble bubble-2 gradient-movies"></div>
                <div className="floating-bubble bubble-3 gradient-movies"></div>
              </div>
              <div className="card-content">
                <MovieIcon />
                <h3 className="card-title">Pel·lícules</h3>
                <span className="card-count">{stats?.movies || 0} títols</span>
              </div>
              <div className="hover-border"></div>
            </Link>

            {/* Sèries */}
            <Link to="/series" className="category-card active">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-series"></div>
                <div className="floating-bubble bubble-2 gradient-series"></div>
                <div className="floating-bubble bubble-3 gradient-series"></div>
              </div>
              <div className="card-content">
                <SeriesIcon />
                <h3 className="card-title">Sèries</h3>
                <span className="card-count">{stats?.series || 0} sèries</span>
              </div>
              <div className="hover-border"></div>
            </Link>

            {/* Programes */}
            <div className="category-card inactive">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-programs"></div>
                <div className="floating-bubble bubble-2 gradient-programs"></div>
                <div className="floating-bubble bubble-3 gradient-programs"></div>
              </div>
              <div className="card-content">
                <TVIcon />
                <h3 className="card-title">Programes</h3>
                <span className="coming-soon">Properament</span>
              </div>
            </div>

            {/* Llibres */}
            <div className="category-card inactive">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-books"></div>
                <div className="floating-bubble bubble-2 gradient-books"></div>
                <div className="floating-bubble bubble-3 gradient-books"></div>
              </div>
              <div className="card-content">
                <BookIcon />
                <h3 className="card-title">Llibres</h3>
                <span className="coming-soon">Properament</span>
              </div>
            </div>

            {/* Audiollibres */}
            <div className="category-card inactive">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-audiobooks"></div>
                <div className="floating-bubble bubble-2 gradient-audiobooks"></div>
                <div className="floating-bubble bubble-3 gradient-audiobooks"></div>
              </div>
              <div className="card-content">
                <AudiobookIcon />
                <h3 className="card-title">Audiollibres</h3>
                <span className="coming-soon">Properament</span>
              </div>
            </div>

            {/* Televisió */}
            <div className="category-card inactive">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-tv"></div>
                <div className="floating-bubble bubble-2 gradient-tv"></div>
                <div className="floating-bubble bubble-3 gradient-tv"></div>
              </div>
              <div className="card-content">
                <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 8.5c0-1 0-1.5.3-1.9.2-.3.5-.5.9-.6.4-.2.9-.2 1.9-.2h13.8c1 0 1.5 0 1.9.2.4.1.7.3.9.6.3.4.3.9.3 1.9v7c0 1 0 1.5-.3 1.9-.2.3-.5.5-.9.6-.4.2-.9.2-1.9.2H5.1c-1 0-1.5 0-1.9-.2-.4-.1-.7-.3-.9-.6-.3-.4-.3-.9-.3-1.9v-7z"></path>
                  <path d="M12 5.5v.01M8 2l4 3.5L16 2"></path>
                </svg>
                <h3 className="card-title">Televisió</h3>
                <span className="coming-soon">Properament</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="content-section">
        {/* Sèries */}
        {series.length > 0 && (
          <MediaRow
            title="Sèries"
            items={series}
            type="series"
            icon="📺"
            onViewAll={() => navigate('/series')}
          />
        )}

        {/* Pel·lícules */}
        {movies.length > 0 && (
          <MediaRow
            title="Pel·lícules"
            items={movies}
            type="movies"
            icon="🎬"
            onViewAll={() => navigate('/movies')}
          />
        )}

        {/* Afegides recentment */}
        {(series.length > 0 || movies.length > 0) && (
          <MediaRow
            title="Afegides recentment"
            items={[...movies, ...series].slice(0, 15)}
            type="movies"
            icon="✨"
          />
        )}
      </section>
    </div>
  );
}

export default Home;
