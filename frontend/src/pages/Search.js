import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import MediaCard from '../components/MediaCard';
import { API_URL } from '../config/api';
import { SearchIcon, TvIcon, MovieIcon } from '../components/icons';
import './Library.css';
import './Search.css';

axios.defaults.baseURL = API_URL;

function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const typeFilter = searchParams.get('type') || ''; // 'movies', 'series', o '' per tot

  const [results, setResults] = useState({ series: [], movies: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (query) {
      performSearch(query);
    } else {
      setLoading(false);
    }
  }, [query]);

  const performSearch = async (searchQuery) => {
    setLoading(true);

    try {
      // Cercar a TMDB - mostrar tot el que estigui disponible
      const tmdbRes = await axios.get(`/api/tmdb/search?q=${encodeURIComponent(searchQuery)}`);

      setResults({
        series: tmdbRes.data.series || [],
        movies: tmdbRes.data.movies || []
      });
    } catch (error) {
      console.error('Error cercant:', error);
      setResults({ series: [], movies: [] });
    } finally {
      setLoading(false);
    }
  };

  // Ordenació intel·ligent: prioritzar coincidència exacta i popularitat
  const getRelevanceScore = (item, searchQuery) => {
    const normalizedQuery = searchQuery.toLowerCase().trim();
    const normalizedName = (item.name || item.title || '').toLowerCase().trim();

    // Coincidència exacta = màxima prioritat
    if (normalizedName === normalizedQuery) {
      return 1000 + (item.rating || 0) * 10 + (item.popularity || 0);
    }

    // Comença amb la cerca
    if (normalizedName.startsWith(normalizedQuery)) {
      return 500 + (item.rating || 0) * 10 + (item.popularity || 0);
    }

    // Conté la cerca com a paraula sencera
    const queryWords = normalizedQuery.split(/\s+/);
    const nameWords = normalizedName.split(/\s+/);
    const wordMatch = queryWords.every(qw => nameWords.some(nw => nw.startsWith(qw)));
    if (wordMatch) {
      return 200 + (item.rating || 0) * 10 + (item.popularity || 0);
    }

    // Conté la cerca
    if (normalizedName.includes(normalizedQuery)) {
      return 100 + (item.rating || 0) * 10 + (item.popularity || 0);
    }

    // Per defecte, usar rating i popularitat
    return (item.rating || 0) * 10 + (item.popularity || 0);
  };

  // Ordenar cada grup per rellevància
  const sortedSeries = [...results.series].sort((a, b) =>
    getRelevanceScore(b, query) - getRelevanceScore(a, query)
  );
  const sortedMovies = [...results.movies].sort((a, b) =>
    getRelevanceScore(b, query) - getRelevanceScore(a, query)
  );

  // Determinar quin grup mostrar primer basant-nos en:
  // 1. Si hi ha coincidència exacta en algun grup
  // 2. La puntuació màxima de cada grup
  const topSeriesScore = sortedSeries.length > 0 ? getRelevanceScore(sortedSeries[0], query) : 0;
  const topMovieScore = sortedMovies.length > 0 ? getRelevanceScore(sortedMovies[0], query) : 0;
  const showSeriesFirst = topSeriesScore >= topMovieScore;

  // Filtrar resultats segons el tipus seleccionat
  const filteredResults = {
    series: typeFilter === 'movies' ? [] : sortedSeries,
    movies: typeFilter === 'series' ? [] : sortedMovies
  };

  const getPageTitle = () => {
    switch (typeFilter) {
      case 'movies':
        return 'Resultats de pel·lícules';
      case 'series':
        return 'Resultats de sèries';
      default:
        return 'Resultats de cerca';
    }
  };

  const totalFilteredResults = filteredResults.series.length + filteredResults.movies.length;

  // No loading screen - show skeleton/content immediately for smoother UX
  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title">
          <span className="icon"><SearchIcon /></span>
          {loading && <span className="loading-indicator" style={{ marginLeft: '8px', opacity: 0.5, fontSize: '12px' }}>...</span>}
          <h1>{getPageTitle()}</h1>
          <span className="library-count">({totalFilteredResults})</span>
        </div>

      </div>

      {query && totalFilteredResults === 0 ? (
        <div className="library-grid">
          <div className="empty-state">
            <div className="empty-icon"><SearchIcon /></div>
            <h2>No s'han trobat resultats</h2>
            <p>No hi ha contingut que coincideixi amb "{query}"</p>
          </div>
        </div>
      ) : (
        <>
          {/* Renderitzar seccions en ordre de rellevància */}
          {showSeriesFirst ? (
            <>
              {/* Sèries primer */}
              {filteredResults.series.length > 0 && (
                <div className="search-section">
                  <h2 className="section-title">
                    <TvIcon /> Sèries ({filteredResults.series.length})
                  </h2>
                  <div className="library-grid">
                    {filteredResults.series.map((show) => (
                      <MediaCard
                        key={`series-${show.tmdb_id}`}
                        item={{
                          id: `tmdb-${show.tmdb_id}`,
                          tmdb_id: show.tmdb_id,
                          name: show.name,
                          year: show.year,
                          poster: show.poster,
                          rating: show.rating,
                          is_tmdb: true
                        }}
                        type="series"
                        width="100%"
                        isTmdb={true}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Pel·lícules després */}
              {filteredResults.movies.length > 0 && (
                <div className="search-section">
                  <h2 className="section-title">
                    <MovieIcon /> Pel·lícules ({filteredResults.movies.length})
                  </h2>
                  <div className="library-grid">
                    {filteredResults.movies.map((movie) => (
                      <MediaCard
                        key={`movie-${movie.tmdb_id}`}
                        item={{
                          id: `tmdb-${movie.tmdb_id}`,
                          tmdb_id: movie.tmdb_id,
                          name: movie.name,
                          year: movie.year,
                          poster: movie.poster,
                          rating: movie.rating,
                          is_tmdb: true
                        }}
                        type="movies"
                        width="100%"
                        isTmdb={true}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Pel·lícules primer */}
              {filteredResults.movies.length > 0 && (
                <div className="search-section">
                  <h2 className="section-title">
                    <MovieIcon /> Pel·lícules ({filteredResults.movies.length})
                  </h2>
                  <div className="library-grid">
                    {filteredResults.movies.map((movie) => (
                      <MediaCard
                        key={`movie-${movie.tmdb_id}`}
                        item={{
                          id: `tmdb-${movie.tmdb_id}`,
                          tmdb_id: movie.tmdb_id,
                          name: movie.name,
                          year: movie.year,
                          poster: movie.poster,
                          rating: movie.rating,
                          is_tmdb: true
                        }}
                        type="movies"
                        width="100%"
                        isTmdb={true}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Sèries després */}
              {filteredResults.series.length > 0 && (
                <div className="search-section">
                  <h2 className="section-title">
                    <TvIcon /> Sèries ({filteredResults.series.length})
                  </h2>
                  <div className="library-grid">
                    {filteredResults.series.map((show) => (
                      <MediaCard
                        key={`series-${show.tmdb_id}`}
                        item={{
                          id: `tmdb-${show.tmdb_id}`,
                          tmdb_id: show.tmdb_id,
                          name: show.name,
                          year: show.year,
                          poster: show.poster,
                          rating: show.rating,
                          is_tmdb: true
                        }}
                        type="series"
                        width="100%"
                        isTmdb={true}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Search;
