import React from 'react';
import './SkeletonLoader.css';

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card__poster"></div>
      <div className="skeleton skeleton-card__title"></div>
      <div className="skeleton skeleton-card__meta"></div>
    </div>
  );
}

export function SkeletonText({ size = 'base', width = '100%' }) {
  const className = `skeleton skeleton-text${size !== 'base' ? ` skeleton-text--${size}` : ''}`;
  return <div className={className} style={{ width }}></div>;
}

export function SkeletonTitle({ width = '200px' }) {
  return <div className="skeleton skeleton-title" style={{ width }}></div>;
}

export function SkeletonRow({ cardCount = 6 }) {
  return (
    <div className="skeleton-row">
      <div className="skeleton skeleton-row__title"></div>
      <div className="skeleton-row__cards">
        {Array.from({ length: cardCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonCircle({ size = 40 }) {
  return (
    <div
      className="skeleton skeleton-circle"
      style={{ width: `${size}px`, height: `${size}px` }}
    ></div>
  );
}

export default {
  Card: SkeletonCard,
  Text: SkeletonText,
  Title: SkeletonTitle,
  Row: SkeletonRow,
  Circle: SkeletonCircle,
};
