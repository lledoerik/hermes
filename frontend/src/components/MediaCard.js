import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

// SVG Icons
const TvIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const MovieIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
    <line x1="7" y1="2" x2="7" y2="22"></line>
    <line x1="17" y1="2" x2="17" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <line x1="2" y1="7" x2="7" y2="7"></line>
    <line x1="2" y1="17" x2="7" y2="17"></line>
    <line x1="17" y1="17" x2="22" y2="17"></line>
    <line x1="17" y1="7" x2="22" y2="7"></line>
  </svg>
);

const StarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

const PlayIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

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
    background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.3) 100%)',
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
    transform: 'translate(-50%, -50%)',
    background: 'none',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    opacity: 0,
    transition: 'all 0.3s ease',
    color: 'white',
    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))',
  },
  playButtonVisible: {
    opacity: 1,
    transform: 'translate(-50%, -50%) scale(1.1)',
  },
  info: {
    padding: '12px',
  },
  title: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  meta: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
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

function MediaCard({ item, type = 'series', width = 180 }) {
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/${type}/${item.id}`);
  };

  const handlePlay = (e) => {
    e.stopPropagation();
    if (type === 'movies') {
      navigate(`/play/movie/${item.id}`);
    } else {
      navigate(`/${type}/${item.id}`);
    }
  };

  const getMeta = () => {
    if (type === 'movies') {
      const duration = item.duration ? Math.round(item.duration / 60) : 0;
      return `${duration} min`;
    }
    return `${item.season_count || 0} temp. · ${item.episode_count || 0} ep.`;
  };

  const progress = item.watch_progress || 0;

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
        {item.poster ? (
          <img
            src={`${API_URL}/api/image/poster/${item.id}`}
            alt={item.name}
            style={styles.image}
            loading="lazy"
          />
        ) : (
          <div style={styles.placeholder}>
            {type === 'movies' ? <MovieIcon /> : <TvIcon />}
          </div>
        )}

        <div style={{
          ...styles.overlay,
          ...(isHovered ? styles.overlayVisible : {})
        }}>
          <div style={styles.rating}>
            <StarIcon /> {item.rating || '8.5'}
          </div>
        </div>

        <button
          style={{
            ...styles.playButton,
            ...(isHovered ? styles.playButtonVisible : {})
          }}
          onClick={handlePlay}
        >
          <PlayIcon />
        </button>

        {item.year && (
          <div style={styles.badge}>{item.year}</div>
        )}

        {progress > 0 && (
          <div style={styles.progressBar}>
            <div style={{ ...styles.progress, width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div style={styles.info}>
        <div style={styles.title}>{item.name}</div>
        <div style={styles.meta}>{getMeta()}</div>
      </div>
    </div>
  );
}

// Memoitzem el component per evitar re-renderitzats innecessaris
export default React.memo(MediaCard);
