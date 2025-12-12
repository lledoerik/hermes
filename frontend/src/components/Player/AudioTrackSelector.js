import React, { useState } from 'react';
import { AudioIcon, CheckIcon } from '../icons';
import './AudioTrackSelector.css';

/**
 * AudioTrackSelector - Selector de pistes d'àudio
 * Permet canviar entre diferents pistes d'àudio disponibles
 */
function AudioTrackSelector({ audioTracks, currentTrack, onTrackChange }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!audioTracks || audioTracks.length <= 1) {
    return null;
  }

  const getTrackLabel = (track) => {
    const parts = [];

    if (track.language) {
      parts.push(track.language.toUpperCase());
    }

    if (track.label) {
      parts.push(track.label);
    } else if (track.kind) {
      parts.push(track.kind);
    }

    return parts.join(' - ') || `Pista ${track.index + 1}`;
  };

  return (
    <div className="audio-track-selector">
      <button
        className="audio-track-selector__btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Seleccionar pista d'àudio"
        aria-expanded={isOpen}
      >
        <AudioIcon size={20} />
        <span className="audio-track-selector__label">Àudio</span>
      </button>

      {isOpen && (
        <>
          <div
            className="audio-track-selector__overlay"
            onClick={() => setIsOpen(false)}
          />
          <div className="audio-track-selector__menu">
            <div className="audio-track-selector__header">
              <AudioIcon size={18} />
              <span>Selecciona pista d'àudio</span>
            </div>

            <div className="audio-track-selector__list">
              {audioTracks.map((track) => (
                <button
                  key={track.index}
                  className={`audio-track-selector__option ${
                    track.index === currentTrack ? 'active' : ''
                  }`}
                  onClick={() => {
                    onTrackChange(track.index);
                    setIsOpen(false);
                  }}
                >
                  <span className="audio-track-selector__option-label">
                    {getTrackLabel(track)}
                  </span>
                  {track.index === currentTrack && (
                    <CheckIcon size={16} className="audio-track-selector__check" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AudioTrackSelector;
