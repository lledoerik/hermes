import React, { useState, useEffect, useCallback } from 'react';
import './TitleAudioPlayer.css';

// Icona d'altaveu
const SpeakerIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
  </svg>
);

// Icona d'aturar
const StopIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="1"></rect>
  </svg>
);

/**
 * Component per reproduir el títol amb Text-to-Speech
 * Utilitza la Web Speech API nativa del navegador
 */
const TitleAudioPlayer = ({
  title,
  language = 'ca-ES', // Per defecte en català
  size = 'medium',
  showLabel = false,
  className = ''
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  // Comprovar si el navegador suporta TTS
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setIsSupported(false);
    }
  }, []);

  // Aturar la reproducció quan el component es desmunta
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Funció per reproduir el títol
  const playTitle = useCallback(() => {
    if (!title || !isSupported) return;

    // Si ja s'està reproduint, aturem
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    // Cancel·lar qualsevol reproducció anterior
    window.speechSynthesis.cancel();

    // Crear l'utterance (missatge de veu)
    const utterance = new SpeechSynthesisUtterance(title);

    // Configurar l'idioma
    utterance.lang = language;
    utterance.rate = 0.9; // Velocitat lleugerament més lenta per claredat
    utterance.pitch = 1;
    utterance.volume = 1;

    // Intentar trobar una veu per a l'idioma especificat
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => voice.lang.startsWith(language.split('-')[0]));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    // Events
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    // Reproduir
    window.speechSynthesis.speak(utterance);
  }, [title, language, isPlaying, isSupported]);

  // Si el navegador no suporta TTS, no mostrem res
  if (!isSupported) {
    return null;
  }

  const sizeClass = `title-audio-player--${size}`;

  return (
    <button
      className={`title-audio-player ${sizeClass} ${isPlaying ? 'title-audio-player--playing' : ''} ${className}`}
      onClick={playTitle}
      title={isPlaying ? 'Aturar reproducció' : 'Escoltar títol'}
      aria-label={isPlaying ? 'Aturar reproducció' : `Escoltar: ${title}`}
    >
      {isPlaying ? (
        <StopIcon size={size === 'small' ? 16 : size === 'large' ? 24 : 20} />
      ) : (
        <SpeakerIcon size={size === 'small' ? 16 : size === 'large' ? 24 : 20} />
      )}
      {showLabel && (
        <span className="title-audio-player__label">
          {isPlaying ? 'Aturar' : 'Escoltar'}
        </span>
      )}
    </button>
  );
};

export default TitleAudioPlayer;
