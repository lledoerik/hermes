import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Hls from 'hls.js';
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

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z"/>
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
  </svg>
);

const SkipBackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
  </svg>
);

const SkipForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
  </svg>
);

const VolumeHighIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
);

const VolumeMuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
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

const ServerIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
  </svg>
);

const LoadingSpinner = ({ text = 'Carregant...' }) => (
  <div className="stream-loading-spinner">
    <div className="spinner"></div>
    <p>{text}</p>
  </div>
);

// Llista de servidors d'extracció disponibles
const STREAM_SOURCES = [
  { id: 'vidsrc', name: 'VidSrc' },
  { id: 'vidsrc.me', name: 'VidSrc.me' },
  { id: 'superembed', name: 'SuperEmbed' },
];

function StreamPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressRef = useRef(null);

  // Parsejar paràmetres de la URL (season, episode)
  const searchParams = new URLSearchParams(location.search);
  const season = searchParams.get('s') ? parseInt(searchParams.get('s')) : null;
  const episode = searchParams.get('e') ? parseInt(searchParams.get('e')) : null;

  // Estats principals
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [itemInfo, setItemInfo] = useState(null);
  const [showSourceMenu, setShowSourceMenu] = useState(false);

  // Estats del reproductor
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [, setVideoReady] = useState(false); // Utilitzat per reset, llegit via videoLoading
  const [videoLoading, setVideoLoading] = useState(true);

  const currentSource = STREAM_SOURCES[currentSourceIndex];
  const skipSeconds = 10;

  // Funció per extreure l'stream d'una font
  const extractStream = useCallback(async (sourceId) => {
    setExtracting(true);
    setError(null);
    setStreamUrl(null);
    setVideoReady(false);

    try {
      const mediaType = type === 'movie' ? 'movie' : 'series';
      let url = `/api/extract-stream/${mediaType}/${tmdbId}?source=${sourceId}`;

      if (season && episode) {
        url += `&season=${season}&episode=${episode}`;
      }

      const response = await axios.get(url);

      if (response.data.url) {
        setStreamUrl(response.data.url);
        setError(null);
      } else {
        throw new Error('No s\'ha pogut obtenir l\'URL del stream');
      }
    } catch (err) {
      console.error('Error extraient stream:', err);
      // Intentar amb la següent font automàticament
      const nextIndex = currentSourceIndex + 1;
      if (nextIndex < STREAM_SOURCES.length) {
        console.log(`Font ${sourceId} ha fallat, provant ${STREAM_SOURCES[nextIndex].id}...`);
        setCurrentSourceIndex(nextIndex);
      } else {
        setError('Cap servidor disponible funciona. Prova més tard o canvia de servidor.');
      }
    } finally {
      setExtracting(false);
      setLoading(false);
    }
  }, [type, tmdbId, season, episode, currentSourceIndex]);

  // Extreure stream quan canvia la font
  useEffect(() => {
    if (currentSource) {
      extractStream(currentSource.id);
    }
  }, [currentSource, extractStream]);

  // Carregar info de l'item per mostrar títol
  useEffect(() => {
    const loadItemInfo = async () => {
      try {
        if (type === 'movie') {
          // Buscar per TMDB ID a la biblioteca local
          const response = await axios.get('/api/library/movies');
          const movie = response.data.find(m => m.tmdb_id === parseInt(tmdbId));
          if (movie) {
            setItemInfo(movie);
          }
        } else {
          // Per sèries
          const response = await axios.get('/api/library/series');
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

  // Gestionar HLS quan hi ha una URL de stream
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;

    // Destruir instància HLS anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setVideoLoading(false);
        setVideoReady(true);
        videoRef.current.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('HLS error fatal:', data);
          setError('Error reproduint el stream. Prova un altre servidor.');
        }
      });

      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari suporta HLS nativament
      videoRef.current.src = streamUrl;
      videoRef.current.addEventListener('loadedmetadata', () => {
        setVideoLoading(false);
        setVideoReady(true);
        videoRef.current.play().catch(() => {});
      });
    } else {
      // Per URLs MP4 directes
      videoRef.current.src = streamUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  // Handlers del reproductor
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }, []);

  const skip = useCallback((seconds) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
  }, [duration]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (videoRef.current.buffered.length > 0) {
      setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
    setVideoReady(true);
    setVideoLoading(false);
  }, []);

  const handleProgressClick = useCallback((e) => {
    if (!progressRef.current || !videoRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = percent * duration;
  }, [duration]);

  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    setIsMuted(newVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  // Canviar de servidor
  const handleSourceChange = useCallback((index) => {
    setCurrentSourceIndex(index);
    setShowSourceMenu(false);
  }, []);

  // Reintentar amb la font actual
  const handleRetry = useCallback(() => {
    extractStream(currentSource.id);
  }, [currentSource, extractStream]);

  // Tornar enrere
  const handleBack = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }
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

  // Format temps
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Mostrar controls temporalment
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying && !showSourceMenu) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSourceMenu(false);
      }, 3000);
    }
  }, [isPlaying, showSourceMenu]);

  // Event handlers
  const handleMouseMove = useCallback(() => {
    showControlsTemporarily();
  }, [showControlsTemporarily]);

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
      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(skipSeconds);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-skipSeconds);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.min(1, videoRef.current.volume + 0.1);
            videoRef.current.volume = newVol;
            setVolume(newVol);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.max(0, videoRef.current.volume - 0.1);
            videoRef.current.volume = newVol;
            setVolume(newVol);
          }
          break;
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
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handleBack, toggleFullscreen, togglePlay, skip]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Estat de càrrega inicial
  if (loading && !streamUrl && !error) {
    return (
      <div className="stream-player-container" ref={containerRef}>
        <LoadingSpinner text="Connectant amb el servidor..." />
      </div>
    );
  }

  // Estat d'error
  if (error && !extracting) {
    return (
      <div className="stream-player-container" ref={containerRef}>
        <div className="stream-error">
          <h2>Error de reproducció</h2>
          <p>{error}</p>
          <div className="stream-error-actions">
            <button onClick={handleRetry}>
              <RefreshIcon /> Reintentar
            </button>
            {currentSourceIndex < STREAM_SOURCES.length - 1 && (
              <button onClick={() => handleSourceChange(currentSourceIndex + 1)}>
                <ServerIcon /> Provar altre servidor
              </button>
            )}
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
      onClick={() => showControlsTemporarily()}
    >
      {/* Reproductor de vídeo natiu */}
      <video
        ref={videoRef}
        className="stream-video-player"
        autoPlay
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setVideoLoading(true)}
        onCanPlay={() => setVideoLoading(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />

      {/* Loading overlay */}
      {(extracting || videoLoading) && (
        <div className="stream-loading-overlay">
          <LoadingSpinner text={extracting ? `Connectant amb ${currentSource?.name}...` : 'Carregant vídeo...'} />
        </div>
      )}

      {/* Controls del reproductor */}
      <div className={`stream-player-controls ${showControls ? 'visible' : ''}`}>
        {/* Barra superior */}
        <div className="stream-top-bar">
          <button className="stream-back-btn" onClick={handleBack} title="Tornar (Esc)">
            <BackIcon />
          </button>
          <div className="stream-title">
            <h2>{itemInfo?.title || itemInfo?.name || 'Streaming'}</h2>
            {season && episode && (
              <span>Temporada {season} - Episodi {episode}</span>
            )}
          </div>
          <div className="stream-source-indicator">
            <ServerIcon />
            <span>{currentSource?.name}</span>
          </div>
        </div>

        {/* Control central - play/pause */}
        <div className="stream-center-controls">
          <button className="stream-center-btn" onClick={() => skip(-skipSeconds)}>
            <SkipBackIcon />
          </button>
          <button className="stream-center-btn stream-play-btn" onClick={togglePlay}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="stream-center-btn" onClick={() => skip(skipSeconds)}>
            <SkipForwardIcon />
          </button>
        </div>

        {/* Barra inferior */}
        <div className="stream-bottom-bar">
          {/* Barra de progrés */}
          <div className="stream-progress-container">
            <div
              ref={progressRef}
              className="stream-progress-bar"
              onClick={handleProgressClick}
            >
              <div
                className="stream-progress-buffered"
                style={{ width: `${(buffered / duration) * 100}%` }}
              />
              <div
                className="stream-progress-played"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              <div
                className="stream-progress-handle"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <div className="stream-time-display">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls inferiors */}
          <div className="stream-bottom-controls">
            <div className="stream-left-controls">
              <button className="stream-control-btn" onClick={togglePlay}>
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button className="stream-control-btn" onClick={() => skip(-skipSeconds)}>
                <SkipBackIcon />
              </button>
              <button className="stream-control-btn" onClick={() => skip(skipSeconds)}>
                <SkipForwardIcon />
              </button>
              <div className="stream-volume-control">
                <button className="stream-control-btn" onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeMuteIcon /> : <VolumeHighIcon />}
                </button>
                <div className="stream-volume-slider">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    style={{ '--volume-percent': `${(isMuted ? 0 : volume) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="stream-right-controls">
              {/* Selector de servidor */}
              <div className="stream-source-selector-wrapper">
                <button
                  className={`stream-control-btn ${showSourceMenu ? 'active' : ''}`}
                  onClick={() => setShowSourceMenu(!showSourceMenu)}
                  title="Canviar servidor"
                >
                  <ServerIcon />
                </button>
                {showSourceMenu && (
                  <div className="stream-source-menu">
                    <div className="stream-menu-header">Servidor</div>
                    {STREAM_SOURCES.map((source, index) => (
                      <button
                        key={source.id}
                        className={`stream-source-option ${index === currentSourceIndex ? 'active' : ''}`}
                        onClick={() => handleSourceChange(index)}
                      >
                        {index === currentSourceIndex && <span className="check-icon">✓</span>}
                        {source.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fullscreen */}
              <button className="stream-control-btn" onClick={toggleFullscreen}>
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StreamPlayer;
