import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Library.css';
import './Books.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

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
    // Placeholder basat en format
    const formatIcons = {
      'epub': '📖',
      'pdf': '📄',
      'mobi': '📱',
      'azw': '📱',
      'azw3': '📱'
    };
    return null;
  };

  const getFormatIcon = (format) => {
    const icons = {
      'epub': '📖',
      'pdf': '📄',
      'mobi': '📱',
      'azw': '📱',
      'azw3': '📱'
    };
    return icons[format] || '📚';
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
              ← Tornar
            </button>
            <span className="icon">✍️</span>
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
          <span className="icon">📚</span>
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
            {scanning ? '🔄 Escanejant...' : '🔍 Escanejar'}
          </button>
        </div>
      </div>

      {viewMode === 'authors' ? (
        // Vista per autors
        authors.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📚</div>
            <h2>No hi ha llibres</h2>
            <p>Escaneja la teva biblioteca per afegir contingut</p>
            <button
              className={`scan-btn ${scanning ? 'scanning' : ''}`}
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? '🔄 Escanejant...' : '🔍 Escanejar biblioteca'}
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
                    <span>✍️</span>
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
