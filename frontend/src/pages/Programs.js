import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Programs.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

// ============================================================
// ICONES SVG
// ============================================================
const PlayIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const MovieIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const GridIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const ListIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// ============================================================
// CATEGORIES
// ============================================================
const CATEGORIES = [
  { id: 'all', name: 'Tot', icon: '📺' },
  { id: 'movies', name: 'Pel·lícules', icon: '🎬' },
  { id: 'series', name: 'Sèries', icon: '📺' },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function formatDuration(seconds) {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
}

// ============================================================
// CONTENT CARD COMPONENT
// ============================================================
function ContentCard({ item, type, onClick }) {
  const hasImage = item.poster || item.backdrop;

  return (
    <div className="video-card" onClick={onClick}>
      <div className="video-card-image">
        {hasImage ? (
          <img
            src={`${API_URL}/api/image/poster/${item.id}`}
            alt={item.name}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div className="video-card-placeholder" style={{ display: hasImage ? 'none' : 'flex' }}>
          {type === 'movies' ? <MovieIcon /> : <SeriesIcon />}
        </div>
        <div className="video-card-overlay">
          <PlayIcon size={32} />
        </div>
        {type === 'movies' && item.duration && (
          <span className="video-duration">
            <ClockIcon /> {formatDuration(item.duration)}
          </span>
        )}
        {type === 'series' && item.episode_count > 0 && (
          <span className="video-duration">
            {item.season_count} temp · {item.episode_count} ep
          </span>
        )}
      </div>
      <div className="video-card-info">
        <h3>{item.name}</h3>
        <span className="video-program-tag">
          {type === 'movies' ? 'Pel·lícula' : 'Sèrie'}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PROGRAMS COMPONENT
// ============================================================
function Programs() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('grid');
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load content from local library
  useEffect(() => {
    async function loadContent() {
      setIsLoading(true);
      setError(null);
      try {
        const [moviesRes, seriesRes] = await Promise.all([
          fetch(`${API_URL}/api/library/movies`),
          fetch(`${API_URL}/api/library/series`)
        ]);

        if (moviesRes.ok) {
          const moviesData = await moviesRes.json();
          setMovies(moviesData);
        }

        if (seriesRes.ok) {
          const seriesData = await seriesRes.json();
          setSeries(seriesData);
        }
      } catch (err) {
        console.error('Error loading content:', err);
        setError('Error carregant contingut');
      }
      setIsLoading(false);
    }
    loadContent();
  }, []);

  // Handle search with debounce
  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
  };

  // Filter content based on search and category
  const filterContent = (items) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item =>
      item.name.toLowerCase().includes(query)
    );
  };

  const filteredMovies = filterContent(movies);
  const filteredSeries = filterContent(series);

  // Get content to display based on category
  const getDisplayContent = () => {
    switch (category) {
      case 'movies':
        return { movies: filteredMovies, series: [] };
      case 'series':
        return { movies: [], series: filteredSeries };
      default:
        return { movies: filteredMovies, series: filteredSeries };
    }
  };

  const displayContent = getDisplayContent();
  const totalCount = displayContent.movies.length + displayContent.series.length;

  // Handle item click
  const handleItemClick = (item, type) => {
    if (type === 'movies') {
      navigate(`/movies/${item.id}`);
    } else {
      navigate(`/series/${item.id}`);
    }
  };

  return (
    <div className="programs-page">
      {/* Header */}
      <header className="programs-header">
        <div className="programs-header-content">
          <h1>A la carta</h1>
          <p className="programs-subtitle">
            Contingut sota demanda de la teva biblioteca
          </p>
        </div>

        {/* Search Bar */}
        <div className="programs-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Cercar pel·lícules, sèries..."
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>
      </header>

      {/* View Toggle & Categories */}
      <div className="programs-controls">
        <div className="programs-stats">
          <span className="stats-count">{totalCount} títols disponibles</span>
        </div>

        <div className="programs-view-toggle">
          <button
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Vista graella"
          >
            <GridIcon />
          </button>
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="Vista llista"
          >
            <ListIcon />
          </button>
        </div>
      </div>

      {/* Categories Bar */}
      <div className="programs-categories">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`category-chip ${category === cat.id ? 'active' : ''}`}
            onClick={() => setCategory(cat.id)}
          >
            <span className="category-icon">{cat.icon}</span>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="programs-content">
        {isLoading ? (
          <div className="programs-loading">
            <div className="spinner"></div>
            <p>Carregant contingut...</p>
          </div>
        ) : error ? (
          <div className="programs-error">
            <MovieIcon />
            <h3>Error</h3>
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="btn btn-primary btn-md">
              Tornar a intentar
            </button>
          </div>
        ) : totalCount === 0 ? (
          <div className="no-content">
            <MovieIcon />
            <p>No s'ha trobat contingut</p>
            {searchQuery && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSearchQuery('')}
              >
                Esborrar cerca
              </button>
            )}
          </div>
        ) : (
          <div className={`videos-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
            {/* Movies Section */}
            {displayContent.movies.length > 0 && (
              <>
                {category === 'all' && (
                  <div className="content-section-header">
                    <h2>🎬 Pel·lícules</h2>
                    <span className="section-count">{displayContent.movies.length}</span>
                  </div>
                )}
                {displayContent.movies.map(movie => (
                  <ContentCard
                    key={`movie-${movie.id}`}
                    item={movie}
                    type="movies"
                    onClick={() => handleItemClick(movie, 'movies')}
                  />
                ))}
              </>
            )}

            {/* Series Section */}
            {displayContent.series.length > 0 && (
              <>
                {category === 'all' && (
                  <div className="content-section-header">
                    <h2>📺 Sèries</h2>
                    <span className="section-count">{displayContent.series.length}</span>
                  </div>
                )}
                {displayContent.series.map(serie => (
                  <ContentCard
                    key={`series-${serie.id}`}
                    item={serie}
                    type="series"
                    onClick={() => handleItemClick(serie, 'series')}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default Programs;
