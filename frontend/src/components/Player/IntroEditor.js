import React, { useState, useEffect } from 'react';
import { EditIcon, CheckIcon, CloseIcon, SaveIcon } from '../icons';
import './IntroEditor.css';

/**
 * IntroEditor - Component per administradors per marcar intros manualment
 * Permet definir l'inici i final d'un intro per a cada episodi
 */
function IntroEditor({
  currentTime,
  duration,
  introData,
  onSaveIntro,
  isAdmin
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [introStart, setIntroStart] = useState(null);
  const [introEnd, setIntroEnd] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Carregar dades d'intro existents
  useEffect(() => {
    if (introData) {
      setIntroStart(introData.start);
      setIntroEnd(introData.end);
    }
  }, [introData]);

  if (!isAdmin) {
    return null;
  }

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMarkStart = () => {
    setIntroStart(Math.floor(currentTime));
  };

  const handleMarkEnd = () => {
    setIntroEnd(Math.floor(currentTime));
  };

  const handleSave = async () => {
    if (introStart === null || introEnd === null) {
      return;
    }

    if (introEnd <= introStart) {
      alert('L\'hora de final ha de ser posterior a l\'hora d\'inici');
      return;
    }

    setIsSaving(true);
    try {
      await onSaveIntro({ start: introStart, end: introEnd });
      setIsEditing(false);
    } catch (error) {
      console.error('Error guardant intro:', error);
      alert('Error guardant l\'intro');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Restaurar valors originals
    if (introData) {
      setIntroStart(introData.start);
      setIntroEnd(introData.end);
    } else {
      setIntroStart(null);
      setIntroEnd(null);
    }
  };

  const handleClear = () => {
    setIntroStart(null);
    setIntroEnd(null);
  };

  const hasValidIntro = introStart !== null && introEnd !== null;
  const isModified =
    introStart !== introData?.start ||
    introEnd !== introData?.end;

  return (
    <div className="intro-editor">
      {!isEditing ? (
        <button
          className="intro-editor__toggle-btn"
          onClick={() => setIsEditing(true)}
          aria-label="Editar intro"
          title="Marcar intro (només admin)"
        >
          <EditIcon size={18} />
          <span className="intro-editor__toggle-text">
            {hasValidIntro ? 'Editar Intro' : 'Marcar Intro'}
          </span>
        </button>
      ) : (
        <div className="intro-editor__panel">
          <div className="intro-editor__header">
            <EditIcon size={18} />
            <span className="intro-editor__title">Editor d'Intro</span>
          </div>

          <div className="intro-editor__content">
            <div className="intro-editor__markers">
              <div className="intro-editor__marker">
                <label className="intro-editor__label">Inici</label>
                <div className="intro-editor__time-display">
                  {formatTime(introStart)}
                </div>
                <button
                  className="intro-editor__mark-btn"
                  onClick={handleMarkStart}
                  aria-label="Marcar inici d'intro"
                >
                  Marcar Inici
                </button>
              </div>

              <div className="intro-editor__separator">→</div>

              <div className="intro-editor__marker">
                <label className="intro-editor__label">Final</label>
                <div className="intro-editor__time-display">
                  {formatTime(introEnd)}
                </div>
                <button
                  className="intro-editor__mark-btn"
                  onClick={handleMarkEnd}
                  aria-label="Marcar final d'intro"
                >
                  Marcar Final
                </button>
              </div>
            </div>

            {hasValidIntro && (
              <div className="intro-editor__preview">
                <span className="intro-editor__preview-text">
                  Durada: {formatTime(introEnd - introStart)}
                </span>
              </div>
            )}

            <div className="intro-editor__actions">
              <button
                className="intro-editor__action-btn intro-editor__action-btn--clear"
                onClick={handleClear}
                disabled={!hasValidIntro}
                aria-label="Esborrar marcadors"
              >
                <CloseIcon size={16} />
                Esborrar
              </button>

              <button
                className="intro-editor__action-btn intro-editor__action-btn--cancel"
                onClick={handleCancel}
                aria-label="Cancel·lar edició"
              >
                Cancel·lar
              </button>

              <button
                className="intro-editor__action-btn intro-editor__action-btn--save"
                onClick={handleSave}
                disabled={!hasValidIntro || !isModified || isSaving}
                aria-label="Guardar intro"
              >
                <SaveIcon size={16} />
                {isSaving ? 'Guardant...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IntroEditor;
