import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useStreamCache } from '../context/StreamCacheContext';
import TitleAudioPlayer from '../components/TitleAudioPlayer';
import { API_URL, getBackdropUrl, getPosterUrl, formatDuration } from '../config/api';
import {
  StarIcon,
  PlayIcon,
  EditIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BookmarkIcon
} from '../components/icons';
import './Details.css';

axios.defaults.baseURL = API_URL;

function Details() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isPremium, isAuthenticated } = useAuth();
  const { preloadTorrents, preloadAutoQualityFirst } = useStreamCache();

  // Determinar el tipus segons la ruta
  const type = location.pathname.startsWith('/movies') ? 'movies' : 'series';

  // Detectar si és contingut només de TMDB (ID comença amb "tmdb-")
  const isTmdbOnly = id.startsWith('tmdb-');
  const realTmdbId = isTmdbOnly ? parseInt(id.replace('tmdb-', '')) : null;
  const [item, setItem] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [showTmdbInput, setShowTmdbInput] = useState(false);
  const [tmdbId, setTmdbId] = useState('');
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbMessage, setTmdbMessage] = useState(null);
  const [imageCacheBust, setImageCacheBust] = useState('');
  const [usingTmdbSeasons, setUsingTmdbSeasons] = useState(false);

  // Watch providers state
  const [watchProviders, setWatchProviders] = useState(null);

  // External URL state (per admins)
  const [showExternalUrlInput, setShowExternalUrlInput] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalUrlLoading, setExternalUrlLoading] = useState(false);

  // Scroll de temporades
  const seasonsScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Watchlist state
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Preloading state - per mostrar estat al botó de reproducció
  // Inicialitzar a true perquè mostri "Preparant..." des del principi
  const [streamPreloading, setStreamPreloading] = useState(true);
  const [streamReady, setStreamReady] = useState(false);

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
      // Si és contingut només de TMDB, carregar directament des de TMDB
      if (isTmdbOnly && realTmdbId) {
        if (type === 'series') {
          // Carregar detalls i temporades des de TMDB en paral·lel
          const [detailsRes, seasonsRes] = await Promise.all([
            axios.get(`/api/tmdb/tv/${realTmdbId}`),
            axios.get(`/api/tmdb/tv/${realTmdbId}/seasons`)
          ]);

          setItem(detailsRes.data);

          const tmdbSeasons = (seasonsRes.data.seasons || [])
            .filter(s => s.season_number > 0)
            .map(s => ({ ...s, hasLocalEpisodes: false }));

          setSeasons(tmdbSeasons);
          setUsingTmdbSeasons(true);
          if (tmdbSeasons.length > 0) {
            setSelectedSeason(tmdbSeasons[0].season_number);
          }
          // Episodis es carregaran via useEffect després de mostrar la pàgina
        } else {
          // Carregar detalls de pel·lícula des de TMDB
          const response = await axios.get(`/api/tmdb/movie/${realTmdbId}`);
          setItem(response.data);
        }
        setLoading(false);
        return;
      }

      // Contingut local (amb possible enriquiment TMDB)
      if (type === 'series') {
        const [seriesRes, seasonsRes] = await Promise.all([
          axios.get(`/api/library/series/${id}`),
          axios.get(`/api/library/series/${id}/seasons`)
        ]);
        const seriesData = seriesRes.data;
        setItem(seriesData);

        const localSeasons = seasonsRes.data || [];
        const localSeasonNums = new Set(localSeasons.map(s => s.season_number));

        // Sempre intentem carregar temporades TMDB si tenim tmdb_id
        // per permetre veure episodis via streaming de temporades que no tenim locals
        if (seriesData.tmdb_id) {
          try {
            const tmdbSeasonsRes = await axios.get(`/api/tmdb/tv/${seriesData.tmdb_id}/seasons`);
            if (tmdbSeasonsRes.data.seasons && tmdbSeasonsRes.data.seasons.length > 0) {
              // Combinar temporades locals i TMDB (unió)
              const tmdbSeasons = tmdbSeasonsRes.data.seasons.filter(s => s.season_number > 0);
              const allSeasonNumbers = new Set([
                ...localSeasons.map(s => s.season_number),
                ...tmdbSeasons.map(s => s.season_number)
              ]);

              // Crear llista combinada, preferint dades TMDB per la info però marcant si és local
              const combinedSeasons = Array.from(allSeasonNumbers)
                .sort((a, b) => a - b)
                .map(num => {
                  const tmdbSeason = tmdbSeasons.find(s => s.season_number === num);
                  const localSeason = localSeasons.find(s => s.season_number === num);
                  return {
                    ...tmdbSeason,
                    ...localSeason,
                    season_number: num,
                    hasLocalEpisodes: localSeasonNums.has(num)
                  };
                });

              setSeasons(combinedSeasons);
              // Seleccionar la primera temporada que tingui episodis locals, o la primera disponible
              const firstLocalSeason = combinedSeasons.find(s => s.hasLocalEpisodes);
              const selectedSeasonNum = firstLocalSeason ? firstLocalSeason.season_number : combinedSeasons[0].season_number;
              setSelectedSeason(selectedSeasonNum);
              setUsingTmdbSeasons(true);
              // Episodis es carregaran via useEffect després de mostrar la pàgina
            } else if (localSeasons.length > 0) {
              // No hi ha TMDB, només locals
              setSeasons(localSeasons.map(s => ({ ...s, hasLocalEpisodes: true })));
              setSelectedSeason(localSeasons[0].season_number);
              setUsingTmdbSeasons(false);
            }
          } catch (tmdbErr) {
            console.error('Error carregant temporades TMDB:', tmdbErr);
            // Si falla TMDB, usar només locals
            if (localSeasons.length > 0) {
              setSeasons(localSeasons.map(s => ({ ...s, hasLocalEpisodes: true })));
              setSelectedSeason(localSeasons[0].season_number);
              setUsingTmdbSeasons(false);
            }
          }
        } else if (localSeasons.length > 0) {
          // No hi ha tmdb_id, només locals
          setSeasons(localSeasons.map(s => ({ ...s, hasLocalEpisodes: true })));
          setSelectedSeason(localSeasons[0].season_number);
          setUsingTmdbSeasons(false);
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
  }, [type, id, isTmdbOnly, realTmdbId]);

  const loadEpisodes = useCallback(async (seasonNum, isTmdb = false, tmdbIdParam = null) => {
    const effectiveTmdbId = isTmdbOnly ? realTmdbId : tmdbIdParam;
    const cacheKey = `hermes_episodes_v2_${effectiveTmdbId || id}_s${seasonNum}`;

    // Comprovar cache del frontend (1 hora)
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const oneHour = 60 * 60 * 1000;
        if (Date.now() - timestamp < oneHour && data.length > 0) {
          setEpisodes(data);
          setLoadingEpisodes(false);
          return;
        }
      }
    } catch (e) {
      // Cache error, continuar amb fetch
    }

    setLoadingEpisodes(true);
    setEpisodes([]); // Clear episodes while loading
    try {
      // Per contingut TMDB-only, carregar directament des de TMDB
      if (isTmdbOnly && realTmdbId) {
        // Contingut només TMDB - carregar directament
        const tmdbRes = await axios.get(`/api/tmdb/tv/${realTmdbId}/season/${seasonNum}`);
        if (tmdbRes.data.episodes) {
          const episodes = tmdbRes.data.episodes.map(ep => ({
            ...ep,
            isLocal: false,
            duration: ep.runtime ? ep.runtime * 60 : null
          }));
          setEpisodes(episodes);
          // Guardar al cache
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ data: episodes, timestamp: Date.now() }));
          } catch (e) { /* sessionStorage ple */ }
        }
        return;
      }

      // PARAL·LELITZAR: Carregar episodis locals i TMDB alhora
      const localPromise = axios.get(`/api/library/series/${id}/seasons/${seasonNum}/episodes`)
        .then(res => res.data || [])
        .catch(() => []); // No hi ha episodis locals per aquesta temporada

      const tmdbPromise = effectiveTmdbId
        ? axios.get(`/api/tmdb/tv/${effectiveTmdbId}/season/${seasonNum}`)
            .then(res => res.data.episodes || [])
            .catch(() => [])
        : Promise.resolve([]);

      const [localEpisodes, tmdbEpisodes] = await Promise.all([localPromise, tmdbPromise]);

      // Crear mapa d'episodis locals per número d'episodi
      const localEpMap = {};
      localEpisodes.forEach(ep => {
        localEpMap[ep.episode_number] = ep;
      });

      // Si tenim episodis TMDB, combinar amb locals
      if (tmdbEpisodes.length > 0) {
        const combinedEpisodes = tmdbEpisodes.map(tmdbEp => {
          const localEp = localEpMap[tmdbEp.episode_number];
          return {
            ...tmdbEp,
            isLocal: !!localEp,
            localId: localEp?.id,
            localData: localEp,
            // Mantenir audio_tracks i subtitles del local si existeix
            audio_tracks: localEp?.audio_tracks,
            subtitles: localEp?.subtitles || localEp?.subtitle_tracks,
            duration: localEp?.duration || (tmdbEp.runtime ? tmdbEp.runtime * 60 : null),
            watch_progress: localEp?.watch_progress || 0
          };
        });
        setEpisodes(combinedEpisodes);
        // Guardar al cache
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ data: combinedEpisodes, timestamp: Date.now() }));
        } catch (e) { /* sessionStorage ple */ }
        return;
      }

      // Si no hi ha TMDB, mostrar només locals (marcats com a locals)
      const localOnlyEpisodes = localEpisodes.map(ep => ({
        ...ep,
        isLocal: true,
        localId: ep.id,
        localData: ep
      }));
      setEpisodes(localOnlyEpisodes);
      // Guardar al cache
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: localOnlyEpisodes, timestamp: Date.now() }));
      } catch (e) { /* sessionStorage ple */ }
    } catch (error) {
      console.error('Error carregant episodis:', error);
      setEpisodes([]);
    } finally {
      setLoadingEpisodes(false);
    }
  }, [id, isTmdbOnly, realTmdbId]);

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
      // Usar realTmdbId per TMDB-only o item.tmdb_id per contingut local
      const tmdbIdToUse = isTmdbOnly ? realTmdbId : item?.tmdb_id;
      if (!tmdbIdToUse) return;

      try {
        const mediaType = type === 'movies' ? 'movie' : 'series';
        const response = await axios.get(`/api/watch-providers/${mediaType}/${tmdbIdToUse}`);
        setWatchProviders(response.data);
      } catch (err) {
        console.error('Error carregant proveïdors:', err);
      }
    };

    loadWatchProviders();
  }, [item?.tmdb_id, type, isTmdbOnly, realTmdbId]);

  useEffect(() => {
    if (type === 'series' && seasons.length > 0) {
      loadEpisodes(selectedSeason, usingTmdbSeasons, item?.tmdb_id);
    }
  }, [type, selectedSeason, seasons, loadEpisodes, usingTmdbSeasons, item?.tmdb_id]);

  // Trobar el proper episodi a reproduir (continuar o primer)
  const getNextEpisode = () => {
    if (type === 'movies' || !episodes.length) return null;

    // Buscar episodi en progrés (0 < progress < 90)
    const inProgressEp = episodes.find(ep => ep.watch_progress > 0 && ep.watch_progress < 90);
    if (inProgressEp) {
      return { season: selectedSeason, episode: inProgressEp.episode_number };
    }

    // Buscar primer episodi no vist completament
    const unwatchedEp = episodes.find(ep => !ep.watch_progress || ep.watch_progress < 90);
    if (unwatchedEp) {
      return { season: selectedSeason, episode: unwatchedEp.episode_number };
    }

    // Si tots estan vistos, reproduir el primer
    return { season: selectedSeason, episode: episodes[0]?.episode_number || 1 };
  };

  const nextEpisode = type === 'series' ? getNextEpisode() : null;

  const handlePlay = () => {
    if (type === 'movies') {
      if (item?.tmdb_id) {
        navigate(`/debrid/movie/${item.tmdb_id}`);
      }
    } else {
      if (item?.tmdb_id && nextEpisode) {
        navigate(`/debrid/tv/${item.tmdb_id}?s=${nextEpisode.season}&e=${nextEpisode.episode}`);
      }
    }
  };

  // Watchlist functions
  const checkWatchlist = useCallback(async () => {
    if (!isAuthenticated || !item) return;

    const tmdbIdToCheck = isTmdbOnly ? realTmdbId : item.tmdb_id;
    if (!tmdbIdToCheck) return;

    try {
      const mediaType = type === 'movies' ? 'movie' : 'series';
      const response = await axios.get(`/api/user/watchlist/check/${tmdbIdToCheck}?media_type=${mediaType}`);
      setIsInWatchlist(response.data.in_watchlist);
    } catch (error) {
      console.error('Error checking watchlist:', error);
    }
  }, [isAuthenticated, item, isTmdbOnly, realTmdbId, type]);

  const toggleWatchlist = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const tmdbIdToUse = isTmdbOnly ? realTmdbId : item?.tmdb_id;
    if (!tmdbIdToUse) return;

    setWatchlistLoading(true);
    const mediaType = type === 'movies' ? 'movie' : 'series';

    try {
      if (isInWatchlist) {
        await axios.delete(`/api/user/watchlist/${tmdbIdToUse}?media_type=${mediaType}`);
        setIsInWatchlist(false);
      } else {
        await axios.post('/api/user/watchlist', {
          tmdb_id: tmdbIdToUse,
          media_type: mediaType,
          title: item?.title || item?.name,
          poster_path: item?.poster || item?.poster_path,
          backdrop_path: item?.backdrop || item?.backdrop_path,
          year: item?.year,
          rating: item?.rating
        });
        setIsInWatchlist(true);
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    } finally {
      setWatchlistLoading(false);
    }
  };

  // Check watchlist when item loads
  useEffect(() => {
    if (item) {
      checkWatchlist();
    }
  }, [item, checkWatchlist]);

  // Precarregar torrents en background quan es carrega la pàgina de detalls
  // Prioritza la qualitat automàtica primer, i després carrega la resta en background
  useEffect(() => {
    const preloadStreams = async () => {
      // Només precarregar si l'usuari és premium i tenim tmdb_id
      const tmdbIdToUse = isTmdbOnly ? realTmdbId : item?.tmdb_id;
      if (!isPremium || !tmdbIdToUse) return;

      // Reset estat quan canvia el contingut
      setStreamReady(false);
      setStreamPreloading(true);

      try {
        if (type === 'movies') {
          // Per pel·lícules, precarregar directament
          console.log('[Details] Precarregant torrents per pel·lícula...');
          const torrents = await preloadTorrents('movie', tmdbIdToUse);
          if (torrents?.length > 0) {
            // AWAIT per assegurar que el stream estigui llest abans de permetre reproduir
            const result = await preloadAutoQualityFirst(torrents);
            if (result?.autoUrl) {
              console.log('[Details] Stream preparat per reproducció instantània!');
              setStreamReady(true);
            }
          }
        } else if (type === 'series' && nextEpisode) {
          // Per sèries, precarregar l'episodi que es reproduirà (nextEpisode, no sempre el primer!)
          console.log(`[Details] Precarregant torrents per S${nextEpisode.season}E${nextEpisode.episode}...`);
          const torrents = await preloadTorrents('tv', tmdbIdToUse, nextEpisode.season, nextEpisode.episode);
          if (torrents?.length > 0) {
            // AWAIT per assegurar que el stream estigui llest abans de permetre reproduir
            const result = await preloadAutoQualityFirst(torrents);
            if (result?.autoUrl) {
              console.log('[Details] Stream preparat per reproducció instantània!');
              setStreamReady(true);
            }
          }
        }
      } catch (err) {
        console.error('[Details] Error precarregant:', err);
      } finally {
        setStreamPreloading(false);
      }
    };

    preloadStreams();
  }, [item, nextEpisode, type, isPremium, isTmdbOnly, realTmdbId, preloadTorrents, preloadAutoQualityFirst]);

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

  // formatDuration is now imported from config/api.js

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
            backgroundImage: isTmdbOnly
              ? (item.backdrop ? `url(${item.backdrop})` : item.poster ? `url(${item.poster})` : 'none')
              : (item.backdrop
                ? `url(${getBackdropUrl(item.id, imageCacheBust)})`
                : item.poster
                ? `url(${getPosterUrl(item.id, imageCacheBust)})`
                : 'none')
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
                <span className="meta-item genres">
                  {item.genres.map(g => typeof g === 'object' ? g.name : g).filter(Boolean).join(', ')}
                </span>
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
              {/* Botó de reproducció només visible per usuaris premium */}
              {isPremium && item?.tmdb_id && (
                <button
                  className={`play-btn ${!streamReady ? 'loading' : ''}`}
                  onClick={handlePlay}
                  disabled={!streamReady}
                >
                  {!streamReady ? (
                    <>
                      <span className="play-btn-spinner"></span>
                      Preparant...
                    </>
                  ) : (
                    <>
                      <PlayIcon />
                      {type === 'series' && nextEpisode
                        ? `Capítol ${nextEpisode.episode}`
                        : 'Reproduir'}
                    </>
                  )}
                </button>
              )}
              {/* Botó de watchlist */}
              <button
                className={`watchlist-btn ${isInWatchlist ? 'active' : ''}`}
                onClick={toggleWatchlist}
                disabled={watchlistLoading}
                title={isInWatchlist ? 'Eliminar de la llista' : 'Afegir a la llista'}
              >
                <BookmarkIcon filled={isInWatchlist} />
                {isInWatchlist ? 'A la llista' : 'Afegir a la llista'}
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
                        key={season.id || `tmdb-season-${season.season_number}`}
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

          {loadingEpisodes ? (
            <div className="episodes-loading">
              <div className="episodes-loading-spinner"></div>
              <span>Carregant episodis...</span>
            </div>
          ) : (
          <div className="episodes-grid">
            {episodes.map((episode) => (
              <div
                key={episode.id || episode.episode_number}
                className="episode-card"
              >
                <div
                  className="episode-thumbnail"
                  style={{ cursor: isPremium && item?.tmdb_id ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (isPremium && item?.tmdb_id) {
                      navigate(`/debrid/tv/${item.tmdb_id}?s=${selectedSeason}&e=${episode.episode_number}`);
                    }
                  }}
                >
                  {episode.still_path ? (
                    <img
                      src={episode.still_path}
                      alt={episode.name}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <span className="episode-number" style={{ display: !episode.still_path ? 'flex' : 'none' }}>{episode.episode_number}</span>
                  {isPremium && item?.tmdb_id && (
                    <div className="episode-play-icon"><PlayIcon size={20} /></div>
                  )}
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
                    {(episode.duration || episode.runtime) && (
                      <span>{formatDuration((episode.runtime || 0) * 60 || episode.duration)}</span>
                    )}
                    {episode.air_date && (
                      <span>{new Date(episode.air_date).toLocaleDateString('ca-ES')}</span>
                    )}
                    {episode.vote_average > 0 && (
                      <span className="meta-item rating"><StarIcon /> {episode.vote_average.toFixed(1)}</span>
                    )}
                  </div>
                  {episode.overview && (
                    <div className="episode-overview">{episode.overview.slice(0, 120)}{episode.overview.length > 120 ? '...' : ''}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}

          {!loadingEpisodes && episodes.length === 0 && (
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
