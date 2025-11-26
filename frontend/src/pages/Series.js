import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL, API_ENDPOINTS } from '../config';
import MediaCard from '../components/MediaCard';
import './Series.css';

function Series() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

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
      <div className="loading-state">
        <div className="spinner"></div>
        <p className="loading-text">Carregant series...</p>
      </div>
    );
  }

  return (
    <div className="series-page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Series</h1>
          <p className="page-subtitle">{series.length} series disponibles</p>
        </div>

        <div className="filters-bar glass">
          <div className="search-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          </div>

          <div className="sort-box">
            <label>Ordenar per:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="select input"
            >
              <option value="name">Nom</option>
              <option value="episodes">Episodis</option>
              <option value="seasons">Temporades</option>
            </select>
          </div>
        </div>

        {filteredSeries.length > 0 ? (
          <div className="media-grid">
            {filteredSeries.map((item) => (
              <MediaCard key={item.id} item={item} type="series" />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                <rect x="2" y="4" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </div>
            <h3>No s'han trobat series</h3>
            <p>Prova amb una cerca diferent o escaneja la biblioteca</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Series;
