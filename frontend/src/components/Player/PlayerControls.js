import React from 'react';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon, FullscreenIcon, SettingsIcon } from '../icons';
import './PlayerControls.css';

/**
 * PlayerControls - Controls de reproducció per al video player
 * Inclou: play/pause, seek bar, volum, fullscreen, velocitat
 */
function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  playbackRate,
  buffered,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onPlaybackRateChange,
  onFullscreen,
  formatTime
}) {
  const [showVolumeSlider, setShowVolumeSlider] = React.useState(false);
  const [showPlaybackRate, setShowPlaybackRate] = React.useState(false);

  const playbackRates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  const getBufferedPercentage = () => {
    if (!buffered || !duration) return 0;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
        return (buffered.end(i) / duration) * 100;
      }
    }
    return 0;
  };

  return (
    <div className="player-controls">
      {/* Progress Bar */}
      <div className="player-controls__progress-container">
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="player-controls__progress"
          aria-label="Posició de reproducció"
        />
        <div className="player-controls__progress-bg">
          <div
            className="player-controls__progress-buffered"
            style={{ width: `${getBufferedPercentage()}%` }}
          />
          <div
            className="player-controls__progress-filled"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>
      </div>

      {/* Controls Bar */}
      <div className="player-controls__bar">
        <div className="player-controls__left">
          {/* Play/Pause */}
          <button
            className="player-controls__btn"
            onClick={onPlayPause}
            aria-label={isPlaying ? 'Pausar' : 'Reproduir'}
          >
            {isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
          </button>

          {/* Time */}
          <div className="player-controls__time">
            <span>{formatTime(currentTime)}</span>
            <span className="player-controls__time-separator">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="player-controls__right">
          {/* Volume */}
          <div
            className="player-controls__volume"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button
              className="player-controls__btn"
              onClick={onMuteToggle}
              aria-label={isMuted ? 'Activar so' : 'Silenciar'}
            >
              {isMuted || volume === 0 ? (
                <VolumeOffIcon size={24} />
              ) : (
                <VolumeIcon size={24} />
              )}
            </button>

            {showVolumeSlider && (
              <div className="player-controls__volume-slider">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="player-controls__volume-input"
                  aria-label="Volum"
                />
              </div>
            )}
          </div>

          {/* Playback Rate */}
          <div className="player-controls__playback-rate">
            <button
              className="player-controls__btn"
              onClick={() => setShowPlaybackRate(!showPlaybackRate)}
              aria-label="Velocitat de reproducció"
            >
              <SettingsIcon size={20} />
              <span className="player-controls__playback-rate-text">
                {playbackRate}x
              </span>
            </button>

            {showPlaybackRate && (
              <div className="player-controls__playback-rate-menu">
                {playbackRates.map((rate) => (
                  <button
                    key={rate}
                    className={`player-controls__playback-rate-option ${
                      rate === playbackRate ? 'active' : ''
                    }`}
                    onClick={() => {
                      onPlaybackRateChange(rate);
                      setShowPlaybackRate(false);
                    }}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            className="player-controls__btn"
            onClick={onFullscreen}
            aria-label="Pantalla completa"
          >
            <FullscreenIcon size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default PlayerControls;
