import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import TitleAudioPlayer from '../components/TitleAudioPlayer';
import ExternalPlayer from '../components/ExternalPlayer';
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

const EditIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

function Details() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  // Determinar el tipus segons la ruta
  const type = location.pathname.startsWith('/movies') ? 'movies' : 'series';
  const [item, setItem] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showTmdbInput, setShowTmdbInput] = useState(false);
  const [tmdbId, setTmdbId] = useState('');
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbMessage, setTmdbMessage] = useState(null);
  const [imageCacheBust, setImageCacheBust] = useState('');

  // Watch providers state
  const [watchProviders, setWatchProviders] = useState(null);

  // External URL state
  const [showExternalUrlInput, setShowExternalUrlInput] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalUrlLoading, setExternalUrlLoading] = useState(false);
  const [showExternalPlayer, setShowExternalPlayer] = useState(false);

  // Scroll de temporades
  const seasonsScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollButtons = useCallback(() => {
    const container = seasonsScrollRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 5
      );
    }
  }, []);

  const scrollSeasons = (direction) => {
    const container = seasonsScrollRef.current;
    if (container) {
      const scrollAmount = 200;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    checkScrollButtons();
    window.addEventListener('resize', checkScrollButtons);
    return () => window.removeEventListener('resize', checkScrollButtons);
  }, [checkScrollButtons, seasons]);

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

  // Carregar el TMDB ID guardat si existeix
  useEffect(() => {
    if (item?.tmdb_id) {
      setTmdbId(item.tmdb_id.toString());
    }
  }, [item]);

  // Carregar la URL externa si existeix
  useEffect(() => {
    if (item?.external_url) {
      setExternalUrl(item.external_url);
    }
  }, [item]);

  // Carregar watch providers si tenim tmdb_id
  useEffect(() => {
    const loadWatchProviders = async () => {
      if (!item?.tmdb_id) return;

      try {
        const mediaType = type === 'movies' ? 'movie' : 'series';
        const response = await axios.get(`/api/watch-providers/${mediaType}/${item.tmdb_id}`);
        setWatchProviders(response.data);
      } catch (err) {
        console.error('Error carregant proveïdors:', err);
      }
    };

    loadWatchProviders();
  }, [item?.tmdb_id, type]);

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

  const handleUpdateByTmdbId = async () => {
    if (!tmdbId.trim()) {
      setTmdbMessage({ type: 'error', text: 'Introdueix un ID de TMDB' });
      return;
    }

    setTmdbLoading(true);
    setTmdbMessage(null);

    try {
      const response = await axios.post(`/api/metadata/series/${id}/update-by-tmdb`, {
        tmdb_id: parseInt(tmdbId),
        media_type: type === 'movies' ? 'movie' : 'series'
      });

      if (response.data.status === 'success') {
        const metadata = response.data.metadata;

        // Actualitzar l'item directament amb les noves metadades
        setItem(prev => ({
          ...prev,
          title: metadata.title || prev.title,
          year: metadata.year || prev.year,
          overview: metadata.overview || prev.overview,
          rating: metadata.rating || prev.rating,
          genres: metadata.genres || prev.genres,
          runtime: metadata.runtime || prev.runtime,
          tmdb_id: response.data.tmdb_id
        }));

        // Forçar recàrrega de les imatges amb cache bust
        if (response.data.poster_downloaded || response.data.backdrop_downloaded) {
          setImageCacheBust(`?t=${Date.now()}`);
        }

        setTmdbMessage({
          type: 'success',
          text: `Metadades actualitzades: ${metadata.title || item.name}`
        });
        setShowTmdbInput(false);

        // Amagar el missatge després de 3 segons
        setTimeout(() => {
          setTmdbMessage(null);
        }, 3000);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error actualitzant metadades';
      setTmdbMessage({ type: 'error', text: errorMsg });
    } finally {
      setTmdbLoading(false);
    }
  };

  // Detecta el tipus de font a partir de la URL
  const detectExternalSource = (url) => {
    if (!url) return null;
    const urlLower = url.toLowerCase();
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'YouTube';
    if (urlLower.includes('vimeo.com')) return 'Vimeo';
    if (urlLower.includes('archive.org')) return 'Internet Archive';
    if (urlLower.includes('3cat.cat') || urlLower.includes('ccma.cat') || urlLower.includes('tv3.cat')) return '3Cat';
    if (urlLower.includes('dailymotion.com') || urlLower.includes('dai.ly')) return 'Dailymotion';
    if (urlLower.includes('twitch.tv')) return 'Twitch';
    if (urlLower.includes('superembed') || urlLower.includes('2embed') || urlLower.includes('vidsrc')) return 'Embed API';
    if (urlLower.endsWith('.m3u8')) return 'HLS Stream';
    if (urlLower.endsWith('.mp4') || urlLower.endsWith('.webm')) return 'Vídeo directe';
    return 'Extern';
  };

  const handleSaveExternalUrl = async () => {
    setExternalUrlLoading(true);
    try {
      const detectedSource = detectExternalSource(externalUrl);
      await axios.patch(`/api/series/${id}/external-url`, {
        external_url: externalUrl || null,
        external_source: detectedSource
      });

      // Actualitzar l'item
      setItem(prev => ({
        ...prev,
        external_url: externalUrl || null,
        external_source: detectedSource
      }));

      setShowExternalUrlInput(false);
    } catch (error) {
      console.error('Error guardant URL externa:', error);
    } finally {
      setExternalUrlLoading(false);
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
              ? `url(${API_URL}/api/image/backdrop/${item.id}${imageCacheBust})`
              : item.poster
              ? `url(${API_URL}/api/image/poster/${item.id}${imageCacheBust})`
              : 'none'
          }}
        />
        <div className="hero-gradient" />

        <div className="hero-content">
          <div className="details-info">
            <div className="details-title-wrapper">
              <h1 className="details-title">{item.title || item.name}</h1>
              <TitleAudioPlayer
                title={item.title || item.name}
                size="large"
              />
            </div>

            <div className="details-meta">
              {item.year && (
                <span className="meta-item">{item.year}</span>
              )}
              {item.rating && (
                <span className="meta-item rating"><StarIcon /> {item.rating.toFixed(1)}</span>
              )}
              {type === 'movies' && (item.runtime || item.duration) && (
                <span className="meta-item">{formatDuration(item.runtime ? item.runtime * 60 : item.duration)}</span>
              )}
              {type === 'series' && seasons.length > 0 && (
                <span className="meta-item">{seasons.length} temporades</span>
              )}
              {item.genres && Array.isArray(item.genres) && item.genres.length > 0 && (
                <span className="meta-item genres">{item.genres.join(', ')}</span>
              )}
            </div>

            {/* Tagline */}
            {item.tagline && (
              <p className="details-tagline">"{item.tagline}"</p>
            )}

            {item.overview && (
              <p className="details-overview">{item.overview}</p>
            )}

            {/* Credits: Director/Creadors i Repartiment */}
            <div className="details-credits">
              {/* Director (per pel·lícules) o Creadors (per sèries) */}
              {type === 'movies' && item.director && (
                <div className="credit-section">
                  <div className="credit-section-title">Director</div>
                  <div className="credit-section-value">{item.director}</div>
                </div>
              )}
              {type === 'series' && item.creators && item.creators.length > 0 && (
                <div className="credit-section">
                  <div className="credit-section-title">Creadors</div>
                  <div className="credit-section-value">{item.creators.join(', ')}</div>
                </div>
              )}
              {/* Repartiment principal */}
              {item.cast && item.cast.length > 0 && (
                <div className="credit-section">
                  <div className="credit-section-title">Repartiment</div>
                  <div className="cast-grid">
                    {item.cast.slice(0, 6).map((c, i) => (
                      <div key={i} className="cast-item">
                        <span className="cast-name">{c.name}</span>
                        {c.character && <span className="cast-character">{c.character}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Watch Providers - On veure en streaming */}
            {watchProviders && watchProviders.available && (
              <div className="watch-providers-section">
                {watchProviders.flatrate && watchProviders.flatrate.length > 0 && (
                  <div className="providers-row">
                    <span className="providers-label">Disponible a:</span>
                    <div className="providers-logos">
                      {watchProviders.flatrate.map((provider) => (
                        <a
                          key={provider.id}
                          href={provider.deep_link || watchProviders.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="provider-logo"
                          title={`Veure a ${provider.name}`}
                        >
                          {provider.logo ? (
                            <img src={provider.logo} alt={provider.name} />
                          ) : (
                            <span className="provider-name">{provider.name}</span>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {watchProviders.rent && watchProviders.rent.length > 0 && (
                  <div className="providers-row">
                    <span className="providers-label">Llogar a:</span>
                    <div className="providers-logos">
                      {watchProviders.rent.slice(0, 5).map((provider) => (
                        <a
                          key={provider.id}
                          href={provider.deep_link || watchProviders.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="provider-logo"
                          title={`Llogar a ${provider.name}`}
                        >
                          {provider.logo ? (
                            <img src={provider.logo} alt={provider.name} />
                          ) : (
                            <span className="provider-name">{provider.name}</span>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="details-actions">
              <button className="play-btn" onClick={() => handlePlay()}>
                <PlayIcon /> Reproduir
              </button>
              {/* Botó per reproduir contingut extern (URL manual) */}
              {item?.external_url && (
                <button
                  className="play-btn external-play-btn"
                  onClick={() => setShowExternalPlayer(!showExternalPlayer)}
                >
                  <PlayIcon /> {showExternalPlayer ? 'Amagar' : 'Veure online'}
                  {item?.external_source && (
                    <span className="external-source-badge">{item.external_source}</span>
                  )}
                </button>
              )}
              {/* Botó per reproduir amb embed automàtic (TMDB ID) - Obre StreamPlayer */}
              {item?.tmdb_id && (
                <button
                  className="play-btn embed-play-btn"
                  onClick={() => {
                    const mediaType = type === 'movies' ? 'movie' : 'series';
                    navigate(`/stream/${mediaType}/${item.tmdb_id}`);
                  }}
                >
                  <PlayIcon /> Veure online
                  <span className="external-source-badge">Streaming</span>
                </button>
              )}
              <button className="secondary-btn">
                + La meva llista
              </button>
              {isAdmin && (
                <>
                  <button
                    className="secondary-btn edit-metadata-btn"
                    onClick={() => setShowTmdbInput(!showTmdbInput)}
                    title="Corregir metadades amb TMDB ID"
                  >
                    <EditIcon size={16} />
                  </button>
                  <button
                    className="secondary-btn external-url-btn"
                    onClick={() => setShowExternalUrlInput(!showExternalUrlInput)}
                    title="Afegir URL externa per veure online"
                  >
                    🔗
                  </button>
                </>
              )}
            </div>

            {/* External URL Input Form - només admins */}
            {isAdmin && showExternalUrlInput && (
              <div className="external-url-form">
                <label>
                  {item?.external_url ? 'URL externa actual (canvia per actualitzar):' : 'Introdueix una URL per veure online:'}
                </label>
                <div className="external-url-input-row">
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... o URL directa .mp4/.m3u8"
                    disabled={externalUrlLoading}
                  />
                  <button
                    className="external-url-submit-btn"
                    onClick={handleSaveExternalUrl}
                    disabled={externalUrlLoading}
                  >
                    {externalUrlLoading ? 'Guardant...' : 'Guardar'}
                  </button>
                </div>
                <small className="external-url-help">
                  Suporta: YouTube, Vimeo, Dailymotion, Twitch, 3Cat, Internet Archive, URLs directes (.mp4, .m3u8)
                </small>
                {externalUrl && (
                  <div className="external-url-preview">
                    Font detectada: <strong>{detectExternalSource(externalUrl)}</strong>
                  </div>
                )}
              </div>
            )}

            {/* External Player (URL manual) */}
            {showExternalPlayer && item?.external_url && (
              <div className="external-player-section">
                <ExternalPlayer
                  url={item.external_url}
                  title={item.title || item.name}
                  autoplay={true}
                />
              </div>
            )}

            {/* TMDB ID Input Form - només admins */}
            {isAdmin && showTmdbInput && (
              <div className="tmdb-input-form">
                <label>
                  {item?.tmdb_id ? 'TMDB ID actual (canvia per actualitzar):' : 'Introdueix l\'ID de TMDB:'}
                </label>
                <div className="tmdb-input-row">
                  <input
                    type="number"
                    value={tmdbId}
                    onChange={(e) => setTmdbId(e.target.value)}
                    placeholder="Ex: 550 (Fight Club)"
                    disabled={tmdbLoading}
                  />
                  <button
                    className="tmdb-submit-btn"
                    onClick={handleUpdateByTmdbId}
                    disabled={tmdbLoading}
                  >
                    {tmdbLoading ? 'Actualitzant...' : 'Actualitzar'}
                  </button>
                </div>
                <small className="tmdb-help">
                  Cerca a <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">themoviedb.org</a> i copia l'ID de l'URL
                </small>
                {tmdbMessage && (
                  <div className={`tmdb-message ${tmdbMessage.type}`}>
                    {tmdbMessage.text}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Episodes Section (only for series) */}
      {type === 'series' && (
        <div className="episodes-section">
          <div className="section-header">
            {/* Season Tabs amb scroll horitzontal */}
            {seasons.length > 0 && (
              <div className="seasons-tabs">
                {canScrollLeft && (
                  <button
                    className="scroll-indicator left"
                    onClick={() => scrollSeasons('left')}
                    aria-label="Scroll left"
                  >
                    <ChevronLeftIcon />
                  </button>
                )}

                <div
                  className="seasons-scroll-container"
                  ref={seasonsScrollRef}
                  onScroll={checkScrollButtons}
                >
                  <div className="seasons-list">
                    {seasons.map((season) => (
                      <button
                        key={season.id}
                        className={`season-btn ${selectedSeason === season.season_number ? 'active' : ''}`}
                        onClick={() => setSelectedSeason(season.season_number)}
                      >
                        Temporada {season.season_number}
                      </button>
                    ))}
                  </div>
                </div>

                {canScrollRight && (
                  <button
                    className="scroll-indicator right"
                    onClick={() => scrollSeasons('right')}
                    aria-label="Scroll right"
                  >
                    <ChevronRightIcon />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="episodes-grid">
            {episodes.map((episode) => (
              <div
                key={episode.id}
                className="episode-card"
              >
                <div className="episode-thumbnail" onClick={() => handlePlay(episode.id)}>
                  <img
                    src={`${API_URL}/api/media/${episode.id}/thumbnail`}
                    alt={episode.name}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <span className="episode-number" style={{ display: 'none' }}>{episode.episode_number}</span>
                  <div className="episode-play-icon"><PlayIcon size={20} /></div>
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
                  <div className="episode-actions">
                    <div className="audio-badges">
                      {getAudioLanguages(episode).slice(0, 3).map((lang, i) => (
                        <span key={i} className="badge audio">{getLanguageCode(lang)}</span>
                      ))}
                      {getSubtitleLanguages(episode).slice(0, 2).map((lang, i) => (
                        <span key={i} className="badge sub">{getLanguageCode(lang)}</span>
                      ))}
                    </div>
                    {/* Botó streaming online per episodi */}
                    {item?.tmdb_id && (
                      <button
                        className="episode-stream-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/stream/series/${item.tmdb_id}?s=${selectedSeason}&e=${episode.episode_number}`);
                        }}
                        title="Veure online"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                        Online
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {episodes.length === 0 && (
            <div className="episodes-empty">
              No hi ha episodis disponibles per aquesta temporada
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Details;
