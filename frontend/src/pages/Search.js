import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import './Library.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : `http://${window.location.hostname}:8000`;

axios.defaults.baseURL = API_URL;

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
          <span className="icon">🔍</span>
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
            <div className="empty-icon">🔍</div>
            <h2>No s'han trobat resultats</h2>
            <p>No hi ha contingut que coincideixi amb "{query}"</p>
          </div>
        </div>
      ) : (
        <>
          {results.series.length > 0 && (
            <>
              <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>
                📺 Sèries ({results.series.length})
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
              <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>
                🎬 Pel·lícules ({results.movies.length})
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
