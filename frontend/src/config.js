/**
 * Hermes Media Server - Configuration
 * Detects API URL dynamically based on environment
 */

// Detect API URL based on current hostname
const getApiUrl = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  // Development (localhost)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }

  // Production - same host different port or path-based API
  // If your API is on the same domain but different port
  if (hostname === 'hermes.cat' || hostname.endsWith('.hermes.cat')) {
    // Try same origin first (if API is behind reverse proxy)
    return `${protocol}//${hostname}`;
  }

  // Default: assume API is on same origin (behind reverse proxy)
  return `${protocol}//${hostname}`;
};

export const API_URL = getApiUrl();

// API endpoints
export const API_ENDPOINTS = {
  // Library
  stats: '/api/library/stats',
  series: '/api/library/series',
  movies: '/api/library/movies',
  scan: '/api/library/scan',

  // Series
  seriesDetail: (id) => `/api/series/${id}`,
  seasonEpisodes: (seriesId, seasonNum) => `/api/series/${seriesId}/season/${seasonNum}`,

  // Movies
  movieDetail: (id) => `/api/movie/${id}`,

  // Media
  mediaDetail: (id) => `/api/media/${id}`,

  // Streaming
  streamDirect: (mediaId) => `/api/stream/${mediaId}/direct`,
  streamHls: (mediaId) => `/api/stream/${mediaId}/hls`,
  hlsPlaylist: (streamId) => `/api/stream/hls/${streamId}/playlist.m3u8`,

  // Images
  poster: (itemId) => `/api/image/poster/${itemId}`,
  backdrop: (itemId) => `/api/image/backdrop/${itemId}`,
};

// Helper function to make full URL
export const makeUrl = (endpoint) => `${API_URL}${endpoint}`;

// Storage keys for user preferences
export const STORAGE_KEYS = {
  viewMode: 'hermes_view_mode',
  audioLanguage: 'hermes_audio_lang',
  subtitleLanguage: 'hermes_subtitle_lang',
  volume: 'hermes_volume',
  quality: 'hermes_quality',
};

// Default settings
export const DEFAULTS = {
  viewMode: 'normal',
  audioLanguage: 'cat',
  subtitleLanguage: null,
  volume: 1,
  quality: '1080p',
};
