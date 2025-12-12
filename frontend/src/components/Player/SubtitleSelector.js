import React, { useState } from 'react';
import { SubtitlesIcon, CheckIcon, CloseIcon } from '../icons';
import './SubtitleSelector.css';

/**
 * SubtitleSelector - Selector de subtítols
 * Permet activar/desactivar i canviar entre diferents pistes de subtítols
 */
function SubtitleSelector({ subtitleTracks, currentTrack, onTrackChange }) {
  const [isOpen, setIsOpen] = useState(false);

  const getTrackLabel = (track) => {
    if (!track) return 'Desactivats';

    const parts = [];

    if (track.language) {
      parts.push(track.language.toUpperCase());
    }

    if (track.label) {
      parts.push(track.label);
    } else if (track.kind) {
      parts.push(track.kind === 'subtitles' ? 'Subtítols' : track.kind);
    }

    return parts.join(' - ') || `Pista ${track.index + 1}`;
  };

  const handleTrackSelect = (trackIndex) => {
    onTrackChange(trackIndex);
    setIsOpen(false);
  };

  return (
    <div className="subtitle-selector">
      <button
        className="subtitle-selector__btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Seleccionar subtítols"
        aria-expanded={isOpen}
      >
        <SubtitlesIcon size={20} />
        <span className="subtitle-selector__label">
          {currentTrack !== null && currentTrack !== -1 ? 'CC' : 'Subtítols'}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="subtitle-selector__overlay"
            onClick={() => setIsOpen(false)}
          />
          <div className="subtitle-selector__menu">
            <div className="subtitle-selector__header">
              <SubtitlesIcon size={18} />
              <span>Selecciona subtítols</span>
            </div>

            <div className="subtitle-selector__list">
              {/* Opció per desactivar subtítols */}
              <button
                className={`subtitle-selector__option ${
                  currentTrack === null || currentTrack === -1 ? 'active' : ''
                }`}
                onClick={() => handleTrackSelect(null)}
              >
                <CloseIcon size={16} className="subtitle-selector__off-icon" />
                <span className="subtitle-selector__option-label">
                  Desactivats
                </span>
                {(currentTrack === null || currentTrack === -1) && (
                  <CheckIcon size={16} className="subtitle-selector__check" />
                )}
              </button>

              {/* Pistes de subtítols disponibles */}
              {subtitleTracks && subtitleTracks.map((track) => (
                <button
                  key={track.index}
                  className={`subtitle-selector__option ${
                    track.index === currentTrack ? 'active' : ''
                  }`}
                  onClick={() => handleTrackSelect(track.index)}
                >
                  <span className="subtitle-selector__option-label">
                    {getTrackLabel(track)}
                  </span>
                  {track.index === currentTrack && (
                    <CheckIcon size={16} className="subtitle-selector__check" />
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

export default SubtitleSelector;
