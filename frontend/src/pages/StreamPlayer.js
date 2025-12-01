import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import './StreamPlayer.css';

// SVG Icons
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
  </svg>
);

const ServerIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
  </svg>
);

const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
  </svg>
);

// Fonts d'embed disponibles
const EMBED_SOURCES = [
  {
    id: 'vidsrc',
    name: 'VidSrc',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
      }
      return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: 'vidsrc2',
    name: 'VidSrc 2',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.xyz/embed/movie/${tmdbId}`;
      }
      return `https://vidsrc.xyz/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: '2embed',
    name: '2Embed',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://www.2embed.cc/embed/${tmdbId}`;
      }
      return `https://www.2embed.cc/embedtv/${tmdbId}&s=${season || 1}&e=${episode || 1}`;
    }
  },
  {
    id: 'multiembed',
    name: 'MultiEmbed',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`;
      }
      return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}`;
    }
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://player.autoembed.cc/embed/movie/${tmdbId}`;
      }
      return `https://player.autoembed.cc/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: 'embedsu',
    name: 'Embed.su',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://embed.su/embed/movie/${tmdbId}`;
      }
      return `https://embed.su/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
];

function StreamPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const iframeRef = useRef(null);

  // Parsejar paràmetres de la URL (season, episode)
  const searchParams = new URLSearchParams(location.search);
  const season = searchParams.get('s') ? parseInt(searchParams.get('s')) : null;
  const episode = searchParams.get('e') ? parseInt(searchParams.get('e')) : null;

  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentSource = EMBED_SOURCES[currentSourceIndex];
  const mediaType = type === 'movie' ? 'movie' : 'tv';
  const embedUrl = currentSource.getUrl(mediaType, tmdbId, season, episode);

  // Amagar controls després d'un temps
  useEffect(() => {
    let timeout;
    if (showControls && !showSourceMenu) {
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 4000);
    }
    return () => clearTimeout(timeout);
  }, [showControls, showSourceMenu]);

  // Mostrar controls amb moviment del ratolí
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
  }, []);

  // Quan l'iframe carrega
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
  }, []);

  // Canviar de font
  const handleSourceChange = useCallback((index) => {
    setLoading(true);
    setCurrentSourceIndex(index);
    setShowSourceMenu(false);
  }, []);

  // Tornar enrere
  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          document.exitFullscreen();
        } else {
          handleBack();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handleBack, toggleFullscreen]);

  return (
    <div
      className="stream-player-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
    >
      {/* Iframe del reproductor embed */}
      <iframe
        ref={iframeRef}
        key={embedUrl}
        src={embedUrl}
        className="stream-iframe"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        onLoad={handleIframeLoad}
        title="Video Player"
      />

      {/* Loading overlay */}
      {loading && (
        <div className="stream-loading-overlay">
          <div className="stream-loading-spinner">
            <div className="spinner"></div>
            <p>Carregant {currentSource.name}...</p>
          </div>
        </div>
      )}

      {/* Barra de controls superior */}
      <div className={`stream-controls-bar ${showControls ? 'visible' : ''}`}>
        {/* Botó tornar */}
        <button className="stream-btn stream-back-btn" onClick={handleBack} title="Tornar (Esc)">
          <BackIcon />
        </button>

        {/* Info temporada/episodi */}
        {season && episode && (
          <div className="stream-episode-info">
            T{season} E{episode}
          </div>
        )}

        {/* Espai flexible */}
        <div className="stream-spacer" />

        {/* Selector de font */}
        <div className="stream-source-selector">
          <button
            className="stream-btn stream-source-btn"
            onClick={() => setShowSourceMenu(!showSourceMenu)}
          >
            <ServerIcon />
            <span>{currentSource.name}</span>
            <ChevronDownIcon />
          </button>

          {showSourceMenu && (
            <div className="stream-source-dropdown">
              {EMBED_SOURCES.map((source, index) => (
                <button
                  key={source.id}
                  className={`stream-source-option ${index === currentSourceIndex ? 'active' : ''}`}
                  onClick={() => handleSourceChange(index)}
                >
                  {source.name}
                  {index === currentSourceIndex && <span className="check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Botó fullscreen */}
        <button className="stream-btn" onClick={toggleFullscreen} title="Pantalla completa (F)">
          <FullscreenIcon />
        </button>
      </div>
    </div>
  );
}

export default StreamPlayer;
