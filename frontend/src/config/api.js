/**
 * Hermes Media Server - Configuració centralitzada de l'API
 * Totes les constants i helpers d'API en un sol lloc
 */

// URL base de l'API - automàticament detecta si estem en local o producció
export const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

// TMDB Image Base URL
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Configuració d'axios per defecte
export const configureAxios = (axios) => {
  axios.defaults.baseURL = API_URL;

  // Interceptor per afegir token d'autenticació
  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('hermes_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
};

// === IMAGE URL HELPERS ===

/**
 * Get local image URL (poster/backdrop from Hermes server)
 */
export const getImageUrl = (type, id, cacheBust = '') => {
  if (!id) return null;
  return `${API_URL}/api/image/${type}/${id}${cacheBust}`;
};

export const getPosterUrl = (id, cacheBust = '') => getImageUrl('poster', id, cacheBust);
export const getBackdropUrl = (id, cacheBust = '') => getImageUrl('backdrop', id, cacheBust);

/**
 * Get TMDB image URL
 */
export const getTmdbImageUrl = (path, size = 'w500') => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
};

export const getTmdbPosterUrl = (path, size = 'w500') => getTmdbImageUrl(path, size);
export const getTmdbBackdropUrl = (path, size = 'w780') => getTmdbImageUrl(path, size);
export const getTmdbProfileUrl = (path, size = 'w185') => getTmdbImageUrl(path, size);

// === FORMAT HELPERS ===

/**
 * Format duration in seconds to human readable format
 */
export const formatDuration = (seconds) => {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
};

/**
 * Format file size to human readable format
 */
export const formatFileSize = (bytes) => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export default API_URL;
