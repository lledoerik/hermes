import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import { API_URL } from '../config/api';
import { SearchIcon, TvIcon, MovieIcon } from '../components/icons';
import './Library.css';
import './Search.css';

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
