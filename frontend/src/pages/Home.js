import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Home.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

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

const PlayIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

// Missatges de benvinguda
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 6) return 'Bona nit';
  if (hour < 12) return 'Bon dia';
  if (hour < 20) return 'Bona tarda';
  return 'Bona nit';
};

const getWelcomeMessage = (name) => {
  const messages = [
    `${getGreeting()}, ${name}! Què vols veure avui?`,
    `Hola ${name}! Tens ganes de maratonar alguna cosa?`,
    `${getGreeting()}, ${name}! Hermes et dona la benvinguda`,
    `Ei ${name}! Preparat per una bona sessió?`,
    `${getGreeting()}! Què et ve de gust, ${name}?`
  ];
  return messages[Math.floor(Math.random() * messages.length)];
};

function Home() {
  const { user, isAuthenticated } = useAuth();
  const [stats, setStats] = useState(null);
  const [continueWatching, setContinueWatching] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [welcomeMessage] = useState(() =>
    user ? getWelcomeMessage(user.display_name || user.username) : ''
  );
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, [isAuthenticated]);

  const loadData = async () => {
    try {
      const statsRes = await axios.get('/api/library/stats');
      setStats(statsRes.data);

      // Carregar "Continuar veient" si està autenticat
      if (isAuthenticated) {
        try {
          const continueRes = await axios.get('/api/user/continue-watching');
          setContinueWatching(continueRes.data);
        } catch (e) {
          console.error('Error carregant continue watching:', e);
        }
      }
    } catch (error) {
      console.error('Error carregant estadistiques:', error);
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h ${remainMins}m`;
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
      </div>
    );
  }

  return (
    <div className="home-container">
      {/* Welcome Section for logged in users */}
      {isAuthenticated && (
        <section className="welcome-section">
          <div className="welcome-content">
            <h1 className="welcome-title">{welcomeMessage}</h1>
            {!isAuthenticated && (
              <Link to="/login" className="login-prompt">
                Inicia sessió per guardar el teu progrés →
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Continue Watching Section */}
      {continueWatching.length > 0 && (
        <section className="continue-watching-section">
          <h2 className="section-title">
            <span className="title-icon">▶</span>
            Continuar veient
          </h2>
          <div className="continue-watching-grid">
            {continueWatching.map((item) => (
              <div
                key={item.id}
                className="continue-card"
                onClick={() => navigate(`/play/episode/${item.id}`)}
              >
                <div className="continue-thumbnail">
                  {item.backdrop || item.poster ? (
                    <img
                      src={`${API_URL}/api/images/series/${item.series_id}/${item.backdrop ? 'backdrop' : 'poster'}`}
                      alt={item.series_name}
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      <SeriesIcon />
                    </div>
                  )}
                  <div className="continue-overlay">
                    <button className="play-btn">
                      <PlayIcon />
                    </button>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${item.progress_percentage}%` }}
                    />
                  </div>
                </div>
                <div className="continue-info">
                  <h3 className="continue-title">{item.series_name}</h3>
                  <p className="continue-episode">
                    T{item.season_number} E{item.episode_number}
                    {item.title && ` - ${item.title}`}
                  </p>
                  <span className="continue-time">
                    {formatTime(item.total_seconds - item.progress_seconds)} restants
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
              <button type="submit">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </button>
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

            {/* Llibres */}
            <Link to="/books" className="category-card active">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-books"></div>
                <div className="floating-bubble bubble-2 gradient-books"></div>
                <div className="floating-bubble bubble-3 gradient-books"></div>
              </div>
              <div className="card-content">
                <BookIcon />
                <h3 className="card-title">Llibres</h3>
                <span className="card-count">Biblioteca</span>
              </div>
              <div className="hover-border"></div>
            </Link>

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
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;
