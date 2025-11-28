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
const BookIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

const EpubIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    <line x1="8" y1="7" x2="16" y2="7"></line>
    <line x1="8" y1="11" x2="16" y2="11"></line>
    <line x1="8" y1="15" x2="12" y2="15"></line>
  </svg>
);

const PdfIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
);

const MobileBookIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
    <line x1="12" y1="18" x2="12.01" y2="18"></line>
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
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

function Books() {
  const [authors, setAuthors] = useState([]);
  const [books, setBooks] = useState([]);
  const [selectedAuthor, setSelectedAuthor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [viewMode, setViewMode] = useState('authors'); // 'authors' o 'all'
  const navigate = useNavigate();

  useEffect(() => {
    loadAuthors();
  }, []);

  const loadAuthors = async () => {
    try {
      const response = await axios.get('/api/books/authors');
      setAuthors(response.data);
    } catch (error) {
      console.error('Error carregant autors:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllBooks = async () => {
    try {
      const response = await axios.get('/api/books');
      setBooks(response.data);
    } catch (error) {
      console.error('Error carregant llibres:', error);
    }
  };

  const loadAuthorBooks = async (authorId) => {
    try {
      const response = await axios.get(`/api/books/authors/${authorId}`);
      setSelectedAuthor(response.data);
    } catch (error) {
      console.error('Error carregant llibres de l\'autor:', error);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await axios.get('/api/books/scan/sync');
      await loadAuthors();
      if (viewMode === 'all') {
        await loadAllBooks();
      }
    } catch (error) {
      console.error('Error escanejant:', error);
    } finally {
      setScanning(false);
    }
  };

  const handleAuthorClick = (author) => {
    loadAuthorBooks(author.id);
  };

  const handleBackToAuthors = () => {
    setSelectedAuthor(null);
  };

  const handleBookClick = (book) => {
    navigate(`/read/${book.id}`);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    setSelectedAuthor(null);
    if (mode === 'all' && books.length === 0) {
      loadAllBooks();
    }
  };

  const getBookCover = (book) => {
    if (book.cover) {
      return `${API_URL}/api/books/${book.id}/cover`;
    }
    return null;
  };

  const getFormatIcon = (format) => {
    switch (format?.toLowerCase()) {
      case 'epub':
        return <EpubIcon />;
      case 'pdf':
        return <PdfIcon />;
      case 'mobi':
      case 'azw':
      case 'azw3':
        return <MobileBookIcon />;
      default:
        return <BookIcon />;
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant biblioteca...</div>
      </div>
    );
  }

  // Vista d'un autor específic
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
            <span className="library-count">({selectedAuthor.books?.length || 0} llibres)</span>
          </div>
        </div>

        <div className="books-grid">
          {selectedAuthor.books?.map((book) => (
            <div
              key={book.id}
              className="book-card"
              onClick={() => handleBookClick(book)}
            >
              <div className="book-cover">
                {getBookCover(book) ? (
                  <img src={getBookCover(book)} alt={book.title} />
                ) : (
                  <div className="book-cover-placeholder">
                    <span className="format-icon">{getFormatIcon(book.format)}</span>
                  </div>
                )}
                <div className="book-format-badge">{book.format.toUpperCase()}</div>
              </div>
              <div className="book-info">
                <h3 className="book-title">{book.title}</h3>
                {book.reading_progress && book.reading_progress.percentage > 0 && (
                  <div className="reading-progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${book.reading_progress.percentage}%` }}
                    />
                  </div>
                )}
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
          <h1>Biblioteca</h1>
          <span className="library-count">
            ({viewMode === 'authors' ? authors.length + ' autors' : books.length + ' llibres'})
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
              Tots els Llibres
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
            <h2>No hi ha llibres</h2>
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
                  <span className="book-count">{author.book_count} llibres</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        // Vista de tots els llibres
        <div className="books-grid">
          {books.map((book) => (
            <div
              key={book.id}
              className="book-card"
              onClick={() => handleBookClick(book)}
            >
              <div className="book-cover">
                {getBookCover(book) ? (
                  <img src={getBookCover(book)} alt={book.title} />
                ) : (
                  <div className="book-cover-placeholder">
                    <span className="format-icon">{getFormatIcon(book.format)}</span>
                  </div>
                )}
                <div className="book-format-badge">{book.format.toUpperCase()}</div>
              </div>
              <div className="book-info">
                <h3 className="book-title">{book.title}</h3>
                <p className="book-author">{book.author_name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Books;
