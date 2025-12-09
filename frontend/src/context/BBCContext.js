/**
 * BBCContext - Cache d'IDs de contingut disponible a BBC iPlayer
 *
 * Carrega una sola vegada la llista de TMDB IDs que tenen BBC mapping
 * i proporciona funcions ràpides per comprovar si un contingut té BBC.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';

const BBCContext = createContext(null);

// Temps de refresc del cache (5 minuts)
const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000;

export function BBCProvider({ children }) {
  // Sets per búsqueda O(1)
  const [tvIds, setTvIds] = useState(new Set());
  const [movieIds, setMovieIds] = useState(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const lastFetch = useRef(0);

  /**
   * Carrega els IDs de BBC mapping
   */
  const loadBbcMappedIds = useCallback(async (force = false) => {
    // Evitar crides duplicades
    if (isLoading) return;

    // Comprovar si el cache és recent
    const now = Date.now();
    if (!force && lastFetch.current && now - lastFetch.current < CACHE_REFRESH_INTERVAL) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.get(`${API_URL}/api/bbc/mapped-ids`, {
        timeout: 5000
      });

      if (response.data.status === 'success') {
        setTvIds(new Set(response.data.tv || []));
        setMovieIds(new Set(response.data.movie || []));
        lastFetch.current = now;
        setIsLoaded(true);
      }
    } catch (error) {
      console.log('[BBCContext] Error carregant mapped IDs:', error.message);
      // No fallar, simplement no mostrar badges
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // Carrega inicial quan es munta el provider
  useEffect(() => {
    loadBbcMappedIds();
  }, [loadBbcMappedIds]);

  // Refrescar periòdicament
  useEffect(() => {
    const interval = setInterval(() => {
      loadBbcMappedIds();
    }, CACHE_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [loadBbcMappedIds]);

  /**
   * Comprova si una sèrie té BBC mapping
   */
  const hasBbcTv = useCallback((tmdbId) => {
    if (!tmdbId) return false;
    const id = typeof tmdbId === 'string' ? parseInt(tmdbId, 10) : tmdbId;
    return tvIds.has(id);
  }, [tvIds]);

  /**
   * Comprova si una pel·lícula té BBC mapping
   */
  const hasBbcMovie = useCallback((tmdbId) => {
    if (!tmdbId) return false;
    const id = typeof tmdbId === 'string' ? parseInt(tmdbId, 10) : tmdbId;
    return movieIds.has(id);
  }, [movieIds]);

  /**
   * Comprova si un contingut té BBC mapping (auto-detecta tipus)
   */
  const hasBbc = useCallback((tmdbId, type = 'tv') => {
    if (type === 'movie' || type === 'movies') {
      return hasBbcMovie(tmdbId);
    }
    return hasBbcTv(tmdbId);
  }, [hasBbcTv, hasBbcMovie]);

  const value = {
    hasBbc,
    hasBbcTv,
    hasBbcMovie,
    isLoaded,
    isLoading,
    refresh: () => loadBbcMappedIds(true),
    // Per debugging
    tvCount: tvIds.size,
    movieCount: movieIds.size
  };

  return (
    <BBCContext.Provider value={value}>
      {children}
    </BBCContext.Provider>
  );
}

export function useBBC() {
  const context = useContext(BBCContext);
  if (!context) {
    // Si no hi ha provider, retornar valors per defecte
    return {
      hasBbc: () => false,
      hasBbcTv: () => false,
      hasBbcMovie: () => false,
      isLoaded: false,
      isLoading: false,
      refresh: () => {},
      tvCount: 0,
      movieCount: 0
    };
  }
  return context;
}
