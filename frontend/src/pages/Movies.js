import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import './Library.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icon
const MovieIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');

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
          <span className="icon"><MovieIcon /></span>
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
            <div className="empty-icon"><MovieIcon /></div>
            <h2>No hi ha pel·lícules</h2>
            <p>Ves al panell d'administració per escanejar la biblioteca</p>
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
