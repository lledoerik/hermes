import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config/api';
import './DebridPlayer.css'; // Reutilitzem els estils del DebridPlayer

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

const SubtitlesIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/>
  </svg>
);

// BBC Logo icon
const BBCIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
    <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">BBC</text>
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

function BBCPlayer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Get URL from query params
  const bbcUrl = searchParams.get('url');
  const quality = searchParams.get('quality') || 'best';

  // Player state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);

  // Video playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState([]);

  // Fetch stream from BBC iPlayer
  useEffect(() => {
    if (!bbcUrl) {
      setError('No BBC iPlayer URL provided');
      setLoading(false);
      return;
    }

    const fetchStream = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await axios.get(`${API_URL}/api/bbc/stream`, {
          params: { url: bbcUrl, quality }
        });

        if (response.data.status === 'success') {
          setStreamUrl(response.data.url);
          setMetadata({
            title: response.data.title,
            description: response.data.description,
            thumbnail: response.data.thumbnail,
            duration: response.data.duration,
            season: response.data.season,
            episode: response.data.episode,
            subtitles: response.data.subtitles
          });

          // Process subtitles
          if (response.data.subtitles) {
            const tracks = Object.entries(response.data.subtitles).map(([lang, url]) => ({
              lang,
              url,
              label: lang === 'en' ? 'English' : lang
            }));
            setSubtitleTracks(tracks);
          }
        } else {
          setError('Failed to get stream');
        }
      } catch (err) {
        console.error('Error fetching BBC stream:', err);
        const errorMsg = err.response?.data?.detail || err.message || 'Error loading stream';
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchStream();
  }, [bbcUrl, quality]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleProgress = useCallback(() => {
    if (videoRef.current && videoRef.current.buffered.length > 0) {
      const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
      setBuffered((bufferedEnd / videoRef.current.duration) * 100);
    }
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setShowControls(true);
  }, []);

  // Control handlers
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  const seek = useCallback((value) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value;
      setCurrentTime(value);
    }
  }, []);

  const skipBack = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    }
  }, []);

  const skipForward = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10);
    }
  }, [duration]);

  const handleVolumeChange = useCallback((value) => {
    const newVolume = parseFloat(value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  // Auto-hide controls
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;

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
          } else {
            navigate(-1);
          }
          break;
        default:
          break;
      }
      showControlsTemporarily();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipBack, skipForward, toggleFullscreen, toggleMute, isFullscreen, navigate, showControlsTemporarily]);

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleGoBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Progress bar click handler
  const handleProgressClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    seek(newTime);
  }, [duration, seek]);

  // Render loading state
  if (loading) {
    return (
      <div className="debrid-player">
        <div className="player-loading">
          <div className="loading-spinner"></div>
          <p>Loading BBC iPlayer stream...</p>
          <p className="loading-subtitle">Requires UK IP address</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="debrid-player">
        <div className="player-error">
          <div className="error-icon">
            <BBCIcon />
          </div>
          <h2>BBC iPlayer Error</h2>
          <p>{error}</p>
          {error.includes('UK') || error.includes('country') ? (
            <p className="error-hint">
              BBC iPlayer is only available in the United Kingdom.
              You need a UK IP address to access this content.
            </p>
          ) : null}
          <button onClick={handleGoBack} className="back-button">
            <BackIcon /> Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`debrid-player ${showControls ? 'show-controls' : ''}`}
      onMouseMove={showControlsTemporarily}
      onClick={showControlsTemporarily}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={streamUrl}
        className="video-element"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={handleProgress}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onClick={togglePlay}
        autoPlay
        playsInline
      >
        {/* Subtitles */}
        {showSubtitles && subtitleTracks.map((track, idx) => (
          <track
            key={idx}
            kind="subtitles"
            src={track.url}
            srcLang={track.lang}
            label={track.label}
            default={idx === 0}
          />
        ))}
      </video>

      {/* Controls overlay */}
      <div className={`player-controls ${showControls ? 'visible' : ''}`}>
        {/* Top bar */}
        <div className="controls-top">
          <button className="control-btn back-btn" onClick={handleGoBack}>
            <BackIcon />
          </button>
          <div className="video-title">
            <span className="bbc-badge">BBC iPlayer</span>
            {metadata?.title || 'BBC Programme'}
            {metadata?.season && metadata?.episode && (
              <span className="episode-info">
                S{metadata.season}E{metadata.episode}
              </span>
            )}
          </div>
        </div>

        {/* Center play button */}
        <div className="controls-center" onClick={togglePlay}>
          {!isPlaying && (
            <button className="center-play-btn">
              <PlayIcon />
            </button>
          )}
        </div>

        {/* Bottom bar */}
        <div className="controls-bottom">
          {/* Progress bar */}
          <div className="progress-container" onClick={handleProgressClick}>
            <div className="progress-bar">
              <div className="progress-buffered" style={{ width: `${buffered}%` }} />
              <div className="progress-played" style={{ width: `${(currentTime / duration) * 100}%` }} />
            </div>
          </div>

          {/* Control buttons */}
          <div className="controls-buttons">
            <div className="controls-left">
              <button className="control-btn" onClick={togglePlay}>
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button className="control-btn" onClick={skipBack}>
                <SkipBackIcon />
              </button>
              <button className="control-btn" onClick={skipForward}>
                <SkipForwardIcon />
              </button>
              <div className="volume-control">
                <button className="control-btn" onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeMuteIcon /> : <VolumeIcon />}
                </button>
                <input
                  type="range"
                  className="volume-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(e.target.value)}
                />
              </div>
              <span className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="controls-right">
              {subtitleTracks.length > 0 && (
                <button
                  className={`control-btn ${showSubtitles ? 'active' : ''}`}
                  onClick={() => setShowSubtitles(!showSubtitles)}
                  title="Subtitles"
                >
                  <SubtitlesIcon />
                </button>
              )}
              <button className="control-btn" onClick={toggleFullscreen}>
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BBCPlayer;
