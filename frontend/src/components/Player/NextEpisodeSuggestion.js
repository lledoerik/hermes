import React, { useState, useEffect } from 'react';
import { PlayIcon, CloseIcon } from '../icons';
import './NextEpisodeSuggestion.css';

/**
 * NextEpisodeSuggestion - Suggeriment del següent episodi (estil Netflix)
 * Apareix automàticament als últims segons de l'episodi amb countdown
 */
function NextEpisodeSuggestion({
  nextEpisode,
  onPlayNext,
  onCancel,
  autoPlayDelay = 10, // segons
  visible = false
}) {
  const [countdown, setCountdown] = useState(autoPlayDelay);
  const [isCancelled, setIsCancelled] = useState(false);

  useEffect(() => {
    if (!visible || isCancelled) return;

    setCountdown(autoPlayDelay);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onPlayNext();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, autoPlayDelay, onPlayNext, isCancelled]);

  const handleCancel = () => {
    setIsCancelled(true);
    onCancel();
  };

  const handlePlayNow = () => {
    setIsCancelled(true);
    onPlayNext();
  };

  if (!visible || !nextEpisode) return null;

  return (
    <div className="next-episode-suggestion">
      <div className="next-episode-suggestion__overlay" />

      <div className="next-episode-suggestion__content">
        <button
          className="next-episode-suggestion__close"
          onClick={handleCancel}
          aria-label="Cancel·lar reproducció automàtica"
        >
          <CloseIcon size={20} />
        </button>

        <div className="next-episode-suggestion__info">
          <div className="next-episode-suggestion__label">
            Següent episodi
          </div>

          <h3 className="next-episode-suggestion__title">
            {nextEpisode.season_number && nextEpisode.episode_number && (
              <span className="next-episode-suggestion__episode-number">
                T{nextEpisode.season_number} E{nextEpisode.episode_number}
              </span>
            )}
            {nextEpisode.name || nextEpisode.title}
          </h3>

          {nextEpisode.overview && (
            <p className="next-episode-suggestion__overview">
              {nextEpisode.overview.length > 120
                ? `${nextEpisode.overview.substring(0, 120)}...`
                : nextEpisode.overview}
            </p>
          )}
        </div>

        <div className="next-episode-suggestion__actions">
          <button
            className="next-episode-suggestion__play-btn"
            onClick={handlePlayNow}
          >
            <PlayIcon size={20} />
            <span>Reproduir ara</span>
          </button>

          <div className="next-episode-suggestion__countdown">
            <svg className="next-episode-suggestion__countdown-ring" viewBox="0 0 36 36">
              <circle
                className="next-episode-suggestion__countdown-ring-bg"
                cx="18"
                cy="18"
                r="16"
              />
              <circle
                className="next-episode-suggestion__countdown-ring-progress"
                cx="18"
                cy="18"
                r="16"
                style={{
                  strokeDashoffset: `${(countdown / autoPlayDelay) * 100}`,
                }}
              />
            </svg>
            <span className="next-episode-suggestion__countdown-text">
              {countdown}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NextEpisodeSuggestion;
