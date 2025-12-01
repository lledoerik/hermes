import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './StreamPlayer.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
  </svg>
);

const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
  </svg>
);

const SkipIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
  </svg>
);

const LoadingSpinner = () => (
  <div className="stream-loading-spinner">
    <div className="spinner"></div>
    <p>Carregant...</p>
  </div>
);

function StreamPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const iframeRef = useRef(null);
  const containerRef = useRef(null);
  const loadTimeoutRef = useRef(null);
  const fallbackTimeoutRef = useRef(null);

  // Parsejar paràmetres de la URL (season, episode)
  const searchParams = new URLSearchParams(location.search);
  const season = searchParams.get('s') ? parseInt(searchParams.get('s')) : null;
  const episode = searchParams.get('e') ? parseInt(searchParams.get('e')) : null;

  const [sources, setSources] = useState([]);
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [itemInfo, setItemInfo] = useState(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const currentSource = sources[currentSourceIndex];

  // Carregar fonts d'embed
  useEffect(() => {
    const loadSources = async () => {
      try {
        setLoading(true);
        setError(null);

        const mediaType = type === 'movie' ? 'movie' : 'series';
        let url = `/api/embed-sources/${mediaType}/${tmdbId}`;

        if (season && episode) {
          url += `?season=${season}&episode=${episode}`;
        }

        const response = await axios.get(url);

        if (response.data.sources && response.data.sources.length > 0) {
          setSources(response.data.sources);
          setCurrentSourceIndex(0);
        } else {
          setError('No s\'han trobat fonts disponibles');
        }
      } catch (err) {
        console.error('Error carregant fonts:', err);
        setError('Error carregant les fonts de streaming');
      } finally {
        setLoading(false);
      }
    };

    loadSources();
  }, [type, tmdbId, season, episode]);

  // Carregar info de l'item per mostrar títol
  useEffect(() => {
    const loadItemInfo = async () => {
      try {
        if (type === 'movie') {
          const response = await axios.get(`/api/library/movies/${tmdbId}`);
          setItemInfo(response.data);
        } else {
          // Per sèries, busquem per TMDB ID
          const response = await axios.get(`/api/library/series`);
          const series = response.data.find(s => s.tmdb_id === parseInt(tmdbId));
          if (series) {
            setItemInfo(series);
          }
        }
      } catch (err) {
        console.error('Error carregant info:', err);
      }
    };

    if (tmdbId) {
      loadItemInfo();
    }
  }, [type, tmdbId]);

  // Timeout per detectar si l'iframe no carrega (fallback automàtic)
  useEffect(() => {
    if (currentSource && !iframeLoaded) {
      // Donem 15 segons per carregar, si no, passem a la següent font
      loadTimeoutRef.current = setTimeout(() => {
        if (!iframeLoaded && currentSourceIndex < sources.length - 1) {
          console.log(`Font ${currentSource.name} no respon, provant següent...`);
          handleNextSource();
        }
      }, 15000);
    }

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, [currentSource, iframeLoaded, currentSourceIndex, sources.length]);

  // Handler per quan l'iframe carrega
  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
    setLoading(false);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
  }, []);

  // Handler per errors de l'iframe
  const handleIframeError = useCallback(() => {
    console.log(`Error carregant ${currentSource?.name}, provant següent font...`);
    if (currentSourceIndex < sources.length - 1) {
      handleNextSource();
    } else {
      setError('Cap font disponible funciona. Prova més tard.');
    }
  }, [currentSource, currentSourceIndex, sources.length]);

  // Passar a la següent font
  const handleNextSource = useCallback(() => {
    if (currentSourceIndex < sources.length - 1) {
      setIframeLoaded(false);
      setCurrentSourceIndex(prev => prev + 1);
      setRetryCount(0);
    }
  }, [currentSourceIndex, sources.length]);

  // Reintentar la font actual
  const handleRetry = useCallback(() => {
    setIframeLoaded(false);
    setRetryCount(prev => prev + 1);
    // Forçar recàrrega de l'iframe
    if (iframeRef.current) {
      iframeRef.current.src = currentSource.url + `&retry=${retryCount + 1}`;
    }
  }, [currentSource, retryCount]);

  // Tornar enrere
  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Escoltar canvis de fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Amagar controls després de 3 segons
  useEffect(() => {
    let timeout;
    if (showControls) {
      timeout = setTimeout(() => setShowControls(false), 3000);
    }
    return () => clearTimeout(timeout);
  }, [showControls]);

  // Mostrar controls en moure el ratolí
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen();
          } else {
            handleBack();
          }
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'n':
        case 'N':
          handleNextSource();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handleBack, toggleFullscreen, handleNextSource]);

  if (loading && sources.length === 0) {
    return (
      <div className="stream-player-container" ref={containerRef}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="stream-player-container" ref={containerRef}>
        <div className="stream-error">
          <h2>Error</h2>
          <p>{error}</p>
          <div className="stream-error-actions">
            <button onClick={handleRetry}>
              <RefreshIcon /> Reintentar
            </button>
            <button onClick={handleBack}>
              <BackIcon /> Tornar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="stream-player-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={() => setShowControls(true)}
    >
      {/* Iframe del reproductor - PANTALLA COMPLETA */}
      {currentSource && (
        <iframe
          ref={iframeRef}
          key={`${currentSource.url}-${retryCount}`}
          src={currentSource.url}
          className="stream-player-iframe"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      )}

      {/* Loading overlay */}
      {!iframeLoaded && (
        <div className="stream-loading-overlay">
          <LoadingSpinner />
          <p>Carregant {currentSource?.name}...</p>
        </div>
      )}

      {/* Mini controls - només botó tornar i selector de font */}
      <div className={`stream-mini-controls ${showControls ? 'visible' : ''}`}>
        <button className="stream-back-btn" onClick={handleBack} title="Tornar (Esc)">
          <BackIcon />
        </button>

        <div className="stream-source-selector">
          <span className="stream-current-source">{currentSource?.name}</span>
          <div className="stream-source-dropdown">
            {sources.map((source, index) => (
              <button
                key={index}
                className={`stream-source-option ${index === currentSourceIndex ? 'active' : ''}`}
                onClick={() => {
                  setIframeLoaded(false);
                  setCurrentSourceIndex(index);
                }}
              >
                {source.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StreamPlayer;
