import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import './Library.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const TvIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const ClearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// Tipus de contingut per filtrar
const FILTER_TYPES = {
  series: { id: 'series', label: 'Sèries' },
  anime: { id: 'anime', label: 'Anime' },
  cartoons: { id: 'cartoons', label: 'Dibuixos' }
};

const STORAGE_KEY = 'hermes_series_filters';

// Carregar filtres guardats o usar valor per defecte
const loadSavedFilters = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  return ['series']; // Per defecte només sèries
};

// Funció per determinar el tipus d'un item
const getItemType = (item) => {
  // Comprovar si és animació (gènere 16 o nom 'Animation'/'Animació')
  let isAnimation = false;
  if (item.genres) {
    if (Array.isArray(item.genres)) {
      isAnimation = item.genres.some(g => {
        if (typeof g === 'object') {
          return g.id === 16 || g.name?.toLowerCase() === 'animation' || g.name?.toLowerCase() === 'animació';
        }
        return g === 16 || g === 'Animation' || g === 'Animació';
      });
    }
  }
  // També comprovar genre_ids (format TMDB directe)
  if (!isAnimation && item.genre_ids) {
    isAnimation = item.genre_ids.includes(16);
  }

  const isJapanese = item.original_language === 'ja';

  if (isAnimation && isJapanese) return 'anime';
  if (isAnimation) return 'cartoons';
  return 'series';
};

// Hook per detectar long-press
const useLongPress = (onLongPress, onClick, { delay = 500 } = {}) => {
  const timeoutRef = useRef(null);
  const isLongPressRef = useRef(false);

  const start = useCallback((e) => {
    e.preventDefault();
    isLongPressRef.current = false;
    timeoutRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress(e);
    }, delay);
  }, [onLongPress, delay]);

  const clear = useCallback((e, shouldTriggerClick = true) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (shouldTriggerClick && !isLongPressRef.current) {
      onClick(e);
    }
  }, [onClick]);

  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: (e) => clear(e, false),
    onTouchStart: start,
    onTouchEnd: clear,
  };
};

// Component FilterButton amb long-press
const FilterButton = ({ filter, isActive, onClick, onLongPress }) => {
  const longPressProps = useLongPress(onLongPress, onClick, { delay: 500 });

  return (
    <button
      className={`content-type-btn ${isActive ? 'active' : ''}`}
      {...longPressProps}
    >
      {filter.label}
    </button>
  );
};

// Pagination icons
const ChevronLeftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

function Series() {
  const { isAdmin } = useAuth();
  const { getSeries, seriesCache, invalidateCache } = useLibrary();
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 50;

  // Filtres actius (carrega de localStorage o per defecte només sèries)
  const [activeFilters, setActiveFilters] = useState(loadSavedFilters);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [localSearchResults, setLocalSearchResults] = useState(null); // Resultats de cerca a la BD

  // Discover state (només admin)
  const [discoverCategory, setDiscoverCategory] = useState('popular');
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverTotalPages, setDiscoverTotalPages] = useState(1);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [autoImporting, setAutoImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Initial load from cache
  useEffect(() => {
    const cacheKey = `1-50-name-all`;
    if (seriesCache.pages[cacheKey]?.data) {
      const cached = seriesCache.pages[cacheKey].data;
      setSeries(cached.items || []);
      setTotalPages(cached.total_pages || 1);
      setTotalItems(cached.total || 0);
      setLoading(false);
    } else {
      loadSeries();
    }
    // Només auto-importar si és admin
    if (isAdmin) {
      loadAndImportDiscover('popular', 1);
    }
  }, [isAdmin]);

  // Guardar filtres a localStorage quan canvien
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeFilters));
  }, [activeFilters]);

  // Reload series when pagination or sorting changes
  useEffect(() => {
    loadSeries();
  }, [currentPage, sortBy]);

  // Search in database when searchQuery changes
  useEffect(() => {
    const searchInDatabase = async () => {
      if (!searchQuery.trim()) {
        setLocalSearchResults(null);
        return;
      }

      setSearchLoading(true);
      try {
        const response = await axios.get(`/api/library/series?search=${encodeURIComponent(searchQuery)}&limit=500`);
        setLocalSearchResults(response.data?.items || []);
      } catch (error) {
        console.error('Error cercant a la BD:', error);
        setLocalSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    };

    const timer = setTimeout(searchInDatabase, 300); // Debounce
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click: selecció exclusiva (només aquest filtre)
  const handleFilterClick = useCallback((filterId) => {
    setActiveFilters([filterId]);
  }, []);

  // Long-press: afegir/treure filtre (multi-selecció)
  const handleFilterLongPress = useCallback((filterId) => {
    setActiveFilters(prev => {
      if (prev.includes(filterId)) {
        // No permetre treure l'últim filtre
        if (prev.length === 1) return prev;
        return prev.filter(f => f !== filterId);
      } else {
        return [...prev, filterId];
      }
    });
  }, []);

  const loadSeries = async () => {
    try {
      setLoading(true);
      // Carregar totes les sèries sense filtre de content_type
      const data = await getSeries(currentPage, itemsPerPage, sortBy, null);
      setSeries(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotalItems(data.total || 0);
    } catch (error) {
      console.error('Error carregant sèries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Generate page numbers to show
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

  const loadAndImportDiscover = async (category, page, append = false) => {
    setDiscoverLoading(true);
    try {
      const response = await axios.get(`/api/discover/series?category=${category}&page=${page}`);
      const results = response.data.results;

      setDiscoverTotalPages(response.data.total_pages);
      setDiscoverPage(page);
      setDiscoverCategory(category);

      // Auto-import items not already in library
      const toImport = results.filter(item => !item.in_library);

      if (toImport.length > 0) {
        setAutoImporting(true);
        setImportProgress({ current: 0, total: toImport.length });

        for (let i = 0; i < toImport.length; i++) {
          const item = toImport[i];
          try {
            await axios.post('/api/import/tmdb', {
              tmdb_id: item.id,
              media_type: 'series'
            });
            setImportProgress({ current: i + 1, total: toImport.length });
          } catch (err) {
            console.error(`Error important ${item.title}:`, err);
          }
        }

        setAutoImporting(false);
        invalidateCache('series');
        await loadSeries();
      }
    } catch (error) {
      console.error('Error carregant descobrir:', error);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleCategoryChange = (category) => {
    if (category !== discoverCategory && !autoImporting) {
      loadAndImportDiscover(category, 1);
    }
  };

  const handleLoadMore = () => {
    if (discoverPage < discoverTotalPages && !autoImporting) {
      loadAndImportDiscover(discoverCategory, discoverPage + 1, true);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  // Use API search results if searching, otherwise use paginated series
  const baseSeries = searchQuery.trim()
    ? (localSearchResults || [])
    : series;

  // Aplicar filtres de tipus
  const filteredSeries = baseSeries.filter(show => {
    const itemType = getItemType(show);
    return activeFilters.includes(itemType);
  });

  // No need to sort client-side anymore - backend handles it
  const sortedSeries = filteredSeries;

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant sèries...</div>
      </div>
    );
  }

  const isSearching = searchQuery.trim().length > 0;
  const hasLocalResults = sortedSeries.length > 0;

  const categoryLabels = {
    popular: 'Populars',
    trending: 'En tendència',
    top_rated: 'Millor valorades',
    on_the_air: 'En emissió',
    airing_today: 'Avui'
  };

  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title-row">
          <div className="library-title">
            <span className="icon"><TvIcon /></span>
            <h1>Sèries</h1>
            <span className="library-count">({totalItems})</span>
          </div>

        </div>

        <div className="library-filters">
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Cerca sèries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={clearSearch}>
                <ClearIcon />
              </button>
            )}
            {searchLoading && <div className="search-spinner"></div>}
          </div>
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name">Ordenar per nom</option>
            <option value="episodes">Ordenar per episodis</option>
            <option value="seasons">Ordenar per temporades</option>
            <option value="recent">Afegides recentment</option>
          </select>
        </div>

        {/* Filtres de tipus */}
        <div className="content-type-filters">
          {Object.values(FILTER_TYPES).map(filter => (
            <FilterButton
              key={filter.id}
              filter={filter}
              isActive={activeFilters.includes(filter.id)}
              onClick={() => handleFilterClick(filter.id)}
              onLongPress={() => handleFilterLongPress(filter.id)}
            />
          ))}
          <span className="filter-hint">Mantén premut per multi-selecció</span>
        </div>
      </div>

      {/* Category tabs for discover - només admin */}
      {isAdmin && !isSearching && (
        <div className="category-tabs">
          {Object.entries(categoryLabels).map(([key, label]) => (
            <button
              key={key}
              className={`category-tab ${discoverCategory === key ? 'active' : ''}`}
              onClick={() => handleCategoryChange(key)}
              disabled={autoImporting}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Auto-import progress - només admin */}
      {isAdmin && autoImporting && (
        <div className="import-progress-bar">
          <div className="import-progress-text">
            Important sèries... {importProgress.current}/{importProgress.total}
          </div>
          <div className="import-progress-track">
            <div
              className="import-progress-fill"
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Search results */}
      {isSearching ? (
        <>
          <div className="library-grid">
            {sortedSeries.map((show) => (
              <MediaCard
                key={`local-${show.id}`}
                item={show}
                type="series"
                width="100%"
              />
            ))}
          </div>

          {!hasLocalResults && (
            <div className="empty-state">
              <div className="empty-icon"><SearchIcon /></div>
              <h2>Sense resultats</h2>
              <p>No s'han trobat sèries per "{searchQuery}"</p>
            </div>
          )}
        </>
      ) : (
        <>
          {hasLocalResults ? (
            <>
              <div className="library-grid">
                {sortedSeries.map((show) => (
                  <MediaCard
                    key={`local-${show.id}`}
                    item={show}
                    type="series"
                    width="100%"
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination-container">
                  <div className="pagination-info">
                    Pàgina {currentPage} de {totalPages} ({totalItems} sèries)
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
                  ? `Important sèries ${categoryLabels[discoverCategory].toLowerCase()}...`
                  : 'Carregant sèries...'}
              </span>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><TvIcon /></div>
              <h2>No hi ha sèries</h2>
              <p>{isAdmin ? 'Selecciona una categoria per importar sèries' : 'La biblioteca està buida'}</p>
            </div>
          )}

          {/* Load more button - només admin */}
          {isAdmin && hasLocalResults && discoverPage < discoverTotalPages && !autoImporting && (
            <div className="load-more-container">
              <button
                className="load-more-btn"
                onClick={handleLoadMore}
                disabled={discoverLoading}
              >
                {discoverLoading ? 'Carregant...' : `Carregar més ${categoryLabels[discoverCategory].toLowerCase()}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Series;
