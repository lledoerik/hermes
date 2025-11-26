import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL, API_ENDPOINTS, STORAGE_KEYS, DEFAULTS } from '../config';
import './Player.css';

// Opening detection constants (typical anime/series opening times)
const OPENING_START = 60; // Typically starts around 1 minute
const OPENING_END = 150; // Typically ends around 2:30

function Player() {
  const { mediaId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);

  const [media, setMedia] = useState(null);
  const [nextEpisode, setNextEpisode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streamUrl, setStreamUrl] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);

  // Track selection - can be changed during playback
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [selectedSubtitle, setSelectedSubtitle] = useState(null);
  const [quality, setQuality] = useState(
    localStorage.getItem(STORAGE_KEYS.quality) || DEFAULTS.quality
  );

  // Player controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(
    parseFloat(localStorage.getItem(STORAGE_KEYS.volume)) || DEFAULTS.volume
  );
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showTrackSelector, setShowTrackSelector] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Skip intro/opening state
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);

  // Keyboard shortcuts enabled
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const controlsTimeoutRef = useRef(null);
  const savedTimeRef = useRef(0);

  // Auto-play mode - start directly without asking for language
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    loadMediaInfo();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      // Save progress on unmount
      if (videoRef.current && currentTime > 0) {
        localStorage.setItem(`progress_${mediaId}`, currentTime.toString());
      }
    };
  }, [mediaId]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
    }
    localStorage.setItem(STORAGE_KEYS.volume, volume.toString());
  }, [volume, isMuted]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!streamUrl) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'arrowleft':
          e.preventDefault();
          skipTime(-10);
          break;
        case 'arrowright':
          e.preventDefault();
          skipTime(10);
          break;
        case 'j':
          e.preventDefault();
          skipTime(-10);
          break;
        case 'l':
          e.preventDefault();
          skipTime(10);
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume(prev => Math.min(1, prev + 0.1));
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(prev => Math.max(0, prev - 0.1));
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(prev => !prev);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 's':
          e.preventDefault();
          if (showSkipIntro) skipOpening();
          break;
        case 'n':
          e.preventDefault();
          if (showNextEpisode && nextEpisode) goToNextEpisode();
          break;
        case 'escape':
          setShowSettings(false);
          setShowTrackSelector(false);
          setShowShortcutsHelp(false);
          break;
        case '?':
          setShowShortcutsHelp(prev => !prev);
          break;
        default:
          // Speed controls
          if (e.key === '>' && e.shiftKey) {
            setPlaybackRate(prev => Math.min(2, prev + 0.25));
          } else if (e.key === '<' && e.shiftKey) {
            setPlaybackRate(prev => Math.max(0.25, prev - 0.25));
          }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [streamUrl, showSkipIntro, showNextEpisode, nextEpisode]);

  // Update playback rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const loadMediaInfo = async () => {
    try {
      const response = await axios.get(`${API_URL}${API_ENDPOINTS.mediaDetail(mediaId)}`);
      setMedia(response.data);

      // Set default audio based on preference (Catalan first)
      const preferredLang = localStorage.getItem(STORAGE_KEYS.audioLanguage) || DEFAULTS.audioLanguage;
      let bestAudioIndex = 0;

      if (response.data.audio_tracks) {
        const catIndex = response.data.audio_tracks.findIndex(t => t.language === 'cat');
        const preferredIndex = response.data.audio_tracks.findIndex(t => t.language === preferredLang);

        if (catIndex >= 0) {
          bestAudioIndex = catIndex;
        } else if (preferredIndex >= 0) {
          bestAudioIndex = preferredIndex;
        }
        setSelectedAudio(bestAudioIndex);
      }

      // Default: no subtitles (as per user preference)
      setSelectedSubtitle(null);

      // Load next episode if this is a series
      if (response.data.series_id && response.data.episode_number) {
        loadNextEpisode(response.data.series_id, response.data.season_number, response.data.episode_number);
      }

      // Load saved progress
      const savedProgress = localStorage.getItem(`progress_${mediaId}`);
      if (savedProgress) {
        savedTimeRef.current = parseFloat(savedProgress);
      }

      // AUTO-PLAY: Start streaming automatically with preferences (like Netflix)
      if (autoPlay) {
        startStreamAuto(bestAudioIndex, null, response.data);
      }
    } catch (err) {
      console.error('Error loading media:', err);
      setError('No s\'ha pogut carregar el contingut');
    } finally {
      setLoading(false);
    }
  };

  // Start stream automatically with given settings
  const startStreamAuto = async (audioIdx, subtitleIdx, mediaData) => {
    setPreparing(true);
    setError(null);

    try {
      const response = await axios.post(`${API_URL}${API_ENDPOINTS.streamHls(mediaId)}`, {
        audio_index: audioIdx,
        subtitle_index: subtitleIdx,
        quality: quality,
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
      setStreamUrl(`${API_URL}${response.data.playlist_url}`);
    } catch (err) {
      console.error('Error starting stream:', err);
      setError('Error iniciant el streaming');
    } finally {
      setPreparing(false);
    }
  };

  const loadNextEpisode = async (seriesId, seasonNum, episodeNum) => {
    try {
      const response = await axios.get(
        `${API_URL}${API_ENDPOINTS.seasonEpisodes(seriesId, seasonNum)}`
      );
      const episodes = response.data;
      const nextEp = episodes.find(ep => ep.episode_number === episodeNum + 1);
      if (nextEp) {
        setNextEpisode(nextEp);
      }
    } catch (err) {
      console.error('Error loading next episode:', err);
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

  // Change audio/subtitle during playback - maintains position
  const changeTrack = async (type, index) => {
    const newAudioIdx = type === 'audio' ? index : selectedAudio;
    const newSubtitleIdx = type === 'subtitle' ? index : selectedSubtitle;

    if (type === 'audio') {
      setSelectedAudio(index);
      // Save preference
      const track = media?.audio_tracks?.[index];
      if (track?.language) {
        localStorage.setItem(STORAGE_KEYS.audioLanguage, track.language);
      }
    } else {
      setSelectedSubtitle(index);
    }

    // Save current time BEFORE changing anything
    const currentPos = videoRef.current?.currentTime || 0;
    const wasPlaying = isPlaying;

    // Set the saved time ref so it will be restored after loading
    savedTimeRef.current = currentPos;

    // Show loading overlay
    setPreparing(true);

    try {
      const response = await axios.post(`${API_URL}${API_ENDPOINTS.streamHls(mediaId)}`, {
        audio_index: newAudioIdx,
        subtitle_index: newSubtitleIdx,
        quality: quality,
      });

      // Wait for HLS to prepare
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Update stream URL - this will trigger video reload
      setStreamUrl(`${API_URL}${response.data.playlist_url}`);

      // The handleLoadedMetadata will restore the position from savedTimeRef
    } catch (err) {
      console.error('Error changing track:', err);
      setError('Error canviant la pista');
    } finally {
      setPreparing(false);
    }
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

  const skipTime = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    }
  };

  const skipOpening = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = OPENING_END;
      setShowSkipIntro(false);
    }
  };

  const goToNextEpisode = () => {
    if (nextEpisode) {
      navigate(`/play/${nextEpisode.id}`);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);

      // Check if we're in the opening zone
      if (time >= OPENING_START && time < OPENING_END) {
        setShowSkipIntro(true);
      } else {
        setShowSkipIntro(false);
      }

      // Check if near the end for next episode prompt
      if (duration > 0 && time >= duration - 30 && nextEpisode) {
        setShowNextEpisode(true);
      }

      // Update buffered
      if (videoRef.current.buffered.length > 0) {
        setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);

      // Resume from saved position
      if (savedTimeRef.current > 0) {
        videoRef.current.currentTime = savedTimeRef.current;
        savedTimeRef.current = 0;
      }
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
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleFullscreen = useCallback(() => {
    const container = playerContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowSettings(false);
        setShowTrackSelector(false);
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
        ref={playerContainerRef}
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
            onDoubleClick={toggleFullscreen}
            autoPlay
          />
        ) : (
          /* Pre-play / Loading screen */
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

              {/* Show loading when auto-playing */}
              {(preparing || autoPlay) && !error ? (
                <div className="auto-play-loading">
                  <div className="spinner"></div>
                  <p className="loading-text">Preparant reproducció...</p>
                  <p className="loading-subtext">
                    {media?.audio_tracks?.[selectedAudio]?.language === 'cat' ? 'Àudio en català' :
                     getLanguageName(media?.audio_tracks?.[selectedAudio]?.language || 'und')}
                    {selectedSubtitle === null ? ' • Sense subtítols' : ''}
                  </p>
                </div>
              ) : (
                /* Manual selection mode - shown only if autoPlay is disabled */
                <>
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
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                      Reproduir
                    </button>

                    <button
                      className="btn btn-secondary play-btn"
                      onClick={playDirect}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                      Directe
                    </button>
                  </div>

                  {/* Keyboard shortcuts hint */}
                  <p className="shortcuts-hint">Prem ? per veure les dreceres de teclat</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Back Button */}
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Skip Intro Button */}
        {showSkipIntro && streamUrl && (
          <button className="skip-intro-btn" onClick={skipOpening}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 4l10 8-10 8V4zM19 5h-2v14h2V5z" />
            </svg>
            Saltar intro
          </button>
        )}

        {/* Next Episode Button */}
        {showNextEpisode && nextEpisode && streamUrl && (
          <div className="next-episode-prompt">
            <span>Seguent episodi:</span>
            <button className="next-episode-btn" onClick={goToNextEpisode}>
              <span className="next-ep-title">
                {nextEpisode.title || `Episodi ${nextEpisode.episode_number}`}
              </span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 4l10 8-10 8V4zM19 5h-2v14h2V5z" />
              </svg>
            </button>
          </div>
        )}

        {/* Player Controls */}
        {streamUrl && (
          <div className="player-controls">
            {/* Progress Bar */}
            <div className="progress-container" onClick={handleSeek}>
              <div className="progress-bar">
                <div
                  className="progress-buffered"
                  style={{ width: `${(buffered / duration) * 100}%` }}
                />
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
                {/* Play/Pause */}
                <button className="control-btn" onClick={handlePlayPause} title="Play/Pausa (K o Espai)">
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

                {/* Skip -10s */}
                <button className="control-btn" onClick={() => skipTime(-10)} title="Retrocedir 10s (J o Fletxa esquerra)">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 8L8 12L12 16" />
                    <text x="14" y="14" fontSize="8" fill="currentColor" stroke="none">10</text>
                  </svg>
                </button>

                {/* Skip +10s */}
                <button className="control-btn" onClick={() => skipTime(10)} title="Avancar 10s (L o Fletxa dreta)">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 8L16 12L12 16" />
                    <text x="4" y="14" fontSize="8" fill="currentColor" stroke="none">10</text>
                  </svg>
                </button>

                {/* Volume */}
                <div className="volume-control">
                  <button className="control-btn" onClick={() => setIsMuted(!isMuted)} title="Silenciar (M)">
                    {isMuted || volume === 0 ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                      </svg>
                    ) : volume < 0.5 ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07" />
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
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                  />
                </div>

                <span className="time-display">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Center - Title */}
              <div className="controls-center">
                <span className="now-playing-title">
                  {media?.series_name && `${media.series_name} - `}
                  {media?.episode_number ? `E${media.episode_number}` : media?.title}
                </span>
              </div>

              {/* Right Controls */}
              <div className="controls-right">
                {/* Playback Speed */}
                <button
                  className={`control-btn speed-btn ${playbackRate !== 1 ? 'active' : ''}`}
                  onClick={() => setPlaybackRate(prev => prev === 2 ? 0.5 : prev + 0.25)}
                  title="Velocitat de reproduccio"
                >
                  {playbackRate}x
                </button>

                {/* Audio/Subtitle selector */}
                <button
                  className="control-btn"
                  onClick={() => {
                    setShowTrackSelector(!showTrackSelector);
                    setShowSettings(false);
                  }}
                  title="Audio i subtitols"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M6 10h4M6 14h8" />
                  </svg>
                </button>

                {/* Settings */}
                <button
                  className="control-btn"
                  onClick={() => {
                    setShowSettings(!showSettings);
                    setShowTrackSelector(false);
                  }}
                  title="Configuracio"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                </button>

                {/* Fullscreen */}
                <button className="control-btn" onClick={toggleFullscreen} title="Pantalla completa (F)">
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

        {/* Track Selector Panel */}
        {showTrackSelector && streamUrl && (
          <div className="track-panel glass">
            <h3>Audio i Subtitols</h3>

            {media?.audio_tracks && media.audio_tracks.length > 0 && (
              <div className="track-section">
                <h4>Audio</h4>
                <div className="track-list">
                  {media.audio_tracks.map((track, index) => (
                    <button
                      key={index}
                      className={`track-option ${selectedAudio === index ? 'active' : ''}`}
                      onClick={() => changeTrack('audio', index)}
                    >
                      <span className="track-lang">{getLanguageName(track.language)}</span>
                      <span className="track-codec">{track.codec}</span>
                      {selectedAudio === index && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {media?.subtitle_tracks && media.subtitle_tracks.length > 0 && (
              <div className="track-section">
                <h4>Subtitols</h4>
                <div className="track-list">
                  <button
                    className={`track-option ${selectedSubtitle === null ? 'active' : ''}`}
                    onClick={() => changeTrack('subtitle', null)}
                  >
                    <span className="track-lang">Sense subtitols</span>
                    {selectedSubtitle === null && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    )}
                  </button>
                  {media.subtitle_tracks.map((track, index) => (
                    <button
                      key={index}
                      className={`track-option ${selectedSubtitle === index ? 'active' : ''}`}
                      onClick={() => changeTrack('subtitle', index)}
                    >
                      <span className="track-lang">{getLanguageName(track.language)}</span>
                      <span className="track-codec">{track.codec}</span>
                      {selectedSubtitle === index && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="track-note">
              El canvi de pista pot trigar uns segons a aplicar-se.
            </p>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && streamUrl && (
          <div className="settings-panel glass">
            <h3>Configuracio</h3>

            <div className="settings-group">
              <label>Qualitat:</label>
              <select
                value={quality}
                onChange={(e) => {
                  setQuality(e.target.value);
                  localStorage.setItem(STORAGE_KEYS.quality, e.target.value);
                }}
                className="settings-select"
              >
                <option value="4k">4K (Original)</option>
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
              </select>
            </div>

            <div className="settings-group">
              <label>Velocitat:</label>
              <div className="speed-options">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                  <button
                    key={speed}
                    className={`speed-option ${playbackRate === speed ? 'active' : ''}`}
                    onClick={() => setPlaybackRate(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Help */}
        {showShortcutsHelp && (
          <div className="shortcuts-modal glass" onClick={() => setShowShortcutsHelp(false)}>
            <div className="shortcuts-content" onClick={e => e.stopPropagation()}>
              <h3>Dreceres de teclat</h3>
              <div className="shortcuts-grid">
                <div className="shortcut-item">
                  <kbd>Espai</kbd> / <kbd>K</kbd>
                  <span>Play / Pausa</span>
                </div>
                <div className="shortcut-item">
                  <kbd>J</kbd> / <kbd>Fletxa esquerra</kbd>
                  <span>Retrocedir 10s</span>
                </div>
                <div className="shortcut-item">
                  <kbd>L</kbd> / <kbd>Fletxa dreta</kbd>
                  <span>Avancar 10s</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Fletxa amunt</kbd>
                  <span>Pujar volum</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Fletxa avall</kbd>
                  <span>Baixar volum</span>
                </div>
                <div className="shortcut-item">
                  <kbd>M</kbd>
                  <span>Silenciar</span>
                </div>
                <div className="shortcut-item">
                  <kbd>F</kbd>
                  <span>Pantalla completa</span>
                </div>
                <div className="shortcut-item">
                  <kbd>S</kbd>
                  <span>Saltar intro</span>
                </div>
                <div className="shortcut-item">
                  <kbd>N</kbd>
                  <span>Seguent episodi</span>
                </div>
                <div className="shortcut-item">
                  <kbd>&lt;</kbd> / <kbd>&gt;</kbd>
                  <span>Canviar velocitat</span>
                </div>
              </div>
              <button className="close-shortcuts" onClick={() => setShowShortcutsHelp(false)}>
                Tancar
              </button>
            </div>
          </div>
        )}

        {/* Loading overlay when changing tracks */}
        {preparing && streamUrl && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>Canviant pista...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Player;
