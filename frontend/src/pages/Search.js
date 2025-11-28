import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import './Library.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const SearchIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const TvIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const MovieIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function Search() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';

  const [results, setResults] = useState({ series: [], movies: [] });
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(query);

  useEffect(() => {
    if (query) {
      performSearch(query);
    } else {
      setLoading(false);
    }
  }, [query]);

  const performSearch = async (searchQuery) => {
    setLoading(true);
    try {
      const [seriesRes, moviesRes] = await Promise.all([
        axios.get('/api/library/series'),
        axios.get('/api/library/movies')
      ]);

      const searchLower = searchQuery.toLowerCase();

      const filteredSeries = seriesRes.data.filter(item =>
        item.name.toLowerCase().includes(searchLower)
      );

      const filteredMovies = moviesRes.data.filter(item =>
        item.name.toLowerCase().includes(searchLower)
      );

      setResults({
        series: filteredSeries,
        movies: filteredMovies
      });
    } catch (error) {
      console.error('Error cercant:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchInput)}`);
    }
  };

  const totalResults = results.series.length + results.movies.length;

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Cercant "{query}"...</div>
      </div>
    );
  }

  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title">
          <span className="icon"><SearchIcon /></span>
          <h1>Resultats de cerca</h1>
          <span className="library-count">({totalResults})</span>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cercar..."
            style={{
              padding: '10px 20px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '25px',
              color: 'white',
              fontSize: '14px',
              width: '250px'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 20px',
              background: '#328492',
              border: 'none',
              borderRadius: '25px',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Cercar
          </button>
        </form>
      </div>

      {query && totalResults === 0 ? (
        <div className="library-grid">
          <div className="empty-state">
            <div className="empty-icon"><SearchIcon /></div>
            <h2>No s'han trobat resultats</h2>
            <p>No hi ha contingut que coincideixi amb "{query}"</p>
          </div>
        </div>
      ) : (
        <>
          {results.series.length > 0 && (
            <>
              <h2 style={{ marginBottom: '20px', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <TvIcon /> Sèries ({results.series.length})
              </h2>
              <div className="library-grid" style={{ marginBottom: '40px' }}>
                {results.series.map((show) => (
                  <MediaCard
                    key={show.id}
                    item={show}
                    type="series"
                    width="100%"
                  />
                ))}
              </div>
            </>
          )}

          {results.movies.length > 0 && (
            <>
              <h2 style={{ marginBottom: '20px', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <MovieIcon /> Pel·lícules ({results.movies.length})
              </h2>
              <div className="library-grid">
                {results.movies.map((movie) => (
                  <MediaCard
                    key={movie.id}
                    item={movie}
                    type="movies"
                    width="100%"
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Search;
