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

      // Select first season by default
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
    return languages[code] || code || 'Desconegut';
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p className="loading-text">Carregant serie...</p>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="error-state">
        <h2>Serie no trobada</h2>
        <Link to="/series" className="btn btn-primary">Tornar a series</Link>
      </div>
    );
  }

  return (
    <div className="series-detail-page">
      {/* Backdrop */}
      <div className="series-backdrop">
        {series.backdrop && (
          <img
            src={`${API_URL}${API_ENDPOINTS.backdrop(series.id)}`}
            alt=""
          />
        )}
        <div className="backdrop-overlay"></div>
      </div>

      <div className="container">
        {/* Header */}
        <div className="series-header">
          <button className="back-button" onClick={() => navigate(-1)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="series-poster">
            {series.poster ? (
              <img
                src={`${API_URL}${API_ENDPOINTS.poster(series.id)}`}
                alt={series.name}
              />
            ) : (
              <div className="poster-placeholder">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="2" y="4" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </div>
            )}
          </div>

          <div className="series-info">
            <h1 className="series-title">{series.name}</h1>
            <div className="series-meta">
              <span>{series.seasons?.length || 0} temporades</span>
            </div>
          </div>
        </div>

        {/* Season Selector */}
        {series.seasons && series.seasons.length > 0 && (
          <div className="seasons-bar">
            <div className="seasons-tabs">
              {series.seasons.map((season) => (
                <button
                  key={season.season_number}
                  className={`season-tab ${selectedSeason === season.season_number ? 'active' : ''}`}
                  onClick={() => setSelectedSeason(season.season_number)}
                >
                  <span className="season-name">Temporada {season.season_number}</span>
                  <span className="season-count">{season.episode_count} ep.</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Episodes List */}
        <div className="episodes-section">
          <h2 className="section-title">
            Episodis
            {selectedSeason && ` - Temporada ${selectedSeason}`}
          </h2>

          {loadingEpisodes ? (
            <div className="loading-episodes">
              <div className="spinner"></div>
            </div>
          ) : episodes.length > 0 ? (
            <div className="episodes-list">
              {episodes.map((episode) => (
                <Link
                  key={episode.id}
                  to={`/play/${episode.id}`}
                  className="episode-card glass"
                >
                  <div className="episode-number">
                    {episode.episode_number || '?'}
                  </div>

                  <div className="episode-info">
                    <h3 className="episode-title">
                      {episode.title || `Episodi ${episode.episode_number}`}
                    </h3>
                    <div className="episode-meta">
                      <span className="duration">{formatDuration(episode.duration)}</span>

                      {episode.audio_tracks && episode.audio_tracks.length > 0 && (
                        <span className="audio-info">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                          </svg>
                          {episode.audio_tracks.map(t => getLanguageName(t.language)).join(', ')}
                        </span>
                      )}

                      {episode.subtitle_tracks && episode.subtitle_tracks.length > 0 && (
                        <span className="subtitle-info">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="M6 10h4M6 14h8" stroke="white" strokeWidth="1.5" />
                          </svg>
                          {episode.subtitle_tracks.length} sub.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="episode-play">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No hi ha episodis disponibles per aquesta temporada</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SeriesDetail;
