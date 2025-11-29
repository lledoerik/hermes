import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Programs.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const PlayIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const TvIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const MovieIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
    <line x1="7" y1="2" x2="7" y2="22"></line>
    <line x1="17" y1="2" x2="17" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
  </svg>
);

const SeriesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

function Programs() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [playingVideo, setPlayingVideo] = useState(null);
  const [videoDetails, setVideoDetails] = useState(null);

  useEffect(() => {
    loadVideos();
  }, [filter]);

  const loadVideos = async () => {
    setLoading(true);
    try {
      let url = '/api/3cat/latest?limit=100';
      if (filter !== 'all') {
        url += `&content_type=${filter}`;
      }
      const response = await axios.get(url);
      setVideos(response.data.videos || []);
    } catch (error) {
      console.error('Error loading 3Cat content:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadVideos();
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`/api/3cat/search?q=${encodeURIComponent(searchQuery)}`);
      let results = response.data.videos || [];
      if (filter !== 'all') {
        results = results.filter(v => v.type === filter);
      }
      setVideos(results);
    } catch (error) {
      console.error('Error searching 3Cat:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (video) => {
    try {
      const response = await axios.get(`/api/3cat/videos/${video.id}`);
      setVideoDetails(response.data);
      setPlayingVideo(video);
    } catch (error) {
      console.error('Error getting video details:', error);
    }
  };

  const handleClose = () => {
    setPlayingVideo(null);
    setVideoDetails(null);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes} min`;
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'movie': return <MovieIcon />;
      case 'series': return <SeriesIcon />;
      default: return <TvIcon />;
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'movie': return 'Pel·lícula';
      case 'series': return 'Sèrie';
      default: return 'Programa';
    }
  };

  if (loading && videos.length === 0) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant contingut de 3Cat...</div>
      </div>
    );
  }

  return (
    <div className="programs-container">
      {/* Video Player Modal */}
      {playingVideo && videoDetails && (
        <div className="program-player-overlay" onClick={handleClose}>
          <div className="program-player-container" onClick={e => e.stopPropagation()}>
            <div className="program-player-header">
              <div className="program-player-info">
                <span className="program-type-badge">{getTypeLabel(playingVideo.type)}</span>
                <h2>{playingVideo.title}</h2>
                {playingVideo.program && <p className="program-name">{playingVideo.program}</p>}
              </div>
              <button className="program-player-close" onClick={handleClose}>
                <CloseIcon />
              </button>
            </div>
            <div className="program-player-video">
              {videoDetails.stream_url ? (
                <video
                  autoPlay
                  controls
                  src={videoDetails.stream_url}
                  style={{ width: '100%', height: '100%', background: '#000' }}
                >
                  El teu navegador no suporta vídeo HTML5.
                </video>
              ) : (
                <div className="no-stream">
                  <p>No s'ha pogut carregar el vídeo.</p>
                  <p>Prova a veure'l directament a 3Cat.</p>
                </div>
              )}
            </div>
            {playingVideo.description && (
              <div className="program-player-description">
                <p>{playingVideo.description}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="programs-header">
        <div className="programs-title">
          <span className="icon"><TvIcon /></span>
          <div>
            <h1>Programes 3Cat</h1>
            <p className="programs-subtitle">Contingut de la televisió pública catalana</p>
          </div>
        </div>

        <form className="programs-search" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Cerca programes, pel·lícules, sèries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit">
            <SearchIcon />
          </button>
        </form>
      </div>

      <div className="programs-filters">
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          Tot
        </button>
        <button
          className={filter === 'movie' ? 'active' : ''}
          onClick={() => setFilter('movie')}
        >
          <MovieIcon /> Pel·lícules
        </button>
        <button
          className={filter === 'series' ? 'active' : ''}
          onClick={() => setFilter('series')}
        >
          <SeriesIcon /> Sèries
        </button>
        <button
          className={filter === 'program' ? 'active' : ''}
          onClick={() => setFilter('program')}
        >
          <TvIcon /> Programes
        </button>
      </div>

      {videos.length === 0 && !loading ? (
        <div className="programs-empty">
          <TvIcon />
          <h2>No s'ha trobat contingut</h2>
          <p>Prova amb una altra cerca o filtre</p>
        </div>
      ) : (
        <div className="programs-grid">
          {videos.map((video) => (
            <div
              key={video.id}
              className="program-card"
              onClick={() => handlePlay(video)}
            >
              <div className="program-card-image">
                {video.image ? (
                  <img src={video.image} alt={video.title} />
                ) : (
                  <div className="program-card-placeholder">
                    {getTypeIcon(video.type)}
                  </div>
                )}
                <div className="program-card-play">
                  <PlayIcon size={32} />
                </div>
                <span className="program-card-type">{getTypeLabel(video.type)}</span>
                {video.duration && (
                  <span className="program-card-duration">{formatDuration(video.duration)}</span>
                )}
              </div>
              <div className="program-card-info">
                <h3>{video.title}</h3>
                {video.program && <p className="program-card-program">{video.program}</p>}
                {video.date && (
                  <span className="program-card-date">
                    {new Date(video.date).toLocaleDateString('ca-ES')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Programs;
