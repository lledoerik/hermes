import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TitleAudioPlayer from './TitleAudioPlayer';
import LazyImage from './LazyImage';
import { useAuth } from '../context/AuthContext';
import { useBBC } from '../context/BBCContext';
import { getPosterUrl } from '../config/api';
import { TvIcon, MovieIcon, StarIcon, PlayIcon, InfoIcon } from './icons';

const styles = {
  card: {
    position: 'relative',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    backgroundColor: '#1e293b',
    flexShrink: 0,
  },
  cardHover: {
    transform: 'scale(1.05)',
    zIndex: 10,
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
  },
  poster: {
    width: '100%',
    aspectRatio: '2/3',
    backgroundColor: '#334155',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '48px',
    background: 'linear-gradient(135deg, #1e3a8a 0%, #328492 100%)',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    opacity: 0,
    transition: 'opacity 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: '15px',
  },
  overlayVisible: {
    opacity: 1,
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) scale(0.8)',
    background: 'none',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    opacity: 0,
    transition: 'all 0.3s ease',
    color: 'white',
  },
  playButtonVisible: {
    opacity: 1,
    transform: 'translate(-50%, -50%) scale(1)',
  },
  info: {
    padding: '12px',
    textAlign: 'left',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  title: {
    fontSize: '14px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'left',
    flex: 1,
  },
  meta: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'left',
  },
  badge: {
    position: 'absolute',
    top: '10px',
    left: '10px',
    padding: '4px 8px',
    background: '#328492',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
  },
  bbcBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    padding: '3px 6px',
    background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.5px',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
    zIndex: 5,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: 'rgba(255, 255, 255, 0.2)',
  },
  progress: {
    height: '100%',
    background: '#328492',
    transition: 'width 0.3s ease',
  },
  rating: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: '#fbbf24',
  },
};

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
    // Sempre navegar a la pàgina de detalls (mai directament a stream)
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
      style={{
        ...styles.card,
        width: `${width}px`,
        ...(isHovered ? styles.cardHover : {})
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <div style={styles.poster}>
        {posterUrl && !imageError ? (
          <LazyImage
            src={posterUrl}
            alt={item.name || item.title}
            onError={() => setImageError(true)}
          />
        ) : (
          <div style={styles.placeholder}>
            {type === 'movies' ? <MovieIcon size={48} /> : <TvIcon size={48} />}
          </div>
        )}

        <div style={{
          ...styles.overlay,
          ...(isHovered ? styles.overlayVisible : {})
        }}>
          <div style={styles.rating}>
            <StarIcon size={12} /> {item.rating || '8.5'}
          </div>
        </div>

        <button
          style={{
            ...styles.playButton,
            ...(isHovered ? styles.playButtonVisible : {})
          }}
          onClick={handlePlay}
          title={isPremium ? 'Reproduir' : 'Veure detalls'}
        >
          {isPremium ? <PlayIcon size={48} /> : <InfoIcon size={48} />}
        </button>

        {/* BBC Badge */}
        {hasBbcContent && (
          <div style={styles.bbcBadge}>BBC</div>
        )}

        {progress > 0 && (
          <div style={styles.progressBar}>
            <div style={{ ...styles.progress, width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div style={styles.info}>
        <div style={styles.titleRow}>
          <div style={styles.title}>{item.name || item.title}</div>
          {isHovered && (
            <TitleAudioPlayer
              title={item.name || item.title}
              size="small"
              className="title-audio-player--inline"
            />
          )}
        </div>
        <div style={styles.meta}>{getMeta()}</div>
      </div>
    </div>
  );
}

// Memoitzem el component per evitar re-renderitzats innecessaris
export default React.memo(MediaCard);
