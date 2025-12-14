import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import LazyImage from '../components/LazyImage';
import CenterFocusCarousel from '../components/CenterFocusCarousel';
import ContinueWatchingCarousel from '../components/ContinueWatchingCarousel';
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

function Home() {
  const { isAuthenticated, user, isPremium } = useAuth();
  const [recommendations, setRecommendations] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasScrolled, setHasScrolled] = useState(false);
  const navigate = useNavigate();

  // Detectar scroll per amagar el botó EXPLORA
  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const loadData = useCallback(async () => {
    try {
      if (isAuthenticated) {

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

        // Continue Watching - carrega contingut en progrés (local i streaming)
        try {
          const continueRes = await axios.get('/api/user/continue-watching');
          const items = (continueRes.data || []).map(item => ({
            ...item,
            // Normalitzar el tipus
            type: item.type === 'episode' ? 'series' : item.type,
            // Normalitzar el progrés
            progress: item.progress_percentage || 0,
            // Usar backdrop o still_path per a la imatge
            backdrop_path: item.backdrop || item.still_path || null,
            poster_path: item.poster || null,
            // Nom per mostrar
            name: item.series_name || item.title
          }));

          setContinueWatching(items.slice(0, 10));
        } catch (e) {
          console.debug('Continue watching no disponible');
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

  // Render item per al carousel de "Continua veient"
  const renderContinueItem = useCallback((item, index, isCenter) => {
    const itemType = item.type || 'series';

    // Per a sèries, anem a la pàgina de detalls amb la temporada/episodi
    let link;
    if (item.source === 'streaming' && item.tmdb_id) {
      // Contingut streaming - anar directament al reproductor
      if (itemType === 'movie') {
        link = `/debrid/movie/${item.tmdb_id}`;
      } else {
        const s = item.season_number || 1;
        const ep = item.episode_number || 1;
        link = `/debrid/tv/${item.tmdb_id}?s=${s}&e=${ep}`;
      }
    } else if (item.series_id) {
      // Episodi local
      link = `/series/${item.series_id}`;
    } else {
      link = item.tmdb_id
        ? `/${itemType === 'movie' ? 'movies' : 'series'}/tmdb-${item.tmdb_id}`
        : `/${itemType === 'movie' ? 'movies' : 'series'}/${item.id}`;
    }

    // Imatge: backdrop per a thumbnails de "continua veient"
    // L'API retorna URLs relatives TMDB o URLs completes per a local
    let image = null;
    if (item.backdrop_path) {
      // Pot ser una URL relativa de TMDB o una URL completa
      image = item.backdrop_path.startsWith('http')
        ? item.backdrop_path
        : `https://image.tmdb.org/t/p/w500${item.backdrop_path}`;
    } else if (item.still_path) {
      image = item.still_path.startsWith('http')
        ? item.still_path
        : `https://image.tmdb.org/t/p/w500${item.still_path}`;
    } else if (item.poster_path) {
      image = item.poster_path.startsWith('http')
        ? item.poster_path
        : `https://image.tmdb.org/t/p/w300${item.poster_path}`;
    } else if (item.series_id) {
      // Contingut local - usar la API d'imatges
      image = `${API_URL}/api/image/backdrop/${item.series_id}`;
    }

    const progress = item.progress || 0;
    const episodeInfo = item.season_number && item.episode_number
      ? `T${item.season_number} E${item.episode_number}`
      : null;

    return (
      <div
        className={`continue-card-hero ${isCenter ? 'is-center' : ''}`}
        onClick={() => navigate(link)}
      >
        <div className="continue-card-hero__image">
          {image ? (
            <LazyImage src={image} alt={item.name || item.title} />
          ) : (
            <div className="continue-placeholder">
              {itemType === 'series' ? <SeriesIcon size={32} /> : <MovieIcon size={32} />}
            </div>
          )}
          <div className="continue-card-hero__gradient" />
          <button
            className="continue-card-hero__play"
            onClick={(e) => {
              e.stopPropagation();
              navigate(link);
            }}
          >
            <PlayIcon size={isCenter ? 28 : 22} />
          </button>
          {progress > 0 && (
            <div className="continue-card-hero__progress">
              <div
                className="continue-card-hero__progress-bar"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          )}
        </div>
        <div className="continue-card-hero__info">
          <span className="continue-card-hero__title">{item.name || item.title}</span>
          {episodeInfo && <span className="continue-card-hero__episode">{episodeInfo}</span>}
        </div>
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

  // Vista per usuaris autenticats
  if (isAuthenticated) {
    return (
      <div className="home-container authenticated">
        {/* Hero Section */}
        <section className="home-hero">
          <div className="home-hero-content">
            <div className="home-greeting">
              <h1>Hola, {user?.display_name || user?.username || 'amic'}!</h1>
            </div>

            <form className="home-search" onSubmit={handleSearch}>
              <div className="home-search-inner">
                <svg className="home-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Què et ve de gust veure?"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </form>

            {/* Continue Watching Carousel - sota la barra de cerca */}
            {continueWatching.length > 0 && (
              <div className="home-continue-section">
                <h3 className="home-continue-title">Continua veient</h3>
                <ContinueWatchingCarousel
                  items={continueWatching}
                  renderItem={renderContinueItem}
                  itemWidth={320}
                  centerScale={1.08}
                  gap={40}
                  className="continue-hero-carousel"
                />
              </div>
            )}

            {/* Explore button - sempre visible sota el carousel */}
            <button
              className={`home-explore-btn ${hasScrolled ? 'hidden' : ''}`}
              onClick={() => {
                const authContent = document.querySelector('.auth-content');
                if (authContent) {
                  authContent.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              aria-label="Explora més contingut"
            >
              <span>Explora</span>
              <svg viewBox="0 0 48 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="14 4 24 12 34 4"/>
              </svg>
            </button>
          </div>
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
              <div className="section-header-styled">
                <h2>La meva llista</h2>
                <Link to="/watchlist" className="see-all-link">Veure tot</Link>
              </div>
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
