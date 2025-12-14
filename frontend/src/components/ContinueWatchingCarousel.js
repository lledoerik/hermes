import React, { useRef, useState, useEffect, useCallback } from 'react';
import './ContinueWatchingCarousel.css';

/**
 * ContinueWatchingCarousel - Carousel amb scroll infinit
 *
 * - Mostra ~5 elements visibles a la vegada
 * - Scroll infinit (triplicar elements) per poder navegar per tots
 * - El més recent sempre al centre inicialment
 * - Element central destacat amb scale
 * - Drag-to-scroll amb momentum
 */
const ContinueWatchingCarousel = ({
  items,
  renderItem,
  itemWidth = 200,
  centerScale = 1.15,
  gap = 16,
  className = '',
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
  const momentumFrame = useRef(null);

  const originalLength = items.length;

  // Triplicar per scroll infinit
  const tripleItems = originalLength > 0 ? [...items, ...items, ...items] : [];

  // Calcular quin element està al centre
  const updateCenterIndex = useCallback(() => {
    const track = trackRef.current;
    if (!track || originalLength === 0) return;

    const containerWidth = track.parentElement.offsetWidth;
    const scrollCenter = track.scrollLeft + containerWidth / 2;
    const itemTotalWidth = itemWidth + gap;

    let closestIndex = Math.round((scrollCenter - itemWidth / 2) / itemTotalWidth);
    closestIndex = Math.max(0, Math.min(closestIndex, tripleItems.length - 1));

    // Convertir a índex original (0 a originalLength-1)
    const originalIndex = closestIndex % originalLength;

    if (originalIndex !== centerIndex) {
      setCenterIndex(originalIndex);
    }
  }, [originalLength, itemWidth, gap, centerIndex, tripleItems.length]);

  // Inicialitzar scroll al centre (grup del mig, primer element = més recent)
  useEffect(() => {
    const track = trackRef.current;
    if (!track || originalLength === 0) return;

    const itemTotalWidth = itemWidth + gap;
    const containerWidth = track.parentElement.offsetWidth;

    // Començar al grup del mig, índex 0 (el més recent)
    const middleGroupStart = originalLength * itemTotalWidth;
    const centerOffset = (containerWidth - itemWidth) / 2;

    track.scrollLeft = middleGroupStart - centerOffset;
    setCenterIndex(0);
  }, [originalLength, itemWidth, gap]);

  // Gestionar scroll infinit
  const handleInfiniteScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || originalLength === 0) return;

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
  }, [originalLength, itemWidth, gap]);

  // Snap to nearest item
  const snapToCenter = useCallback(() => {
    const track = trackRef.current;
    if (!track || originalLength === 0) return;

    const containerWidth = track.parentElement.offsetWidth;
    const scrollCenter = track.scrollLeft + containerWidth / 2;
    const itemTotalWidth = itemWidth + gap;

    const closestIndex = Math.round((scrollCenter - itemWidth / 2) / itemTotalWidth);
    const targetScroll = closestIndex * itemTotalWidth - (containerWidth - itemWidth) / 2;

    track.scrollTo({
      left: targetScroll,
      behavior: 'smooth'
    });
  }, [originalLength, itemWidth, gap]);

  // Mouse handlers
  const handleMouseDown = useCallback((e) => {
    const track = trackRef.current;
    if (!track) return;

    setIsDragging(true);
    startX.current = e.pageX;
    scrollLeft.current = track.scrollLeft;
    lastX.current = e.pageX;
    lastTime.current = Date.now();
    velocity.current = 0;

    if (momentumFrame.current) cancelAnimationFrame(momentumFrame.current);
    track.style.scrollBehavior = 'auto';
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;

    const track = trackRef.current;
    if (!track) return;

    e.preventDefault();
    const x = e.pageX;
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

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;

    const track = trackRef.current;
    if (!track) return;

    setIsDragging(false);

    const applyMomentum = () => {
      if (Math.abs(velocity.current) > 0.1) {
        track.scrollLeft -= velocity.current * 16;
        velocity.current *= 0.95;
        updateCenterIndex();
        handleInfiniteScroll();
        momentumFrame.current = requestAnimationFrame(applyMomentum);
      } else {
        snapToCenter();
      }
    };

    if (Math.abs(velocity.current) > 0.5) {
      applyMomentum();
    } else {
      snapToCenter();
    }
  }, [isDragging, snapToCenter, updateCenterIndex, handleInfiniteScroll]);

  // Touch handlers
  const handleTouchStart = useCallback((e) => {
    const track = trackRef.current;
    if (!track) return;

    setIsDragging(true);
    startX.current = e.touches[0].pageX;
    scrollLeft.current = track.scrollLeft;
    lastX.current = e.touches[0].pageX;
    lastTime.current = Date.now();
    velocity.current = 0;

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

  const handleScroll = useCallback(() => {
    updateCenterIndex();
    handleInfiniteScroll();
  }, [updateCenterIndex, handleInfiniteScroll]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (momentumFrame.current) cancelAnimationFrame(momentumFrame.current);
    };
  }, []);

  // Global mouse up
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) handleMouseUp();
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, handleMouseUp]);

  if (originalLength === 0) return null;

  return (
    <div className={`continue-carousel ${className}`}>
      <div
        ref={trackRef}
        className={`continue-carousel__track ${isDragging ? 'dragging' : ''}`}
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
          // Calculate distance considering the tripled array
          const distanceFromCenter = Math.min(
            Math.abs(index - (originalLength + centerIndex)),
            Math.abs(index - centerIndex),
            Math.abs(index - (2 * originalLength + centerIndex))
          );
          const isAdjacent = distanceFromCenter === 1;

          return (
            <div
              key={`continue-item-${index}`}
              className={`continue-carousel__item ${isCenter ? 'is-center' : ''} ${isAdjacent ? 'is-adjacent' : ''}`}
              style={{ width: `${itemWidth}px` }}
            >
              {renderItem(item, index, isCenter)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ContinueWatchingCarousel;
