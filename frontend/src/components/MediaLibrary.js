/**
 * Component compartit per mostrar biblioteques de contingut (Pel·lícules i Sèries)
 * Elimina la duplicació de codi entre Movies.js i Series.js
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import MediaCard from './MediaCard';
import { MovieIcon, TvIcon, SearchIcon, ClearIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';

// Configuració per tipus de contingut
const LIBRARY_CONFIG = {
  movies: {
    title: 'Pel·lícules',
    icon: MovieIcon,
    storageKey: 'hermes_movies_filters',
    apiEndpoint: '/api/library/movies',
    discoverEndpoint: '/api/discover/movies',
    importType: 'movie',
    filterTypes: {
      movies: { id: 'movies', label: 'Pel·lícules', contentType: 'movie' },
      anime: { id: 'anime', label: 'Anime', contentType: 'anime_movie' },
      animation: { id: 'animation', label: 'Animació', contentType: 'animated' }
    },
    defaultFilter: 'movies',
    sortOptions: [
      { value: 'name', label: 'Ordenar per nom' },
      { value: 'year', label: 'Ordenar per any' },
      { value: 'duration', label: 'Ordenar per duració' }
    ],
    categories: {
      name: 'Per nom',
      year: 'Per any',
      now_playing: 'Cartellera',
      upcoming: 'Pròximament'
    },
    emptyText: 'pel·lícules',
    searchPlaceholder: 'Cerca pel·lícules...',
    tmdbSearchType: 'movies'
  },
  series: {
    title: 'Sèries',
    icon: TvIcon,
    storageKey: 'hermes_series_filters',
    apiEndpoint: '/api/library/series',
    discoverEndpoint: '/api/discover/series',
    importType: 'series',
    filterTypes: {
      series: { id: 'series', label: 'Sèries', contentType: 'series' },
      anime: { id: 'anime', label: 'Anime', contentType: 'anime' },
      cartoons: { id: 'cartoons', label: 'Dibuixos', contentType: 'toons' }
    },
    defaultFilter: 'series',
    sortOptions: [
      { value: 'name', label: 'Ordenar per nom' },
      { value: 'year', label: 'Ordenar per any' },
      { value: 'episodes', label: 'Ordenar per episodis' },
      { value: 'seasons', label: 'Ordenar per temporades' }
    ],
    categories: {
      name: 'Per nom',
      year: 'Per any',
      on_the_air: 'En emissió',
      airing_today: 'Avui'
    },
    emptyText: 'sèries',
    searchPlaceholder: 'Cerca sèries...',
    tmdbSearchType: 'series'
  }
};

// Component FilterButton
const FilterButton = ({ filter, isActive, onClick, onMultiSelect }) => {
  const handleClick = (e) => {
    if (e.ctrlKey || e.metaKey) {
      onMultiSelect();
    } else {
      onClick();
    }
  };

  return (
    <button
      className={`content-type-btn ${isActive ? 'active' : ''}`}
      onClick={handleClick}
    >
      {filter.label}
    </button>
  );
};

function MediaLibrary({ type = 'series' }) {
  const config = LIBRARY_CONFIG[type];
  const { isAdmin } = useAuth();
  const { getMovies, getSeries, invalidateCache } = useLibrary();
  const getItems = type === 'movies' ? getMovies : getSeries;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');
  const [activeCategory, setActiveCategory] = useState('name');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 50;

  // Filtres
  const loadSavedFilters = () => {
    try {
      const saved = localStorage.getItem(config.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return [config.defaultFilter];
  };

  const [activeFilters, setActiveFilters] = useState(loadSavedFilters);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [localSearchResults, setLocalSearchResults] = useState(null);

  // Discover (només admin per importar)
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverTotalPages, setDiscoverTotalPages] = useState(1);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [autoImporting, setAutoImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Convertir filtres a content_types
  const filtersToContentTypes = useCallback((filters) => {
    return filters
      .map(f => config.filterTypes[f]?.contentType)
      .filter(Boolean)
      .join(',');
  }, [config.filterTypes]);

  // Guardar filtres
  useEffect(() => {
    localStorage.setItem(config.storageKey, JSON.stringify(activeFilters));
  }, [activeFilters, config.storageKey]);

  // Cerca a TMDB (igual que Search.js però filtrat per tipus)
  useEffect(() => {
    const searchTMDB = async () => {
      if (!searchQuery.trim()) {
        setLocalSearchResults(null);
        return;
      }

      setSearchLoading(true);
      try {
        // Cercar a TMDB - igual que Search.js
        const response = await axios.get(`/api/tmdb/search?q=${encodeURIComponent(searchQuery)}`);
        // Filtrar només pel tipus corresponent (movies o series)
        const results = response.data[config.tmdbSearchType] || [];
        // Convertir al format esperat per MediaCard
        const formattedResults = results.map(item => ({
          id: `tmdb-${item.tmdb_id}`,
          tmdb_id: item.tmdb_id,
          name: item.name,
          year: item.year,
          poster: item.poster,
          rating: item.rating,
          is_tmdb: true
        }));
        setLocalSearchResults(formattedResults);
      } catch (error) {
        console.error('Error cercant a TMDB:', error);
        setLocalSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    };

    const timer = setTimeout(searchTMDB, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, config.tmdbSearchType]);

  // Gestió de filtres
  const handleFilterClick = useCallback((filterId) => {
    setActiveFilters([filterId]);
    setCurrentPage(1);
  }, []);

  const handleFilterLongPress = useCallback((filterId) => {
    setActiveFilters(prev => {
      if (prev.includes(filterId)) {
        if (prev.length === 1) return prev;
        return prev.filter(f => f !== filterId);
      }
      return [...prev, filterId];
    });
    setCurrentPage(1);
  }, []);

  // Carregar contingut
  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const contentType = filtersToContentTypes(activeFilters);
      // Convertir categoria a sortBy per l'API
      const apiSortBy = ['name', 'year'].includes(activeCategory) ? activeCategory : 'name';
      // Passar categoria per filtrar per TMDB (now_playing, upcoming, etc.)
      const apiCategory = !['name', 'year'].includes(activeCategory) ? activeCategory : null;
      const data = await getItems(currentPage, itemsPerPage, apiSortBy, contentType, apiCategory);
      setItems(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotalItems(data.total || 0);
    } catch (error) {
      console.error(`Error carregant ${config.emptyText}:`, error);
    } finally {
      setLoading(false);
    }
  }, [activeFilters, currentPage, activeCategory, getItems, filtersToContentTypes, config.emptyText]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Auto-import discover si és admin (només per categories TMDB)
  useEffect(() => {
    if (isAdmin && !['name', 'year'].includes(activeCategory)) {
      loadAndImportDiscover(activeCategory, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeCategory]);

  // Paginació
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  // Discover i import (només admin)
  const loadAndImportDiscover = async (category, page) => {
    if (!isAdmin || ['name', 'year'].includes(category)) return;

    setDiscoverLoading(true);
    try {
      const response = await axios.get(`${config.discoverEndpoint}?category=${category}&page=${page}`);
      const results = response.data.results;

      setDiscoverTotalPages(response.data.total_pages);
      setDiscoverPage(page);

      // Per categories amb filtratge per data (now_playing, upcoming),
      // importar TOTS els items per actualitzar release_date dels existents
      const needsDateUpdate = ['now_playing', 'upcoming', 'on_the_air', 'airing_today'].includes(category);
      const toImport = needsDateUpdate ? results : results.filter(item => !item.in_library);

      if (toImport.length > 0) {
        setAutoImporting(true);
        setImportProgress({ current: 0, total: toImport.length });

        for (let i = 0; i < toImport.length; i++) {
          const item = toImport[i];
          try {
            await axios.post('/api/import/tmdb', {
              tmdb_id: item.id,
              media_type: config.importType
            });
            setImportProgress({ current: i + 1, total: toImport.length });
          } catch (err) {
            console.error(`Error important ${item.title}:`, err);
          }
        }

        setAutoImporting(false);
        invalidateCache(type);
        await loadItems();
      }
    } catch (error) {
      console.error('Error carregant descobrir:', error);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleCategoryChange = (category) => {
    if (category !== activeCategory && !autoImporting) {
      setActiveCategory(category);
      setCurrentPage(1);
      // Si és admin i és una categoria TMDB, importar
      if (isAdmin && !['name', 'year'].includes(category)) {
        loadAndImportDiscover(category, 1);
      }
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const sortedItems = searchQuery.trim()
    ? (localSearchResults || [])
    : items;

  const Icon = config.icon;

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant {config.emptyText}...</div>
      </div>
    );
  }

  const isSearching = searchQuery.trim().length > 0;
  const hasResults = sortedItems.length > 0;

  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title">
          <span className="icon"><Icon size={28} /></span>
          <h1>{config.title}</h1>
        </div>
      </div>

      {/* Filtres: Category tabs + Filtres de tipus */}
      <div className="library-filters-row">
        {/* Category tabs - per tothom */}
        {!isSearching && (
          <div className="category-tabs">
            {Object.entries(config.categories).map(([key, label]) => (
              <button
                key={key}
                className={`category-tab ${activeCategory === key ? 'active' : ''}`}
                onClick={() => handleCategoryChange(key)}
                disabled={autoImporting}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Filtres de tipus */}
        <div className="content-type-filters">
          {Object.values(config.filterTypes).map(filter => (
            <FilterButton
              key={filter.id}
              filter={filter}
              isActive={activeFilters.includes(filter.id)}
              onClick={() => handleFilterClick(filter.id)}
              onMultiSelect={() => handleFilterLongPress(filter.id)}
            />
          ))}
        </div>
      </div>

      {/* Auto-import progress - només admin */}
      {isAdmin && autoImporting && (
        <div className="import-progress-bar">
          <div className="import-progress-text">
            Important {config.emptyText}... {importProgress.current}/{importProgress.total}
          </div>
          <div className="import-progress-track">
            <div
              className="import-progress-fill"
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Resultats */}
      {isSearching ? (
        <>
          <div className="library-grid">
            {sortedItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                type={type}
                width="100%"
                isTmdb={item.is_tmdb}
              />
            ))}
          </div>

          {!hasResults && (
            <div className="empty-state">
              <div className="empty-icon"><SearchIcon size={48} /></div>
              <h2>Sense resultats</h2>
              <p>No s'han trobat {config.emptyText} per "{searchQuery}"</p>
            </div>
          )}
        </>
      ) : (
        <>
          {hasResults ? (
            <>
              <div className="library-grid">
                {sortedItems.map((item) => (
                  <MediaCard
                    key={`local-${item.id}`}
                    item={item}
                    type={type}
                    width="100%"
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination-container">
                  <div className="pagination-info">
                    Pàgina {currentPage} de {totalPages} ({totalItems} {config.emptyText})
                  </div>
                  <div className="pagination-controls">
                    <button
                      className="pagination-btn"
                      onClick={() => handlePageChange(1)}
                      disabled={currentPage === 1}
                      title="Primera pàgina"
                    >
                      <ChevronLeftIcon /><ChevronLeftIcon />
                    </button>
                    <button
                      className="pagination-btn"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      title="Pàgina anterior"
                    >
                      <ChevronLeftIcon />
                    </button>

                    {getPageNumbers().map((pageNum) => (
                      <button
                        key={pageNum}
                        className={`pagination-btn page-number ${pageNum === currentPage ? 'active' : ''}`}
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </button>
                    ))}

                    <button
                      className="pagination-btn"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      title="Pàgina següent"
                    >
                      <ChevronRightIcon />
                    </button>
                    <button
                      className="pagination-btn"
                      onClick={() => handlePageChange(totalPages)}
                      disabled={currentPage === totalPages}
                      title="Última pàgina"
                    >
                      <ChevronRightIcon /><ChevronRightIcon />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : isAdmin && (discoverLoading || autoImporting) ? (
            <div className="loading-inline">
              <div className="spinner"></div>
              <span>
                {autoImporting
                  ? `Important ${config.emptyText} ${config.categories[activeCategory]?.toLowerCase() || ''}...`
                  : `Carregant ${config.emptyText}...`}
              </span>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><Icon size={48} /></div>
              <h2>No hi ha {config.emptyText}</h2>
              <p>{isAdmin ? 'Selecciona una categoria per importar contingut' : 'La biblioteca està buida'}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MediaLibrary;
