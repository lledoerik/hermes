import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Library.css';
import './Books.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const AudiobookIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
  </svg>
);

const AuthorIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const ScanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const RefreshIcon = ({ className }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"></polyline>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
  </svg>
);

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);

const LibraryIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const FileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
    <polyline points="13 2 13 9 20 9"></polyline>
  </svg>
);

function Audiobooks() {
  const [authors, setAuthors] = useState([]);
  const [audiobooks, setAudiobooks] = useState([]);
  const [selectedAuthor, setSelectedAuthor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [viewMode, setViewMode] = useState('authors');
  const navigate = useNavigate();

  useEffect(() => {
    loadAuthors();
  }, []);

  const loadAuthors = async () => {
    try {
      const response = await axios.get('/api/audiobooks/authors');
      setAuthors(response.data);
    } catch (error) {
      console.error('Error carregant autors:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllAudiobooks = async () => {
    try {
      const response = await axios.get('/api/audiobooks');
      setAudiobooks(response.data);
    } catch (error) {
      console.error('Error carregant audiollibres:', error);
    }
  };

  const loadAuthorAudiobooks = async (authorId) => {
    try {
      const response = await axios.get(`/api/audiobooks/authors/${authorId}`);
      setSelectedAuthor(response.data);
    } catch (error) {
      console.error('Error carregant audiollibres de l\'autor:', error);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await axios.get('/api/audiobooks/scan/sync');
      await loadAuthors();
      if (viewMode === 'all') {
        await loadAllAudiobooks();
      }
    } catch (error) {
      console.error('Error escanejant:', error);
    } finally {
      setScanning(false);
    }
  };

  const handleAuthorClick = (author) => {
    loadAuthorAudiobooks(author.id);
  };

  const handleBackToAuthors = () => {
    setSelectedAuthor(null);
  };

  const handleAudiobookClick = (audiobook) => {
    navigate(`/listen/${audiobook.id}`);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    setSelectedAuthor(null);
    if (mode === 'all' && audiobooks.length === 0) {
      loadAllAudiobooks();
    }
  };

  const getAudiobookCover = (audiobook) => {
    if (audiobook.cover) {
      return `${API_URL}/api/audiobooks/${audiobook.id}/cover`;
    }
    return null;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant audiollibres...</div>
      </div>
    );
  }

  // Vista d'un autor
  if (selectedAuthor) {
    return (
      <div className="library-container">
        <div className="library-header">
          <div className="library-title">
            <button className="back-btn" onClick={handleBackToAuthors}>
              <BackIcon /> Tornar
            </button>
            <span className="icon"><AuthorIcon /></span>
            <h1>{selectedAuthor.name}</h1>
            <span className="library-count">({selectedAuthor.audiobooks?.length || 0} audiollibres)</span>
          </div>
        </div>

        <div className="books-grid">
          {selectedAuthor.audiobooks?.map((audiobook) => (
            <div
              key={audiobook.id}
              className="book-card"
              onClick={() => handleAudiobookClick(audiobook)}
            >
              <div className="book-cover">
                {getAudiobookCover(audiobook) ? (
                  <img src={getAudiobookCover(audiobook)} alt={audiobook.title} />
                ) : (
                  <div className="book-cover-placeholder audiobook-placeholder">
                    <span className="format-icon"><AudiobookIcon /></span>
                  </div>
                )}
                <div className="book-format-badge audiobook-badge">
                  <ClockIcon /> {formatDuration(audiobook.total_duration)}
                </div>
              </div>
              <div className="book-info">
                <h3 className="book-title">{audiobook.title}</h3>
                <p className="audiobook-meta">
                  <FileIcon /> {audiobook.total_files} fitxers
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Vista principal
  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title">
          <span className="icon"><LibraryIcon /></span>
          <h1>Audiollibres</h1>
          <span className="library-count">
            ({viewMode === 'authors' ? authors.length + ' autors' : audiobooks.length + ' audiollibres'})
          </span>
        </div>

        <div className="library-filters">
          <div className="view-toggle">
            <button
              className={viewMode === 'authors' ? 'active' : ''}
              onClick={() => handleViewModeChange('authors')}
            >
              Per Autor
            </button>
            <button
              className={viewMode === 'all' ? 'active' : ''}
              onClick={() => handleViewModeChange('all')}
            >
              Tots
            </button>
          </div>

          <button
            className={`scan-btn ${scanning ? 'scanning' : ''}`}
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? <><RefreshIcon className="spin" /> Escanejant...</> : <><ScanIcon /> Escanejar</>}
          </button>
        </div>
      </div>

      {viewMode === 'authors' ? (
        // Vista per autors
        authors.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><LibraryIcon /></div>
            <h2>No hi ha audiollibres</h2>
            <p>Escaneja la teva biblioteca per afegir contingut</p>
            <button
              className={`scan-btn ${scanning ? 'scanning' : ''}`}
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? <><RefreshIcon className="spin" /> Escanejant...</> : <><ScanIcon /> Escanejar biblioteca</>}
            </button>
          </div>
        ) : (
          <div className="authors-grid">
            {authors.map((author) => (
              <div
                key={author.id}
                className="author-card"
                onClick={() => handleAuthorClick(author)}
              >
                <div className="author-avatar">
                  {author.photo ? (
                    <img src={author.photo} alt={author.name} />
                  ) : (
                    <AuthorIcon />
                  )}
                </div>
                <div className="author-info">
                  <h3>{author.name}</h3>
                  <span className="book-count">{author.audiobook_count} audiollibres</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        // Vista de tots els audiollibres
        <div className="books-grid">
          {audiobooks.map((audiobook) => (
            <div
              key={audiobook.id}
              className="book-card"
              onClick={() => handleAudiobookClick(audiobook)}
            >
              <div className="book-cover">
                {getAudiobookCover(audiobook) ? (
                  <img src={getAudiobookCover(audiobook)} alt={audiobook.title} />
                ) : (
                  <div className="book-cover-placeholder audiobook-placeholder">
                    <span className="format-icon"><AudiobookIcon /></span>
                  </div>
                )}
                <div className="book-format-badge audiobook-badge">
                  <ClockIcon /> {formatDuration(audiobook.total_duration)}
                </div>
              </div>
              <div className="book-info">
                <h3 className="book-title">{audiobook.title}</h3>
                <p className="book-author">{audiobook.author_name}</p>
                <p className="audiobook-meta">
                  <FileIcon /> {audiobook.total_files} fitxers
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Audiobooks;
