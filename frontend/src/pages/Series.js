import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import './Library.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icon
const TvIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

function Series() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    loadSeries();
  }, []);

  const loadSeries = async () => {
    try {
      const response = await axios.get('/api/library/series');
      setSeries(response.data);
    } catch (error) {
      console.error('Error carregant sèries:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortedSeries = [...series].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'episodes':
        return (b.episode_count || 0) - (a.episode_count || 0);
      case 'seasons':
        return (b.season_count || 0) - (a.season_count || 0);
      case 'recent':
        return new Date(b.added_date || 0) - new Date(a.added_date || 0);
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant sèries...</div>
      </div>
    );
  }

  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title">
          <span className="icon"><TvIcon /></span>
          <h1>Sèries</h1>
          <span className="library-count">({series.length})</span>
        </div>

        <div className="library-filters">
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name">Ordenar per nom</option>
            <option value="episodes">Ordenar per episodis</option>
            <option value="seasons">Ordenar per temporades</option>
            <option value="recent">Afegides recentment</option>
          </select>
        </div>
      </div>

      {series.length === 0 ? (
        <div className="library-grid">
          <div className="empty-state">
            <div className="empty-icon"><TvIcon /></div>
            <h2>No hi ha sèries</h2>
            <p>Ves al panell d'administració per escanejar la biblioteca</p>
          </div>
        </div>
      ) : (
        <div className="library-grid">
          {sortedSeries.map((show) => (
            <MediaCard
              key={show.id}
              item={show}
              type="series"
              width="100%"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default Series;
