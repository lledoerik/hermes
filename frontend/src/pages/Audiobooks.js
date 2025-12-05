import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import { API_URL, formatDuration } from '../config/api';
import {
  AudiobookIcon,
  AuthorIcon,
  BackIcon,
  ClockIcon,
  FileIcon,
  EditIcon,
  CloseIcon,
  SearchIcon,
  BookIcon
} from '../components/icons';
import './Library.css';
import './Books.css';

axios.defaults.baseURL = API_URL;

function Audiobooks() {
  const [authors, setAuthors] = useState([]);
  const [audiobooks, setAudiobooks] = useState([]);
  const [selectedAuthor, setSelectedAuthor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('authors');
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { getAudiobooks, audiobooksCache, invalidateCache } = useLibrary();

  // Metadata editing state
  const [editingAudiobook, setEditingAudiobook] = useState(null);
  const [metadataTab, setMetadataTab] = useState('isbn');
  const [isbn, setIsbn] = useState('');
  const [olid, setOlid] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);

  // Initial load from cache
  useEffect(() => {
    if (audiobooksCache.data) {
      setAudiobooks(audiobooksCache.data);
    }
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
      const data = await getAudiobooks();
      setAudiobooks(data);
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

  // Metadata editing handlers
  const handleOpenMetadataEdit = (e, audiobook) => {
    e.stopPropagation();
    setEditingAudiobook(audiobook);
    setMetadataTab('isbn');
    setIsbn('');
    setOlid('');
    setSearchQuery('');
    setSearchResults([]);
    setMetadataMessage(null);
  };

  const handleCloseMetadataEdit = () => {
    setEditingAudiobook(null);
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
      const response = await axios.post(`/api/metadata/audiobooks/${editingAudiobook.id}/update-by-isbn`, { isbn });
      if (response.data.status === 'success') {
        setMetadataMessage({ type: 'success', text: `Portada actualitzada per "${response.data.title || editingAudiobook.title}"` });
        invalidateCache('audiobooks');
        if (selectedAuthor) {
          loadAuthorAudiobooks(selectedAuthor.id);
        } else if (viewMode === 'all') {
          loadAllAudiobooks();
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
      const response = await axios.post(`/api/metadata/audiobooks/${editingAudiobook.id}/update-by-olid`, { olid });
      if (response.data.status === 'success') {
        setMetadataMessage({ type: 'success', text: `Portada actualitzada per "${response.data.title || editingAudiobook.title}"` });
        invalidateCache('audiobooks');
        if (selectedAuthor) {
          loadAuthorAudiobooks(selectedAuthor.id);
        } else if (viewMode === 'all') {
          loadAllAudiobooks();
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
      const response = await axios.post(`/api/metadata/audiobooks/${editingAudiobook.id}/update-by-search-result?cover_id=${result.cover_id}`);
      if (response.data.status === 'success') {
        setMetadataMessage({ type: 'success', text: 'Portada actualitzada!' });
        invalidateCache('audiobooks');
        if (selectedAuthor) {
          loadAuthorAudiobooks(selectedAuthor.id);
        } else if (viewMode === 'all') {
          loadAllAudiobooks();
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
        `/api/metadata/audiobooks/${editingAudiobook.id}/upload-cover`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (response.data.status === 'success') {
        setMetadataMessage({ type: 'success', text: 'Portada pujada correctament!' });
        invalidateCache('audiobooks');
        if (selectedAuthor) {
          loadAuthorAudiobooks(selectedAuthor.id);
        } else if (viewMode === 'all') {
          loadAllAudiobooks();
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

  const getAudiobookCover = (audiobook) => {
    if (audiobook.cover) {
      return `${API_URL}/api/audiobooks/${audiobook.id}/cover`;
    }
    return null;
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
                {isAdmin && (
                  <button
                    className="book-edit-btn"
                    onClick={(e) => handleOpenMetadataEdit(e, audiobook)}
                    title="Editar metadades"
                  >
                    <EditIcon size={14} />
                  </button>
                )}
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
          <span className="icon"><AudiobookIcon /></span>
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
        </div>
      </div>

      {viewMode === 'authors' ? (
        // Vista per autors
        authors.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><AudiobookIcon /></div>
            <h2>No hi ha audiollibres</h2>
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
                {isAdmin && (
                  <button
                    className="book-edit-btn"
                    onClick={(e) => handleOpenMetadataEdit(e, audiobook)}
                    title="Editar metadades"
                  >
                    <EditIcon size={14} />
                  </button>
                )}
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

      {/* Modal for editing audiobook metadata - només visible per admins */}
      {editingAudiobook && isAdmin && (
        <div className="metadata-modal-overlay" onClick={handleCloseMetadataEdit}>
          <div className="metadata-modal" onClick={(e) => e.stopPropagation()}>
            <div className="metadata-modal-header">
              <h2>Editar metadades</h2>
              <button className="close-btn" onClick={handleCloseMetadataEdit} aria-label="Tancar">
                <CloseIcon />
              </button>
            </div>
            <p className="metadata-book-title">{editingAudiobook.title}</p>

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
                      id="cover-upload-audiobook"
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="cover-upload-audiobook" className="upload-btn">
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
                  <small>Formats suportats: JPG, PNG, WebP. La imatge es guardarà a la carpeta de l'audiollibres.</small>
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

export default Audiobooks;
