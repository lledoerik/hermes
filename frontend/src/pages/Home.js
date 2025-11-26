import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL, API_ENDPOINTS } from '../config';
import './Home.css';

function Home() {
  const [stats, setStats] = useState(null);
  const [series, setSeries] = useState([]);
  const [movies, setMovies] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, seriesRes, moviesRes] = await Promise.all([
        axios.get(`${API_URL}${API_ENDPOINTS.stats}`),
        axios.get(`${API_URL}${API_ENDPOINTS.series}`),
        axios.get(`${API_URL}${API_ENDPOINTS.movies}`),
      ]);

      setStats(statsRes.data);
      setSeries(seriesRes.data);
      setMovies(moviesRes.data);

      // Seleccionar contingut destacat aleatori
      const allContent = [...seriesRes.data, ...moviesRes.data].filter(item => item.backdrop);
      if (allContent.length > 0) {
        setFeatured(allContent[Math.floor(Math.random() * allContent.length)]);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('No s\'ha pogut connectar amb el servidor');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <img src="/img/hermes.png" alt="Hermes" className="hermes-loading-img" />
        </div>
        <div className="loading-bar">
          <div className="loading-progress"></div>
        </div>
        <p className="loading-tagline">El transport mes rapid de l'olimp</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <div className="error-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h2>Error de connexio</h2>
          <p>{error}</p>
          <button className="btn-retry" onClick={loadData}>Reintentar</button>
        </div>
      </div>
    );
  }

  const isSeries = featured && series.some(s => s.id === featured.id);

  return (
    <div className="home-page">
      {/* Hero Section amb contingut destacat */}
      {featured && (
        <section className="hero">
          <div className="hero-backdrop">
            <img
              src={`${API_URL}${API_ENDPOINTS.backdrop(featured.id)}`}
              alt=""
              onError={(e) => e.target.style.display = 'none'}
            />
            <div className="hero-gradient"></div>
          </div>
          <div className="hero-content">
            <span className="hero-badge">
              {isSeries ? 'Serie' : 'Pel·licula'}
            </span>
            <h1 className="hero-title">{featured.name}</h1>
            <div className="hero-meta">
              {isSeries ? (
                <>
                  <span>{featured.season_count || 0} temporades</span>
                  <span className="meta-dot">•</span>
                  <span>{featured.episode_count || 0} episodis</span>
                </>
              ) : (
                featured.duration && (
                  <span>{Math.floor(featured.duration / 60)} min</span>
                )
              )}
            </div>
            <div className="hero-actions">
              <Link
                to={isSeries ? `/series/${featured.id}` : `/movie/${featured.id}`}
                className="btn-play"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Reproduir
              </Link>
              <Link
                to={isSeries ? `/series/${featured.id}` : `/movie/${featured.id}`}
                className="btn-info"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                Mes info
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Stats Bar - Hidden from main page, moved to Admin */}
      {/* Stats are now only visible in the Admin panel */}

      {/* Content Rows */}
      <div className="content-rows">
        {series.length > 0 && (
          <ContentRow
            title="Series"
            items={series}
            type="series"
            viewAllLink="/series"
          />
        )}

        {movies.length > 0 && (
          <ContentRow
            title="Pel·licules"
            items={movies}
            type="movie"
            viewAllLink="/movies"
          />
        )}

        {/* Recently Added - combinat */}
        {(series.length > 0 || movies.length > 0) && (
          <ContentRow
            title="Afegit recentment"
            items={[
              ...series.slice(0, 5).map(s => ({...s, itemType: 'series'})),
              ...movies.slice(0, 5).map(m => ({...m, itemType: 'movie'}))
            ].sort(() => Math.random() - 0.5).slice(0, 10)}
            type="mixed"
          />
        )}
      </div>
    </div>
  );
}

// Component per les files de contingut estil Netflix
function ContentRow({ title, items, type, viewAllLink }) {
  const rowRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const scroll = (direction) => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.offsetWidth * 0.8;
      rowRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleScroll = () => {
    if (rowRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    const row = rowRef.current;
    if (row) {
      row.addEventListener('scroll', handleScroll);
      handleScroll();
      return () => row.removeEventListener('scroll', handleScroll);
    }
  }, [items]);

  if (!items || items.length === 0) return null;

  return (
    <section className="content-row">
      <div className="row-header">
        <h2 className="row-title">{title}</h2>
        {viewAllLink && (
          <Link to={viewAllLink} className="view-all">
            Veure tot
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </Link>
        )}
      </div>

      <div className="row-container">
        {showLeftArrow && (
          <button className="scroll-btn scroll-left" onClick={() => scroll('left')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        )}

        <div className="row-items" ref={rowRef}>
          {items.map((item) => (
            <ContentCard
              key={`${type}-${item.id}`}
              item={item}
              type={type === 'mixed' ? item.itemType : type}
            />
          ))}
        </div>

        {showRightArrow && items.length > 5 && (
          <button className="scroll-btn scroll-right" onClick={() => scroll('right')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}

// Card component per cada item
function ContentCard({ item, type }) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const link = type === 'series' ? `/series/${item.id}` : `/movie/${item.id}`;

  const getQualityBadge = () => {
    if (item.width >= 3840) return '4K';
    if (item.width >= 1920) return 'FHD';
    if (item.width >= 1280) return 'HD';
    return null;
  };

  return (
    <Link
      to={link}
      className={`content-card ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="card-poster">
        {item.poster && !imageError ? (
          <img
            src={`${API_URL}${API_ENDPOINTS.poster(item.id)}`}
            alt={item.name}
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="card-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
              {type === 'series' ? (
                <>
                  <rect x="2" y="4" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" />
                </>
              ) : (
                <path d="M19.82 2H4.18A2.18 2.18 0 002 4.18v15.64A2.18 2.18 0 004.18 22h15.64A2.18 2.18 0 0022 19.82V4.18A2.18 2.18 0 0019.82 2zM10 16.5v-9l6 4.5-6 4.5z" />
              )}
            </svg>
          </div>
        )}

        {getQualityBadge() && (
          <span className="quality-tag">{getQualityBadge()}</span>
        )}

        <div className="card-overlay">
          <div className="play-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </div>
        </div>
      </div>

      <div className="card-info">
        <h3 className="card-title">{item.name}</h3>
        <div className="card-meta">
          {type === 'series' ? (
            <span>{item.season_count || 0} temp. • {item.episode_count || 0} ep.</span>
          ) : (
            item.duration && <span>{Math.floor(item.duration / 60)} min</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default Home;
