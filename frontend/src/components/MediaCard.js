import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../config';
import './MediaCard.css';

function MediaCard({ item, type }) {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const getLink = () => {
    if (type === 'series') {
      return `/series/${item.id}`;
    } else if (type === 'movie') {
      return `/movie/${item.id}`;
    }
    return '#';
  };

  const getQualityBadge = () => {
    if (item.width >= 3840) return '4K';
    if (item.width >= 1920) return 'FHD';
    if (item.width >= 1280) return 'HD';
    return null;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
  };

  const quality = getQualityBadge();

  return (
    <Link
      to={getLink()}
      className="media-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="media-card-poster">
        {item.poster && !imageError ? (
          <img
            src={`${API_URL}/api/image/poster/${item.id}`}
            alt={item.name}
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="media-card-placeholder">
            {type === 'series' ? (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <rect x="2" y="4" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            ) : (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.82 2H4.18A2.18 2.18 0 002 4.18v15.64A2.18 2.18 0 004.18 22h15.64A2.18 2.18 0 0022 19.82V4.18A2.18 2.18 0 0019.82 2zM10 16.5v-9l6 4.5-6 4.5z" />
              </svg>
            )}
          </div>
        )}

        {/* Overlay on hover */}
        <div className={`media-card-overlay ${isHovered ? 'visible' : ''}`}>
          <div className="play-button">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </div>
        </div>

        {/* Quality badge */}
        {quality && <span className="quality-badge">{quality}</span>}
      </div>

      <div className="media-card-info">
        <h3 className="media-card-title" title={item.name}>
          {item.name}
        </h3>
        <div className="media-card-meta">
          {type === 'series' ? (
            <>
              <span>{item.season_count || 0} temporades</span>
              <span className="dot">-</span>
              <span>{item.episode_count || 0} episodis</span>
            </>
          ) : (
            <span>{formatDuration(item.duration)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default MediaCard;
