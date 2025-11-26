import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Player.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : `http://${window.location.hostname}:8000`;

axios.defaults.baseURL = API_URL;

function Player() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressRef = useRef(null);

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState('main');

  // Track selections
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);

  // Preferences from localStorage
  const preferredAudioLang = localStorage.getItem('hermes_audio_lang') || 'cat';
  const preferredSubtitleLang = localStorage.getItem('hermes_subtitle_lang') || 'off';

  useEffect(() => {
    loadMedia();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [type, id]);

  const loadMedia = async () => {
    try {
      let response;
      if (type === 'episode') {
        response = await axios.get(`/api/library/episodes/${id}`);
      } else {
        response = await axios.get(`/api/library/movies/${id}`);
      }
      setItem(response.data);

      // Parse audio tracks
      if (response.data.audio_tracks) {
        try {
          const tracks = JSON.parse(response.data.audio_tracks);
          setAudioTracks(tracks);
          // Auto-select preferred language
          const preferredIndex = tracks.findIndex(t =>
            t.language?.toLowerCase().includes(preferredAudioLang)
          );
          if (preferredIndex >= 0) setSelectedAudio(preferredIndex);
        } catch (e) {
          console.error('Error parsing audio tracks:', e);
        }
      }

      // Parse subtitles
      if (response.data.subtitles) {
        try {
          const subs = JSON.parse(response.data.subtitles);
          setSubtitleTracks(subs);
          if (preferredSubtitleLang !== 'off') {
            const preferredIndex = subs.findIndex(s =>
              s.language?.toLowerCase().includes(preferredSubtitleLang)
            );
            if (preferredIndex >= 0) setSelectedSubtitle(preferredIndex);
          }
        } catch (e) {
          console.error('Error parsing subtitles:', e);
        }
      }
    } catch (error) {
      console.error('Error carregant media:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFullscreenChange = () => {
    setIsFullscreen(!!document.fullscreenElement);
  };

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

  const handleMouseMove = () => {
    showControlsTemporarily();
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const handleVideoPlay = () => setIsPlaying(true);
  const handleVideoPause = () => setIsPlaying(false);
  const handleVideoWaiting = () => setVideoLoading(true);
  const handleVideoCanPlay = () => setVideoLoading(false);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);

    // Update buffered
    if (videoRef.current.buffered.length > 0) {
      setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleProgressClick = (e) => {
    if (!progressRef.current || !videoRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = percent * duration;
  };

  const skip = (seconds) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime += seconds;
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
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

  const handleBack = () => {
    if (item?.series_id) {
      navigate(`/series/${item.series_id}`);
    } else {
      navigate(-1);
    }
  };

  const handleAudioChange = (index) => {
    setSelectedAudio(index);
    // In a real implementation, this would switch the audio track
    // For now we just save the preference
    if (audioTracks[index]?.language) {
      localStorage.setItem('hermes_audio_lang', audioTracks[index].language.toLowerCase());
    }
    setSettingsView('main');
  };

  const handleSubtitleChange = (index) => {
    setSelectedSubtitle(index);
    if (index === -1) {
      localStorage.setItem('hermes_subtitle_lang', 'off');
    } else if (subtitleTracks[index]?.language) {
      localStorage.setItem('hermes_subtitle_lang', subtitleTracks[index].language.toLowerCase());
    }
    setSettingsView('main');
  };

  const getVideoUrl = () => {
    if (type === 'episode') {
      return `${API_URL}/api/stream/episode/${id}`;
    }
    return `${API_URL}/api/stream/movie/${id}`;
  };

  if (loading) {
    return (
      <div className="player-container">
        <div className="player-loading">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="player-container"
      onMouseMove={handleMouseMove}
      onClick={showControlsTemporarily}
    >
      <div className="player-wrapper">
        <video
          ref={videoRef}
          className="video-player"
          src={getVideoUrl()}
          autoPlay
          onPlay={handleVideoPlay}
          onPause={handleVideoPause}
          onWaiting={handleVideoWaiting}
          onCanPlay={handleVideoCanPlay}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onClick={togglePlay}
        />

        {videoLoading && (
          <div className="player-loading">
            <div className="loading-spinner"></div>
          </div>
        )}

        <div className={`player-controls ${showControls ? 'visible' : 'hidden'}`}>
          {/* Top Bar */}
          <div className="player-top-bar">
            <button className="back-btn" onClick={handleBack}>
              ← Tornar
            </button>
            <div className="player-title">
              <h2>{item?.name || 'Reproduint'}</h2>
              {item?.series_name && (
                <span>{item.series_name} · T{item.season_number} E{item.episode_number}</span>
              )}
            </div>
            <div style={{ width: '100px' }}></div>
          </div>

          {/* Center Controls */}
          <div className="player-center">
            <button className="center-btn skip-btn" onClick={() => skip(-10)}>
              ⏪
            </button>
            <button className="center-btn play-pause-btn" onClick={togglePlay}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="center-btn skip-btn" onClick={() => skip(10)}>
              ⏩
            </button>
          </div>

          {/* Bottom Bar */}
          <div className="player-bottom-bar">
            {/* Progress Bar */}
            <div className="progress-container">
              <div
                ref={progressRef}
                className="progress-bar"
                onClick={handleProgressClick}
              >
                <div
                  className="progress-buffered"
                  style={{ width: `${(buffered / duration) * 100}%` }}
                />
                <div
                  className="progress-played"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                <div
                  className="progress-handle"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>
              <div className="time-display">
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Bottom Controls Row */}
            <div className="bottom-controls">
              <div className="left-controls">
                <button className="control-btn" onClick={togglePlay}>
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button className="control-btn" onClick={() => skip(-10)}>
                  ⏪
                </button>
                <button className="control-btn" onClick={() => skip(10)}>
                  ⏩
                </button>
                <div className="volume-control">
                  <button className="control-btn" onClick={toggleMute}>
                    {isMuted || volume === 0 ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
                  </button>
                  <div className="volume-slider">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                    />
                  </div>
                </div>
              </div>

              <div className="right-controls">
                {/* Settings Button */}
                <div style={{ position: 'relative' }}>
                  <button
                    className="control-btn"
                    onClick={() => {
                      setShowSettings(!showSettings);
                      setSettingsView('main');
                    }}
                  >
                    ⚙️
                  </button>

                  {showSettings && (
                    <div className="settings-popup">
                      {settingsView === 'main' && (
                        <>
                          <div className="settings-header">
                            <h3>Configuració</h3>
                          </div>
                          <div className="settings-content">
                            <div
                              className="settings-option"
                              onClick={() => setSettingsView('audio')}
                            >
                              <span>🔊 Àudio</span>
                              <span>{audioTracks[selectedAudio]?.language || 'Per defecte'} →</span>
                            </div>
                            <div
                              className="settings-option"
                              onClick={() => setSettingsView('subtitles')}
                            >
                              <span>💬 Subtítols</span>
                              <span>
                                {selectedSubtitle === -1
                                  ? 'Desactivats'
                                  : subtitleTracks[selectedSubtitle]?.language || 'Activats'} →
                              </span>
                            </div>
                            <div className="settings-option">
                              <span>🎬 Qualitat</span>
                              <span>Auto →</span>
                            </div>
                            <div className="settings-option">
                              <span>⏱️ Velocitat</span>
                              <span>1x →</span>
                            </div>
                          </div>
                        </>
                      )}

                      {settingsView === 'audio' && (
                        <>
                          <div className="settings-header">
                            <button
                              className="settings-back-btn"
                              onClick={() => setSettingsView('main')}
                            >
                              ←
                            </button>
                            <h3>Àudio</h3>
                          </div>
                          <div className="settings-content">
                            {audioTracks.map((track, index) => (
                              <div
                                key={index}
                                className={`track-item ${selectedAudio === index ? 'selected' : ''}`}
                                onClick={() => handleAudioChange(index)}
                              >
                                {selectedAudio === index && <span className="check">✓</span>}
                                <div className="track-info">
                                  <div className="track-name">{track.language || `Pista ${index + 1}`}</div>
                                  <div className="track-detail">
                                    {track.codec || ''} {track.channels ? `· ${track.channels}ch` : ''}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {audioTracks.length === 0 && (
                              <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                                No hi ha pistes d'àudio alternatives
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {settingsView === 'subtitles' && (
                        <>
                          <div className="settings-header">
                            <button
                              className="settings-back-btn"
                              onClick={() => setSettingsView('main')}
                            >
                              ←
                            </button>
                            <h3>Subtítols</h3>
                          </div>
                          <div className="settings-content">
                            <div
                              className={`track-item ${selectedSubtitle === -1 ? 'selected' : ''}`}
                              onClick={() => handleSubtitleChange(-1)}
                            >
                              {selectedSubtitle === -1 && <span className="check">✓</span>}
                              <div className="track-info">
                                <div className="track-name">Desactivats</div>
                              </div>
                            </div>
                            {subtitleTracks.map((track, index) => (
                              <div
                                key={index}
                                className={`track-item ${selectedSubtitle === index ? 'selected' : ''}`}
                                onClick={() => handleSubtitleChange(index)}
                              >
                                {selectedSubtitle === index && <span className="check">✓</span>}
                                <div className="track-info">
                                  <div className="track-name">{track.language || `Subtítol ${index + 1}`}</div>
                                  <div className="track-detail">
                                    {track.codec || ''} {track.forced ? '· Forçat' : ''}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {subtitleTracks.length === 0 && (
                              <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                                No hi ha subtítols disponibles
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <button className="control-btn" onClick={toggleFullscreen}>
                  {isFullscreen ? '⛶' : '⛶'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Player;
