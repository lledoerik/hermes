/**
 * StreamCacheContext - Cache de fonts de streaming per millorar rendiment
 *
 * Funcionalitats:
 * - Precarrega fonts de torrents a la pàgina de detalls
 * - Guarda URLs de stream per canvis de qualitat instantanis
 * - Precarrega el següent episodi abans que acabi l'actual
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';

const StreamCacheContext = createContext(null);

// Temps de vida del cache (30 minuts)
const CACHE_TTL = 30 * 60 * 1000;

export function StreamCacheProvider({ children }) {
  // Cache de torrents per media (key: "movie_{tmdbId}" o "tv_{tmdbId}_s{season}_e{episode}")
  const torrentsCache = useRef({});

  // Cache de stream URLs (key: info_hash)
  const streamUrlCache = useRef({});

  // Estat de precàrrega en curs
  const [preloadingStatus, setPreloadingStatus] = useState({});

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
      console.log(`[StreamCache] Hit per ${key}`);
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
    console.log(`[StreamCache] Cached ${torrents.length} torrents per ${key}`);
  }, [getCacheKey]);

  /**
   * Precarrega torrents per un media (crida en background)
   */
  const preloadTorrents = useCallback(async (type, tmdbId, season = null, episode = null) => {
    const key = getCacheKey(type, tmdbId, season, episode);

    // Si ja està en cache vàlid, no cal tornar a carregar
    if (isCacheValid(torrentsCache.current[key])) {
      return torrentsCache.current[key].data;
    }

    // Si ja s'està carregant, no duplicar
    if (preloadingStatus[key]) {
      return null;
    }

    setPreloadingStatus(prev => ({ ...prev, [key]: true }));

    try {
      const mediaType = type === 'movie' ? 'movie' : 'tv';
      let url = `${API_URL}/api/debrid/torrents/${mediaType}/${tmdbId}`;

      if (mediaType === 'tv' && season && episode) {
        url += `?season=${season}&episode=${episode}`;
      }

      console.log(`[StreamCache] Preloading torrents per ${key}...`);
      const response = await axios.get(url);
      const streams = response.data.streams || [];

      // Guardar al cache
      cacheTorrents(type, tmdbId, season, episode, streams);

      return streams;
    } catch (error) {
      console.error(`[StreamCache] Error preloading ${key}:`, error);
      return null;
    } finally {
      setPreloadingStatus(prev => ({ ...prev, [key]: false }));
    }
  }, [getCacheKey, isCacheValid, preloadingStatus, cacheTorrents]);

  /**
   * Precarrega la URL de stream per un torrent específic
   * @param {Object} torrent - El torrent a precarregar
   * @param {boolean} isBackground - Si és precàrrega en background (timeout més curt)
   */
  const preloadStreamUrl = useCallback(async (torrent, isBackground = false) => {
    if (!torrent?.info_hash || !torrent?.magnet) return null;

    // Si ja està en cache, retornar
    const cached = streamUrlCache.current[torrent.info_hash];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.url;
    }

    // Només precarregar torrents que estan en cache de Real-Debrid (instantanis)
    if (!torrent.cached) {
      return null;
    }

    try {
      console.log(`[StreamCache] Preloading stream URL per ${torrent.info_hash.slice(0, 8)}...`);

      const params = {
        info_hash: torrent.info_hash,
        magnet: torrent.magnet
      };

      if (torrent.file_idx !== undefined && torrent.file_idx !== null) {
        params.file_idx = torrent.file_idx;
      }

      // Timeout més curt per background (10s) vs principal (30s)
      const timeout = isBackground ? 10000 : 30000;

      const response = await axios.post(`${API_URL}/api/debrid/stream`, null, {
        params,
        timeout
      });

      if (response.data.status === 'success') {
        const url = response.data.url;
        streamUrlCache.current[torrent.info_hash] = {
          url,
          timestamp: Date.now()
        };
        console.log(`[StreamCache] Stream URL cached per ${torrent.info_hash.slice(0, 8)}`);
        return url;
      }
    } catch (error) {
      // No mostrar errors per precàrrega en background - és normal que alguns fallin
      if (!isBackground) {
        console.error(`[StreamCache] Error preloading stream:`, error);
      } else {
        console.log(`[StreamCache] Background preload cancelled/failed per ${torrent.info_hash.slice(0, 8)}`);
      }
    }

    return null;
  }, []);

  /**
   * Obté URL de stream del cache
   */
  const getCachedStreamUrl = useCallback((infoHash) => {
    const cached = streamUrlCache.current[infoHash];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.url;
    }
    return null;
  }, []);

  /**
   * Guarda URL de stream al cache
   */
  const cacheStreamUrl = useCallback((infoHash, url) => {
    streamUrlCache.current[infoHash] = {
      url,
      timestamp: Date.now()
    };
  }, []);

  /**
   * Determina el torrent preferit segons les preferències d'usuari
   */
  const getAutoQuality = useCallback((torrents) => {
    if (!torrents?.length) return null;

    const QUALITY_ORDER = ['4K', '1080p', '720p'];
    const preferredAudioLang = localStorage.getItem('hermes_audio_lang') || 'en';
    const langCodeToLabel = { 'ca': 'CAT', 'es': 'ESP', 'en': 'ENG' };
    const preferredLangCode = langCodeToLabel[preferredAudioLang] || 'ENG';

    const parseQuality = (name) => {
      const lower = (name || '').toLowerCase();
      if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) return '4K';
      if (lower.includes('1080p')) return '1080p';
      return '720p';
    };

    const parseLanguage = (name, title) => {
      const text = `${name} ${title}`.toLowerCase();
      if (text.includes('catala') || text.includes('català')) return 'CAT';
      if (text.includes('castellano') || text.includes('español') || text.includes('spanish')) return 'ESP';
      if (text.includes('english') || text.includes('multi')) return 'ENG';
      return 'ENG';
    };

    const cachedTorrents = torrents.filter(t => t.cached);
    if (cachedTorrents.length === 0) return null;

    // Ordenar per preferències
    cachedTorrents.sort((a, b) => {
      const langA = parseLanguage(a.name, a.title) === preferredLangCode ? 0 : 1;
      const langB = parseLanguage(b.name, b.title) === preferredLangCode ? 0 : 1;
      if (langA !== langB) return langA - langB;

      const qualA = QUALITY_ORDER.indexOf(parseQuality(a.name));
      const qualB = QUALITY_ORDER.indexOf(parseQuality(b.name));
      return qualA - qualB;
    });

    const best = cachedTorrents[0];
    return { quality: parseQuality(best.name), torrent: best };
  }, []);

  /**
   * Precarrega PRIMER el torrent que el player seleccionarà (respectant preferències d'usuari),
   * retorna immediatament quan estigui llesta, i després continua carregant altres en background.
   *
   * @returns {Promise<{autoTorrent: Object, autoUrl: string|null}>} - Torrent i URL del torrent seleccionat
   */
  const preloadAutoQualityFirst = useCallback(async (torrents) => {
    if (!torrents?.length) return { autoTorrent: null, autoUrl: null };

    const QUALITY_ORDER = ['4K', '1080p', '720p'];

    // Obtenir preferències d'usuari (MATEIXA lògica que DebridPlayer)
    const preferredAudioLang = localStorage.getItem('hermes_audio_lang') || 'en';
    const preferredQuality = localStorage.getItem('hermes_quality') || 'auto';

    // Map language codes
    const langCodeToLabel = {
      'ca': 'CAT', 'es': 'ESP', 'en': 'ENG', 'fr': 'VO', 'de': 'VO',
      'it': 'VO', 'pt': 'VO', 'ja': 'VO', 'ko': 'VO', 'zh': 'VO', 'ru': 'VO'
    };
    const preferredLangCode = langCodeToLabel[preferredAudioLang] || 'ENG';

    // Parse language from torrent name (simplified version)
    const parseLanguage = (name, title) => {
      const text = `${name} ${title}`.toLowerCase();
      if (text.includes('catala') || text.includes('català')) return 'CAT';
      if (text.includes('latino') || text.includes('lat ')) return 'LAT';
      if (text.includes('castellano') || text.includes('español') || text.includes('spanish')) return 'ESP';
      if (text.includes('english') || text.includes('eng ') || text.includes('multi')) return 'ENG';
      return 'ENG'; // Default
    };

    // Parse quality
    const parseQuality = (name) => {
      const lower = (name || '').toLowerCase();
      if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) return '4K';
      if (lower.includes('1080p')) return '1080p';
      return '720p';
    };

    // Scoring function (same as DebridPlayer)
    const scoreTorrent = (t) => {
      const lang = parseLanguage(t.name, t.title);
      const quality = parseQuality(t.name);

      let langScore = lang === preferredLangCode ? 0 : (lang === 'ENG' ? 1 : 2);
      let qualityScore = QUALITY_ORDER.indexOf(quality);
      if (qualityScore < 0) qualityScore = 99;
      if (preferredQuality !== 'auto' && quality === preferredQuality) qualityScore = 0;

      return langScore * 100 + qualityScore; // Lang has priority
    };

    // Sort cached torrents by score
    const cachedTorrents = torrents.filter(t => t.cached);
    if (cachedTorrents.length === 0) {
      console.log('[StreamCache] No hi ha torrents cached per precarregar');
      return { autoTorrent: null, autoUrl: null };
    }

    cachedTorrents.sort((a, b) => scoreTorrent(a) - scoreTorrent(b));
    const autoTorrent = cachedTorrents[0];
    const autoQuality = parseQuality(autoTorrent.name);

    // PRIMER: Carregar el torrent que el player seleccionarà
    console.log(`[StreamCache] Precarregant torrent preferit (${autoQuality}, ${parseLanguage(autoTorrent.name, autoTorrent.title)})...`);
    const autoUrl = await preloadStreamUrl(autoTorrent);
    console.log(`[StreamCache] Torrent preferit llest! (${autoTorrent.info_hash.slice(0, 8)})`);

    // DESPRÉS: Carregar altres torrents cached en background (no bloquejar)
    const otherTorrents = cachedTorrents.slice(1, 4); // Màxim 3 més

    if (otherTorrents.length > 0) {
      setTimeout(async () => {
        console.log(`[StreamCache] Carregant ${otherTorrents.length} torrents més en background...`);
        // Passar isBackground=true per usar timeout curt i no bloquejar
        const promises = otherTorrents.map(t => preloadStreamUrl(t, true));
        await Promise.all(promises);
        console.log(`[StreamCache] Torrents addicionals carregats en background`);
      }, 100);
    }

    return { autoTorrent, autoUrl };
  }, [preloadStreamUrl]);

  /**
   * Precarrega el millor torrent (primer cached de cada qualitat) - versió original
   * (manté compatibilitat amb codi existent)
   */
  const preloadBestStreams = useCallback(async (torrents) => {
    if (!torrents?.length) return;

    // Agrupar per qualitat i agafar el primer cached de cada
    const qualityGroups = {};
    const QUALITY_ORDER = ['4K', '1080p', '720p'];

    torrents.forEach(t => {
      const name = t.name?.toLowerCase() || '';
      let quality = '720p';
      if (name.includes('2160p') || name.includes('4k') || name.includes('uhd')) {
        quality = '4K';
      } else if (name.includes('1080p')) {
        quality = '1080p';
      }

      if (!qualityGroups[quality]) {
        qualityGroups[quality] = [];
      }
      qualityGroups[quality].push(t);
    });

    // Precarregar el millor torrent cached de cada qualitat
    const preloadPromises = [];

    for (const quality of QUALITY_ORDER) {
      const group = qualityGroups[quality];
      if (group) {
        const cachedTorrent = group.find(t => t.cached);
        if (cachedTorrent) {
          preloadPromises.push(preloadStreamUrl(cachedTorrent));
        }
      }
    }

    await Promise.all(preloadPromises);
  }, [preloadStreamUrl]);

  /**
   * Neteja cache expirat
   */
  const cleanExpiredCache = useCallback(() => {
    const now = Date.now();

    // Netejar torrents cache
    Object.keys(torrentsCache.current).forEach(key => {
      if (now - torrentsCache.current[key].timestamp > CACHE_TTL) {
        delete torrentsCache.current[key];
      }
    });

    // Netejar stream URLs cache
    Object.keys(streamUrlCache.current).forEach(key => {
      if (now - streamUrlCache.current[key].timestamp > CACHE_TTL) {
        delete streamUrlCache.current[key];
      }
    });
  }, []);

  // Netejar cache expirat cada 5 minuts
  React.useEffect(() => {
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
    preloadBestStreams,

    // Prioritzar qualitat automàtica
    getAutoQuality,
    preloadAutoQualityFirst,

    // Estat
    preloadingStatus
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
