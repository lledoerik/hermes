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
  ActivityIcon,
  DownloadIcon
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

  // BBC iPlayer state
  const [bbcStatus, setBbcStatus] = useState(null);
  const [bbcCookies, setBbcCookies] = useState('');
  const [bbcLoading, setBbcLoading] = useState(false);
  const [bbcSyncProgress, setBbcSyncProgress] = useState({
    running: false,
    phase: '',
    current: 0,
    total: 0,
    currentItem: '',
    found: [],
    notFound: [],
    errors: [],
    result: null
  });

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

  // Progress modal state
  const [progressModal, setProgressModal] = useState({
    show: false,
    title: '',
    current: 0,
    total: 0,
    currentItem: '',
    updates: [],
    done: false,
    result: null
  });

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
    checkBbcStatus();
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

  // Funció per executar tasques amb progrés en temps real (SSE)
  const runWithProgress = (title, endpoint) => {
    setProgressModal({
      show: true,
      title,
      current: 0,
      total: 0,
      currentItem: 'Inicialitzant...',
      updates: [],
      done: false,
      result: null
    });

    const token = localStorage.getItem('hermes_token') || '';
    const eventSource = new EventSource(`${API_URL}${endpoint}?token=${token}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'start':
          setProgressModal(prev => ({
            ...prev,
            total: data.total,
            currentItem: `Trobats ${data.total} elements per processar`
          }));
          break;

        case 'progress':
          setProgressModal(prev => ({
            ...prev,
            current: data.current,
            total: data.total,
            currentItem: data.title
          }));
          break;

        case 'updated':
          setProgressModal(prev => ({
            ...prev,
            updates: [...prev.updates.slice(-19), {
              type: 'success',
              text: `${data.old_title} → ${data.new_title}`
            }]
          }));
          break;

        case 'item_error':
          setProgressModal(prev => ({
            ...prev,
            updates: [...prev.updates.slice(-19), {
              type: 'error',
              text: `Error: ${data.title} - ${data.error}`
            }]
          }));
          break;

        case 'error':
          setProgressModal(prev => ({
            ...prev,
            done: true,
            result: { type: 'error', message: data.message }
          }));
          eventSource.close();
          break;

        case 'done':
          setProgressModal(prev => ({
            ...prev,
            done: true,
            current: prev.total,
            result: {
              type: 'success',
              message: data.message,
              updated: data.updated,
              errors: data.errors
            }
          }));
          eventSource.close();
          addLog('success', data.message);
          break;

        default:
          break;
      }
    };

    eventSource.onerror = () => {
      setProgressModal(prev => ({
        ...prev,
        done: true,
        result: { type: 'error', message: 'Connexió perduda' }
      }));
      eventSource.close();
    };
  };

  const closeProgressModal = () => {
    setProgressModal({
      show: false,
      title: '',
      current: 0,
      total: 0,
      currentItem: '',
      updates: [],
      done: false,
      result: null
    });
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

  // BBC iPlayer functions
  const checkBbcStatus = async () => {
    try {
      const response = await axios.get('/api/bbc/status');
      setBbcStatus(response.data);
    } catch (error) {
      console.error('Error checking BBC status:', error);
      setBbcStatus({ configured: false });
    }
  };

  const saveBbcCookies = async () => {
    if (!bbcCookies.trim()) return;
    setBbcLoading(true);
    try {
      const response = await axios.post('/api/bbc/cookies', { cookies: bbcCookies });
      showMessage(response.data.message || 'Cookies de BBC guardades correctament');
      addLog('success', response.data.validation || 'BBC iPlayer configurat');
      setBbcCookies('');
      checkBbcStatus();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error guardant cookies de BBC';
      showMessage(errorMsg, 'error');
      addLog('error', errorMsg);
    } finally {
      setBbcLoading(false);
    }
  };

  const deleteBbcCookies = async () => {
    if (!window.confirm('Segur que vols eliminar les cookies de BBC?')) return;
    try {
      await axios.delete('/api/bbc/cookies');
      showMessage('Cookies de BBC eliminades');
      addLog('info', 'Cookies de BBC eliminades');
      checkBbcStatus();
    } catch (error) {
      showMessage('Error eliminant cookies', 'error');
    }
  };

  // Import BBC single series by URL
  const [bbcSingleImport, setBbcSingleImport] = useState({
    url: '',
    tmdbId: '',
    title: '',
    loading: false,
    result: null
  });

  const importBbcSeries = async () => {
    if (!bbcSingleImport.url || !bbcSingleImport.tmdbId) {
      showMessage('Cal introduir URL de BBC i TMDB ID', 'error');
      return;
    }

    setBbcSingleImport(prev => ({ ...prev, loading: true, result: null }));
    addLog('info', `Importat sèrie BBC: ${bbcSingleImport.url}`);

    try {
      const params = new URLSearchParams({
        url: bbcSingleImport.url,
        tmdb_id: bbcSingleImport.tmdbId,
        content_type: 'tv'
      });
      if (bbcSingleImport.title) {
        params.append('title', bbcSingleImport.title);
      }

      const response = await axios.post(`/api/bbc/import?${params.toString()}`);
      const result = response.data;

      setBbcSingleImport(prev => ({
        ...prev,
        loading: false,
        result: { success: true, ...result }
      }));

      addLog('success', `Importats ${result.imported_count} episodis de ${result.title || 'sèrie'}`);
      showMessage(`Importats ${result.imported_count} episodis!`);
    } catch (error) {
      const errMsg = error.response?.data?.detail || error.message;
      setBbcSingleImport(prev => ({
        ...prev,
        loading: false,
        result: { success: false, error: errMsg }
      }));
      addLog('error', `Error important sèrie: ${errMsg}`);
      showMessage('Error important sèrie', 'error');
    }
  };


  // BBC Catalog Sync with progress
  const syncBbcCatalog = async () => {
    setBbcSyncProgress({
      running: true,
      phase: 'Iniciant escaneig de BBC iPlayer...',
      current: 0,
      total: 100,
      currentItem: '',
      found: [],
      notFound: [],
      errors: [],
      result: null
    });

    try {
      // Fase 1: Escanejar catàleg BBC
      setBbcSyncProgress(prev => ({ ...prev, phase: 'Escanejant catàleg de BBC iPlayer...', current: 10 }));
      addLog('info', 'Iniciant escaneig de BBC iPlayer...');

      const scanResponse = await axios.post('/api/bbc/catalog/scan');
      const catalog = scanResponse.data;

      const totalPrograms = (catalog.films?.length || 0) + (catalog.series?.length || 0);
      setBbcSyncProgress(prev => ({
        ...prev,
        phase: `Trobats ${totalPrograms} programes. Fent matching amb TMDB...`,
        current: 30,
        total: totalPrograms
      }));
      addLog('success', `Trobats ${catalog.films_count || 0} pel·lícules i ${catalog.series_count || 0} sèries a BBC`);

      // Fase 2: Matching amb TMDB
      setBbcSyncProgress(prev => ({ ...prev, phase: 'Fent matching amb TMDB...', current: 40 }));

      const matchResponse = await axios.post('/api/bbc/catalog/match');
      const matchResult = matchResponse.data;

      const matched = matchResult.matched || [];
      const unmatched = matchResult.unmatched || [];
      const lowConfidence = matchResult.low_confidence || [];

      setBbcSyncProgress(prev => ({
        ...prev,
        phase: `Matched ${matched.length} programes. Important...`,
        current: 60,
        found: matched.map(m => ({ title: m.bbc_title, tmdb_title: m.tmdb_title, confidence: m.confidence })),
        notFound: unmatched.map(u => u.bbc_title),
      }));
      addLog('success', `Matched ${matched.length} programes amb TMDB`);

      // Fase 3: Importar al mapping
      setBbcSyncProgress(prev => ({ ...prev, phase: 'Important al sistema de mapping...', current: 70 }));

      const importResponse = await axios.post('/api/bbc/catalog/import-all?scan_first=false', {
        programs: matched
      });

      // Resultat final
      const result = {
        films: importResponse.data?.imported_films || matched.filter(m => m.is_film).length,
        series: importResponse.data?.imported_series || matched.filter(m => !m.is_film).length,
        episodes: importResponse.data?.imported_episodes || 0,
        matched: matched.length,
        unmatched: unmatched.length,
        lowConfidence: lowConfidence.length,
        errors: importResponse.data?.failed || []
      };

      setBbcSyncProgress(prev => ({
        ...prev,
        running: false,
        phase: 'Completat!',
        current: 100,
        result,
        errors: result.errors.map(e => `${e.title}: ${e.error}`)
      }));

      addLog('success', `BBC Sync completat: ${result.films} pel·lícules, ${result.series} sèries importades`);
      showMessage(`Sincronització BBC completada: ${result.matched} programes importats`);

    } catch (error) {
      console.error('BBC Sync error:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Error desconegut';
      setBbcSyncProgress(prev => ({
        ...prev,
        running: false,
        phase: 'Error!',
        errors: [...prev.errors, errorMsg]
      }));
      addLog('error', `Error sincronitzant BBC: ${errorMsg}`);
      showMessage(`Error: ${errorMsg}`, 'error');
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

      {/* BBC iPlayer Configuration */}
      <div className="admin-section">
        <div className="section-header">
          <h2><TvIcon /> BBC iPlayer</h2>
        </div>
        <div className="section-content">
          {bbcStatus === null ? (
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Comprovant...</div>
          ) : !bbcStatus.configured ? (
            <div className="tmdb-config">
              <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
                Per reproduir contingut de BBC iPlayer, has de configurar les cookies del teu compte de BBC.
                Exporta les cookies en format Netscape utilitzant una extensió del navegador com{' '}
                <a href="https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/" target="_blank" rel="noopener noreferrer" style={{ color: '#328492' }}>cookies.txt</a>.
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Nota: Les cookies es guarden encriptades i només admins poden accedir-hi.
                {bbcStatus.encryption && ' (Encriptació AES-128 activa)'}
              </p>
              <textarea
                value={bbcCookies}
                onChange={(e) => setBbcCookies(e.target.value)}
                placeholder="Enganxa aquí les cookies en format Netscape..."
                className="admin-textarea"
                rows={8}
                style={{
                  width: '100%',
                  marginBottom: '1rem',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  resize: 'vertical'
                }}
              />
              <button
                className="action-btn"
                onClick={saveBbcCookies}
                disabled={!bbcCookies.trim() || bbcLoading}
              >
                {bbcLoading ? 'Guardant...' : 'Guardar cookies'}
              </button>
            </div>
          ) : (
            <div className="tmdb-configured">
              <CheckIcon />
              <span>BBC iPlayer configurat correctament</span>
              <button
                className="action-btn secondary"
                onClick={deleteBbcCookies}
                style={{ marginLeft: '1rem', padding: '6px 12px', fontSize: '13px' }}
              >
                Eliminar cookies
              </button>
            </div>
          )}

          {/* BBC Single Series Import */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DownloadIcon /> Importar Sèrie BBC per URL
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Importa una sèrie específica de BBC iPlayer introduint la seva URL i el TMDB ID corresponent.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="URL de BBC iPlayer (ex: https://www.bbc.co.uk/iplayer/episodes/m0021y5y)"
                value={bbcSingleImport.url}
                onChange={(e) => setBbcSingleImport(prev => ({ ...prev, url: e.target.value }))}
                style={{
                  padding: '0.75rem',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  placeholder="TMDB ID (ex: 37854)"
                  value={bbcSingleImport.tmdbId}
                  onChange={(e) => setBbcSingleImport(prev => ({ ...prev, tmdbId: e.target.value }))}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
                <input
                  type="text"
                  placeholder="Títol (opcional)"
                  value={bbcSingleImport.title}
                  onChange={(e) => setBbcSingleImport(prev => ({ ...prev, title: e.target.value }))}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
              <button
                className="action-btn"
                onClick={importBbcSeries}
                disabled={bbcSingleImport.loading || !bbcSingleImport.url || !bbcSingleImport.tmdbId}
              >
                {bbcSingleImport.loading ? 'Important...' : 'Importar Sèrie'}
              </button>
            </div>

            {/* Import result */}
            {bbcSingleImport.result?.success && (
              <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ color: '#4ade80', fontWeight: '600' }}>
                  Importats {bbcSingleImport.result.imported_count} episodis de "{bbcSingleImport.result.title}"
                </div>
              </div>
            )}
            {bbcSingleImport.result && !bbcSingleImport.result.success && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ color: '#ef4444', fontWeight: '600' }}>
                  Error: {bbcSingleImport.result.error}
                </div>
              </div>
            )}
          </div>

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
              <p>Actualitza els títols en japonès, coreà, xinès, rus, etc. amb els seus equivalents en català (o castellà/anglès si no hi ha).</p>
            </div>
            <button
              className="action-btn"
              onClick={() => runWithProgress('Corregint títols', '/api/admin/fix-non-latin-titles/stream')}
            >
              <RefreshIcon /> Corregir títols
            </button>
          </div>
          <div className="maintenance-item">
            <div className="maintenance-info">
              <h4>Pre-cachejar episodis</h4>
              <p>Tradueix i cacheja els títols dels episodis de totes les sèries. Així la càrrega serà instantània.</p>
            </div>
            <button
              className="action-btn"
              onClick={async () => {
                try {
                  showMessage('Pre-cachejant episodis... Això pot trigar uns minuts.', 'info');
                  addLog('info', 'Iniciant pre-cache d\'episodis...');
                  const response = await axios.post('/api/admin/precache-episodes');
                  const data = response.data;
                  showMessage(`Cachejades ${data.cached_seasons} temporades`, 'success');
                  addLog('success', `Temporades cachejades: ${data.cached_seasons}`);
                  if (data.details?.length > 0) {
                    data.details.slice(0, 5).forEach(item => {
                      addLog('info', `${item.series} T${item.season}: ${item.episodes} episodis`);
                    });
                  }
                } catch (error) {
                  showMessage('Error pre-cachejant episodis', 'error');
                  addLog('error', error.response?.data?.detail || 'Error desconegut');
                }
              }}
            >
              <RefreshIcon /> Pre-cachejar
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
              <span className="system-label">BBC iPlayer</span>
              <span className={`system-value ${bbcStatus?.configured ? 'status-ok' : 'status-error'}`}>
                {bbcStatus?.configured ? 'Configurat' : 'No configurat'}
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

      {/* Progress Modal */}
      {progressModal.show && (
        <div className="progress-modal-overlay">
          <div className="progress-modal">
            <div className="progress-modal-header">
              <h3>{progressModal.title}</h3>
              {progressModal.done && (
                <button className="close-btn" onClick={closeProgressModal}>×</button>
              )}
            </div>

            <div className="progress-modal-body">
              {/* Progress bar */}
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progressModal.total > 0 ? (progressModal.current / progressModal.total) * 100 : 0}%` }}
                />
              </div>
              <div className="progress-stats">
                <span>{progressModal.current} / {progressModal.total}</span>
                <span>{progressModal.total > 0 ? Math.round((progressModal.current / progressModal.total) * 100) : 0}%</span>
              </div>

              {/* Current item */}
              <div className="progress-current-item">
                {progressModal.currentItem}
              </div>

              {/* Updates log */}
              <div className="progress-updates">
                {progressModal.updates.map((update, idx) => (
                  <div key={idx} className={`progress-update ${update.type}`}>
                    {update.text}
                  </div>
                ))}
              </div>

              {/* Result */}
              {progressModal.result && (
                <div className={`progress-result ${progressModal.result.type}`}>
                  <strong>{progressModal.result.message}</strong>
                  {progressModal.result.updated !== undefined && (
                    <span> ({progressModal.result.updated} actualitzats, {progressModal.result.errors} errors)</span>
                  )}
                </div>
              )}
            </div>

            {progressModal.done && (
              <div className="progress-modal-footer">
                <button className="action-btn" onClick={closeProgressModal}>Tancar</button>
              </div>
            )}
          </div>
        </div>
      )}

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
