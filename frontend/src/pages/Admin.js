import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';
import {
  SettingsIcon,
  TvIcon,
  MovieIcon,
  ClockIcon,
  RefreshIcon,
  ClipboardIcon,
  KeyIcon,
  CheckIcon,
  UsersIcon,
  CopyIcon,
  TrashIcon,
  MailIcon,
  DatabaseIcon,
  SyncIcon,
  ServerIcon,
  CalendarIcon,
  ActivityIcon
} from '../components/icons';
import './Admin.css';

axios.defaults.baseURL = API_URL;

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

      {/* Maintenance Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2><DatabaseIcon /> Manteniment</h2>
        </div>
        <div className="section-content">
          <div className="maintenance-item">
            <div className="maintenance-info">
              <h4>Corregir títols no llatins</h4>
              <p>Actualitza els títols en japonès, coreà, xinès, rus, etc. amb els seus equivalents en anglès de TMDB.</p>
            </div>
            <button
              className="action-btn"
              onClick={async () => {
                try {
                  showMessage('Actualitzant títols... Això pot trigar uns segons.', 'info');
                  addLog('info', 'Iniciant correcció de títols no llatins...');
                  const response = await axios.post('/api/admin/fix-non-latin-titles');
                  const data = response.data;
                  showMessage(`Actualitzats ${data.updated} títols de ${data.total_found} trobats`, 'success');
                  addLog('success', `Títols actualitzats: ${data.updated}/${data.total_found}`);
                  if (data.updated_items?.length > 0) {
                    data.updated_items.slice(0, 5).forEach(item => {
                      addLog('info', `${item.old_title} → ${item.new_title}`);
                    });
                  }
                } catch (error) {
                  showMessage('Error actualitzant títols', 'error');
                  addLog('error', error.response?.data?.detail || 'Error desconegut');
                }
              }}
            >
              <RefreshIcon /> Corregir títols
            </button>
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
