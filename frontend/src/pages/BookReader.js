import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config/api';
import './BookReader.css';

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
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
  dark: { name: 'Fosc', bg: '#1a1a1a', text: '#e0e0e0', accent: '#6eb5ff' },
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
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI State
  const [showControls, setShowControls] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [chapterContent, setChapterContent] = useState('');

  // Preferències de lectura (guardem a localStorage)
  const [theme, setTheme] = useState(() => localStorage.getItem('reader_theme') || 'sepia');
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('reader_fontSize')) || 18);
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('reader_fontFamily') || 'serif');
  const [lineHeight, setLineHeight] = useState(() => parseFloat(localStorage.getItem('reader_lineHeight')) || 1.8);
  const [textAlign, setTextAlign] = useState(() => localStorage.getItem('reader_textAlign') || 'justify');
  const [margins, setMargins] = useState(() => parseInt(localStorage.getItem('reader_margins')) || 60);

  // Marcadors
  const [bookmarks, setBookmarks] = useState([]);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Temps de lectura estimat
  const [readingTime, setReadingTime] = useState(null);

  const contentRef = useRef(null);
  // eslint-disable-next-line no-unused-vars
  const controlsTimeoutRef = useRef(null);

  // Guardar preferències
  useEffect(() => {
    localStorage.setItem('reader_theme', theme);
    localStorage.setItem('reader_fontSize', fontSize.toString());
    localStorage.setItem('reader_fontFamily', fontFamily);
    localStorage.setItem('reader_lineHeight', lineHeight.toString());
    localStorage.setItem('reader_textAlign', textAlign);
    localStorage.setItem('reader_margins', margins.toString());
  }, [theme, fontSize, fontFamily, lineHeight, textAlign, margins]);

  // Carregar marcadors
  const loadBookmarks = useCallback(async () => {
    try {
      const stored = localStorage.getItem(`bookmarks_${id}`);
      if (stored) {
        setBookmarks(JSON.parse(stored));
      }
    } catch {
      setBookmarks([]);
    }
  }, [id]);

  // Guardar marcador
  const toggleBookmark = useCallback(() => {
    const newBookmarks = [...bookmarks];
    const existing = newBookmarks.findIndex(b => b.chapter === currentChapter);

    if (existing >= 0) {
      newBookmarks.splice(existing, 1);
      setIsBookmarked(false);
    } else {
      newBookmarks.push({
        chapter: currentChapter,
        chapterTitle: content?.content?.spine?.[currentChapter]?.title || `Capitol ${currentChapter + 1}`,
        date: new Date().toISOString()
      });
      setIsBookmarked(true);
    }

    setBookmarks(newBookmarks);
    localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBookmarks));
  }, [bookmarks, currentChapter, content, id]);

  // Calcular temps de lectura
  const calculateReadingTime = useCallback((html) => {
    if (!html) return null;
    // Extreure text del HTML
    const div = document.createElement('div');
    div.innerHTML = html;
    const text = div.textContent || div.innerText;
    const words = text.trim().split(/\s+/).length;
    // Velocitat mitjana de lectura: 200 paraules/minut
    const minutes = Math.ceil(words / 200);
    return minutes;
  }, []);

  const loadBook = useCallback(async () => {
    try {
      setLoading(true);
      // Carregar info del llibre
      const bookResponse = await axios.get(`/api/books/${id}`);
      setBook(bookResponse.data);

      // Carregar contingut
      const contentResponse = await axios.get(`/api/books/${id}/content`);
      setContent(contentResponse.data);

      if (contentResponse.data.type === 'epub') {
        // Carregar primer capítol
        loadChapter(0, contentResponse.data.content);
      }

      // Carregar progrés guardat
      try {
        const progressResponse = await axios.get(`/api/books/${id}/progress`);
        if (progressResponse.data.current_page) {
          setCurrentChapter(progressResponse.data.current_page);
        }
      } catch {
        // Ignorar errors de progrés
      }

      // Carregar marcadors
      loadBookmarks();

    } catch (err) {
      console.error('Error carregant llibre:', err);
      setError('Error carregant el llibre');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadBookmarks]);

  useEffect(() => {
    loadBook();
  }, [loadBook]);

  const loadChapter = useCallback(async (chapterIndex, bookContent = content?.content) => {
    if (!bookContent || !bookContent.spine || !bookContent.spine[chapterIndex]) {
      return;
    }

    try {
      const chapterHref = bookContent.spine[chapterIndex].href;
      const response = await axios.get(`/api/books/${id}/resource/${chapterHref}`, {
        responseType: 'text'
      });

      // Processar HTML per adaptar-lo
      let html = response.data;

      // Reemplaçar URLs de recursos
      html = html.replace(/src="([^"]+)"/g, (match, src) => {
        if (src.startsWith('http')) return match;
        return `src="${API_URL}/api/books/${id}/resource/${src}"`;
      });

      html = html.replace(/href="([^"]+\.css)"/g, (match, href) => {
        return `href="${API_URL}/api/books/${id}/resource/${href}"`;
      });

      setChapterContent(html);
      setCurrentChapter(chapterIndex);

      // Calcular temps de lectura
      setReadingTime(calculateReadingTime(html));

      // Comprovar si està marcat
      setIsBookmarked(bookmarks.some(b => b.chapter === chapterIndex));

      // Guardar progrés
      saveProgress(chapterIndex);

      // Scroll al principi
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }

    } catch (err) {
      console.error('Error carregant capítol:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, content, calculateReadingTime, bookmarks]);

  const saveProgress = async (chapterIndex) => {
    try {
      await axios.post(`/api/books/${id}/progress`, {
        position: `chapter:${chapterIndex}`,
        page: chapterIndex,
        total_pages: content?.content?.spine?.length || 0
      });
    } catch (err) {
      console.error('Error guardant progrés:', err);
    }
  };

  const goToNextChapter = useCallback(() => {
    if (content?.content?.spine && currentChapter < content.content.spine.length - 1) {
      loadChapter(currentChapter + 1);
    }
  }, [content, currentChapter, loadChapter]);

  const goToPrevChapter = useCallback(() => {
    if (currentChapter > 0) {
      loadChapter(currentChapter - 1);
    }
  }, [currentChapter, loadChapter]);

  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        goToNextChapter();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        goToPrevChapter();
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
  }, [goToNextChapter, goToPrevChapter, navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleContentClick = (e) => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const width = rect.width;

    // Click a l'esquerra: anterior, dreta: següent
    if (x < width * 0.3) {
      goToPrevChapter();
    } else if (x > width * 0.7) {
      goToNextChapter();
    } else {
      // Click al centre: mostrar/amagar controls
      setShowControls(prev => !prev);
    }
  };

  const handleTouchStart = useRef({ x: 0, y: 0 });

  const onTouchStart = (e) => {
    handleTouchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const onTouchEnd = (e) => {
    const deltaX = e.changedTouches[0].clientX - handleTouchStart.current.x;
    const deltaY = e.changedTouches[0].clientY - handleTouchStart.current.y;

    // Swipe horitzontal
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        goToPrevChapter();
      } else {
        goToNextChapter();
      }
    }
  };

  // Obtenir estils del tema actual
  const currentTheme = THEMES[theme] || THEMES.sepia;
  const currentFont = FONTS[fontFamily] || FONTS.serif;

  // Per PDFs
  if (content?.type === 'pdf') {
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

  return (
    <div
      className={`book-reader theme-${theme}`}
      style={{
        '--reader-bg': currentTheme.bg,
        '--reader-text': currentTheme.text,
        '--reader-accent': currentTheme.accent,
        '--reader-font': currentFont.family,
        '--reader-line-height': lineHeight,
        '--reader-margins': `${margins}px`
      }}
    >
      {/* Header Controls */}
      <div className={`reader-header ${showControls ? 'visible' : ''}`}>
        <div className="header-left">
          <button className="icon-btn" onClick={() => navigate('/books')} title="Tornar">
            <BackIcon />
          </button>
        </div>
        <div className="header-center">
          <h1 className="book-title">{book?.title}</h1>
          <span className="chapter-indicator">
            Capitol {currentChapter + 1} de {content?.content?.spine?.length || 0}
            {readingTime && ` - ${readingTime} min lectura`}
          </span>
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
            title="Taula de continguts (T)"
          >
            <MenuIcon />
          </button>
          <button
            className={`icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => { setShowSettings(!showSettings); setShowToc(false); }}
            title="Configuracio"
          >
            <SettingsIcon />
          </button>
        </div>
      </div>

      {/* Table of Contents Sidebar */}
      <div className={`sidebar toc-sidebar ${showToc ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Index</h2>
          <button className="icon-btn" onClick={() => setShowToc(false)}><CloseIcon /></button>
        </div>

        {/* Marcadors */}
        {bookmarks.length > 0 && (
          <div className="bookmarks-section">
            <h3>Marcadors</h3>
            <div className="bookmark-list">
              {bookmarks.map((bm, idx) => (
                <div
                  key={idx}
                  className="bookmark-item"
                  onClick={() => { loadChapter(bm.chapter); setShowToc(false); }}
                >
                  <BookmarkIcon filled />
                  <span>{bm.chapterTitle}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Capitols */}
        <div className="chapters-section">
          <h3>Capitols</h3>
          <div className="toc-list">
            {content?.content?.chapters?.map((chapter, index) => (
              <div
                key={index}
                className={`toc-item ${currentChapter === index ? 'active' : ''}`}
                onClick={() => {
                  const spineIndex = content.content.spine.findIndex(s =>
                    s.href.includes(chapter.href?.split('#')[0])
                  );
                  if (spineIndex !== -1) {
                    loadChapter(spineIndex);
                    setShowToc(false);
                  }
                }}
              >
                {chapter.title}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <div className={`sidebar settings-sidebar ${showSettings ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Configuracio</h2>
          <button className="icon-btn" onClick={() => setShowSettings(false)}><CloseIcon /></button>
        </div>

        <div className="settings-content">
          {/* Tema */}
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

          {/* Tipografia */}
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

          {/* Mida de lletra */}
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

          {/* Espaiat de línia */}
          <div className="settings-group">
            <label>Espaiat de linia: {lineHeight.toFixed(1)}</label>
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

          {/* Marges */}
          <div className="settings-group">
            <label>Marges: {margins}px</label>
            <div className="slider-control">
              <input
                type="range"
                min="20"
                max="120"
                step="10"
                value={margins}
                onChange={(e) => setMargins(parseInt(e.target.value))}
              />
            </div>
          </div>

          {/* Alineacio */}
          <div className="settings-group">
            <label>Alineacio del text</label>
            <div className="align-options">
              <button
                className={textAlign === 'left' ? 'active' : ''}
                onClick={() => setTextAlign('left')}
              >
                Esquerra
              </button>
              <button
                className={textAlign === 'justify' ? 'active' : ''}
                onClick={() => setTextAlign('justify')}
              >
                Justificat
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay per tancar sidebars */}
      {(showToc || showSettings) && (
        <div className="sidebar-overlay" onClick={() => { setShowToc(false); setShowSettings(false); }} />
      )}

      {/* Main Content */}
      <div
        ref={contentRef}
        className="reader-content"
        onClick={handleContentClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          fontSize: `${fontSize}px`,
          fontFamily: currentFont.family,
          lineHeight: lineHeight,
          textAlign: textAlign
        }}
      >
        <div
          className="chapter-content"
          dangerouslySetInnerHTML={{ __html: chapterContent }}
        />
      </div>

      {/* Navigation Arrows */}
      <button
        className={`nav-arrow nav-arrow-left ${showControls ? 'visible' : ''}`}
        onClick={goToPrevChapter}
        disabled={currentChapter === 0}
      >
        <ChevronLeftIcon />
      </button>
      <button
        className={`nav-arrow nav-arrow-right ${showControls ? 'visible' : ''}`}
        onClick={goToNextChapter}
        disabled={currentChapter >= (content?.content?.spine?.length || 1) - 1}
      >
        <ChevronRightIcon />
      </button>

      {/* Bottom Progress */}
      <div className={`reader-footer ${showControls ? 'visible' : ''}`}>
        <div className="progress-info">
          <span>{Math.round(((currentChapter + 1) / (content?.content?.spine?.length || 1)) * 100)}% llegit</span>
        </div>
        <div className="reading-progress">
          <div
            className="progress-bar"
            style={{
              width: `${((currentChapter + 1) / (content?.content?.spine?.length || 1)) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default BookReader;
