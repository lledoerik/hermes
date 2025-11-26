import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL, API_ENDPOINTS } from '../config';
import MediaCard from '../components/MediaCard';
import './Home.css';

function Home() {
  const [stats, setStats] = useState(null);
  const [recentSeries, setRecentSeries] = useState([]);
  const [recentMovies, setRecentMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, seriesRes, moviesRes] = await Promise.all([
        axios.get(`${API_URL}${API_ENDPOINTS.stats}`),
        axios.get(`${API_URL}${API_ENDPOINTS.series}`),
        axios.get(`${API_URL}${API_ENDPOINTS.movies}`),
      ]);

      setStats(statsRes.data);
      setRecentSeries(seriesRes.data.slice(0, 8));
      setRecentMovies(moviesRes.data.slice(0, 8));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await axios.post(`${API_URL}${API_ENDPOINTS.scan}`);
      await loadData();
    } catch (error) {
      console.error('Error scanning:', error);
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p className="loading-text">Carregant Hermes...</p>
      </div>
    );
  }

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Benvingut a Hermes</h1>
          <p className="hero-subtitle">El teu servidor multimèdia personal</p>

          {stats && (
            <div className="stats-container">
              <div className="stat-item">
                <span className="stat-value">{stats.series}</span>
                <span className="stat-label">Series</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.movies}</span>
                <span className="stat-label">Pel-licules</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.files}</span>
                <span className="stat-label">Arxius</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.total_hours}h</span>
                <span className="stat-label">Contingut</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.total_gb} GB</span>
                <span className="stat-label">Emmagatzematge</span>
              </div>
            </div>
          )}

          <button
            className="btn btn-primary scan-button"
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <div className="spinner small"></div>
                Escanejant...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Escanejar Biblioteca
              </>
            )}
          </button>
        </div>
      </section>

      {/* Categories */}
      <section className="categories-section container">
        <h2 className="section-title">Categories</h2>
        <div className="categories-grid">
          <Link to="/series" className="category-card series">
            <div className="category-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <rect x="2" y="4" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </div>
            <h3>Series</h3>
            <p>{stats?.series || 0} disponibles</p>
          </Link>

          <Link to="/movies" className="category-card movies">
            <div className="category-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.82 2H4.18A2.18 2.18 0 002 4.18v15.64A2.18 2.18 0 004.18 22h15.64A2.18 2.18 0 0022 19.82V4.18A2.18 2.18 0 0019.82 2zM10 16.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
            <h3>Pel-licules</h3>
            <p>{stats?.movies || 0} disponibles</p>
          </Link>

          <div className="category-card books coming-soon">
            <div className="category-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
            </div>
            <h3>Llibres</h3>
            <span className="badge">Properament</span>
          </div>

          <div className="category-card tv coming-soon">
            <div className="category-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <rect x="2" y="7" width="20" height="15" rx="2" />
                <polyline points="17 2 12 7 7 2" />
              </svg>
            </div>
            <h3>TV en directe</h3>
            <span className="badge">Properament</span>
          </div>
        </div>
      </section>

      {/* Recent Series */}
      {recentSeries.length > 0 && (
        <section className="content-section container">
          <div className="section-header">
            <h2 className="section-title">Series</h2>
            <Link to="/series" className="btn btn-secondary">Veure totes</Link>
          </div>
          <div className="media-grid">
            {recentSeries.map((item) => (
              <MediaCard key={item.id} item={item} type="series" />
            ))}
          </div>
        </section>
      )}

      {/* Recent Movies */}
      {recentMovies.length > 0 && (
        <section className="content-section container">
          <div className="section-header">
            <h2 className="section-title">Pel-licules</h2>
            <Link to="/movies" className="btn btn-secondary">Veure totes</Link>
          </div>
          <div className="media-grid">
            {recentMovies.map((item) => (
              <MediaCard key={item.id} item={item} type="movie" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default Home;
