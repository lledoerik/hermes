import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import './SeasonSelector.css';

/**
 * SeasonSelector - Selector de temporades amb scroll horitzontal
 * Suporta drag-to-scroll per millor UX en mòbil i desktop
 */
function SeasonSelector({ seasons, selectedSeason, onSeasonSelect }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isMouseDown = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  // Comprovar si pot fer scroll
  const checkScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;

    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };

  useEffect(() => {
    checkScrollButtons();
    window.addEventListener('resize', checkScrollButtons);
    return () => window.removeEventListener('resize', checkScrollButtons);
  }, [seasons]);

  // Scroll suau amb botons
  const scrollBy = (direction) => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollAmount = 300;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Drag-to-scroll handlers
  const handleDragStart = (e) => {
    isMouseDown.current = true;
    dragStartX.current = e.pageX - scrollRef.current.offsetLeft;
    dragScrollLeft.current = scrollRef.current.scrollLeft;
  };

  const handleDragMove = (e) => {
    if (!isMouseDown.current) return;
    e.preventDefault();
    setIsDragging(true);

    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - dragStartX.current) * 2; // Multiplicador de velocitat
    scrollRef.current.scrollLeft = dragScrollLeft.current - walk;
  };

  const handleDragEnd = () => {
    isMouseDown.current = false;
    // Delay per evitar que el click dispari després del drag
    setTimeout(() => setIsDragging(false), 100);
  };

  const handleSeasonClick = (seasonNumber) => {
    if (!isDragging) {
      onSeasonSelect(seasonNumber);
    }
  };

  if (!seasons || seasons.length === 0) {
    return null;
  }

  return (
    <div className={`season-selector ${canScrollLeft ? 'can-scroll-left' : ''} ${canScrollRight ? 'can-scroll-right' : ''}`}>
      {/* Botó scroll esquerra */}
      {canScrollLeft && (
        <button
          className="season-selector__scroll-btn season-selector__scroll-btn--left"
          onClick={() => scrollBy('left')}
          aria-label="Scroll a l'esquerra"
        >
          <ChevronLeftIcon />
        </button>
      )}

      {/* Llista de temporades */}
      <div
        className={`season-selector__container ${isDragging ? 'dragging' : ''}`}
        ref={scrollRef}
        onScroll={checkScrollButtons}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <div className="season-selector__list">
          {seasons.map((season) => (
            <button
              key={season.id || `tmdb-season-${season.season_number}`}
              className={`season-selector__btn ${
                selectedSeason === season.season_number ? 'active' : ''
              } ${season.isArc ? 'arc' : ''} ${season.bbc_available ? 'bbc-available' : ''}`}
              onClick={() => handleSeasonClick(season.season_number)}
              title={
                season.isArc
                  ? `${season.name} (Ep. ${season.tmdb_start}-${season.tmdb_end})`
                  : `Temporada ${season.season_number}`
              }
              aria-label={
                season.isArc
                  ? `${season.name}`
                  : `Temporada ${season.season_number}`
              }
            >
              {season.isArc ? season.name : `Temporada ${season.season_number}`}
              {season.bbc_available && (
                <span className="season-selector__badge">BBC</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Botó scroll dreta */}
      {canScrollRight && (
        <button
          className="season-selector__scroll-btn season-selector__scroll-btn--right"
          onClick={() => scrollBy('right')}
          aria-label="Scroll a la dreta"
        >
          <ChevronRightIcon />
        </button>
      )}
    </div>
  );
}

export default SeasonSelector;
