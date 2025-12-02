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

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
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

const RocketIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
  </svg>
);

function Admin() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tmdbKey, setTmdbKey] = useState('');
  const [tmdbConfigured, setTmdbConfigured] = useState(false);

  // Bulk import state (TMDB) - unified for all
  const [bulkImportStatus, setBulkImportStatus] = useState(null);
  const [bulkImportPages, setBulkImportPages] = useState(50);

  // Book bulk import state
  const [bookBulkImportStatus, setBookBulkImportStatus] = useState(null);
  const [bookBulkImportMax, setBookBulkImportMax] = useState(100);

  // Audiobook bulk import state
  const [audiobookBulkImportStatus, setAudiobookBulkImportStatus] = useState(null);
  const [audiobookBulkImportMax, setAudiobookBulkImportMax] = useState(50);

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

  useEffect(() => {
    loadStats();
    checkTmdbKey();
    loadUserData();
  }, [loadStats]);

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

  // Bulk import functions
  const startBulkImport = async (mediaType) => {
    try {
      await axios.post('/api/admin/bulk-import/start', {
        media_type: mediaType,
        max_pages: bulkImportPages
      });
      addLog('info', `Importació massiva de ${mediaType === 'movie' ? 'pel·lícules' : 'sèries'} iniciada...`);
      pollBulkImportStatus();
    } catch (error) {
      addLog('error', error.response?.data?.detail || 'Error iniciant importació');
    }
  };

  // Import ALL at once (movies + series)
  const startBulkImportAll = async () => {
    try {
      // Start with movies first
      await axios.post('/api/admin/bulk-import/start', {
        media_type: 'movie',
        max_pages: bulkImportPages
      });
      addLog('info', 'Importació massiva de TOT iniciada (pel·lícules primer, després sèries)...');
      pollBulkImportStatus(true); // Pass flag to continue with series after movies
    } catch (error) {
      addLog('error', error.response?.data?.detail || 'Error iniciant importació');
    }
  };

  const stopBulkImport = async () => {
    try {
      await axios.post('/api/admin/bulk-import/stop');
      addLog('info', 'Aturant importació...');
    } catch (error) {
      addLog('error', 'Error aturant importació');
    }
  };

  const pollBulkImportStatus = async (continueWithSeries = false) => {
    const poll = async () => {
      try {
        const response = await axios.get('/api/admin/bulk-import/status');
        setBulkImportStatus(response.data);
        if (response.data.running) {
          setTimeout(poll, 1000);
        } else {
          // Import finished
          if (response.data.imported_count > 0) {
            addLog('success', `Importació completada: ${response.data.imported_count} importats, ${response.data.skipped_count} omesos`);
            loadStats();
          }
          // If we were importing movies and need to continue with series
          if (continueWithSeries && response.data.media_type === 'movie') {
            addLog('info', 'Ara important sèries...');
            await axios.post('/api/admin/bulk-import/start', {
              media_type: 'series',
              max_pages: bulkImportPages
            });
            pollBulkImportStatus(false);
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    };
    poll();
  };

  // Check bulk import status on load
  useEffect(() => {
    const checkBulkStatus = async () => {
      try {
        const response = await axios.get('/api/admin/bulk-import/status');
        setBulkImportStatus(response.data);
        if (response.data.running) {
          pollBulkImportStatus();
        }
      } catch (e) {
        // Ignore
      }
    };
    checkBulkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Book bulk import functions
  const startBookBulkImport = async () => {
    try {
      await axios.post('/api/admin/bulk-import/books/start', {
        max_per_subject: bookBulkImportMax
      });
      addLog('info', 'Importació massiva de llibres iniciada...');
      pollBookBulkImportStatus();
    } catch (error) {
      addLog('error', error.response?.data?.detail || 'Error iniciant importació de llibres');
    }
  };

  const stopBookBulkImport = async () => {
    try {
      await axios.post('/api/admin/bulk-import/books/stop');
      addLog('info', 'Aturant importació de llibres...');
    } catch (error) {
      addLog('error', 'Error aturant importació de llibres');
    }
  };

  const pollBookBulkImportStatus = async () => {
    const poll = async () => {
      try {
        const response = await axios.get('/api/admin/bulk-import/books/status');
        setBookBulkImportStatus(response.data);
        if (response.data.running) {
          setTimeout(poll, 1000);
        } else {
          if (response.data.imported_count > 0) {
            addLog('success', `Importació de llibres completada: ${response.data.imported_count} importats, ${response.data.skipped_count} omesos`);
            loadStats();
          }
        }
      } catch (error) {
        console.error('Error polling book status:', error);
      }
    };
    poll();
  };

  // Check book bulk import status on load
  useEffect(() => {
    const checkBookBulkStatus = async () => {
      try {
        const response = await axios.get('/api/admin/bulk-import/books/status');
        setBookBulkImportStatus(response.data);
        if (response.data.running) {
          pollBookBulkImportStatus();
        }
      } catch (e) {
        // Ignore
      }
    };
    checkBookBulkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audiobook bulk import functions
  const startAudiobookBulkImport = async () => {
    try {
      await axios.post('/api/admin/bulk-import/audiobooks/start', {
        max_per_term: audiobookBulkImportMax
      });
      addLog('info', 'Importació massiva d\'audiollibres iniciada...');
      pollAudiobookBulkImportStatus();
    } catch (error) {
      addLog('error', error.response?.data?.detail || 'Error iniciant importació d\'audiollibres');
    }
  };

  const stopAudiobookBulkImport = async () => {
    try {
      await axios.post('/api/admin/bulk-import/audiobooks/stop');
      addLog('info', 'Aturant importació d\'audiollibres...');
    } catch (error) {
      addLog('error', 'Error aturant importació d\'audiollibres');
    }
  };

  const pollAudiobookBulkImportStatus = async () => {
    const poll = async () => {
      try {
        const response = await axios.get('/api/admin/bulk-import/audiobooks/status');
        setAudiobookBulkImportStatus(response.data);
        if (response.data.running) {
          setTimeout(poll, 1000);
        } else {
          if (response.data.imported_count > 0) {
            addLog('success', `Importació d'audiollibres completada: ${response.data.imported_count} importats, ${response.data.skipped_count} omesos`);
            loadStats();
          }
        }
      } catch (error) {
        console.error('Error polling audiobook status:', error);
      }
    };
    poll();
  };

  // Check audiobook bulk import status on load
  useEffect(() => {
    const checkAudiobookBulkStatus = async () => {
      try {
        const response = await axios.get('/api/admin/bulk-import/audiobooks/status');
        setAudiobookBulkImportStatus(response.data);
        if (response.data.running) {
          pollAudiobookBulkImportStatus();
        }
      } catch (e) {
        // Ignore
      }
    };
    checkAudiobookBulkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { type, message, timestamp }].slice(-50));
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
          <div className="stat-icon"><BookIcon /></div>
          <div className="stat-info">
            <h3>{stats?.books || 0}</h3>
            <p>Llibres</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><HeadphonesIcon /></div>
          <div className="stat-info">
            <h3>{stats?.audiobooks || 0}</h3>
            <p>Audiollibres</p>
          </div>
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
          ) : (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(50, 132, 146, 0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckIcon />
              <span style={{ color: 'rgba(255,255,255,0.8)' }}>Clau TMDB configurada correctament</span>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Import Section - MAIN FEATURE */}
      {tmdbConfigured && (
        <div className="admin-section highlight">
          <div className="section-header">
            <h2><RocketIcon /> Importació massiva</h2>
          </div>
          <div className="section-content">
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1.5rem' }}>
              Importa automàticament milers de pel·lícules i sèries des de TMDB per veure en streaming.
              Tot el contingut estarà disponible per reproduir online.
            </p>

            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ color: 'rgba(255,255,255,0.8)' }}>Pàgines per categoria:</label>
              <input
                type="number"
                min="1"
                max="500"
                value={bulkImportPages}
                onChange={(e) => setBulkImportPages(parseInt(e.target.value) || 50)}
                disabled={bulkImportStatus?.running}
                style={{
                  width: '80px',
                  padding: '0.5rem',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '1rem'
                }}
              />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                (~{bulkImportPages * 20 * 4} títols per tipus)
              </span>
            </div>

            {/* MAIN BUTTON - Import ALL */}
            <button
              className="action-btn primary big"
              onClick={startBulkImportAll}
              disabled={bulkImportStatus?.running}
              style={{ width: '100%', padding: '1.25rem', fontSize: '1.1rem', marginBottom: '1rem' }}
            >
              {bulkImportStatus?.running ? (
                <><RefreshIcon /> Important...</>
              ) : (
                <><RocketIcon /> IMPORTAR TOT (Pel·lícules + Sèries)</>
              )}
            </button>

            <div className="scanner-actions">
              <button
                className="action-btn"
                onClick={() => startBulkImport('movie')}
                disabled={bulkImportStatus?.running}
              >
                <MovieIcon /> Només pel·lícules
              </button>
              <button
                className="action-btn"
                onClick={() => startBulkImport('series')}
                disabled={bulkImportStatus?.running}
              >
                <TvIcon /> Només sèries
              </button>
              {bulkImportStatus?.running && (
                <button
                  className="action-btn danger"
                  onClick={stopBulkImport}
                >
                  Aturar
                </button>
              )}
            </div>

            {/* Progress indicator */}
            {bulkImportStatus?.running && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                  <span>
                    Important {bulkImportStatus.media_type === 'movie' ? 'pel·lícules' : 'sèries'}...
                    {bulkImportStatus.current_category && ` (${bulkImportStatus.current_category})`}
                  </span>
                  <span>Pàgina {bulkImportStatus.current_page}/{bulkImportStatus.total_pages}</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(bulkImportStatus.current_page / bulkImportStatus.total_pages) * 100}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #328492, #4aa3b3)',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                  {bulkImportStatus.current_title && (
                    <div style={{ marginBottom: '0.5rem', color: 'rgba(255,255,255,0.8)' }}>
                      Importat: {bulkImportStatus.current_title}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    <span style={{ color: '#22c55e' }}>Importats: {bulkImportStatus.imported_count}</span>
                    <span>Omesos: {bulkImportStatus.skipped_count}</span>
                    {bulkImportStatus.error_count > 0 && (
                      <span style={{ color: '#ef4444' }}>Errors: {bulkImportStatus.error_count}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Last import stats */}
            {!bulkImportStatus?.running && bulkImportStatus?.imported_count > 0 && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <div style={{ color: '#22c55e', fontWeight: '500', marginBottom: '0.5rem' }}>Última importació completada</div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                  {bulkImportStatus.imported_count} títols importats, {bulkImportStatus.skipped_count} omesos
                  {bulkImportStatus.error_count > 0 && `, ${bulkImportStatus.error_count} errors`}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Book Bulk Import Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2><BookIcon /> Importació de Llibres</h2>
        </div>
        <div className="section-content">
          <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
            Importa llibres des d'Open Library per categories: ficció, ciència-ficció, fantasia, etc.
          </p>

          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ color: 'rgba(255,255,255,0.8)' }}>Llibres per categoria:</label>
            <input
              type="number"
              min="10"
              max="500"
              value={bookBulkImportMax}
              onChange={(e) => setBookBulkImportMax(parseInt(e.target.value) || 100)}
              disabled={bookBulkImportStatus?.running}
              style={{
                width: '80px',
                padding: '0.5rem',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '1rem'
              }}
            />
          </div>

          <div className="scanner-actions">
            <button
              className="action-btn"
              onClick={startBookBulkImport}
              disabled={bookBulkImportStatus?.running}
            >
              <BookIcon /> Importar llibres
            </button>
            {bookBulkImportStatus?.running && (
              <button
                className="action-btn danger"
                onClick={stopBookBulkImport}
              >
                Aturar
              </button>
            )}
          </div>

          {/* Progress */}
          {bookBulkImportStatus?.running && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                <span>
                  Important llibres...
                  {bookBulkImportStatus.current_subject && ` (${bookBulkImportStatus.current_subject})`}
                </span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(bookBulkImportStatus.current_page / bookBulkImportStatus.total_pages) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                Importats: {bookBulkImportStatus.imported_count} | Omesos: {bookBulkImportStatus.skipped_count}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Audiobook Bulk Import Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2><HeadphonesIcon /> Importació d'Audiollibres</h2>
        </div>
        <div className="section-content">
          <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
            Importa audiollibres des d'Audnexus amb informació de narradors i duració.
          </p>

          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ color: 'rgba(255,255,255,0.8)' }}>Audiollibres per cerca:</label>
            <input
              type="number"
              min="10"
              max="200"
              value={audiobookBulkImportMax}
              onChange={(e) => setAudiobookBulkImportMax(parseInt(e.target.value) || 50)}
              disabled={audiobookBulkImportStatus?.running}
              style={{
                width: '80px',
                padding: '0.5rem',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '1rem'
              }}
            />
          </div>

          <div className="scanner-actions">
            <button
              className="action-btn"
              onClick={startAudiobookBulkImport}
              disabled={audiobookBulkImportStatus?.running}
            >
              <HeadphonesIcon /> Importar audiollibres
            </button>
            {audiobookBulkImportStatus?.running && (
              <button
                className="action-btn danger"
                onClick={stopAudiobookBulkImport}
              >
                Aturar
              </button>
            )}
          </div>

          {/* Progress */}
          {audiobookBulkImportStatus?.running && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                <span>
                  Important audiollibres...
                  {audiobookBulkImportStatus.current_genre && ` (${audiobookBulkImportStatus.current_genre})`}
                </span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(audiobookBulkImportStatus.current_page / audiobookBulkImportStatus.total_pages) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                Importats: {audiobookBulkImportStatus.imported_count} | Omesos: {audiobookBulkImportStatus.skipped_count}
              </div>
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
            <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px' }}>
              No hi ha invitacions actives
            </div>
          )}
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
                  <p>Quan estigui disponible</p>
                </div>
              </div>
              <select
                className="admin-select"
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
                  <p>Quan estiguin disponibles</p>
                </div>
              </div>
              <select
                className="admin-select"
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
