import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL, API_ENDPOINTS, STORAGE_KEYS, DEFAULTS } from '../config';
import './Player.css';

function Player() {
  const { mediaId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);

  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streamUrl, setStreamUrl] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);

  // Track selection
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [selectedSubtitle, setSelectedSubtitle] = useState(null);
  const [quality, setQuality] = useState(
    localStorage.getItem(STORAGE_KEYS.quality) || DEFAULTS.quality
  );

  // Player controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(
    parseFloat(localStorage.getItem(STORAGE_KEYS.volume)) || DEFAULTS.volume
  );
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const controlsTimeoutRef = useRef(null);

  useEffect(() => {
    loadMediaInfo();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [mediaId]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
    localStorage.setItem(STORAGE_KEYS.volume, volume.toString());
  }, [volume]);

  const loadMediaInfo = async () => {
    try {
      const response = await axios.get(`${API_URL}${API_ENDPOINTS.mediaDetail(mediaId)}`);
      setMedia(response.data);

      // Set default audio based on preference
      const preferredLang = localStorage.getItem(STORAGE_KEYS.audioLanguage) || DEFAULTS.audioLanguage;
      if (response.data.audio_tracks) {
        const preferredIndex = response.data.audio_tracks.findIndex(
          t => t.language === preferredLang
        );
        if (preferredIndex >= 0) {
          setSelectedAudio(preferredIndex);
        }
      }
    } catch (err) {
      console.error('Error loading media:', err);
      setError('No s\'ha pogut carregar el contingut');
    } finally {
      setLoading(false);
    }
  };

  const startStream = async () => {
    setPreparing(true);
    setError(null);

    try {
      const response = await axios.post(`${API_URL}${API_ENDPOINTS.streamHls(mediaId)}`, {
        audio_index: selectedAudio,
        subtitle_index: selectedSubtitle,
        quality: quality,
      });

      // Wait a moment for FFmpeg to generate initial segments
      await new Promise(resolve => setTimeout(resolve, 2000));

      setStreamUrl(`${API_URL}${response.data.playlist_url}`);
    } catch (err) {
      console.error('Error starting stream:', err);
      setError('Error iniciant el streaming');
    } finally {
      setPreparing(false);
    }
  };

  const playDirect = () => {
    setStreamUrl(`${API_URL}${API_ENDPOINTS.streamDirect(mediaId)}`);
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    if (videoRef.current) {
      videoRef.current.currentTime = pos * duration;
    }
  };

  const handleVolumeChange = (e) => {
    setVolume(parseFloat(e.target.value));
  };

  const toggleFullscreen = () => {
    const container = document.querySelector('.player-container');
    if (!document.fullscreenElement) {
      container.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

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

  const getLanguageName = (code) => {
    const languages = {
      cat: 'Catala',
      spa: 'Castella',
      eng: 'Angles',
      jpn: 'Japones',
      kor: 'Korea',
      fra: 'Frances',
      deu: 'Alemany',
      ita: 'Italia',
      por: 'Portugues',
      und: 'Desconegut',
    };
    return languages[code] || code || 'Desconegut';
  };

  if (loading) {
    return (
      <div className="player-page loading">
        <div className="spinner"></div>
        <p>Carregant...</p>
      </div>
    );
  }

  if (error && !streamUrl) {
    return (
      <div className="player-page error">
        <h2>{error}</h2>
        <button className="btn btn-primary" onClick={() => navigate(-1)}>
          Tornar
        </button>
      </div>
    );
  }

  return (
    <div className="player-page">
      <div
        className={`player-container ${showControls ? 'show-controls' : ''}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        {/* Video */}
        {streamUrl ? (
          <video
            ref={videoRef}
            className="video-element"
            src={streamUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={handlePlayPause}
            autoPlay
          />
        ) : (
          /* Pre-play screen */
          <div className="pre-play-screen">
            {media?.backdrop && (
              <img
                src={`${API_URL}${API_ENDPOINTS.backdrop(media.series_id || mediaId)}`}
                alt=""
                className="pre-play-backdrop"
              />
            )}
            <div className="pre-play-overlay"></div>

            <div className="pre-play-content">
              <h1 className="media-title">
                {media?.series_name || media?.title || 'Video'}
              </h1>
              {media?.episode_number && (
                <p className="episode-info">
                  Temporada {media.season_number} - Episodi {media.episode_number}
                </p>
              )}

              {/* Track Selection */}
              <div className="track-selection">
                {/* Audio Selection */}
                {media?.audio_tracks && media.audio_tracks.length > 0 && (
                  <div className="track-group">
                    <label>Audio:</label>
                    <select
                      value={selectedAudio}
                      onChange={(e) => setSelectedAudio(parseInt(e.target.value))}
                      className="track-select"
                    >
                      {media.audio_tracks.map((track, index) => (
                        <option key={index} value={index}>
                          {getLanguageName(track.language)}
                          {track.title && ` - ${track.title}`}
                          ({track.codec})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Subtitle Selection */}
                {media?.subtitle_tracks && media.subtitle_tracks.length > 0 && (
                  <div className="track-group">
                    <label>Subtitols:</label>
                    <select
                      value={selectedSubtitle ?? ''}
                      onChange={(e) => setSelectedSubtitle(e.target.value === '' ? null : parseInt(e.target.value))}
                      className="track-select"
                    >
                      <option value="">Sense subtitols</option>
                      {media.subtitle_tracks.map((track, index) => (
                        <option key={index} value={index}>
                          {getLanguageName(track.language)}
                          ({track.codec})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Quality Selection */}
                <div className="track-group">
                  <label>Qualitat:</label>
                  <select
                    value={quality}
                    onChange={(e) => {
                      setQuality(e.target.value);
                      localStorage.setItem(STORAGE_KEYS.quality, e.target.value);
                    }}
                    className="track-select"
                  >
                    <option value="4k">4K (Original)</option>
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                  </select>
                </div>
              </div>

              {/* Play Buttons */}
              <div className="play-buttons">
                <button
                  className="btn btn-primary play-btn"
                  onClick={startStream}
                  disabled={preparing}
                >
                  {preparing ? (
                    <>
                      <div className="spinner small"></div>
                      Preparant...
                    </>
                  ) : (
                    <>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                      Reproduir (HLS)
                    </>
                  )}
                </button>

                <button
                  className="btn btn-secondary play-btn"
                  onClick={playDirect}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Directe (sense processar)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back Button */}
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Player Controls */}
        {streamUrl && (
          <div className="player-controls">
            {/* Progress Bar */}
            <div className="progress-container" onClick={handleSeek}>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                <div
                  className="progress-handle"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>
            </div>

            <div className="controls-row">
              {/* Left Controls */}
              <div className="controls-left">
                <button className="control-btn" onClick={handlePlayPause}>
                  {isPlaying ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  )}
                </button>

                <div className="volume-control">
                  <button className="control-btn" onClick={() => setVolume(volume > 0 ? 0 : 1)}>
                    {volume === 0 ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                  />
                </div>

                <span className="time-display">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Right Controls */}
              <div className="controls-right">
                <button
                  className="control-btn"
                  onClick={() => setShowSettings(!showSettings)}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                </button>

                <button className="control-btn" onClick={toggleFullscreen}>
                  {isFullscreen ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && streamUrl && (
          <div className="settings-panel glass">
            <h3>Configuracio</h3>
            <p className="settings-note">
              Per canviar l'audio o subtitols, torna enrere i selecciona de nou.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Player;
