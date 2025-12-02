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

const CloudIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
  </svg>
);

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
);

function Search() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';

  const [localResults, setLocalResults] = useState({ series: [], movies: [] });
  const [tmdbResults, setTmdbResults] = useState({ series: [], movies: [] });
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
    const searchLower = searchQuery.toLowerCase();

    try {
      // 1. Primer cercar a la biblioteca local
      const [seriesRes, moviesRes] = await Promise.all([
        axios.get('/api/library/series'),
        axios.get('/api/library/movies')
      ]);

      const filteredSeries = (seriesRes.data || []).filter(item =>
        item.name.toLowerCase().includes(searchLower)
      );

      const filteredMovies = (moviesRes.data || []).filter(item =>
        item.name.toLowerCase().includes(searchLower)
      );

      setLocalResults({
        series: filteredSeries,
        movies: filteredMovies
      });

      // 2. Després cercar a TMDB (per resultats addicionals)
      try {
        const tmdbRes = await axios.get(`/api/tmdb/search?q=${encodeURIComponent(searchQuery)}`);

        // Filtrar resultats TMDB que ja tenim a local (per tmdb_id o nom similar)
        const localSeriesNames = new Set(filteredSeries.map(s => s.name.toLowerCase()));
        const localMovieNames = new Set(filteredMovies.map(m => m.name.toLowerCase()));
        const localSeriesTmdbIds = new Set(filteredSeries.filter(s => s.tmdb_id).map(s => s.tmdb_id));
        const localMovieTmdbIds = new Set(filteredMovies.filter(m => m.tmdb_id).map(m => m.tmdb_id));

        const uniqueTmdbSeries = (tmdbRes.data.series || []).filter(s =>
          !localSeriesTmdbIds.has(s.tmdb_id) && !localSeriesNames.has(s.name.toLowerCase())
        );

        const uniqueTmdbMovies = (tmdbRes.data.movies || []).filter(m =>
          !localMovieTmdbIds.has(m.tmdb_id) && !localMovieNames.has(m.name.toLowerCase())
        );

        setTmdbResults({
          series: uniqueTmdbSeries,
          movies: uniqueTmdbMovies
        });
      } catch (tmdbError) {
        console.error('Error cercant a TMDB:', tmdbError);
        setTmdbResults({ series: [], movies: [] });
      }
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

  const totalLocal = localResults.series.length + localResults.movies.length;
  const totalTmdb = tmdbResults.series.length + tmdbResults.movies.length;
  const totalResults = totalLocal + totalTmdb;

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
          <div className="search-input-wrapper">
            <SearchIcon />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cercar pel·lícules, sèries..."
              autoFocus
            />
          </div>
          <button type="submit" className="search-submit-btn">
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
          {/* Resultats locals (biblioteca) */}
          {localResults.series.length > 0 && (
            <div className="search-section">
              <h2 className="section-title">
                <FolderIcon />
                <TvIcon /> Sèries a la biblioteca ({localResults.series.length})
              </h2>
              <div className="library-grid">
                {localResults.series.map((show) => (
                  <MediaCard
                    key={`local-series-${show.id}`}
                    item={show}
                    type="series"
                    width="100%"
                  />
                ))}
              </div>
            </div>
          )}

          {localResults.movies.length > 0 && (
            <div className="search-section">
              <h2 className="section-title">
                <FolderIcon />
                <MovieIcon /> Pel·lícules a la biblioteca ({localResults.movies.length})
              </h2>
              <div className="library-grid">
                {localResults.movies.map((movie) => (
                  <MediaCard
                    key={`local-movie-${movie.id}`}
                    item={movie}
                    type="movies"
                    width="100%"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Resultats de TMDB (streaming) */}
          {tmdbResults.series.length > 0 && (
            <div className="search-section tmdb-section">
              <h2 className="section-title">
                <CloudIcon />
                <TvIcon /> Sèries disponibles per streaming ({tmdbResults.series.length})
              </h2>
              <div className="library-grid">
                {tmdbResults.series.map((show) => (
                  <MediaCard
                    key={`tmdb-series-${show.tmdb_id}`}
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

          {tmdbResults.movies.length > 0 && (
            <div className="search-section tmdb-section">
              <h2 className="section-title">
                <CloudIcon />
                <MovieIcon /> Pel·lícules disponibles per streaming ({tmdbResults.movies.length})
              </h2>
              <div className="library-grid">
                {tmdbResults.movies.map((movie) => (
                  <MediaCard
                    key={`tmdb-movie-${movie.tmdb_id}`}
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
