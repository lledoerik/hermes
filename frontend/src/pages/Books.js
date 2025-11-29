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

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);

const EditIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
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
  const [viewMode, setViewMode] = useState('authors'); // 'authors' o 'all'
  const navigate = useNavigate();

  // Metadata editing state
  const [editingBook, setEditingBook] = useState(null);
  const [metadataTab, setMetadataTab] = useState('isbn'); // 'isbn', 'olid', 'search', 'upload'
  const [isbn, setIsbn] = useState('');
  const [olid, setOlid] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);

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

  // Metadata editing handlers
  const handleOpenMetadataEdit = (e, book) => {
    e.stopPropagation();
    setEditingBook(book);
    setMetadataTab('isbn');
    setIsbn('');
    setOlid('');
    setSearchQuery('');
    setSearchResults([]);
    setMetadataMessage(null);
  };

  const handleCloseMetadataEdit = () => {
    setEditingBook(null);
    setMetadataMessage(null);
  };

  const handleUpdateByIsbn = async () => {
    if (!isbn.trim()) {
      setMetadataMessage({ type: 'error', text: 'Introdueix un ISBN' });
      return;
    }
    setMetadataLoading(true);
    setMetadataMessage(null);
    try {
      const response = await axios.post(`/api/metadata/books/${editingBook.id}/update-by-isbn`, { isbn });
      if (response.data.status === 'success') {
        setMetadataMessage({ type: 'success', text: `Portada actualitzada per "${response.data.title || editingBook.title}"` });
        // Reload data
        if (selectedAuthor) {
          loadAuthorBooks(selectedAuthor.id);
        } else if (viewMode === 'all') {
          loadAllBooks();
        }
        setTimeout(() => handleCloseMetadataEdit(), 1500);
      }
    } catch (error) {
      setMetadataMessage({ type: 'error', text: error.response?.data?.detail || 'Error actualitzant metadades' });
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleUpdateByOlid = async () => {
    if (!olid.trim()) {
      setMetadataMessage({ type: 'error', text: 'Introdueix un Open Library ID' });
      return;
    }
    setMetadataLoading(true);
    setMetadataMessage(null);
    try {
      const response = await axios.post(`/api/metadata/books/${editingBook.id}/update-by-olid`, { olid });
      if (response.data.status === 'success') {
        setMetadataMessage({ type: 'success', text: `Portada actualitzada per "${response.data.title || editingBook.title}"` });
        if (selectedAuthor) {
          loadAuthorBooks(selectedAuthor.id);
        } else if (viewMode === 'all') {
          loadAllBooks();
        }
        setTimeout(() => handleCloseMetadataEdit(), 1500);
      }
    } catch (error) {
      setMetadataMessage({ type: 'error', text: error.response?.data?.detail || 'Error actualitzant metadades' });
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setMetadataMessage({ type: 'error', text: 'Introdueix un títol per cercar' });
      return;
    }
    setMetadataLoading(true);
    setMetadataMessage(null);
    setSearchResults([]);
    try {
      const response = await axios.post('/api/metadata/books/search', { title: searchQuery });
      if (response.data.results && response.data.results.length > 0) {
        setSearchResults(response.data.results);
      } else {
        setMetadataMessage({ type: 'error', text: 'No s\'han trobat resultats' });
      }
    } catch (error) {
      setMetadataMessage({ type: 'error', text: 'Error cercant llibres' });
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleSelectSearchResult = async (result) => {
    if (!result.cover_id) {
      setMetadataMessage({ type: 'error', text: 'Aquest llibre no té portada disponible' });
      return;
    }
    setMetadataLoading(true);
    setMetadataMessage(null);
    try {
      const response = await axios.post(`/api/metadata/books/${editingBook.id}/update-by-search-result?cover_id=${result.cover_id}`);
      if (response.data.status === 'success') {
        setMetadataMessage({ type: 'success', text: 'Portada actualitzada!' });
        if (selectedAuthor) {
          loadAuthorBooks(selectedAuthor.id);
        } else if (viewMode === 'all') {
          loadAllBooks();
        }
        setTimeout(() => handleCloseMetadataEdit(), 1500);
      }
    } catch (error) {
      setMetadataMessage({ type: 'error', text: error.response?.data?.detail || 'Error actualitzant portada' });
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setMetadataMessage({ type: 'error', text: 'El fitxer ha de ser una imatge' });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadPreview({ file, preview: e.target.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadCover = async () => {
    if (!uploadPreview?.file) return;

    setMetadataLoading(true);
    setMetadataMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadPreview.file);

      const response = await axios.post(
        `/api/metadata/books/${editingBook.id}/upload-cover`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (response.data.status === 'success') {
        setMetadataMessage({ type: 'success', text: 'Portada pujada correctament!' });
        if (selectedAuthor) {
          loadAuthorBooks(selectedAuthor.id);
        } else if (viewMode === 'all') {
          loadAllBooks();
        }
        setUploadPreview(null);
        setTimeout(() => handleCloseMetadataEdit(), 1500);
      }
    } catch (error) {
      setMetadataMessage({ type: 'error', text: error.response?.data?.detail || 'Error pujant portada' });
    } finally {
      setMetadataLoading(false);
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
                <button
                  className="book-edit-btn"
                  onClick={(e) => handleOpenMetadataEdit(e, book)}
                  title="Editar metadades"
                >
                  <EditIcon size={14} />
                </button>
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
        </div>
      </div>

      {viewMode === 'authors' ? (
        // Vista per autors
        authors.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><LibraryIcon /></div>
            <h2>No hi ha llibres</h2>
            <p>Ves al panell d'administració per escanejar la biblioteca</p>
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
                <button
                  className="book-edit-btn"
                  onClick={(e) => handleOpenMetadataEdit(e, book)}
                  title="Editar metadades"
                >
                  <EditIcon size={14} />
                </button>
              </div>
              <div className="book-info">
                <h3 className="book-title">{book.title}</h3>
                <p className="book-author">{book.author_name}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for editing book metadata */}
      {editingBook && (
        <div className="metadata-modal-overlay" onClick={handleCloseMetadataEdit}>
          <div className="metadata-modal" onClick={(e) => e.stopPropagation()}>
            <div className="metadata-modal-header">
              <h2>Editar metadades</h2>
              <button className="close-btn" onClick={handleCloseMetadataEdit}>
                <CloseIcon />
              </button>
            </div>
            <p className="metadata-book-title">{editingBook.title}</p>

            <div className="metadata-tabs">
              <button
                className={metadataTab === 'isbn' ? 'active' : ''}
                onClick={() => setMetadataTab('isbn')}
              >
                ISBN
              </button>
              <button
                className={metadataTab === 'olid' ? 'active' : ''}
                onClick={() => setMetadataTab('olid')}
              >
                Open Library ID
              </button>
              <button
                className={metadataTab === 'search' ? 'active' : ''}
                onClick={() => setMetadataTab('search')}
              >
                Cercar
              </button>
              <button
                className={metadataTab === 'upload' ? 'active' : ''}
                onClick={() => { setMetadataTab('upload'); setUploadPreview(null); }}
              >
                Pujar
              </button>
            </div>

            <div className="metadata-content">
              {metadataTab === 'isbn' && (
                <div className="metadata-form">
                  <label>Introdueix l'ISBN del llibre:</label>
                  <div className="input-row">
                    <input
                      type="text"
                      value={isbn}
                      onChange={(e) => setIsbn(e.target.value)}
                      placeholder="Ex: 978-84-376-0494-7"
                      disabled={metadataLoading}
                    />
                    <button onClick={handleUpdateByIsbn} disabled={metadataLoading}>
                      {metadataLoading ? 'Actualitzant...' : 'Actualitzar'}
                    </button>
                  </div>
                  <small>Pots trobar l'ISBN a la contraportada del llibre o a la pàgina de crèdits</small>
                </div>
              )}

              {metadataTab === 'olid' && (
                <div className="metadata-form">
                  <label>Introdueix l'Open Library Work ID:</label>
                  <div className="input-row">
                    <input
                      type="text"
                      value={olid}
                      onChange={(e) => setOlid(e.target.value)}
                      placeholder="Ex: OL45804W"
                      disabled={metadataLoading}
                    />
                    <button onClick={handleUpdateByOlid} disabled={metadataLoading}>
                      {metadataLoading ? 'Actualitzant...' : 'Actualitzar'}
                    </button>
                  </div>
                  <small>
                    Cerca a <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer">openlibrary.org</a> i copia l'ID de l'URL
                  </small>
                </div>
              )}

              {metadataTab === 'search' && (
                <div className="metadata-form">
                  <label>Cerca per títol:</label>
                  <div className="input-row">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Títol del llibre..."
                      disabled={metadataLoading}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button onClick={handleSearch} disabled={metadataLoading}>
                      <SearchIcon /> Cercar
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="search-results">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          className={`search-result ${!result.cover_id ? 'no-cover' : ''}`}
                          onClick={() => handleSelectSearchResult(result)}
                        >
                          <div className="result-cover">
                            {result.cover_id ? (
                              <img
                                src={`https://covers.openlibrary.org/b/id/${result.cover_id}-S.jpg`}
                                alt={result.title}
                              />
                            ) : (
                              <div className="no-cover-placeholder">
                                <BookIcon />
                              </div>
                            )}
                          </div>
                          <div className="result-info">
                            <strong>{result.title}</strong>
                            {result.author && <span>{result.author}</span>}
                            {result.year && <span>({result.year})</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {metadataTab === 'upload' && (
                <div className="metadata-form">
                  <label>Puja una imatge de portada:</label>
                  <div className="upload-area">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      disabled={metadataLoading}
                      id="cover-upload"
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="cover-upload" className="upload-btn">
                      Seleccionar imatge
                    </label>
                    {uploadPreview && (
                      <div className="upload-preview">
                        <img src={uploadPreview.preview} alt="Preview" />
                        <button onClick={handleUploadCover} disabled={metadataLoading}>
                          {metadataLoading ? 'Pujant...' : 'Pujar portada'}
                        </button>
                      </div>
                    )}
                  </div>
                  <small>Formats suportats: JPG, PNG, WebP. La imatge es guardarà a la carpeta del llibre.</small>
                </div>
              )}

              {metadataMessage && (
                <div className={`metadata-message ${metadataMessage.type}`}>
                  {metadataMessage.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Books;
