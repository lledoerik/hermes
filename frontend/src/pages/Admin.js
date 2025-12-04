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

const ClockIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const RefreshIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"></polyline>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
  </svg>
);

const ClipboardIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
  </svg>
);

const KeyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const UsersIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const MailIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const DatabaseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
  </svg>
);

const SyncIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
  </svg>
);

const ServerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
    <line x1="6" y1="6" x2="6.01" y2="6"></line>
    <line x1="6" y1="18" x2="6.01" y2="18"></line>
  </svg>
);

const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const ActivityIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);

function Admin() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tmdbKey, setTmdbKey] = useState('');
  const [tmdbConfigured, setTmdbConfigured] = useState(false);

  // Real-Debrid state
  const [rdKey, setRdKey] = useState('');
  const [rdStatus, setRdStatus] = useState(null); // null = loading, { configured, valid, message }

  // Sync state
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncRunning, setSyncRunning] = useState(false);

  // User management state
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [newInviteUses, setNewInviteUses] = useState(1);
  const [newInviteDays, setNewInviteDays] = useState(7);
  const [copiedCode, setCopiedCode] = useState(null);
  const [message, setMessage] = useState(null);

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

  const loadSyncStatus = useCallback(async () => {
    try {
      const response = await axios.get('/api/sync/status');
      setSyncStatus(response.data);
    } catch (error) {
      console.error('Error carregant estat sync:', error);
    }
  }, []);

  useEffect(() => {
    loadStats();
    checkTmdbKey();
    checkRdStatus();
    loadUserData();
    loadSyncStatus();

    // Refresh sync status every 30 seconds
    const interval = setInterval(loadSyncStatus, 30000);
    return () => clearInterval(interval);
  }, [loadStats, loadSyncStatus]);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadUserData = async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        axios.get('/api/admin/users'),
        axios.get('/api/invitations')
      ]);
      setUsers(usersRes.data.users || []);
      setInvitations(invitesRes.data.invitations || []);
    } catch (e) {
      console.error('Error loading user data:', e);
    }
  };

  const createInvitation = async () => {
    try {
      await axios.post('/api/invitations', {
        max_uses: newInviteUses,
        expires_days: newInviteDays
      });
      showMessage('Invitació creada');
      addLog('success', 'Nova invitació creada');
      loadUserData();
    } catch (e) {
      showMessage(e.response?.data?.detail || 'Error creant invitació', 'error');
    }
  };

  const deleteInvitation = async (id) => {
    try {
      await axios.delete(`/api/invitations/${id}`);
      showMessage('Invitació eliminada');
      loadUserData();
    } catch (e) {
      showMessage('Error eliminant invitació', 'error');
    }
  };

  const copyInviteCode = (code) => {
    const inviteUrl = `${window.location.origin}/login?invite=${code}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const toggleUserActive = async (userId, active) => {
    try {
      await axios.put(`/api/admin/users/${userId}/toggle-active?active=${active}`);
      showMessage(`Usuari ${active ? 'activat' : 'desactivat'}`);
      loadUserData();
    } catch (e) {
      showMessage(e.response?.data?.detail || 'Error', 'error');
    }
  };

  const toggleUserPremium = async (userId, isPremium) => {
    try {
      await axios.put(`/api/admin/users/${userId}/toggle-premium?is_premium=${isPremium}`);
      showMessage(`Usuari ${isPremium ? 'ara és' : 'ja no és'} premium`);
      loadUserData();
    } catch (e) {
      showMessage(e.response?.data?.detail || 'Error', 'error');
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm('Segur que vols eliminar aquest usuari?')) return;
    try {
      await axios.delete(`/api/admin/users/${userId}`);
      showMessage('Usuari eliminat');
      loadUserData();
    } catch (e) {
      showMessage(e.response?.data?.detail || 'Error', 'error');
    }
  };

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

  // Real-Debrid functions
  const checkRdStatus = async () => {
    try {
      const response = await axios.get('/api/debrid/status');
      setRdStatus(response.data);
    } catch (error) {
      console.error('Error checking RD status:', error);
      setRdStatus({ configured: false, valid: false });
    }
  };

  const saveRdKey = async () => {
    if (!rdKey.trim()) return;
    try {
      await axios.post(`/api/debrid/configure?api_key=${encodeURIComponent(rdKey)}`);
      showMessage('Clau Real-Debrid guardada correctament');
      addLog('success', 'Real-Debrid configurat correctament');
      setRdKey('');
      checkRdStatus(); // Refresh status
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error guardant clau Real-Debrid';
      showMessage(errorMsg, 'error');
      addLog('error', errorMsg);
    }
  };

  // Manual sync trigger
  const runSyncNow = async () => {
    try {
      setSyncRunning(true);
      await axios.post('/api/sync/run');
      addLog('info', 'Sincronització iniciada en segon pla');
      showMessage('Sincronització iniciada');

      // Poll for completion
      const pollSync = setInterval(async () => {
        await loadSyncStatus();
        const res = await axios.get('/api/sync/status');
        if (res.data.last_sync !== syncStatus?.last_sync) {
          clearInterval(pollSync);
          setSyncRunning(false);
          addLog('success', 'Sincronització completada');
          loadStats();
        }
      }, 5000);

      // Timeout after 10 minutes
      setTimeout(() => {
        clearInterval(pollSync);
        setSyncRunning(false);
      }, 600000);
    } catch (error) {
      setSyncRunning(false);
      addLog('error', 'Error iniciant sincronització');
      showMessage('Error iniciant sincronització', 'error');
    }
  };

  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { type, message, timestamp }].slice(-50));
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Mai';
    const date = new Date(isoString);
    return date.toLocaleString('ca-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        <p>Gestiona la teva biblioteca de streaming Hermes</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><MovieIcon /></div>
          <div className="stat-info">
            <h3>{stats?.movies || 0}</h3>
            <p>Pel·lícules</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><TvIcon /></div>
          <div className="stat-info">
            <h3>{stats?.series || 0}</h3>
            <p>Sèries</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><DatabaseIcon /></div>
          <div className="stat-info">
            <h3>{stats?.files || 0}</h3>
            <p>Fitxers</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><ClockIcon /></div>
          <div className="stat-info">
            <h3>{stats?.total_hours || 0}h</h3>
            <p>Contingut</p>
          </div>
        </div>
      </div>

      {/* Sync Section - NEW */}
      <div className="admin-section sync-section">
        <div className="section-header">
          <h2><SyncIcon /> Sincronització Automàtica</h2>
          <div className={`sync-badge ${syncStatus?.scheduler_running ? 'active' : 'inactive'}`}>
            {syncStatus?.scheduler_running ? 'Actiu' : 'Inactiu'}
          </div>
        </div>
        <div className="section-content">
          <div className="sync-info-grid">
            <div className="sync-info-item">
              <div className="sync-info-icon"><CalendarIcon /></div>
              <div className="sync-info-content">
                <span className="sync-info-label">Hora programada</span>
                <span className="sync-info-value">{syncStatus?.sync_time || '02:30'}</span>
              </div>
            </div>

            <div className="sync-info-item">
              <div className="sync-info-icon"><ClockIcon /></div>
              <div className="sync-info-content">
                <span className="sync-info-label">Última sincronització</span>
                <span className="sync-info-value">{formatDate(syncStatus?.last_sync)}</span>
              </div>
            </div>

            <div className="sync-info-item">
              <div className="sync-info-icon"><ActivityIcon /></div>
              <div className="sync-info-content">
                <span className="sync-info-label">Pròxima execució</span>
                <span className="sync-info-value">{formatDate(syncStatus?.next_sync)}</span>
              </div>
            </div>
          </div>

          <div className="sync-description">
            <p>
              La sincronització automàtica s'executa diàriament a les <strong>2:30 AM</strong> i importa contingut destacat.
            </p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', opacity: 0.8 }}>
              💡 <strong>Nota:</strong> Pots cercar i veure qualsevol contingut de TMDB en temps real des de la cerca, sense necessitat de sincronitzar.
            </p>
          </div>

          <button
            className="action-btn sync-btn"
            onClick={runSyncNow}
            disabled={syncRunning}
          >
            {syncRunning ? (
              <><RefreshIcon /> Sincronitzant...</>
            ) : (
              <><SyncIcon /> Sincronitzar ara</>
            )}
          </button>
        </div>
      </div>

      {/* TMDB Key Configuration */}
      <div className="admin-section">
        <div className="section-header">
          <h2><KeyIcon /> Configuració TMDB</h2>
        </div>
        <div className="section-content">
          {!tmdbConfigured ? (
            <div className="tmdb-config">
              <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
                Per importar pel·lícules i sèries necessites una clau API de <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" style={{ color: '#328492' }}>themoviedb.org</a> (gratuïta)
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={tmdbKey}
                  onChange={(e) => setTmdbKey(e.target.value)}
                  placeholder="Introdueix la clau API..."
                  className="admin-input"
                />
                <button
                  className="action-btn"
                  onClick={saveTmdbKey}
                  disabled={!tmdbKey.trim()}
                >
                  Desar
                </button>
              </div>
            </div>
          ) : (
            <div className="tmdb-configured">
              <CheckIcon />
              <span>Clau TMDB configurada correctament</span>
            </div>
          )}
        </div>
      </div>

      {/* Real-Debrid Configuration */}
      <div className="admin-section">
        <div className="section-header">
          <h2><KeyIcon /> Real-Debrid (Streaming HD)</h2>
        </div>
        <div className="section-content">
          {rdStatus === null ? (
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Comprovant...</div>
          ) : !rdStatus.configured || !rdStatus.valid ? (
            <div className="tmdb-config">
              <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
                Per reproduir contingut en HD directament, necessites un compte de <a href="https://real-debrid.com/?id=10857509" target="_blank" rel="noopener noreferrer" style={{ color: '#328492' }}>Real-Debrid</a> i la seva <a href="https://real-debrid.com/apitoken" target="_blank" rel="noopener noreferrer" style={{ color: '#328492' }}>clau API</a>
              </p>
              {rdStatus.configured && !rdStatus.valid && (
                <p style={{ color: '#e50914', marginBottom: '1rem' }}>
                  La clau actual no és vàlida. Si us plau, introdueix una nova clau.
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="password"
                  value={rdKey}
                  onChange={(e) => setRdKey(e.target.value)}
                  placeholder="Introdueix la clau API de Real-Debrid..."
                  className="admin-input"
                />
                <button
                  className="action-btn"
                  onClick={saveRdKey}
                  disabled={!rdKey.trim()}
                >
                  Desar
                </button>
              </div>
            </div>
          ) : (
            <div className="tmdb-configured">
              <CheckIcon />
              <span>Real-Debrid configurat correctament</span>
              <button
                className="action-btn secondary"
                onClick={() => setRdStatus({ ...rdStatus, configured: false })}
                style={{ marginLeft: '1rem', padding: '6px 12px', fontSize: '13px' }}
              >
                Canviar clau
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Users Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2><UsersIcon /> Usuaris ({users.length})</h2>
        </div>
        <div className="section-content">
          <div className="users-list">
            {users.map(u => (
              <div key={u.id} className={`user-item ${!u.is_active ? 'inactive' : ''}`}>
                <div className="user-info">
                  <div className="user-avatar">
                    {u.display_name?.charAt(0).toUpperCase() || u.username?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4>{u.display_name || u.username}</h4>
                    <p>
                      @{u.username}
                      {u.is_admin && <span className="admin-badge">Admin</span>}
                      {u.is_premium && <span className="premium-badge">Premium</span>}
                    </p>
                  </div>
                </div>
                {!u.is_admin && (
                  <div className="user-actions">
                    <button
                      className={`user-action-btn ${u.is_active ? 'warning' : 'success'}`}
                      onClick={() => toggleUserActive(u.id, !u.is_active)}
                    >
                      {u.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      className={`user-action-btn ${u.is_premium ? 'warning' : 'premium'}`}
                      onClick={() => toggleUserPremium(u.id, !u.is_premium)}
                    >
                      {u.is_premium ? 'Treure premium' : 'Fer premium'}
                    </button>
                    <button
                      className="user-action-btn danger"
                      onClick={() => deleteUser(u.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invitations Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2><MailIcon /> Invitacions</h2>
        </div>
        <div className="section-content">
          <div className="invite-create">
            <div className="invite-inputs">
              <div className="invite-field">
                <label>Usos màxims</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newInviteUses}
                  onChange={(e) => setNewInviteUses(parseInt(e.target.value))}
                />
              </div>
              <div className="invite-field">
                <label>Dies de validesa</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={newInviteDays}
                  onChange={(e) => setNewInviteDays(parseInt(e.target.value))}
                />
              </div>
              <button className="action-btn" onClick={createInvitation}>
                Crear invitació
              </button>
            </div>
          </div>

          {invitations.length > 0 && (
            <div className="invite-list">
              {invitations.map(inv => (
                <div key={inv.id} className="invite-item">
                  <div className="invite-code">
                    <code>{inv.code}</code>
                    <button
                      className="copy-btn"
                      onClick={() => copyInviteCode(inv.code)}
                      title="Copiar enllaç d'invitació"
                    >
                      {copiedCode === inv.code ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                  <div className="invite-meta">
                    <span>{inv.uses}/{inv.max_uses} usos</span>
                    <span>Caduca: {new Date(inv.expires_at).toLocaleDateString('ca')}</span>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={() => deleteInvitation(inv.id)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          {invitations.length === 0 && (
            <div className="empty-state">
              No hi ha invitacions actives
            </div>
          )}
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
              <div className="empty-state">
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

      {/* System Info */}
      <div className="admin-section">
        <div className="section-header">
          <h2><ServerIcon /> Informació del Sistema</h2>
        </div>
        <div className="section-content">
          <div className="system-info-grid">
            <div className="system-info-item">
              <span className="system-label">Versió</span>
              <span className="system-value">Hermes 1.0.0</span>
            </div>
            <div className="system-info-item">
              <span className="system-label">API TMDB</span>
              <span className={`system-value ${tmdbConfigured ? 'status-ok' : 'status-error'}`}>
                {tmdbConfigured ? 'Configurada' : 'No configurada'}
              </span>
            </div>
            <div className="system-info-item">
              <span className="system-label">Real-Debrid</span>
              <span className={`system-value ${rdStatus?.configured && rdStatus?.valid ? 'status-ok' : 'status-error'}`}>
                {rdStatus?.configured && rdStatus?.valid ? 'Actiu' : 'No configurat'}
              </span>
            </div>
            <div className="system-info-item">
              <span className="system-label">Scheduler</span>
              <span className={`system-value ${syncStatus?.scheduler_running ? 'status-ok' : 'status-error'}`}>
                {syncStatus?.scheduler_running ? 'Actiu' : 'Inactiu'}
              </span>
            </div>
            <div className="system-info-item">
              <span className="system-label">Usuaris</span>
              <span className="system-value">{users.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Message */}
      {message && (
        <div className={`admin-toast ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

export default Admin;
