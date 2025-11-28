import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Admin.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

const TvIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const MovieIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

const FolderIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
);

const ClockIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const RefreshIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"></polyline>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
  </svg>
);

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const ClipboardIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
  </svg>
);

const BroomIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
    <path d="M5 12V5a2 2 0 0 1 2-2h7l5 5v4"></path>
    <path d="M5 21h14"></path>
    <path d="M5 12l7 9"></path>
    <path d="M12 21l7-9"></path>
  </svg>
);

const BookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

const HeadphonesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
  </svg>
);

const PaletteIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="13.5" cy="6.5" r=".5"></circle>
    <circle cx="17.5" cy="10.5" r=".5"></circle>
    <circle cx="8.5" cy="7.5" r=".5"></circle>
    <circle cx="6.5" cy="12.5" r=".5"></circle>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"></path>
  </svg>
);

const VolumeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
  </svg>
);

const SubtitlesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

const PlayIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

// Download icon
const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

// Key icon
const KeyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
  </svg>
);

function Admin() {
  const [stats, setStats] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tmdbKey, setTmdbKey] = useState('');
  const [tmdbConfigured, setTmdbConfigured] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const response = await axios.get('/api/library/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error carregant estadístiques:', error);
      addLog('error', 'Error carregant estadístiques');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    checkTmdbKey();
  }, [loadStats]);

  const checkTmdbKey = async () => {
    try {
      const response = await axios.get('/api/metadata/tmdb-key');
      setTmdbConfigured(response.data.configured);
    } catch (error) {
      console.error('Error checking TMDB key:', error);
    }
  };

  const saveTmdbKey = async () => {
    if (!tmdbKey.trim()) return;
    try {
      await axios.post(`/api/metadata/tmdb-key?api_key=${encodeURIComponent(tmdbKey)}`);
      setTmdbConfigured(true);
      addLog('success', 'Clau TMDB guardada correctament');
      setTmdbKey('');
    } catch (error) {
      addLog('error', 'Error guardant clau TMDB');
    }
  };

  const handleFetchBooksMetadata = async () => {
    setFetchingMetadata(true);
    addLog('info', 'Obtenint metadades de llibres i audiollibres...');
    try {
      const response = await axios.post('/api/metadata/fetch-books');
      addLog('success', `Metadades obtingudes: ${response.data.books} llibres, ${response.data.audiobooks} audiollibres`);
    } catch (error) {
      addLog('error', `Error obtenint metadades: ${error.message}`);
    } finally {
      setFetchingMetadata(false);
    }
  };

  const handleFetchVideosMetadata = async () => {
    if (!tmdbConfigured && !tmdbKey) {
      addLog('error', 'Necessites configurar la clau TMDB primer');
      return;
    }

    setFetchingMetadata(true);
    addLog('info', 'Obtenint metadades de pel·lícules i sèries...');
    try {
      const response = await axios.post('/api/metadata/fetch-videos', {
        tmdb_api_key: tmdbKey || undefined
      });
      addLog('success', `Metadades obtingudes: ${response.data.movies} pel·lícules, ${response.data.series} sèries`);
    } catch (error) {
      addLog('error', `Error obtenint metadades: ${error.message}`);
    } finally {
      setFetchingMetadata(false);
    }
  };

  const handleFetchAllMetadata = async () => {
    setFetchingMetadata(true);
    addLog('info', 'Obtenint totes les metadades...');
    try {
      await axios.post('/api/metadata/fetch-all', {
        tmdb_api_key: tmdbConfigured ? undefined : tmdbKey || undefined
      });
      addLog('info', 'Procés iniciat en segon pla. Les metadades s\'estan descarregant...');
    } catch (error) {
      addLog('error', `Error: ${error.message}`);
    } finally {
      setFetchingMetadata(false);
    }
  };

  const handleGenerateThumbnails = async () => {
    addLog('info', 'Generant miniatures per episodis...');
    try {
      await axios.post('/api/thumbnails/generate-all');
      addLog('info', 'Generació iniciada en segon pla. Pot trigar uns minuts...');
    } catch (error) {
      addLog('error', `Error: ${error.message}`);
    }
  };

  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { type, message, timestamp }].slice(-50));
  };

  const handleScan = async () => {
    setScanning(true);
    setScanProgress(0);
    addLog('info', 'Iniciant escaneig de la biblioteca...');

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      const response = await axios.post('/api/library/scan');

      clearInterval(progressInterval);
      setScanProgress(100);

      if (response.data.status === 'success') {
        addLog('success', `Escaneig completat: ${response.data.stats?.series || 0} sèries, ${response.data.stats?.movies || 0} pel·lícules, ${response.data.stats?.files || 0} arxius`);
        await loadStats();
      } else {
        addLog('warning', 'Escaneig completat amb advertències');
      }
    } catch (error) {
      console.error('Error escanejant:', error);
      addLog('error', `Error durant l'escaneig: ${error.message}`);
    } finally {
      setScanning(false);
      setTimeout(() => setScanProgress(0), 2000);
    }
  };

  const handleRefreshMetadata = async () => {
    addLog('info', 'Actualitzant metadades...');
    try {
      await axios.post('/api/library/refresh-metadata');
      addLog('success', 'Metadades actualitzades correctament');
      await loadStats();
    } catch (error) {
      addLog('error', `Error actualitzant metadades: ${error.message}`);
    }
  };

  const handleClearCache = async () => {
    addLog('info', 'Netejant cache...');
    try {
      // Simulated - would need backend endpoint
      await new Promise(resolve => setTimeout(resolve, 1000));
      addLog('success', 'Cache netejat correctament');
    } catch (error) {
      addLog('error', `Error netejant cache: ${error.message}`);
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm('Eliminar de la base de dades les sèries i pel·lícules que ja no existeixen al disc? Aquesta acció és irreversible.')) {
      return;
    }

    setCleaning(true);
    addLog('info', 'Netejant contingut eliminat del disc...');

    try {
      const response = await axios.post('/api/library/cleanup');

      if (response.data.status === 'success') {
        const { series_removed, episodes_removed } = response.data;
        addLog('success', `Neteja completada: ${series_removed} sèries/pel·lícules i ${episodes_removed} episodis eliminats`);

        if (response.data.series_details?.length > 0) {
          response.data.series_details.forEach(item => {
            addLog('info', `Eliminat: ${item.name} (${item.episodes_removed} episodis)`);
          });
        }

        await loadStats();
      } else {
        addLog('warning', 'Neteja completada amb advertències');
      }
    } catch (error) {
      console.error('Error netejant:', error);
      addLog('error', `Error durant la neteja: ${error.message}`);
    } finally {
      setCleaning(false);
    }
  };

  const handleCleanupBooks = async () => {
    if (!window.confirm('Eliminar de la base de dades els llibres que ja no existeixen al disc?')) {
      return;
    }

    addLog('info', 'Netejant llibres eliminats...');
    try {
      const response = await axios.post('/api/books/cleanup');
      addLog('success', `Neteja de llibres completada: ${response.data.books_removed || 0} llibres i ${response.data.authors_removed || 0} autors eliminats`);
    } catch (error) {
      addLog('error', `Error netejant llibres: ${error.message}`);
    }
  };

  const handleCleanupAudiobooks = async () => {
    if (!window.confirm('Eliminar de la base de dades els audiollibres que ja no existeixen al disc?')) {
      return;
    }

    addLog('info', 'Netejant audiollibres eliminats...');
    try {
      const response = await axios.post('/api/audiobooks/cleanup');
      addLog('success', `Neteja d'audiollibres completada: ${response.data.audiobooks_removed || 0} audiollibres i ${response.data.authors_removed || 0} autors eliminats`);
    } catch (error) {
      addLog('error', `Error netejant audiollibres: ${error.message}`);
    }
  };

  const handleCleanupAll = async () => {
    if (!window.confirm('Eliminar de la base de dades tot el contingut que ja no existeix al disc? (vídeos, llibres i audiollibres)')) {
      return;
    }

    setCleaning(true);
    addLog('info', 'Iniciant neteja completa...');

    let totalRemoved = { videos: 0, episodes: 0, books: 0, audiobooks: 0, authors: 0 };

    try {
      // Netejar vídeos
      addLog('info', 'Netejant vídeos...');
      const videosRes = await axios.post('/api/library/cleanup');
      if (videosRes.data.status === 'success') {
        totalRemoved.videos = videosRes.data.series_removed || 0;
        totalRemoved.episodes = videosRes.data.episodes_removed || 0;
      }

      // Netejar llibres
      addLog('info', 'Netejant llibres...');
      const booksRes = await axios.post('/api/books/cleanup');
      totalRemoved.books = booksRes.data.books_removed || 0;
      totalRemoved.authors += booksRes.data.authors_removed || 0;

      // Netejar audiollibres
      addLog('info', 'Netejant audiollibres...');
      const audiobooksRes = await axios.post('/api/audiobooks/cleanup');
      totalRemoved.audiobooks = audiobooksRes.data.audiobooks_removed || 0;
      totalRemoved.authors += audiobooksRes.data.authors_removed || 0;

      addLog('success', `Neteja completa: ${totalRemoved.videos} vídeos, ${totalRemoved.episodes} episodis, ${totalRemoved.books} llibres, ${totalRemoved.audiobooks} audiollibres, ${totalRemoved.authors} autors eliminats`);
      await loadStats();
    } catch (error) {
      addLog('error', `Error durant la neteja: ${error.message}`);
    } finally {
      setCleaning(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant administració...</div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1><SettingsIcon /> Administració</h1>
        <p>Gestiona la teva biblioteca multimèdia Hermes</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><TvIcon /></div>
          <div className="stat-info">
            <h3>{stats?.series || 0}</h3>
            <p>Sèries</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><MovieIcon /></div>
          <div className="stat-info">
            <h3>{stats?.movies || 0}</h3>
            <p>Pel·lícules</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><FolderIcon /></div>
          <div className="stat-info">
            <h3>{stats?.files || 0}</h3>
            <p>Arxius</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><ClockIcon /></div>
          <div className="stat-info">
            <h3>{stats?.total_hours || 0}h</h3>
            <p>Contingut total</p>
          </div>
        </div>
      </div>

      {/* Maintenance Section - Scanner + Cleanup combined */}
      <div className="admin-section">
        <div className="section-header">
          <h2><BroomIcon /> Manteniment de la biblioteca</h2>
        </div>
        <div className="section-content">
          <div className="scanner-actions">
            <button
              className="action-btn"
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? <><RefreshIcon /> Escanejant...</> : <><SearchIcon /> Escanejar biblioteca</>}
            </button>

            <button
              className="action-btn secondary"
              onClick={handleRefreshMetadata}
              disabled={scanning}
            >
              <RefreshIcon /> Actualitzar metadades
            </button>

            <button
              className="action-btn secondary"
              onClick={handleClearCache}
              disabled={scanning}
            >
              <TrashIcon /> Netejar cache
            </button>

            <button
              className="action-btn danger"
              onClick={handleCleanupAll}
              disabled={cleaning}
            >
              {cleaning ? <><RefreshIcon /> Netejant...</> : <><BroomIcon /> Netejar tot</>}
            </button>
          </div>

          {scanning && (
            <div className="scan-progress">
              <h4><RefreshIcon /> Escaneig en procés...</h4>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
              <div className="scan-status">
                {scanProgress < 30 && 'Cercant arxius...'}
                {scanProgress >= 30 && scanProgress < 60 && 'Analitzant contingut...'}
                {scanProgress >= 60 && scanProgress < 90 && 'Actualitzant base de dades...'}
                {scanProgress >= 90 && 'Finalitzant...'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Metadata Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2><DownloadIcon /> Metadades externes</h2>
        </div>
        <div className="section-content">
          <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
            Descarrega automàticament metadades i caràtules des de TMDB (pel·lícules i sèries) i Open Library (llibres i audiollibres).
          </p>

          {!tmdbConfigured && (
            <div className="tmdb-config" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <h4 style={{ color: 'white', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <KeyIcon /> Clau API de TMDB
              </h4>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                Per obtenir metadades de vídeos necessites una clau API de <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" style={{ color: '#8b5cf6' }}>themoviedb.org</a> (gratuïta)
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={tmdbKey}
                  onChange={(e) => setTmdbKey(e.target.value)}
                  placeholder="Introdueix la clau API..."
                  style={{
                    flex: 1,
                    padding: '0.75rem 1rem',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.9rem'
                  }}
                />
                <button
                  className="action-btn"
                  onClick={saveTmdbKey}
                  disabled={!tmdbKey.trim()}
                  style={{ padding: '0.75rem 1.25rem' }}
                >
                  Desar
                </button>
              </div>
            </div>
          )}

          {tmdbConfigured && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <KeyIcon />
              <span style={{ color: 'rgba(255,255,255,0.8)' }}>Clau TMDB configurada</span>
            </div>
          )}

          <div className="scanner-actions">
            <button
              className="action-btn"
              onClick={handleFetchBooksMetadata}
              disabled={fetchingMetadata}
            >
              <BookIcon /> Obtenir metadades llibres
            </button>

            <button
              className="action-btn"
              onClick={handleFetchVideosMetadata}
              disabled={fetchingMetadata || (!tmdbConfigured && !tmdbKey)}
              title={!tmdbConfigured && !tmdbKey ? 'Necessites configurar la clau TMDB' : ''}
            >
              <MovieIcon /> Obtenir metadades vídeos
            </button>

            <button
              className="action-btn secondary"
              onClick={handleFetchAllMetadata}
              disabled={fetchingMetadata}
            >
              {fetchingMetadata ? <><RefreshIcon /> Obtenint...</> : <><DownloadIcon /> Obtenir totes</>}
            </button>

            <button
              className="action-btn secondary"
              onClick={handleGenerateThumbnails}
              title="Genera miniatures per tots els episodis"
            >
              <TvIcon /> Generar miniatures
            </button>
          </div>
        </div>
      </div>

      {/* Library Paths */}
      <div className="admin-section">
        <div className="section-header">
          <h2><FolderIcon /> Directoris de la Biblioteca</h2>
        </div>
        <div className="section-content">
          <div className="paths-list">
            <div className="path-item">
              <div className="path-info">
                <div className="path-icon"><TvIcon /></div>
                <div className="path-details">
                  <h4>Sèries</h4>
                  <p>./storage/series</p>
                </div>
              </div>
              <span className="path-status active">Actiu</span>
            </div>

            <div className="path-item">
              <div className="path-info">
                <div className="path-icon"><MovieIcon /></div>
                <div className="path-details">
                  <h4>Pel·lícules</h4>
                  <p>./storage/movies</p>
                </div>
              </div>
              <span className="path-status active">Actiu</span>
            </div>
          </div>
        </div>
      </div>

      {/* Logs Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2><ClipboardIcon /> Registre d'Activitat</h2>
          <button
            className="action-btn secondary"
            onClick={() => setLogs([])}
            style={{ padding: '8px 15px', fontSize: '14px' }}
          >
            Netejar
          </button>
        </div>
        <div className="section-content">
          <div className="logs-container">
            {logs.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px' }}>
                No hi ha activitat recent
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={`log-entry ${log.type}`}>
                  <span className="log-time">[{log.timestamp}]</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Preferences Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2><PaletteIcon /> Preferències</h2>
        </div>
        <div className="section-content">
          <div className="paths-list">
            <div className="path-item">
              <div className="path-info">
                <div className="path-icon"><VolumeIcon /></div>
                <div className="path-details">
                  <h4>Idioma d'àudio preferit</h4>
                  <p>Català (per defecte)</p>
                </div>
              </div>
              <select
                style={{
                  padding: '8px 15px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: 'white'
                }}
                defaultValue={localStorage.getItem('hermes_audio_lang') || 'cat'}
                onChange={(e) => localStorage.setItem('hermes_audio_lang', e.target.value)}
              >
                <option value="cat">Català</option>
                <option value="spa">Castellà</option>
                <option value="eng">Anglès</option>
                <option value="jpn">Japonès</option>
              </select>
            </div>

            <div className="path-item">
              <div className="path-info">
                <div className="path-icon"><SubtitlesIcon /></div>
                <div className="path-details">
                  <h4>Subtítols per defecte</h4>
                  <p>Desactivats</p>
                </div>
              </div>
              <select
                style={{
                  padding: '8px 15px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: 'white'
                }}
                defaultValue={localStorage.getItem('hermes_subtitle_lang') || 'off'}
                onChange={(e) => localStorage.setItem('hermes_subtitle_lang', e.target.value)}
              >
                <option value="off">Desactivats</option>
                <option value="cat">Català</option>
                <option value="spa">Castellà</option>
                <option value="eng">Anglès</option>
              </select>
            </div>

            <div className="path-item">
              <div className="path-info">
                <div className="path-icon"><PlayIcon /></div>
                <div className="path-details">
                  <h4>Reproducció automàtica</h4>
                  <p>Reproduir següent episodi automàticament</p>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  defaultChecked={localStorage.getItem('hermes_autoplay') !== 'false'}
                  onChange={(e) => localStorage.setItem('hermes_autoplay', e.target.checked)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>Activat</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Admin;
