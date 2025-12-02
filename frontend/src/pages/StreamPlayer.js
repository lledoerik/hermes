import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Hls from 'hls.js';
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

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
  </svg>
);

const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
  </svg>
);

// Fonts d'embed disponibles
const EMBED_SOURCES = [
  {
    id: 'vidsrc',
    name: 'VidSrc',
    description: 'Multi-servidor',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
      }
      return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: 'vidsrc-pro',
    name: 'VidSrc Pro',
    description: 'Alta qualitat',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.pro/embed/movie/${tmdbId}`;
      }
      return `https://vidsrc.pro/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: 'torrentio-hls',
    name: 'Torrentio HLS',
    description: 'Real-Debrid (Transcodificat)',
    isTorrentio: true,
    useTranscode: true,
    getUrl: (type, tmdbId, season, episode, quality = '1080p') => {
      const baseUrl = window.location.hostname === 'localhost'
        ? 'http://localhost:8000'
        : '';
      const params = new URLSearchParams();
      if (season) params.set('season', season);
      if (episode) params.set('episode', episode);
      params.set('quality', quality);
      return `${baseUrl}/api/torrentio/transcode/${type}/${tmdbId}?${params.toString()}`;
    }
  },
  {
    id: 'torrentio',
    name: 'Torrentio Direct',
    description: 'Real-Debrid (Directe)',
    isTorrentio: true,
    useTranscode: false,
    getUrl: (type, tmdbId, season, episode, quality = '1080p') => {
      const baseUrl = window.location.hostname === 'localhost'
        ? 'http://localhost:8000'
        : '';
      const params = new URLSearchParams();
      if (season) params.set('season', season);
      if (episode) params.set('episode', episode);
      params.set('quality', quality);
      return `${baseUrl}/api/torrentio/stream/${type}/${tmdbId}?${params.toString()}`;
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

  // Estats per Torrentio
  const [torrentioStream, setTorrentioStream] = useState(null);
  const [torrentioError, setTorrentioError] = useState(null);
  const [torrentioLoading, setTorrentioLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

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

  // Carregar stream de Torrentio quan es selecciona
  useEffect(() => {
    if (!currentSource?.isTorrentio) {
      setTorrentioStream(null);
      setTorrentioError(null);
      setVideoError(null);
      // Cleanup HLS si existeix
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    const fetchTorrentioStream = async () => {
      setTorrentioLoading(true);
      setTorrentioError(null);
      setVideoError(null);

      try {
        const params = new URLSearchParams();
        if (season) params.set('season', season);
        if (episode) params.set('episode', episode);
        params.set('quality', '1080p');

        // Usar endpoint de transcodificació o directe segons la font
        const endpoint = currentSource.useTranscode
          ? `/api/torrentio/transcode/${mediaType}/${tmdbId}`
          : `/api/torrentio/stream/${mediaType}/${tmdbId}`;

        const response = await axios.get(`${API_URL}${endpoint}?${params.toString()}`);

        if (currentSource.useTranscode) {
          // Stream transcodificat - usa playlist HLS
          if (response.data && response.data.playlist_url) {
            setTorrentioStream({
              stream_url: `${API_URL}${response.data.playlist_url}`,
              title: response.data.title,
              quality: response.data.quality,
              source: response.data.source,
              size: response.data.size,
              type: 'hls',
              stream_id: response.data.stream_id,
              ffmpeg_available: response.data.ffmpeg_available
            });
            setLoading(false);
          } else {
            throw new Error('No s\'ha pogut iniciar la transcodificació');
          }
        } else {
          // Stream directe
          if (response.data && response.data.stream_url) {
            setTorrentioStream({
              ...response.data,
              type: 'direct'
            });
            setLoading(false);
          } else {
            throw new Error('No s\'ha trobat cap stream');
          }
        }
      } catch (error) {
        console.error('Error carregant Torrentio:', error);
        const errorDetail = error.response?.data?.detail;

        // Si l'error és que FFmpeg no està disponible, mostrar missatge especial
        if (errorDetail?.ffmpeg_available === false) {
          setTorrentioError('FFmpeg no disponible. Prova amb "Torrentio Direct" o instal·la FFmpeg al servidor.');
        } else {
          setTorrentioError(typeof errorDetail === 'string' ? errorDetail : error.message);
        }
        setLoading(false);
      } finally {
        setTorrentioLoading(false);
      }
    };

    fetchTorrentioStream();
  }, [currentSource, mediaType, tmdbId, season, episode]);

  // Configurar HLS.js quan tenim un stream
  useEffect(() => {
    if (!torrentioStream?.stream_url || !videoRef.current) return;

    const video = videoRef.current;
    const streamUrl = torrentioStream.stream_url;
    const isHlsStream = torrentioStream.type === 'hls' || streamUrl.includes('.m3u8');

    // Cleanup anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Si és HLS (transcodificat o .m3u8), usar hls.js
    if (isHlsStream) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          startLevel: -1, // Auto-select quality
          // Configuració per streams en directe/transcodificats
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 10,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hlsRef.current = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLS manifest parsed, starting playback');
          video.play().catch(e => console.log('Autoplay prevented:', e));
          setLoading(false);
          enterImmersiveMode();
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('HLS network error, trying to recover...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('HLS media error, trying to recover...');
                hls.recoverMediaError();
                break;
              default:
                setVideoError('Error reproduint el stream HLS. Prova amb un altre servidor.');
                break;
            }
          }
        });

        // Event quan el buffer està ple
        hls.on(Hls.Events.BUFFER_APPENDED, () => {
          setLoading(false);
        });

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari pot reproduir HLS nativament
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(e => console.log('Autoplay prevented:', e));
          setLoading(false);
          enterImmersiveMode();
        });
      } else {
        setVideoError('El teu navegador no suporta HLS. Prova amb Chrome, Firefox o Safari.');
      }
    } else {
      // Stream directe (MP4, MKV, etc.) - intentar reproduir nativament
      video.src = streamUrl;
    }

    // Cleanup on unmount
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [torrentioStream, enterImmersiveMode]);

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
      {/* Torrentio: Reproductor natiu de vídeo */}
      {currentSource?.isTorrentio ? (
        <>
          {torrentioStream?.stream_url && !videoError ? (
            <video
              ref={videoRef}
              className="stream-video-native"
              autoPlay
              controls
              playsInline
              onLoadedData={() => {
                setLoading(false);
                setVideoError(null);
                enterImmersiveMode();
              }}
              onCanPlay={() => {
                setLoading(false);
              }}
              onError={(e) => {
                console.error('Video error:', e);
                // Detectar si l'error és de còdec no suportat
                const video = e.target;
                if (video.error) {
                  const errorMsg = video.error.code === 4
                    ? 'El format del vídeo no és compatible amb el navegador (probablement H.265/HEVC). Pots copiar la URL i obrir-la amb VLC.'
                    : 'Error reproduint el vídeo. Prova amb un altre servidor.';
                  setVideoError(errorMsg);
                }
              }}
            />
          ) : null}

          {/* Error de reproducció de vídeo - Oferir alternatives */}
          {(torrentioError || videoError) && (
            <div className="stream-error-overlay">
              <div className="stream-error-content">
                <span className="error-icon">⚠️</span>
                <h3>{videoError ? 'Problema de compatibilitat' : 'Error carregant stream'}</h3>
                <p>{videoError || torrentioError}</p>

                {/* Opcions alternatives */}
                <div className="error-alternatives">
                  {torrentioStream?.stream_url && (
                    <>
                      <p className="alternatives-hint">Pots reproduir aquest vídeo amb un reproductor extern:</p>
                      <div className="error-actions">
                        <button
                          className="alt-btn primary"
                          onClick={() => {
                            navigator.clipboard.writeText(torrentioStream.stream_url);
                            setUrlCopied(true);
                            setTimeout(() => setUrlCopied(false), 3000);
                          }}
                        >
                          <CopyIcon />
                          {urlCopied ? 'Copiat!' : 'Copiar URL'}
                        </button>
                        <button
                          className="alt-btn"
                          onClick={() => {
                            // Intent d'obrir amb VLC (protocol vlc://)
                            window.open(`vlc://${torrentioStream.stream_url}`, '_blank');
                          }}
                        >
                          <ExternalIcon />
                          Obrir amb VLC
                        </button>
                      </div>
                    </>
                  )}

                  <div className="error-actions secondary">
                    <button onClick={() => {
                      setTorrentioError(null);
                      setVideoError(null);
                      setTorrentioLoading(true);
                      // Retry
                      const params = new URLSearchParams();
                      if (season) params.set('season', season);
                      if (episode) params.set('episode', episode);
                      params.set('quality', '1080p');
                      axios.get(`${API_URL}/api/torrentio/stream/${mediaType}/${tmdbId}?${params.toString()}`)
                        .then(r => {
                          if (r.data?.stream_url) setTorrentioStream(r.data);
                          setTorrentioLoading(false);
                        })
                        .catch(e => {
                          setTorrentioError(e.response?.data?.detail || e.message);
                          setTorrentioLoading(false);
                        });
                    }}>
                      <RefreshIcon />
                      Reintentar
                    </button>
                    <button onClick={() => handleSourceChange(0)}>
                      <ServerIcon />
                      Canviar a VidSrc
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info del stream Torrentio */}
          {torrentioStream && !torrentioError && !videoError && (
            <div className="torrentio-info">
              <span className="quality-badge">{torrentioStream.quality}</span>
              <span className="source-badge">{torrentioStream.source}</span>
              {torrentioStream.size && <span className="size-badge">{torrentioStream.size}</span>}
            </div>
          )}
        </>
      ) : (
        /* Iframe del reproductor embed */
        <iframe
          key={embedUrl}
          src={embedUrl}
          className="stream-iframe"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          onLoad={handleIframeLoad}
          title="Video Player"
        />
      )}

      {/* Loading overlay */}
      {(loading || torrentioLoading) && (
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
