import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import './Library.css';
import './Search.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      // Cercar a TMDB - mostrar tot el que estigui disponible
      const tmdbRes = await axios.get(`/api/tmdb/search?q=${encodeURIComponent(searchQuery)}`);

      setResults({
        series: tmdbRes.data.series || [],
        movies: tmdbRes.data.movies || []
      });
    } catch (error) {
      console.error('Error cercant:', error);
      setResults({ series: [], movies: [] });
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

        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cercar pel·lícules, sèries..."
              autoFocus
            />
            {searchInput && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearchInput('')}
              >
                ×
              </button>
            )}
          </div>
          <button type="submit" className="filter-btn primary">
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
          {/* Sèries */}
          {results.series.length > 0 && (
            <div className="search-section">
              <h2 className="section-title">
                <TvIcon /> Sèries ({results.series.length})
              </h2>
              <div className="library-grid">
                {results.series.map((show) => (
                  <MediaCard
                    key={`series-${show.tmdb_id}`}
                    item={{
                      id: `tmdb-${show.tmdb_id}`,
                      tmdb_id: show.tmdb_id,
                      name: show.name,
                      year: show.year,
                      poster: show.poster,
                      rating: show.rating,
                      is_tmdb: true
                    }}
                    type="series"
                    width="100%"
                    isTmdb={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pel·lícules */}
          {results.movies.length > 0 && (
            <div className="search-section">
              <h2 className="section-title">
                <MovieIcon /> Pel·lícules ({results.movies.length})
              </h2>
              <div className="library-grid">
                {results.movies.map((movie) => (
                  <MediaCard
                    key={`movie-${movie.tmdb_id}`}
                    item={{
                      id: `tmdb-${movie.tmdb_id}`,
                      tmdb_id: movie.tmdb_id,
                      name: movie.name,
                      year: movie.year,
                      poster: movie.poster,
                      rating: movie.rating,
                      is_tmdb: true
                    }}
                    type="movies"
                    width="100%"
                    isTmdb={true}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Search;
