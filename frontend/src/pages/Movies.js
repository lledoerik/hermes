import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import './Library.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
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

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [importing, setImporting] = useState({});
  const [imported, setImported] = useState({});
  const [importError, setImportError] = useState(null);

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

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setImportError(null);
    setSearchResults([]);

    try {
      const response = await axios.post('/api/import/search', {
        query: searchQuery.trim(),
        media_type: 'movie'
      });
      setSearchResults(response.data.results);
      if (response.data.results.length === 0) {
        setImportError('No s\'han trobat resultats');
      }
    } catch (err) {
      setImportError(err.response?.data?.detail || 'Error en la cerca. Comprova la clau TMDB.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleImport = async (item) => {
    setImporting(prev => ({ ...prev, [item.id]: true }));
    try {
      await axios.post('/api/import/tmdb', {
        tmdb_id: item.id,
        media_type: 'movie'
      });
      setImported(prev => ({ ...prev, [item.id]: true }));
      loadMovies(); // Reload movies list
    } catch (err) {
      alert(err.response?.data?.detail || 'Error important');
    } finally {
      setImporting(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const handleCloseImport = () => {
    setShowImport(false);
    setSearchQuery('');
    setSearchResults([]);
    setImportError(null);
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
          <button className="import-btn-header" onClick={() => setShowImport(true)}>
            <PlusIcon /> Importar
          </button>
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
            <p>Importa pel·lícules des de TMDB o escaneja la biblioteca</p>
            <button className="scan-btn" onClick={() => setShowImport(true)}>
              <PlusIcon /> Importar pel·lícules
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

      {/* Import Modal */}
      {showImport && (
        <div className="import-modal-overlay" onClick={handleCloseImport}>
          <div className="import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="import-modal-header">
              <h2><PlusIcon /> Importar pel·lícules</h2>
              <button className="close-btn" onClick={handleCloseImport}>
                <CloseIcon />
              </button>
            </div>

            <form className="import-search-form" onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="Cerca pel·lícules a TMDB..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button type="submit" disabled={searchLoading}>
                {searchLoading ? <div className="spinner-small"></div> : <SearchIcon />}
              </button>
            </form>

            {importError && (
              <div className="import-error">{importError}</div>
            )}

            <div className="import-results">
              {searchResults.map((item) => (
                <div key={item.id} className="import-result-card">
                  <div className="import-result-poster">
                    {item.poster ? (
                      <img src={item.poster} alt={item.title} />
                    ) : (
                      <div className="no-poster"><MovieIcon /></div>
                    )}
                  </div>
                  <div className="import-result-info">
                    <h3>{item.title}</h3>
                    <div className="import-result-meta">
                      {item.year && <span>{item.year}</span>}
                      {item.rating > 0 && (
                        <span className="rating"><StarIcon /> {item.rating.toFixed(1)}</span>
                      )}
                    </div>
                    {item.overview && <p className="import-result-overview">{item.overview}</p>}
                  </div>
                  <button
                    className={`import-result-btn ${imported[item.id] ? 'imported' : ''}`}
                    onClick={() => handleImport(item)}
                    disabled={importing[item.id] || imported[item.id]}
                  >
                    {importing[item.id] ? (
                      <div className="spinner-small"></div>
                    ) : imported[item.id] ? (
                      <CheckIcon />
                    ) : (
                      <PlusIcon />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {searchResults.length === 0 && !searchLoading && !importError && (
              <div className="import-empty">
                <p>Cerca una pel·lícula per títol per importar-la des de TMDB</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Movies;
