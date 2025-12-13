import React, { useRef, useState, useEffect, useCallback } from 'react';
import './CenterFocusCarousel.css';

/**
 * CenterFocusCarousel - Carousel amb scroll infinit i focus central
 *
 * Característiques:
 * - Scroll infinit (duplica elements per crear l'efecte)
 * - Element central més gran (scale)
 * - Drag-to-scroll amb momentum
 * - Snap-to-center quan es deixa anar
 * - Transicions fluides
 */
const CenterFocusCarousel = ({
  items,
  renderItem,
  itemWidth = 160,
  centerScale = 1.15,
  gap = 16,
  className = '',
  showFadeEdges = true,
}) => {
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [centerIndex, setCenterIndex] = useState(0);

  // Refs per al drag
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const velocity = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const animationFrame = useRef(null);
  const momentumFrame = useRef(null);

  // Triplicar items per scroll infinit
  const tripleItems = items.length > 0 ? [...items, ...items, ...items] : [];
  const originalLength = items.length;

  // Calcular quin element està al centre
  const updateCenterIndex = useCallback(() => {
    const track = trackRef.current;
    if (!track || items.length === 0) return;

    const containerWidth = track.parentElement.offsetWidth;
    const scrollCenter = track.scrollLeft + containerWidth / 2;
    const itemTotalWidth = itemWidth + gap;

    // Calcular l'índex de l'element més proper al centre
    let closestIndex = Math.round((scrollCenter - itemWidth / 2) / itemTotalWidth);
    closestIndex = Math.max(0, Math.min(closestIndex, tripleItems.length - 1));

    // Convertir a índex original (0 a items.length-1)
    const originalIndex = closestIndex % originalLength;

    if (originalIndex !== centerIndex) {
      setCenterIndex(originalIndex);
    }
  }, [items.length, itemWidth, gap, centerIndex, tripleItems.length, originalLength]);

  // Inicialitzar scroll al centre (grup del mig)
  useEffect(() => {
    const track = trackRef.current;
    if (!track || items.length === 0) return;

    const itemTotalWidth = itemWidth + gap;
    const containerWidth = track.parentElement.offsetWidth;

    // Centrar al grup del mig
    const middleGroupStart = originalLength * itemTotalWidth;
    const centerOffset = (containerWidth - itemWidth) / 2;

    track.scrollLeft = middleGroupStart - centerOffset;
    updateCenterIndex();
  }, [items.length, itemWidth, gap, originalLength, updateCenterIndex]);

  // Snap to center
  const snapToCenter = useCallback(() => {
    const track = trackRef.current;
    if (!track || items.length === 0) return;

    const containerWidth = track.parentElement.offsetWidth;
    const scrollCenter = track.scrollLeft + containerWidth / 2;
    const itemTotalWidth = itemWidth + gap;

    // Trobar l'element més proper al centre
    const closestIndex = Math.round((scrollCenter - itemWidth / 2) / itemTotalWidth);
    const targetScroll = closestIndex * itemTotalWidth - (containerWidth - itemWidth) / 2;

    // Animació suau cap al centre
    track.scrollTo({
      left: targetScroll,
      behavior: 'smooth'
    });
  }, [items.length, itemWidth, gap]);

  // Gestionar scroll infinit
  const handleInfiniteScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || items.length === 0) return;

    const itemTotalWidth = itemWidth + gap;
    const singleGroupWidth = originalLength * itemTotalWidth;

    // Si estem massa a l'esquerra, saltar al grup del mig
    if (track.scrollLeft < singleGroupWidth / 2) {
      track.scrollLeft += singleGroupWidth;
    }
    // Si estem massa a la dreta, saltar al grup del mig
    else if (track.scrollLeft > singleGroupWidth * 2) {
      track.scrollLeft -= singleGroupWidth;
    }
  }, [items.length, itemWidth, gap, originalLength]);

  // Mouse down
  const handleMouseDown = useCallback((e) => {
    const track = trackRef.current;
    if (!track) return;

    setIsDragging(true);
    startX.current = e.pageX;
    scrollLeft.current = track.scrollLeft;
    lastX.current = e.pageX;
    lastTime.current = Date.now();
    velocity.current = 0;

    // Cancel·lar animacions
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    if (momentumFrame.current) cancelAnimationFrame(momentumFrame.current);

    track.style.scrollBehavior = 'auto';
    track.style.cursor = 'grabbing';
  }, []);

  // Mouse move
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;

    const track = trackRef.current;
    if (!track) return;

    e.preventDefault();

    const x = e.pageX;
    const walk = (startX.current - x) * 1.2;

    // Calcular velocitat
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (x - lastX.current) / dt;
    }
    lastX.current = x;
    lastTime.current = now;

    track.scrollLeft = scrollLeft.current + walk;
    updateCenterIndex();
  }, [isDragging, updateCenterIndex]);

  // Mouse up - aplicar momentum i snap
  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;

    const track = trackRef.current;
    if (!track) return;

    setIsDragging(false);
    track.style.cursor = 'grab';

    // Aplicar momentum
    const applyMomentum = () => {
      if (Math.abs(velocity.current) > 0.1) {
        track.scrollLeft -= velocity.current * 16;
        velocity.current *= 0.95; // Fricció
        updateCenterIndex();
        handleInfiniteScroll();
        momentumFrame.current = requestAnimationFrame(applyMomentum);
      } else {
        // Quan el momentum s'acaba, fer snap al centre
        snapToCenter();
      }
    };

    if (Math.abs(velocity.current) > 0.5) {
      applyMomentum();
    } else {
      snapToCenter();
    }
  }, [isDragging, snapToCenter, updateCenterIndex, handleInfiniteScroll]);

  // Touch events
  const handleTouchStart = useCallback((e) => {
    const track = trackRef.current;
    if (!track) return;

    setIsDragging(true);
    startX.current = e.touches[0].pageX;
    scrollLeft.current = track.scrollLeft;
    lastX.current = e.touches[0].pageX;
    lastTime.current = Date.now();
    velocity.current = 0;

    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    if (momentumFrame.current) cancelAnimationFrame(momentumFrame.current);

    track.style.scrollBehavior = 'auto';
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;

    const track = trackRef.current;
    if (!track) return;

    const x = e.touches[0].pageX;
    const walk = (startX.current - x) * 1.2;

    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (x - lastX.current) / dt;
    }
    lastX.current = x;
    lastTime.current = now;

    track.scrollLeft = scrollLeft.current + walk;
    updateCenterIndex();
  }, [isDragging, updateCenterIndex]);

  const handleTouchEnd = useCallback(() => {
    handleMouseUp();
  }, [handleMouseUp]);

  // Scroll event per actualitzar center i infinite scroll
  const handleScroll = useCallback(() => {
    updateCenterIndex();
    handleInfiniteScroll();
  }, [updateCenterIndex, handleInfiniteScroll]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      if (momentumFrame.current) cancelAnimationFrame(momentumFrame.current);
    };
  }, []);

  // Event listeners globals per mouse up/leave
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('mouseleave', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mouseleave', handleGlobalMouseUp);
    };
  }, [isDragging, handleMouseUp]);

  if (items.length === 0) return null;

  return (
    <div className={`center-carousel ${className} ${showFadeEdges ? 'show-fade' : ''}`}>
      <div
        ref={trackRef}
        className={`center-carousel__track ${isDragging ? 'dragging' : ''}`}
        style={{
          gap: `${gap}px`,
          '--item-width': `${itemWidth}px`,
          '--center-scale': centerScale,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onScroll={handleScroll}
      >
        {tripleItems.map((item, index) => {
          const originalIndex = index % originalLength;
          const isCenter = originalIndex === centerIndex;

          return (
            <div
              key={`carousel-item-${index}`}
              className={`center-carousel__item ${isCenter ? 'is-center' : ''}`}
              style={{ width: `${itemWidth}px` }}
            >
              {renderItem(item, originalIndex, isCenter)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CenterFocusCarousel;
