import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
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

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
  </svg>
);

const CheckCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);

// Helper per crear slug per anime (títol normalitzat)
const createAnimeSlug = (title) => {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
};

// Fonts d'embed - Ordre optimitzat: genèrics primer, anime després
const EMBED_SOURCES = [
  // === FONTS GENERALS (funcionen amb TMDB ID) ===
  {
    id: 'vidsrc-cc',
    name: 'VidSrc CC',
    description: 'Recomanat',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
      }
      return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: 'vidsrc-xyz',
    name: 'VidSrc',
    description: 'Alternatiu',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://vidsrc.xyz/embed/movie?tmdb=${tmdbId}`;
      }
      return `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${season || 1}&episode=${episode || 1}`;
    }
  },
  {
    id: 'embed-su',
    name: 'Embed.su',
    description: 'HD',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://embed.su/embed/movie/${tmdbId}`;
      }
      return `https://embed.su/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed',
    description: 'Multifont',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://autoembed.cc/embed/movie/${tmdbId}`;
      }
      return `https://autoembed.cc/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
    }
  },
  {
    id: '2embed',
    name: '2Embed',
    description: 'Backup',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://www.2embed.cc/embed/${tmdbId}`;
      }
      return `https://www.2embed.cc/embedtv/${tmdbId}&s=${season || 1}&e=${episode || 1}`;
    }
  },
  {
    id: 'superembed',
    name: 'SuperEmbed',
    description: 'Reserva',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`;
      }
      return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}`;
    }
  },
  // === FONTS D'ANIME (només sèries) ===
  {
    id: 'vidsrc-anime-sub',
    name: 'Anime SUB',
    description: 'Japonès + Subs',
    getUrl: (type, tmdbId, season, episode) => {
      // Només funciona per sèries (anime)
      if (type === 'movie') return null;
      // Format: https://vidsrc.cc/v2/embed/anime/{tmdb_id}/{episode}/sub
      return `https://vidsrc.cc/v2/embed/anime/${tmdbId}/${episode || 1}/sub`;
    }
  },
  {
    id: 'vidsrc-anime-dub',
    name: 'Anime DUB',
    description: 'Anglès doblat',
    getUrl: (type, tmdbId, season, episode) => {
      // Només funciona per sèries (anime)
      if (type === 'movie') return null;
      // Format: https://vidsrc.cc/v2/embed/anime/{tmdb_id}/{episode}/dub
      return `https://vidsrc.cc/v2/embed/anime/${tmdbId}/${episode || 1}/dub`;
    }
  },
  {
    id: 'autoembed-anime',
    name: 'AutoEmbed Anime',
    description: 'Anime alternatiu',
    needsTitle: true, // Indica que necessita el títol
    getUrl: (type, tmdbId, season, episode, title) => {
      // Només funciona per sèries (anime) i necessita títol
      if (type === 'movie') return null;
      if (!title) return 'waiting'; // Espera el títol
      const slug = createAnimeSlug(title);
      if (!slug) return null;
      // Format: https://anime.autoembed.cc/embed/{slug}-episode-{number}
      return `https://anime.autoembed.cc/embed/${slug}-episode-${episode || 1}`;
    }
  }
];

function StreamPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isPremium, isAuthenticated } = useAuth();
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

  // Sempre començar amb VidSrc principal (índex 0)
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [loading, setLoading] = useState(true); // Carregar directament
  const [showControls, setShowControls] = useState(true);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [showEpisodesMenu, setShowEpisodesMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStartOverlay, setShowStartOverlay] = useState(false); // Sense overlay
  const [hasStartedPlaying, setHasStartedPlaying] = useState(true); // Reproduir directament
  const [hasTriedFallback, setHasTriedFallback] = useState(false);
  const [manualSourceChange, setManualSourceChange] = useState(false); // Canvi manual de servidor

  // Estat de progrés de visualització
  const [isWatched, setIsWatched] = useState(false);
  const [watchStartTime, setWatchStartTime] = useState(Date.now()); // Iniciar temps de visualització

  // Timeout per amagar controls
  const controlsTimeoutRef = useRef(null);

  const currentSource = EMBED_SOURCES[currentSourceIndex];
  const mediaType = type === 'movie' ? 'movie' : 'tv';

  // Obtenir el títol per fonts que el necessiten (anime)
  const mediaTitle = mediaInfo?.name || mediaInfo?.title || mediaInfo?.original_name || '';

  // Construir URL per embed
  const embedUrl = React.useMemo(() => {
    const url = currentSource.getUrl(mediaType, tmdbId, season, episode, mediaTitle);
    // 'waiting' significa que espera el títol (per fonts d'anime)
    if (url === 'waiting') {
      return null; // Esperar sense saltar
    }
    // null significa que no és compatible (ex: anime-only per pel·lícules)
    return url;
  }, [currentSource, mediaType, tmdbId, season, episode, mediaTitle]);

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

  // Guardar progrés de streaming
  const saveStreamingProgress = useCallback(async (progressPercent = 50, completed = false) => {
    try {
      await axios.post('/api/streaming/progress', {
        tmdb_id: parseInt(tmdbId),
        media_type: type === 'movie' ? 'movie' : 'series',
        season_number: type !== 'movie' ? (season || 1) : null,
        episode_number: type !== 'movie' ? (episode || 1) : null,
        progress_percent: progressPercent,
        completed: completed,
        title: mediaInfo?.title || mediaInfo?.name || '',
        poster_path: mediaInfo?.poster_path || null,
        backdrop_path: mediaInfo?.backdrop_path || null
      });
      if (completed) {
        setIsWatched(true);
      }
    } catch (error) {
      console.error('Error guardant progrés:', error);
    }
  }, [tmdbId, type, season, episode, mediaInfo]);

  // Marcar com a vist (100%)
  const markAsWatched = useCallback(async () => {
    await saveStreamingProgress(100, true);
  }, [saveStreamingProgress]);

  // Carregar estat de progrés actual
  const loadWatchStatus = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        tmdb_id: tmdbId,
        media_type: type === 'movie' ? 'movie' : 'series'
      });
      if (type !== 'movie') {
        params.append('season', season || 1);
        params.append('episode', episode || 1);
      }
      const response = await axios.get(`/api/streaming/progress?${params}`);
      if (response.data && response.data.completed) {
        setIsWatched(true);
      }
    } catch (error) {
      // Sense progrés guardat - normal per contingut nou
    }
  }, [tmdbId, type, season, episode]);

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

  // Carregar estat de progrés i iniciar timer
  useEffect(() => {
    if (tmdbId) {
      loadWatchStatus();
      setWatchStartTime(Date.now());
      setIsWatched(false); // Reset per nou contingut
    }
  }, [tmdbId, season, episode, loadWatchStatus]);

  // Auto-guardar progrés després de 30 segons de visualització
  useEffect(() => {
    if (!watchStartTime || showStartOverlay || loading) return;

    const timer = setTimeout(() => {
      // Després de 30 segons, marcar com "en progrés" (50%)
      saveStreamingProgress(50, false);
    }, 30000);

    return () => clearTimeout(timer);
  }, [watchStartTime, showStartOverlay, loading, saveStreamingProgress]);

  // Guardar progrés quan l'usuari surt o canvia d'episodi
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Guardar progrés abans de sortir (50% si no està marcat com vist)
      if (!isWatched && !showStartOverlay) {
        // Usem navigator.sendBeacon per assegurar que s'envia
        const data = JSON.stringify({
          tmdb_id: parseInt(tmdbId),
          media_type: type === 'movie' ? 'movie' : 'series',
          season_number: type !== 'movie' ? (season || 1) : null,
          episode_number: type !== 'movie' ? (episode || 1) : null,
          progress_percent: 50,
          completed: false,
          title: mediaInfo?.title || mediaInfo?.name || '',
          poster_path: mediaInfo?.poster_path || null,
          backdrop_path: mediaInfo?.backdrop_path || null
        });
        navigator.sendBeacon(`${API_URL}/api/streaming/progress`, data);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tmdbId, type, season, episode, mediaInfo, isWatched, showStartOverlay]);

  // Amagar controls després de 3 segons d'inactivitat (igual que l'iframe)
  useEffect(() => {
    let timeout;
    if (showControls && !showSourceMenu && !showEpisodesMenu && hasStartedPlaying && !loading) {
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => clearTimeout(timeout);
  }, [showControls, showSourceMenu, showEpisodesMenu, hasStartedPlaying, loading]);

  // Mostrar controls quan mous el ratolí (amb timeout per amagar-los)
  const handleMouseMove = useCallback(() => {
    setShowControls(true);

    // Netejar timeout anterior
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    // Amagar controls després de 3 segons d'inactivitat
    controlsTimeoutRef.current = setTimeout(() => {
      // No amagar si hi ha un menú obert
      if (!showSourceMenu && !showEpisodesMenu) {
        setShowControls(false);
      }
    }, 3000);
  }, [showSourceMenu, showEpisodesMenu]);

  // Toggle controls quan es fa clic
  const handleContainerClick = useCallback((e) => {
    const isControlClick = e.target.closest('.stream-btn') ||
                          e.target.closest('.stream-source-dropdown') ||
                          e.target.closest('.stream-episodes-dropdown') ||
                          e.target.closest('.stream-next-episode-btn');
    if (!isControlClick) {
      setShowControls(prev => !prev);
    }
  }, []);

  // Netejar timeout quan es desmunta
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Quan l'iframe carrega correctament
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    setHasTriedFallback(false); // Reset per futures càrregues
    setManualSourceChange(false); // Reset canvi manual
    if (!showStartOverlay) {
      enterImmersiveMode();
    }
  }, [enterImmersiveMode, showStartOverlay]);

  // Quan l'iframe falla - passar al següent servidor
  const handleIframeError = useCallback(() => {
    console.log(`Error amb ${EMBED_SOURCES[currentSourceIndex].name}, provant següent...`);
    const nextIndex = currentSourceIndex + 1;
    if (nextIndex < EMBED_SOURCES.length) {
      setCurrentSourceIndex(nextIndex);
      setLoading(true);
    } else {
      // Hem provat tots els servidors
      setLoading(false);
      console.log('Tots els servidors han fallat');
    }
  }, [currentSourceIndex]);

  // Saltar automàticament fonts que retornen null NOMÉS si no és canvi manual
  useEffect(() => {
    // No saltar si l'usuari ha canviat manualment o si la font espera el títol
    if (manualSourceChange) return;

    const rawUrl = currentSource.getUrl(mediaType, tmdbId, season, episode, mediaTitle);
    // 'waiting' = espera el títol, no saltar
    if (rawUrl === 'waiting') return;

    // null = no compatible, saltar automàticament
    if (rawUrl === null && hasStartedPlaying) {
      const nextIndex = currentSourceIndex + 1;
      if (nextIndex < EMBED_SOURCES.length) {
        console.log(`${currentSource.name} no compatible, saltant...`);
        setCurrentSourceIndex(nextIndex);
      }
    }
  }, [currentSource, mediaType, tmdbId, season, episode, mediaTitle, currentSourceIndex, hasStartedPlaying, manualSourceChange]);

  // Fallback automàtic després de 10 segons si encara carrega (només si no és canvi manual)
  useEffect(() => {
    if (!hasStartedPlaying || !loading || manualSourceChange) return;

    const fallbackTimer = setTimeout(() => {
      // Si encara està carregant després de 10s, provar el següent servidor
      if (loading) {
        const nextIndex = currentSourceIndex + 1;
        if (nextIndex < EMBED_SOURCES.length) {
          console.log(`Timeout - passant de ${EMBED_SOURCES[currentSourceIndex].name} a ${EMBED_SOURCES[nextIndex].name}`);
          setCurrentSourceIndex(nextIndex);
        } else {
          // Hem provat tots, deixar el loading
          setLoading(false);
        }
      }
    }, 10000);

    return () => clearTimeout(fallbackTimer);
  }, [hasStartedPlaying, loading, currentSourceIndex, manualSourceChange]);

  // Canviar de font manualment
  const handleSourceChange = useCallback((index) => {
    setManualSourceChange(true); // Marcar com a canvi manual
    setLoading(true);
    setCurrentSourceIndex(index);
    setShowSourceMenu(false);
  }, []);

  // Tornar enrere - usar historial del navegador per anar a la pàgina correcta
  const handleBack = useCallback(() => {
    // Usar navigate(-1) per tornar a la pàgina anterior (Details amb ID correcte)
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
    setHasStartedPlaying(true);
    setLoading(true);
    setHasTriedFallback(false); // Reset per si canviem d'episodi
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
      } else if (e.key === 'm' || e.key === 'M') {
        markAsWatched();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handleBack, toggleFullscreen, goToNextEpisode, goToPrevEpisode, type, showEpisodesMenu, showSourceMenu, markAsWatched]);

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

  // Obtenir URL del backdrop
  const getBackdropUrl = () => {
    if (mediaInfo?.backdrop_path) {
      return `https://image.tmdb.org/t/p/w1280${mediaInfo.backdrop_path}`;
    }
    if (mediaInfo?.poster_path) {
      return `https://image.tmdb.org/t/p/w780${mediaInfo.poster_path}`;
    }
    return null;
  };

  // Si l'usuari no té accés, redirigir silenciosament
  if (!isPremium) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div
      className={`stream-player-container ${isFullscreen ? 'is-fullscreen' : ''}`}
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleContainerClick}
    >
      {/* Iframe del reproductor embed - només mostrar quan s'ha iniciat i URL vàlida */}
      {hasStartedPlaying && embedUrl && (
        <iframe
          key={embedUrl}
          src={embedUrl}
          className="stream-iframe"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          title="Video Player"
        />
      )}

      {/* Loading overlay */}
      {loading && hasStartedPlaying && (
        <div className="stream-loading-overlay">
          <div className="stream-loading-spinner">
            <div className="spinner"></div>
            <p>Carregant {currentSource.name}...</p>
          </div>
        </div>
      )}

      {/* Start overlay - amb backdrop del contingut */}
      {showStartOverlay && (
        <div
          className="stream-start-overlay"
          onClick={handleStartPlayback}
          style={{
            backgroundImage: getBackdropUrl() ? `url(${getBackdropUrl()})` : 'none'
          }}
        >
          <div className="stream-start-content">
            <h2 className="stream-start-title">{getTitle()}</h2>
            {season && episode && (
              <p className="stream-start-episode">Temporada {season} - Episodi {episode}</p>
            )}
            <div className="stream-start-icon">
              <PlayCircleIcon />
            </div>
            <p className="stream-start-text">Reproduir</p>
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

        {/* Botó marcar com vist */}
        <button
          className={`stream-btn stream-watched-btn ${isWatched ? 'watched' : ''}`}
          onClick={markAsWatched}
          title={isWatched ? 'Ja vist' : 'Marcar com a vist (M)'}
        >
          {isWatched ? <CheckCircleIcon /> : <CheckIcon />}
        </button>

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

      {/* Botó flotant per passar al següent capítol */}
      {type !== 'movie' && season && episode && episodes.length > 0 && (
        <button
          className={`stream-next-episode-btn ${showControls ? 'visible' : ''}`}
          onClick={goToNextEpisode}
          title="Següent capítol (N)"
        >
          <span className="next-episode-text">Següent capítol</span>
          <NextIcon />
        </button>
      )}
    </div>
  );
}

export default StreamPlayer;
