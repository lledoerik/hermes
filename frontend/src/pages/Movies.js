import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
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

const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const ClearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const StarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
);

function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [externalResults, setExternalResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [importing, setImporting] = useState({});
  const [imported, setImported] = useState({});
  const [importingAll, setImportingAll] = useState(false);

  // Discover state
  const [discoverResults, setDiscoverResults] = useState([]);
  const [discoverCategory, setDiscoverCategory] = useState('popular');
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverTotalPages, setDiscoverTotalPages] = useState(1);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  useEffect(() => {
    loadMovies();
    loadDiscover('popular', 1);
  }, []);

  const loadDiscover = async (category, page, append = false) => {
    setDiscoverLoading(true);
    try {
      const response = await axios.get(`/api/discover/movies?category=${category}&page=${page}`);
      if (append) {
        setDiscoverResults(prev => [...prev, ...response.data.results]);
      } else {
        setDiscoverResults(response.data.results);
      }
      setDiscoverTotalPages(response.data.total_pages);
      setDiscoverPage(page);
      setDiscoverCategory(category);
    } catch (error) {
      console.error('Error carregant descobrir:', error);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleCategoryChange = (category) => {
    if (category !== discoverCategory) {
      loadDiscover(category, 1);
    }
  };

  const handleLoadMore = () => {
    if (discoverPage < discoverTotalPages) {
      loadDiscover(discoverCategory, discoverPage + 1, true);
    }
  };

  const searchExternal = useCallback(async (query) => {
    if (!query.trim()) return;

    setSearchLoading(true);
    try {
      const response = await axios.post('/api/import/search', {
        query: query.trim(),
        media_type: 'movie'
      });
      const existingTmdbIds = movies.filter(m => m.tmdb_id).map(m => m.tmdb_id);
      const filtered = response.data.results.filter(r => !existingTmdbIds.includes(r.id));
      setExternalResults(filtered);
    } catch (err) {
      console.error('Error cercant externament:', err);
      setExternalResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [movies]);

  // Debounced external search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setExternalResults([]);
      return;
    }

    const timer = setTimeout(() => {
      searchExternal(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, searchExternal]);

  const loadMovies = async () => {
    try {
      const response = await axios.get('/api/library/movies');
      setMovies(response.data);
    } catch (error) {
      console.error('Error carregant pel·lícules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (item, e) => {
    e?.stopPropagation();
    setImporting(prev => ({ ...prev, [item.id]: true }));
    try {
      await axios.post('/api/import/tmdb', {
        tmdb_id: item.id,
        media_type: 'movie'
      });
      setImported(prev => ({ ...prev, [item.id]: true }));
      setExternalResults(prev => prev.filter(r => r.id !== item.id));
      // Mark as in library in discover results
      setDiscoverResults(prev => prev.map(r =>
        r.id === item.id ? { ...r, in_library: true } : r
      ));
      loadMovies();
    } catch (err) {
      console.error('Error important:', err);
    } finally {
      setImporting(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const handleImportAll = async (items) => {
    if (items.length === 0) return;

    setImportingAll(true);
    const toImport = [...items].filter(item => !item.in_library);

    for (const item of toImport) {
      setImporting(prev => ({ ...prev, [item.id]: true }));
      try {
        await axios.post('/api/import/tmdb', {
          tmdb_id: item.id,
          media_type: 'movie'
        });
        setImported(prev => ({ ...prev, [item.id]: true }));
        setExternalResults(prev => prev.filter(r => r.id !== item.id));
        setDiscoverResults(prev => prev.map(r =>
          r.id === item.id ? { ...r, in_library: true } : r
        ));
      } catch (err) {
        console.error(`Error important ${item.title}:`, err);
      } finally {
        setImporting(prev => ({ ...prev, [item.id]: false }));
      }
    }

    loadMovies();
    setImportingAll(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setExternalResults([]);
  };

  // Filter local movies by search
  const filteredMovies = searchQuery.trim()
    ? movies.filter(m =>
        m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : movies;

  // Sort movies
  const sortedMovies = [...filteredMovies].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return (a.name || '').localeCompare(b.name || '');
      case 'year':
        return (b.year || 0) - (a.year || 0);
      case 'duration':
        return (b.duration || 0) - (a.duration || 0);
      case 'recent':
        return new Date(b.added_date || 0) - new Date(a.added_date || 0);
      default:
        return 0;
    }
  });

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
  const hasExternalResults = externalResults.length > 0;
  const hasDiscoverResults = discoverResults.length > 0;

  // Items to show in add-all for discover (not in library)
  const discoverNotInLibrary = discoverResults.filter(r => !r.in_library);

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
        <div className="library-title">
          <span className="icon"><MovieIcon /></span>
          <h1>Pel·lícules</h1>
          <span className="library-count">({movies.length} a la biblioteca)</span>
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

      {/* Category tabs for discover */}
      {!isSearching && (
        <div className="category-tabs">
          {Object.entries(categoryLabels).map(([key, label]) => (
            <button
              key={key}
              className={`category-tab ${discoverCategory === key ? 'active' : ''}`}
              onClick={() => handleCategoryChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Search results */}
      {isSearching ? (
        <>
          {hasExternalResults && (
            <div className="add-all-bar">
              <span>{externalResults.length} resultats de TMDB</span>
              <button
                className="add-all-btn"
                onClick={() => handleImportAll(externalResults)}
                disabled={importingAll}
              >
                {importingAll ? (
                  <>
                    <div className="btn-spinner"></div>
                    Important...
                  </>
                ) : (
                  <>
                    <PlusIcon />
                    Afegir tots
                  </>
                )}
              </button>
            </div>
          )}

          <div className="library-grid">
            {/* Local matches */}
            {sortedMovies.map((movie) => (
              <MediaCard
                key={`local-${movie.id}`}
                item={movie}
                type="movies"
                width="100%"
              />
            ))}

            {/* External search results */}
            {externalResults.map((item) => (
              <div
                key={`tmdb-${item.id}`}
                className="media-card external-card"
                onClick={() => window.open(`https://www.themoviedb.org/movie/${item.id}`, '_blank')}
              >
                <div className="media-poster">
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} />
                  ) : (
                    <div className="no-poster-placeholder">
                      <MovieIcon />
                    </div>
                  )}
                  <div className="external-badge">TMDB</div>
                  <button
                    className={`add-btn ${imported[item.id] ? 'added' : ''}`}
                    onClick={(e) => handleImport(item, e)}
                    disabled={importing[item.id] || imported[item.id]}
                    title="Afegir a la biblioteca"
                  >
                    {importing[item.id] ? (
                      <div className="btn-spinner"></div>
                    ) : imported[item.id] ? (
                      <CheckIcon />
                    ) : (
                      <PlusIcon />
                    )}
                  </button>
                </div>
                <div className="media-info">
                  <h3 className="media-title">{item.title}</h3>
                  <div className="media-meta">
                    {item.year && <span>{item.year}</span>}
                    {item.rating > 0 && (
                      <span className="rating">
                        <StarIcon /> {item.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!hasLocalResults && !hasExternalResults && (
            <div className="empty-state">
              <div className="empty-icon"><SearchIcon /></div>
              <h2>Sense resultats</h2>
              <p>No s'han trobat pel·lícules per "{searchQuery}"</p>
            </div>
          )}
        </>
      ) : (
        /* Discover view */
        <>
          {discoverNotInLibrary.length > 0 && (
            <div className="add-all-bar">
              <span>{discoverNotInLibrary.length} pel·lícules disponibles per afegir</span>
              <button
                className="add-all-btn"
                onClick={() => handleImportAll(discoverResults)}
                disabled={importingAll}
              >
                {importingAll ? (
                  <>
                    <div className="btn-spinner"></div>
                    Important...
                  </>
                ) : (
                  <>
                    <PlusIcon />
                    Afegir totes
                  </>
                )}
              </button>
            </div>
          )}

          {/* Local library section */}
          {hasLocalResults && (
            <>
              <h3 className="section-title">La meva biblioteca</h3>
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
            </>
          )}

          {/* Discover section */}
          {hasDiscoverResults && (
            <>
              <h3 className="section-title">
                {categoryLabels[discoverCategory]} a TMDB
              </h3>
              <div className="library-grid">
                {discoverResults.map((item) => (
                  <div
                    key={`discover-${item.id}`}
                    className={`media-card external-card ${item.in_library ? 'in-library' : ''}`}
                    onClick={() => window.open(`https://www.themoviedb.org/movie/${item.id}`, '_blank')}
                  >
                    <div className="media-poster">
                      {item.poster ? (
                        <img src={item.poster} alt={item.title} />
                      ) : (
                        <div className="no-poster-placeholder">
                          <MovieIcon />
                        </div>
                      )}
                      <div className="external-badge">
                        {item.in_library ? '✓ Biblioteca' : 'TMDB'}
                      </div>
                      {!item.in_library && (
                        <button
                          className={`add-btn ${imported[item.id] ? 'added' : ''}`}
                          onClick={(e) => handleImport(item, e)}
                          disabled={importing[item.id] || imported[item.id]}
                          title="Afegir a la biblioteca"
                        >
                          {importing[item.id] ? (
                            <div className="btn-spinner"></div>
                          ) : imported[item.id] ? (
                            <CheckIcon />
                          ) : (
                            <PlusIcon />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="media-info">
                      <h3 className="media-title">{item.title}</h3>
                      <div className="media-meta">
                        {item.year && <span>{item.year}</span>}
                        {item.rating > 0 && (
                          <span className="rating">
                            <StarIcon /> {item.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load more button */}
              {discoverPage < discoverTotalPages && (
                <div className="load-more-container">
                  <button
                    className="load-more-btn"
                    onClick={handleLoadMore}
                    disabled={discoverLoading}
                  >
                    {discoverLoading ? 'Carregant...' : 'Carregar més'}
                  </button>
                </div>
              )}
            </>
          )}

          {discoverLoading && !hasDiscoverResults && (
            <div className="loading-inline">
              <div className="spinner"></div>
              <span>Carregant pel·lícules...</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Movies;
