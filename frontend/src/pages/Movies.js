import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL, API_ENDPOINTS } from '../config';
import MediaCard from '../components/MediaCard';
import './Movies.css';

function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

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
      <div className="loading-state">
        <div className="spinner"></div>
        <p className="loading-text">Carregant pel-licules...</p>
      </div>
    );
  }

  return (
    <div className="movies-page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Pel-licules</h1>
          <p className="page-subtitle">{movies.length} pel-licules disponibles</p>
        </div>

        <div className="filters-bar glass">
          <div className="search-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Cercar pel-licules..."
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
              <option value="duration">Duracio</option>
            </select>
          </div>
        </div>

        {filteredMovies.length > 0 ? (
          <div className="media-grid">
            {filteredMovies.map((item) => (
              <MediaCard key={item.id} item={item} type="movie" />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.82 2H4.18A2.18 2.18 0 002 4.18v15.64A2.18 2.18 0 004.18 22h15.64A2.18 2.18 0 0022 19.82V4.18A2.18 2.18 0 0019.82 2zM10 16.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
            <h3>No s'han trobat pel-licules</h3>
            <p>Prova amb una cerca diferent o escaneja la biblioteca</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Movies;
