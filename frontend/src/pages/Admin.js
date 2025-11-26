import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL, API_ENDPOINTS } from '../config';
import './Admin.css';

function Admin() {
  const [stats, setStats] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await axios.get(`${API_URL}${API_ENDPOINTS.stats}`);
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const response = await axios.post(`${API_URL}${API_ENDPOINTS.scan}`);
      setScanResult({ success: true, stats: response.data.stats });
      await loadStats();
    } catch (error) {
      console.error('Error scanning:', error);
      setScanResult({ success: false, error: error.message });
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="loader"></div>
        <p>Carregant...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-container">
        <h1 className="admin-title">Administracio</h1>
        <p className="admin-subtitle">Gestiona el teu servidor Hermes</p>

        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon series">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <rect x="2" y="4" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats?.series || 0}</span>
              <span className="stat-label">Series</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon movies">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.82 2H4.18A2.18 2.18 0 002 4.18v15.64A2.18 2.18 0 004.18 22h15.64A2.18 2.18 0 0022 19.82V4.18A2.18 2.18 0 0019.82 2zM10 16.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats?.movies || 0}</span>
              <span className="stat-label">Pel·licules</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon files">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats?.files || 0}</span>
              <span className="stat-label">Arxius</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon hours">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats?.total_hours || 0}h</span>
              <span className="stat-label">Contingut</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon storage">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="4" width="18" height="5" rx="1" />
                <rect x="3" y="10" width="18" height="5" rx="1" />
                <rect x="3" y="16" width="18" height="5" rx="1" />
                <circle cx="17" cy="6.5" r="1" fill="white" />
                <circle cx="17" cy="12.5" r="1" fill="white" />
                <circle cx="17" cy="18.5" r="1" fill="white" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats?.total_gb || 0} GB</span>
              <span className="stat-label">Emmagatzematge</span>
            </div>
          </div>
        </div>

        {/* Scan Section */}
        <div className="admin-section">
          <h2 className="section-title">Escanejar Biblioteca</h2>
          <p className="section-desc">
            Escaneja els directoris configurats per trobar contingut nou.
            Aquest proces pot trigar uns minuts depenent de la quantitat d'arxius.
          </p>

          <button
            className={`scan-btn ${scanning ? 'scanning' : ''}`}
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <div className="btn-loader"></div>
                Escanejant...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Escanejar ara
              </>
            )}
          </button>

          {scanResult && (
            <div className={`scan-result ${scanResult.success ? 'success' : 'error'}`}>
              {scanResult.success ? (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>
                    Escaneig completat! Trobades {scanResult.stats?.series || 0} series i {scanResult.stats?.movies || 0} pel·licules.
                  </span>
                </>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span>Error durant l'escaneig: {scanResult.error}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="admin-section">
          <h2 className="section-title">Informacio del Sistema</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Versio</span>
              <span className="info-value">Hermes 1.0.0</span>
            </div>
            <div className="info-item">
              <span className="info-label">API</span>
              <span className="info-value">{API_URL}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Admin;
