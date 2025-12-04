import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  SettingsIcon,
  StatsIcon,
  PreferencesIcon,
  LogoutIcon,
  LoginIcon,
  WatchlistIcon
} from './icons';
import './Navbar.css';

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = () => {
    logout();
    setShowProfile(false);
    navigate('/');
  };

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
            {user?.is_admin ? (
              <>
                <Link to="/programs" className={`nav-link ${isActive('/programs') ? 'active' : ''}`}>
                  Programes
                </Link>
                <Link to="/books" className={`nav-link ${isActive('/books') ? 'active' : ''}`}>
                  Llibres
                </Link>
                <Link to="/audiobooks" className={`nav-link ${isActive('/audiobooks') ? 'active' : ''}`}>
                  Audiollibres
                </Link>
                <Link to="/tv" className={`nav-link ${isActive('/tv') ? 'active' : ''}`}>
                  Televisió
                </Link>
              </>
            ) : (
              <>
                <span className="nav-link disabled">Programes</span>
                <span className="nav-link disabled">Llibres</span>
                <span className="nav-link disabled">Audiollibres</span>
                <span className="nav-link disabled">Televisió</span>
              </>
            )}
          </div>
        </div>

        <div className="navbar-right">
          {isAuthenticated ? (
            <div
              className="profile-menu-container"
              onMouseEnter={() => setShowProfile(true)}
              onMouseLeave={() => setShowProfile(false)}
            >
              <button className="profile-button">
                <span className={`navbar-avatar ${user?.avatar ? 'has-image' : ''}`}>
                  {user?.avatar ? (
                    <img src={user.avatar} alt="Avatar" />
                  ) : (
                    user?.display_name?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase() || 'U'
                  )}
                </span>
              </button>

              {showProfile && (
                <div className="profile-dropdown">
                  <div className="profile-info">
                    <div className="profile-name">{user?.display_name || user?.username}</div>
                    <div className="profile-email">{user?.email || 'Sense email'}</div>
                  </div>

                  <div className="dropdown-divider"></div>

                  {user?.is_admin && (
                    <Link to="/admin" className="dropdown-item admin">
                      <SettingsIcon /> Administració
                    </Link>
                  )}
                  <button className="dropdown-item">
                    <StatsIcon /> Estadístiques
                  </button>

                  <div className="dropdown-divider"></div>

                  <Link to="/watchlist" className="dropdown-item">
                    <WatchlistIcon /> La meva llista
                  </Link>
                  <Link to="/profile" className="dropdown-item">
                    <PreferencesIcon /> El meu perfil
                  </Link>
                  <button className="dropdown-item logout" onClick={handleLogout}>
                    <LogoutIcon /> Tancar sessió
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="login-button-nav">
              <LoginIcon />
              <span>Iniciar sessió</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
