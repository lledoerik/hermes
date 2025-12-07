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

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: `${rootMargin}px`,
        threshold: 0
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [rootMargin]);

  // Reset state when src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
    setIsInView(false);
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
