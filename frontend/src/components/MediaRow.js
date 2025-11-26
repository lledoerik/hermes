import React, { useRef, useState } from 'react';
import MediaCard from './MediaCard';

const styles = {
  container: {
    marginBottom: '40px',
    position: 'relative',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '15px',
    paddingRight: '60px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  viewAll: {
    color: '#328492',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'color 0.3s',
    background: 'none',
    border: 'none',
  },
  rowWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    gap: '15px',
    overflowX: 'auto',
    scrollBehavior: 'smooth',
    paddingBottom: '10px',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '45px',
    height: '100%',
    background: 'linear-gradient(to right, rgba(15, 23, 42, 0.9), transparent)',
    border: 'none',
    cursor: 'pointer',
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    color: 'white',
    opacity: 0,
    transition: 'opacity 0.3s',
  },
  navButtonVisible: {
    opacity: 1,
  },
  navButtonRight: {
    right: 0,
    background: 'linear-gradient(to left, rgba(15, 23, 42, 0.9), transparent)',
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.5)',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
  },
};

function MediaRow({ title, items, type = 'series', icon, onViewAll }) {
  const rowRef = useRef(null);
  const [showLeftNav, setShowLeftNav] = useState(false);
  const [showRightNav, setShowRightNav] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  const handleScroll = () => {
    if (!rowRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
    setShowLeftNav(scrollLeft > 0);
    setShowRightNav(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (direction) => {
    if (!rowRef.current) return;
    const scrollAmount = rowRef.current.clientWidth * 0.8;
    rowRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  if (!items || items.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            {icon && <span>{icon}</span>}
            {title}
          </h2>
        </div>
        <div style={styles.emptyState}>
          <p>No hi ha contingut disponible</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={styles.container}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={styles.header}>
        <h2 style={styles.title}>
          {icon && <span>{icon}</span>}
          {title}
        </h2>
        {onViewAll && (
          <button style={styles.viewAll} onClick={onViewAll}>
            Veure tot →
          </button>
        )}
      </div>

      <div style={styles.rowWrapper}>
        <button
          style={{
            ...styles.navButton,
            left: 0,
            ...(showLeftNav && isHovered ? styles.navButtonVisible : {})
          }}
          onClick={() => scroll('left')}
        >
          ‹
        </button>

        <div
          ref={rowRef}
          style={styles.row}
          onScroll={handleScroll}
        >
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              type={type}
              width={180}
            />
          ))}
        </div>

        <button
          style={{
            ...styles.navButton,
            ...styles.navButtonRight,
            ...(showRightNav && isHovered ? styles.navButtonVisible : {})
          }}
          onClick={() => scroll('right')}
        >
          ›
        </button>
      </div>
    </div>
  );
}

export default MediaRow;
