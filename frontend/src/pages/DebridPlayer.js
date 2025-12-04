import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-1.1 11H10v-3.3L9 13v-.7l1.8-.6h.1V16zm4.3-1.8c0 .3 0 .6-.1.8l-.3.6s-.3.3-.5.3-.4.1-.6.1-.4 0-.6-.1-.3-.2-.5-.3-.2-.3-.3-.6-.1-.5-.1-.8v-.7c0-.3 0-.6.1-.8l.3-.6s.3-.3.5-.3.4-.1.6-.1.4 0 .6.1.3.2.5.3.2.3.3.6.1.5.1.8v.7zm-.9-.8v-.5s-.1-.2-.1-.3-.1-.1-.2-.2-.2-.1-.3-.1-.2 0-.3.1l-.2.2s-.1.2-.1.3v2s.1.2.1.3.1.1.2.2.2.1.3.1.2 0 .3-.1l.2-.2s.1-.2.1-.3v-1.5z"/>
  </svg>
);

const SkipForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2zm-7.46 2.22c-.06.05-.12.09-.2.12s-.17.04-.27.04c-.09 0-.17-.01-.25-.04s-.14-.06-.2-.11-.1-.1-.13-.17-.05-.14-.05-.22h-.85c0 .21.04.39.12.55s.19.28.33.38.29.18.46.23.35.07.53.07c.21 0 .41-.03.6-.08s.34-.14.48-.24.24-.24.32-.39.12-.33.12-.53c0-.23-.06-.44-.18-.61s-.3-.3-.54-.39c.1-.05.2-.1.28-.17s.15-.14.2-.22.1-.16.13-.25.04-.18.04-.27c0-.2-.04-.37-.11-.52s-.17-.27-.3-.37-.28-.18-.46-.23-.37-.08-.59-.08c-.19 0-.38.03-.54.08s-.32.13-.44.23-.23.22-.3.37-.11.3-.11.48h.85c0-.07.02-.14.05-.2s.07-.11.12-.15.11-.07.18-.1.14-.03.22-.03c.1 0 .18.01.25.04s.13.06.18.11.08.11.11.17.04.14.04.22c0 .18-.05.32-.16.43s-.26.16-.48.16h-.43v.66h.45c.11 0 .2.01.29.04s.16.06.22.11.11.12.14.2.05.18.05.29c0 .09-.01.17-.04.24s-.08.13-.13.18zm3.9.01c-.06.05-.12.09-.2.12s-.17.04-.27.04c-.09 0-.17-.01-.25-.04s-.14-.06-.2-.11-.1-.1-.13-.17-.05-.14-.05-.22h-.85c0 .21.04.39.12.55s.19.28.33.38.29.18.46.23.35.07.53.07c.21 0 .41-.03.6-.08s.34-.14.48-.24.24-.24.32-.39.12-.33.12-.53c0-.23-.06-.44-.18-.61s-.3-.3-.54-.39c.1-.05.2-.1.28-.17s.15-.14.2-.22.1-.16.13-.25.04-.18.04-.27c0-.2-.04-.37-.11-.52s-.17-.27-.3-.37-.28-.18-.46-.23-.37-.08-.59-.08c-.19 0-.38.03-.54.08s-.32.13-.44.23-.23.22-.3.37-.11.3-.11.48h.85c0-.07.02-.14.05-.2s.07-.11.12-.15.11-.07.18-.1.14-.03.22-.03c.1 0 .18.01.25.04s.13.06.18.11.08.11.11.17.04.14.04.22c0 .18-.05.32-.16.43s-.26.16-.48.16h-.43v.66h.45c.11 0 .2.01.29.04s.16.06.22.11.11.12.14.2.05.18.05.29c0 .09-.01.17-.04.24s-.07.13-.12.18z"/>
  </svg>
);

const NextEpisodeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
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

function DebridPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressSaveTimeoutRef = useRef(null);

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
  const [showTorrentList, setShowTorrentList] = useState(true);

  const mediaType = type === 'movie' ? 'movie' : 'tv';

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

  // Search torrents
  const searchTorrents = useCallback(async () => {
    setLoadingTorrents(true);
    setError(null);
    try {
      let url = `${API_URL}/api/debrid/torrents/${mediaType}/${tmdbId}`;
      if (mediaType === 'tv' && season && episode) {
        url += `?season=${season}&episode=${episode}`;
      }
      const response = await axios.get(url);
      setTorrents(response.data.streams || []);

      // Auto-select first cached torrent if available
      const cached = response.data.streams.find(t => t.cached);
      if (cached) {
        setSelectedTorrent(cached);
      }
    } catch (err) {
      console.error('Error buscant torrents:', err);
      setError(err.response?.data?.detail || 'Error buscant torrents');
    } finally {
      setLoadingTorrents(false);
    }
  }, [mediaType, tmdbId, season, episode]);

  // Get stream URL from selected torrent
  const getStreamUrl = useCallback(async (torrent) => {
    if (!torrent) return;

    setLoadingStream(true);
    setError(null);
    setShowTorrentList(false);

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
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    saveProgress(100, true);
    // TODO: Auto-play next episode
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

    if (isPlaying && !showTorrentList) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, showTorrentList]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showTorrentList) return;

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
  }, [togglePlay, skipBack, skipForward, toggleFullscreen, toggleMute, isFullscreen, showTorrentList]);

  // Initial load
  useEffect(() => {
    if (!mediaInfo) loadMediaInfo();
    loadEpisodes();
    searchTorrents();
  }, [mediaInfo, loadMediaInfo, loadEpisodes, searchTorrents]);

  // Auto-get stream when torrent is selected
  useEffect(() => {
    if (selectedTorrent && !streamUrl) {
      getStreamUrl(selectedTorrent);
    }
  }, [selectedTorrent, streamUrl, getStreamUrl]);

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
    return () => {
      if (videoRef.current && duration > 0) {
        const percent = Math.round((videoRef.current.currentTime / duration) * 100);
        if (percent > 5 && percent < 95) {
          // Use sendBeacon for reliability
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
      onClick={() => !showTorrentList && togglePlay()}
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

      {/* Torrent selection */}
      {showTorrentList && !loadingTorrents && torrents.length > 0 && (
        <div className="torrent-list-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="torrent-list-container">
            <h2>Selecciona una font</h2>
            <p className="torrent-info">
              {torrents.filter(t => t.cached).length} de {torrents.length} disponibles instantàniament
            </p>
            <div className="torrent-list">
              {torrents.map((torrent, index) => (
                <div
                  key={torrent.info_hash || index}
                  className={`torrent-item ${torrent.cached ? 'cached' : ''} ${selectedTorrent?.info_hash === torrent.info_hash ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedTorrent(torrent);
                    setStreamUrl(null);
                  }}
                >
                  <div className="torrent-quality">
                    {torrent.quality || '??'}
                    {torrent.cached && <span className="cached-badge">⚡</span>}
                  </div>
                  <div className="torrent-details">
                    <span className="torrent-name">{torrent.name}</span>
                    <span className="torrent-meta">
                      {torrent.size && <span>{torrent.size}</span>}
                      {torrent.seeders && <span>👤 {torrent.seeders}</span>}
                      {torrent.source && <span>{torrent.source}</span>}
                    </span>
                  </div>
                </div>
              ))}
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
        <button className="sources-button" onClick={() => setShowTorrentList(!showTorrentList)}>
          <SettingsIcon />
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
              <button onClick={(e) => { e.stopPropagation(); skipBack(); }}>
                <SkipBackIcon />
              </button>
              <button onClick={(e) => { e.stopPropagation(); skipForward(); }}>
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
              {type !== 'movie' && (
                <button onClick={(e) => e.stopPropagation()}>
                  <NextEpisodeIcon />
                </button>
              )}
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
