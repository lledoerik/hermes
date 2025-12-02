import React, { useState, useEffect } from 'react';
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
const MovieIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
    <line x1="7" y1="2" x2="7" y2="22"></line>
    <line x1="17" y1="2" x2="17" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <line x1="2" y1="7" x2="7" y2="7"></line>
    <line x1="2" y1="17" x2="7" y2="17"></line>
    <line x1="17" y1="17" x2="22" y2="17"></line>
    <line x1="17" y1="7" x2="22" y2="7"></line>
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

// Content type filter labels (toggle buttons)
const contentTypeLabels = {
  movie: 'Pel·lícules',
  anime_movie: 'Anime',
  animated: 'Animació'
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

function Movies() {
  const { isAdmin } = useAuth();
  const { getMovies, moviesCache, invalidateCache } = useLibrary();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 50;

  // Content type filter state (array for multi-select, default to 'movie')
  const [selectedContentTypes, setSelectedContentTypes] = useState(['movie']);

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
    if (moviesCache.pages[cacheKey]?.data) {
      const cached = moviesCache.pages[cacheKey].data;
      setMovies(cached.items || []);
      setTotalPages(cached.total_pages || 1);
      setTotalItems(cached.total || 0);
      setLoading(false);
    } else {
      loadMovies();
    }
    // Només auto-importar si és admin
    if (isAdmin) {
      loadAndImportDiscover('popular', 1);
    }
  }, [isAdmin]);

  // Reload movies when pagination or sorting changes
  useEffect(() => {
    loadMovies();
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
        const response = await axios.get(`/api/library/movies?search=${encodeURIComponent(searchQuery)}&limit=500`);
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

  // Toggle content type selection
  const toggleContentType = (type) => {
    setSelectedContentTypes(prev => {
      if (prev.includes(type)) {
        // Don't allow deselecting if it's the only one selected
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const loadMovies = async () => {
    try {
      setLoading(true);
      // Carregar totes les pel·lícules sense filtre de content_type
      const data = await getMovies(currentPage, itemsPerPage, sortBy, null);
      setMovies(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotalItems(data.total || 0);
    } catch (error) {
      console.error('Error carregant pel·lícules:', error);
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
      const response = await axios.get(`/api/discover/movies?category=${category}&page=${page}`);
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
              media_type: 'movie'
            });
            setImportProgress({ current: i + 1, total: toImport.length });
          } catch (err) {
            console.error(`Error important ${item.title}:`, err);
          }
        }

        setAutoImporting(false);
        // Invalidate cache and reload movies to show newly imported ones
        invalidateCache('movies');
        await loadMovies();
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

  // Use API search results if searching, otherwise use paginated movies
  const filteredMovies = searchQuery.trim()
    ? (localSearchResults || [])
    : movies;

  // No need to sort client-side anymore - backend handles it
  const sortedMovies = filteredMovies;

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant pel·lícules...</div>
      </div>
    );
  }

  const isSearching = searchQuery.trim().length > 0;
  const hasLocalResults = sortedMovies.length > 0;

  const categoryLabels = {
    popular: 'Populars',
    trending: 'En tendència',
    top_rated: 'Millor valorades',
    now_playing: 'En cartellera',
    upcoming: 'Pròximament'
  };

  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title-row">
          <div className="library-title">
            <span className="icon"><MovieIcon /></span>
            <h1>Pel·lícules</h1>
            <span className="library-count">({totalItems})</span>
          </div>

        </div>

        <div className="library-filters">
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Cerca pel·lícules..."
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
            <option value="year">Ordenar per any</option>
            <option value="duration">Ordenar per duració</option>
            <option value="recent">Afegides recentment</option>
          </select>
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
            Important pel·lícules... {importProgress.current}/{importProgress.total}
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
            {sortedMovies.map((movie) => (
              <MediaCard
                key={`local-${movie.id}`}
                item={movie}
                type="movies"
                width="100%"
              />
            ))}
          </div>

          {!hasLocalResults && (
            <div className="empty-state">
              <div className="empty-icon"><SearchIcon /></div>
              <h2>Sense resultats</h2>
              <p>No s'han trobat pel·lícules per "{searchQuery}"</p>
            </div>
          )}
        </>
      ) : (
        /* Library view - all movies are now local */
        <>
          {hasLocalResults ? (
            <>
              <div className="library-grid">
                {sortedMovies.map((movie) => (
                  <MediaCard
                    key={`local-${movie.id}`}
                    item={movie}
                    type="movies"
                    width="100%"
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination-container">
                  <div className="pagination-info">
                    Pàgina {currentPage} de {totalPages} ({totalItems} pel·lícules)
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
                  ? `Important pel·lícules ${categoryLabels[discoverCategory].toLowerCase()}...`
                  : 'Carregant pel·lícules...'}
              </span>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><MovieIcon /></div>
              <h2>No hi ha pel·lícules</h2>
              <p>{isAdmin ? 'Selecciona una categoria per importar pel·lícules' : 'La biblioteca està buida'}</p>
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

export default Movies;
