import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Watchlist.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

// SVG Icons
const BookmarkIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const StarIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

const MovieIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="20" height="20" rx="2.18"/>
    <path d="M7 2v20"/>
    <path d="M17 2v20"/>
    <path d="M2 12h20"/>
    <path d="M2 7h5"/>
    <path d="M2 17h5"/>
    <path d="M17 17h5"/>
    <path d="M17 7h5"/>
  </svg>
);

const SeriesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="6" width="16" height="12" rx="2"/>
    <path d="M2 8v8"/>
    <path d="M22 8v8"/>
  </svg>
);

function Watchlist() {
  const { isAuthenticated, user } = useAuth();
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, movie, series
  const navigate = useNavigate();

  const loadWatchlist = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/api/user/watchlist`);
      setWatchlist(response.data || []);
    } catch (error) {
      console.error('Error carregant watchlist:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  const removeFromWatchlist = async (item) => {
    try {
      await axios.delete(`${API_URL}/api/user/watchlist/${item.tmdb_id}?media_type=${item.media_type}`);
      setWatchlist(prev => prev.filter(i => i.id !== item.id));
    } catch (error) {
      console.error('Error eliminant de watchlist:', error);
    }
  };

  const handlePlay = (item) => {
    if (item.media_type === 'movie') {
      navigate(`/stream/movie/${item.tmdb_id}`);
    } else {
      navigate(`/stream/tv/${item.tmdb_id}?s=1&e=1`);
    }
  };

  const handleDetails = (item) => {
    const type = item.media_type === 'movie' ? 'movies' : 'series';
    navigate(`/${type}/tmdb-${item.tmdb_id}`);
  };

  const filteredWatchlist = filter === 'all'
    ? watchlist
    : watchlist.filter(item => item.media_type === filter);

  if (!isAuthenticated) {
    return (
      <div className="watchlist-container">
        <div className="watchlist-empty">
          <BookmarkIcon />
          <h2>Inicia sessió per veure la teva llista</h2>
          <p>Guarda pel·lícules i sèries per veure-les més tard</p>
          <button onClick={() => navigate('/login')} className="login-btn">
            Iniciar sessió
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="watchlist-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="watchlist-container">
      <div className="watchlist-header">
        <h1>
          <BookmarkIcon />
          La meva llista
        </h1>
        <p className="watchlist-subtitle">
          {watchlist.length} {watchlist.length === 1 ? 'títol' : 'títols'} guardats
        </p>
      </div>

      {watchlist.length > 0 && (
        <div className="watchlist-filters">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Tot ({watchlist.length})
          </button>
          <button
            className={`filter-btn ${filter === 'movie' ? 'active' : ''}`}
            onClick={() => setFilter('movie')}
          >
            <MovieIcon />
            Pel·lícules ({watchlist.filter(i => i.media_type === 'movie').length})
          </button>
          <button
            className={`filter-btn ${filter === 'series' ? 'active' : ''}`}
            onClick={() => setFilter('series')}
          >
            <SeriesIcon />
            Sèries ({watchlist.filter(i => i.media_type === 'series').length})
          </button>
        </div>
      )}

      {filteredWatchlist.length === 0 ? (
        <div className="watchlist-empty">
          <BookmarkIcon />
          <h2>La teva llista està buida</h2>
          <p>Afegeix pel·lícules i sèries des de les pàgines de detalls</p>
          <button onClick={() => navigate('/')} className="browse-btn">
            Explorar contingut
          </button>
        </div>
      ) : (
        <div className="watchlist-grid">
          {filteredWatchlist.map((item) => (
            <div key={item.id} className="watchlist-card">
              <div
                className="watchlist-poster"
                onClick={() => handleDetails(item)}
              >
                {item.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
                    alt={item.title}
                  />
                ) : (
                  <div className="poster-placeholder">
                    {item.media_type === 'movie' ? <MovieIcon /> : <SeriesIcon />}
                  </div>
                )}
                <div className="card-overlay">
                  <button
                    className="play-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(item);
                    }}
                  >
                    <PlayIcon />
                  </button>
                </div>
                <div className="media-type-badge">
                  {item.media_type === 'movie' ? 'Pel·lícula' : 'Sèrie'}
                </div>
              </div>
              <div className="watchlist-info">
                <h3 onClick={() => handleDetails(item)}>{item.title}</h3>
                <div className="watchlist-meta">
                  {item.year && <span className="year">{item.year}</span>}
                  {item.rating && (
                    <span className="rating">
                      <StarIcon /> {item.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <button
                  className="remove-btn"
                  onClick={() => removeFromWatchlist(item)}
                  title="Eliminar de la llista"
                >
                  <TrashIcon />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Watchlist;
