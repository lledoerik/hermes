import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import LazyImage from '../components/LazyImage';
import CenterFocusCarousel from '../components/CenterFocusCarousel';
import {
  MovieIcon,
  SeriesIcon,
  BookIcon,
  AudiobookIcon,
  ProgramsIcon,
  TvIcon,
  PlayIcon,
  InfoIcon
} from '../components/icons';
import './Home.css';

axios.defaults.baseURL = API_URL;

// Component per mostrar thumbnail de "Continuar veient" amb càrrega dinàmica de TMDB
const ContinueThumbnail = React.memo(({ item, imageUrl, type }) => {
  const [dynamicUrl, setDynamicUrl] = useState(imageUrl);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(!imageUrl && item.tmdb_id);

  useEffect(() => {
    if (imageUrl) {
      setDynamicUrl(imageUrl);
      setIsLoading(false);
      return;
    }

    if (item.tmdb_id && !imageUrl) {
      const fetchTmdbImage = async () => {
        let foundImage = false;
        let newStillPath = null;
        let newBackdropPath = null;
        let newPosterPath = null;
        const mediaType = type === 'movie' ? 'movie' : 'tv';

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
            console.debug('Error fetching season data:', e.message);
          }
        }

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
            console.debug('Error fetching media info:', e.message);
          }
        }

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
            console.debug('Could not save image to progress:', e.message);
          }
        }

        setIsLoading(false);
      };
      fetchTmdbImage();
    } else {
      setIsLoading(false);
    }
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
  const [recommendations, setRecommendations] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      if (isAuthenticated) {
        // Continuar veient
        try {
          const continueRes = await axios.get('/api/user/continue-watching');
          const data = continueRes.data || [];
          const movies = data.filter(item => item.type === 'movie');
          const series = data.filter(item => item.type === 'series' || item.type === 'episode');
          setContinueWatchingMovies(movies);
          setContinueWatchingSeries(series);
        } catch (e) {
          console.error('Error carregant continue watching:', e);
        }

        // Carregar recomanacions basades en l'historial o populars de TMDB
        try {
          let recommendedItems = [];

          // Si l'usuari té historial, basar recomanacions en això
          const watchHistoryRes = await axios.get('/api/user/watch-history?limit=5').catch(() => null);
          const watchHistory = watchHistoryRes?.data || [];

          if (watchHistory.length > 0) {
            // Obtenir recomanacions basades en els últims títols vistos
            const recommendationPromises = watchHistory.slice(0, 3).map(async (item) => {
              const mediaType = item.type === 'movie' ? 'movie' : 'tv';
              const tmdbId = item.tmdb_id;
              if (!tmdbId) return [];

              try {
                const recRes = await axios.get(`/api/tmdb/${mediaType}/${tmdbId}/recommendations`);
                return (recRes.data?.results || []).slice(0, 8).map(rec => ({
                  ...rec,
                  type: mediaType === 'movie' ? 'movie' : 'series',
                  name: rec.title || rec.name,
                  year: (rec.release_date || rec.first_air_date || '').split('-')[0],
                  poster: rec.poster_path ? `https://image.tmdb.org/t/p/w300${rec.poster_path}` : null,
                  tmdb_id: rec.id,
                  is_tmdb: true
                }));
              } catch (e) {
                return [];
              }
            });

            const allRecs = await Promise.all(recommendationPromises);
            recommendedItems = allRecs.flat();

            // Eliminar duplicats
            const seen = new Set();
            recommendedItems = recommendedItems.filter(item => {
              if (seen.has(item.tmdb_id)) return false;
              seen.add(item.tmdb_id);
              return true;
            });
          }

          // Si no tenim prou recomanacions, afegir contingut popular de TMDB
          if (recommendedItems.length < 20) {
            const [popularMovies, popularSeries] = await Promise.all([
              axios.get('/api/tmdb/movie/popular').catch(() => ({ data: { results: [] } })),
              axios.get('/api/tmdb/tv/popular').catch(() => ({ data: { results: [] } }))
            ]);

            const tmdbMovies = (popularMovies.data?.results || []).slice(0, 10).map(m => ({
              ...m,
              type: 'movie',
              name: m.title,
              year: (m.release_date || '').split('-')[0],
              poster: m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : null,
              tmdb_id: m.id,
              is_tmdb: true
            }));

            const tmdbSeries = (popularSeries.data?.results || []).slice(0, 10).map(s => ({
              ...s,
              type: 'series',
              name: s.name,
              year: (s.first_air_date || '').split('-')[0],
              poster: s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : null,
              tmdb_id: s.id,
              is_tmdb: true
            }));

            // Combinar i barrejar
            const popular = [...tmdbMovies, ...tmdbSeries].sort(() => Math.random() - 0.5);

            // Afegir els que no siguin duplicats
            const existingIds = new Set(recommendedItems.map(i => i.tmdb_id));
            for (const item of popular) {
              if (!existingIds.has(item.tmdb_id) && recommendedItems.length < 20) {
                recommendedItems.push(item);
                existingIds.add(item.tmdb_id);
              }
            }
          }

          // Barrejar per varietat
          recommendedItems = recommendedItems.sort(() => Math.random() - 0.5).slice(0, 20);
          setRecommendations(recommendedItems);
        } catch (e) {
          console.error('Error carregant recomanacions:', e);
          // Fallback: carregar contingut local
          try {
            const [series, movies] = await Promise.all([
              axios.get('/api/library/series?limit=12'),
              axios.get('/api/library/movies?limit=12')
            ]);
            const seriesItems = series.data?.items || series.data || [];
            const moviesItems = movies.data?.items || movies.data || [];
            const mixed = [
              ...seriesItems.map(s => ({ ...s, type: 'series' })),
              ...moviesItems.map(m => ({ ...m, type: 'movie' }))
            ].sort(() => Math.random() - 0.5).slice(0, 20);
            setRecommendations(mixed);
          } catch (err) {
            console.error('Error carregant contingut local:', err);
          }
        }

        // Watchlist
        try {
          const watchlistRes = await axios.get('/api/user/watchlist?limit=20');
          setWatchlist(watchlistRes.data || []);
        } catch (e) {
          console.debug('Watchlist no disponible');
        }
      }
    } catch (error) {
      console.error('Error carregant dades:', error);
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

  // Combinar contingut "continuar veient"
  const allContinueWatching = [
    ...continueWatchingMovies.map(item => ({ ...item, mediaType: 'movie' })),
    ...continueWatchingSeries.map(item => ({ ...item, mediaType: 'series' }))
  ].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

  // Render item per al carousel de recomanacions
  const renderRecommendationItem = useCallback((item, index, isCenter) => {
    const itemType = item.type || 'series';
    const link = item.is_tmdb
      ? `/${itemType === 'movie' ? 'movies' : 'series'}/tmdb-${item.tmdb_id}`
      : `/${itemType === 'movie' ? 'movies' : 'series'}/${item.id}`;
    const image = item.poster || (item.id ? `${API_URL}/api/image/poster/${item.id}` : null);

    return (
      <div
        className="carousel-poster-card"
        onClick={() => navigate(link)}
      >
        <div className="carousel-poster-card__image">
          {image ? (
            <LazyImage src={image} alt={item.name || item.title} />
          ) : (
            <div className="poster-placeholder">
              {itemType === 'series' ? <SeriesIcon /> : <MovieIcon />}
            </div>
          )}
          <button
            className="carousel-poster-card__overlay"
            onClick={(e) => {
              e.stopPropagation();
              if (isPremium && item.is_tmdb) {
                if (itemType === 'movie') {
                  navigate(`/debrid/movie/${item.tmdb_id}`);
                } else {
                  navigate(`/debrid/tv/${item.tmdb_id}?s=1&e=1`);
                }
              } else {
                navigate(link);
              }
            }}
          >
            {isPremium ? <PlayIcon size={isCenter ? 36 : 28} /> : <InfoIcon size={isCenter ? 36 : 28} />}
          </button>
        </div>
        <span className="carousel-poster-card__title">{item.name || item.title}</span>
        {item.year && <span className="carousel-poster-card__year">{item.year}</span>}
      </div>
    );
  }, [navigate, isPremium]);

  // Render item per al carousel de watchlist
  const renderWatchlistItem = useCallback((item, index, isCenter) => {
    const itemType = item.media_type === 'movie' ? 'movies' : 'series';
    const link = `/${itemType}/tmdb-${item.tmdb_id}`;
    const image = item.poster_path
      ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
      : null;

    return (
      <div
        className="carousel-poster-card"
        onClick={() => navigate(link)}
      >
        <div className="carousel-poster-card__image">
          {image ? (
            <LazyImage src={image} alt={item.title} />
          ) : (
            <div className="poster-placeholder">
              {item.media_type === 'movie' ? <MovieIcon /> : <SeriesIcon />}
            </div>
          )}
          <button
            className="carousel-poster-card__overlay"
            onClick={(e) => {
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
            }}
          >
            {isPremium ? <PlayIcon size={isCenter ? 36 : 28} /> : <InfoIcon size={isCenter ? 36 : 28} />}
          </button>
        </div>
        <span className="carousel-poster-card__title">{item.title}</span>
      </div>
    );
  }, [navigate, isPremium]);

  // Render item per al carousel de continuar veient
  const renderContinueItem = useCallback((item, index, isCenter) => {
    const isMovie = item.mediaType === 'movie';
    let imageUrl = null;

    if (item.source === 'streaming') {
      if (item.still_path) {
        imageUrl = item.still_path.startsWith('http') ? item.still_path : `https://image.tmdb.org/t/p/w780${item.still_path}`;
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
        className="carousel-landscape-card"
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
        <div className="carousel-landscape-card__image">
          <ContinueThumbnail item={item} imageUrl={imageUrl} type={item.mediaType} />
          <div className="carousel-landscape-card__overlay">
            <PlayIcon size={isCenter ? 48 : 36} />
          </div>
          <div className="carousel-landscape-card__progress">
            <div
              className="carousel-landscape-card__progress-fill"
              style={{ width: `${item.progress_percentage}%` }}
            />
          </div>
        </div>
        <div className="carousel-landscape-card__info">
          <span className="carousel-landscape-card__title">{item.series_name || item.title}</span>
          {!isMovie && item.season_number && (
            <span className="carousel-landscape-card__meta">T{item.season_number} E{item.episode_number}</span>
          )}
        </div>
      </div>
    );
  }, [navigate]);

  // Vista per usuaris autenticats
  if (isAuthenticated) {
    return (
      <div className="home-container authenticated">
        {/* Hero Section */}
        <section className="home-hero">
          <div className="home-hero-content">
            <div className="home-greeting">
              <h1>Hola, {user?.display_name || user?.username || 'amic'}!</h1>
              <p>Què t'agradaria veure?</p>
            </div>

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

          {/* Continue Watching in Hero - Grid of 4 */}
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

          {/* Explore button */}
          <button
            className="home-explore-btn"
            onClick={() => {
              const authContent = document.querySelector('.auth-content');
              if (authContent) {
                authContent.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            aria-label="Explora més contingut"
          >
            <span>Explora</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="7 10 12 15 17 10"/>
              <polyline points="7 5 12 10 17 5"/>
            </svg>
          </button>
        </section>

        {/* Below the fold content */}
        <div className="auth-content">

          {/* Recommendations Carousel */}
          {recommendations.length > 0 && (
            <section className="carousel-section">
              <h2 className="section-header">Recomanat per a tu</h2>
              <CenterFocusCarousel
                items={recommendations}
                renderItem={renderRecommendationItem}
                itemWidth={140}
                centerScale={1.2}
                gap={20}
                className="recommendations-carousel"
              />
            </section>
          )}

          {/* Watchlist Carousel */}
          {watchlist.length > 0 && (
            <section className="carousel-section">
              <h2 className="section-header">
                La meva llista
                <Link to="/watchlist" className="see-all-link">Veure tot</Link>
              </h2>
              <CenterFocusCarousel
                items={watchlist}
                renderItem={renderWatchlistItem}
                itemWidth={130}
                centerScale={1.18}
                gap={18}
                className="watchlist-carousel"
              />
            </section>
          )}

          {/* Continue Watching Carousel */}
          {allContinueWatching.length > 0 && (
            <section className="carousel-section">
              <h2 className="section-header">Continuar veient</h2>
              <CenterFocusCarousel
                items={allContinueWatching}
                renderItem={renderContinueItem}
                itemWidth={280}
                centerScale={1.12}
                gap={24}
                className="continue-carousel"
              />
            </section>
          )}

        </div>
      </div>
    );
  }

  // Vista per usuaris no autenticats
  return (
    <div className="home-container">
      <section className="hero-section">
        <div className="hero-bg">
          <div className="hero-bubble hero-bubble-1"></div>
          <div className="hero-bubble hero-bubble-2"></div>
        </div>

        <div className="hero-content">
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

          <div className="categories-grid">
            <Link to="/movies" className="category-card active">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-movies"></div>
              <div className="card-content">
                <MovieIcon />
                <h3 className="card-title">Pel·lícules</h3>
              </div>
              <div className="hover-border"></div>
            </Link>

            <Link to="/series" className="category-card active">
              <div className="card-glass"></div>
              <div className="category-bubble gradient-series"></div>
              <div className="card-content">
                <SeriesIcon />
                <h3 className="card-title">Sèries</h3>
              </div>
              <div className="hover-border"></div>
            </Link>

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
