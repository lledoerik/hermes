import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './BookReader.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

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
  const [darkMode, setDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [chapterContent, setChapterContent] = useState('');

  const contentRef = useRef(null);

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
      const progressResponse = await axios.get(`/api/books/${id}/progress`);
      if (progressResponse.data.current_page) {
        setCurrentChapter(progressResponse.data.current_page);
      }

    } catch (err) {
      console.error('Error carregant llibre:', err);
      setError('Error carregant el llibre');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

      // Guardar progrés
      saveProgress(chapterIndex);

      // Scroll al principi
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }

    } catch (err) {
      console.error('Error carregant capítol:', err);
    }
  }, [id, content]);

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

  // Per PDFs
  if (content?.type === 'pdf') {
    return (
      <div className={`book-reader ${darkMode ? 'dark' : 'light'}`}>
        <div className="reader-header">
          <button className="back-btn" onClick={() => navigate('/books')}>
            ← Tornar
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
      <div className="loading-screen">
        <div className="loading-text">Carregant llibre...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <div className="error-text">{error}</div>
        <button onClick={() => navigate('/books')}>Tornar a la biblioteca</button>
      </div>
    );
  }

  return (
    <div className={`book-reader ${darkMode ? 'dark' : 'light'}`}>
      {/* Header Controls */}
      <div className={`reader-header ${showControls ? 'visible' : ''}`}>
        <button className="back-btn" onClick={() => navigate('/books')}>
          ← Tornar
        </button>
        <div className="book-info-header">
          <h1>{book?.title}</h1>
          <span className="chapter-indicator">
            {currentChapter + 1} / {content?.content?.spine?.length || 0}
          </span>
        </div>
        <div className="header-actions">
          <button
            className={`toc-btn ${showToc ? 'active' : ''}`}
            onClick={() => setShowToc(!showToc)}
            title="Taula de continguts (T)"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Table of Contents Sidebar */}
      <div className={`toc-sidebar ${showToc ? 'open' : ''}`}>
        <div className="toc-header">
          <h2>Continguts</h2>
          <button onClick={() => setShowToc(false)}>✕</button>
        </div>
        <div className="toc-list">
          {content?.content?.chapters?.map((chapter, index) => (
            <div
              key={index}
              className={`toc-item ${currentChapter === index ? 'active' : ''}`}
              onClick={() => {
                // Buscar índex al spine
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

      {/* Main Content */}
      <div
        ref={contentRef}
        className="reader-content"
        onClick={handleContentClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ fontSize: `${fontSize}px` }}
      >
        <div
          className="chapter-content"
          dangerouslySetInnerHTML={{ __html: chapterContent }}
        />
      </div>

      {/* Navigation Zones Indicators */}
      <div className="nav-zone nav-zone-left" onClick={goToPrevChapter}>
        <span>‹</span>
      </div>
      <div className="nav-zone nav-zone-right" onClick={goToNextChapter}>
        <span>›</span>
      </div>

      {/* Bottom Controls */}
      <div className={`reader-footer ${showControls ? 'visible' : ''}`}>
        <div className="footer-controls">
          <div className="font-controls">
            <button onClick={() => setFontSize(prev => Math.max(12, prev - 2))}>A-</button>
            <span>{fontSize}px</span>
            <button onClick={() => setFontSize(prev => Math.min(32, prev + 2))}>A+</button>
          </div>

          <div className="chapter-nav">
            <button onClick={goToPrevChapter} disabled={currentChapter === 0}>
              ← Anterior
            </button>
            <button
              onClick={goToNextChapter}
              disabled={currentChapter >= (content?.content?.spine?.length || 1) - 1}
            >
              Següent →
            </button>
          </div>

          <button
            className={`theme-btn ${darkMode ? 'dark' : 'light'}`}
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Progress Bar */}
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
