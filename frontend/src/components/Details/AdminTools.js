import React, { useState } from 'react';
import { EditIcon } from '../icons';
import './AdminTools.css';

/**
 * AdminTools - Eines d'administració per gestionar metadades
 * Permet corregir TMDB ID i afegir URLs externes
 */
function AdminTools({
  isAdmin,
  onUpdateTmdb,
  onUpdateExternalUrl
}) {
  const [showTmdbInput, setShowTmdbInput] = useState(false);
  const [showExternalUrlInput, setShowExternalUrlInput] = useState(false);
  const [tmdbId, setTmdbId] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [externalUrlLoading, setExternalUrlLoading] = useState(false);
  const [tmdbMessage, setTmdbMessage] = useState(null);
  const [externalUrlMessage, setExternalUrlMessage] = useState(null);

  if (!isAdmin) {
    return null;
  }

  const handleTmdbSubmit = async (e) => {
    e.preventDefault();
    if (!tmdbId.trim()) return;

    setTmdbLoading(true);
    setTmdbMessage(null);

    try {
      const result = await onUpdateTmdb(tmdbId.trim());
      if (result.success) {
        setTmdbMessage({ type: 'success', text: result.message || 'Metadades actualitzades correctament' });
        setTmdbId('');
        setTimeout(() => setShowTmdbInput(false), 2000);
      } else {
        setTmdbMessage({ type: 'error', text: result.message || 'Error actualitzant metadades' });
      }
    } catch (error) {
      setTmdbMessage({ type: 'error', text: error.message || 'Error actualitzant metadades' });
    } finally {
      setTmdbLoading(false);
    }
  };

  const handleExternalUrlSubmit = async (e) => {
    e.preventDefault();
    if (!externalUrl.trim()) return;

    setExternalUrlLoading(true);
    setExternalUrlMessage(null);

    try {
      const result = await onUpdateExternalUrl(externalUrl.trim());
      if (result.success) {
        setExternalUrlMessage({ type: 'success', text: result.message || 'URL externa guardada correctament' });
        setExternalUrl('');
        setTimeout(() => setShowExternalUrlInput(false), 2000);
      } else {
        setExternalUrlMessage({ type: 'error', text: result.message || 'Error guardant URL externa' });
      }
    } catch (error) {
      setExternalUrlMessage({ type: 'error', text: error.message || 'Error guardant URL externa' });
    } finally {
      setExternalUrlLoading(false);
    }
  };

  return (
    <div className="admin-tools">
      {/* TMDB ID Input */}
      {showTmdbInput && (
        <form className="admin-tools__form" onSubmit={handleTmdbSubmit}>
          <div className="admin-tools__form-header">
            <EditIcon size={16} />
            <span>Corregir TMDB ID</span>
            <button
              type="button"
              className="admin-tools__close"
              onClick={() => setShowTmdbInput(false)}
              aria-label="Tancar"
            >
              ×
            </button>
          </div>

          <div className="admin-tools__form-content">
            <input
              type="text"
              className="admin-tools__input"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              placeholder="Introdueix TMDB ID (ex: 94605)"
              disabled={tmdbLoading}
              autoFocus
            />
            <button
              type="submit"
              className="admin-tools__submit"
              disabled={tmdbLoading || !tmdbId.trim()}
            >
              {tmdbLoading ? 'Actualitzant...' : 'Actualitzar'}
            </button>
          </div>

          <small className="admin-tools__help">
            Cerca a{' '}
            <a
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              themoviedb.org
            </a>
            {' '}i copia l'ID de l'URL
          </small>

          {tmdbMessage && (
            <div className={`admin-tools__message admin-tools__message--${tmdbMessage.type}`}>
              {tmdbMessage.text}
            </div>
          )}
        </form>
      )}

      {/* External URL Input */}
      {showExternalUrlInput && (
        <form className="admin-tools__form" onSubmit={handleExternalUrlSubmit}>
          <div className="admin-tools__form-header">
            <span>🔗</span>
            <span>URL Externa</span>
            <button
              type="button"
              className="admin-tools__close"
              onClick={() => setShowExternalUrlInput(false)}
              aria-label="Tancar"
            >
              ×
            </button>
          </div>

          <div className="admin-tools__form-content">
            <input
              type="url"
              className="admin-tools__input"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://example.com/watch/..."
              disabled={externalUrlLoading}
              autoFocus
            />
            <button
              type="submit"
              className="admin-tools__submit"
              disabled={externalUrlLoading || !externalUrl.trim()}
            >
              {externalUrlLoading ? 'Guardant...' : 'Guardar'}
            </button>
          </div>

          <small className="admin-tools__help">
            URL per veure el contingut en una plataforma externa
          </small>

          {externalUrlMessage && (
            <div className={`admin-tools__message admin-tools__message--${externalUrlMessage.type}`}>
              {externalUrlMessage.text}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

export default AdminTools;
