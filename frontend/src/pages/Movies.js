import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL, API_ENDPOINTS } from '../config';
import './Movies.css';

function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState('grid');

  useEffect(() => {
    loadMovies();
  }, []);

  const loadMovies = async () => {
    try {
      const response = await axios.get(`${API_URL}${API_ENDPOINTS.movies}`);
      setMovies(response.data);
    } catch (error) {
      console.error('Error loading movies:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
  };

  const filteredMovies = movies
    .filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'duration') return (b.duration || 0) - (a.duration || 0);
      return 0;
    });

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader"></div>
        <p>Carregant pel·licules...</p>
      </div>
    );
  }

  return (
    <div className="browse-page">
      {/* Header */}
      <div className="browse-header">
        <div className="header-content">
          <h1 className="page-title">Pel·licules</h1>
          <p className="page-count">{filteredMovies.length} pel·licules disponibles</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="filters-container">
        <div className="search-wrapper">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Cercar pel·licules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <div className="filter-controls">
          <div className="filter-group">
            <label>Ordenar per:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="filter-select"
            >
              <option value="name">Nom</option>
              <option value="duration">Duracio</option>
            </select>
          </div>

          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </button>
            <button
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="4" width="18" height="4" rx="1"/>
                <rect x="3" y="10" width="18" height="4" rx="1"/>
                <rect x="3" y="16" width="18" height="4" rx="1"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {filteredMovies.length > 0 ? (
        <div className={`browse-content ${viewMode}`}>
          {filteredMovies.map((item) => (
            <MovieCard key={item.id} item={item} viewMode={viewMode} formatDuration={formatDuration} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M19.82 2H4.18A2.18 2.18 0 002 4.18v15.64A2.18 2.18 0 004.18 22h15.64A2.18 2.18 0 0022 19.82V4.18A2.18 2.18 0 0019.82 2zM10 16.5v-9l6 4.5-6 4.5z" />
          </svg>
          <h3>No s'han trobat pel·licules</h3>
          <p>Prova amb una cerca diferent</p>
        </div>
      )}
    </div>
  );
}

function MovieCard({ item, viewMode, formatDuration }) {
  const [imageError, setImageError] = useState(false);

  const getQualityBadge = () => {
    if (item.width >= 3840) return '4K';
    if (item.width >= 1920) return 'FHD';
    if (item.width >= 1280) return 'HD';
    return null;
  };

  if (viewMode === 'list') {
    return (
      <Link to={`/movie/${item.id}`} className="movie-list-item">
        <div className="list-poster">
          {item.poster && !imageError ? (
            <img
              src={`${API_URL}${API_ENDPOINTS.poster(item.id)}`}
              alt={item.name}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="poster-placeholder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                <path d="M19.82 2H4.18A2.18 2.18 0 002 4.18v15.64A2.18 2.18 0 004.18 22h15.64A2.18 2.18 0 0022 19.82V4.18A2.18 2.18 0 0019.82 2zM10 16.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
          )}
        </div>
        <div className="list-info">
          <h3 className="list-title">{item.name}</h3>
          <div className="list-meta">
            {item.duration && <span>{formatDuration(item.duration)}</span>}
            {getQualityBadge() && (
              <>
                <span className="dot">•</span>
                <span className="quality-text">{getQualityBadge()}</span>
              </>
            )}
          </div>
        </div>
        <div className="list-action">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/movie/${item.id}`} className="movie-card">
      <div className="card-image">
        {item.poster && !imageError ? (
          <img
            src={`${API_URL}${API_ENDPOINTS.poster(item.id)}`}
            alt={item.name}
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="poster-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
              <path d="M19.82 2H4.18A2.18 2.18 0 002 4.18v15.64A2.18 2.18 0 004.18 22h15.64A2.18 2.18 0 0022 19.82V4.18A2.18 2.18 0 0019.82 2zM10 16.5v-9l6 4.5-6 4.5z" />
            </svg>
          </div>
        )}
        {getQualityBadge() && (
          <span className="quality-badge">{getQualityBadge()}</span>
        )}
        <div className="card-overlay">
          <div className="play-btn">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </div>
        </div>
      </div>
      <div className="card-details">
        <h3 className="card-title">{item.name}</h3>
        <p className="card-meta">
          {formatDuration(item.duration)}
        </p>
      </div>
    </Link>
  );
}

export default Movies;
