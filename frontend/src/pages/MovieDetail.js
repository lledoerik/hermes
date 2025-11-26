import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL, API_ENDPOINTS } from '../config';
import './MovieDetail.css';

function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovieDetail();
  }, [id]);

  const loadMovieDetail = async () => {
    try {
      const response = await axios.get(`${API_URL}${API_ENDPOINTS.movieDetail(id)}`);
      setMovie(response.data);
    } catch (error) {
      console.error('Error loading movie:', error);
    } finally {
      setLoading(false);
    }
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

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) {
      return `${gb.toFixed(2)} GB`;
    }
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const getLanguageName = (code) => {
    const languages = {
      cat: 'Catala',
      spa: 'Castella',
      eng: 'Angles',
      jpn: 'Japones',
      kor: 'Korea',
      fra: 'Frances',
      deu: 'Alemany',
      ita: 'Italia',
      por: 'Portugues',
      und: 'Desconegut',
    };
    return languages[code] || code || 'Desconegut';
  };

  const getQualityBadge = () => {
    if (movie?.width >= 3840) return '4K';
    if (movie?.width >= 1920) return 'FHD';
    if (movie?.width >= 1280) return 'HD';
    return null;
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p className="loading-text">Carregant pel-licula...</p>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="error-state">
        <h2>Pel-licula no trobada</h2>
        <Link to="/movies" className="btn btn-primary">Tornar a pel-licules</Link>
      </div>
    );
  }

  const quality = getQualityBadge();

  return (
    <div className="movie-detail-page">
      {/* Backdrop */}
      <div className="movie-backdrop">
        {movie.backdrop && (
          <img
            src={`${API_URL}${API_ENDPOINTS.backdrop(movie.id)}`}
            alt=""
          />
        )}
        <div className="backdrop-overlay"></div>
      </div>

      <div className="container">
        {/* Header */}
        <div className="movie-header">
          <button className="back-button" onClick={() => navigate(-1)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="movie-poster">
            {movie.poster ? (
              <img
                src={`${API_URL}${API_ENDPOINTS.poster(movie.id)}`}
                alt={movie.name}
              />
            ) : (
              <div className="poster-placeholder">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.82 2H4.18A2.18 2.18 0 002 4.18v15.64A2.18 2.18 0 004.18 22h15.64A2.18 2.18 0 0022 19.82V4.18A2.18 2.18 0 0019.82 2zM10 16.5v-9l6 4.5-6 4.5z" />
                </svg>
              </div>
            )}
            {quality && <span className="quality-badge">{quality}</span>}
          </div>

          <div className="movie-info">
            <h1 className="movie-title">{movie.name}</h1>
            <div className="movie-meta">
              <span>{formatDuration(movie.duration)}</span>
              <span className="dot">-</span>
              <span>{formatFileSize(movie.file_size)}</span>
              {movie.video_codec && (
                <>
                  <span className="dot">-</span>
                  <span className="codec-badge">{movie.video_codec.toUpperCase()}</span>
                </>
              )}
              {movie.width && movie.height && (
                <>
                  <span className="dot">-</span>
                  <span>{movie.width}x{movie.height}</span>
                </>
              )}
            </div>

            {/* Audio Tracks */}
            {movie.audio_tracks && movie.audio_tracks.length > 0 && (
              <div className="tracks-info">
                <h3>Audio disponible</h3>
                <div className="tracks-list">
                  {movie.audio_tracks.map((track, index) => (
                    <span key={index} className="track-badge">
                      {getLanguageName(track.language)}
                      <span className="track-codec">({track.codec})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Subtitle Tracks */}
            {movie.subtitle_tracks && movie.subtitle_tracks.length > 0 && (
              <div className="tracks-info">
                <h3>Subtitols disponibles</h3>
                <div className="tracks-list">
                  {movie.subtitle_tracks.map((track, index) => (
                    <span key={index} className="track-badge">
                      {getLanguageName(track.language)}
                      <span className="track-codec">({track.codec})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Play Button */}
            {movie.media_id && (
              <Link to={`/play/${movie.media_id}`} className="btn btn-primary play-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Reproduir
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MovieDetail;
