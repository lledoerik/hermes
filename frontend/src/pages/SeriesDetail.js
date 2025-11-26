import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL, API_ENDPOINTS } from '../config';
import './SeriesDetail.css';

function SeriesDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [series, setSeries] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  useEffect(() => {
    loadSeriesDetail();
  }, [id]);

  useEffect(() => {
    if (selectedSeason !== null) {
      loadEpisodes(selectedSeason);
    }
  }, [selectedSeason, id]);

  const loadSeriesDetail = async () => {
    try {
      const response = await axios.get(`${API_URL}${API_ENDPOINTS.seriesDetail(id)}`);
      setSeries(response.data);

      if (response.data.seasons && response.data.seasons.length > 0) {
        setSelectedSeason(response.data.seasons[0].season_number);
      }
    } catch (error) {
      console.error('Error loading series:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEpisodes = async (seasonNumber) => {
    setLoadingEpisodes(true);
    try {
      const response = await axios.get(
        `${API_URL}${API_ENDPOINTS.seasonEpisodes(id, seasonNumber)}`
      );
      setEpisodes(response.data);
    } catch (error) {
      console.error('Error loading episodes:', error);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
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
    return languages[code] || code || 'Desc.';
  };

  if (loading) {
    return (
      <div className="detail-loading">
        <div className="loader"></div>
        <p>Carregant serie...</p>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="detail-error">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h2>Serie no trobada</h2>
        <Link to="/series" className="btn-back">Tornar a series</Link>
      </div>
    );
  }

  const totalEpisodes = series.seasons?.reduce((acc, s) => acc + (s.episode_count || 0), 0) || 0;

  return (
    <div className="detail-page">
      {/* Hero Backdrop */}
      <div className="detail-hero">
        {series.backdrop && (
          <img
            src={`${API_URL}${API_ENDPOINTS.backdrop(series.id)}`}
            alt=""
            className="hero-image"
            onError={(e) => e.target.style.display = 'none'}
          />
        )}
        <div className="hero-overlay"></div>
      </div>

      {/* Back Button */}
      <button className="btn-nav-back" onClick={() => navigate(-1)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Content */}
      <div className="detail-content">
        {/* Header Info */}
        <div className="detail-header">
          <div className="detail-poster">
            {series.poster ? (
              <img
                src={`${API_URL}${API_ENDPOINTS.poster(series.id)}`}
                alt={series.name}
              />
            ) : (
              <div className="poster-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                  <rect x="2" y="4" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </div>
            )}
          </div>

          <div className="detail-info">
            <span className="content-type">Serie</span>
            <h1 className="detail-title">{series.name}</h1>
            <div className="detail-meta">
              <span>{series.seasons?.length || 0} temporades</span>
              <span className="separator">•</span>
              <span>{totalEpisodes} episodis</span>
            </div>

            {/* Quick Play Button */}
            {episodes.length > 0 && (
              <Link to={`/play/${episodes[0].id}`} className="btn-play-main">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Reproduir
              </Link>
            )}
          </div>
        </div>

        {/* Season Selector */}
        {series.seasons && series.seasons.length > 0 && (
          <div className="seasons-section">
            <div className="seasons-scroll">
              {series.seasons.map((season) => (
                <button
                  key={season.season_number}
                  className={`season-btn ${selectedSeason === season.season_number ? 'active' : ''}`}
                  onClick={() => setSelectedSeason(season.season_number)}
                >
                  <span className="season-label">Temporada {season.season_number}</span>
                  <span className="season-episodes">{season.episode_count} ep.</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Episodes */}
        <div className="episodes-section">
          <h2 className="episodes-title">
            Episodis
            {selectedSeason && <span> - Temporada {selectedSeason}</span>}
          </h2>

          {loadingEpisodes ? (
            <div className="episodes-loading">
              <div className="loader small"></div>
            </div>
          ) : episodes.length > 0 ? (
            <div className="episodes-grid">
              {episodes.map((episode) => (
                <Link
                  key={episode.id}
                  to={`/play/${episode.id}`}
                  className="episode-item"
                >
                  <div className="episode-number-box">
                    <span className="ep-num">{episode.episode_number || '?'}</span>
                  </div>

                  <div className="episode-details">
                    <h3 className="episode-name">
                      {episode.title || `Episodi ${episode.episode_number}`}
                    </h3>
                    <div className="episode-info">
                      {episode.duration && (
                        <span className="ep-duration">{formatDuration(episode.duration)}</span>
                      )}
                      {episode.audio_tracks && episode.audio_tracks.length > 0 && (
                        <span className="ep-audio">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                          </svg>
                          {episode.audio_tracks.slice(0, 2).map(t => getLanguageName(t.language)).join(', ')}
                          {episode.audio_tracks.length > 2 && ` +${episode.audio_tracks.length - 2}`}
                        </span>
                      )}
                      {episode.subtitle_tracks && episode.subtitle_tracks.length > 0 && (
                        <span className="ep-subs">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="M6 10h4M6 14h8" stroke="white" strokeWidth="1.5" />
                          </svg>
                          {episode.subtitle_tracks.length} sub
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="episode-play-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="no-episodes">
              <p>No hi ha episodis disponibles per aquesta temporada</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SeriesDetail;
