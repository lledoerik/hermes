import React from 'react';
import TitleAudioPlayer from '../TitleAudioPlayer';
import { StarIcon, PlayIcon, BookmarkIcon } from '../icons';
import { formatDuration } from '../../config/api';
import './DetailHeader.css';

/**
 * DetailHeader - Hero banner amb informació principal del contingut
 * Mostra backdrop, títol, metadades, overview, crèdits i botons d'acció
 */
function DetailHeader({
  item,
  type,
  seasons,
  backdropUrl,
  isPremium,
  isAdmin,
  streamReady,
  seriesProgress,
  isInWatchlist,
  watchlistLoading,
  onPlay,
  onToggleWatchlist,
  onEditMetadata,
  onExternalUrl,
  children // Per Watch Providers i Admin Tools
}) {
  if (!item) return null;

  return (
    <div className="detail-header">
      <div
        className="detail-header__backdrop"
        style={{ backgroundImage: backdropUrl ? `url(${backdropUrl})` : 'none' }}
      />
      <div className="detail-header__gradient" />

      <div className="detail-header__content">
        <div className="detail-header__info">
          {/* Títol amb text-to-speech */}
          <div className="detail-header__title-wrapper">
            <h1 className="detail-header__title">{item.title || item.name}</h1>
            <TitleAudioPlayer
              title={item.title || item.name}
              size="large"
            />
          </div>

          {/* Metadades: Any, Rating, Duració, Gèneres */}
          <div className="detail-header__meta">
            {item.year && (
              <span className="detail-header__meta-item">{item.year}</span>
            )}
            {item.rating && (
              <span className="detail-header__meta-item detail-header__rating">
                <StarIcon /> {item.rating.toFixed(1)}
              </span>
            )}
            {type === 'movies' && (item.runtime || item.duration) && (
              <span className="detail-header__meta-item">
                {formatDuration(item.runtime ? item.runtime * 60 : item.duration)}
              </span>
            )}
            {type === 'series' && seasons.length > 0 && (
              <span className="detail-header__meta-item">
                {seasons.length} temporades
              </span>
            )}
            {item.genres && Array.isArray(item.genres) && item.genres.length > 0 && (
              <span className="detail-header__meta-item detail-header__genres">
                {item.genres.map(g => typeof g === 'object' ? g.name : g).filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {/* Tagline */}
          {item.tagline && (
            <p className="detail-header__tagline">"{item.tagline}"</p>
          )}

          {/* Overview */}
          {item.overview && (
            <p className="detail-header__overview">{item.overview}</p>
          )}

          {/* Crèdits: Director/Creadors i Repartiment */}
          <div className="detail-header__credits">
            {/* Director (pel·lícules) o Creadors (sèries) */}
            {type === 'movies' && item.director && (
              <div className="detail-header__credit-section">
                <div className="detail-header__credit-title">Director</div>
                <div className="detail-header__credit-value">{item.director}</div>
              </div>
            )}
            {type === 'series' && item.creators && item.creators.length > 0 && (
              <div className="detail-header__credit-section">
                <div className="detail-header__credit-title">Creadors</div>
                <div className="detail-header__credit-value">{item.creators.join(', ')}</div>
              </div>
            )}

            {/* Repartiment principal */}
            {item.cast && item.cast.length > 0 && (
              <div className="detail-header__credit-section">
                <div className="detail-header__credit-title">Repartiment</div>
                <div className="detail-header__cast-grid">
                  {item.cast.slice(0, 6).map((c, i) => (
                    <div key={i} className="detail-header__cast-item">
                      <span className="detail-header__cast-name">{c.name}</span>
                      {c.character && (
                        <span className="detail-header__cast-character">{c.character}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Watch Providers (passat com children) */}
          {children}

          {/* Botons d'acció */}
          <div className="detail-header__actions">
            {/* Botó de reproducció */}
            {isPremium && (item?.has_file || item?.tmdb_id) && (
              <button
                className={`detail-header__play-btn ${!streamReady ? 'loading' : ''} ${
                  type === 'series' && seriesProgress?.hasProgress ? 'continue-mode' : ''
                }`}
                onClick={onPlay}
                disabled={!streamReady}
                aria-label={streamReady ? 'Reproduir contingut' : 'Preparant contingut'}
              >
                {!streamReady ? (
                  <>
                    <span className="detail-header__spinner"></span>
                    Preparant...
                  </>
                ) : (
                  <>
                    <PlayIcon />
                    {type === 'series' && seriesProgress?.hasProgress ? (
                      <span className="detail-header__play-text">
                        <span className="detail-header__play-action">Continuar</span>
                        <span className="detail-header__play-episode">
                          T{seriesProgress.season}:E{seriesProgress.episode}
                        </span>
                      </span>
                    ) : (
                      'Reproduir'
                    )}
                  </>
                )}
              </button>
            )}

            {/* Botó de watchlist */}
            <button
              className={`detail-header__watchlist-btn ${isInWatchlist ? 'active' : ''}`}
              onClick={onToggleWatchlist}
              disabled={watchlistLoading}
              title={isInWatchlist ? 'Eliminar de la llista' : 'Afegir a la llista'}
              aria-label={isInWatchlist ? 'Eliminar de la llista' : 'Afegir a la llista'}
            >
              <BookmarkIcon filled={isInWatchlist} />
              {isInWatchlist ? 'A la llista' : 'Afegir a la llista'}
            </button>

            {/* Botons d'admin */}
            {isAdmin && (
              <>
                <button
                  className="detail-header__admin-btn"
                  onClick={onEditMetadata}
                  title="Corregir metadades amb TMDB ID"
                  aria-label="Editar metadades"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button
                  className="detail-header__admin-btn"
                  onClick={onExternalUrl}
                  title="Afegir URL externa per veure online"
                  aria-label="Afegir URL externa"
                >
                  🔗
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DetailHeader;
