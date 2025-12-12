import React, { useState, useEffect } from 'react';
import { FastForwardIcon } from '../icons';
import './SkipIntroButton.css';

/**
 * SkipIntroButton - Botó per saltar la intro (estil Netflix)
 * Apareix automàticament quan s'està reproduint la intro amb delay configurable
 */
function SkipIntroButton({
  introStart,
  introEnd,
  currentTime,
  onSkip,
  delay = 1500 // ms de delay abans de mostrar (UX natural)
}) {
  const [visible, setVisible] = useState(false);
  const [delayedVisible, setDelayedVisible] = useState(false);

  useEffect(() => {
    // Comprovar si estem dins del rang de la intro
    const isInIntro = currentTime >= introStart && currentTime <= introEnd;
    setVisible(isInIntro);

    // Si estem a la intro, afegir el delay abans de mostrar
    if (isInIntro && !delayedVisible) {
      const timer = setTimeout(() => {
        setDelayedVisible(true);
      }, delay);

      return () => clearTimeout(timer);
    }

    // Si sortim de la intro, amagar immediatament
    if (!isInIntro && delayedVisible) {
      setDelayedVisible(false);
    }
  }, [currentTime, introStart, introEnd, delay, delayedVisible]);

  if (!visible || !delayedVisible) return null;

  return (
    <button
      className="skip-intro-button"
      onClick={onSkip}
      aria-label="Saltar intro"
    >
      <FastForwardIcon size={20} />
      <span>Saltar intro</span>
    </button>
  );
}

export default SkipIntroButton;
