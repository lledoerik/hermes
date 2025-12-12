import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TitleAudioPlayer from './TitleAudioPlayer';
import LazyImage from './LazyImage';
import { useAuth } from '../context/AuthContext';
import { useBBC } from '../context/BBCContext';
import { getPosterUrl } from '../config/api';
import { TvIcon, MovieIcon, StarIcon, PlayIcon, InfoIcon } from './icons';
import './MediaCard.css';

function MediaCard({ item, type = 'series', width = 180, isTmdb = false }) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const navigate = useNavigate();
  const { isPremium } = useAuth();
  const { hasBbc } = useBBC();

  // Determinar si és contingut només de streaming (TMDB sense fitxers locals)
  const isStreamingOnly = isTmdb || item.is_tmdb;

  // Obtenir el tmdb_id per comprovar BBC
  const tmdbId = item.tmdb_id || (item.id && typeof item.id === 'string' && item.id.startsWith('tmdb-')
    ? parseInt(item.id.replace('tmdb-', ''), 10)
    : null);

  // Comprovar si té BBC disponible
  const contentType = type === 'movies' ? 'movie' : 'tv';
  const hasBbcContent = tmdbId ? hasBbc(tmdbId, contentType) : false;

  const handleClick = () => {
    // Sempre navegar a la pàgina de detalls
    navigate(`/${type}/${item.id}`);
  };

  const handlePlay = (e) => {
    e.stopPropagation();

    // Usuaris no premium sempre van a la pàgina de detalls
    if (!isPremium) {
      navigate(`/${type}/${item.id}`);
      return;
    }

    // Usuaris premium poden reproduir
    if (isStreamingOnly && item.tmdb_id) {
      if (type === 'movies') {
        navigate(`/debrid/movie/${item.tmdb_id}`);
      } else {
        // Sèries necessiten temporada i episodi
        navigate(`/debrid/tv/${item.tmdb_id}?s=1&e=1`);
      }
    } else if (type === 'movies') {
      if (item.has_file === false) {
        navigate(`/movies/${item.id}`);
      } else {
        navigate(`/play/movie/${item.id}`);
      }
    } else {
      navigate(`/${type}/${item.id}`);
    }
  };

  const getMeta = () => {
    if (type === 'movies') {
      const duration = item.duration ? Math.round(item.duration / 60) : 0;
      const parts = [];
      if (duration > 0) {
        parts.push(`${duration} min`);
      }
      if (item.year) {
        parts.push(item.year);
      }
      return parts.join(' · ') || '';
    }

    // Per sèries
    const parts = [];
    if (item.season_count) {
      parts.push(`${item.season_count} temp.`);
    }
    if (item.episode_count) {
      parts.push(`${item.episode_count} ep.`);
    }
    if (parts.length === 0 && item.year) {
      return item.year;
    }
    return parts.join(' · ') || item.year || '';
  };

  const progress = item.watch_progress || 0;

  // URL del poster (TMDB directe o local)
  const posterUrl = isStreamingOnly && item.poster
    ? item.poster
    : item.poster ? getPosterUrl(item.id) : null;

  return (
    <div
      className="media-card"
      style={{ width: `${width}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <div className="media-card__poster">
        {posterUrl && !imageError ? (
          <LazyImage
            src={posterUrl}
            alt={item.name || item.title}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="media-card__placeholder">
            {type === 'movies' ? <MovieIcon size={48} /> : <TvIcon size={48} />}
          </div>
        )}

        <div className="media-card__overlay">
          <div className="media-card__rating">
            <StarIcon size={12} /> {item.rating || '8.5'}
          </div>
        </div>

        <button
          className="media-card__play-button"
          onClick={handlePlay}
          title={isPremium ? 'Reproduir' : 'Veure detalls'}
          aria-label={`${isPremium ? 'Reproduir' : 'Veure detalls de'} ${item.name || item.title}`}
        >
          {isPremium ? <PlayIcon size={48} /> : <InfoIcon size={48} />}
        </button>

        {/* BBC Badge */}
        {hasBbcContent && (
          <div className="media-card__bbc-badge" aria-label="Disponible a BBC iPlayer">
            BBC
          </div>
        )}

        {progress > 0 && (
          <div className="media-card__progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
            <div className="media-card__progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="media-card__info">
        <div className="media-card__title-row">
          <div className="media-card__title">{item.name || item.title}</div>
          {isHovered && (
            <TitleAudioPlayer
              title={item.name || item.title}
              size="small"
              className="title-audio-player--inline"
            />
          )}
        </div>
        <div className="media-card__meta">{getMeta()}</div>
      </div>
    </div>
  );
}

// Memoitzem el component per evitar re-renderitzats innecessaris
export default React.memo(MediaCard);
