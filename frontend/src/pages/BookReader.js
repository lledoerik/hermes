import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ePub from 'epubjs';
import axios from 'axios';
import './BookReader.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

const BookmarkIcon = ({ filled }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// Temes de lectura
const THEMES = {
  light: { name: 'Clar', bg: '#ffffff', text: '#1a1a1a', accent: '#0066cc' },
  sepia: { name: 'Sepia', bg: '#f4ecd8', text: '#5c4b37', accent: '#8b6914' },
  dark: { name: 'Fosc', bg: '#1e1e1e', text: '#e0e0e0', accent: '#6eb5ff' },
  black: { name: 'Negre', bg: '#000000', text: '#cccccc', accent: '#6eb5ff' }
};

// Tipografies
const FONTS = {
  serif: { name: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  sansSerif: { name: 'Sans Serif', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  bookerly: { name: 'Bookerly', family: '"Bookerly", Georgia, serif' },
  openDyslexic: { name: 'OpenDyslexic', family: '"OpenDyslexic", sans-serif' }
};

function BookReader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // epub.js refs
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const viewerRef = useRef(null);

  // UI State
  const [showControls, setShowControls] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toc, setToc] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');

  // Preferències de lectura
  const [theme, setTheme] = useState(() => localStorage.getItem('reader_theme') || 'sepia');
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('reader_fontSize')) || 18);
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('reader_fontFamily') || 'serif');
  const [lineHeight, setLineHeight] = useState(() => parseFloat(localStorage.getItem('reader_lineHeight')) || 1.8);

  // Marcadors
  const [bookmarks, setBookmarks] = useState([]);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Guardar preferències
  useEffect(() => {
    localStorage.setItem('reader_theme', theme);
    localStorage.setItem('reader_fontSize', fontSize.toString());
    localStorage.setItem('reader_fontFamily', fontFamily);
    localStorage.setItem('reader_lineHeight', lineHeight.toString());
  }, [theme, fontSize, fontFamily, lineHeight]);

  // Carregar marcadors
  useEffect(() => {
    const stored = localStorage.getItem(`bookmarks_${id}`);
    if (stored) {
      try {
        setBookmarks(JSON.parse(stored));
      } catch {
        setBookmarks([]);
      }
    }
  }, [id]);

  // Inicialitzar epub.js
  useEffect(() => {
    const initBook = async () => {
      try {
        setLoading(true);

        // Carregar info del llibre
        const bookResponse = await axios.get(`/api/books/${id}`);
        setBook(bookResponse.data);

        // Si és PDF, no usar epub.js
        if (bookResponse.data.format === 'pdf') {
          setLoading(false);
          return;
        }

        // Crear instància d'epub.js
        const epubUrl = `${API_URL}/api/books/${id}/file`;
        const epubBook = ePub(epubUrl);
        bookRef.current = epubBook;

        // Esperar que el llibre estigui llest
        await epubBook.ready;

        // Obtenir taula de continguts
        const navigation = await epubBook.loaded.navigation;
        setToc(navigation.toc);

        // Generar localitzacions per calcular pàgines
        await epubBook.locations.generate(1024);
        setTotalPages(epubBook.locations.length());

        // Renderitzar
        if (viewerRef.current) {
          const rendition = epubBook.renderTo(viewerRef.current, {
            width: '100%',
            height: '100%',
            spread: 'none',
            flow: 'paginated'
          });
          renditionRef.current = rendition;

          // Aplicar estils inicials
          applyStyles(rendition);

          // Events
          rendition.on('relocated', (location) => {
            setCurrentLocation(location);

            // Calcular pàgina actual
            const currentPageNum = epubBook.locations.locationFromCfi(location.start.cfi);
            setCurrentPage(currentPageNum || 0);

            // Obtenir capítol actual
            const chapter = epubBook.navigation.get(location.start.href);
            if (chapter) {
              setCurrentChapter(chapter.label);
            }

            // Comprovar si està marcat
            const cfi = location.start.cfi;
            setIsBookmarked(bookmarks.some(b => b.cfi === cfi));

            // Guardar progrés
            saveProgress(location);
          });

          rendition.on('displayed', () => {
            setLoading(false);
          });

          // Carregar progrés guardat o mostrar primera pàgina
          try {
            const progressResponse = await axios.get(`/api/books/${id}/progress`);
            if (progressResponse.data.position) {
              rendition.display(progressResponse.data.position);
            } else {
              rendition.display();
            }
          } catch {
            rendition.display();
          }
        }
      } catch (err) {
        console.error('Error carregant llibre:', err);
        setError('Error carregant el llibre');
        setLoading(false);
      }
    };

    initBook();

    return () => {
      if (bookRef.current) {
        bookRef.current.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Aplicar estils a la renderització
  const applyStyles = useCallback((rendition) => {
    if (!rendition) return;

    const currentTheme = THEMES[theme];
    const currentFont = FONTS[fontFamily];

    rendition.themes.default({
      'body': {
        'background-color': `${currentTheme.bg} !important`,
        'color': `${currentTheme.text} !important`,
        'font-family': `${currentFont.family} !important`,
        'font-size': `${fontSize}px !important`,
        'line-height': `${lineHeight} !important`
      },
      'p': {
        'font-family': `${currentFont.family} !important`,
        'font-size': `${fontSize}px !important`,
        'line-height': `${lineHeight} !important`
      },
      'a': {
        'color': `${currentTheme.accent} !important`
      }
    });
  }, [theme, fontFamily, fontSize, lineHeight]);

  // Actualitzar estils quan canvien les preferències
  useEffect(() => {
    if (renditionRef.current) {
      applyStyles(renditionRef.current);
    }
  }, [applyStyles]);

  // Guardar progrés
  const saveProgress = async (location) => {
    if (!location) return;
    try {
      await axios.post(`/api/books/${id}/progress`, {
        position: location.start.cfi,
        page: currentPage,
        total_pages: totalPages
      });
    } catch (err) {
      console.error('Error guardant progrés:', err);
    }
  };

  // Navegació
  const goToNextPage = useCallback(() => {
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  }, []);

  const goToPrevPage = useCallback(() => {
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  }, []);

  const goToLocation = useCallback((href) => {
    if (renditionRef.current) {
      renditionRef.current.display(href);
      setShowToc(false);
    }
  }, []);

  // Marcadors
  const toggleBookmark = useCallback(() => {
    if (!currentLocation) return;

    const cfi = currentLocation.start.cfi;
    const newBookmarks = [...bookmarks];
    const existing = newBookmarks.findIndex(b => b.cfi === cfi);

    if (existing >= 0) {
      newBookmarks.splice(existing, 1);
      setIsBookmarked(false);
    } else {
      newBookmarks.push({
        cfi,
        chapter: currentChapter,
        page: currentPage,
        date: new Date().toISOString()
      });
      setIsBookmarked(true);
    }

    setBookmarks(newBookmarks);
    localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBookmarks));
  }, [bookmarks, currentLocation, currentChapter, currentPage, id]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          goToNextPage();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          goToPrevPage();
          break;
        case 'Escape':
          navigate('/books');
          break;
        case 't':
          setShowToc(prev => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextPage, goToPrevPage, navigate]);

  // Touch/Click per navegar
  const handleViewerClick = (e) => {
    const rect = viewerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const width = rect.width;

    if (x < width * 0.3) {
      goToPrevPage();
    } else if (x > width * 0.7) {
      goToNextPage();
    } else {
      setShowControls(prev => !prev);
    }
  };

  // Touch swipe
  const touchStart = useRef({ x: 0, y: 0 });

  const onTouchStart = (e) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const onTouchEnd = (e) => {
    const deltaX = e.changedTouches[0].clientX - touchStart.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStart.current.y;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        goToPrevPage();
      } else {
        goToNextPage();
      }
    }
  };

  const currentTheme = THEMES[theme] || THEMES.sepia;

  // Per PDFs
  if (book?.format === 'pdf') {
    return (
      <div className="book-reader" style={{ backgroundColor: currentTheme.bg }}>
        <div className="reader-header visible" style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}>
          <button className="icon-btn" onClick={() => navigate('/books')}>
            <BackIcon />
          </button>
          <h1>{book?.title}</h1>
        </div>
        <iframe
          src={`${API_URL}/api/books/${id}/file#view=FitH`}
          title={book?.title}
          className="pdf-viewer"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-screen" style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}>
        <div className="loading-spinner"></div>
        <div className="loading-text">Carregant llibre...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen" style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}>
        <div className="error-text">{error}</div>
        <button onClick={() => navigate('/books')}>Tornar a la biblioteca</button>
      </div>
    );
  }

  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  return (
    <div
      className={`book-reader theme-${theme}`}
      style={{
        '--reader-bg': currentTheme.bg,
        '--reader-text': currentTheme.text,
        '--reader-accent': currentTheme.accent
      }}
    >
      {/* Header */}
      <div className={`reader-header ${showControls ? 'visible' : ''}`}>
        <div className="header-left">
          <button className="icon-btn" onClick={() => navigate('/books')} title="Tornar">
            <BackIcon />
          </button>
        </div>
        <div className="header-center">
          <h1 className="book-title">{book?.title}</h1>
          <span className="chapter-indicator">{currentChapter}</span>
        </div>
        <div className="header-right">
          <button
            className={`icon-btn ${isBookmarked ? 'active' : ''}`}
            onClick={toggleBookmark}
            title="Marcador"
          >
            <BookmarkIcon filled={isBookmarked} />
          </button>
          <button
            className={`icon-btn ${showToc ? 'active' : ''}`}
            onClick={() => { setShowToc(!showToc); setShowSettings(false); }}
            title="Índex"
          >
            <MenuIcon />
          </button>
          <button
            className={`icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => { setShowSettings(!showSettings); setShowToc(false); }}
            title="Configuració"
          >
            <SettingsIcon />
          </button>
        </div>
      </div>

      {/* Table of Contents */}
      <div className={`sidebar toc-sidebar ${showToc ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Índex</h2>
          <button className="icon-btn" onClick={() => setShowToc(false)}><CloseIcon /></button>
        </div>

        {bookmarks.length > 0 && (
          <div className="bookmarks-section">
            <h3>Marcadors</h3>
            <div className="bookmark-list">
              {bookmarks.map((bm, idx) => (
                <div
                  key={idx}
                  className="bookmark-item"
                  onClick={() => goToLocation(bm.cfi)}
                >
                  <BookmarkIcon filled />
                  <span>{bm.chapter || `Pàgina ${bm.page}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="chapters-section">
          <h3>Capítols</h3>
          <div className="toc-list">
            {toc.map((item, index) => (
              <div
                key={index}
                className={`toc-item ${currentChapter === item.label ? 'active' : ''}`}
                onClick={() => goToLocation(item.href)}
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className={`sidebar settings-sidebar ${showSettings ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Configuració</h2>
          <button className="icon-btn" onClick={() => setShowSettings(false)}><CloseIcon /></button>
        </div>

        <div className="settings-content">
          <div className="settings-group">
            <label>Tema</label>
            <div className="theme-options">
              {Object.entries(THEMES).map(([key, t]) => (
                <button
                  key={key}
                  className={`theme-option ${theme === key ? 'active' : ''}`}
                  style={{ backgroundColor: t.bg, color: t.text, borderColor: theme === key ? t.accent : 'transparent' }}
                  onClick={() => setTheme(key)}
                >
                  Aa
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group">
            <label>Tipografia</label>
            <div className="font-options">
              {Object.entries(FONTS).map(([key, f]) => (
                <button
                  key={key}
                  className={`font-option ${fontFamily === key ? 'active' : ''}`}
                  style={{ fontFamily: f.family }}
                  onClick={() => setFontFamily(key)}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group">
            <label>Mida de lletra: {fontSize}px</label>
            <div className="slider-control">
              <button onClick={() => setFontSize(prev => Math.max(12, prev - 2))}>A-</button>
              <input
                type="range"
                min="12"
                max="32"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
              />
              <button onClick={() => setFontSize(prev => Math.min(32, prev + 2))}>A+</button>
            </div>
          </div>

          <div className="settings-group">
            <label>Espaiat: {lineHeight.toFixed(1)}</label>
            <div className="slider-control">
              <input
                type="range"
                min="1.2"
                max="2.5"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {(showToc || showSettings) && (
        <div className="sidebar-overlay" onClick={() => { setShowToc(false); setShowSettings(false); }} />
      )}

      {/* EPUB Viewer */}
      <div
        ref={viewerRef}
        className="epub-viewer"
        onClick={handleViewerClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ backgroundColor: currentTheme.bg }}
      />

      {/* Navigation Arrows */}
      <button
        className={`nav-arrow nav-arrow-left ${showControls ? 'visible' : ''}`}
        onClick={goToPrevPage}
      >
        <ChevronLeftIcon />
      </button>
      <button
        className={`nav-arrow nav-arrow-right ${showControls ? 'visible' : ''}`}
        onClick={goToNextPage}
      >
        <ChevronRightIcon />
      </button>

      {/* Footer */}
      <div className={`reader-footer ${showControls ? 'visible' : ''}`}>
        <div className="progress-info">
          <span>Pàgina {currentPage + 1} de {totalPages}</span>
          <span>{progress}%</span>
        </div>
        <div className="reading-progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

export default BookReader;
