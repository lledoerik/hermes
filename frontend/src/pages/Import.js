import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Import.css';

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

const ImportIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const MovieIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
    <line x1="7" y1="2" x2="7" y2="22"></line>
    <line x1="17" y1="2" x2="17" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
  </svg>
);

const SeriesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const BookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
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

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

function Import() {
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState('movie');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState({});
  const [imported, setImported] = useState({});
  const [stats, setStats] = useState({ movies: 0, series: 0, books: 0, total: 0 });
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await axios.get('/api/import/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Error carregant estadístiques:', err);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const response = await axios.post('/api/import/search', {
        query: query.trim(),
        media_type: mediaType
      });
      setResults(response.data.results);
      if (response.data.results.length === 0) {
        setError('No s\'han trobat resultats per aquesta cerca');
      }
    } catch (err) {
      console.error('Error cercant:', err);
      setError(err.response?.data?.detail || 'Error en la cerca. Comprova que la clau TMDB està configurada.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (item) => {
    const itemKey = `${item.type}_${item.id}`;
    setImporting(prev => ({ ...prev, [itemKey]: true }));

    try {
      if (item.type === 'book') {
        await axios.post('/api/import/book', {
          title: item.title,
          author: item.author,
          olid: item.id
        });
      } else {
        await axios.post('/api/import/tmdb', {
          tmdb_id: item.id,
          media_type: item.type
        });
      }

      setImported(prev => ({ ...prev, [itemKey]: true }));
      loadStats();
    } catch (err) {
      console.error('Error important:', err);
      alert(err.response?.data?.detail || 'Error en la importació');
    } finally {
      setImporting(prev => ({ ...prev, [itemKey]: false }));
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'movie': return <MovieIcon />;
      case 'series': return <SeriesIcon />;
      case 'book': return <BookIcon />;
      default: return <MovieIcon />;
    }
  };

  return (
    <div className="import-container">
      <div className="import-header">
        <div className="import-title">
          <span className="icon"><ImportIcon /></span>
          <h1>Importar Contingut</h1>
        </div>
        <p className="import-subtitle">
          Cerca i afegeix pel·lícules, sèries i llibres des de TMDB i OpenLibrary
        </p>
      </div>

      {/* Estadístiques */}
      <div className="import-stats">
        <div className="stat-card">
          <span className="stat-icon"><MovieIcon /></span>
          <div className="stat-info">
            <span className="stat-value">{stats.movies}</span>
            <span className="stat-label">Pel·lícules</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon"><SeriesIcon /></span>
          <div className="stat-info">
            <span className="stat-value">{stats.series}</span>
            <span className="stat-label">Sèries</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon"><BookIcon /></span>
          <div className="stat-info">
            <span className="stat-value">{stats.books}</span>
            <span className="stat-label">Llibres</span>
          </div>
        </div>
        <div className="stat-card total">
          <div className="stat-info">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total importat</span>
          </div>
        </div>
      </div>

      {/* Formulari de cerca */}
      <form className="search-form" onSubmit={handleSearch}>
        <div className="type-selector">
          <button
            type="button"
            className={`type-btn ${mediaType === 'movie' ? 'active' : ''}`}
            onClick={() => setMediaType('movie')}
          >
            <MovieIcon /> Pel·lícules
          </button>
          <button
            type="button"
            className={`type-btn ${mediaType === 'series' ? 'active' : ''}`}
            onClick={() => setMediaType('series')}
          >
            <SeriesIcon /> Sèries
          </button>
          <button
            type="button"
            className={`type-btn ${mediaType === 'book' ? 'active' : ''}`}
            onClick={() => setMediaType('book')}
          >
            <BookIcon /> Llibres
          </button>
        </div>

        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder={`Cerca ${mediaType === 'movie' ? 'pel·lícules' : mediaType === 'series' ? 'sèries' : 'llibres'}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? (
              <div className="spinner-small"></div>
            ) : (
              <SearchIcon />
            )}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="import-error">
          {error}
        </div>
      )}

      {/* Resultats */}
      {results.length > 0 && (
        <div className="results-section">
          <h2 className="results-title">
            Resultats ({results.length})
          </h2>
          <div className="results-grid">
            {results.map((item) => {
              const itemKey = `${item.type}_${item.id}`;
              const isImporting = importing[itemKey];
              const isImported = imported[itemKey];

              return (
                <div key={itemKey} className="result-card">
                  <div className="result-poster">
                    {item.poster ? (
                      <img src={item.poster} alt={item.title} />
                    ) : (
                      <div className="no-poster">
                        {getTypeIcon(item.type)}
                      </div>
                    )}
                    <div className="result-type-badge">
                      {getTypeIcon(item.type)}
                    </div>
                  </div>
                  <div className="result-info">
                    <h3 className="result-title">{item.title}</h3>
                    {item.author && (
                      <p className="result-author">{item.author}</p>
                    )}
                    <div className="result-meta">
                      {item.year && <span className="result-year">{item.year}</span>}
                      {item.rating > 0 && (
                        <span className="result-rating">
                          <StarIcon /> {item.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {item.overview && (
                      <p className="result-overview">{item.overview}</p>
                    )}
                    <button
                      className={`import-btn ${isImported ? 'imported' : ''}`}
                      onClick={() => handleImport(item)}
                      disabled={isImporting || isImported}
                    >
                      {isImporting ? (
                        <>
                          <div className="spinner-small"></div>
                          Importantant...
                        </>
                      ) : isImported ? (
                        <>
                          <CheckIcon /> Importat
                        </>
                      ) : (
                        <>
                          <PlusIcon /> Importar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Estat buit */}
      {!loading && results.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon"><ImportIcon /></div>
          <h2>Cerca contingut per importar</h2>
          <p>
            Escriu el nom d'una pel·lícula, sèrie o llibre per cercar-lo a les bases de dades públiques.
            Un cop trobat, podràs afegir-lo a la teva biblioteca amb un sol clic.
          </p>
          <div className="sources-info">
            <div className="source">
              <strong>TMDB</strong>
              <span>Pel·lícules i sèries</span>
            </div>
            <div className="source">
              <strong>OpenLibrary</strong>
              <span>Llibres</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Import;
