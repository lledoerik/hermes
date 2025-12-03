import React, { createContext, useState, useContext, useCallback } from 'react';
import axios from 'axios';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

const LibraryContext = createContext(null);

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION = 5 * 60 * 1000;

export function LibraryProvider({ children }) {
  // Loading state
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 6, message: 'Inicialitzant...' });

  // Cached data
  const [moviesCache, setMoviesCache] = useState({ data: null, timestamp: null, pages: {} });
  const [seriesCache, setSeriesCache] = useState({ data: null, timestamp: null, pages: {} });
  const [booksCache, setBooksCache] = useState({ data: null, timestamp: null });
  const [audiobooksCache, setAudiobooksCache] = useState({ data: null, timestamp: null });
  const [homeCache, setHomeCache] = useState({ data: null, timestamp: null });
  const [statsCache, setStatsCache] = useState({ data: null, timestamp: null });

  // Check if cache is valid
  const isCacheValid = (cache) => {
    if (!cache.data || !cache.timestamp) return false;
    return Date.now() - cache.timestamp < CACHE_EXPIRATION;
  };

  // Preload all data at startup
  const preloadData = useCallback(async () => {
    setInitialLoading(true);
    const total = 6;
    let current = 0;

    try {
      // 1. Load movies (first page)
      setLoadingProgress({ current: ++current, total, message: 'Carregant pel·lícules...' });
      try {
        const moviesRes = await axios.get(`${API_URL}/api/library/movies`, {
          params: { page: 1, limit: 50, sort_by: 'name' }
        });
        setMoviesCache({
          data: moviesRes.data,
          timestamp: Date.now(),
          pages: { 1: { data: moviesRes.data.items, timestamp: Date.now() } }
        });
      } catch (e) {
        console.error('Error loading movies:', e);
      }

      // 2. Load series (first page)
      setLoadingProgress({ current: ++current, total, message: 'Carregant sèries...' });
      try {
        const seriesRes = await axios.get(`${API_URL}/api/library/series`, {
          params: { page: 1, limit: 50, sort_by: 'name' }
        });
        setSeriesCache({
          data: seriesRes.data,
          timestamp: Date.now(),
          pages: { 1: { data: seriesRes.data.items, timestamp: Date.now() } }
        });
      } catch (e) {
        console.error('Error loading series:', e);
      }

      // 3. Load books
      setLoadingProgress({ current: ++current, total, message: 'Carregant llibres...' });
      try {
        const booksRes = await axios.get(`${API_URL}/api/library/books`);
        setBooksCache({ data: booksRes.data, timestamp: Date.now() });
      } catch (e) {
        console.error('Error loading books:', e);
      }

      // 4. Load audiobooks
      setLoadingProgress({ current: ++current, total, message: 'Carregant audiollibres...' });
      try {
        const audiobooksRes = await axios.get(`${API_URL}/api/library/audiobooks`);
        setAudiobooksCache({ data: audiobooksRes.data, timestamp: Date.now() });
      } catch (e) {
        console.error('Error loading audiobooks:', e);
      }

      // 5. Load home data (recent, continue watching, etc.)
      setLoadingProgress({ current: ++current, total, message: 'Carregant inici...' });
      try {
        const [recentRes, continueRes] = await Promise.all([
          axios.get(`${API_URL}/api/library/recent`).catch(() => ({ data: [] })),
          axios.get(`${API_URL}/api/user/continue-watching`).catch(() => ({ data: [] }))
        ]);
        setHomeCache({
          data: { recent: recentRes.data, continueWatching: continueRes.data },
          timestamp: Date.now()
        });
      } catch (e) {
        console.error('Error loading home:', e);
      }

      // 6. Load stats
      setLoadingProgress({ current: ++current, total, message: 'Finalitzant...' });
      try {
        const statsRes = await axios.get(`${API_URL}/api/library/stats`);
        setStatsCache({ data: statsRes.data, timestamp: Date.now() });
      } catch (e) {
        console.error('Error loading stats:', e);
      }

    } catch (error) {
      console.error('Error preloading data:', error);
    } finally {
      // Small delay to show completion
      setTimeout(() => {
        setInitialLoading(false);
      }, 300);
    }
  }, []);

  // Get movies with caching
  const getMovies = useCallback(async (page = 1, limit = 50, sortBy = 'name', contentType = null, category = null, forceRefresh = false) => {
    const cacheKey = `${page}-${limit}-${sortBy}-${contentType || 'all'}-${category || 'none'}`;

    // Check page cache first
    if (!forceRefresh && moviesCache.pages[cacheKey] && isCacheValid({ data: true, timestamp: moviesCache.pages[cacheKey].timestamp })) {
      return moviesCache.pages[cacheKey].data;
    }

    try {
      const params = { page, limit, sort_by: sortBy };
      if (contentType && contentType !== 'all') {
        params.content_type = contentType;
      }
      if (category && !['name', 'year', 'popular'].includes(category)) {
        params.category = category;
      }
      const response = await axios.get(`${API_URL}/api/library/movies`, { params });

      // Update cache
      setMoviesCache(prev => ({
        ...prev,
        pages: {
          ...prev.pages,
          [cacheKey]: { data: response.data, timestamp: Date.now() }
        }
      }));

      return response.data;
    } catch (error) {
      console.error('Error fetching movies:', error);
      throw error;
    }
  }, [moviesCache.pages]);

  // Get series with caching
  const getSeries = useCallback(async (page = 1, limit = 50, sortBy = 'name', contentType = null, category = null, forceRefresh = false) => {
    const cacheKey = `${page}-${limit}-${sortBy}-${contentType || 'all'}-${category || 'none'}`;

    if (!forceRefresh && seriesCache.pages[cacheKey] && isCacheValid({ data: true, timestamp: seriesCache.pages[cacheKey].timestamp })) {
      return seriesCache.pages[cacheKey].data;
    }

    try {
      const params = { page, limit, sort_by: sortBy };
      if (contentType && contentType !== 'all') {
        params.content_type = contentType;
      }
      if (category && !['name', 'year', 'popular'].includes(category)) {
        params.category = category;
      }
      const response = await axios.get(`${API_URL}/api/library/series`, { params });

      setSeriesCache(prev => ({
        ...prev,
        pages: {
          ...prev.pages,
          [cacheKey]: { data: response.data, timestamp: Date.now() }
        }
      }));

      return response.data;
    } catch (error) {
      console.error('Error fetching series:', error);
      throw error;
    }
  }, [seriesCache.pages]);

  // Get books with caching
  const getBooks = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && isCacheValid(booksCache)) {
      return booksCache.data;
    }

    try {
      const response = await axios.get(`${API_URL}/api/library/books`);
      setBooksCache({ data: response.data, timestamp: Date.now() });
      return response.data;
    } catch (error) {
      console.error('Error fetching books:', error);
      throw error;
    }
  }, [booksCache]);

  // Get audiobooks with caching
  const getAudiobooks = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && isCacheValid(audiobooksCache)) {
      return audiobooksCache.data;
    }

    try {
      const response = await axios.get(`${API_URL}/api/library/audiobooks`);
      setAudiobooksCache({ data: response.data, timestamp: Date.now() });
      return response.data;
    } catch (error) {
      console.error('Error fetching audiobooks:', error);
      throw error;
    }
  }, [audiobooksCache]);

  // Get home data with caching
  const getHomeData = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && isCacheValid(homeCache)) {
      return homeCache.data;
    }

    try {
      const [recentRes, continueRes] = await Promise.all([
        axios.get(`${API_URL}/api/library/recent`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/user/continue-watching`).catch(() => ({ data: [] }))
      ]);
      const data = { recent: recentRes.data, continueWatching: continueRes.data };
      setHomeCache({ data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error('Error fetching home data:', error);
      throw error;
    }
  }, [homeCache]);

  // Invalidate cache (e.g., after import)
  const invalidateCache = useCallback((type = 'all') => {
    if (type === 'all' || type === 'movies') {
      setMoviesCache({ data: null, timestamp: null, pages: {} });
    }
    if (type === 'all' || type === 'series') {
      setSeriesCache({ data: null, timestamp: null, pages: {} });
    }
    if (type === 'all' || type === 'books') {
      setBooksCache({ data: null, timestamp: null });
    }
    if (type === 'all' || type === 'audiobooks') {
      setAudiobooksCache({ data: null, timestamp: null });
    }
    if (type === 'all' || type === 'home') {
      setHomeCache({ data: null, timestamp: null });
    }
    if (type === 'all' || type === 'stats') {
      setStatsCache({ data: null, timestamp: null });
    }
  }, []);

  // Refresh all data
  const refreshAll = useCallback(() => {
    invalidateCache('all');
    preloadData();
  }, [invalidateCache, preloadData]);

  const value = {
    // Loading state
    initialLoading,
    loadingProgress,

    // Cached data getters
    getMovies,
    getSeries,
    getBooks,
    getAudiobooks,
    getHomeData,

    // Direct cache access (for initial render)
    moviesCache,
    seriesCache,
    booksCache,
    audiobooksCache,
    homeCache,
    statsCache,

    // Cache management
    invalidateCache,
    refreshAll,
    preloadData
  };

  return (
    <LibraryContext.Provider value={value}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary ha de ser usat dins de LibraryProvider');
  }
  return context;
}

export default LibraryContext;
