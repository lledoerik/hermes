import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useStreamCache } from '../context/StreamCacheContext';
import { API_URL } from '../config/api';
import './DebridPlayer.css';

// SVG Icons
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z"/>
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
  </svg>
);

const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
  </svg>
);

const FullscreenExitIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
  </svg>
);

const VolumeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
);

const VolumeMuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
  </svg>
);

const SkipBackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
  </svg>
);

const SkipForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);

// Audio track icon
const AudioIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
  </svg>
);

// Next episode icon
const NextEpisodeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
  </svg>
);

// Previous (season navigation)
const PrevIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
  </svg>
);

// Next (season navigation)
const NextIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
  </svg>
);

// Episodes list icon
const EpisodesIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6h2v2H4V6zm0 5h2v2H4v-2zm0 5h2v2H4v-2zm16-8V6H8v2h12zm0 5v-2H8v2h12zm0 5v-2H8v2h12z"/>
  </svg>
);

// Format time (seconds to MM:SS or HH:MM:SS)
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Parse quality from torrent name - Only returns 4K, 1080p, or 720p
const parseQuality = (name) => {
  if (!name) return '720p'; // Default fallback
  const lower = name.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) return '4K';
  if (lower.includes('1080p')) return '1080p';
  // Tot el que no sigui 4K o 1080p es considera 720p o inferior
  return '720p';
};

// Qualitats disponibles ordenades de major a menor
const QUALITY_ORDER = ['4K', '1080p', '720p'];

// Language codes for the filter system
// VO = Versió Original (qualsevol idioma no reconegut: japonès, italià, francès, etc.)
// ENG = Anglès
// ESP = Espanyol/Castellà
// CAT = Català
// LAT = Espanyol Llatinoamèrica
const LANGUAGE_OPTIONS = [
  { code: 'ALL', label: 'Tots', flag: '🌐' },
  { code: 'VO', label: 'VO', flag: '🎬' },
  { code: 'ENG', label: 'ENG', flag: '🇬🇧' },
  { code: 'ESP', label: 'ESP', flag: '🇪🇸' },
  { code: 'CAT', label: 'CAT', flag: '🏳️' },
  { code: 'LAT', label: 'LAT', flag: '🇲🇽' }
];

// Parse language from torrent name/title - returns standardized code
const parseLanguage = (name, title) => {
  const text = `${name} ${title}`.toLowerCase();
  const fullText = `${name} ${title}`;

  // Check for Català first (specific patterns)
  if (text.includes('catala') || text.includes('català') || text.includes('catalan')) {
    return 'CAT';
  }

  // Check for Latino/Llatinoamèrica
  if (fullText.includes('🇲🇽') || fullText.includes('🇦🇷') || fullText.includes('🇨🇴') || fullText.includes('🇨🇱')) {
    return 'LAT';
  }
  if (text.includes('latino') || text.includes('lat ') || text.includes(' lat') ||
      text.includes('latinoamerica') || text.includes('spanish lat') || text.includes('español lat')) {
    return 'LAT';
  }

  // Check for Spanish/Castellà (Spain)
  if (fullText.includes('🇪🇸')) {
    return 'ESP';
  }
  if (text.includes('castellano') || text.includes('español') || text.includes('spanish spain') ||
      text.includes('spa ') || text.includes(' spa') || text.includes('spanish') ||
      (text.includes('esp') && !text.includes('desperate'))) {
    return 'ESP';
  }

  // Check for English
  if (fullText.includes('🇬🇧') || fullText.includes('🇺🇸') || fullText.includes('🇦🇺')) {
    return 'ENG';
  }
  if (text.includes('english') || text.includes('eng ') || text.includes(' eng') ||
      text.includes('engsub') || text.includes('subeng')) {
    return 'ENG';
  }

  // Check for Multi/Dual - treat as ENG (usually includes English)
  if (text.includes('multi') || text.includes('dual')) {
    return 'ENG';
  }

  // Everything else is VO (Versió Original)
  // This includes: Japanese, Korean, French, German, Italian, Chinese, Russian, etc.
  if (fullText.includes('🇯🇵') || fullText.includes('🇰🇷') || fullText.includes('🇫🇷') ||
      fullText.includes('🇩🇪') || fullText.includes('🇮🇹') || fullText.includes('🇨🇳') ||
      fullText.includes('🇹🇼') || fullText.includes('🇷🇺') || fullText.includes('🇵🇹') ||
      fullText.includes('🇧🇷')) {
    return 'VO';
  }
  if (text.includes('japanese') || text.includes('korean') || text.includes('french') ||
      text.includes('german') || text.includes('italian') || text.includes('chinese') ||
      text.includes('russian') || text.includes('portuguese') || text.includes('hindi') ||
      text.includes('日本語') || text.includes('한국어') || text.includes('français') ||
      text.includes('deutsch') || text.includes('italiano')) {
    return 'VO';
  }

  // Default: assume English for unmarked torrents (most common)
  return 'ENG';
};

function DebridPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  useAuth(); // Per verificar autenticació
  const {
    getCachedTorrents,
    cacheTorrents,
    preloadTorrents,
    getCachedStreamUrl,
    cacheStreamUrl,
    preloadAutoQualityFirst
  } = useStreamCache();

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressSaveTimeoutRef = useRef(null);
  const resumeTimeRef = useRef(0);

  // Ref per controlar si ja s'ha iniciat la precàrrega del següent episodi
  const nextEpisodePreloadedRef = useRef(false);

  // Touch/tap handling refs
  const lastTapTimeRef = useRef(0);
  const tapTimeoutRef = useRef(null);
  const tapZoneRef = useRef(null); // 'left', 'center', 'right'

  // URL params
  const searchParams = new URLSearchParams(location.search);
  const season = searchParams.get('s') ? parseInt(searchParams.get('s')) : null;
  const episode = searchParams.get('e') ? parseInt(searchParams.get('e')) : null;

  // Media info
  const [mediaInfo, setMediaInfo] = useState(location.state?.mediaInfo || null);
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(season || 1); // Per la navegació
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Torrent/Debrid state
  const [torrents, setTorrents] = useState([]);
  const [selectedTorrent, setSelectedTorrent] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [loadingTorrents, setLoadingTorrents] = useState(true);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState(null);
  const [debridConfigured, setDebridConfigured] = useState(null); // null = checking, true/false = result
  const [disabledQualities, setDisabledQualities] = useState(new Set()); // Qualitats que han fallat

  // Abort controller ref per cancel·lar peticions anteriors
  const streamAbortControllerRef = useRef(null);
  const loadingTimerRef = useRef(null);
  const previousTorrentRef = useRef(null); // Torrent anterior per recuperar si falla

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Quality mode state - true = automàtic, false = manual
  const [isAutoQuality, setIsAutoQuality] = useState(true);

  // Language filter state
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    return localStorage.getItem('hermes_stream_lang') || 'ALL';
  });
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  // Audio state
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  // Episode navigation state
  const [showEpisodesList, setShowEpisodesList] = useState(false);
  const [showEndedOverlay, setShowEndedOverlay] = useState(false);
  const episodesListRef = useRef(null);
  const episodesCacheRef = useRef({}); // Cache d'episodis per temporada

  const mediaType = type === 'movie' ? 'movie' : 'tv';

  // Determine next episode
  const nextEpisode = useMemo(() => {
    if (type === 'movie' || !episodes.length || !episode) return null;
    const currentIndex = episodes.findIndex(ep => ep.episode_number === episode);
    if (currentIndex >= 0 && currentIndex < episodes.length - 1) {
      return episodes[currentIndex + 1];
    }
    return null;
  }, [type, episodes, episode]);

  // Save progress to backend (defined early for use in navigation)
  const saveProgress = useCallback(async (percent, completed = false) => {
    try {
      const currentEp = episodes.find(ep => ep.episode_number === episode);
      await axios.post(`${API_URL}/api/streaming/progress`, {
        tmdb_id: parseInt(tmdbId),
        media_type: type === 'movie' ? 'movie' : 'series',
        season_number: type !== 'movie' ? (season || 1) : null,
        episode_number: type !== 'movie' ? (episode || 1) : null,
        progress_percent: percent,
        completed: completed,
        title: mediaInfo?.title || mediaInfo?.name || '',
        poster_path: mediaInfo?.poster_path || null,
        backdrop_path: mediaInfo?.backdrop_path || null,
        still_path: currentEp?.still_path || null
      });
    } catch (err) {
      console.error('Error guardant progrés:', err);
    }
  }, [tmdbId, type, season, episode, mediaInfo, episodes]);

  // Navigate to next episode
  const goToNextEpisode = useCallback(async () => {
    if (!nextEpisode) return;
    // Guardar progrés de l'episodi actual abans de canviar
    if (videoRef.current && duration > 0) {
      const percent = Math.round((videoRef.current.currentTime / duration) * 100);
      await saveProgress(percent, percent >= 90); // Marcar com completat si >90%
    }
    setShowEndedOverlay(false);
    setStreamUrl(null);
    setSelectedTorrent(null);
    setTorrents([]);
    navigate(`/debrid/tv/${tmdbId}?s=${season}&e=${nextEpisode.episode_number}`, {
      state: { mediaInfo },
      replace: true
    });
  }, [nextEpisode, navigate, tmdbId, season, mediaInfo, duration, saveProgress]);

  // Navigate to specific episode (can be from different season)
  const goToEpisode = useCallback(async (ep, targetSeason = null) => {
    const seasonToUse = targetSeason || selectedSeason;
    // Guardar progrés de l'episodi actual abans de canviar
    if (videoRef.current && duration > 0) {
      const percent = Math.round((videoRef.current.currentTime / duration) * 100);
      await saveProgress(percent, percent >= 90);
    }
    setShowEpisodesList(false);
    setShowEndedOverlay(false);
    setStreamUrl(null);
    setSelectedTorrent(null);
    setTorrents([]);
    navigate(`/debrid/tv/${tmdbId}?s=${seasonToUse}&e=${ep.episode_number}`, {
      state: { mediaInfo },
      replace: true
    });
  }, [navigate, tmdbId, selectedSeason, mediaInfo, duration, saveProgress]);

  // Filter torrents by selected language
  const filteredTorrents = useMemo(() => {
    if (selectedLanguage === 'ALL') return torrents;
    return torrents.filter(torrent => {
      const lang = parseLanguage(torrent.name, torrent.title);
      return lang === selectedLanguage;
    });
  }, [torrents, selectedLanguage]);

  // Get available languages from torrents
  const availableLanguages = useMemo(() => {
    const langs = new Set();
    torrents.forEach(torrent => {
      langs.add(parseLanguage(torrent.name, torrent.title));
    });
    return langs;
  }, [torrents]);

  // Group torrents by quality only (not language) - Only 4K, 1080p, 720p
  const groupedTorrents = useMemo(() => {
    const groups = {};

    filteredTorrents.forEach(torrent => {
      const quality = parseQuality(torrent.name);

      if (!groups[quality]) {
        groups[quality] = {
          quality,
          torrents: [],
          hasCached: false
        };
      }

      groups[quality].torrents.push(torrent);
      if (torrent.cached) {
        groups[quality].hasCached = true;
      }
    });

    // Ordenar per QUALITY_ORDER (4K primer, després 1080p, després 720p)
    return QUALITY_ORDER
      .filter(q => groups[q]) // Només qualitats que existeixen
      .map(q => groups[q]);
  }, [filteredTorrents]);

  // Determinar la qualitat automàtica (la millor amb cache, o la millor disponible)
  const autoSelectedQuality = useMemo(() => {
    // Prioritat: la millor qualitat que tingui algun torrent cached
    for (const quality of QUALITY_ORDER) {
      const group = groupedTorrents.find(g => g.quality === quality);
      if (group?.hasCached) {
        return quality;
      }
    }
    // Si no hi ha cap cached, retornar la millor disponible
    return groupedTorrents[0]?.quality || '1080p';
  }, [groupedTorrents]);

  // Current selection info
  const currentQuality = selectedTorrent ? parseQuality(selectedTorrent.name) : null;

  // Check Real-Debrid status
  const checkDebridStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/debrid/status`);
      setDebridConfigured(response.data.configured && response.data.valid);
      return response.data.configured && response.data.valid;
    } catch (err) {
      console.error('Error checking debrid status:', err);
      setDebridConfigured(false);
      return false;
    }
  }, []);

  // Load media info
  const loadMediaInfo = useCallback(async () => {
    try {
      const endpoint = type === 'movie'
        ? `/api/tmdb/movie/${tmdbId}`
        : `/api/tmdb/tv/${tmdbId}`;
      const response = await axios.get(`${API_URL}${endpoint}`);
      setMediaInfo(response.data);
    } catch (err) {
      console.error('Error carregant info:', err);
    }
  }, [type, tmdbId]);

  // Load episodes for series (can load different season for navigator) - amb cache local
  const loadEpisodes = useCallback(async (seasonNum = null) => {
    const targetSeason = seasonNum || season;
    if (type === 'movie' || !targetSeason) return;

    // Comprovar cache local primer
    const cacheKey = `${tmdbId}_${targetSeason}`;
    if (episodesCacheRef.current[cacheKey]) {
      setEpisodes(episodesCacheRef.current[cacheKey]);
      return;
    }

    setLoadingEpisodes(true);
    try {
      const response = await axios.get(`${API_URL}/api/tmdb/tv/${tmdbId}/season/${targetSeason}`);
      const eps = response.data?.episodes || [];
      // Guardar al cache local
      episodesCacheRef.current[cacheKey] = eps;
      setEpisodes(eps);
    } catch (err) {
      console.error('Error carregant episodis:', err);
    } finally {
      setLoadingEpisodes(false);
    }
  }, [type, tmdbId, season]);

  // Change season in navigator
  const changeNavigatorSeason = useCallback((newSeason) => {
    setSelectedSeason(newSeason);
    loadEpisodes(newSeason);
  }, [loadEpisodes]);

  // Search torrents and auto-play best cached
  const searchTorrents = useCallback(async () => {
    setLoadingTorrents(true);
    setError(null);
    try {
      // Primer comprovar si tenim cache
      const cacheType = type === 'movie' ? 'movie' : 'tv';
      let streams = getCachedTorrents(cacheType, tmdbId, season, episode);

      if (!streams) {
        // No hi ha cache, fer petició a l'API
        let url = `${API_URL}/api/debrid/torrents/${mediaType}/${tmdbId}`;
        if (mediaType === 'tv' && season && episode) {
          url += `?season=${season}&episode=${episode}`;
        }
        const response = await axios.get(url);
        streams = response.data.streams || [];

        // Guardar al cache
        cacheTorrents(cacheType, tmdbId, season, episode, streams);
      } else {
        console.log('[Player] Usant torrents del cache');
      }

      setTorrents(streams);

      // Get user preferences from localStorage
      const preferredAudioLang = localStorage.getItem('hermes_audio_lang') || 'en';
      const preferredQuality = localStorage.getItem('hermes_quality') || 'auto';

      // Map language codes to parseLanguage labels
      const langCodeToLabel = {
        'ca': 'Català',
        'es': 'Castellà',
        'en': 'Anglès',
        'fr': 'Francès',
        'de': 'Alemany',
        'it': 'Italià',
        'pt': 'Portuguès',
        'ja': 'Japonès',
        'ko': 'Coreà',
        'zh': 'Xinès',
        'ru': 'Rus'
      };

      const preferredLangLabel = langCodeToLabel[preferredAudioLang] || 'Anglès';

      // Function to check if torrent matches preferred language
      const matchesPreferredLang = (t) => {
        const lang = parseLanguage(t.name, t.title);
        if (lang === preferredLangLabel) return 0; // Exact match
        if (lang === 'Multi' || lang === 'Dual') return 1; // Multi/Dual as second choice
        if (lang === 'Anglès') return 2; // English as fallback (original version)
        return 3; // Other languages
      };

      // Function to get quality score (uses QUALITY_ORDER: 4K > 1080p > 720p)
      const getQualityScore = (t) => {
        const q = parseQuality(t.name);
        if (preferredQuality !== 'auto') {
          // If user has a preference, prioritize that quality
          if (q === preferredQuality || (preferredQuality === '2160p' && q === '4K')) return 0;
        }
        const idx = QUALITY_ORDER.indexOf(q);
        return idx >= 0 ? idx : 99;
      };

      // Sort function
      const sortTorrents = (a, b) => {
        // First by language preference
        const langA = matchesPreferredLang(a);
        const langB = matchesPreferredLang(b);
        if (langA !== langB) return langA - langB;
        // Then by quality
        return getQualityScore(a) - getQualityScore(b);
      };

      // Auto-select best cached torrent
      const cachedTorrents = streams.filter(t => t.cached);
      if (cachedTorrents.length > 0) {
        cachedTorrents.sort(sortTorrents);
        setSelectedTorrent(cachedTorrents[0]);
      } else if (streams.length > 0) {
        // No cached, auto-select best from all using same preferences
        const sorted = [...streams].sort(sortTorrents);
        setSelectedTorrent(sorted[0]);
      }
    } catch (err) {
      console.error('Error buscant torrents:', err);
      setError(err.response?.data?.detail || 'Error buscant torrents');
    } finally {
      setLoadingTorrents(false);
    }
  }, [mediaType, tmdbId, season, episode, type, getCachedTorrents, cacheTorrents]);

  // Get stream URL from selected torrent
  const getStreamUrl = useCallback(async (torrent, keepTime = false) => {
    if (!torrent) return;

    // Cancel·lar petició anterior si n'hi ha una en curs
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
    }

    // Save current time if switching streams
    if (keepTime && videoRef.current) {
      resumeTimeRef.current = videoRef.current.currentTime;
    }

    // Primer comprovar si tenim la URL en cache (canvi de qualitat instantani!)
    // IMPORTANT: Passar season i episode per evitar confondre episodis amb el mateix hash
    const cachedUrl = getCachedStreamUrl(torrent.info_hash, season, episode);
    if (cachedUrl) {
      console.log('[Player] Usant stream URL del cache (instantani!)');
      setStreamUrl(cachedUrl);
      setShowQualityMenu(false);
      return;
    }

    // Crear nou AbortController per aquesta petició
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;

    setLoadingStream(true);
    setError(null);
    setShowQualityMenu(false);

    try {
      const params = {
        info_hash: torrent.info_hash,
        magnet: torrent.magnet
      };
      // Afegir file_idx per sèries (season packs)
      if (torrent.file_idx !== undefined && torrent.file_idx !== null) {
        params.file_idx = torrent.file_idx;
      }
      // Afegir season i episode per ajudar a trobar el fitxer correcte
      if (type !== 'movie' && season && episode) {
        params.season = season;
        params.episode = episode;
      }

      const response = await axios.post(`${API_URL}/api/debrid/stream`, null, {
        params,
        signal: abortController.signal,
        timeout: 45000 // 45 segons de timeout màxim
      });

      // Verificar que no s'ha cancel·lat la petició
      if (abortController.signal.aborted) {
        return;
      }

      if (response.data.status === 'success') {
        const url = response.data.url;
        setStreamUrl(url);
        // Guardar al cache per futures vegades
        // IMPORTANT: Passar season i episode per identificar correctament l'episodi
        cacheStreamUrl(torrent.info_hash, url, season, episode);
      } else {
        setError('No s\'ha pogut obtenir el stream');
      }
    } catch (err) {
      // Ignorar errors d'abort (cancel·lació voluntària)
      if (axios.isCancel(err) || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        console.log('Petició cancel·lada');
        return;
      }

      console.error('Error obtenint stream:', err);

      // Missatges d'error més descriptius
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Temps d\'espera excedit. Prova amb una altra font.');
      } else {
        setError(err.response?.data?.detail || 'Error obtenint stream');
      }
    } finally {
      // Només actualitzar loadingStream si no s'ha cancel·lat
      if (!abortController.signal.aborted) {
        setLoadingStream(false);
      }
    }
  }, [getCachedStreamUrl, cacheStreamUrl, type, season, episode]);

  // Change quality - 'auto' per mode automàtic o '4K'/'1080p'/'720p' per manual
  const changeTorrent = useCallback((quality) => {
    // Guardar torrent actual abans de canviar (per recuperar si falla)
    if (selectedTorrent && streamUrl) {
      previousTorrentRef.current = { torrent: selectedTorrent, url: streamUrl };
    }

    if (quality === 'auto') {
      // Mode automàtic - seleccionar la millor qualitat disponible
      setIsAutoQuality(true);
      const targetQuality = autoSelectedQuality;
      const group = groupedTorrents.find(g => g.quality === targetQuality);
      if (group) {
        const torrent = group.torrents.find(t => t.cached) || group.torrents[0];
        if (torrent && torrent.info_hash !== selectedTorrent?.info_hash) {
          setSelectedTorrent(torrent);
          setStreamUrl(null);
          getStreamUrl(torrent, true);
        }
      }
    } else {
      // Mode manual - seleccionar qualitat específica
      setIsAutoQuality(false);
      const group = groupedTorrents.find(g => g.quality === quality);
      if (!group) return;

      const torrent = group.torrents.find(t => t.cached) || group.torrents[0];
      if (torrent && torrent.info_hash !== selectedTorrent?.info_hash) {
        setSelectedTorrent(torrent);
        setStreamUrl(null);
        getStreamUrl(torrent, true);
      }
    }
    setShowQualityMenu(false);
  }, [groupedTorrents, selectedTorrent, streamUrl, getStreamUrl, autoSelectedQuality]);

  // Change language filter
  const changeLanguage = useCallback((langCode) => {
    setSelectedLanguage(langCode);
    localStorage.setItem('hermes_stream_lang', langCode);
    setShowLanguageMenu(false);

    // Auto-select best torrent for new language
    const langTorrents = langCode === 'ALL' ? torrents : torrents.filter(t =>
      parseLanguage(t.name, t.title) === langCode
    );

    if (langTorrents.length > 0) {
      // Prefer cached torrents
      const cachedInLang = langTorrents.filter(t => t.cached);
      if (cachedInLang.length > 0) {
        // Sort by quality using QUALITY_ORDER (4K > 1080p > 720p)
        cachedInLang.sort((a, b) => {
          const qA = QUALITY_ORDER.indexOf(parseQuality(a.name));
          const qB = QUALITY_ORDER.indexOf(parseQuality(b.name));
          return qA - qB;
        });
        setSelectedTorrent(cachedInLang[0]);
        setStreamUrl(null);
        getStreamUrl(cachedInLang[0], true);
      } else {
        setSelectedTorrent(langTorrents[0]);
        setStreamUrl(null);
        getStreamUrl(langTorrents[0], true);
      }
    }
  }, [torrents, getStreamUrl]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    setCurrentTime(video.currentTime);

    // Update buffered
    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }

    // Precarregar següent episodi quan faltin ~5 minuts (300 segons)
    const timeRemaining = video.duration - video.currentTime;
    if (
      nextEpisode &&
      timeRemaining > 0 &&
      timeRemaining < 300 &&
      !nextEpisodePreloadedRef.current
    ) {
      nextEpisodePreloadedRef.current = true;
      // Usar season actual (nextEpisode pot no tenir season_number)
      const nextSeason = nextEpisode.season_number || season;
      const nextEp = nextEpisode.episode_number;
      console.log(`[Player] Precarregant següent episodi (S${nextSeason}E${nextEp})...`);

      // Precarregar en background - prioritzar qualitat automàtica
      preloadTorrents('tv', tmdbId, nextSeason, nextEp)
        .then(torrents => {
          if (torrents?.length > 0) {
            console.log(`[Player] ${torrents.length} fonts precarregades pel següent episodi`);
            // Prioritzar qualitat automàtica, resta en background
            preloadAutoQualityFirst(torrents, nextSeason, nextEp);
          }
        })
        .catch(err => console.error('[Player] Error precarregant següent episodi:', err));
    }

    // Auto-save progress every 30 seconds
    if (progressSaveTimeoutRef.current) {
      clearTimeout(progressSaveTimeoutRef.current);
    }
    progressSaveTimeoutRef.current = setTimeout(() => {
      const percent = Math.round((video.currentTime / video.duration) * 100);
      saveProgress(percent, false);
    }, 30000);
  }, [saveProgress, nextEpisode, tmdbId, season, preloadTorrents, preloadAutoQualityFirst]);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    setDuration(video.duration);

    // Assegurar que el vídeo no està silenciat i té volum
    video.muted = false;
    video.volume = volume;

    // Resume from saved position if switching streams
    if (resumeTimeRef.current > 0) {
      video.currentTime = resumeTimeRef.current;
      resumeTimeRef.current = 0;
    }

    // Detect audio tracks (if available via HTML5 API)
    if (video.audioTracks && video.audioTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < video.audioTracks.length; i++) {
        const track = video.audioTracks[i];
        tracks.push({
          id: i,
          label: track.label || track.language || `Pista ${i + 1}`,
          language: track.language || '',
          enabled: track.enabled
        });
        if (track.enabled) setCurrentAudioTrack(i);
      }
      setAudioTracks(tracks);
    }

  }, [volume]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  // Change audio track
  const changeAudioTrack = useCallback((trackId) => {
    if (!videoRef.current || !videoRef.current.audioTracks) return;
    const audioTracks = videoRef.current.audioTracks;
    for (let i = 0; i < audioTracks.length; i++) {
      audioTracks[i].enabled = (i === trackId);
    }
    setCurrentAudioTrack(trackId);
    setShowAudioMenu(false);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    saveProgress(100, true);
    // Show overlay with next episode button if available
    if (nextEpisode) {
      setShowEndedOverlay(true);
      setShowControls(true);
    }
  }, [saveProgress, nextEpisode]);

  // Controls
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const seek = useCallback((time) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(time, duration));
  }, [duration]);

  const handleProgressClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(percent * duration);
  }, [duration, seek]);

  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    setIsMuted(newVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoRef.current.muted = newMuted;
  }, [isMuted]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const skipBack = useCallback(() => seek(currentTime - 10), [currentTime, seek]);
  const skipForward = useCallback(() => seek(currentTime + 30), [currentTime, seek]);

  // Enter fullscreen and lock to landscape on mobile
  const enterFullscreenMobile = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      // Request fullscreen
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }

      // Lock to landscape on mobile (if supported)
      if (window.screen.orientation && window.screen.orientation.lock) {
        try {
          await window.screen.orientation.lock('landscape');
        } catch (e) {
          // Orientation lock not supported or denied
          console.log('Orientation lock not supported');
        }
      }
    } catch (e) {
      console.log('Fullscreen not supported:', e);
    }
  }, []);

  // Handle tap zones for double tap (left = -10s, center = play/pause, right = +30s)
  const getTapZone = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 'center';

    const x = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    const relativeX = x - rect.left;
    const width = rect.width;

    if (relativeX < width * 0.3) return 'left';
    if (relativeX > width * 0.7) return 'right';
    return 'center';
  }, []);

  // Visual feedback for double tap
  const [doubleTapIndicator, setDoubleTapIndicator] = useState(null);

  const showDoubleTapFeedback = useCallback((side) => {
    setDoubleTapIndicator(side);
    setTimeout(() => setDoubleTapIndicator(null), 500);
  }, []);

  // Handle touch/click on video area
  const handleVideoAreaTap = useCallback((e) => {
    // Ignore if any menu is open
    if (showQualityMenu || showLanguageMenu || showEpisodesList || showAudioMenu || showEndedOverlay) {
      return;
    }

    // Ignore if clicking on controls
    if (e.target.closest('.controls-container') || e.target.closest('.top-bar')) {
      return;
    }

    // Enter fullscreen on first tap (requires user gesture)
    if (!isFullscreen && streamUrl) {
      enterFullscreenMobile();
    }

    const now = Date.now();
    const tapZone = getTapZone(e);
    const timeSinceLastTap = now - lastTapTimeRef.current;

    // Check for double tap (within 300ms and same zone)
    if (timeSinceLastTap < 300 && tapZoneRef.current === tapZone) {
      // Double tap detected
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }

      // Execute double tap action
      if (tapZone === 'left') {
        skipBack();
        // Show visual feedback
        showDoubleTapFeedback('left');
      } else if (tapZone === 'right') {
        skipForward();
        showDoubleTapFeedback('right');
      } else {
        // Center double tap = toggle play
        if (streamUrl) togglePlay();
      }

      lastTapTimeRef.current = 0;
      tapZoneRef.current = null;
    } else {
      // Single tap - wait to see if it becomes double tap
      lastTapTimeRef.current = now;
      tapZoneRef.current = tapZone;

      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }

      tapTimeoutRef.current = setTimeout(() => {
        // Single tap confirmed - toggle controls visibility
        if (showControls) {
          setShowControls(false);
        } else {
          setShowControls(true);
          // Auto-hide after 3 seconds if playing
          if (isPlaying) {
            if (controlsTimeoutRef.current) {
              clearTimeout(controlsTimeoutRef.current);
            }
            controlsTimeoutRef.current = setTimeout(() => {
              setShowControls(false);
            }, 3000);
          }
        }
        tapTimeoutRef.current = null;
      }, 300);
    }
  }, [showQualityMenu, showLanguageMenu, showEpisodesList, showAudioMenu, showEndedOverlay, getTapZone, skipBack, skipForward, togglePlay, streamUrl, showControls, isPlaying, isFullscreen, enterFullscreenMobile, showDoubleTapFeedback]);

  // Hide controls after inactivity
  const handleMouseMove = useCallback(() => {
    setShowControls(true);

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (isPlaying && !showQualityMenu && !showLanguageMenu) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, showQualityMenu, showLanguageMenu]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Handle escape for various menus/overlays
      if (e.key === 'Escape') {
        if (showQualityMenu) {
          setShowQualityMenu(false);
          return;
        }
        if (showLanguageMenu) {
          setShowLanguageMenu(false);
          return;
        }
        if (showEpisodesList) {
          setShowEpisodesList(false);
          return;
        }
        if (showEndedOverlay) {
          setShowEndedOverlay(false);
          return;
        }
        if (isFullscreen) {
          document.exitFullscreen();
          return;
        }
        return;
      }

      // Don't handle other keys if overlays are open
      if (showQualityMenu || showLanguageMenu || showEpisodesList || showEndedOverlay) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipForward();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'n':
          // Next episode shortcut
          if (nextEpisode) {
            e.preventDefault();
            goToNextEpisode();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipBack, skipForward, toggleFullscreen, toggleMute, isFullscreen, showQualityMenu, showLanguageMenu, showEpisodesList, showEndedOverlay, nextEpisode, goToNextEpisode]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      if (!mediaInfo) loadMediaInfo();
      loadEpisodes();

      // Check debrid status first
      const isConfigured = await checkDebridStatus();
      if (isConfigured) {
        searchTorrents();
      } else {
        setLoadingTorrents(false);
      }
    };
    init();
  }, [mediaInfo, loadMediaInfo, loadEpisodes, searchTorrents, checkDebridStatus]);

  // Auto-get stream when torrent is selected
  useEffect(() => {
    if (selectedTorrent && !streamUrl && !loadingStream) {
      getStreamUrl(selectedTorrent);
    }
  }, [selectedTorrent, streamUrl, loadingStream, getStreamUrl]);

  // Note: Fullscreen is triggered on first tap (requires user gesture)

  // Fullscreen change detection and orientation unlock
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);

      // Unlock orientation when exiting fullscreen
      if (!isNowFullscreen && window.screen.orientation && window.screen.orientation.unlock) {
        try {
          window.screen.orientation.unlock();
        } catch (e) {
          // Ignore
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Re-fetch torrents when episode changes
  useEffect(() => {
    if (debridConfigured && type !== 'movie') {
      // Reset el flag de precàrrega del següent episodi
      nextEpisodePreloadedRef.current = false;
      // Reset qualitats desactivades
      setDisabledQualities(new Set());
      searchTorrents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode]); // Only re-run when episode number changes

  // Scroll to current episode when episodes list opens
  useEffect(() => {
    if (showEpisodesList && episodesListRef.current) {
      const currentItem = episodesListRef.current.querySelector('.episode-item.current');
      if (currentItem) {
        setTimeout(() => {
          currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [showEpisodesList, episodes]);

  // Cancel·lar peticions pendents quan es desmunta el component
  useEffect(() => {
    return () => {
      if (streamAbortControllerRef.current) {
        streamAbortControllerRef.current.abort();
      }
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current);
      }
    };
  }, []);

  // Timeout automàtic de càrrega (10 segons)
  useEffect(() => {
    if (loadingStream && selectedTorrent) {
      loadingTimerRef.current = setTimeout(() => {
        // Cancel·lar la petició
        if (streamAbortControllerRef.current) {
          streamAbortControllerRef.current.abort();
        }
        // Desactivar la qualitat que ha fallat
        const failedQuality = parseQuality(selectedTorrent.name);
        setDisabledQualities(prev => new Set([...prev, failedQuality]));
        setLoadingStream(false);

        // Restaurar torrent anterior si n'hi ha
        if (previousTorrentRef.current) {
          setSelectedTorrent(previousTorrentRef.current.torrent);
          setStreamUrl(previousTorrentRef.current.url);
          previousTorrentRef.current = null;
        } else {
          setSelectedTorrent(null);
        }
      }, 10000); // 10 segons
    } else {
      // Netejar timeout
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    }

    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, [loadingStream, selectedTorrent]);

  // Save progress on unmount
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video && duration > 0) {
        const percent = Math.round((video.currentTime / duration) * 100);
        if (percent > 5 && percent < 95) {
          const data = JSON.stringify({
            tmdb_id: parseInt(tmdbId),
            media_type: type === 'movie' ? 'movie' : 'series',
            season_number: type !== 'movie' ? (season || 1) : null,
            episode_number: type !== 'movie' ? (episode || 1) : null,
            progress_percent: percent,
            completed: false,
            title: mediaInfo?.title || mediaInfo?.name || ''
          });
          // Usar Blob amb content-type correcte per sendBeacon
          const blob = new Blob([data], { type: 'application/json' });
          navigator.sendBeacon(`${API_URL}/api/streaming/progress`, blob);
        }
      }
    };
  }, [tmdbId, type, season, episode, mediaInfo, duration]);

  const title = mediaInfo?.title || mediaInfo?.name || 'Carregant...';
  const subtitle = type !== 'movie' && season && episode
    ? `T${season} · E${episode}`
    : null;

  return (
    <div
      ref={containerRef}
      className={`debrid-player ${isFullscreen ? 'fullscreen' : ''} ${showControls ? 'show-controls' : ''}`}
      onMouseMove={handleMouseMove}
      onClick={handleVideoAreaTap}
      onTouchEnd={handleVideoAreaTap}
    >
      {/* Double tap indicators */}
      {doubleTapIndicator === 'left' && (
        <div className="double-tap-indicator left">
          <div className="double-tap-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
            </svg>
            <span>-10s</span>
          </div>
        </div>
      )}
      {doubleTapIndicator === 'right' && (
        <div className="double-tap-indicator right">
          <div className="double-tap-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
            <span>+30s</span>
          </div>
        </div>
      )}

      {/* Video element */}
      {streamUrl && (
        <video
          ref={videoRef}
          className="video-element"
          src={streamUrl}
          muted={isMuted}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          autoPlay
          playsInline
        />
      )}

      {/* Loading overlay */}
      {(loadingTorrents || loadingStream) && (
        <div className="loading-overlay">
          <div className="spinner"></div>
        </div>
      )}

      {/* Real-Debrid not configured overlay */}
      {debridConfigured === false && !loadingTorrents && (
        <div className="error-overlay debrid-not-configured">
          <div className="config-icon">⚙️</div>
          <h3>Real-Debrid no configurat</h3>
          <p>Per reproduir en HD necessites configurar una clau API de Real-Debrid.</p>
          <div className="config-steps">
            <p>1. Obté una clau API a: <a href="https://real-debrid.com/apitoken" target="_blank" rel="noopener noreferrer">real-debrid.com/apitoken</a></p>
            <p>2. Configura-la a Administració → Real-Debrid</p>
          </div>
          <div className="config-buttons">
            <button onClick={() => navigate('/admin')}>
              Anar a Administració
            </button>
            <button
              className="secondary"
              onClick={() => navigate(-1)}
            >
              Tornar enrere
            </button>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && debridConfigured !== false && (
        <div className="error-overlay">
          <p>{error}</p>
          <button onClick={() => { setError(null); searchTorrents(); }}>
            Tornar a intentar
          </button>
        </div>
      )}

      {/* Quality Menu */}
      {showQualityMenu && (
        <div className="quality-menu-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="quality-menu">
            <div className="quality-menu-header">
              <h3>Qualitat</h3>
              <button className="close-btn" onClick={() => setShowQualityMenu(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="quality-menu-content">
              {/* Opció Automàtic sempre primer */}
              <div
                className={`quality-option ${isAutoQuality ? 'active' : ''}`}
                onClick={() => changeTorrent('auto')}
              >
                <span className="quality-value">Automàtic ({autoSelectedQuality})</span>
              </div>
              {/* Qualitats manuals: 4K, 1080p, 720p */}
              {groupedTorrents.map((group, index) => {
                const isDisabled = disabledQualities.has(group.quality);
                return (
                  <div
                    key={index}
                    className={`quality-option ${
                      !isAutoQuality && currentQuality === group.quality ? 'active' : ''
                    } ${group.hasCached ? 'cached' : ''} ${isDisabled ? 'disabled' : ''}`}
                    onClick={() => !isDisabled && changeTorrent(group.quality)}
                  >
                    <span className="quality-value">{group.quality}</span>
                    {group.hasCached && <span className="cached-icon">⚡</span>}
                  </div>
                );
              })}
              {groupedTorrents.length === 0 && !loadingTorrents && (
                <div className="no-torrents">
                  No s'han trobat fonts disponibles
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="top-bar">
        <button className="back-button" onClick={() => navigate(-1)}>
          <BackIcon />
        </button>
        <div className="title-info">
          <h1>{title}</h1>
          {subtitle && <span>{subtitle}</span>}
        </div>
      </div>

      {/* Controls */}
      {streamUrl && (
        <div className="controls-container">
          {/* Time display above progress bar */}
          <div className="time-row">
            <span className="time-current">{formatTime(currentTime)}</span>
            <span className="time-separator">/</span>
            <span className="time-duration">{formatTime(duration)}</span>
          </div>

          {/* Progress bar */}
          <div className="progress-container" onClick={handleProgressClick}>
            <div className="progress-bar">
              <div
                className="progress-buffered"
                style={{ width: `${(buffered / duration) * 100}%` }}
              />
              <div
                className="progress-played"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
          </div>

          <div className="controls-row">
            {/* Left controls */}
            <div className="controls-left">
              <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); skipBack(); }} title="-10s">
                <SkipBackIcon />
              </button>
              <button onClick={(e) => { e.stopPropagation(); skipForward(); }} title="+30s">
                <SkipForwardIcon />
              </button>
              <div className="volume-control" onClick={(e) => e.stopPropagation()}>
                <button onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeMuteIcon /> : <VolumeIcon />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
              </div>
            </div>

            {/* Right controls */}
            <div className="controls-right">
              {/* Audio tracks button */}
              <button
                className={`control-btn ${audioTracks.length > 0 ? '' : 'disabled'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (audioTracks.length > 0) setShowAudioMenu(!showAudioMenu);
                }}
                title={audioTracks.length > 0 ? 'Canviar àudio' : 'Àudio no disponible'}
              >
                <AudioIcon />
              </button>

              {/* Episodes list button (only for series) */}
              {type !== 'movie' && episodes.length > 0 && (
                <button
                  className="control-btn"
                  onClick={(e) => { e.stopPropagation(); setShowEpisodesList(true); }}
                  title="Llista d'episodis"
                >
                  <EpisodesIcon />
                </button>
              )}

              {/* Quality button */}
              <button
                className="control-btn"
                onClick={(e) => { e.stopPropagation(); setShowQualityMenu(true); }}
                title="Canviar qualitat"
              >
                <SettingsIcon />
              </button>
              <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}>
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio menu */}
      {showAudioMenu && audioTracks.length > 0 && (
        <div className="track-menu" onClick={(e) => e.stopPropagation()}>
          <div className="track-menu-header">
            <h4>Pista d'àudio</h4>
            <button onClick={() => setShowAudioMenu(false)}><CloseIcon /></button>
          </div>
          {audioTracks.map((track) => (
            <div
              key={track.id}
              className={`track-option ${currentAudioTrack === track.id ? 'active' : ''}`}
              onClick={() => changeAudioTrack(track.id)}
            >
              {track.label}
            </div>
          ))}
        </div>
      )}

      {/* Video ended overlay with next episode - corner popup */}
      {showEndedOverlay && nextEpisode && (
        <div className="ended-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="ended-content">
            <p className="ended-label">Següent</p>
            <h3>{nextEpisode.name || `Episodi ${nextEpisode.episode_number}`}</h3>
            <div className="ended-buttons">
              <button className="next-episode-btn" onClick={goToNextEpisode}>
                <NextEpisodeIcon />
                <span>Reproduir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Episodes list modal */}
      {showEpisodesList && (
        <div className="episodes-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="episodes-modal">
            <div className="episodes-header">
              <div className="episodes-header-info">
                {(() => {
                  const totalSeasons = mediaInfo?.seasons?.filter(s => s.season_number > 0)?.length || mediaInfo?.number_of_seasons || 1;
                  const canGoPrev = selectedSeason > 1;
                  const canGoNext = selectedSeason < totalSeasons;

                  return (
                    <div className="season-nav">
                      <button
                        className="season-nav-btn"
                        onClick={() => canGoPrev && changeNavigatorSeason(selectedSeason - 1)}
                        disabled={!canGoPrev}
                      >
                        <PrevIcon />
                      </button>
                      <span className="season-title">Temporada {selectedSeason}</span>
                      <button
                        className="season-nav-btn"
                        onClick={() => canGoNext && changeNavigatorSeason(selectedSeason + 1)}
                        disabled={!canGoNext}
                      >
                        <NextIcon />
                      </button>
                    </div>
                  );
                })()}
              </div>
              <button className="close-btn" onClick={() => setShowEpisodesList(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="episodes-list" ref={episodesListRef}>
              {loadingEpisodes ? (
                <div className="episodes-loading">Carregant...</div>
              ) : (
                episodes.map((ep) => {
                  const isCurrent = selectedSeason === season && ep.episode_number === episode;
                  return (
                    <div
                      key={ep.id || ep.episode_number}
                      className={`episode-item ${isCurrent ? 'current' : ''}`}
                      onClick={() => !isCurrent && goToEpisode(ep, selectedSeason)}
                    >
                      <div className="episode-number">{ep.episode_number}</div>
                      <div className="episode-info">
                        <div className="episode-name">{ep.name || `Episodi ${ep.episode_number}`}</div>
                        {ep.runtime && <span className="episode-runtime">{ep.runtime} min</span>}
                      </div>
                      {isCurrent && <span className="current-badge">▶</span>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DebridPlayer;
