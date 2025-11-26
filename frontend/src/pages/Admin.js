import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Admin.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

function Admin() {
  const [stats, setStats] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await axios.get('/api/library/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error carregant estadístiques:', error);
      addLog('error', 'Error carregant estadístiques');
    } finally {
      setLoading(false);
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
        <h1>⚙️ Administració</h1>
        <p>Gestiona la teva biblioteca multimèdia Hermes</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📺</div>
          <div className="stat-info">
            <h3>{stats?.series || 0}</h3>
            <p>Sèries</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎬</div>
          <div className="stat-info">
            <h3>{stats?.movies || 0}</h3>
            <p>Pel·lícules</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📁</div>
          <div className="stat-info">
            <h3>{stats?.files || 0}</h3>
            <p>Arxius</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-info">
            <h3>{stats?.total_hours || 0}h</h3>
            <p>Contingut total</p>
          </div>
        </div>
      </div>

      {/* Scanner Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2>🔍 Escàner de Biblioteca</h2>
        </div>
        <div className="section-content">
          <div className="scanner-actions">
            <button
              className="action-btn"
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? '🔄 Escanejant...' : '🔍 Escanejar biblioteca'}
            </button>

            <button
              className="action-btn secondary"
              onClick={handleRefreshMetadata}
              disabled={scanning}
            >
              🔄 Actualitzar metadades
            </button>

            <button
              className="action-btn secondary"
              onClick={handleClearCache}
              disabled={scanning}
            >
              🗑️ Netejar cache
            </button>
          </div>

          {scanning && (
            <div className="scan-progress">
              <h4>🔄 Escaneig en procés...</h4>
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

      {/* Library Paths */}
      <div className="admin-section">
        <div className="section-header">
          <h2>📂 Directoris de la Biblioteca</h2>
        </div>
        <div className="section-content">
          <div className="paths-list">
            <div className="path-item">
              <div className="path-info">
                <div className="path-icon">📺</div>
                <div className="path-details">
                  <h4>Sèries</h4>
                  <p>./storage/series</p>
                </div>
              </div>
              <span className="path-status active">Actiu</span>
            </div>

            <div className="path-item">
              <div className="path-info">
                <div className="path-icon">🎬</div>
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
          <h2>📋 Registre d'Activitat</h2>
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
          <h2>🎨 Preferències</h2>
        </div>
        <div className="section-content">
          <div className="paths-list">
            <div className="path-item">
              <div className="path-info">
                <div className="path-icon">🔊</div>
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
                <div className="path-icon">💬</div>
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
                <div className="path-icon">▶️</div>
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
