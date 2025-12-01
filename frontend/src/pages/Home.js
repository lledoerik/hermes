import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Home.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// Icons as SVG components - Modern design
const MovieIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19.82 2H4.18C2.97 2 2 2.97 2 4.18v15.64C2 21.03 2.97 22 4.18 22h15.64c1.21 0 2.18-.97 2.18-2.18V4.18C22 2.97 21.03 2 19.82 2z"/>
    <path d="M7 2v20"/>
    <path d="M17 2v20"/>
    <path d="M2 12h20"/>
    <path d="M2 7h5"/>
    <path d="M2 17h5"/>
    <path d="M17 17h5"/>
    <path d="M17 7h5"/>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
  </svg>
);

const SeriesIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="6" width="16" height="12" rx="2"/>
    <path d="M2 8v8"/>
    <path d="M22 8v8"/>
    <polygon points="10 9 10 15 15 12 10 9" fill="currentColor" stroke="none"/>
  </svg>
);

const BookIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6.25278C12 6.25278 10.5 3 6.5 3C4 3 2 4.5 2 7V19C2 19 4 17.5 6.5 17.5C9 17.5 10.5 18.5 12 20"/>
    <path d="M12 6.25278C12 6.25278 13.5 3 17.5 3C20 3 22 4.5 22 7V19C22 19 20 17.5 17.5 17.5C15 17.5 13.5 18.5 12 20"/>
    <path d="M12 6.25278V20"/>
  </svg>
);

const AudiobookIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z"/>
    <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z"/>
    <circle cx="12" cy="13" r="2"/>
    <path d="M12 15v3"/>
    <path d="M9.5 5.5a4 4 0 0 1 5 0"/>
  </svg>
);

const ProgramsIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8"/>
    <path d="M12 17v4"/>
    <path d="M7 8h2"/>
    <path d="M7 11h4"/>
    <rect x="13" y="7" width="5" height="5" rx="1" fill="currentColor" opacity="0.3"/>
  </svg>
);

const TvIcon = () => (
  <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M17 2l-5 5-5-5"/>
    <circle cx="12" cy="14" r="3"/>
    <path d="M12 11v0"/>
  </svg>
);

const PlayIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"/>
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/>
  </svg>
);

function Home() {
  const { isAuthenticated, user } = useAuth();
  const [continueWatchingMovies, setContinueWatchingMovies] = useState([]);
  const [continueWatchingSeries, setContinueWatchingSeries] = useState([]);
  const [continueWatchingPrograms, setContinueWatchingPrograms] = useState([]);
  const [continueReadingBooks, setContinueReadingBooks] = useState([]);
  const [continueListeningAudiobooks, setContinueListeningAudiobooks] = useState([]);
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
        // Continuar veient - separar per categories
        try {
          const continueRes = await axios.get('/api/user/continue-watching');
          const data = continueRes.data || [];

          // Separar per tipus de media
          const movies = data.filter(item => item.media_type === 'movie');
          const series = data.filter(item => item.media_type === 'series' || item.media_type === 'episode');
          const programs = data.filter(item => item.media_type === 'program');

          setContinueWatchingMovies(movies);
          setContinueWatchingSeries(series);
          setContinueWatchingPrograms(programs);
        } catch (e) {
          console.error('Error carregant continue watching:', e);
        }

        // Continuar llegint
        try {
          const booksRes = await axios.get('/api/user/continue-reading');
          setContinueReadingBooks(booksRes.data || []);
        } catch (e) {
          // API pot no existir encara
          console.debug('Continue reading no disponible');
        }

        // Continuar escoltant
        try {
          const audiobooksRes = await axios.get('/api/user/continue-listening');
          setContinueListeningAudiobooks(audiobooksRes.data || []);
        } catch (e) {
          // API pot no existir encara
          console.debug('Continue listening no disponible');
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

        {/* Continue Watching - Pel·lícules */}
        {continueWatchingMovies.length > 0 && (
          <section className="continue-watching-section">
            <h2 className="row-title">
              <span className="title-icon"><MovieIcon /></span>
              Continuar veient pel·lícules
            </h2>
            <div className="content-scroll">
              {continueWatchingMovies.map((item) => (
                <div
                  key={item.id}
                  className="continue-card"
                  onClick={() => navigate(`/play/movie/${item.series_id || item.id}`)}
                >
                  <div className="continue-thumbnail">
                    {item.backdrop || item.poster ? (
                      <img
                        src={`${API_URL}/api/image/${item.backdrop ? 'backdrop' : 'poster'}/${item.series_id || item.id}`}
                        alt={item.series_name || item.title}
                      />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <MovieIcon />
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
                    <h3 className="continue-title">{item.series_name || item.title}</h3>
                    <span className="continue-time">
                      {formatTime(item.total_seconds - item.progress_seconds)} restants
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Continue Watching - Sèries */}
        {continueWatchingSeries.length > 0 && (
          <section className="continue-watching-section">
            <h2 className="row-title">
              <span className="title-icon"><SeriesIcon /></span>
              Continuar veient sèries
            </h2>
            <div className="content-scroll">
              {continueWatchingSeries.map((item) => (
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

        {/* Continue Watching - Programes */}
        {continueWatchingPrograms.length > 0 && (
          <section className="continue-watching-section">
            <h2 className="row-title">
              <span className="title-icon"><ProgramsIcon /></span>
              Continuar veient programes
            </h2>
            <div className="content-scroll">
              {continueWatchingPrograms.map((item) => (
                <div
                  key={item.id}
                  className="continue-card"
                  onClick={() => navigate(`/play/program/${item.id}`)}
                >
                  <div className="continue-thumbnail">
                    {item.backdrop || item.poster ? (
                      <img
                        src={`${API_URL}/api/image/${item.backdrop ? 'backdrop' : 'poster'}/${item.series_id || item.id}`}
                        alt={item.series_name || item.title}
                      />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <ProgramsIcon />
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
                    <h3 className="continue-title">{item.series_name || item.title}</h3>
                    <span className="continue-time">
                      {formatTime(item.total_seconds - item.progress_seconds)} restants
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Continua llegint - Llibres */}
        {continueReadingBooks.length > 0 && (
          <section className="continue-watching-section">
            <h2 className="row-title">
              <span className="title-icon"><BookIcon /></span>
              Continua llegint
            </h2>
            <div className="content-scroll">
              {continueReadingBooks.map((item) => (
                <div
                  key={item.id}
                  className="continue-card book-card"
                  onClick={() => navigate(`/books/${item.id}/read`)}
                >
                  <div className="continue-thumbnail book-thumbnail">
                    {item.cover ? (
                      <img
                        src={`${API_URL}/api/books/${item.id}/cover`}
                        alt={item.title}
                      />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <BookIcon />
                      </div>
                    )}
                    <div className="continue-overlay">
                      <button className="play-btn">
                        <BookIcon />
                      </button>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${item.progress_percentage || 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="continue-info">
                    <h3 className="continue-title">{item.title}</h3>
                    <span className="continue-time">
                      {item.current_page && item.total_pages
                        ? `Pàgina ${item.current_page} de ${item.total_pages}`
                        : `${item.progress_percentage || 0}%`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Continua escoltant - Audiollibres */}
        {continueListeningAudiobooks.length > 0 && (
          <section className="continue-watching-section">
            <h2 className="row-title">
              <span className="title-icon"><AudiobookIcon /></span>
              Continua escoltant
            </h2>
            <div className="content-scroll">
              {continueListeningAudiobooks.map((item) => (
                <div
                  key={item.id}
                  className="continue-card"
                  onClick={() => navigate(`/audiobooks/${item.id}/listen`)}
                >
                  <div className="continue-thumbnail">
                    {item.cover ? (
                      <img
                        src={`${API_URL}/api/audiobooks/${item.id}/cover`}
                        alt={item.title}
                      />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <AudiobookIcon />
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
                        style={{ width: `${item.progress_percentage || 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="continue-info">
                    <h3 className="continue-title">{item.title}</h3>
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
          <div className="quick-access-grid">
            <Link to="/movies" className="quick-card">
              <div className="quick-bubble gradient-movies"></div>
              <MovieIcon />
              <span>Pel·lícules</span>
            </Link>
            <Link to="/series" className="quick-card">
              <div className="quick-bubble gradient-series"></div>
              <SeriesIcon />
              <span>Sèries</span>
            </Link>
            {user?.is_admin ? (
              <Link to="/programs" className="quick-card">
                <div className="quick-bubble gradient-programs"></div>
                <ProgramsIcon />
                <span>Programes</span>
              </Link>
            ) : (
              <div className="quick-card inactive">
                <div className="quick-bubble gradient-programs"></div>
                <ProgramsIcon />
                <span>Programes</span>
                <span className="coming-soon">Properament</span>
              </div>
            )}
            <Link to="/books" className="quick-card">
              <div className="quick-bubble gradient-books"></div>
              <BookIcon />
              <span>Llibres</span>
            </Link>
            <Link to="/audiobooks" className="quick-card">
              <div className="quick-bubble gradient-audiobooks"></div>
              <AudiobookIcon />
              <span>Audiollibres</span>
            </Link>
            <Link to="/tv" className="quick-card">
              <div className="quick-bubble gradient-tv"></div>
              <TvIcon />
              <span>TV en directe</span>
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
              <div className="category-bubble gradient-movies"></div>
              <div className="card-content">
                <MovieIcon />
                <h3 className="card-title">Pel·lícules</h3>
              </div>
              <div className="hover-border"></div>
            </Link>

            {/* Sèries */}
            <Link to="/series" className="category-card active">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-series"></div>
              <div className="card-content">
                <SeriesIcon />
                <h3 className="card-title">Sèries</h3>
              </div>
              <div className="hover-border"></div>
            </Link>

            {/* Programes - Inactiu */}
            <div className="category-card inactive">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-programs"></div>
              <div className="card-content">
                <ProgramsIcon />
                <h3 className="card-title">Programes</h3>
                <span className="coming-soon">Properament</span>
              </div>
              <div className="hover-border"></div>
            </div>

            {/* Llibres */}
            <Link to="/books" className="category-card active">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-books"></div>
              <div className="card-content">
                <BookIcon />
                <h3 className="card-title">Llibres</h3>
              </div>
              <div className="hover-border"></div>
            </Link>

            {/* Audiollibres */}
            <Link to="/audiobooks" className="category-card active">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-audiobooks"></div>
              <div className="card-content">
                <AudiobookIcon />
                <h3 className="card-title">Audiollibres</h3>
              </div>
              <div className="hover-border"></div>
            </Link>

            {/* Televisió */}
            <Link to="/tv" className="category-card active">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-tv"></div>
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
