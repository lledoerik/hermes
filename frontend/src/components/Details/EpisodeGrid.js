import React from 'react';
import LazyImage from '../LazyImage';
import { PlayIcon } from '../icons';
import { formatDuration, getTmdbImageUrl } from '../../config/api';
import './EpisodeGrid.css';

/**
 * EpisodeGrid - Graella d'episodis amb thumbnails i informació
 * Mostra episodis d'una temporada amb thumbnails, títol, durada i progrés
 */
function EpisodeGrid({
  episodes,
  loading,
  isPremium,
  hasTmdbId,
  onEpisodeClick
}) {
  if (loading) {
    return (
      <div className="episode-grid__loading">
        <div className="episode-grid__loading-spinner"></div>
        <span>Carregant episodis...</span>
      </div>
    );
  }

  if (!episodes || episodes.length === 0) {
    return (
      <div className="episode-grid__empty">
        No hi ha episodis disponibles per aquesta temporada
      </div>
    );
  }

  return (
    <div className="episode-grid">
      {episodes.map((episode) => (
        <div
          key={episode.id || episode.episode_number}
          className={`episode-grid__card ${
            isPremium && hasTmdbId ? 'clickable' : ''
          }`}
          title={episode.overview || ''}
          onClick={() => onEpisodeClick?.(episode)}
          role={isPremium && hasTmdbId ? 'button' : undefined}
          tabIndex={isPremium && hasTmdbId ? 0 : undefined}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && isPremium && hasTmdbId) {
              e.preventDefault();
              onEpisodeClick?.(episode);
            }
          }}
        >
          {/* Thumbnail */}
          <div className="episode-grid__thumbnail">
            {episode.still_path ? (
              <LazyImage
                src={getTmdbImageUrl(episode.still_path, 'w300')}
                alt={episode.name}
                onError={(e) => {
                  e.target.style.display = 'none';
                  const fallback = e.target.parentElement?.querySelector('.episode-grid__number');
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}

            {/* Número d'episodi (fallback si no hi ha thumbnail) */}
            <span
              className="episode-grid__number"
              style={{ display: !episode.still_path ? 'flex' : 'none' }}
            >
              {episode.episode_number}
            </span>

            {/* Icona de play (només si és premium i té TMDB ID) */}
            {isPremium && hasTmdbId && (
              <div className="episode-grid__play-icon">
                <PlayIcon size={20} />
              </div>
            )}

            {/* Barra de progrés */}
            {episode.watch_progress > 0 && (
              <div className="episode-grid__progress">
                <div
                  className="episode-grid__progress-bar"
                  style={{ width: `${episode.watch_progress}%` }}
                  role="progressbar"
                  aria-valuenow={episode.watch_progress}
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
              </div>
            )}
          </div>

          {/* Informació de l'episodi */}
          <div className="episode-grid__info">
            <div className="episode-grid__title">
              <span className="episode-grid__name">
                {episode.episode_number}. {episode.name || `Episodi ${episode.episode_number}`}
              </span>
              {(episode.duration || episode.runtime) && (
                <span className="episode-grid__duration">
                  {formatDuration((episode.runtime || 0) * 60 || episode.duration)}
                </span>
              )}
            </div>

            {/* Overview (descripció) */}
            {episode.overview && (
              <div className="episode-grid__overview">
                {episode.overview}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default EpisodeGrid;
