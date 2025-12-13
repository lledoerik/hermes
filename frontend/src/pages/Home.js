import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import LazyImage from '../components/LazyImage';
import {
  MovieIcon,
  SeriesIcon,
  BookIcon,
  AudiobookIcon,
  ProgramsIcon,
  TvIcon,
  PlayIcon,
  InfoIcon,
  StarIcon
} from '../components/icons';
import './Home.css';

// Hook per drag-to-scroll (optimitzat per evitar re-renders)
const useDragScroll = () => {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const isMouseDown = useRef(false);
  const hasDragged = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  // Actualitza les classes CSS directament sense causar re-renders
  const updateScrollClasses = useCallback(() => {
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;

    const canScrollLeft = container.scrollLeft > 0;
    const canScrollRight = container.scrollLeft < container.scrollWidth - container.clientWidth - 5;

    wrapper.classList.toggle('can-scroll-left', canScrollLeft);
    wrapper.classList.toggle('can-scroll-right', canScrollRight);
  }, []);

  useEffect(() => {
    updateScrollClasses();
    window.addEventListener('resize', updateScrollClasses);
    return () => window.removeEventListener('resize', updateScrollClasses);
  }, [updateScrollClasses]);

  const handleMouseDown = useCallback((e) => {
    const container = containerRef.current;
    if (!container) return;
    isMouseDown.current = true;
    hasDragged.current = false;
    startX.current = e.pageX - container.offsetLeft;
    scrollLeft.current = container.scrollLeft;
  }, []);

  const handleMouseUp = useCallback(() => {
    isMouseDown.current = false;
    setIsDragging(false);
    const container = containerRef.current;
    if (container) {
      container.style.scrollBehavior = 'smooth';
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isMouseDown.current) return;
    const container = containerRef.current;
    if (!container) return;

    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX.current) * 1.5;

    if (!isDragging && Math.abs(walk) > 5) {
      setIsDragging(true);
      hasDragged.current = true;
      container.style.scrollBehavior = 'auto';
    }

    if (isDragging) {
      e.preventDefault();
      container.scrollLeft = scrollLeft.current - walk;
    }
  }, [isDragging]);

  // Prevent click events from firing if we dragged
  const handleClick = useCallback((e) => {
    if (hasDragged.current) {
      e.stopPropagation();
      hasDragged.current = false;
    }
  }, []);

  return {
    containerRef,
    wrapperRef,
    isDragging,
    handlers: {
      onMouseDown: handleMouseDown,
      onMouseUp: handleMouseUp,
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseUp,
      onScroll: updateScrollClasses,
      onClickCapture: handleClick,
    },
  };
};

// Component per scroll horitzontal amb drag
const ScrollableContainer = ({ children, className = '' }) => {
  const { containerRef, wrapperRef, isDragging, handlers } = useDragScroll();

  return (
    <div ref={wrapperRef} className="scrollable-wrapper">
      <div
        ref={containerRef}
        className={`content-scroll ${isDragging ? 'dragging' : ''} ${className}`}
        {...handlers}
      >
        {children}
      </div>
    </div>
  );
};

axios.defaults.baseURL = API_URL;

// Component per mostrar imatge amb fallback a placeholder i lazy loading
const PosterImage = React.memo(({ src, alt, type }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="poster-placeholder">
        {type === 'series' ? <SeriesIcon /> : <MovieIcon />}
      </div>
    );
  }

  return (
    <LazyImage
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
    />
  );
});

// Component per mostrar thumbnail de "Continuar veient" amb càrrega dinàmica de TMDB
const ContinueThumbnail = React.memo(({ item, imageUrl, type }) => {
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
  // Només re-executar quan canviïn les dades necessàries per obtenir la imatge
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.tmdb_id, item.season_number, item.episode_number, imageUrl, type]);

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
    <LazyImage
      src={dynamicUrl}
      alt={item.series_name || item.title}
      onError={() => setHasError(true)}
    />
  );
});

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
  const [searchQuery, setSearchQuery] = useState(''); // Només per landing page (no autenticat)
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

        // Mix de contingut recent (Per a tu - 10 elements)
        try {
          const [series, movies] = await Promise.all([
            axios.get('/api/library/series?limit=6'),
            axios.get('/api/library/movies?limit=6')
          ]);
          const seriesItems = series.data?.items || series.data || [];
          const moviesItems = movies.data?.items || movies.data || [];
          const mixed = [
            ...seriesItems.map(s => ({ ...s, type: 'series' })),
            ...moviesItems.map(m => ({ ...m, type: 'movie' }))
          ].sort(() => Math.random() - 0.5).slice(0, 10);
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

  // Component per files de contingut estil Netflix
  const ContentRow = ({ title, items, type }) => {
    if (!items || items.length === 0) return null;

    return (
      <section className="content-row">
        <h2 className="row-title">{title}</h2>
        <ScrollableContainer>
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
                    <button
                      className="quick-play-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(link);
                      }}
                    >
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
        </ScrollableContainer>
      </section>
    );
  };

  // No loading screen - render immediately with skeleton/empty state
  // This provides a smoother experience between page transitions

  // Check if there's any "continue watching" content
  const hasContinueContent = continueWatchingMovies.length > 0 ||
    continueWatchingSeries.length > 0 ||
    continueWatchingPrograms.length > 0 ||
    (user?.is_admin && continueReadingBooks.length > 0) ||
    (user?.is_admin && continueListeningAudiobooks.length > 0);

  // Combinar tot el contingut "continuar veient" en una sola llista
  const allContinueWatching = [
    ...continueWatchingMovies.map(item => ({ ...item, mediaType: 'movie' })),
    ...continueWatchingSeries.map(item => ({ ...item, mediaType: 'series' }))
  ].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

  // Vista personalitzada per usuaris autenticats - DISSENY HERO ELEGANT
  if (isAuthenticated) {
    return (
      <div className="home-container authenticated">
        {/* Hero Section - Salutació + Cerca */}
        <section className="home-hero">
          <div className="home-hero-content">
            {/* Salutació */}
            <div className="home-greeting">
              <h1>Hola, {user?.display_name || user?.username || 'amic'}!</h1>
              <p>Què t'agradaria veure?</p>
            </div>

            {/* Barra de cerca elegant */}
            <form className="home-search" onSubmit={handleSearch}>
              <div className="home-search-inner">
                <svg className="home-search-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Cerca pel·lícules, sèries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </form>
          </div>

          {/* Continue Watching - Dins del hero, sota la cerca */}
          {allContinueWatching.length > 0 && (
            <div className="home-continue">
              <div className="home-continue-header">
                <h2>Continuar veient</h2>
              </div>
              <div className="home-continue-grid">
                {allContinueWatching.slice(0, 4).map((item, index) => {
                  const isMovie = item.mediaType === 'movie';
                  let imageUrl = null;

                  if (item.source === 'streaming') {
                    if (item.still_path) {
                      imageUrl = item.still_path.startsWith('http') ? item.still_path : `https://image.tmdb.org/t/p/w500${item.still_path}`;
                    } else if (item.backdrop) {
                      imageUrl = item.backdrop.startsWith('http') ? item.backdrop : `https://image.tmdb.org/t/p/w780${item.backdrop}`;
                    } else if (item.poster) {
                      imageUrl = item.poster.startsWith('http') ? item.poster : `https://image.tmdb.org/t/p/w500${item.poster}`;
                    }
                  } else {
                    if (item.backdrop || item.poster) {
                      imageUrl = `${API_URL}/api/image/${item.backdrop ? 'backdrop' : 'poster'}/${item.series_id || item.id}`;
                    }
                  }

                  return (
                    <div
                      key={`continue-${item.tmdb_id || item.id}-${index}`}
                      className="home-continue-card"
                      onClick={() => {
                        if (item.tmdb_id) {
                          if (isMovie) {
                            navigate(`/debrid/movie/${item.tmdb_id}`);
                          } else {
                            navigate(`/debrid/tv/${item.tmdb_id}?s=${item.season_number || 1}&e=${item.episode_number || 1}`);
                          }
                        } else {
                          navigate(isMovie ? `/movies/${item.id}` : `/series/${item.series_id}`);
                        }
                      }}
                    >
                      <div className="home-continue-thumb">
                        <ContinueThumbnail item={item} imageUrl={imageUrl} type={item.mediaType} />
                        <div className="home-continue-overlay">
                          <PlayIcon size={36} />
                        </div>
                        <div className="home-continue-progress">
                          <div className="home-continue-progress-fill" style={{ width: `${item.progress_percentage}%` }} />
                        </div>
                      </div>
                      <div className="home-continue-info">
                        <span className="home-continue-title">{item.series_name || item.title}</span>
                        {!isMovie && item.season_number && (
                          <span className="home-continue-ep">T{item.season_number} E{item.episode_number}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Contingut addicional - Sota el fold */}
        <div className="auth-content">
          {/* Més "continuar veient" si n'hi ha més de 4 */}
          {allContinueWatching.length > 4 && (
            <section className="continue-watching-section">
              <h2 className="row-title">Més per continuar</h2>
              <ScrollableContainer>
                {allContinueWatching.slice(4).map((item, index) => {
                  const isMovie = item.mediaType === 'movie';
                  let imageUrl = null;

                  if (item.source === 'streaming') {
                    if (item.still_path) {
                      imageUrl = item.still_path.startsWith('http') ? item.still_path : `https://image.tmdb.org/t/p/w500${item.still_path}`;
                    } else if (item.backdrop) {
                      imageUrl = item.backdrop.startsWith('http') ? item.backdrop : `https://image.tmdb.org/t/p/w780${item.backdrop}`;
                    } else if (item.poster) {
                      imageUrl = item.poster.startsWith('http') ? item.poster : `https://image.tmdb.org/t/p/w500${item.poster}`;
                    }
                  } else {
                    if (item.backdrop || item.poster) {
                      imageUrl = `${API_URL}/api/image/${item.backdrop ? 'backdrop' : 'poster'}/${item.series_id || item.id}`;
                    }
                  }

                  return (
                    <div
                      key={`continue-extra-${item.tmdb_id || item.id}-${index}`}
                      className="continue-card"
                    >
                      <div
                        className="continue-thumbnail"
                        onClick={() => {
                          if (item.tmdb_id) {
                            if (isMovie) {
                              navigate(`/debrid/movie/${item.tmdb_id}`);
                            } else {
                              navigate(`/debrid/tv/${item.tmdb_id}?s=${item.season_number || 1}&e=${item.episode_number || 1}`);
                            }
                          } else {
                            navigate(isMovie ? `/movies/${item.id}` : `/series/${item.series_id}`);
                          }
                        }}
                      >
                        <ContinueThumbnail item={item} imageUrl={imageUrl} type={item.mediaType} />
                        <div className="continue-overlay">
                          <button className="play-btn">
                            <PlayIcon />
                          </button>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${item.progress_percentage}%` }} />
                        </div>
                      </div>
                      <div className="continue-info">
                        <h3 className="continue-title">{item.series_name || item.title}</h3>
                        {!isMovie && item.season_number && (
                          <span className="continue-episode">T{item.season_number} E{item.episode_number}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </ScrollableContainer>
            </section>
          )}

        </div>

        {/* La meva llista (Watchlist) - Fora del hasContinueContent */}
        {watchlist.length > 0 && (
          <div className="auth-content">
            <section className="content-row">
              <h2 className="row-title">
                La meva llista
                <Link to="/watchlist" className="see-all-link">Veure tot</Link>
              </h2>
              <ScrollableContainer>
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
                          <LazyImage src={image} alt={item.title} />
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
                                navigate(`/debrid/movie/${item.tmdb_id}`);
                              } else {
                                navigate(`/debrid/tv/${item.tmdb_id}?s=1&e=1`);
                              }
                            } else {
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
              </ScrollableContainer>
            </section>
          </div>
        )}

        {/* Recomanacions - Sempre visible */}
        <div className="auth-content">
          {/* Per a tu (mix aleatori) */}
          <ContentRow
            title="Recomanat per a tu"
            items={recentlyAdded}
          />

          {/* Sèries */}
          <ContentRow
            title="Sèries populars"
            items={recentSeries}
            type="series"
          />

          {/* Pel·lícules */}
          <ContentRow
            title="Pel·lícules destacades"
            items={recentMovies}
            type="movie"
          />
        </div>
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

            {/* Llibres - Properament */}
            <div className="category-card inactive">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-books"></div>
              <div className="card-content">
                <BookIcon />
                <h3 className="card-title">Llibres</h3>
                <span className="coming-soon">Properament</span>
              </div>
              <div className="hover-border"></div>
            </div>

            {/* Audiollibres - Properament */}
            <div className="category-card inactive">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-audiobooks"></div>
              <div className="card-content">
                <AudiobookIcon />
                <h3 className="card-title">Audiollibres</h3>
                <span className="coming-soon">Properament</span>
              </div>
              <div className="hover-border"></div>
            </div>

            {/* Televisió - Properament */}
            <div className="category-card inactive">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-tv"></div>
              <div className="card-content">
                <TvIcon />
                <h3 className="card-title">Televisió</h3>
                <span className="coming-soon">Properament</span>
              </div>
              <div className="hover-border"></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;
