import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './DebridPlayer.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

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

// Subtitles icon
const SubtitlesIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/>
  </svg>
);

// Next episode icon
const NextEpisodeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
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

// Parse quality from torrent name
const parseQuality = (name) => {
  if (!name) return 'Desconeguda';
  const lower = name.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) return '4K';
  if (lower.includes('1080p')) return '1080p';
  if (lower.includes('720p')) return '720p';
  if (lower.includes('480p')) return '480p';
  if (lower.includes('hdtv')) return 'HDTV';
  if (lower.includes('web')) return 'WEB';
  return 'SD';
};

// Parse language from torrent name/title
const parseLanguage = (name, title) => {
  const text = `${name} ${title}`.toLowerCase();

  // Check flags first
  if (title) {
    if (title.includes('🇪🇸') || title.includes('🇲🇽')) return 'Castellà';
    if (title.includes('🇬🇧') || title.includes('🇺🇸')) return 'Anglès';
    if (title.includes('🇯🇵')) return 'Japonès';
    if (title.includes('🇫🇷')) return 'Francès';
    if (title.includes('🇩🇪')) return 'Alemany';
    if (title.includes('🇮🇹')) return 'Italià';
    if (title.includes('🇰🇷')) return 'Coreà';
    if (title.includes('🇨🇳') || title.includes('🇹🇼')) return 'Xinès';
    if (title.includes('🇵🇹') || title.includes('🇧🇷')) return 'Portuguès';
    if (title.includes('🇷🇺')) return 'Rus';
  }

  // Check text patterns
  if (text.includes('spanish') || text.includes('español') || text.includes('castellano') || text.includes('esp')) return 'Castellà';
  if (text.includes('latino') || text.includes('lat')) return 'Llatí';
  if (text.includes('catala') || text.includes('català')) return 'Català';
  if (text.includes('french') || text.includes('français') || text.includes('vff') || text.includes('vf')) return 'Francès';
  if (text.includes('german') || text.includes('deutsch')) return 'Alemany';
  if (text.includes('italian') || text.includes('italiano')) return 'Italià';
  if (text.includes('japanese') || text.includes('日本語')) return 'Japonès';
  if (text.includes('korean') || text.includes('한국어')) return 'Coreà';
  if (text.includes('multi')) return 'Multi';
  if (text.includes('dual')) return 'Dual';

  return 'Anglès'; // Default
};

function DebridPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  useAuth(); // Per verificar autenticació

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressSaveTimeoutRef = useRef(null);
  const resumeTimeRef = useRef(0);

  // Audio analysis refs
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silentCheckIntervalRef = useRef(null);
  const silentStartTimeRef = useRef(null);

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

  // Audio and subtitles state
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1); // -1 = off
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);

  // Episode navigation state
  const [showEpisodesList, setShowEpisodesList] = useState(false);
  const [showEndedOverlay, setShowEndedOverlay] = useState(false);
  const episodesListRef = useRef(null);

  // Silent audio detection state
  const [silentNotification, setSilentNotification] = useState(null);
  const [triedTorrents, setTriedTorrents] = useState(new Set());

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

  // Group torrents by quality and language
  const groupedTorrents = useMemo(() => {
    const groups = {};

    torrents.forEach(torrent => {
      const quality = parseQuality(torrent.name);
      const language = parseLanguage(torrent.name, torrent.title);
      const key = `${quality}-${language}`;

      if (!groups[key]) {
        groups[key] = {
          quality,
          language,
          torrents: [],
          hasCached: false
        };
      }

      groups[key].torrents.push(torrent);
      if (torrent.cached) {
        groups[key].hasCached = true;
      }
    });

    // Sort groups: by quality first, then by cached status
    const qualityOrder = { '4K': 0, '1080p': 1, '720p': 2, 'WEB': 3, 'HDTV': 4, '480p': 5, 'SD': 6, 'Desconeguda': 7 };

    return Object.values(groups).sort((a, b) => {
      // First by quality (highest first)
      const qualityDiff = (qualityOrder[a.quality] || 99) - (qualityOrder[b.quality] || 99);
      if (qualityDiff !== 0) return qualityDiff;
      // Then by cached status (cached first within same quality)
      if (a.hasCached && !b.hasCached) return -1;
      if (!a.hasCached && b.hasCached) return 1;
      return 0;
    });
  }, [torrents]);

  // Current selection info
  const currentQuality = selectedTorrent ? parseQuality(selectedTorrent.name) : null;
  const currentLanguage = selectedTorrent ? parseLanguage(selectedTorrent.name, selectedTorrent.title) : null;

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

  // Load episodes for series (can load different season for navigator)
  const loadEpisodes = useCallback(async (seasonNum = null) => {
    const targetSeason = seasonNum || season;
    if (type === 'movie' || !targetSeason) return;
    setLoadingEpisodes(true);
    try {
      const response = await axios.get(`${API_URL}/api/tmdb/tv/${tmdbId}/season/${targetSeason}`);
      setEpisodes(response.data?.episodes || []);
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
      let url = `${API_URL}/api/debrid/torrents/${mediaType}/${tmdbId}`;
      if (mediaType === 'tv' && season && episode) {
        url += `?season=${season}&episode=${episode}`;
      }
      const response = await axios.get(url);
      const streams = response.data.streams || [];
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

      // Quality order based on preference
      const baseQualityOrder = { '4K': 0, '2160p': 0, '1080p': 1, '720p': 2, 'WEB': 3, 'HDTV': 4, '480p': 5, 'SD': 6 };

      // Function to check if torrent matches preferred language
      const matchesPreferredLang = (t) => {
        const lang = parseLanguage(t.name, t.title);
        if (lang === preferredLangLabel) return 0; // Exact match
        if (lang === 'Multi' || lang === 'Dual') return 1; // Multi/Dual as second choice
        if (lang === 'Anglès') return 2; // English as fallback (original version)
        return 3; // Other languages
      };

      // Function to get quality score
      const getQualityScore = (t) => {
        const q = parseQuality(t.name);
        if (preferredQuality !== 'auto') {
          // If user has a preference, prioritize that quality
          if (q === preferredQuality || (preferredQuality === '2160p' && q === '4K')) return 0;
        }
        return baseQualityOrder[q] ?? 99;
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
  }, [mediaType, tmdbId, season, episode]);

  // Get stream URL from selected torrent
  const getStreamUrl = useCallback(async (torrent, keepTime = false) => {
    if (!torrent) return;

    // Save current time if switching streams
    if (keepTime && videoRef.current) {
      resumeTimeRef.current = videoRef.current.currentTime;
    }

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
      const response = await axios.post(`${API_URL}/api/debrid/stream`, null, { params });

      if (response.data.status === 'success') {
        setStreamUrl(response.data.url);
      } else {
        setError('No s\'ha pogut obtenir el stream');
      }
    } catch (err) {
      console.error('Error obtenint stream:', err);
      setError(err.response?.data?.detail || 'Error obtenint stream');
    } finally {
      setLoadingStream(false);
    }
  }, []);

  // Change quality/language
  const changeTorrent = useCallback((quality, language) => {
    const group = groupedTorrents.find(g => g.quality === quality && g.language === language);
    if (!group) return;

    // Prefer cached torrent from the group
    const torrent = group.torrents.find(t => t.cached) || group.torrents[0];
    if (torrent && torrent.info_hash !== selectedTorrent?.info_hash) {
      setSelectedTorrent(torrent);
      setStreamUrl(null); // Reset to trigger new stream fetch
      getStreamUrl(torrent, true); // Keep current time
    }
    setShowQualityMenu(false);
  }, [groupedTorrents, selectedTorrent, getStreamUrl]);

  // Get next available torrent (not tried yet)
  const getNextAvailableTorrent = useCallback(() => {
    // Flatten all torrents from groups, preferring cached ones first
    const allTorrents = [];
    groupedTorrents.forEach(group => {
      // Add cached torrents first
      group.torrents.filter(t => t.cached).forEach(t => allTorrents.push(t));
      // Then non-cached
      group.torrents.filter(t => !t.cached).forEach(t => allTorrents.push(t));
    });

    // Find first torrent not tried yet and not the current one
    return allTorrents.find(t =>
      t.info_hash !== selectedTorrent?.info_hash &&
      !triedTorrents.has(t.info_hash)
    );
  }, [groupedTorrents, selectedTorrent, triedTorrents]);

  // Switch to next torrent due to silent audio
  const switchToNextTorrent = useCallback(() => {
    const nextTorrent = getNextAvailableTorrent();
    if (nextTorrent) {
      // Mark current as tried
      if (selectedTorrent) {
        setTriedTorrents(prev => new Set([...prev, selectedTorrent.info_hash]));
      }
      // Show notification
      const lang = parseLanguage(nextTorrent.name, nextTorrent.title);
      const quality = parseQuality(nextTorrent.name);
      setSilentNotification(`Àudio mut detectat. Provant: ${quality} ${lang}...`);
      setTimeout(() => setSilentNotification(null), 3000);

      // Switch torrent
      setSelectedTorrent(nextTorrent);
      setStreamUrl(null);
      getStreamUrl(nextTorrent, false); // Don't keep time, start fresh
    } else {
      setSilentNotification('No hi ha més fonts disponibles');
      setTimeout(() => setSilentNotification(null), 3000);
    }
  }, [getNextAvailableTorrent, selectedTorrent, getStreamUrl]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    setCurrentTime(video.currentTime);

    // Update buffered
    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }

    // Auto-save progress every 30 seconds
    if (progressSaveTimeoutRef.current) {
      clearTimeout(progressSaveTimeoutRef.current);
    }
    progressSaveTimeoutRef.current = setTimeout(() => {
      const percent = Math.round((video.currentTime / video.duration) * 100);
      saveProgress(percent, false);
    }, 30000);
  }, [saveProgress]);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    setDuration(video.duration);

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

    // Detect text/subtitle tracks
    if (video.textTracks && video.textTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        tracks.push({
          id: i,
          label: track.label || track.language || `Subtítols ${i + 1}`,
          language: track.language || '',
          mode: track.mode
        });
        if (track.mode === 'showing') setCurrentSubtitleTrack(i);
      }
      setSubtitleTracks(tracks);
    }
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
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

  // Change subtitle track
  const changeSubtitleTrack = useCallback((trackId) => {
    if (!videoRef.current || !videoRef.current.textTracks) return;
    const textTracks = videoRef.current.textTracks;
    for (let i = 0; i < textTracks.length; i++) {
      textTracks[i].mode = (i === trackId) ? 'showing' : 'hidden';
    }
    setCurrentSubtitleTrack(trackId);
    setShowSubtitleMenu(false);
  }, []);

  // Toggle subtitles on/off
  const toggleSubtitles = useCallback(() => {
    if (currentSubtitleTrack >= 0) {
      // Turn off
      if (videoRef.current && videoRef.current.textTracks) {
        for (let i = 0; i < videoRef.current.textTracks.length; i++) {
          videoRef.current.textTracks[i].mode = 'hidden';
        }
      }
      setCurrentSubtitleTrack(-1);
    } else if (subtitleTracks.length > 0) {
      // Turn on first track
      changeSubtitleTrack(0);
    }
  }, [currentSubtitleTrack, subtitleTracks, changeSubtitleTrack]);

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

  // Hide controls after inactivity
  const handleMouseMove = useCallback(() => {
    setShowControls(true);

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (isPlaying && !showQualityMenu) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, showQualityMenu]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Handle escape for various menus/overlays
      if (e.key === 'Escape') {
        if (showQualityMenu) {
          setShowQualityMenu(false);
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
      if (showQualityMenu || showEpisodesList || showEndedOverlay) {
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
  }, [togglePlay, skipBack, skipForward, toggleFullscreen, toggleMute, isFullscreen, showQualityMenu, showEpisodesList, showEndedOverlay, nextEpisode, goToNextEpisode]);

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

  // Fullscreen change detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Re-fetch torrents when episode changes
  useEffect(() => {
    if (debridConfigured && type !== 'movie') {
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

  // Silent audio detection using Web Audio API
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let audioContext = null;
    let analyser = null;
    let source = null;

    const setupAudioAnalysis = () => {
      try {
        // Create AudioContext
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;

        // Create analyser node
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        // Connect video to analyser
        source = audioContext.createMediaElementSource(video);
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        // Start checking for silence
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        silentStartTimeRef.current = null;

        silentCheckIntervalRef.current = setInterval(() => {
          if (!video.paused && video.currentTime > 0 && video.currentTime < 10) {
            analyser.getByteFrequencyData(dataArray);

            // Calculate average volume
            const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

            // Consider silent if average is below threshold (very low)
            const isSilent = average < 2;

            if (isSilent) {
              if (!silentStartTimeRef.current) {
                silentStartTimeRef.current = Date.now();
              } else {
                const silentDuration = (Date.now() - silentStartTimeRef.current) / 1000;
                if (silentDuration >= 7) {
                  // 7 seconds of silence detected - switch to next source
                  clearInterval(silentCheckIntervalRef.current);
                  switchToNextTorrent();
                }
              }
            } else {
              // Audio detected, reset timer
              silentStartTimeRef.current = null;
              // If we've passed 10 seconds with audio, stop checking
              if (video.currentTime > 10) {
                clearInterval(silentCheckIntervalRef.current);
              }
            }
          }
        }, 200); // Check every 200ms

      } catch (err) {
        console.error('Error setting up audio analysis:', err);
      }
    };

    // Setup when video can play
    const handleCanPlay = () => {
      // Small delay to ensure video is ready
      setTimeout(setupAudioAnalysis, 500);
    };

    video.addEventListener('canplay', handleCanPlay);

    // Cleanup
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      if (silentCheckIntervalRef.current) {
        clearInterval(silentCheckIntervalRef.current);
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
    };
  }, [streamUrl, switchToNextTorrent]);

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
      onClick={() => !showQualityMenu && streamUrl && togglePlay()}
    >
      {/* Video element */}
      {streamUrl && (
        <video
          ref={videoRef}
          className="video-element"
          src={streamUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Loading overlay */}
      {(loadingTorrents || loadingStream) && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>{loadingTorrents ? 'Buscant fonts...' : 'Preparant stream...'}</p>
        </div>
      )}

      {/* Silent audio notification */}
      {silentNotification && (
        <div className="silent-notification">
          <div className="silent-notification-content">
            <span className="silent-icon">🔇</span>
            <span>{silentNotification}</span>
          </div>
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

      {/* Quality/Language Menu */}
      {showQualityMenu && (
        <div className="quality-menu-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="quality-menu">
            <div className="quality-menu-header">
              <h3>Qualitat i idioma</h3>
              <button className="close-btn" onClick={() => setShowQualityMenu(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="quality-menu-content">
              {groupedTorrents.map((group, index) => (
                <div
                  key={index}
                  className={`quality-option ${
                    currentQuality === group.quality && currentLanguage === group.language ? 'active' : ''
                  } ${group.hasCached ? 'cached' : ''}`}
                  onClick={() => changeTorrent(group.quality, group.language)}
                >
                  <div className="quality-label">
                    <span className="quality-value">{group.quality}</span>
                    {group.hasCached && <span className="cached-icon">⚡</span>}
                  </div>
                  <div className="language-label">{group.language}</div>
                  <div className="torrent-count">{group.torrents.length} font{group.torrents.length > 1 ? 's' : ''}</div>
                </div>
              ))}
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

              {/* Subtitles button */}
              <button
                className={`control-btn ${currentSubtitleTrack >= 0 ? 'active' : ''} ${subtitleTracks.length > 0 ? '' : 'disabled'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (subtitleTracks.length > 0) {
                    toggleSubtitles();
                  }
                }}
                title={subtitleTracks.length > 0 ? 'Subtítols' : 'Subtítols no disponibles'}
              >
                <SubtitlesIcon />
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

              {/* Next episode button (only for series with next episode) */}
              {nextEpisode && (
                <button
                  className="control-btn"
                  onClick={(e) => { e.stopPropagation(); goToNextEpisode(); }}
                  title={`Següent: E${nextEpisode.episode_number}`}
                >
                  <NextEpisodeIcon />
                </button>
              )}

              {/* Quality button */}
              <button
                className="control-btn"
                onClick={(e) => { e.stopPropagation(); setShowQualityMenu(true); }}
                title="Canviar qualitat/idioma"
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

      {/* Subtitle menu */}
      {showSubtitleMenu && subtitleTracks.length > 0 && (
        <div className="track-menu" onClick={(e) => e.stopPropagation()}>
          <div className="track-menu-header">
            <h4>Subtítols</h4>
            <button onClick={() => setShowSubtitleMenu(false)}><CloseIcon /></button>
          </div>
          <div
            className={`track-option ${currentSubtitleTrack === -1 ? 'active' : ''}`}
            onClick={() => { changeSubtitleTrack(-1); setCurrentSubtitleTrack(-1); setShowSubtitleMenu(false); }}
          >
            Desactivats
          </div>
          {subtitleTracks.map((track) => (
            <div
              key={track.id}
              className={`track-option ${currentSubtitleTrack === track.id ? 'active' : ''}`}
              onClick={() => changeSubtitleTrack(track.id)}
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
                {(mediaInfo?.number_of_seasons > 1 || mediaInfo?.seasons?.length > 1) ? (
                  <select
                    className="season-selector"
                    value={selectedSeason}
                    onChange={(e) => changeNavigatorSeason(parseInt(e.target.value))}
                  >
                    {mediaInfo?.seasons ? (
                      mediaInfo.seasons
                        .filter(s => s.season_number > 0)
                        .map(s => (
                          <option key={s.season_number} value={s.season_number}>
                            Temporada {s.season_number}
                          </option>
                        ))
                    ) : (
                      Array.from({ length: mediaInfo.number_of_seasons }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          Temporada {i + 1}
                        </option>
                      ))
                    )}
                  </select>
                ) : (
                  <span className="season-title">Temporada {selectedSeason}</span>
                )}
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
