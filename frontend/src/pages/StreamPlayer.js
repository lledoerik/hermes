import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './StreamPlayer.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

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

const FullscreenExitIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
  </svg>
);

const PrevIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
  </svg>
);

const NextIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
  </svg>
);

const EpisodesIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
  </svg>
);

const PlayCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
  </svg>
);

const LanguageIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
  </svg>
);

// Fonts d'embed disponibles amb suport d'idiomes
const EMBED_SOURCES = [
  {
    id: 'vidsrc-es',
    name: 'VidSrc Castellà',
    description: 'Castellà d\'Espanya',
    lang: 'es',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.to/embed/movie/${tmdbId}?ds_lang=es`;
      }
      return `https://vidsrc.to/embed/tv/${tmdbId}/${season || 1}/${episode || 1}?ds_lang=es`;
    }
  },
  {
    id: 'vidsrc-en',
    name: 'VidSrc English',
    description: 'Anglès',
    lang: 'en',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.to/embed/movie/${tmdbId}?ds_lang=en`;
      }
      return `https://vidsrc.to/embed/tv/${tmdbId}/${season || 1}/${episode || 1}?ds_lang=en`;
    }
  },
  {
    id: 'vidsrc-orig',
    name: 'VidSrc Original',
    description: 'Versió original',
    lang: 'orig',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.to/embed/movie/${tmdbId}`;
      }
      return `https://vidsrc.to/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: 'vidsrc-pro',
    name: 'VidSrc Pro',
    description: 'Alta qualitat (multi-idioma)',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.pro/embed/movie/${tmdbId}`;
      }
      return `https://vidsrc.pro/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: 'vidsrc-cc',
    name: 'VidSrc Alt',
    description: 'Servidor alternatiu',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
      }
      return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
];

function StreamPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const episodesMenuRef = useRef(null);

  // Parsejar paràmetres de la URL (season, episode)
  const searchParams = new URLSearchParams(location.search);
  const season = searchParams.get('s') ? parseInt(searchParams.get('s')) : null;
  const episode = searchParams.get('e') ? parseInt(searchParams.get('e')) : null;

  // Info del contingut (passada per state o carregada)
  const [mediaInfo, setMediaInfo] = useState(location.state?.mediaInfo || null);
  const [episodes, setEpisodes] = useState([]);
  const [seasons, setSeasons] = useState([]);

  // Carregar font preferida de localStorage
  const getInitialSource = () => {
    const saved = localStorage.getItem('hermes_stream_source');
    if (saved) {
      const index = EMBED_SOURCES.findIndex(s => s.id === saved);
      if (index >= 0) return index;
    }
    return 0;
  };

  const [currentSourceIndex, setCurrentSourceIndex] = useState(getInitialSource);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [showEpisodesMenu, setShowEpisodesMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStartOverlay, setShowStartOverlay] = useState(true);

  const currentSource = EMBED_SOURCES[currentSourceIndex];
  const mediaType = type === 'movie' ? 'movie' : 'tv';

  // Construir URL per embed
  const embedUrl = React.useMemo(() => {
    return currentSource.getUrl(mediaType, tmdbId, season, episode);
  }, [currentSource, mediaType, tmdbId, season, episode]);

  // Funcions per carregar dades
  const loadMediaInfo = useCallback(async () => {
    try {
      const endpoint = type === 'movie'
        ? `/api/tmdb/movie/${tmdbId}`
        : `/api/tmdb/tv/${tmdbId}`;
      const response = await axios.get(`${API_URL}${endpoint}`);
      setMediaInfo(response.data);

      // Per sèries, carregar temporades
      if (type !== 'movie' && response.data.seasons) {
        setSeasons(response.data.seasons.filter(s => s.season_number > 0));
      }
    } catch (error) {
      console.error('Error carregant info:', error);
    }
  }, [type, tmdbId]);

  const loadSeasonEpisodes = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/tmdb/tv/${tmdbId}/season/${season}`);
      if (response.data && response.data.episodes) {
        setEpisodes(response.data.episodes);
      }
    } catch (error) {
      console.error('Error carregant episodis:', error);
    }
  }, [tmdbId, season]);

  // Funció per entrar en mode immersiu (definida aquí per evitar errors de referència)
  const enterImmersiveMode = useCallback(async () => {
    try {
      if (containerRef.current && !document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      }
      if (window.screen.orientation && window.screen.orientation.lock) {
        try {
          await window.screen.orientation.lock('landscape');
        } catch (e) {
          console.log('Orientation lock not supported');
        }
      }
    } catch (e) {
      console.log('Fullscreen request failed:', e);
    }
  }, []);

  // Carregar info del media si no s'ha passat per state
  useEffect(() => {
    if (!mediaInfo && tmdbId) {
      loadMediaInfo();
    }
  }, [tmdbId, mediaInfo, loadMediaInfo]);

  // Carregar episodis de la temporada actual
  useEffect(() => {
    if (type !== 'movie' && tmdbId && season) {
      loadSeasonEpisodes();
    }
  }, [tmdbId, season, type, loadSeasonEpisodes]);

  // Amagar controls després d'un temps
  useEffect(() => {
    let timeout;
    if (showControls && !showSourceMenu && !showEpisodesMenu) {
      const delay = isFullscreen ? 2000 : 4000;
      timeout = setTimeout(() => {
        setShowControls(false);
      }, delay);
    }
    return () => clearTimeout(timeout);
  }, [showControls, showSourceMenu, showEpisodesMenu, isFullscreen]);

  // Mostrar controls quan mous el ratolí
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
  }, []);

  // Amagar controls quan es fa clic
  const handleContainerClick = useCallback((e) => {
    const isControlClick = e.target.closest('.stream-btn') ||
                          e.target.closest('.stream-source-dropdown') ||
                          e.target.closest('.stream-episodes-dropdown');
    if (!isControlClick) {
      setShowControls(false);
    }
  }, []);

  // Quan l'iframe carrega
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    enterImmersiveMode();
  }, [enterImmersiveMode]);

  // Canviar de font
  const handleSourceChange = useCallback((index) => {
    setLoading(true);
    setCurrentSourceIndex(index);
    localStorage.setItem('hermes_stream_source', EMBED_SOURCES[index].id);
    setShowSourceMenu(false);
  }, []);

  // Tornar enrere
  const handleBack = useCallback(() => {
    if (type === 'movie') {
      navigate(`/movies/${tmdbId}`);
    } else {
      navigate(`/series/${tmdbId}`);
    }
  }, [navigate, type, tmdbId]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Navegació d'episodis
  const goToPrevEpisode = useCallback(() => {
    if (!episode || episode <= 1) {
      if (season && season > 1) {
        navigate(`/stream/tv/${tmdbId}?s=${season - 1}&e=1`);
      }
      return;
    }
    navigate(`/stream/tv/${tmdbId}?s=${season}&e=${episode - 1}`);
    setLoading(true);
  }, [navigate, tmdbId, season, episode]);

  const goToNextEpisode = useCallback(() => {
    if (!episode) return;
    const maxEpisode = episodes.length > 0 ? episodes.length : 999;
    if (episode >= maxEpisode) {
      const maxSeason = seasons.length > 0 ? Math.max(...seasons.map(s => s.season_number)) : 999;
      if (season && season < maxSeason) {
        navigate(`/stream/tv/${tmdbId}?s=${season + 1}&e=1`);
        setLoading(true);
      }
      return;
    }
    navigate(`/stream/tv/${tmdbId}?s=${season}&e=${episode + 1}`);
    setLoading(true);
  }, [navigate, tmdbId, season, episode, episodes.length, seasons]);

  const goToEpisode = useCallback((ep) => {
    navigate(`/stream/tv/${tmdbId}?s=${season}&e=${ep.episode_number}`);
    setLoading(true);
    setShowEpisodesMenu(false);
  }, [navigate, tmdbId, season]);

  // Escoltar canvis de fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs && window.screen.orientation && window.screen.orientation.unlock) {
        try {
          window.screen.orientation.unlock();
        } catch (e) {}
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handler per iniciar la reproducció
  const handleStartPlayback = useCallback(() => {
    setShowStartOverlay(false);
    enterImmersiveMode();
  }, [enterImmersiveMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showEpisodesMenu) {
          setShowEpisodesMenu(false);
        } else if (showSourceMenu) {
          setShowSourceMenu(false);
        } else if (isFullscreen) {
          document.exitFullscreen();
        } else {
          handleBack();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'n' || e.key === 'N') {
        if (type !== 'movie') goToNextEpisode();
      } else if (e.key === 'p' || e.key === 'P') {
        if (type !== 'movie') goToPrevEpisode();
      } else if (e.key === 's' || e.key === 'S') {
        setShowSourceMenu(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handleBack, toggleFullscreen, goToNextEpisode, goToPrevEpisode, type, showEpisodesMenu, showSourceMenu]);

  // Tancar menús quan es clica fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showEpisodesMenu && episodesMenuRef.current && !episodesMenuRef.current.contains(e.target)) {
        setShowEpisodesMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEpisodesMenu]);

  // Construir títol
  const getTitle = () => {
    if (!mediaInfo) return '';
    return mediaInfo.title || mediaInfo.name || '';
  };

  const getEpisodeTitle = () => {
    if (!episode || !episodes.length) return '';
    const ep = episodes.find(e => e.episode_number === episode);
    return ep?.name || '';
  };

  return (
    <div
      className={`stream-player-container ${isFullscreen ? 'is-fullscreen' : ''}`}
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleContainerClick}
    >
      {/* Iframe del reproductor embed */}
      <iframe
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

      {/* Start overlay */}
      {showStartOverlay && !loading && (
        <div className="stream-start-overlay" onClick={handleStartPlayback}>
          <div className="stream-start-content">
            <div className="stream-start-icon">
              <PlayCircleIcon />
            </div>
            <p className="stream-start-text">Toca per reproduir</p>
            <p className="stream-start-hint">Pantalla completa</p>
          </div>
        </div>
      )}

      {/* Barra de controls superior */}
      <div className={`stream-controls-bar ${showControls ? 'visible' : ''}`}>
        {/* Botó tornar */}
        <button className="stream-btn stream-back-btn" onClick={handleBack} title="Tornar (Esc)">
          <BackIcon />
        </button>

        {/* Títol i info */}
        <div className="stream-title-section">
          <h2 className="stream-title">{getTitle()}</h2>
          {season && episode && (
            <div className="stream-episode-info">
              <span className="stream-se">T{season} E{episode}</span>
              {getEpisodeTitle() && (
                <span className="stream-ep-title">{getEpisodeTitle()}</span>
              )}
            </div>
          )}
        </div>

        {/* Espai flexible */}
        <div className="stream-spacer" />

        {/* Controls de navegació d'episodis */}
        {type !== 'movie' && season && episode && (
          <div className="stream-episode-nav">
            <button
              className="stream-btn stream-nav-btn"
              onClick={goToPrevEpisode}
              disabled={episode <= 1 && season <= 1}
              title="Episodi anterior (P)"
            >
              <PrevIcon />
            </button>

            {/* Menú d'episodis */}
            <div className="stream-episodes-wrapper" ref={episodesMenuRef}>
              <button
                className={`stream-btn stream-episodes-btn ${showEpisodesMenu ? 'active' : ''}`}
                onClick={() => setShowEpisodesMenu(!showEpisodesMenu)}
                title="Episodis"
              >
                <EpisodesIcon />
              </button>

              {showEpisodesMenu && (
                <div className="stream-episodes-dropdown">
                  <div className="stream-episodes-header">
                    Temporada {season}
                  </div>
                  <div className="stream-episodes-list">
                    {episodes.map((ep) => (
                      <button
                        key={ep.episode_number}
                        className={`stream-episode-option ${ep.episode_number === episode ? 'active' : ''}`}
                        onClick={() => goToEpisode(ep)}
                      >
                        <span className="ep-number">{ep.episode_number}</span>
                        <span className="ep-title">{ep.name || `Episodi ${ep.episode_number}`}</span>
                        {ep.episode_number === episode && <span className="ep-playing">&#9654;</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              className="stream-btn stream-nav-btn"
              onClick={goToNextEpisode}
              title="Episodi següent (N)"
            >
              <NextIcon />
            </button>
          </div>
        )}

        {/* Selector de servidor */}
        <div className="stream-source-selector">
          <button
            className={`stream-btn stream-source-btn ${showSourceMenu ? 'active' : ''}`}
            onClick={() => setShowSourceMenu(!showSourceMenu)}
            title="Canviar servidor (S)"
          >
            <ServerIcon />
            <span className="source-name-short">{currentSource.name}</span>
          </button>

          {showSourceMenu && (
            <div className="stream-source-dropdown">
              <div className="stream-source-header">Servidor</div>
              <div className="stream-source-list">
                {EMBED_SOURCES.map((source, index) => (
                  <button
                    key={source.id}
                    className={`stream-source-option ${index === currentSourceIndex ? 'active' : ''}`}
                    onClick={() => handleSourceChange(index)}
                  >
                    <div className="source-info">
                      <span className="source-name">{source.name}</span>
                      <span className="source-desc">{source.description}</span>
                    </div>
                    {index === currentSourceIndex && <span className="check">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Botó fullscreen */}
        <button className="stream-btn" onClick={toggleFullscreen} title="Pantalla completa (F)">
          {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </button>
      </div>
    </div>
  );
}

export default StreamPlayer;
