import React, { useState, useEffect, useCallback } from 'react';
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

const ProgramsIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const TvIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const PlayIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

function Home() {
  const { isAuthenticated, user } = useAuth();
  const [continueWatching, setContinueWatching] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState([]);
  const [recentSeries, setRecentSeries] = useState([]);
  const [recentMovies, setRecentMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      // Carregar contingut per usuaris autenticats
      if (isAuthenticated) {
        // Continuar veient
        try {
          const continueRes = await axios.get('/api/user/continue-watching');
          setContinueWatching(continueRes.data);
        } catch (e) {
          console.error('Error carregant continue watching:', e);
        }

        // Sèries recents
        try {
          const seriesRes = await axios.get('/api/series?limit=10');
          setRecentSeries(seriesRes.data || []);
        } catch (e) {
          console.error('Error carregant sèries:', e);
        }

        // Pel·lícules recents
        try {
          const moviesRes = await axios.get('/api/movies?limit=10');
          setRecentMovies(moviesRes.data || []);
        } catch (e) {
          console.error('Error carregant pel·lícules:', e);
        }

        // Mix de contingut recent
        try {
          const [series, movies] = await Promise.all([
            axios.get('/api/series?limit=5'),
            axios.get('/api/movies?limit=5')
          ]);
          const mixed = [
            ...(series.data || []).map(s => ({ ...s, type: 'series' })),
            ...(movies.data || []).map(m => ({ ...m, type: 'movie' }))
          ].sort(() => Math.random() - 0.5).slice(0, 8);
          setRecentlyAdded(mixed);
        } catch (e) {
          console.error('Error carregant contingut recent:', e);
        }
      }
    } catch (error) {
      console.error('Error carregant dades:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Component per files de contingut estil Netflix
  const ContentRow = ({ title, items, type }) => {
    if (!items || items.length === 0) return null;

    return (
      <section className="content-row">
        <h2 className="row-title">{title}</h2>
        <div className="content-scroll">
          {items.map((item) => {
            const itemType = item.type || type;
            const link = itemType === 'series' ? `/series/${item.id}` : `/movies/${item.id}`;
            const image = item.poster
              ? `${API_URL}/api/image/poster/${item.id}`
              : null;

            return (
              <div
                key={`${itemType}-${item.id}`}
                className="content-card"
                onClick={() => navigate(link)}
              >
                <div className="content-poster">
                  {image ? (
                    <img src={image} alt={item.name || item.title} />
                  ) : (
                    <div className="poster-placeholder">
                      {itemType === 'series' ? <SeriesIcon /> : <MovieIcon />}
                    </div>
                  )}
                  <div className="content-hover">
                    <button className="quick-play-btn">
                      <PlayIcon />
                    </button>
                  </div>
                </div>
                <div className="content-meta">
                  <h4>{item.name || item.title}</h4>
                  {item.year && <span className="content-year">{item.year}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
      </div>
    );
  }

  // Vista personalitzada per usuaris autenticats
  if (isAuthenticated) {
    return (
      <div className="home-container authenticated">
        {/* Salutació */}
        <div className="welcome-header">
          <h1>Hola{user?.display_name ? `, ${user.display_name}` : ''}!</h1>
          <p>Què et ve de gust veure avui?</p>
        </div>

        {/* Barra de cerca */}
        <div className="search-container compact">
          <form className="search-bar" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Cercar pel·lícules, sèries, llibres..."
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

        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <section className="continue-watching-section">
            <h2 className="row-title">
              <span className="title-icon"><PlayIcon /></span>
              Continuar veient
            </h2>
            <div className="content-scroll">
              {continueWatching.map((item) => (
                <div
                  key={item.id}
                  className="continue-card"
                  onClick={() => navigate(`/play/episode/${item.id}`)}
                >
                  <div className="continue-thumbnail">
                    {item.backdrop || item.poster ? (
                      <img
                        src={`${API_URL}/api/image/${item.backdrop ? 'backdrop' : 'poster'}/${item.series_id}`}
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

        {/* Per a tu (mix aleatori) */}
        <ContentRow
          title="Per a tu"
          items={recentlyAdded}
        />

        {/* Sèries */}
        <ContentRow
          title="Sèries"
          items={recentSeries}
          type="series"
        />

        {/* Pel·lícules */}
        <ContentRow
          title="Pel·lícules"
          items={recentMovies}
          type="movie"
        />

        {/* Accés ràpid a categories */}
        <section className="quick-access">
          <h2 className="row-title">Explorar</h2>
          <div className="quick-access-grid">
            <Link to="/series" className="quick-card gradient-series">
              <SeriesIcon />
              <span>Sèries</span>
            </Link>
            <Link to="/movies" className="quick-card gradient-movies">
              <MovieIcon />
              <span>Pel·lícules</span>
            </Link>
            <Link to="/books" className="quick-card gradient-books">
              <BookIcon />
              <span>Llibres</span>
            </Link>
            <Link to="/audiobooks" className="quick-card gradient-audiobooks">
              <AudiobookIcon />
              <span>Audiollibres</span>
            </Link>
            <Link to="/tv" className="quick-card gradient-tv">
              <TvIcon />
              <span>TV en directe</span>
            </Link>
            <Link to="/programs" className="quick-card gradient-programs">
              <ProgramsIcon />
              <span>3Cat</span>
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // Vista per usuaris no autenticats (landing page original)
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
              </div>
              <div className="hover-border"></div>
            </Link>

            {/* Programes */}
            <Link to="/programs" className="category-card active">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-programs"></div>
                <div className="floating-bubble bubble-2 gradient-programs"></div>
                <div className="floating-bubble bubble-3 gradient-programs"></div>
              </div>
              <div className="card-content">
                <ProgramsIcon />
                <h3 className="card-title">Programes</h3>
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
              </div>
              <div className="hover-border"></div>
            </Link>

            {/* Audiollibres */}
            <Link to="/audiobooks" className="category-card active">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-audiobooks"></div>
                <div className="floating-bubble bubble-2 gradient-audiobooks"></div>
                <div className="floating-bubble bubble-3 gradient-audiobooks"></div>
              </div>
              <div className="card-content">
                <AudiobookIcon />
                <h3 className="card-title">Audiollibres</h3>
              </div>
              <div className="hover-border"></div>
            </Link>

            {/* Televisió */}
            <Link to="/tv" className="category-card active">
              <div className="card-glass"></div>
              <div className="hover-bubbles">
                <div className="floating-bubble bubble-1 gradient-tv"></div>
                <div className="floating-bubble bubble-2 gradient-tv"></div>
                <div className="floating-bubble bubble-3 gradient-tv"></div>
              </div>
              <div className="card-content">
                <TvIcon />
                <h3 className="card-title">Televisió</h3>
              </div>
              <div className="hover-border"></div>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;
