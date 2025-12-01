import React from 'react';
import './LoadingScreen.css';

// Hermes logo icon
const HermesIcon = () => (
  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

function LoadingScreen({ progress }) {
  const percentage = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-logo">
          <HermesIcon />
          <h1 className="loading-title">Hermes</h1>
        </div>

        <div className="loading-progress-container">
          <div className="loading-progress-bar">
            <div
              className="loading-progress-fill"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="loading-progress-text">
            <span className="loading-message">{progress?.message || 'Carregant...'}</span>
            <span className="loading-percentage">{percentage}%</span>
          </div>
        </div>

        <div className="loading-dots">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
      </div>
    </div>
  );
}

export default LoadingScreen;
