import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import './Library.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

function Series() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');
  const [scanning, setScanning] = useState(false);

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

  const handleScan = async () => {
    setScanning(true);
    try {
      await axios.post('/api/library/scan');
      await loadSeries();
    } catch (error) {
      console.error('Error escanejant:', error);
    } finally {
      setScanning(false);
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
          <span className="icon">📺</span>
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
            <div className="empty-icon">📺</div>
            <h2>No hi ha sèries</h2>
            <p>Escaneja la teva biblioteca per afegir contingut</p>
            <button
              className={`scan-btn ${scanning ? 'scanning' : ''}`}
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? '🔄 Escanejant...' : '🔍 Escanejar biblioteca'}
            </button>
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
