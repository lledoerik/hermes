import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import {
  BookmarkIcon,
  PlayIcon,
  PauseIcon,
  TrashIcon,
  StarIcon,
  MovieIcon,
  SeriesIcon,
  DownloadIcon,
  CloseIcon,
  CheckIcon,
  AlertIcon,
  SearchIcon,
  BookIcon
} from '../components/icons';
import './Watchlist.css';

// Platform logos (specific to this component)
const LetterboxdLogo = () => (
  <svg viewBox="0 0 500 500" fill="currentColor">
    <path d="M250 500C111.93 500 0 388.07 0 250S111.93 0 250 0s250 111.93 250 250-111.93 250-250 250zm0-450C139.54 50 50 139.54 50 250s89.54 200 200 200 200-89.54 200-200S360.46 50 250 50z"/>
    <circle cx="150" cy="250" r="60"/>
    <circle cx="250" cy="250" r="60"/>
    <circle cx="350" cy="250" r="60"/>
  </svg>
);

const MALLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.273 7.247v8.423l-2.103-.003v-5.216l-2.03 2.404-1.989-2.458-.02 5.285H0V7.247h2.09l1.9 2.442 1.903-2.442h2.38zm5.908 0H9.152v8.423h5.03v-2.07h-2.845v-1.349h2.641v-2.074h-2.641V9.32h2.844V7.247zm5.125 0h-2.186v8.423h2.186v-2.812l1.509 2.812h2.617l-1.822-3.206 1.67-3.012h-2.454l-1.52 2.834V7.247z"/>
  </svg>
);

const GoodreadsLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.027 11.573c-.545.178-1.09.267-1.635.267-1.363 0-2.534-.534-3.512-1.602-.979-1.068-1.468-2.424-1.468-4.068 0-1.644.489-3 1.468-4.068.978-1.068 2.149-1.602 3.512-1.602.544 0 1.09.089 1.635.267V0h1.635v11.573h-1.635zm0-8.673c-.545-.178-1.09-.267-1.635-.267-.817 0-1.507.356-2.07 1.068-.563.712-.844 1.602-.844 2.67s.281 1.958.844 2.67c.563.712 1.253 1.068 2.07 1.068.544 0 1.09-.089 1.635-.267V2.9zM19.591 24h-1.635v-5.8c-.545.178-1.09.267-1.635.267-1.363 0-2.534-.534-3.512-1.602-.979-1.068-1.468-2.424-1.468-4.068 0-1.644.489-3 1.468-4.068.978-1.068 2.149-1.602 3.512-1.602.544 0 1.09.089 1.635.267V7.127h1.635V24zm-1.635-15.1c-.545-.178-1.09-.267-1.635-.267-.817 0-1.507.356-2.07 1.068-.563.712-.844 1.602-.844 2.67s.281 1.958.844 2.67c.563.712 1.253 1.068 2.07 1.068.544 0 1.09-.089 1.635-.267V8.9z"/>
  </svg>
);

function Watchlist() {
  const { isAuthenticated } = useAuth();
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, movie, series
  const navigate = useNavigate();

  // Import states
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [importUsername, setImportUsername] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [importError, setImportError] = useState(null);
  const [previewResults, setPreviewResults] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  const loadWatchlist = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/api/user/watchlist`);
      setWatchlist(response.data || []);
    } catch (error) {
      console.error('Error carregant watchlist:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  const removeFromWatchlist = async (item) => {
    try {
      await axios.delete(`${API_URL}/api/user/watchlist/${item.tmdb_id}?media_type=${item.media_type}`);
      setWatchlist(prev => prev.filter(i => i.id !== item.id));
    } catch (error) {
      console.error('Error eliminant de watchlist:', error);
    }
  };

  const handlePlay = (item) => {
    if (item.media_type === 'movie') {
      navigate(`/debrid/movie/${item.tmdb_id}`);
    } else {
      navigate(`/debrid/tv/${item.tmdb_id}?s=1&e=1`);
    }
  };

  const handleDetails = (item) => {
    const type = item.media_type === 'movie' ? 'movies' : 'series';
    navigate(`/${type}/tmdb-${item.tmdb_id}`);
  };

  // Platform configurations
  const platforms = {
    letterboxd: {
      name: 'Letterboxd',
      icon: LetterboxdLogo,
      color: '#00e054',
      description: 'Importa la teva watchlist de pel·lícules',
      placeholder: 'Nom d\'usuari de Letterboxd',
      urlExample: 'letterboxd.com/usuari/watchlist'
    },
    myanimelist: {
      name: 'MyAnimeList',
      icon: MALLogo,
      color: '#2e51a2',
      description: 'Importa els animes que estàs veient',
      placeholder: 'Nom d\'usuari de MAL',
      urlExample: 'myanimelist.net/animelist/usuari'
    },
    goodreads: {
      name: 'Goodreads',
      icon: GoodreadsLogo,
      color: '#553b08',
      description: 'Importa els llibres per llegir',
      placeholder: 'ID d\'usuari de Goodreads',
      urlExample: 'goodreads.com/user/show/123456789'
    }
  };

  const openImportModal = (platform) => {
    setSelectedPlatform(platform);
    setImportUsername('');
    setImportResults(null);
    setImportError(null);
    setPreviewResults(null);
    setImportProgress({ current: 0, total: 0 });
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setSelectedPlatform(null);
    setImportUsername('');
    setImportResults(null);
    setImportError(null);
    setPreviewResults(null);
    setImportProgress({ current: 0, total: 0 });
  };

  const handlePreview = async () => {
    if (!importUsername.trim()) {
      setImportError('Cal introduir un nom d\'usuari');
      return;
    }

    setPreviewing(true);
    setImportError(null);
    setPreviewResults(null);

    try {
      const response = await axios.post(`${API_URL}/api/import/external/preview`, {
        username: importUsername.trim(),
        platform: selectedPlatform
      });

      if (response.data.total_items === 0) {
        setImportError('No s\'han trobat elements per importar. Comprova el nom d\'usuari.');
      } else {
        setPreviewResults(response.data);
      }
    } catch (error) {
      console.error('Error preview:', error);
      setImportError(
        error.response?.data?.detail ||
        'Error al cercar. Comprova el nom d\'usuari.'
      );
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!previewResults) return;

    setImporting(true);
    setImportError(null);
    setImportResults(null);

    const totalItems = previewResults.total_items;
    setImportProgress({ current: 0, total: totalItems });

    // Simulate progress while import is running
    const progressInterval = setInterval(() => {
      setImportProgress(prev => {
        // Progress slowly, max 95% until done
        const increment = Math.max(1, Math.floor(totalItems / 20));
        const newCurrent = Math.min(prev.current + increment, Math.floor(totalItems * 0.95));
        return { ...prev, current: newCurrent };
      });
    }, 500);

    try {
      const response = await axios.post(`${API_URL}/api/import/external`, {
        username: importUsername.trim(),
        platform: selectedPlatform
      });

      clearInterval(progressInterval);
      setImportProgress({ current: totalItems, total: totalItems });
      setImportResults(response.data);

      // Reload watchlist if items were added
      if (response.data.results?.found?.length > 0) {
        loadWatchlist();
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Error importació:', error);
      setImportError(
        error.response?.data?.detail ||
        'Error durant la importació. Comprova el nom d\'usuari.'
      );
    } finally {
      setImporting(false);
    }
  };

  const filteredWatchlist = filter === 'all'
    ? watchlist
    : watchlist.filter(item => item.media_type === filter);

  if (!isAuthenticated) {
    return (
      <div className="watchlist-container">
        <div className="watchlist-empty">
          <BookmarkIcon />
          <h2>Inicia sessió per veure la teva llista</h2>
          <p>Guarda pel·lícules i sèries per veure-les més tard</p>
          <button onClick={() => navigate('/login')} className="login-btn">
            Iniciar sessió
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="watchlist-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="watchlist-container">
      <div className="watchlist-header">
        <h1>
          <BookmarkIcon />
          La meva llista
        </h1>
        <p className="watchlist-subtitle">
          {watchlist.length} {watchlist.length === 1 ? 'títol' : 'títols'} guardats
        </p>
      </div>

      {/* Import Section */}
      <div className="import-section">
        <div className="import-header">
          <DownloadIcon />
          <span>Importar des de...</span>
        </div>
        <div className="import-buttons">
          {Object.entries(platforms).map(([key, platform]) => {
            const Icon = platform.icon;
            return (
              <button
                key={key}
                className="import-btn"
                style={{ '--platform-color': platform.color }}
                onClick={() => openImportModal(key)}
              >
                <Icon />
                <span>{platform.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {watchlist.length > 0 && (
        <div className="watchlist-filters">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Tot ({watchlist.length})
          </button>
          <button
            className={`filter-btn ${filter === 'movie' ? 'active' : ''}`}
            onClick={() => setFilter('movie')}
          >
            <MovieIcon />
            Pel·lícules ({watchlist.filter(i => i.media_type === 'movie').length})
          </button>
          <button
            className={`filter-btn ${filter === 'series' ? 'active' : ''}`}
            onClick={() => setFilter('series')}
          >
            <SeriesIcon />
            Sèries ({watchlist.filter(i => i.media_type === 'series').length})
          </button>
        </div>
      )}

      {filteredWatchlist.length === 0 ? (
        <div className="watchlist-empty">
          <BookmarkIcon />
          <h2>La teva llista està buida</h2>
          <p>Afegeix pel·lícules i sèries des de les pàgines de detalls</p>
          <button onClick={() => navigate('/')} className="browse-btn">
            Explorar contingut
          </button>
        </div>
      ) : (
        <div className="watchlist-grid">
          {filteredWatchlist.map((item) => (
            <div key={item.id} className="watchlist-card">
              <div
                className="watchlist-poster"
                onClick={() => handleDetails(item)}
              >
                {item.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
                    alt={item.title}
                  />
                ) : (
                  <div className="poster-placeholder">
                    {item.media_type === 'movie' ? <MovieIcon /> : <SeriesIcon />}
                  </div>
                )}
                <div className="card-overlay">
                  <button
                    className="play-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(item);
                    }}
                  >
                    <PlayIcon />
                  </button>
                </div>
                <div className="media-type-badge">
                  {item.media_type === 'movie' ? 'Pel·lícula' : 'Sèrie'}
                </div>
              </div>
              <div className="watchlist-info">
                <h3 onClick={() => handleDetails(item)}>{item.title}</h3>
                <div className="watchlist-meta">
                  {item.year && <span className="year">{item.year}</span>}
                  {item.rating && (
                    <span className="rating">
                      <StarIcon /> {item.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <button
                  className="remove-btn"
                  onClick={() => removeFromWatchlist(item)}
                  title="Eliminar de la llista"
                >
                  <TrashIcon />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && selectedPlatform && (
        <div className="import-modal-overlay" onClick={closeImportModal}>
          <div className="import-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeImportModal}>
              <CloseIcon />
            </button>

            <div className="modal-header" style={{ '--platform-color': platforms[selectedPlatform].color }}>
              {React.createElement(platforms[selectedPlatform].icon)}
              <h2>Importar de {platforms[selectedPlatform].name}</h2>
              <p>{platforms[selectedPlatform].description}</p>
            </div>

            <div className="modal-content">
              {!importResults ? (
                <>
                  {/* Step 1: Username input */}
                  {!previewResults && !importing && (
                    <>
                      <div className="input-group">
                        <label>{platforms[selectedPlatform].placeholder}</label>
                        <input
                          type="text"
                          value={importUsername}
                          onChange={(e) => setImportUsername(e.target.value)}
                          placeholder={platforms[selectedPlatform].placeholder}
                          onKeyDown={(e) => e.key === 'Enter' && !previewing && handlePreview()}
                          disabled={previewing}
                        />
                        <span className="input-hint">
                          {platforms[selectedPlatform].urlExample}
                        </span>
                      </div>

                      {importError && (
                        <div className="import-error">
                          <AlertIcon />
                          <span>{importError}</span>
                        </div>
                      )}

                      <button
                        className="import-submit-btn"
                        onClick={handlePreview}
                        disabled={previewing || !importUsername.trim()}
                        style={{ '--platform-color': platforms[selectedPlatform].color }}
                      >
                        {previewing ? (
                          <>
                            <div className="btn-spinner"></div>
                            Cercant...
                          </>
                        ) : (
                          <>
                            <SearchIcon />
                            Cercar contingut
                          </>
                        )}
                      </button>
                    </>
                  )}

                  {/* Step 2: Preview results */}
                  {previewResults && !importing && (
                    <div className="preview-results">
                      <div className="preview-summary">
                        <div className="preview-icon" style={{ '--platform-color': platforms[selectedPlatform].color }}>
                          {React.createElement(platforms[selectedPlatform].icon)}
                        </div>
                        <div className="preview-count">
                          <span className="count-number">{previewResults.total_items}</span>
                          <span className="count-label">títols trobats</span>
                        </div>
                      </div>

                      <div className="preview-items">
                        {previewResults.items?.slice(0, 5).map((item, idx) => (
                          <div key={idx} className="preview-item">
                            <span>{item.title}</span>
                            {item.year && <span className="item-year">({item.year})</span>}
                          </div>
                        ))}
                        {previewResults.total_items > 5 && (
                          <div className="preview-item more">
                            ...i {previewResults.total_items - 5} més
                          </div>
                        )}
                      </div>

                      <div className="preview-actions">
                        <button
                          className="import-back-btn"
                          onClick={() => setPreviewResults(null)}
                        >
                          Enrere
                        </button>
                        <button
                          className="import-submit-btn"
                          onClick={handleImport}
                          style={{ '--platform-color': platforms[selectedPlatform].color }}
                        >
                          <DownloadIcon />
                          Importar tot
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Importing with progress */}
                  {importing && (
                    <div className="import-progress">
                      <div className="progress-icon">
                        <div className="import-spinner"></div>
                      </div>
                      <h3>Importació en progrés...</h3>
                      <p className="progress-text">
                        Processant {importProgress.current} de {importProgress.total} títols
                      </p>
                      <div className="progress-bar-container">
                        <div
                          className="progress-bar"
                          style={{
                            width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                            '--platform-color': platforms[selectedPlatform].color
                          }}
                        ></div>
                      </div>
                      <p className="progress-hint">
                        Cercant cada títol a TMDB i afegint a la teva llista...
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="import-results">
                  <div className="results-summary">
                    <div className="result-stat success">
                      <CheckIcon />
                      <span>{importResults.results?.found?.length || 0}</span>
                      <label>Afegits</label>
                    </div>
                    <div className="result-stat existing">
                      <BookmarkIcon />
                      <span>{importResults.results?.already_in_watchlist?.length || 0}</span>
                      <label>Ja existien</label>
                    </div>
                    <div className="result-stat warning">
                      <AlertIcon />
                      <span>{importResults.results?.not_found?.length || 0}</span>
                      <label>No trobats</label>
                    </div>
                  </div>

                  {importResults.results?.found?.length > 0 && (
                    <div className="results-list">
                      <h4>Afegits a la llista:</h4>
                      <ul>
                        {importResults.results.found.slice(0, 10).map((item, idx) => (
                          <li key={idx}>
                            {item.type === 'movie' && <MovieIcon />}
                            {item.type === 'series' && <SeriesIcon />}
                            {item.type === 'book' && <BookIcon />}
                            <span>{item.title}</span>
                            {item.year && <span className="item-year">({item.year})</span>}
                          </li>
                        ))}
                        {importResults.results.found.length > 10 && (
                          <li className="more-items">
                            ...i {importResults.results.found.length - 10} més
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {importResults.results?.not_found?.length > 0 && (
                    <div className="results-list not-found">
                      <h4>No s'han trobat:</h4>
                      <ul>
                        {importResults.results.not_found.slice(0, 5).map((item, idx) => (
                          <li key={idx}>
                            <span>{item.title}</span>
                          </li>
                        ))}
                        {importResults.results.not_found.length > 5 && (
                          <li className="more-items">
                            ...i {importResults.results.not_found.length - 5} més
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  <button
                    className="import-done-btn"
                    onClick={closeImportModal}
                    style={{ '--platform-color': platforms[selectedPlatform].color }}
                  >
                    Fet!
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Watchlist;
