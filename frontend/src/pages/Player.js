import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Player.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
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
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="14" y="14" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">10</text>
  </svg>
);

const SkipForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="6" y="14" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">10</text>
  </svg>
);

const VolumeHighIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
);

const VolumeLowIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
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

const SubtitlesIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/>
  </svg>
);

const AudioIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
  </svg>
);

const SpeedIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 8v8l6-4-6-4zm11-5H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
  </svg>
);

const QualityIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 12H9.5v-2h-2v2H6V9h1.5v2.5h2V9H11v6zm2-6h4c.55 0 1 .45 1 1v4c0 .55-.45 1-1 1h-4V9zm1.5 4.5h2v-3h-2v3z"/>
  </svg>
);

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
  </svg>
);

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

  // Popup states
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Track selections
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [quality, setQuality] = useState('auto');

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const qualities = ['auto', '1080p', '720p', '480p', '360p'];

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

  const closeAllMenus = () => {
    setShowAudioMenu(false);
    setShowSubtitleMenu(false);
    setShowSpeedMenu(false);
    setShowQualityMenu(false);
  };

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        closeAllMenus();
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

    if (videoRef.current.buffered.length > 0) {
      setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  const calculateTimeFromEvent = (e) => {
    if (!progressRef.current || !duration) return 0;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return percent * duration;
  };

  const handleProgressMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const newTime = calculateTimeFromEvent(e);
    setDragTime(newTime);
  };

  const handleProgressMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const newTime = calculateTimeFromEvent(e);
    setDragTime(newTime);
  }, [isDragging, duration]);

  const handleProgressMouseUp = useCallback((e) => {
    if (!isDragging || !videoRef.current) return;
    setIsDragging(false);
    const newTime = calculateTimeFromEvent(e);
    videoRef.current.currentTime = newTime;
  }, [isDragging, duration]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleProgressMouseMove);
      document.addEventListener('mouseup', handleProgressMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleProgressMouseMove);
        document.removeEventListener('mouseup', handleProgressMouseUp);
      };
    }
  }, [isDragging, handleProgressMouseMove, handleProgressMouseUp]);

  const handleProgressClick = (e) => {
    if (!progressRef.current || !videoRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = percent * duration;
  };

  const skip = (seconds) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
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
    if (audioTracks[index]?.language) {
      localStorage.setItem('hermes_audio_lang', audioTracks[index].language.toLowerCase());
    }
    setShowAudioMenu(false);
  };

  const handleSubtitleChange = (index) => {
    setSelectedSubtitle(index);
    if (index === -1) {
      localStorage.setItem('hermes_subtitle_lang', 'off');
    } else if (subtitleTracks[index]?.language) {
      localStorage.setItem('hermes_subtitle_lang', subtitleTracks[index].language.toLowerCase());
    }
    setShowSubtitleMenu(false);
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const handleQualityChange = (q) => {
    setQuality(q);
    setShowQualityMenu(false);
  };

  const getVideoUrl = () => {
    if (type === 'episode') {
      return `${API_URL}/api/stream/episode/${id}`;
    }
    return `${API_URL}/api/stream/movie/${id}`;
  };

  const VolumeIcon = () => {
    if (isMuted || volume === 0) return <VolumeMuteIcon />;
    if (volume > 0.5) return <VolumeHighIcon />;
    return <VolumeLowIcon />;
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
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeAllMenus();
        }
        showControlsTemporarily();
      }}
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
              <BackIcon />
              <span>Tornar</span>
            </button>
            <div className="player-title">
              <h2>{item?.name || 'Reproduint'}</h2>
              {item?.series_name && (
                <span>{item.series_name} - T{item.season_number} E{item.episode_number}</span>
              )}
            </div>
            <div style={{ width: '100px' }}></div>
          </div>

          {/* Center Controls */}
          <div className="player-center">
            <button className="center-btn skip-btn" onClick={() => skip(-10)}>
              <SkipBackIcon />
            </button>
            <button className="center-btn play-pause-btn" onClick={togglePlay}>
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button className="center-btn skip-btn" onClick={() => skip(10)}>
              <SkipForwardIcon />
            </button>
          </div>

          {/* Bottom Bar */}
          <div className="player-bottom-bar">
            {/* Progress Bar */}
            <div className="progress-container">
              <div
                ref={progressRef}
                className={`progress-bar ${isDragging ? 'dragging' : ''}`}
                onMouseDown={handleProgressMouseDown}
                onClick={handleProgressClick}
              >
                <div
                  className="progress-buffered"
                  style={{ width: `${(buffered / duration) * 100}%` }}
                />
                <div
                  className="progress-played"
                  style={{ width: `${((isDragging ? dragTime : currentTime) / duration) * 100}%` }}
                />
                <div
                  className="progress-handle"
                  style={{ left: `${((isDragging ? dragTime : currentTime) / duration) * 100}%` }}
                />
              </div>
              <div className="time-display">
                <span>{formatTime(isDragging ? dragTime : currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Bottom Controls Row */}
            <div className="bottom-controls">
              <div className="left-controls">
                <button className="control-btn" onClick={togglePlay}>
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button className="control-btn" onClick={() => skip(-10)}>
                  <SkipBackIcon />
                </button>
                <button className="control-btn" onClick={() => skip(10)}>
                  <SkipForwardIcon />
                </button>
                <div className="volume-control">
                  <button className="control-btn" onClick={toggleMute}>
                    <VolumeIcon />
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
                {/* Speed Button */}
                <div className="control-wrapper">
                  <button
                    className={`control-btn ${showSpeedMenu ? 'active' : ''}`}
                    onClick={() => {
                      closeAllMenus();
                      setShowSpeedMenu(!showSpeedMenu);
                    }}
                    title="Velocitat"
                  >
                    <SpeedIcon />
                    {playbackSpeed !== 1 && (
                      <span className="control-badge">{playbackSpeed}x</span>
                    )}
                  </button>
                  {showSpeedMenu && (
                    <div className="control-menu">
                      <div className="menu-header">Velocitat</div>
                      {speeds.map((speed) => (
                        <div
                          key={speed}
                          className={`menu-item ${playbackSpeed === speed ? 'selected' : ''}`}
                          onClick={() => handleSpeedChange(speed)}
                        >
                          {playbackSpeed === speed && <span className="check-icon">&#10003;</span>}
                          <span>{speed === 1 ? 'Normal' : `${speed}x`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quality Button */}
                <div className="control-wrapper">
                  <button
                    className={`control-btn ${showQualityMenu ? 'active' : ''}`}
                    onClick={() => {
                      closeAllMenus();
                      setShowQualityMenu(!showQualityMenu);
                    }}
                    title="Qualitat"
                  >
                    <QualityIcon />
                  </button>
                  {showQualityMenu && (
                    <div className="control-menu">
                      <div className="menu-header">Qualitat</div>
                      {qualities.map((q) => (
                        <div
                          key={q}
                          className={`menu-item ${quality === q ? 'selected' : ''}`}
                          onClick={() => handleQualityChange(q)}
                        >
                          {quality === q && <span className="check-icon">&#10003;</span>}
                          <span>{q === 'auto' ? 'Auto' : q}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Audio Button */}
                <div className="control-wrapper">
                  <button
                    className={`control-btn ${showAudioMenu ? 'active' : ''}`}
                    onClick={() => {
                      closeAllMenus();
                      setShowAudioMenu(!showAudioMenu);
                    }}
                    title="Audio"
                  >
                    <AudioIcon />
                  </button>
                  {showAudioMenu && (
                    <div className="control-menu">
                      <div className="menu-header">Audio</div>
                      {audioTracks.length > 0 ? (
                        audioTracks.map((track, index) => (
                          <div
                            key={index}
                            className={`menu-item ${selectedAudio === index ? 'selected' : ''}`}
                            onClick={() => handleAudioChange(index)}
                          >
                            {selectedAudio === index && <span className="check-icon">&#10003;</span>}
                            <div className="track-info">
                              <span className="track-name">{track.language || `Pista ${index + 1}`}</span>
                              {track.codec && (
                                <span className="track-detail">
                                  {track.codec} {track.channels ? `${track.channels}ch` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="menu-item disabled">No hi ha pistes alternatives</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Subtitles Button */}
                <div className="control-wrapper">
                  <button
                    className={`control-btn ${showSubtitleMenu ? 'active' : ''} ${selectedSubtitle >= 0 ? 'has-selection' : ''}`}
                    onClick={() => {
                      closeAllMenus();
                      setShowSubtitleMenu(!showSubtitleMenu);
                    }}
                    title="Subtitols"
                  >
                    <SubtitlesIcon />
                  </button>
                  {showSubtitleMenu && (
                    <div className="control-menu">
                      <div className="menu-header">Subtitols</div>
                      <div
                        className={`menu-item ${selectedSubtitle === -1 ? 'selected' : ''}`}
                        onClick={() => handleSubtitleChange(-1)}
                      >
                        {selectedSubtitle === -1 && <span className="check-icon">&#10003;</span>}
                        <span>Desactivats</span>
                      </div>
                      {subtitleTracks.map((track, index) => (
                        <div
                          key={index}
                          className={`menu-item ${selectedSubtitle === index ? 'selected' : ''}`}
                          onClick={() => handleSubtitleChange(index)}
                        >
                          {selectedSubtitle === index && <span className="check-icon">&#10003;</span>}
                          <div className="track-info">
                            <span className="track-name">{track.language || `Subtitol ${index + 1}`}</span>
                            {track.forced && <span className="track-detail">Forcat</span>}
                          </div>
                        </div>
                      ))}
                      {subtitleTracks.length === 0 && (
                        <div className="menu-item disabled">No hi ha subtitols</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Fullscreen Button */}
                <button className="control-btn" onClick={toggleFullscreen}>
                  {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
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
