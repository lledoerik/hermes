import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './DebridPlayer.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

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

const VolumeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
);

const VolumeMuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
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

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);

// Icon for iframe/external player fallback
const ExternalPlayerIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V8h14v10z"/>
    <path d="M10 16l5-4-5-4v8z"/>
  </svg>
);

// Format time (seconds to MM:SS or HH:MM:SS)
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

// Parse quality from torrent name
const parseQuality = (name) => {
  if (!name) return 'Desconeguda';
  const lower = name.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) return '4K';
  if (lower.includes('1080p')) return '1080p';
  if (lower.includes('720p')) return '720p';
  if (lower.includes('480p')) return '480p';
  if (lower.includes('hdtv')) return 'HDTV';
  if (lower.includes('web')) return 'WEB';
  return 'SD';
};

// Parse language from torrent name/title
const parseLanguage = (name, title) => {
  const text = `${name} ${title}`.toLowerCase();

  // Check flags first
  if (title) {
    if (title.includes('🇪🇸') || title.includes('🇲🇽')) return 'Castellà';
    if (title.includes('🇬🇧') || title.includes('🇺🇸')) return 'Anglès';
    if (title.includes('🇯🇵')) return 'Japonès';
    if (title.includes('🇫🇷')) return 'Francès';
    if (title.includes('🇩🇪')) return 'Alemany';
    if (title.includes('🇮🇹')) return 'Italià';
    if (title.includes('🇰🇷')) return 'Coreà';
    if (title.includes('🇨🇳') || title.includes('🇹🇼')) return 'Xinès';
    if (title.includes('🇵🇹') || title.includes('🇧🇷')) return 'Portuguès';
    if (title.includes('🇷🇺')) return 'Rus';
  }

  // Check text patterns
  if (text.includes('spanish') || text.includes('español') || text.includes('castellano') || text.includes('esp')) return 'Castellà';
  if (text.includes('latino') || text.includes('lat')) return 'Llatí';
  if (text.includes('catala') || text.includes('català')) return 'Català';
  if (text.includes('french') || text.includes('français') || text.includes('vff') || text.includes('vf')) return 'Francès';
  if (text.includes('german') || text.includes('deutsch')) return 'Alemany';
  if (text.includes('italian') || text.includes('italiano')) return 'Italià';
  if (text.includes('japanese') || text.includes('日本語')) return 'Japonès';
  if (text.includes('korean') || text.includes('한국어')) return 'Coreà';
  if (text.includes('multi')) return 'Multi';
  if (text.includes('dual')) return 'Dual';

  return 'Anglès'; // Default
};

function DebridPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  useAuth(); // Per verificar autenticació

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressSaveTimeoutRef = useRef(null);
  const resumeTimeRef = useRef(0);

  // URL params
  const searchParams = new URLSearchParams(location.search);
  const season = searchParams.get('s') ? parseInt(searchParams.get('s')) : null;
  const episode = searchParams.get('e') ? parseInt(searchParams.get('e')) : null;

  // Media info
  const [mediaInfo, setMediaInfo] = useState(location.state?.mediaInfo || null);
  const [episodes, setEpisodes] = useState([]);

  // Torrent/Debrid state
  const [torrents, setTorrents] = useState([]);
  const [selectedTorrent, setSelectedTorrent] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [loadingTorrents, setLoadingTorrents] = useState(true);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState(null);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const mediaType = type === 'movie' ? 'movie' : 'tv';

  // Group torrents by quality and language
  const groupedTorrents = useMemo(() => {
    const groups = {};

    torrents.forEach(torrent => {
      const quality = parseQuality(torrent.name);
      const language = parseLanguage(torrent.name, torrent.title);
      const key = `${quality}-${language}`;

      if (!groups[key]) {
        groups[key] = {
          quality,
          language,
          torrents: [],
          hasCached: false
        };
      }

      groups[key].torrents.push(torrent);
      if (torrent.cached) {
        groups[key].hasCached = true;
      }
    });

    // Sort groups: cached first, then by quality
    const qualityOrder = { '4K': 0, '1080p': 1, '720p': 2, 'WEB': 3, 'HDTV': 4, '480p': 5, 'SD': 6, 'Desconeguda': 7 };

    return Object.values(groups).sort((a, b) => {
      // Cached first
      if (a.hasCached && !b.hasCached) return -1;
      if (!a.hasCached && b.hasCached) return 1;
      // Then by quality
      return (qualityOrder[a.quality] || 99) - (qualityOrder[b.quality] || 99);
    });
  }, [torrents]);

  // Current selection info
  const currentQuality = selectedTorrent ? parseQuality(selectedTorrent.name) : null;
  const currentLanguage = selectedTorrent ? parseLanguage(selectedTorrent.name, selectedTorrent.title) : null;

  // Load media info
  const loadMediaInfo = useCallback(async () => {
    try {
      const endpoint = type === 'movie'
        ? `/api/tmdb/movie/${tmdbId}`
        : `/api/tmdb/tv/${tmdbId}`;
      const response = await axios.get(`${API_URL}${endpoint}`);
      setMediaInfo(response.data);
    } catch (err) {
      console.error('Error carregant info:', err);
    }
  }, [type, tmdbId]);

  // Load episodes for series
  const loadEpisodes = useCallback(async () => {
    if (type === 'movie' || !season) return;
    try {
      const response = await axios.get(`${API_URL}/api/tmdb/tv/${tmdbId}/season/${season}`);
      setEpisodes(response.data?.episodes || []);
    } catch (err) {
      console.error('Error carregant episodis:', err);
    }
  }, [type, tmdbId, season]);

  // Search torrents and auto-play best cached
  const searchTorrents = useCallback(async () => {
    setLoadingTorrents(true);
    setError(null);
    try {
      let url = `${API_URL}/api/debrid/torrents/${mediaType}/${tmdbId}`;
      if (mediaType === 'tv' && season && episode) {
        url += `?season=${season}&episode=${episode}`;
      }
      const response = await axios.get(url);
      const streams = response.data.streams || [];
      setTorrents(streams);

      // Auto-select best cached torrent (highest quality cached)
      const cachedTorrents = streams.filter(t => t.cached);
      if (cachedTorrents.length > 0) {
        // Sort by quality
        const qualityOrder = { '4K': 0, '2160p': 0, '1080p': 1, '720p': 2 };
        cachedTorrents.sort((a, b) => {
          const qA = parseQuality(a.name);
          const qB = parseQuality(b.name);
          return (qualityOrder[qA] ?? 99) - (qualityOrder[qB] ?? 99);
        });
        setSelectedTorrent(cachedTorrents[0]);
      } else if (streams.length > 0) {
        // No cached, show selection menu
        setShowQualityMenu(true);
      }
    } catch (err) {
      console.error('Error buscant torrents:', err);
      setError(err.response?.data?.detail || 'Error buscant torrents');
    } finally {
      setLoadingTorrents(false);
    }
  }, [mediaType, tmdbId, season, episode]);

  // Get stream URL from selected torrent
  const getStreamUrl = useCallback(async (torrent, keepTime = false) => {
    if (!torrent) return;

    // Save current time if switching streams
    if (keepTime && videoRef.current) {
      resumeTimeRef.current = videoRef.current.currentTime;
    }

    setLoadingStream(true);
    setError(null);
    setShowQualityMenu(false);

    try {
      const response = await axios.post(`${API_URL}/api/debrid/stream`, null, {
        params: {
          info_hash: torrent.info_hash,
          magnet: torrent.magnet
        }
      });

      if (response.data.status === 'success') {
        setStreamUrl(response.data.url);
      } else {
        setError('No s\'ha pogut obtenir el stream');
      }
    } catch (err) {
      console.error('Error obtenint stream:', err);
      setError(err.response?.data?.detail || 'Error obtenint stream');
    } finally {
      setLoadingStream(false);
    }
  }, []);

  // Change quality/language
  const changeTorrent = useCallback((quality, language) => {
    const group = groupedTorrents.find(g => g.quality === quality && g.language === language);
    if (!group) return;

    // Prefer cached torrent from the group
    const torrent = group.torrents.find(t => t.cached) || group.torrents[0];
    if (torrent && torrent.info_hash !== selectedTorrent?.info_hash) {
      setSelectedTorrent(torrent);
      setStreamUrl(null); // Reset to trigger new stream fetch
      getStreamUrl(torrent, true); // Keep current time
    }
    setShowQualityMenu(false);
  }, [groupedTorrents, selectedTorrent, getStreamUrl]);

  // Save progress to backend
  const saveProgress = useCallback(async (percent, completed = false) => {
    try {
      const currentEp = episodes.find(ep => ep.episode_number === episode);
      await axios.post(`${API_URL}/api/streaming/progress`, {
        tmdb_id: parseInt(tmdbId),
        media_type: type === 'movie' ? 'movie' : 'series',
        season_number: type !== 'movie' ? (season || 1) : null,
        episode_number: type !== 'movie' ? (episode || 1) : null,
        progress_percent: percent,
        completed: completed,
        title: mediaInfo?.title || mediaInfo?.name || '',
        poster_path: mediaInfo?.poster_path || null,
        backdrop_path: mediaInfo?.backdrop_path || null,
        still_path: currentEp?.still_path || null
      });
    } catch (err) {
      console.error('Error guardant progrés:', err);
    }
  }, [tmdbId, type, season, episode, mediaInfo, episodes]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    setCurrentTime(video.currentTime);

    // Update buffered
    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }

    // Auto-save progress every 30 seconds
    if (progressSaveTimeoutRef.current) {
      clearTimeout(progressSaveTimeoutRef.current);
    }
    progressSaveTimeoutRef.current = setTimeout(() => {
      const percent = Math.round((video.currentTime / video.duration) * 100);
      saveProgress(percent, false);
    }, 30000);
  }, [saveProgress]);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);

    // Resume from saved position if switching streams
    if (resumeTimeRef.current > 0) {
      videoRef.current.currentTime = resumeTimeRef.current;
      resumeTimeRef.current = 0;
    }
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    saveProgress(100, true);
  }, [saveProgress]);

  // Controls
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const seek = useCallback((time) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(time, duration));
  }, [duration]);

  const handleProgressClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(percent * duration);
  }, [duration, seek]);

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
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoRef.current.muted = newMuted;
  }, [isMuted]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const skipBack = useCallback(() => seek(currentTime - 10), [currentTime, seek]);
  const skipForward = useCallback(() => seek(currentTime + 30), [currentTime, seek]);

  // Hide controls after inactivity
  const handleMouseMove = useCallback(() => {
    setShowControls(true);

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (isPlaying && !showQualityMenu) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, showQualityMenu]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showQualityMenu) {
        if (e.key === 'Escape') {
          setShowQualityMenu(false);
        }
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipForward();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipBack, skipForward, toggleFullscreen, toggleMute, isFullscreen, showQualityMenu]);

  // Initial load
  useEffect(() => {
    if (!mediaInfo) loadMediaInfo();
    loadEpisodes();
    searchTorrents();
  }, [mediaInfo, loadMediaInfo, loadEpisodes, searchTorrents]);

  // Auto-get stream when torrent is selected
  useEffect(() => {
    if (selectedTorrent && !streamUrl && !loadingStream) {
      getStreamUrl(selectedTorrent);
    }
  }, [selectedTorrent, streamUrl, loadingStream, getStreamUrl]);

  // Fullscreen change detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Save progress on unmount
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video && duration > 0) {
        const percent = Math.round((video.currentTime / duration) * 100);
        if (percent > 5 && percent < 95) {
          const data = JSON.stringify({
            tmdb_id: parseInt(tmdbId),
            media_type: type === 'movie' ? 'movie' : 'series',
            season_number: type !== 'movie' ? (season || 1) : null,
            episode_number: type !== 'movie' ? (episode || 1) : null,
            progress_percent: percent,
            completed: false,
            title: mediaInfo?.title || mediaInfo?.name || ''
          });
          navigator.sendBeacon(`${API_URL}/api/streaming/progress`, data);
        }
      }
    };
  }, [tmdbId, type, season, episode, mediaInfo, duration]);

  const title = mediaInfo?.title || mediaInfo?.name || 'Carregant...';
  const subtitle = type !== 'movie' && season && episode
    ? `T${season} · E${episode}`
    : null;

  return (
    <div
      ref={containerRef}
      className={`debrid-player ${isFullscreen ? 'fullscreen' : ''} ${showControls ? 'show-controls' : ''}`}
      onMouseMove={handleMouseMove}
      onClick={() => !showQualityMenu && streamUrl && togglePlay()}
    >
      {/* Video element */}
      {streamUrl && (
        <video
          ref={videoRef}
          className="video-element"
          src={streamUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Loading overlay */}
      {(loadingTorrents || loadingStream) && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>{loadingTorrents ? 'Buscant fonts...' : 'Preparant stream...'}</p>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="error-overlay">
          <p>{error}</p>
          <button onClick={() => { setError(null); searchTorrents(); }}>
            Tornar a intentar
          </button>
        </div>
      )}

      {/* Quality/Language Menu */}
      {showQualityMenu && (
        <div className="quality-menu-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="quality-menu">
            <div className="quality-menu-header">
              <h3>Qualitat i idioma</h3>
              <button className="close-btn" onClick={() => setShowQualityMenu(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="quality-menu-content">
              {groupedTorrents.map((group, index) => (
                <div
                  key={index}
                  className={`quality-option ${
                    currentQuality === group.quality && currentLanguage === group.language ? 'active' : ''
                  } ${group.hasCached ? 'cached' : ''}`}
                  onClick={() => changeTorrent(group.quality, group.language)}
                >
                  <div className="quality-label">
                    <span className="quality-value">{group.quality}</span>
                    {group.hasCached && <span className="cached-icon">⚡</span>}
                  </div>
                  <div className="language-label">{group.language}</div>
                  <div className="torrent-count">{group.torrents.length} font{group.torrents.length > 1 ? 's' : ''}</div>
                </div>
              ))}
              {groupedTorrents.length === 0 && !loadingTorrents && (
                <div className="no-torrents">
                  No s'han trobat fonts disponibles
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="top-bar">
        <button className="back-button" onClick={() => navigate(-1)}>
          <BackIcon />
        </button>
        <div className="title-info">
          <h1>{title}</h1>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {/* Fallback to iframe player */}
        <button
          className="sources-button"
          onClick={() => {
            // Navigate to iframe player as fallback
            const streamUrl = mediaType === 'movie'
              ? `/stream/movie/${tmdbId}`
              : `/stream/tv/${tmdbId}?s=${season || 1}&e=${episode || 1}`;
            navigate(streamUrl);
          }}
          title="Reproductor alternatiu (iframe)"
        >
          <ExternalPlayerIcon />
        </button>
      </div>

      {/* Controls */}
      {streamUrl && (
        <div className="controls-container">
          {/* Progress bar */}
          <div className="progress-container" onClick={handleProgressClick}>
            <div className="progress-bar">
              <div
                className="progress-buffered"
                style={{ width: `${(buffered / duration) * 100}%` }}
              />
              <div
                className="progress-played"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
          </div>

          <div className="controls-row">
            {/* Left controls */}
            <div className="controls-left">
              <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); skipBack(); }} title="-10s">
                <SkipBackIcon />
              </button>
              <button onClick={(e) => { e.stopPropagation(); skipForward(); }} title="+30s">
                <SkipForwardIcon />
              </button>
              <div className="volume-control" onClick={(e) => e.stopPropagation()}>
                <button onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeMuteIcon /> : <VolumeIcon />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
              </div>
              <span className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right controls */}
            <div className="controls-right">
              {/* Quality indicator & button */}
              <button
                className="quality-button"
                onClick={(e) => { e.stopPropagation(); setShowQualityMenu(true); }}
                title="Canviar qualitat/idioma"
              >
                <span className="current-quality">{currentQuality || 'HD'}</span>
                <SettingsIcon />
              </button>
              <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}>
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DebridPlayer;
