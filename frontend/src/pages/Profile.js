import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Profile.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

// Icons
const UserIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

const KeyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

// Languages
const LANGUAGES = [
  { code: 'ca', name: 'Catala' },
  { code: 'es', name: 'Castellano' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Francais' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Portugues' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
];

const QUALITIES = [
  { value: 'auto', label: 'Automatic' },
  { value: '2160p', label: '4K (2160p)' },
  { value: '1080p', label: 'Full HD (1080p)' },
  { value: '720p', label: 'HD (720p)' },
  { value: '480p', label: 'SD (480p)' },
];

function Profile() {
  const { user, isAdmin, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Profile form
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');

  // Avatar
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
  const [tempAvatarUrl, setTempAvatarUrl] = useState('');
  const [showCropEditor, setShowCropEditor] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Password change
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Preferences (stored in localStorage)
  const [subtitleLang, setSubtitleLang] = useState(localStorage.getItem('hermes_subtitle_lang') || 'ca');
  const [audioLang, setAudioLang] = useState(localStorage.getItem('hermes_audio_lang') || 'ca');
  const [defaultQuality, setDefaultQuality] = useState(localStorage.getItem('hermes_quality') || 'auto');
  const [autoplayNext, setAutoplayNext] = useState(localStorage.getItem('hermes_autoplay') !== 'false');
  const [skipIntros, setSkipIntros] = useState(localStorage.getItem('hermes_skip_intros') !== 'false');

  // Admin: Users and Invitations
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [newInviteUses, setNewInviteUses] = useState(1);
  const [newInviteDays, setNewInviteDays] = useState(7);
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    setDisplayName(user.display_name || '');
    setEmail(user.email || '');
    setAvatarUrl(user.avatar || '');

    if (isAdmin) {
      loadAdminData();
    }
  }, [user, isAdmin, navigate]);

  const loadAdminData = async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/users`),
        axios.get(`${API_URL}/api/invitations`)
      ]);
      setUsers(usersRes.data.users || []);
      setInvitations(invitesRes.data.invitations || []);
    } catch (e) {
      console.error('Error loading admin data:', e);
    }
  };

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const openAvatarModal = () => {
    setTempAvatarUrl(avatarUrl);
    setShowAvatarModal(true);
  };

  const handleAvatarSave = async () => {
    setLoading(true);
    try {
      const result = await updateProfile({ avatar: tempAvatarUrl });
      if (result.success) {
        setAvatarUrl(tempAvatarUrl);
        showMessage('Foto de perfil actualitzada');
        setShowAvatarModal(false);
      } else {
        showMessage(result.error, 'error');
      }
    } catch (e) {
      showMessage('Error actualitzant la foto', 'error');
    }
    setLoading(false);
  };

  const handleAvatarRemove = async () => {
    setLoading(true);
    try {
      const result = await updateProfile({ avatar: '' });
      if (result.success) {
        setAvatarUrl('');
        setTempAvatarUrl('');
        showMessage('Foto de perfil eliminada');
        setShowAvatarModal(false);
      } else {
        showMessage(result.error, 'error');
      }
    } catch (e) {
      showMessage('Error eliminant la foto', 'error');
    }
    setLoading(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Verificar que sigui una imatge
    if (!file.type.startsWith('image/')) {
      showMessage('Si us plau, selecciona una imatge', 'error');
      return;
    }

    // Verificar mida (max 5MB per editar)
    if (file.size > 5 * 1024 * 1024) {
      showMessage('La imatge no pot superar 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setTempAvatarUrl(event.target.result);
      setCropZoom(1);
      setCropPosition({ x: 0, y: 0 });
      setShowCropEditor(true);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlSubmit = () => {
    if (tempAvatarUrl && !tempAvatarUrl.startsWith('data:')) {
      setCropZoom(1);
      setCropPosition({ x: 0, y: 0 });
      setShowCropEditor(true);
    }
  };

  const handleCropMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
  };

  const handleCropMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    // Limitar el moviment segons el zoom
    const limit = 150;
    setCropPosition({
      x: Math.max(-limit, Math.min(limit, newX)),
      y: Math.max(-limit, Math.min(limit, newY))
    });
  };

  const handleCropMouseUp = () => {
    setIsDragging(false);
  };

  const applyCrop = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const size = 200;
      canvas.width = size;
      canvas.height = size;

      const scale = cropZoom;
      const imgSize = Math.min(img.width, img.height);
      const srcSize = imgSize / scale;

      const centerX = img.width / 2;
      const centerY = img.height / 2;

      const offsetX = (cropPosition.x / 100) * (srcSize / 2);
      const offsetY = (cropPosition.y / 100) * (srcSize / 2);

      const srcX = centerX - srcSize / 2 - offsetX;
      const srcY = centerY - srcSize / 2 - offsetY;

      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

      const croppedUrl = canvas.toDataURL('image/jpeg', 0.9);
      setTempAvatarUrl(croppedUrl);
      setShowCropEditor(false);
    };

    img.onerror = () => {
      showMessage('Error processant la imatge', 'error');
      setShowCropEditor(false);
    };

    img.src = tempAvatarUrl;
  };

  const cancelCrop = () => {
    setShowCropEditor(false);
    setTempAvatarUrl('');
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await updateProfile({ display_name: displayName, email });
      if (result.success) {
        showMessage('Perfil actualitzat correctament');
      } else {
        showMessage(result.error, 'error');
      }
    } catch (e) {
      showMessage('Error actualitzant el perfil', 'error');
    }
    setLoading(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showMessage('Les contrasenyes no coincideixen', 'error');
      return;
    }
    setLoading(true);
    try {
      await axios.put(`${API_URL}/api/auth/password`, {
        old_password: oldPassword,
        new_password: newPassword
      });
      showMessage('Contrasenya canviada correctament');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      showMessage(e.response?.data?.detail || 'Error canviant la contrasenya', 'error');
    }
    setLoading(false);
  };

  const savePreferences = () => {
    localStorage.setItem('hermes_subtitle_lang', subtitleLang);
    localStorage.setItem('hermes_audio_lang', audioLang);
    localStorage.setItem('hermes_quality', defaultQuality);
    localStorage.setItem('hermes_autoplay', autoplayNext.toString());
    localStorage.setItem('hermes_skip_intros', skipIntros.toString());
    showMessage('Preferencies guardades');
  };

  const createInvitation = async () => {
    try {
      await axios.post(`${API_URL}/api/invitations`, {
        max_uses: newInviteUses,
        expires_days: newInviteDays
      });
      showMessage('Invitacio creada');
      loadAdminData();
    } catch (e) {
      showMessage(e.response?.data?.detail || 'Error creant invitacio', 'error');
    }
  };

  const deleteInvitation = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/invitations/${id}`);
      showMessage('Invitacio eliminada');
      loadAdminData();
    } catch (e) {
      showMessage('Error eliminant invitacio', 'error');
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
      await axios.put(`${API_URL}/api/admin/users/${userId}/toggle-active?active=${active}`);
      showMessage(`Usuari ${active ? 'activat' : 'desactivat'}`);
      loadAdminData();
    } catch (e) {
      showMessage(e.response?.data?.detail || 'Error', 'error');
    }
  };

  const toggleUserPremium = async (userId, isPremium) => {
    try {
      await axios.put(`${API_URL}/api/admin/users/${userId}/toggle-premium?is_premium=${isPremium}`);
      showMessage(`Usuari ${isPremium ? 'ara és' : 'ja no és'} premium`);
      loadAdminData();
    } catch (e) {
      showMessage(e.response?.data?.detail || 'Error', 'error');
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm('Segur que vols eliminar aquest usuari?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/users/${userId}`);
      showMessage('Usuari eliminat');
      loadAdminData();
    } catch (e) {
      showMessage(e.response?.data?.detail || 'Error', 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="profile-page">
      {message && (
        <div className={`profile-message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="profile-container">
        {/* Sidebar */}
        <div className="profile-sidebar">
          <div className="profile-avatar">
            <div className="avatar-wrapper">
              <div className={`avatar-circle ${avatarUrl ? 'has-image' : ''}`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" />
                ) : (
                  user.display_name?.charAt(0).toUpperCase() || user.username?.charAt(0).toUpperCase()
                )}
              </div>
              <button className="avatar-edit-btn" onClick={openAvatarModal} title="Canviar foto">
                <CameraIcon />
              </button>
            </div>
            <h2>{user.display_name || user.username}</h2>
            <p>@{user.username}</p>
          </div>

          <nav className="profile-nav">
            <button
              className={activeTab === 'profile' ? 'active' : ''}
              onClick={() => setActiveTab('profile')}
            >
              <UserIcon /> Perfil
            </button>
            <button
              className={activeTab === 'preferences' ? 'active' : ''}
              onClick={() => setActiveTab('preferences')}
            >
              <SettingsIcon /> Preferencies
            </button>
            <button
              className={activeTab === 'security' ? 'active' : ''}
              onClick={() => setActiveTab('security')}
            >
              <KeyIcon /> Seguretat
            </button>
            {isAdmin && (
              <button
                className={activeTab === 'admin' ? 'active' : ''}
                onClick={() => setActiveTab('admin')}
              >
                <UsersIcon /> Administracio
              </button>
            )}
            <button className="logout-btn" onClick={handleLogout}>
              <LogoutIcon /> Tancar sessio
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="profile-content">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="profile-section">
              <h1>Perfil</h1>
              <form onSubmit={handleProfileUpdate}>
                <div className="form-group">
                  <label>Nom d'usuari</label>
                  <input
                    type="text"
                    value={user.username}
                    disabled
                    className="disabled"
                  />
                </div>
                <div className="form-group">
                  <label>Nom a mostrar</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="El teu nom"
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <button type="submit" className="primary-btn" disabled={loading}>
                  {loading ? 'Guardant...' : 'Guardar canvis'}
                </button>
              </form>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="profile-section">
              <h1>Preferencies de reproduccio</h1>

              <div className="pref-group">
                <h3>Idioma</h3>
                <div className="pref-row">
                  <label>Idioma d'audio preferit</label>
                  <select value={audioLang} onChange={(e) => setAudioLang(e.target.value)}>
                    {LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>
                <div className="pref-row">
                  <label>Idioma de subtitols preferit</label>
                  <select value={subtitleLang} onChange={(e) => setSubtitleLang(e.target.value)}>
                    <option value="off">Desactivats</option>
                    {LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pref-group">
                <h3>Qualitat</h3>
                <div className="pref-row">
                  <label>Qualitat per defecte</label>
                  <select value={defaultQuality} onChange={(e) => setDefaultQuality(e.target.value)}>
                    {QUALITIES.map(q => (
                      <option key={q.value} value={q.value}>{q.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pref-group">
                <h3>Reproduccio</h3>
                <div className="pref-row toggle">
                  <label>Reproduir seguent episodi automaticament</label>
                  <button
                    className={`toggle-btn ${autoplayNext ? 'active' : ''}`}
                    onClick={() => setAutoplayNext(!autoplayNext)}
                  >
                    <span className="toggle-slider"></span>
                  </button>
                </div>
                <div className="pref-row toggle">
                  <label>Saltar intros automaticament</label>
                  <button
                    className={`toggle-btn ${skipIntros ? 'active' : ''}`}
                    onClick={() => setSkipIntros(!skipIntros)}
                  >
                    <span className="toggle-slider"></span>
                  </button>
                </div>
              </div>

              <button className="primary-btn" onClick={savePreferences}>
                Guardar preferencies
              </button>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="profile-section">
              <h1>Seguretat</h1>
              <form onSubmit={handlePasswordChange}>
                <div className="form-group">
                  <label>Contrasenya actual</label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nova contrasenya</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Confirmar nova contrasenya</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="primary-btn" disabled={loading}>
                  {loading ? 'Canviant...' : 'Canviar contrasenya'}
                </button>
              </form>
            </div>
          )}

          {/* Admin Tab */}
          {activeTab === 'admin' && isAdmin && (
            <div className="profile-section admin-section">
              <h1>Administracio</h1>

              {/* Invitations */}
              <div className="admin-block">
                <h2>Invitacions</h2>
                <div className="invite-create">
                  <div className="invite-inputs">
                    <div className="form-group inline">
                      <label>Usos maxims</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={newInviteUses}
                        onChange={(e) => setNewInviteUses(parseInt(e.target.value))}
                      />
                    </div>
                    <div className="form-group inline">
                      <label>Dies de validesa</label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={newInviteDays}
                        onChange={(e) => setNewInviteDays(parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                  <button className="primary-btn" onClick={createInvitation}>
                    Crear invitacio
                  </button>
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
                            title="Copiar enllac d'invitacio"
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
              </div>

              {/* Users */}
              <div className="admin-block">
                <h2>Usuaris ({users.length})</h2>
                <div className="users-list">
                  {users.map(u => (
                    <div key={u.id} className={`user-item ${!u.is_active ? 'inactive' : ''}`}>
                      <div className="user-info">
                        <div className="user-avatar">
                          {u.display_name?.charAt(0).toUpperCase() || u.username?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4>{u.display_name || u.username}</h4>
                          <p>@{u.username} {u.is_admin && <span className="admin-badge">Admin</span>}{u.is_premium && <span className="premium-badge">Premium</span>}</p>
                        </div>
                      </div>
                      {u.id !== user.id && (
                        <div className="user-actions">
                          <button
                            className={`action-btn ${u.is_active ? 'warning' : 'success'}`}
                            onClick={() => toggleUserActive(u.id, !u.is_active)}
                          >
                            {u.is_active ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            className={`action-btn ${u.is_premium ? 'warning' : 'premium'}`}
                            onClick={() => toggleUserPremium(u.id, !u.is_premium)}
                          >
                            {u.is_premium ? 'Treure premium' : 'Fer premium'}
                          </button>
                          <button
                            className="action-btn danger"
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
          )}
        </div>
      </div>

      {/* Avatar Modal */}
      {showAvatarModal && (
        <div
          className="avatar-modal-overlay"
          onClick={() => { if (!isDragging) { setShowAvatarModal(false); setShowCropEditor(false); setTempAvatarUrl(''); } }}
          onMouseMove={isDragging ? handleCropMouseMove : undefined}
          onMouseUp={isDragging ? handleCropMouseUp : undefined}
        >
          <div className="avatar-modal" onClick={e => e.stopPropagation()}>
            {showCropEditor ? (
              <>
                <h3>Ajusta la imatge</h3>
                <div
                  className="crop-editor"
                  onMouseDown={handleCropMouseDown}
                  onMouseMove={handleCropMouseMove}
                  onMouseUp={handleCropMouseUp}
                >
                  <div className="crop-container">
                    <img
                      src={tempAvatarUrl}
                      alt="Crop"
                      style={{
                        transform: `translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${cropZoom})`,
                        cursor: isDragging ? 'grabbing' : 'grab'
                      }}
                      draggable={false}
                    />
                    <div className="crop-overlay">
                      <div className="crop-circle"></div>
                    </div>
                  </div>
                </div>
                <div className="crop-controls">
                  <label>Zoom</label>
                  <input
                    type="range"
                    min="0.3"
                    max="3"
                    step="0.05"
                    value={cropZoom}
                    onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                  />
                  <span>{Math.round(cropZoom * 100)}%</span>
                </div>
                <div className="avatar-modal-actions">
                  <button className="cancel-btn" onClick={cancelCrop}>
                    Cancel·lar
                  </button>
                  <button className="save-btn" onClick={applyCrop}>
                    Aplicar
                  </button>
                </div>
              </>
            ) : tempAvatarUrl && tempAvatarUrl.startsWith('data:') ? (
              <>
                <h3>Previsualització</h3>
                <div className="avatar-preview large">
                  <img
                    src={tempAvatarUrl}
                    alt="Preview"
                  />
                </div>
                <div className="avatar-modal-actions">
                  <button className="cancel-btn" onClick={() => setTempAvatarUrl('')}>
                    Canviar imatge
                  </button>
                  {avatarUrl && (
                    <button className="remove-btn" onClick={handleAvatarRemove} disabled={loading}>
                      Eliminar
                    </button>
                  )}
                  <button className="save-btn" onClick={handleAvatarSave} disabled={loading}>
                    {loading ? 'Guardant...' : 'Guardar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Canviar foto de perfil</h3>

                <div className="avatar-upload-section">
                  <label className="file-upload-btn">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                    Pujar imatge local
                  </label>
                  <span className="upload-divider">o</span>
                </div>

                <div className="form-group url-input-group">
                  <label>URL de la imatge</label>
                  <div className="url-input-row">
                    <input
                      type="url"
                      value={tempAvatarUrl}
                      onChange={(e) => setTempAvatarUrl(e.target.value)}
                      placeholder="https://exemple.com/foto.jpg"
                    />
                    {tempAvatarUrl && (
                      <button className="edit-url-btn" onClick={handleUrlSubmit} title="Editar imatge">
                        Editar
                      </button>
                    )}
                  </div>
                </div>
                <div className="avatar-modal-actions">
                  <button className="cancel-btn" onClick={() => setShowAvatarModal(false)}>
                    Cancel·lar
                  </button>
                  {avatarUrl && (
                    <button className="remove-btn" onClick={handleAvatarRemove} disabled={loading}>
                      Eliminar actual
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Profile;
