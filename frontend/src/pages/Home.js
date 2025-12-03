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
  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const InfoIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
  </svg>
);

const StarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

// Component per mostrar imatge amb fallback a placeholder
const PosterImage = ({ src, alt, type }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="poster-placeholder">
        {type === 'series' ? <SeriesIcon /> : <MovieIcon />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
    />
  );
};

// Component per mostrar thumbnail de "Continuar veient" amb càrrega dinàmica de TMDB
const ContinueThumbnail = ({ item, imageUrl, type }) => {
  const [dynamicUrl, setDynamicUrl] = useState(imageUrl);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(!imageUrl && item.tmdb_id);

  useEffect(() => {
    // Si ja tenim imageUrl, no cal fer res
    if (imageUrl) {
      setDynamicUrl(imageUrl);
      setIsLoading(false);
      return;
    }

    // Si tenim tmdb_id però no imageUrl, carregar de TMDB
    if (item.tmdb_id && !imageUrl) {
      const fetchTmdbImage = async () => {
        let foundImage = false;
        let newStillPath = null;
        let newBackdropPath = null;
        let newPosterPath = null;
        const mediaType = type === 'movie' ? 'movie' : 'tv';

        // Primer intentem obtenir la imatge de l'episodi si és una sèrie
        if (type === 'series' && item.season_number && item.episode_number) {
          try {
            const seasonRes = await axios.get(`/api/tmdb/tv/${item.tmdb_id}/season/${item.season_number}`);
            const episode = seasonRes.data?.episodes?.find(ep => ep.episode_number === item.episode_number);
            if (episode?.still_path) {
              setDynamicUrl(episode.still_path);
              newStillPath = episode.still_path;
              foundImage = true;
            }
          } catch (e) {
            console.debug('Error fetching season data, trying series info:', e.message);
          }
        }

        // Si no hem trobat imatge de l'episodi, intentem el backdrop/poster de la sèrie
        if (!foundImage) {
          try {
            const res = await axios.get(`/api/tmdb/${mediaType}/${item.tmdb_id}`);
            if (res.data?.backdrop_path) {
              const backdropUrl = `https://image.tmdb.org/t/p/w780${res.data.backdrop_path}`;
              setDynamicUrl(backdropUrl);
              newBackdropPath = res.data.backdrop_path;
              foundImage = true;
            } else if (res.data?.poster_path) {
              const posterUrl = `https://image.tmdb.org/t/p/w500${res.data.poster_path}`;
              setDynamicUrl(posterUrl);
              newPosterPath = res.data.poster_path;
              foundImage = true;
            }
          } catch (e) {
            console.debug('Error fetching series/movie info:', e.message);
          }
        }

        // Guardar les imatges trobades a la BD per a futures càrregues
        if (foundImage && item.tmdb_id) {
          try {
            await axios.post('/api/streaming/progress', {
              tmdb_id: item.tmdb_id,
              media_type: type === 'movie' ? 'movie' : 'series',
              season_number: item.season_number || null,
              episode_number: item.episode_number || null,
              progress_percent: item.progress_percentage || 0,
              completed: false,
              title: item.series_name || item.title || '',
              poster_path: newPosterPath || item.poster || null,
              backdrop_path: newBackdropPath || item.backdrop || null,
              still_path: newStillPath || null
            });
          } catch (e) {
            // No és crític si falla el guardat
            console.debug('Could not save image to progress:', e.message);
          }
        }

        setIsLoading(false);
      };
      fetchTmdbImage();
    } else {
      setIsLoading(false);
    }
  }, [item.tmdb_id, item.season_number, item.episode_number, imageUrl, type, item.progress_percentage, item.series_name, item.title, item.poster, item.backdrop]);

  if (isLoading) {
    return (
      <div className="thumbnail-placeholder loading">
        {type === 'series' ? <SeriesIcon /> : <MovieIcon />}
      </div>
    );
  }

  if (!dynamicUrl || hasError) {
    return (
      <div className="thumbnail-placeholder">
        {type === 'series' ? <SeriesIcon /> : <MovieIcon />}
      </div>
    );
  }

  return (
    <img
      src={dynamicUrl}
      alt={item.series_name || item.title}
      onError={() => setHasError(true)}
    />
  );
};

function Home() {
  const { isAuthenticated, user, isPremium } = useAuth();
  const [continueWatchingMovies, setContinueWatchingMovies] = useState([]);
  const [continueWatchingSeries, setContinueWatchingSeries] = useState([]);
  const [continueWatchingPrograms, setContinueWatchingPrograms] = useState([]);
  const [continueReadingBooks, setContinueReadingBooks] = useState([]);
  const [continueListeningAudiobooks, setContinueListeningAudiobooks] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState([]);
  const [recentSeries, setRecentSeries] = useState([]);
  const [recentMovies, setRecentMovies] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
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

          // Separar per tipus de media (l'API retorna 'type', no 'media_type')
          const movies = data.filter(item => item.type === 'movie');
          const series = data.filter(item => item.type === 'series' || item.type === 'episode');
          const programs = data.filter(item => item.type === 'program');

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
          const seriesRes = await axios.get('/api/library/series?limit=10');
          setRecentSeries(seriesRes.data?.items || seriesRes.data || []);
        } catch (e) {
          console.error('Error carregant sèries:', e);
        }

        // Pel·lícules recents
        try {
          const moviesRes = await axios.get('/api/library/movies?limit=10');
          setRecentMovies(moviesRes.data?.items || moviesRes.data || []);
        } catch (e) {
          console.error('Error carregant pel·lícules:', e);
        }

        // Mix de contingut recent
        try {
          const [series, movies] = await Promise.all([
            axios.get('/api/library/series?limit=5'),
            axios.get('/api/library/movies?limit=5')
          ]);
          const seriesItems = series.data?.items || series.data || [];
          const moviesItems = movies.data?.items || movies.data || [];
          const mixed = [
            ...seriesItems.map(s => ({ ...s, type: 'series' })),
            ...moviesItems.map(m => ({ ...m, type: 'movie' }))
          ].sort(() => Math.random() - 0.5).slice(0, 8);
          setRecentlyAdded(mixed);
        } catch (e) {
          console.error('Error carregant contingut recent:', e);
        }

        // Watchlist (llista de l'usuari)
        try {
          const watchlistRes = await axios.get('/api/user/watchlist?limit=10');
          setWatchlist(watchlistRes.data || []);
        } catch (e) {
          console.debug('Watchlist no disponible');
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
                  <PosterImage
                    src={image}
                    alt={item.name || item.title}
                    type={itemType}
                  />
                  <div className="content-hover">
                    <button className="quick-play-btn">
                      {isPremium ? <PlayIcon /> : <InfoIcon />}
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
        {/* Header amb salutació i cerca */}
        <div className="home-header">
          <h1 className="home-greeting">
            <span>Hola{user?.display_name ? `, ${user.display_name}` : ''}!</span>
            <span className="greeting-subtitle">Què et ve de gust veure avui?</span>
          </h1>
          <form className="search-bar compact" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Cercar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </form>
        </div>

        {/* Continue Watching - Pel·lícules */}
        {continueWatchingMovies.length > 0 && (
          <section className="continue-watching-section">
            <h2 className="row-title">Continuar veient pel·lícules</h2>
            <div className="content-scroll">
              {continueWatchingMovies.map((item, index) => {
                // Determinar URL de la imatge segons la font
                let imageUrl = null;
                if (item.source === 'streaming') {
                  // Per streaming, usar TMDB directament
                  if (item.backdrop) {
                    imageUrl = `https://image.tmdb.org/t/p/w780${item.backdrop}`;
                  } else if (item.poster) {
                    imageUrl = `https://image.tmdb.org/t/p/w500${item.poster}`;
                  }
                } else {
                  // Per contingut local
                  if (item.backdrop || item.poster) {
                    imageUrl = `${API_URL}/api/image/${item.backdrop ? 'backdrop' : 'poster'}/${item.series_id || item.id}`;
                  }
                }

                return (
                  <div
                    key={item.source === 'streaming' ? `stream-${item.tmdb_id}` : `local-${item.id}-${index}`}
                    className="continue-card"
                    onClick={() => {
                      // Sempre navegar a streaming
                      if (item.tmdb_id) {
                        navigate(`/stream/movie/${item.tmdb_id}`);
                      } else {
                        navigate(`/movies/${item.series_id || item.id}`);
                      }
                    }}
                  >
                    <div className="continue-thumbnail">
                      <ContinueThumbnail
                        item={item}
                        imageUrl={imageUrl}
                        type="movie"
                      />
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
                );
              })}
            </div>
          </section>
        )}

        {/* Continue Watching - Sèries */}
        {continueWatchingSeries.length > 0 && (
          <section className="continue-watching-section">
            <h2 className="row-title">Continuar veient sèries</h2>
            <div className="content-scroll">
              {continueWatchingSeries.map((item, index) => {
                // Determinar URL de la imatge segons la font
                // Prioritat: still_path (miniatura episodi) > backdrop > poster
                let imageUrl = null;
                if (item.source === 'streaming') {
                  // Per streaming, prioritzar still_path (miniatura de l'episodi)
                  if (item.still_path) {
                    // still_path pot venir com URL completa o només el path
                    imageUrl = item.still_path.startsWith('http')
                      ? item.still_path
                      : `https://image.tmdb.org/t/p/w500${item.still_path}`;
                  } else if (item.backdrop) {
                    imageUrl = item.backdrop.startsWith('http')
                      ? item.backdrop
                      : `https://image.tmdb.org/t/p/w780${item.backdrop}`;
                  } else if (item.poster) {
                    imageUrl = item.poster.startsWith('http')
                      ? item.poster
                      : `https://image.tmdb.org/t/p/w500${item.poster}`;
                  }
                } else {
                  // Per contingut local
                  if (item.backdrop || item.poster) {
                    imageUrl = `${API_URL}/api/image/${item.backdrop ? 'backdrop' : 'poster'}/${item.series_id}`;
                  }
                }

                return (
                  <div
                    key={item.source === 'streaming' ? `stream-${item.tmdb_id}-${item.season_number}-${item.episode_number}` : `local-${item.id}-${index}`}
                    className="continue-card"
                    onClick={() => {
                      if (item.tmdb_id) {
                        navigate(`/stream/tv/${item.tmdb_id}?s=${item.season_number || 1}&e=${item.episode_number || 1}`);
                      } else {
                        navigate(`/series/${item.series_id}`);
                      }
                    }}
                  >
                    <div className="continue-thumbnail">
                      <ContinueThumbnail
                        item={item}
                        imageUrl={imageUrl}
                        type="series"
                      />
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
                );
              })}
            </div>
          </section>
        )}

        {/* Continue Watching - Programes */}
        {continueWatchingPrograms.length > 0 && (
          <section className="continue-watching-section">
            <h2 className="row-title">Continuar veient programes</h2>
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
            <h2 className="row-title">Continua llegint</h2>
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
            <h2 className="row-title">Continua escoltant</h2>
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

        {/* La meva llista (Watchlist) */}
        {watchlist.length > 0 && (
          <section className="content-row">
            <h2 className="row-title">
              La meva llista
              <Link to="/watchlist" className="see-all-link">Veure tot</Link>
            </h2>
            <div className="content-scroll">
              {watchlist.map((item) => {
                const itemType = item.media_type === 'movie' ? 'movies' : 'series';
                const link = `/${itemType}/tmdb-${item.tmdb_id}`;
                const image = item.poster_path
                  ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                  : null;

                return (
                  <div
                    key={`watchlist-${item.id}`}
                    className="content-card"
                    onClick={() => navigate(link)}
                  >
                    <div className="content-poster">
                      {image ? (
                        <img src={image} alt={item.title} />
                      ) : (
                        <div className="poster-placeholder">
                          {item.media_type === 'movie' ? <MovieIcon /> : <SeriesIcon />}
                        </div>
                      )}
                      <div className="content-hover">
                        <button className="quick-play-btn" onClick={(e) => {
                          e.stopPropagation();
                          if (isPremium) {
                            if (item.media_type === 'movie') {
                              navigate(`/stream/movie/${item.tmdb_id}`);
                            } else {
                              navigate(`/stream/tv/${item.tmdb_id}?s=1&e=1`);
                            }
                          } else {
                            // Per no premium, anar a la pàgina de detalls
                            navigate(link);
                          }
                        }}>
                          {isPremium ? <PlayIcon /> : <InfoIcon />}
                        </button>
                      </div>
                    </div>
                    <div className="content-meta">
                      <h4>{item.title}</h4>
                      <div className="content-meta-row">
                        {item.year && <span className="content-year">{item.year}</span>}
                        {item.rating && (
                          <span className="content-rating">
                            <StarIcon /> {item.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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
