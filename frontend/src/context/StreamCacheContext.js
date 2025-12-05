/**
 * StreamCacheContext - Cache de fonts de streaming amb sistema de cua prioritzat
 *
 * Funcionalitats:
 * - Sistema de cua amb prioritats (HIGH > NORMAL > LOW)
 * - Precàrrega en segon pla del contingut "Continue Watching"
 * - Primera passada: qualitat automàtica
 * - Peticions de reproducció tenen màxima prioritat
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';

const StreamCacheContext = createContext(null);

// Temps de vida del cache (30 minuts)
const CACHE_TTL = 30 * 60 * 1000;

// Prioritats de la cua
const PRIORITY = {
  HIGH: 1,    // Peticions de reproducció (usuari vol veure ara)
  NORMAL: 2,  // Continue watching (contingut que l'usuari està veient)
  LOW: 3      // Altres qualitats, contingut secundari
};

// Delay entre peticions per evitar rate limits (ms)
const REQUEST_DELAY = 1500;

// Màxim d'entrades a l'estat de preloadingStatus (per evitar memory leaks)
const MAX_STATUS_ENTRIES = 50;

export function StreamCacheProvider({ children }) {
  // Cache de torrents per media (key: "movie_{tmdbId}" o "tv_{tmdbId}_s{season}_e{episode}")
  const torrentsCache = useRef({});

  // Cache de stream URLs (key: info_hash_s{season}_e{episode})
  const streamUrlCache = useRef({});

  // Cua de tasques de precàrrega
  const preloadQueue = useRef([]);

  // ID de la tasca actual en processament
  const currentTaskId = useRef(null);

  // Flag per indicar si el worker està actiu
  const isProcessing = useRef(false);

  // Comptador de peticions HIGH priority pendents
  const highPriorityCount = useRef(0);

  // Estat de precàrrega en curs (per UI) - limitat per evitar memory leaks
  const [preloadingStatus, setPreloadingStatus] = useState({});

  // Estat d'inicialització del background preload
  const [backgroundInitialized, setBackgroundInitialized] = useState(false);

  // Ref per controlar si el component està muntat
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * Genera la clau de cache per un media
   */
  const getCacheKey = useCallback((type, tmdbId, season = null, episode = null) => {
    if (type === 'movie') {
      return `movie_${tmdbId}`;
    }
    return `tv_${tmdbId}_s${season}_e${episode}`;
  }, []);

  /**
   * Comprova si el cache és vàlid (no ha expirat)
   */
  const isCacheValid = useCallback((cacheEntry) => {
    if (!cacheEntry) return false;
    return Date.now() - cacheEntry.timestamp < CACHE_TTL;
  }, []);

  /**
   * Obté torrents del cache si existeixen
   */
  const getCachedTorrents = useCallback((type, tmdbId, season = null, episode = null) => {
    const key = getCacheKey(type, tmdbId, season, episode);
    const cached = torrentsCache.current[key];

    if (isCacheValid(cached)) {
      return cached.data;
    }

    return null;
  }, [getCacheKey, isCacheValid]);

  /**
   * Guarda torrents al cache
   */
  const cacheTorrents = useCallback((type, tmdbId, season, episode, torrents) => {
    const key = getCacheKey(type, tmdbId, season, episode);
    torrentsCache.current[key] = {
      data: torrents,
      timestamp: Date.now()
    };
  }, [getCacheKey]);

  /**
   * Obté URL de stream del cache
   */
  const getCachedStreamUrl = useCallback((infoHash, season = null, episode = null) => {
    const cacheKey = season && episode
      ? `${infoHash}_s${season}_e${episode}`
      : infoHash;
    const cached = streamUrlCache.current[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.url;
    }
    return null;
  }, []);

  /**
   * Guarda URL de stream al cache
   */
  const cacheStreamUrl = useCallback((infoHash, url, season = null, episode = null) => {
    const cacheKey = season && episode
      ? `${infoHash}_s${season}_e${episode}`
      : infoHash;
    streamUrlCache.current[cacheKey] = {
      url,
      timestamp: Date.now()
    };
  }, []);

  /**
   * Parse quality from torrent name
   */
  const parseQuality = useCallback((name) => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) return '4K';
    if (lower.includes('1080p')) return '1080p';
    return '720p';
  }, []);

  /**
   * Parse language from torrent name
   */
  const parseLanguage = useCallback((name, title) => {
    const text = `${name || ''} ${title || ''}`.toLowerCase();
    if (text.includes('catala') || text.includes('català')) return 'CAT';
    if (text.includes('latino') || text.includes('lat ')) return 'LAT';
    if (text.includes('castellano') || text.includes('español') || text.includes('spanish')) return 'ESP';
    if (text.includes('english') || text.includes('eng ') || text.includes('multi')) return 'ENG';
    return 'ENG';
  }, []);

  /**
   * Score a torrent based on user preferences
   */
  const scoreTorrent = useCallback((torrent) => {
    const QUALITY_ORDER = ['4K', '1080p', '720p'];
    const preferredAudioLang = localStorage.getItem('hermes_audio_lang') || 'en';
    const preferredQuality = localStorage.getItem('hermes_quality') || 'auto';

    const langCodeToLabel = {
      'ca': 'CAT', 'es': 'ESP', 'en': 'ENG', 'fr': 'VO', 'de': 'VO',
      'it': 'VO', 'pt': 'VO', 'ja': 'VO', 'ko': 'VO', 'zh': 'VO', 'ru': 'VO'
    };
    const preferredLangCode = langCodeToLabel[preferredAudioLang] || 'ENG';

    const lang = parseLanguage(torrent.name, torrent.title);
    const quality = parseQuality(torrent.name);

    let langScore = lang === preferredLangCode ? 0 : (lang === 'ENG' ? 1 : 2);
    let qualityScore = QUALITY_ORDER.indexOf(quality);
    if (qualityScore < 0) qualityScore = 99;
    if (preferredQuality !== 'auto' && quality === preferredQuality) qualityScore = 0;

    return langScore * 100 + qualityScore;
  }, [parseLanguage, parseQuality]);

  /**
   * Get the best torrent from a list based on user preferences
   */
  const getBestTorrent = useCallback((torrents) => {
    if (!torrents?.length) return null;
    const cachedTorrents = torrents.filter(t => t.cached);
    if (cachedTorrents.length === 0) {
      const sorted = [...torrents].sort((a, b) => scoreTorrent(a) - scoreTorrent(b));
      return sorted[0];
    }
    cachedTorrents.sort((a, b) => scoreTorrent(a) - scoreTorrent(b));
    return cachedTorrents[0];
  }, [scoreTorrent]);

  /**
   * Actualitza l'estat de preloadingStatus amb límit de mida
   */
  const updatePreloadingStatus = useCallback((taskId, status) => {
    if (!isMounted.current) return;

    setPreloadingStatus(prev => {
      const newStatus = { ...prev, [taskId]: status };

      // Limitar mida per evitar memory leaks
      const keys = Object.keys(newStatus);
      if (keys.length > MAX_STATUS_ENTRIES) {
        // Eliminar les entrades més antigues (assumint ordre d'inserció)
        const keysToRemove = keys.slice(0, keys.length - MAX_STATUS_ENTRIES);
        keysToRemove.forEach(key => delete newStatus[key]);
      }

      return newStatus;
    });
  }, []);

  /**
   * Obté els torrents per un media (cache o API)
   */
  const fetchTorrents = useCallback(async (type, tmdbId, season, episode) => {
    // Primer comprovar cache
    let torrents = getCachedTorrents(type, tmdbId, season, episode);
    if (torrents) return torrents;

    // Obtenir de l'API
    const mediaType = type === 'movie' ? 'movie' : 'tv';
    let url = `${API_URL}/api/debrid/torrents/${mediaType}/${tmdbId}`;
    if (mediaType === 'tv' && season && episode) {
      url += `?season=${season}&episode=${episode}`;
    }

    const response = await axios.get(url, { timeout: 15000 });
    torrents = response.data.streams || [];
    cacheTorrents(type, tmdbId, season, episode, torrents);
    return torrents;
  }, [getCachedTorrents, cacheTorrents]);

  /**
   * Obté l'stream URL per un torrent
   */
  const fetchStreamUrl = useCallback(async (torrent, season, episode) => {
    // Primer comprovar cache
    const cachedUrl = getCachedStreamUrl(torrent.info_hash, season, episode);
    if (cachedUrl) return cachedUrl;

    // Obtenir de l'API
    const params = {
      info_hash: torrent.info_hash,
      magnet: torrent.magnet
    };
    if (torrent.file_idx !== undefined && torrent.file_idx !== null) {
      params.file_idx = torrent.file_idx;
    }
    if (season && episode) {
      params.season = season;
      params.episode = episode;
    }

    const response = await axios.post(`${API_URL}/api/debrid/stream`, null, {
      params,
      timeout: 20000
    });

    if (response.data.status === 'success') {
      const url = response.data.url;
      cacheStreamUrl(torrent.info_hash, url, season, episode);
      return url;
    }

    return null;
  }, [getCachedStreamUrl, cacheStreamUrl]);

  /**
   * Processa una tasca individual de precàrrega
   */
  const processTask = useCallback(async (task) => {
    const { type, tmdbId, season, episode } = task;
    const mediaKey = getCacheKey(type, tmdbId, season, episode);

    try {
      // 1. Obtenir torrents
      const torrents = await fetchTorrents(type, tmdbId, season, episode);

      if (!torrents.length) {
        console.log(`[StreamQueue] No hi ha torrents per ${mediaKey}`);
        return { success: false, torrents: [] };
      }

      // 2. Obtenir el millor torrent
      const bestTorrent = getBestTorrent(torrents);
      if (!bestTorrent) {
        console.log(`[StreamQueue] No s'ha trobat torrent adequat per ${mediaKey}`);
        return { success: false, torrents };
      }

      // 3. Obtenir stream URL
      const url = await fetchStreamUrl(bestTorrent, season, episode);

      if (url) {
        console.log(`[StreamQueue] ✓ Stream preparat per ${mediaKey}`);
        return { success: true, torrents, url, torrent: bestTorrent };
      }

      return { success: false, torrents };
    } catch (error) {
      if (error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
        console.log(`[StreamQueue] Error processant ${mediaKey}:`, error.message);
      }
      return { success: false, error: error.message };
    }
  }, [getCacheKey, fetchTorrents, getBestTorrent, fetchStreamUrl]);

  /**
   * Worker que processa la cua de manera seqüencial
   */
  const processQueue = useCallback(async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    while (preloadQueue.current.length > 0 && isMounted.current) {
      // Ordenar per prioritat (menor número = major prioritat)
      preloadQueue.current.sort((a, b) => a.priority - b.priority);

      // Si hi ha tasques HIGH priority pendents, saltar les LOW
      const hasHighPriority = highPriorityCount.current > 0;

      const task = preloadQueue.current.shift();
      if (!task) break;

      // Saltar tasques LOW si hi ha HIGH pendents
      if (hasHighPriority && task.priority === PRIORITY.LOW) {
        console.log(`[StreamQueue] Saltant tasca LOW priority: ${task.id}`);
        if (task.resolve) {
          task.resolve({ success: false, skipped: true });
        }
        continue;
      }

      currentTaskId.current = task.id;
      updatePreloadingStatus(task.id, 'processing');

      // Decrementar comptador si és HIGH priority
      if (task.priority === PRIORITY.HIGH) {
        highPriorityCount.current = Math.max(0, highPriorityCount.current - 1);
      }

      try {
        const result = await processTask(task);

        if (task.resolve) {
          task.resolve(result);
        }

        updatePreloadingStatus(task.id, result.success ? 'done' : 'failed');
      } catch (error) {
        if (task.reject) {
          task.reject(error);
        }
        updatePreloadingStatus(task.id, 'failed');
      }

      currentTaskId.current = null;

      // Delay entre peticions per evitar rate limits
      if (preloadQueue.current.length > 0 && isMounted.current) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
      }
    }

    isProcessing.current = false;
  }, [processTask, updatePreloadingStatus]);

  /**
   * Afegeix una tasca a la cua
   */
  const addToQueue = useCallback((task) => {
    const taskId = `${task.type}_${task.tmdbId}_s${task.season || 0}_e${task.episode || 0}`;

    // Comprovar si ja està en processament
    if (currentTaskId.current === taskId) {
      // Retornar una promesa que esperarà al resultat
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (currentTaskId.current !== taskId) {
            clearInterval(checkInterval);
            // Comprovar cache després de processament
            const cachedTorrents = getCachedTorrents(task.type, task.tmdbId, task.season, task.episode);
            if (cachedTorrents) {
              const bestTorrent = getBestTorrent(cachedTorrents);
              if (bestTorrent) {
                const url = getCachedStreamUrl(bestTorrent.info_hash, task.season, task.episode);
                resolve({ success: !!url, torrents: cachedTorrents, url, torrent: bestTorrent });
                return;
              }
            }
            resolve({ success: false });
          }
        }, 100);

        // Timeout de seguretat
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve({ success: false, timeout: true });
        }, 30000);
      });
    }

    // Comprovar si ja existeix a la cua
    const existingIndex = preloadQueue.current.findIndex(t => t.id === taskId);
    if (existingIndex !== -1) {
      const existingTask = preloadQueue.current[existingIndex];
      // Si la nova prioritat és més alta, actualitzar
      if (task.priority < existingTask.priority) {
        existingTask.priority = task.priority;
        if (task.priority === PRIORITY.HIGH) {
          highPriorityCount.current++;
        }
      }
      return existingTask.promise;
    }

    // Crear promesa per aquesta tasca
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const queueTask = {
      ...task,
      id: taskId,
      resolve,
      reject,
      promise
    };

    preloadQueue.current.push(queueTask);

    if (task.priority === PRIORITY.HIGH) {
      highPriorityCount.current++;
    }

    console.log(`[StreamQueue] Afegit a la cua: ${taskId} (prioritat: ${task.priority})`);

    // Iniciar processament si no està actiu
    processQueue();

    return promise;
  }, [processQueue, getCachedTorrents, getBestTorrent, getCachedStreamUrl]);

  /**
   * Precarrega torrents per un media (sense cua, directe)
   */
  const preloadTorrents = useCallback(async (type, tmdbId, season = null, episode = null) => {
    return fetchTorrents(type, tmdbId, season, episode);
  }, [fetchTorrents]);

  /**
   * Precàrrega amb prioritat ALTA (per quan l'usuari vol reproduir)
   */
  const preloadWithHighPriority = useCallback(async (type, tmdbId, season = null, episode = null) => {
    console.log(`[StreamQueue] ⚡ Petició HIGH PRIORITY per ${type}/${tmdbId} S${season}E${episode}`);

    return addToQueue({
      type,
      tmdbId,
      season,
      episode,
      priority: PRIORITY.HIGH
    });
  }, [addToQueue]);

  /**
   * Precarrega amb prioritat NORMAL (continue watching)
   */
  const preloadWithNormalPriority = useCallback((type, tmdbId, season = null, episode = null) => {
    return addToQueue({
      type,
      tmdbId,
      season,
      episode,
      priority: PRIORITY.NORMAL
    });
  }, [addToQueue]);

  /**
   * Precarrega amb prioritat BAIXA
   */
  const preloadWithLowPriority = useCallback((type, tmdbId, season = null, episode = null) => {
    return addToQueue({
      type,
      tmdbId,
      season,
      episode,
      priority: PRIORITY.LOW
    });
  }, [addToQueue]);

  /**
   * Precarrega el contingut "Continue Watching" en segon pla
   */
  const initializeBackgroundPreload = useCallback(async () => {
    if (backgroundInitialized) return;
    setBackgroundInitialized(true); // Marcar immediatament per evitar crides duplicades

    try {
      const response = await axios.get(`${API_URL}/api/user/continue-watching`, { timeout: 10000 });
      const items = response.data || [];

      if (items.length === 0) {
        console.log('[StreamQueue] No hi ha contingut "Continue Watching"');
        return;
      }

      console.log(`[StreamQueue] Iniciant precàrrega de ${items.length} items "Continue Watching"`);

      for (const item of items) {
        if (!item.tmdb_id) continue;

        const isMovie = item.type === 'movie';

        if (isMovie) {
          preloadWithNormalPriority('movie', item.tmdb_id);
        } else {
          const season = item.season_number || 1;
          const episode = item.episode_number || 1;
          preloadWithNormalPriority('tv', item.tmdb_id, season, episode);
        }
      }
    } catch (error) {
      console.log('[StreamQueue] Error obtenint continue watching:', error.message);
    }
  }, [backgroundInitialized, preloadWithNormalPriority]);

  /**
   * Precarrega el millor torrent d'una llista (compatibilitat)
   */
  const preloadAutoQualityFirst = useCallback(async (torrents, season = null, episode = null) => {
    if (!torrents?.length) return { autoTorrent: null, autoUrl: null };

    const bestTorrent = getBestTorrent(torrents);
    if (!bestTorrent) return { autoTorrent: null, autoUrl: null };

    try {
      const url = await fetchStreamUrl(bestTorrent, season, episode);
      return { autoTorrent: bestTorrent, autoUrl: url };
    } catch (error) {
      console.log(`[StreamCache] Error precarregant:`, error.message);
      return { autoTorrent: bestTorrent, autoUrl: null };
    }
  }, [getBestTorrent, fetchStreamUrl]);

  /**
   * Determina el torrent preferit segons les preferències d'usuari
   */
  const getAutoQuality = useCallback((torrents) => {
    const best = getBestTorrent(torrents);
    if (!best) return null;
    return { quality: parseQuality(best.name), torrent: best };
  }, [getBestTorrent, parseQuality]);

  /**
   * Precarrega la URL de stream per un torrent específic (compatibilitat)
   */
  const preloadStreamUrl = useCallback(async (torrent, isBackground = false, season = null, episode = null) => {
    if (!torrent?.info_hash || !torrent?.magnet) return null;

    // Si no és cached i no és background, no carregar
    if (!torrent.cached && !isBackground) {
      return null;
    }

    try {
      return await fetchStreamUrl(torrent, season, episode);
    } catch (error) {
      if (!isBackground) {
        console.error(`[StreamCache] Error preloading stream:`, error);
      }
      return null;
    }
  }, [fetchStreamUrl]);

  /**
   * Neteja cache expirat
   */
  const cleanExpiredCache = useCallback(() => {
    const now = Date.now();

    Object.keys(torrentsCache.current).forEach(key => {
      if (now - torrentsCache.current[key].timestamp > CACHE_TTL) {
        delete torrentsCache.current[key];
      }
    });

    Object.keys(streamUrlCache.current).forEach(key => {
      if (now - streamUrlCache.current[key].timestamp > CACHE_TTL) {
        delete streamUrlCache.current[key];
      }
    });
  }, []);

  // Netejar cache expirat cada 5 minuts
  useEffect(() => {
    const interval = setInterval(cleanExpiredCache, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [cleanExpiredCache]);

  const value = {
    // Torrents cache
    getCachedTorrents,
    cacheTorrents,
    preloadTorrents,

    // Stream URLs cache
    getCachedStreamUrl,
    cacheStreamUrl,
    preloadStreamUrl,

    // Prioritzar qualitat automàtica (compatibilitat)
    getAutoQuality,
    preloadAutoQualityFirst,

    // Sistema de cua amb prioritats
    preloadWithHighPriority,
    preloadWithNormalPriority,
    preloadWithLowPriority,
    initializeBackgroundPreload,

    // Estat
    preloadingStatus,
    backgroundInitialized
  };

  return (
    <StreamCacheContext.Provider value={value}>
      {children}
    </StreamCacheContext.Provider>
  );
}

export function useStreamCache() {
  const context = useContext(StreamCacheContext);
  if (!context) {
    throw new Error('useStreamCache must be used within StreamCacheProvider');
  }
  return context;
}
