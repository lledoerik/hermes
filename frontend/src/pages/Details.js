import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Details.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : `http://${window.location.hostname}:8000`;

axios.defaults.baseURL = API_URL;

function Details() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDetails();
  }, [type, id]);

  useEffect(() => {
    if (type === 'series' && seasons.length > 0) {
      loadEpisodes(selectedSeason);
    }
  }, [selectedSeason, seasons]);

  const loadDetails = async () => {
    try {
      if (type === 'series') {
        const [seriesRes, seasonsRes] = await Promise.all([
          axios.get(`/api/library/series/${id}`),
          axios.get(`/api/library/series/${id}/seasons`)
        ]);
        setItem(seriesRes.data);
        setSeasons(seasonsRes.data);
        if (seasonsRes.data.length > 0) {
          setSelectedSeason(seasonsRes.data[0].season_number);
        }
      } else {
        const response = await axios.get(`/api/library/movies/${id}`);
        setItem(response.data);
      }
    } catch (error) {
      console.error('Error carregant detalls:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEpisodes = async (seasonNum) => {
    try {
      const response = await axios.get(`/api/library/series/${id}/seasons/${seasonNum}/episodes`);
      setEpisodes(response.data);
    } catch (error) {
      console.error('Error carregant episodis:', error);
    }
  };

  const handlePlay = (episodeId = null) => {
    if (type === 'movies') {
      navigate(`/play/movie/${id}`);
    } else if (episodeId) {
      navigate(`/play/episode/${episodeId}`);
    } else if (episodes.length > 0) {
      navigate(`/play/episode/${episodes[0].id}`);
    }
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

  const getAudioLanguages = (episode) => {
    if (!episode.audio_tracks) return [];
    try {
      const tracks = JSON.parse(episode.audio_tracks);
      return tracks.map(t => t.language || 'Unknown');
    } catch {
      return [];
    }
  };

  const getSubtitleLanguages = (episode) => {
    if (!episode.subtitles) return [];
    try {
      const subs = JSON.parse(episode.subtitles);
      return subs.map(s => s.language || 'Unknown');
    } catch {
      return [];
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant...</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="details-container">
        <div style={{ padding: '100px 20px', textAlign: 'center' }}>
          <h2>No s'ha trobat el contingut</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="details-container">
      {/* Hero Banner */}
      <div className="details-hero">
        <div
          className="hero-backdrop"
          style={{
            backgroundImage: item.backdrop
              ? `url(${API_URL}/api/image/backdrop/${item.id})`
              : item.poster
              ? `url(${API_URL}/api/image/poster/${item.id})`
              : 'none'
          }}
        />
        <div className="hero-gradient" />

        <div className="hero-content">
          <div className="details-poster">
            {item.poster ? (
              <img
                src={`${API_URL}/api/image/poster/${item.id}`}
                alt={item.name}
              />
            ) : (
              <div className="poster-placeholder">
                {type === 'movies' ? '🎬' : '📺'}
              </div>
            )}
          </div>

          <div className="details-info">
            <h1 className="details-title">{item.name}</h1>

            <div className="details-meta">
              {item.year && (
                <span className="meta-item">{item.year}</span>
              )}
              {item.rating && (
                <span className="meta-item rating">⭐ {item.rating}</span>
              )}
              {type === 'movies' && item.duration && (
                <span className="meta-item">{formatDuration(item.duration)}</span>
              )}
              {type === 'series' && (
                <>
                  <span className="meta-item">{item.season_count || seasons.length} temporades</span>
                  <span className="meta-item">{item.episode_count || 0} episodis</span>
                </>
              )}
              {item.genres && (
                <span className="meta-item">{item.genres}</span>
              )}
            </div>

            {item.overview && (
              <p className="details-overview">{item.overview}</p>
            )}

            <div className="details-actions">
              <button className="play-btn" onClick={() => handlePlay()}>
                ▶ Reproduir
              </button>
              <button className="secondary-btn">
                + La meva llista
              </button>
              <button className="secondary-btn">
                ℹ️ Més info
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Episodes Section (only for series) */}
      {type === 'series' && (
        <div className="episodes-section">
          <div className="section-header">
            <h2 className="section-title">Episodis</h2>
            {seasons.length > 0 && (
              <select
                className="season-selector"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.season_number}>
                    Temporada {season.season_number}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="episodes-grid">
            {episodes.map((episode) => (
              <div
                key={episode.id}
                className="episode-card"
                onClick={() => handlePlay(episode.id)}
              >
                <div className="episode-thumbnail">
                  {episode.thumbnail ? (
                    <img
                      src={`${API_URL}/api/image/thumbnail/${episode.id}`}
                      alt={episode.name}
                    />
                  ) : (
                    <span className="episode-number">{episode.episode_number}</span>
                  )}
                  <div className="episode-play-icon">▶</div>
                  {episode.watch_progress > 0 && (
                    <div className="episode-progress">
                      <div
                        className="episode-progress-bar"
                        style={{ width: `${episode.watch_progress}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="episode-info">
                  <div className="episode-title">
                    {episode.episode_number}. {episode.name || `Episodi ${episode.episode_number}`}
                  </div>
                  <div className="episode-meta">
                    {episode.duration && (
                      <span>{formatDuration(episode.duration)}</span>
                    )}
                  </div>
                  <div className="audio-badges">
                    {getAudioLanguages(episode).slice(0, 3).map((lang, i) => (
                      <span key={i} className="badge audio">{lang}</span>
                    ))}
                    {getSubtitleLanguages(episode).slice(0, 2).map((lang, i) => (
                      <span key={i} className="badge sub">Sub {lang}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {episodes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.5)' }}>
              No hi ha episodis disponibles per aquesta temporada
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Details;
