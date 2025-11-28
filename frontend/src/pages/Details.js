import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './Details.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// Mapa de codis d'idiomes
const languageCodes = {
  // Català
  'cat': 'CAT', 'catalan': 'CAT', 'català': 'CAT', 'ca': 'CAT',
  // Castellà
  'spa': 'ESP', 'esp': 'ESP', 'spanish': 'ESP', 'español': 'ESP', 'castellano': 'ESP', 'es': 'ESP', 'cas': 'ESP',
  // Hispanoamericà
  'spa-la': 'HIS', 'es-la': 'HIS', 'es-419': 'HIS', 'spanish-latin': 'HIS', 'lat': 'HIS', 'latino': 'HIS',
  // Anglès
  'eng': 'ENG', 'english': 'ENG', 'en': 'ENG', 'en-us': 'ENG', 'en-gb': 'ENG', 'british': 'ENG',
  // Japonès
  'jap': 'JAP', 'jpn': 'JAP', 'japanese': 'JAP', 'ja': 'JAP',
  // Francès
  'fre': 'FRA', 'fra': 'FRA', 'french': 'FRA', 'fr': 'FRA',
  // Alemany
  'ger': 'ALE', 'deu': 'ALE', 'german': 'ALE', 'de': 'ALE',
  // Italià
  'ita': 'ITA', 'italian': 'ITA', 'it': 'ITA',
  // Portuguès
  'por': 'POR', 'portuguese': 'POR', 'pt': 'POR', 'pt-br': 'POR', 'brazilian': 'POR',
  // Coreà
  'kor': 'KOR', 'korean': 'KOR', 'ko': 'KOR',
  // Xinès
  'chi': 'XIN', 'zho': 'XIN', 'chinese': 'XIN', 'zh': 'XIN',
  // Rus
  'rus': 'RUS', 'russian': 'RUS', 'ru': 'RUS',
};

// Funció per obtenir el codi d'un idioma
const getLanguageCode = (lang) => {
  if (!lang) return '???';
  const normalizedLang = lang.toLowerCase().trim();
  return languageCodes[normalizedLang] || '???';
};

// SVG Icons
const TvIcon = () => (
  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const MovieIcon = () => (
  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

const PlayIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

function Details() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Determinar el tipus segons la ruta
  const type = location.pathname.startsWith('/movies') ? 'movies' : 'series';
  const [item, setItem] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadDetails = useCallback(async () => {
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
  }, [type, id]);

  const loadEpisodes = useCallback(async (seasonNum) => {
    try {
      const response = await axios.get(`/api/library/series/${id}/seasons/${seasonNum}/episodes`);
      setEpisodes(response.data);
    } catch (error) {
      console.error('Error carregant episodis:', error);
    }
  }, [id]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    if (type === 'series' && seasons.length > 0) {
      loadEpisodes(selectedSeason);
    }
  }, [type, selectedSeason, seasons, loadEpisodes]);

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
                {type === 'movies' ? <MovieIcon /> : <TvIcon />}
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
                <span className="meta-item rating"><StarIcon /> {item.rating}</span>
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
                <PlayIcon /> Reproduir
              </button>
              <button className="secondary-btn">
                + La meva llista
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
                  <div className="episode-play-icon"><PlayIcon size={24} /></div>
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
                      <span key={i} className="badge audio">{getLanguageCode(lang)}</span>
                    ))}
                    {getSubtitleLanguages(episode).slice(0, 2).map((lang, i) => (
                      <span key={i} className="badge sub">{getLanguageCode(lang)}</span>
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
