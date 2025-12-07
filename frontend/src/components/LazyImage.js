import React, { useState, useEffect, useRef } from 'react';
import './LazyImage.css';

/**
 * Component LazyImage amb Intersection Observer i cache del navegador
 * Carrega les imatges només quan s'apropen al viewport
 *
 * @param {string} src - URL de la imatge
 * @param {string} alt - Text alternatiu
 * @param {function} onError - Callback quan la imatge falla
 * @param {function} onLoad - Callback quan la imatge carrega
 * @param {string} className - Classes CSS addicionals
 * @param {string} fallback - Element a mostrar si la imatge falla (opcional)
 * @param {number} rootMargin - Distància abans del viewport per començar a carregar (default: 100px)
 */
const LazyImage = ({
  src,
  alt,
  onError,
  onLoad,
  className = '',
  fallback = null,
  rootMargin = 100
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    // Si ja està visible, no cal observar
    if (isInView) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observerRef.current?.disconnect();
        }
      },
      {
        rootMargin: `${rootMargin}px`,
        threshold: 0
      }
    );

    if (imgRef.current) {
      observerRef.current.observe(imgRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [rootMargin, isInView]);

  // Reset loading/error state when src changes, però mantenir isInView
  // Això evita recalcular la visibilitat quan canvia la temporada
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
    // NO resetejar isInView - si ja estava visible, continua visible
  }, [src]);

  const handleLoad = () => {
    setIsLoaded(true);
    if (onLoad) onLoad();
  };

  const handleError = (e) => {
    setHasError(true);
    if (onError) onError(e);
  };

  if (hasError && fallback) {
    return fallback;
  }

  return (
    <div ref={imgRef} className={`lazy-image-container ${className}`}>
      {isInView ? (
        <img
          src={src}
          alt={alt}
          className={`lazy-image ${isLoaded ? 'loaded' : ''}`}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        <div className="lazy-image-placeholder" />
      )}
    </div>
  );
};

export default LazyImage;
