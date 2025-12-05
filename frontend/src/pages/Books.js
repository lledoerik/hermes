import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import { API_URL } from '../config/api';
import {
  BookIcon,
  EpubIcon,
  PdfIcon,
  MobileIcon,
  AuthorIcon,
  BackIcon,
  EditIcon,
  CloseIcon,
  SearchIcon,
  PlusIcon,
  CheckIcon
} from '../components/icons';
import './Library.css';
import './Books.css';

axios.defaults.baseURL = API_URL;

// Content type filter labels (toggle buttons)
const bookContentTypeLabels = {
  book: 'Llibres',
  manga: 'Mangas',
  comic: 'Còmics'
};

function Books() {
  const [authors, setAuthors] = useState([]);
  const [books, setBooks] = useState([]);
  const [selectedAuthor, setSelectedAuthor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('authors'); // 'authors' o 'all'
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { getBooks, booksCache, invalidateCache } = useLibrary();

  // Content type filter state (array for multi-select, default to 'book')
  const [selectedContentTypes, setSelectedContentTypes] = useState(['book']);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [externalResults, setExternalResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [importing, setImporting] = useState({});
  const [imported, setImported] = useState({});
  const [importingAll, setImportingAll] = useState(false);

  // Metadata editing state
  const [editingBook, setEditingBook] = useState(null);
  const [metadataTab, setMetadataTab] = useState('isbn'); // 'isbn', 'olid', 'search', 'upload'
  const [isbn, setIsbn] = useState('');
  const [olid, setOlid] = useState('');
  const [metadataSearchQuery, setMetadataSearchQuery] = useState('');
  const [metadataSearchResults, setMetadataSearchResults] = useState([]);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);

  // Toggle content type selection
  const toggleContentType = (type) => {
    setSelectedContentTypes(prev => {
      if (prev.includes(type)) {
        // Don't allow deselecting if it's the only one selected
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  // Initial load from cache or fetch
  useEffect(() => {
    if (booksCache.data) {
      // Filter books by selected content types
      const filteredBooks = booksCache.data.filter(book =>
        selectedContentTypes.includes(book.content_type || 'book')
      );
      setBooks(filteredBooks);
      setLoading(false);
    }
    loadAuthors();
    loadAllBooks();
  }, []);

  // Reload when content type changes
  useEffect(() => {
    loadAllBooks();
  }, [selectedContentTypes]);

  const searchExternal = useCallback(async (query) => {
    if (!query.trim()) return;

    setSearchLoading(true);
    try {
      const response = await axios.post('/api/import/search', {
        query: query.trim(),
        media_type: 'book'
      });
      // Filter out books that might already be in our library (by title match)
      const existingTitles = books.map(b => b.title?.toLowerCase());
      const filtered = response.data.results.filter(r =>
        !existingTitles.includes(r.title?.toLowerCase())
      );
      setExternalResults(filtered);
    } catch (err) {
      console.error('Error cercant externament:', err);
      setExternalResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [books]);

  // Debounced external search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setExternalResults([]);
      return;
    }

    const timer = setTimeout(() => {
      searchExternal(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, searchExternal]);

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
      // Pass content type filter to API
      const contentTypeParam = selectedContentTypes.length > 0 ? selectedContentTypes.join(',') : null;
      const params = contentTypeParam ? { content_type: contentTypeParam } : {};
      const response = await axios.get('/api/books', { params });
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

  const handleImport = async (item, e) => {
    e?.stopPropagation();
    const itemKey = item.id || item.title;
    setImporting(prev => ({ ...prev, [itemKey]: true }));
    try {
      await axios.post('/api/import/book', {
        title: item.title,
        author: item.author,
        olid: item.id?.replace('/works/', '')
      });
      setImported(prev => ({ ...prev, [itemKey]: true }));
      setExternalResults(prev => prev.filter(r => (r.id || r.title) !== itemKey));
      invalidateCache('books');
      loadAuthors();
      loadAllBooks();
    } catch (err) {
      console.error('Error important:', err);
    } finally {
      setImporting(prev => ({ ...prev, [itemKey]: false }));
    }
  };

  const handleImportAll = async () => {
    if (externalResults.length === 0) return;

    setImportingAll(true);
    const toImport = [...externalResults];

    for (const item of toImport) {
      const itemKey = item.id || item.title;
      setImporting(prev => ({ ...prev, [itemKey]: true }));
      try {
        await axios.post('/api/import/book', {
          title: item.title,
          author: item.author,
          olid: item.id?.replace('/works/', '')
        });
        setImported(prev => ({ ...prev, [itemKey]: true }));
        setExternalResults(prev => prev.filter(r => (r.id || r.title) !== itemKey));
      } catch (err) {
        console.error(`Error important ${item.title}:`, err);
      } finally {
        setImporting(prev => ({ ...prev, [itemKey]: false }));
      }
    }

    invalidateCache('books');
    loadAuthors();
    loadAllBooks();
    setImportingAll(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setExternalResults([]);
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
  };

  // Filter content by search
  const filteredAuthors = searchQuery.trim()
    ? authors.filter(a =>
        a.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : authors;

  const filteredBooks = searchQuery.trim()
    ? books.filter(b =>
        b.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.author_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : books;

  // Metadata editing handlers
  const handleOpenMetadataEdit = (e, book) => {
    e.stopPropagation();
    setEditingBook(book);
    setMetadataTab('isbn');
    setIsbn('');
    setOlid('');
    setMetadataSearchQuery('');
    setMetadataSearchResults([]);
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
        if (selectedAuthor) {
          loadAuthorBooks(selectedAuthor.id);
        }
        invalidateCache('books');
        loadAllBooks();
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
        }
        invalidateCache('books');
        loadAllBooks();
        setTimeout(() => handleCloseMetadataEdit(), 1500);
      }
    } catch (error) {
      setMetadataMessage({ type: 'error', text: error.response?.data?.detail || 'Error actualitzant metadades' });
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleMetadataSearch = async () => {
    if (!metadataSearchQuery.trim()) {
      setMetadataMessage({ type: 'error', text: 'Introdueix un títol per cercar' });
      return;
    }
    setMetadataLoading(true);
    setMetadataMessage(null);
    setMetadataSearchResults([]);
    try {
      const response = await axios.post('/api/metadata/books/search', { title: metadataSearchQuery });
      if (response.data.results && response.data.results.length > 0) {
        setMetadataSearchResults(response.data.results);
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
        }
        invalidateCache('books');
        loadAllBooks();
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
        }
        invalidateCache('books');
        loadAllBooks();
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
        return <MobileIcon />;
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
                <div className="book-format-badge">{book.format?.toUpperCase() || 'BOOK'}</div>
                {isAdmin && (
                  <button
                    className="book-edit-btn"
                    onClick={(e) => handleOpenMetadataEdit(e, book)}
                    title="Editar metadades"
                  >
                    <EditIcon size={14} />
                  </button>
                )}
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

  const hasLocalResults = viewMode === 'authors' ? filteredAuthors.length > 0 : filteredBooks.length > 0;
  const hasResults = hasLocalResults || externalResults.length > 0;

  // Vista principal
  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title-row">
          <div className="library-title">
            <span className="icon"><BookIcon /></span>
            <h1>Biblioteca</h1>
            <span className="library-count">
              ({viewMode === 'authors' ? authors.length + ' autors' : books.length + ' llibres'})
            </span>
          </div>

          {/* Content type toggle filters - next to title */}
          <div className="content-type-toggles">
            {Object.entries(bookContentTypeLabels).map(([key, label]) => (
              <button
                key={key}
                className={`content-type-toggle ${selectedContentTypes.includes(key) ? 'active' : ''}`}
                onClick={() => toggleContentType(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="library-filters">
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Cerca llibres..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={clearSearch}>
                <CloseIcon />
              </button>
            )}
            {searchLoading && <div className="search-spinner"></div>}
          </div>
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

      {!hasResults && !searchQuery ? (
        <div className="empty-state">
          <div className="empty-icon"><BookIcon /></div>
          <h2>No hi ha llibres</h2>
          <p>Cerca llibres per afegir-los a la biblioteca</p>
        </div>
      ) : !hasResults && searchQuery ? (
        <div className="empty-state">
          <div className="empty-icon"><SearchIcon /></div>
          <h2>Sense resultats</h2>
          <p>No s'han trobat llibres per "{searchQuery}"</p>
        </div>
      ) : viewMode === 'authors' ? (
        // Vista per autors + external results
        <>
          {filteredAuthors.length > 0 && (
            <div className="authors-grid">
              {filteredAuthors.map((author) => (
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
          )}

          {/* External results from OpenLibrary */}
          {externalResults.length > 0 && (
            <>
              <div className="add-all-bar">
                <span>{externalResults.length} resultats d'OpenLibrary</span>
                <button
                  className="add-all-btn"
                  onClick={handleImportAll}
                  disabled={importingAll}
                >
                  {importingAll ? (
                    <>
                      <div className="btn-spinner"></div>
                      Important...
                    </>
                  ) : (
                    <>
                      <PlusIcon />
                      Afegir tots
                    </>
                  )}
                </button>
              </div>
              <div className="library-grid">
                {externalResults.map((item) => {
                  const itemKey = item.id || item.title;
                  return (
                    <div
                      key={`ol-${itemKey}`}
                      className="media-card external-card"
                      onClick={() => item.id && window.open(`https://openlibrary.org${item.id}`, '_blank')}
                    >
                      <div className="media-poster">
                        {item.poster ? (
                          <img src={item.poster} alt={item.title} />
                        ) : (
                          <div className="no-poster-placeholder">
                            <BookIcon />
                          </div>
                        )}
                        <div className="external-badge">OpenLibrary</div>
                        <button
                          className={`add-btn ${imported[itemKey] ? 'added' : ''}`}
                          onClick={(e) => handleImport(item, e)}
                          disabled={importing[itemKey] || imported[itemKey]}
                          title="Afegir a la biblioteca"
                        >
                          {importing[itemKey] ? (
                            <div className="btn-spinner"></div>
                          ) : imported[itemKey] ? (
                            <CheckIcon />
                          ) : (
                            <PlusIcon />
                          )}
                        </button>
                      </div>
                      <div className="media-info">
                        <h3 className="media-title">{item.title}</h3>
                        <div className="media-meta">
                          {item.author && <span>{item.author}</span>}
                          {item.year && <span>({item.year})</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        // Vista de tots els llibres + external results
        <>
          {/* Add All button when there are external results */}
          {externalResults.length > 0 && (
            <div className="add-all-bar">
              <span>{externalResults.length} resultats d'OpenLibrary</span>
              <button
                className="add-all-btn"
                onClick={handleImportAll}
                disabled={importingAll}
              >
                {importingAll ? (
                  <>
                    <div className="btn-spinner"></div>
                    Important...
                  </>
                ) : (
                  <>
                    <PlusIcon />
                    Afegir tots
                  </>
                )}
              </button>
            </div>
          )}

          <div className="library-grid">
            {filteredBooks.map((book) => (
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
                  <div className="book-format-badge">{book.format?.toUpperCase() || 'BOOK'}</div>
                  {isAdmin && (
                    <button
                      className="book-edit-btn"
                      onClick={(e) => handleOpenMetadataEdit(e, book)}
                      title="Editar metadades"
                    >
                      <EditIcon size={14} />
                    </button>
                  )}
                </div>
                <div className="book-info">
                  <h3 className="book-title">{book.title}</h3>
                  <p className="book-author">{book.author_name}</p>
                </div>
              </div>
            ))}

            {/* External results from OpenLibrary */}
            {externalResults.map((item) => {
              const itemKey = item.id || item.title;
              return (
                <div
                  key={`ol-${itemKey}`}
                  className="media-card external-card"
                  onClick={() => item.id && window.open(`https://openlibrary.org${item.id}`, '_blank')}
                >
                  <div className="media-poster">
                    {item.poster ? (
                      <img src={item.poster} alt={item.title} />
                    ) : (
                      <div className="no-poster-placeholder">
                        <BookIcon />
                      </div>
                    )}
                    <div className="external-badge">OpenLibrary</div>
                    <button
                      className={`add-btn ${imported[itemKey] ? 'added' : ''}`}
                      onClick={(e) => handleImport(item, e)}
                      disabled={importing[itemKey] || imported[itemKey]}
                      title="Afegir a la biblioteca"
                    >
                      {importing[itemKey] ? (
                        <div className="btn-spinner"></div>
                      ) : imported[itemKey] ? (
                        <CheckIcon />
                      ) : (
                        <PlusIcon />
                      )}
                    </button>
                  </div>
                  <div className="media-info">
                    <h3 className="media-title">{item.title}</h3>
                    <div className="media-meta">
                      {item.author && <span>{item.author}</span>}
                      {item.year && <span>({item.year})</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal for editing book metadata - només visible per admins */}
      {editingBook && isAdmin && (
        <div className="metadata-modal-overlay" onClick={handleCloseMetadataEdit}>
          <div className="metadata-modal" onClick={(e) => e.stopPropagation()}>
            <div className="metadata-modal-header">
              <h2>Editar metadades</h2>
              <button className="close-btn" onClick={handleCloseMetadataEdit} aria-label="Tancar">
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
                      value={metadataSearchQuery}
                      onChange={(e) => setMetadataSearchQuery(e.target.value)}
                      placeholder="Títol del llibre..."
                      disabled={metadataLoading}
                      onKeyPress={(e) => e.key === 'Enter' && handleMetadataSearch()}
                    />
                    <button onClick={handleMetadataSearch} disabled={metadataLoading}>
                      <SearchIcon /> Cercar
                    </button>
                  </div>

                  {metadataSearchResults.length > 0 && (
                    <div className="search-results">
                      {metadataSearchResults.map((result, index) => (
                        <div
                          key={result.key || result.cover_id || `result-${index}`}
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
