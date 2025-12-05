import React from 'react';
import './LoadingScreen.css';

function LoadingScreen({ progress }) {
  const percentage = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="startup-loading-screen">
      <div className="startup-loading-content">
        <div className="startup-loading-logo">
          <img src="/img/hermes.png" alt="Hermes" className="startup-hermes-logo" />
        </div>

        <div className="startup-progress-container">
          <div className="startup-progress-bar">
            <div
              className="startup-progress-fill"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <div className="startup-loading-dots">
          <span className="startup-dot"></span>
          <span className="startup-dot"></span>
          <span className="startup-dot"></span>
        </div>
      </div>
    </div>
  );
}

export default LoadingScreen;
