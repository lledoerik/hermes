import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL, API_ENDPOINTS } from '../config';
import './Series.css';

function Series() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState('grid');

  useEffect(() => {
    loadSeries();
  }, []);

  const loadSeries = async () => {
    try {
      const response = await axios.get(`${API_URL}${API_ENDPOINTS.series}`);
      setSeries(response.data);
    } catch (error) {
      console.error('Error loading series:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSeries = series
    .filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'episodes') return (b.episode_count || 0) - (a.episode_count || 0);
      if (sortBy === 'seasons') return (b.season_count || 0) - (a.season_count || 0);
      return 0;
    });

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader"></div>
        <p>Carregant series...</p>
      </div>
    );
  }

  return (
    <div className="browse-page">
      {/* Header */}
      <div className="browse-header">
        <div className="header-content">
          <h1 className="page-title">Series</h1>
          <p className="page-count">{filteredSeries.length} series disponibles</p>
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
            placeholder="Cercar series..."
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
              <option value="episodes">Episodis</option>
              <option value="seasons">Temporades</option>
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
      {filteredSeries.length > 0 ? (
        <div className={`browse-content ${viewMode}`}>
          {filteredSeries.map((item) => (
            <SeriesCard key={item.id} item={item} viewMode={viewMode} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="4" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 18v3" />
          </svg>
          <h3>No s'han trobat series</h3>
          <p>Prova amb una cerca diferent</p>
        </div>
      )}
    </div>
  );
}

function SeriesCard({ item, viewMode }) {
  const [imageError, setImageError] = useState(false);

  if (viewMode === 'list') {
    return (
      <Link to={`/series/${item.id}`} className="series-list-item">
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
                <rect x="2" y="4" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </div>
          )}
        </div>
        <div className="list-info">
          <h3 className="list-title">{item.name}</h3>
          <div className="list-meta">
            <span>{item.season_count || 0} temporades</span>
            <span className="dot">•</span>
            <span>{item.episode_count || 0} episodis</span>
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
    <Link to={`/series/${item.id}`} className="series-card">
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
              <rect x="2" y="4" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </div>
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
          {item.season_count || 0} temp. • {item.episode_count || 0} ep.
        </p>
      </div>
    </Link>
  );
}

export default Series;
