import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = (path) => location.pathname === path;

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="navbar-container">
        <div className="navbar-left">
          <Link to="/" className="navbar-logo">
            <img src="/img/hermes.jpeg" alt="Hermes" />
            <img src="/img/favico.ico" alt="" />
          </Link>

          <div className="navbar-links">
            <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
              Inici
            </Link>
            <Link to="/movies" className={`nav-link ${isActive('/movies') ? 'active' : ''}`}>
              Pel·lícules
            </Link>
            <Link to="/series" className={`nav-link ${isActive('/series') ? 'active' : ''}`}>
              Sèries
            </Link>
            <span className="nav-link" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
              Programes
            </span>
            <span className="nav-link" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
              Llibres
            </span>
          </div>
        </div>

        <div className="navbar-right">
          <div
            className="profile-menu-container"
            onMouseEnter={() => setShowProfile(true)}
            onMouseLeave={() => setShowProfile(false)}
          >
            <button className="profile-button">
              <span className="profile-avatar">H</span>
            </button>

            {showProfile && (
              <div className="profile-dropdown">
                <div className="profile-info">
                  <div className="profile-name">Hermes User</div>
                  <div className="profile-email">user@hermes.cat</div>
                </div>

                <div className="dropdown-divider"></div>

                <Link to="/admin" className="dropdown-item admin">
                  ⚙️ Administració
                </Link>
                <button className="dropdown-item">
                  📊 Estadístiques
                </button>

                <div className="dropdown-divider"></div>

                <button className="dropdown-item">
                  🎨 Preferències
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
