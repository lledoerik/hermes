import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useStreamCache } from '../context/StreamCacheContext';
import TitleAudioPlayer from '../components/TitleAudioPlayer';
import LazyImage from '../components/LazyImage';
import { API_URL, getBackdropUrl, getPosterUrl, formatDuration, getTmdbImageUrl } from '../config/api';
import {
  StarIcon,
  PlayIcon,
  EditIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BookmarkIcon
} from '../components/icons';
import './Details.css';

// One Piece TMDB ID - per compatibilitat amb endpoint antic
const ONE_PIECE_TMDB_ID = 37854;

// Client axios amb timeout per evitar peticions penjades indefinidament
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 segons màxim per petició
});

// Afegir interceptor per autenticació
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hermes_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function Details() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isPremium, isAuthenticated } = useAuth();
  const { preloadWithHighPriority } = useStreamCache();

  // Determinar el tipus segons la ruta
  const type = location.pathname.startsWith('/movies') ? 'movies' : 'series';

  // Detectar si és contingut només de TMDB (ID comença amb "tmdb-")
  const isTmdbOnly = id.startsWith('tmdb-');
  const realTmdbId = isTmdbOnly ? parseInt(id.replace('tmdb-', '')) : null;
  const [item, setItem] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(1);

  // BBC content mode (generic - works with any BBC-mapped content)
  const [hasBbcContent, setHasBbcContent] = useState(false);
  const [bbcSeasons, setBbcSeasons] = useState([]);
  const [bbcContentInfo, setBbcContentInfo] = useState(null);
  const [selectedArc, setSelectedArc] = useState(null);

  // Legacy aliases for backwards compatibility
  const isOnePiece = hasBbcContent;
  const onePieceArcs = bbcSeasons;

  // Handler per canviar de temporada/arc
  const handleSeasonSelect = useCallback((seasonNum) => {
    setSelectedSeason(seasonNum);
    // If One Piece, also update selectedArc
    if (isOnePiece && onePieceArcs.length > 0) {
      const arc = onePieceArcs.find(a => a.season_number === seasonNum);
      setSelectedArc(arc || null);
      // Save selected arc
      const storageKey = `hermes_selected_arc_${id}`;
      localStorage.setItem(storageKey, seasonNum.toString());
    }
  }, [isOnePiece, onePieceArcs, id]);

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

  // Drag-to-scroll per temporades
  const [isDragging, setIsDragging] = useState(false);
  const isMouseDown = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  // Watchlist state
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Preloading state - per mostrar estat al botó de reproducció
  const [streamReady, setStreamReady] = useState(false);
  const [earlyPreloadStarted, setEarlyPreloadStarted] = useState(false);

  // Guardar temporada seleccionada a localStorage quan canvia (després de la càrrega inicial)
  useEffect(() => {
    // Només guardar després de la càrrega inicial i per sèries
    if (!loading && seasons.length > 0 && type === 'series') {
      const storageKey = `hermes_selected_season_${id}`;
      try {
        localStorage.setItem(storageKey, selectedSeason.toString());
      } catch (e) {
        // localStorage no disponible o ple
      }
    }
  }, [selectedSeason, loading, seasons.length, id, type]);

  // PRELOAD PRIMERENC: Començar a precarregar immediatament amb dades de localStorage
  // Això permet carregar el stream en paral·lel amb les metadades dels episodis
  useEffect(() => {
    if (earlyPreloadStarted || type !== 'series' || !isPremium) return;

    // Obtenir tmdb_id - pot ser de l'URL (tmdb-XXX) o de l'item carregat
    const tmdbIdToUse = isTmdbOnly ? realTmdbId : null;
    if (!tmdbIdToUse && !item?.tmdb_id) return; // Esperar a tenir tmdb_id

    const effectiveTmdbId = tmdbIdToUse || item?.tmdb_id;

    // Llegir temporada i episodi guardats de localStorage
    const seasonKey = `hermes_selected_season_${id}`;
    const episodeKey = `hermes_last_episode_${effectiveTmdbId}`;

    const savedSeason = localStorage.getItem(seasonKey);
    const savedEpisodeData = localStorage.getItem(episodeKey);

    let seasonToPreload = savedSeason ? parseInt(savedSeason) : 1;
    let episodeToPreload = 1;

    if (savedEpisodeData) {
      try {
        const { season, episode } = JSON.parse(savedEpisodeData);
        // Usar l'episodi guardat si és de la mateixa temporada
        if (season === seasonToPreload) {
          episodeToPreload = episode;
        }
      } catch (e) {
        // JSON invàlid, usar valors per defecte
      }
    }

    setEarlyPreloadStarted(true);
    console.log(`[Details] PRELOAD PRIMERENC: S${seasonToPreload}E${episodeToPreload} (paral·lel amb metadades)`);

    // Iniciar preload sense esperar - el useEffect principal actualitzarà si cal
    preloadWithHighPriority('tv', effectiveTmdbId, seasonToPreload, episodeToPreload)
      .then(result => {
        if (result?.success) {
          console.log('[Details] Preload primerenc completat!');
          setStreamReady(true);
        }
      })
      .catch(err => {
        console.log('[Details] Preload primerenc fallat, esperant preload normal');
      });
  }, [type, isPremium, isTmdbOnly, realTmdbId, item?.tmdb_id, id, earlyPreloadStarted, preloadWithHighPriority]);

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

  // Drag-to-scroll handlers per temporades
  const handleDragStart = useCallback((e) => {
    const container = seasonsScrollRef.current;
    if (!container) return;
    isMouseDown.current = true;
    dragStartX.current = e.pageX - container.offsetLeft;
    dragScrollLeft.current = container.scrollLeft;
  }, []);

  const handleDragEnd = useCallback(() => {
    isMouseDown.current = false;
    setIsDragging(false);
    const container = seasonsScrollRef.current;
    if (container) {
      container.style.scrollBehavior = 'smooth';
    }
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!isMouseDown.current) return;
    const container = seasonsScrollRef.current;
    if (!container) return;

    const x = e.pageX - container.offsetLeft;
    const walk = (x - dragStartX.current) * 1.5;

    // Només activar dragging si hi ha moviment significatiu (>5px)
    if (!isDragging && Math.abs(walk) > 5) {
      setIsDragging(true);
      container.style.scrollBehavior = 'auto';
    }

    if (isDragging) {
      e.preventDefault();
      container.scrollLeft = dragScrollLeft.current - walk;
    }
  }, [isDragging]);

  useEffect(() => {
    checkScrollButtons();
    window.addEventListener('resize', checkScrollButtons);
    return () => window.removeEventListener('resize', checkScrollButtons);
  }, [checkScrollButtons, seasons]);

  // Load BBC content (seasons/arcs) from API - generic for any BBC-mapped content
  const loadBbcContent = useCallback(async (tmdbId) => {
    try {
      // Try generic BBC endpoint first
      const response = await api.get(`/api/bbc/content/${tmdbId}/seasons`);
      if (response.data.seasons && response.data.seasons.length > 0) {
        const seasons = response.data.seasons.map((season) => ({
          id: `bbc-season-${season.season_number}`,
          season_number: season.season_number,
          name: season.name,
          start_episode: season.start_episode,
          end_episode: season.end_episode,
          episode_count: season.total_episodes,
          available_episodes: season.available_episodes,
          bbc_available: season.available_episodes > 0,
          isArc: true,
          isBbc: true
        }));
        setBbcSeasons(seasons);
        setBbcContentInfo({
          title: response.data.title,
          tmdb_id: tmdbId
        });
        return seasons;
      }
    } catch (err) {
      // If generic endpoint fails, try One Piece specific endpoint as fallback
      if (tmdbId === ONE_PIECE_TMDB_ID) {
        try {
          const response = await api.get('/api/bbc/onepiece/arcs');
          if (response.data.arcs) {
            const arcs = response.data.arcs.map((arc, index) => ({
              id: `arc-${index}`,
              season_number: index + 1,
              name: arc.name,
              name_en: arc.name_en,
              tmdb_start: arc.tmdb_start,
              tmdb_end: arc.tmdb_end,
              start_episode: arc.tmdb_start,
              end_episode: arc.tmdb_end,
              episode_count: arc.episode_count,
              bbc_available: arc.bbc_available,
              isArc: true
            }));
            setBbcSeasons(arcs);
            setBbcContentInfo({ title: 'One Piece', tmdb_id: tmdbId });
            return arcs;
          }
        } catch (opErr) {
          console.error('Error loading One Piece arcs:', opErr);
        }
      }
    }
    return null;
  }, []);

  // Legacy alias for backwards compatibility
  const loadOnePieceArcs = useCallback(async () => {
    return loadBbcContent(ONE_PIECE_TMDB_ID);
  }, [loadBbcContent]);

  const loadDetails = useCallback(async () => {
    try {
      // Si és contingut només de TMDB, carregar directament des de TMDB
      if (isTmdbOnly && realTmdbId) {
        if (type === 'series') {
          // Carregar detalls i temporades des de TMDB en paral·lel
          const [detailsRes, seasonsRes] = await Promise.all([
            api.get(`/api/tmdb/tv/${realTmdbId}`),
            api.get(`/api/tmdb/tv/${realTmdbId}/seasons`)
          ]);

          setItem(detailsRes.data);

          // Check if this content has BBC mapping (generic - any content)
          const bbcContent = await loadBbcContent(realTmdbId);
          if (bbcContent && bbcContent.length > 0) {
            setHasBbcContent(true);
            setSeasons(bbcContent);
            // Find saved arc/season or use first
            const storageKey = `hermes_selected_arc_${id}`;
            const savedArc = localStorage.getItem(storageKey);
            const savedArcNum = savedArc ? parseInt(savedArc) : null;
            if (savedArcNum && bbcContent.some(a => a.season_number === savedArcNum)) {
              setSelectedSeason(savedArcNum);
              setSelectedArc(bbcContent.find(a => a.season_number === savedArcNum));
            } else {
              setSelectedSeason(bbcContent[0].season_number);
              setSelectedArc(bbcContent[0]);
            }
            setUsingTmdbSeasons(true);
            setLoading(false);
            return;
          }

          const tmdbSeasons = (seasonsRes.data.seasons || [])
            .filter(s => s.season_number > 0)
            .map(s => ({ ...s, hasLocalEpisodes: false }));

          setSeasons(tmdbSeasons);
          setUsingTmdbSeasons(true);
          if (tmdbSeasons.length > 0) {
            // Comprovar si hi ha temporada guardada a localStorage
            const storageKey = `hermes_selected_season_${id}`;
            const savedSeason = localStorage.getItem(storageKey);
            const savedSeasonNum = savedSeason ? parseInt(savedSeason) : null;

            // Si hi ha temporada guardada i és vàlida, usar-la
            if (savedSeasonNum && tmdbSeasons.some(s => s.season_number === savedSeasonNum)) {
              setSelectedSeason(savedSeasonNum);
            } else {
              setSelectedSeason(tmdbSeasons[0].season_number);
            }
          }
          // Episodis es carregaran via useEffect després de mostrar la pàgina
        } else {
          // Carregar detalls de pel·lícula des de TMDB
          const response = await api.get(`/api/tmdb/movie/${realTmdbId}`);
          setItem(response.data);
        }
        setLoading(false);
        return;
      }

      // Contingut local (amb possible enriquiment TMDB i AniList)
      if (type === 'series') {
        const [seriesRes, seasonsRes] = await Promise.all([
          // Usar endpoint enriquit per obtenir títols d'anime millorats i artwork fallback
          api.get(`/api/library/series/${id}/enriched`).catch(() => api.get(`/api/library/series/${id}`)),
          api.get(`/api/library/series/${id}/seasons`)
        ]);
        const seriesData = seriesRes.data;
        setItem(seriesData);

        const localSeasons = seasonsRes.data || [];
        const localSeasonNums = new Set(localSeasons.map(s => s.season_number));

        // Sempre intentem carregar temporades TMDB si tenim tmdb_id
        // per permetre veure episodis via streaming de temporades que no tenim locals
        if (seriesData.tmdb_id) {
          try {
            const tmdbSeasonsRes = await api.get(`/api/tmdb/tv/${seriesData.tmdb_id}/seasons`);
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

              // Comprovar si hi ha temporada guardada a localStorage
              const storageKey = `hermes_selected_season_${id}`;
              const savedSeason = localStorage.getItem(storageKey);
              const savedSeasonNum = savedSeason ? parseInt(savedSeason) : null;

              // Si hi ha temporada guardada i és vàlida, usar-la
              if (savedSeasonNum && combinedSeasons.some(s => s.season_number === savedSeasonNum)) {
                setSelectedSeason(savedSeasonNum);
              } else {
                // Seleccionar la primera temporada que tingui episodis locals, o la primera disponible
                const firstLocalSeason = combinedSeasons.find(s => s.hasLocalEpisodes);
                const selectedSeasonNum = firstLocalSeason ? firstLocalSeason.season_number : combinedSeasons[0].season_number;
                setSelectedSeason(selectedSeasonNum);
              }
              setUsingTmdbSeasons(true);
              // Episodis es carregaran via useEffect després de mostrar la pàgina
            } else if (localSeasons.length > 0) {
              // No hi ha TMDB, només locals
              const mappedSeasons = localSeasons.map(s => ({ ...s, hasLocalEpisodes: true }));
              setSeasons(mappedSeasons);

              // Comprovar si hi ha temporada guardada a localStorage
              const storageKey = `hermes_selected_season_${id}`;
              const savedSeason = localStorage.getItem(storageKey);
              const savedSeasonNum = savedSeason ? parseInt(savedSeason) : null;

              if (savedSeasonNum && mappedSeasons.some(s => s.season_number === savedSeasonNum)) {
                setSelectedSeason(savedSeasonNum);
              } else {
                setSelectedSeason(localSeasons[0].season_number);
              }
              setUsingTmdbSeasons(false);
            }
          } catch (tmdbErr) {
            console.error('Error carregant temporades TMDB:', tmdbErr);
            // Si falla TMDB, usar només locals
            if (localSeasons.length > 0) {
              const mappedSeasons = localSeasons.map(s => ({ ...s, hasLocalEpisodes: true }));
              setSeasons(mappedSeasons);

              // Comprovar si hi ha temporada guardada a localStorage
              const storageKey = `hermes_selected_season_${id}`;
              const savedSeason = localStorage.getItem(storageKey);
              const savedSeasonNum = savedSeason ? parseInt(savedSeason) : null;

              if (savedSeasonNum && mappedSeasons.some(s => s.season_number === savedSeasonNum)) {
                setSelectedSeason(savedSeasonNum);
              } else {
                setSelectedSeason(localSeasons[0].season_number);
              }
              setUsingTmdbSeasons(false);
            }
          }
        } else if (localSeasons.length > 0) {
          // No hi ha tmdb_id, només locals
          const mappedSeasons = localSeasons.map(s => ({ ...s, hasLocalEpisodes: true }));
          setSeasons(mappedSeasons);

          // Comprovar si hi ha temporada guardada a localStorage
          const storageKey = `hermes_selected_season_${id}`;
          const savedSeason = localStorage.getItem(storageKey);
          const savedSeasonNum = savedSeason ? parseInt(savedSeason) : null;

          if (savedSeasonNum && mappedSeasons.some(s => s.season_number === savedSeasonNum)) {
            setSelectedSeason(savedSeasonNum);
          } else {
            setSelectedSeason(localSeasons[0].season_number);
          }
          setUsingTmdbSeasons(false);
        }
      } else {
        const response = await api.get(`/api/library/movies/${id}`);
        setItem(response.data);
      }
    } catch (error) {
      console.error('Error carregant detalls:', error);
    } finally {
      setLoading(false);
    }
  }, [type, id, isTmdbOnly, realTmdbId, loadBbcContent]);

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
    console.log('[Details] loadEpisodes called:', { seasonNum, hasBbcContent, bbcSeasonsLength: bbcSeasons.length, effectiveTmdbId, isTmdbOnly });
    try {
      // BBC CONTENT: Carregar episodis de la temporada/arc BBC
      if (hasBbcContent && bbcSeasons.length > 0) {
        const season = bbcSeasons.find(s => s.season_number === seasonNum);
        console.log('[Details] BBC content mode, season found:', season?.name);
        if (season) {
          try {
            // Try generic BBC endpoint
            const bbcRes = await api.get(`/api/bbc/content/${effectiveTmdbId}/seasons/${seasonNum}/episodes`);
            if (bbcRes.data.episodes && bbcRes.data.episodes.length > 0) {
              const bbcEpisodes = bbcRes.data.episodes.map(ep => ({
                // BBC episode data
                episode_number: ep.episode_number,
                name: ep.title || `Episodi ${ep.episode_number}`,
                overview: ep.description || '',
                still_path: ep.thumbnail ? ep.thumbnail : null,
                runtime: ep.duration ? Math.round(ep.duration / 60) : 24,
                isLocal: false,
                duration: ep.duration || null,
                programme_id: ep.programme_id,
                isBbc: true
              }));
              setEpisodes(bbcEpisodes);
              // Guardar al cache
              try {
                const bbcCacheKey = `hermes_bbc_${effectiveTmdbId}_s${seasonNum}`;
                sessionStorage.setItem(bbcCacheKey, JSON.stringify({ data: bbcEpisodes, timestamp: Date.now() }));
              } catch (e) { /* sessionStorage ple */ }
              setLoadingEpisodes(false);
              return;
            }
          } catch (err) {
            console.log('[Details] Generic BBC endpoint failed, trying One Piece fallback...', err.response?.status);
            // Fallback: Try One Piece specific endpoint
            if (effectiveTmdbId === ONE_PIECE_TMDB_ID) {
              const arcIndex = seasonNum - 1;
              try {
                console.log(`[Details] Fetching One Piece arc ${arcIndex} episodes...`);
                const arcRes = await api.get(`/api/bbc/onepiece/arc/${arcIndex}/episodes`);
                console.log('[Details] One Piece arc response:', arcRes.data?.count, 'episodes');
                if (arcRes.data.episodes && arcRes.data.episodes.length > 0) {
                  const arcEpisodes = arcRes.data.episodes.map(ep => ({
                    ...ep,
                    episode_number: ep.episode_number,
                    name: ep.name || `Episodi ${ep.episode_number}`,
                    overview: ep.overview,
                    still_path: ep.still_path,
                    air_date: ep.air_date,
                    runtime: ep.runtime,
                    vote_average: ep.vote_average,
                    isLocal: false,
                    duration: ep.runtime ? ep.runtime * 60 : null,
                    _tmdb_season: ep.tmdb_season,
                    _tmdb_episode: ep.tmdb_episode
                  }));
                  setEpisodes(arcEpisodes);
                  try {
                    const arcCacheKey = `hermes_onepiece_arc_${arcIndex}`;
                    sessionStorage.setItem(arcCacheKey, JSON.stringify({ data: arcEpisodes, timestamp: Date.now() }));
                  } catch (e) { /* sessionStorage ple */ }
                  setLoadingEpisodes(false);
                  return;
                }
              } catch (opErr) {
                console.error('[Details] Error loading One Piece arc episodes:', opErr.response?.status, opErr.message);
              }
            }
          }
          // Si hem arribat aquí, cap endpoint BBC ha funcionat - NO fem return
          console.log('[Details] BBC endpoints failed, will try TMDB fallback');
        }
      }

      // Per contingut TMDB-only, carregar directament des de TMDB
      if (isTmdbOnly && realTmdbId) {
        // Contingut només TMDB - carregar directament
        const tmdbRes = await api.get(`/api/tmdb/tv/${realTmdbId}/season/${seasonNum}`);
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
      const localPromise = api.get(`/api/library/series/${id}/seasons/${seasonNum}/episodes`)
        .then(res => res.data || [])
        .catch(() => []); // No hi ha episodis locals per aquesta temporada

      const tmdbPromise = effectiveTmdbId
        ? api.get(`/api/tmdb/tv/${effectiveTmdbId}/season/${seasonNum}`)
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
  }, [id, isTmdbOnly, realTmdbId, hasBbcContent, bbcSeasons]);

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
        const response = await api.get(`/api/watch-providers/${mediaType}/${tmdbIdToUse}`);
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
  // Memoitzat per evitar recrear l'objecte cada renderització (causava infinite loop)
  const nextEpisode = useMemo(() => {
    if (type !== 'series' || !episodes.length) return null;

    // Buscar episodi en progrés (0 < progress < 90)
    const inProgressEp = episodes.find(ep => ep.watch_progress > 0 && ep.watch_progress < 90);
    if (inProgressEp) {
      return { season: selectedSeason, episode: inProgressEp.episode_number, hasProgress: true };
    }

    // Buscar primer episodi no vist completament
    const unwatchedEp = episodes.find(ep => !ep.watch_progress || ep.watch_progress < 90);
    if (unwatchedEp) {
      // Comprovar si hi ha algun episodi amb progrés (per saber si és "continuar" o "reproduir")
      const anyProgress = episodes.some(ep => ep.watch_progress > 0);
      return { season: selectedSeason, episode: unwatchedEp.episode_number, hasProgress: anyProgress };
    }

    // Si tots estan vistos, reproduir el primer
    return { season: selectedSeason, episode: episodes[0]?.episode_number || 1, hasProgress: true };
  }, [type, episodes, selectedSeason]);

  // PROGRÉS GLOBAL DE LA SÈRIE: Per al botó principal (estil Netflix)
  // Busca el progrés de l'usuari a través de totes les temporades
  // Si l'usuari no ha començat la sèrie: "Reproduir" → S1E1
  // Si l'usuari té progrés: "Continuar T{X}:E{Y}" → Últim episodi vist
  const seriesProgress = useMemo(() => {
    if (type !== 'series') return null;

    const effectiveTmdbId = isTmdbOnly ? realTmdbId : item?.tmdb_id;
    if (!effectiveTmdbId) return null;

    // Llegir l'últim episodi vist des de localStorage
    const episodeKey = `hermes_last_episode_${effectiveTmdbId}`;
    try {
      const savedData = localStorage.getItem(episodeKey);
      if (savedData) {
        const { season, episode } = JSON.parse(savedData);
        // L'usuari té progrés - mostrar "Continuar"
        return { season, episode, hasProgress: true };
      }
    } catch (e) {
      // Error llegint localStorage
    }

    // L'usuari no ha començat - mostrar "Reproduir" (S1E1)
    return { season: 1, episode: 1, hasProgress: false };
  }, [type, isTmdbOnly, realTmdbId, item?.tmdb_id]);

  // Guardar últim episodi vist per al preload primerenc
  const saveLastEpisode = useCallback((tmdbId, season, episode) => {
    try {
      const key = `hermes_last_episode_${tmdbId}`;
      localStorage.setItem(key, JSON.stringify({ season, episode }));
    } catch (e) {
      // localStorage no disponible
    }
  }, []);

  const handlePlay = () => {
    if (type === 'movies') {
      // Si la pel·lícula té fitxer local, usar el player local
      if (item?.has_file && item?.id) {
        navigate(`/play/movie/${item.id}`);
      } else if (item?.tmdb_id) {
        // Si no té fitxer local, usar DebridPlayer amb Real-Debrid
        navigate(`/debrid/movie/${item.tmdb_id}`);
      }
    } else {
      // Usar seriesProgress per al botó principal (progrés global de la sèrie)
      const effectiveTmdbId = isTmdbOnly ? realTmdbId : item?.tmdb_id;
      if (effectiveTmdbId && seriesProgress) {
        // Guardar per al preload primerenc de la pròxima visita
        saveLastEpisode(effectiveTmdbId, seriesProgress.season, seriesProgress.episode);
        navigate(`/debrid/tv/${effectiveTmdbId}?s=${seriesProgress.season}&e=${seriesProgress.episode}`);
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
      const response = await api.get(`/api/user/watchlist/check/${tmdbIdToCheck}?media_type=${mediaType}`);
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
        await api.delete(`/api/user/watchlist/${tmdbIdToUse}?media_type=${mediaType}`);
        setIsInWatchlist(false);
      } else {
        await api.post('/api/user/watchlist', {
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

  // Precarregar torrents amb prioritat alta quan es carrega la pàgina de detalls
  // Usa el sistema de cua amb prioritats per no bloquejar altres precàrregues
  // IMPORTANT: Usem nextEpisode?.season i nextEpisode?.episode com a dependències
  // (valors primitius) en lloc de l'objecte nextEpisode per evitar reruns infinits
  const nextSeason = nextEpisode?.season;
  const nextEpisodeNum = nextEpisode?.episode;

  useEffect(() => {
    // Si el preload primerenc ja ha completat i és per sèries, comprovar si cal re-preload
    if (streamReady && type === 'series' && earlyPreloadStarted) {
      // El preload primerenc ja va, verificar si l'episodi correcte és diferent
      const tmdbIdToUse = isTmdbOnly ? realTmdbId : item?.tmdb_id;
      if (tmdbIdToUse && nextSeason && nextEpisodeNum) {
        const episodeKey = `hermes_last_episode_${tmdbIdToUse}`;
        const savedEpisodeData = localStorage.getItem(episodeKey);
        if (savedEpisodeData) {
          try {
            const { season, episode } = JSON.parse(savedEpisodeData);
            // Si l'episodi que es vol reproduir és diferent del precarregat, re-preload
            if (season !== nextSeason || episode !== nextEpisodeNum) {
              console.log(`[Details] Episodi canviat: guardat S${season}E${episode} → real S${nextSeason}E${nextEpisodeNum}`);
              preloadWithHighPriority('tv', tmdbIdToUse, nextSeason, nextEpisodeNum);
            }
          } catch (e) {}
        }
      }
      return;
    }

    // Timeout de seguretat: permetre reproducció després de 15s encara que no estigui preparat
    let safetyTimeout;

    const preloadStreams = async () => {
      // Només precarregar si l'usuari és premium i tenim tmdb_id
      const tmdbIdToUse = isTmdbOnly ? realTmdbId : item?.tmdb_id;
      if (!isPremium || !tmdbIdToUse) {
        setStreamReady(true); // Permetre reproduir sense precàrrega
        return;
      }

      // Si ja està preparat (pel preload primerenc), no fer res
      if (streamReady) return;

      // Timeout de seguretat: si el preload triga massa, permetre reproducció igualment
      safetyTimeout = setTimeout(() => {
        console.log('[Details] Timeout de seguretat - permetent reproducció');
        setStreamReady(true);
      }, 15000);

      try {
        if (type === 'movies') {
          console.log('[Details] Precarregant pel·lícula amb prioritat alta...');
          const result = await preloadWithHighPriority('movie', tmdbIdToUse);
          if (result?.success && result?.url) {
            console.log('[Details] Stream preparat per reproducció instantània!');
          }
          setStreamReady(true);
        } else if (type === 'series') {
          const seasonToLoad = nextSeason || selectedSeason;
          const episodeToLoad = nextEpisodeNum || 1;

          console.log(`[Details] Precarregant S${seasonToLoad}E${episodeToLoad} amb prioritat alta...`);
          const result = await preloadWithHighPriority('tv', tmdbIdToUse, seasonToLoad, episodeToLoad);
          if (result?.success && result?.url) {
            console.log('[Details] Stream preparat per reproducció instantània!');
          }
          setStreamReady(true);
        }
      } catch (err) {
        console.error('[Details] Error precarregant:', err);
        setStreamReady(true); // Permetre reproduir encara que falli
      } finally {
        clearTimeout(safetyTimeout);
      }
    };

    preloadStreams();

    return () => {
      if (safetyTimeout) clearTimeout(safetyTimeout);
    };
  }, [item?.tmdb_id, nextSeason, nextEpisodeNum, selectedSeason, type, isPremium, isTmdbOnly, realTmdbId, preloadWithHighPriority, streamReady, earlyPreloadStarted]);

  const handleUpdateByTmdbId = async () => {
    if (!tmdbId.trim()) {
      setTmdbMessage({ type: 'error', text: 'Introdueix un ID de TMDB' });
      return;
    }

    setTmdbLoading(true);
    setTmdbMessage(null);

    try {
      const response = await api.post(`/api/metadata/series/${id}/update-by-tmdb`, {
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
      await api.patch(`/api/series/${id}/external-url`, {
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

  // Skeleton loading state - smooth transition without blocking screen
  if (loading) {
    return (
      <div className="details-container">
        <div className="details-hero">
          <div className="hero-backdrop skeleton-bg" />
          <div className="hero-gradient" />
          <div className="hero-content">
            <div className="details-info">
              <div className="skeleton-title" style={{ width: '60%', height: '40px', background: 'var(--bg-elevated-2)', borderRadius: '8px', marginBottom: '16px' }} />
              <div className="skeleton-meta" style={{ width: '40%', height: '20px', background: 'var(--bg-elevated-2)', borderRadius: '4px', marginBottom: '24px' }} />
              <div className="skeleton-text" style={{ width: '100%', height: '80px', background: 'var(--bg-elevated-2)', borderRadius: '8px' }} />
            </div>
          </div>
        </div>
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
              {/* Botó de reproducció: fitxers locals (has_file) o streaming amb Real-Debrid (tmdb_id) */}
              {isPremium && (item?.has_file || item?.tmdb_id) && (
                <button
                  className={`play-btn ${!streamReady ? 'loading' : ''} ${type === 'series' && seriesProgress?.hasProgress ? 'continue-mode' : ''}`}
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
                      {type === 'series' && seriesProgress?.hasProgress ? (
                        <span className="play-btn-text">
                          <span className="play-btn-action">Continuar</span>
                          <span className="play-btn-episode">T{seriesProgress.season}:E{seriesProgress.episode}</span>
                        </span>
                      ) : (
                        'Reproduir'
                      )}
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
              <div className={`seasons-tabs ${canScrollLeft ? 'can-scroll-left' : ''} ${canScrollRight ? 'can-scroll-right' : ''}`}>
                <div
                  className={`seasons-scroll-container ${isDragging ? 'dragging' : ''}`}
                  ref={seasonsScrollRef}
                  onScroll={checkScrollButtons}
                  onMouseDown={handleDragStart}
                  onMouseMove={handleDragMove}
                  onMouseUp={handleDragEnd}
                  onMouseLeave={handleDragEnd}
                >
                  <div className="seasons-list">
                    {seasons.map((season) => (
                      <button
                        key={season.id || `tmdb-season-${season.season_number}`}
                        className={`season-btn ${selectedSeason === season.season_number ? 'active' : ''} ${season.isArc ? 'arc-btn' : ''} ${season.bbc_available ? 'bbc-available' : ''}`}
                        onClick={() => handleSeasonSelect(season.season_number)}
                        title={season.isArc ? `${season.name} (Ep. ${season.tmdb_start}-${season.tmdb_end})` : ''}
                      >
                        {season.isArc ? season.name : `Temporada ${season.season_number}`}
                        {season.bbc_available && <span className="bbc-indicator">BBC</span>}
                      </button>
                    ))}
                  </div>
                </div>
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
                title={episode.overview || ''}
                onClick={() => {
                  if (isPremium && item?.tmdb_id) {
                    // Per One Piece: usar temporada/episodi TMDB reals
                    const seasonToUse = episode._tmdb_season || selectedSeason;
                    const episodeToUse = episode._tmdb_episode || episode.episode_number;
                    // Guardar per al preload primerenc de la pròxima visita
                    saveLastEpisode(item.tmdb_id, seasonToUse, episodeToUse);
                    navigate(`/debrid/tv/${item.tmdb_id}?s=${seasonToUse}&e=${episodeToUse}`);
                  }
                }}
                style={{ cursor: isPremium && item?.tmdb_id ? 'pointer' : 'default' }}
              >
                <div className="episode-thumbnail">
                  {episode.still_path ? (
                    <LazyImage
                      src={getTmdbImageUrl(episode.still_path, 'w300')}
                      alt={episode.name}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        const fallback = e.target.parentElement?.querySelector('.episode-number');
                        if (fallback) fallback.style.display = 'flex';
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
                    <span className="episode-name">{episode.episode_number}. {episode.name || `Episodi ${episode.episode_number}`}</span>
                    {(episode.duration || episode.runtime) && (
                      <span className="episode-duration">{formatDuration((episode.runtime || 0) * 60 || episode.duration)}</span>
                    )}
                  </div>
                  {episode.overview && (
                    <div className="episode-overview">{episode.overview}</div>
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
