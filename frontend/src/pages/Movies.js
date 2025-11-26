import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import './Library.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : `http://${window.location.hostname}:8000`;

axios.defaults.baseURL = API_URL;

function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadMovies();
  }, []);

  const loadMovies = async () => {
    try {
      const response = await axios.get('/api/library/movies');
      setMovies(response.data);
    } catch (error) {
      console.error('Error carregant pel·lícules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await axios.post('/api/library/scan');
      await loadMovies();
    } catch (error) {
      console.error('Error escanejant:', error);
    } finally {
      setScanning(false);
    }
  };

  const sortedMovies = [...movies].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'year':
        return (b.year || 0) - (a.year || 0);
      case 'duration':
        return (b.duration || 0) - (a.duration || 0);
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
        <div className="loading-text">Carregant pel·lícules...</div>
      </div>
    );
  }

  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title">
          <span className="icon">🎬</span>
          <h1>Pel·lícules</h1>
          <span className="library-count">({movies.length})</span>
        </div>

        <div className="library-filters">
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name">Ordenar per nom</option>
            <option value="year">Ordenar per any</option>
            <option value="duration">Ordenar per duració</option>
            <option value="recent">Afegides recentment</option>
          </select>
        </div>
      </div>

      {movies.length === 0 ? (
        <div className="library-grid">
          <div className="empty-state">
            <div className="empty-icon">🎬</div>
            <h2>No hi ha pel·lícules</h2>
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
          {sortedMovies.map((movie) => (
            <MediaCard
              key={movie.id}
              item={movie}
              type="movies"
              width="100%"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default Movies;
