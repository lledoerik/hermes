import React, { useState, useEffect, useRef } from 'react';
import './LazyImage.css';

// Cache global d'imatges ja carregades per evitar parpelleig
const loadedImagesCache = new Set();

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
  // Si la imatge ja està al cache, marcar-la com carregada immediatament
  const isAlreadyCached = src && loadedImagesCache.has(src);
  const [isLoaded, setIsLoaded] = useState(isAlreadyCached);
  const [isInView, setIsInView] = useState(isAlreadyCached); // Si ja està cached, mostrar directament
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);
  const prevSrcRef = useRef(src);
  // Ref per recordar si la imatge s'ha carregat amb èxit (per evitar parpelleig en re-renders)
  const wasLoadedRef = useRef(isAlreadyCached);

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

  // Reset loading/error state NOMÉS quan src realment canvia
  useEffect(() => {
    // Si src no ha canviat, no fer res (evita resets innecessaris en re-renders)
    if (prevSrcRef.current === src) {
      return;
    }
    prevSrcRef.current = src;

    if (src && loadedImagesCache.has(src)) {
      // Imatge ja carregada abans - mostrar immediatament sense transició
      setIsLoaded(true);
      setIsInView(true);
      setHasError(false);
      wasLoadedRef.current = true;
    } else {
      // Nova imatge - fer el procés normal de càrrega
      setIsLoaded(false);
      setHasError(false);
      wasLoadedRef.current = false;
      // NO resetejar isInView - si ja estava visible, continua visible
    }
  }, [src]);

  const handleLoad = () => {
    setIsLoaded(true);
    wasLoadedRef.current = true;
    // Afegir al cache global perquè no parpellegi en futures renderitzacions
    if (src) {
      loadedImagesCache.add(src);
    }
    if (onLoad) onLoad();
  };

  const handleError = (e) => {
    setHasError(true);
    if (onError) onError(e);
  };

  if (hasError && fallback) {
    return fallback;
  }

  // Determinar classe CSS: si ja estava cached o ja s'ha carregat, usar 'cached' per evitar transicions
  const imageClass = (isAlreadyCached || wasLoadedRef.current)
    ? 'lazy-image cached'
    : `lazy-image ${isLoaded ? 'loaded' : ''}`;

  return (
    <div ref={imgRef} className={`lazy-image-container ${className}`}>
      {isInView ? (
        <img
          src={src}
          alt={alt}
          className={imageClass}
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
