import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import './Library.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const TvIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
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

function Series() {
  const [series, setSeries] = useState([]);
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

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setImportError(null);
    setSearchResults([]);

    try {
      const response = await axios.post('/api/import/search', {
        query: searchQuery.trim(),
        media_type: 'series'
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
        media_type: 'series'
      });
      setImported(prev => ({ ...prev, [item.id]: true }));
      loadSeries(); // Reload series list
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
          <span className="icon"><TvIcon /></span>
          <h1>Sèries</h1>
          <span className="library-count">({series.length})</span>
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
            <option value="episodes">Ordenar per episodis</option>
            <option value="seasons">Ordenar per temporades</option>
            <option value="recent">Afegides recentment</option>
          </select>
        </div>
      </div>

      {series.length === 0 ? (
        <div className="library-grid">
          <div className="empty-state">
            <div className="empty-icon"><TvIcon /></div>
            <h2>No hi ha sèries</h2>
            <p>Importa sèries des de TMDB o escaneja la biblioteca</p>
            <button className="scan-btn" onClick={() => setShowImport(true)}>
              <PlusIcon /> Importar sèries
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

      {/* Import Modal */}
      {showImport && (
        <div className="import-modal-overlay" onClick={handleCloseImport}>
          <div className="import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="import-modal-header">
              <h2><PlusIcon /> Importar sèries</h2>
              <button className="close-btn" onClick={handleCloseImport}>
                <CloseIcon />
              </button>
            </div>

            <form className="import-search-form" onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="Cerca sèries a TMDB..."
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
                      <div className="no-poster"><TvIcon /></div>
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
                <p>Cerca una sèrie per títol per importar-la des de TMDB</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Series;
