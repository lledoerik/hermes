import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  SettingsIcon,
  StatsIcon,
  PreferencesIcon,
  LogoutIcon,
  LoginIcon,
  WatchlistIcon,
  SearchIcon,
  CloseIcon
} from './icons';
import './Navbar.css';

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  // Determinar el tipus de cerca segons la pàgina actual
  const getSearchType = () => {
    if (location.pathname === '/movies' || location.pathname.startsWith('/movies/')) {
      return 'movies';
    }
    if (location.pathname === '/series' || location.pathname.startsWith('/series/')) {
      return 'series';
    }
    return 'all'; // Inici o altres pàgines
  };

  const searchType = getSearchType();

  const getSearchPlaceholder = () => {
    switch (searchType) {
      case 'movies':
        return 'Cerca pel·lícules...';
      case 'series':
        return 'Cerca sèries...';
      default:
        return 'Cercar...';
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navegar a la pàgina de cerca amb el tipus
      const searchParams = new URLSearchParams();
      searchParams.set('q', searchQuery.trim());
      if (searchType !== 'all') {
        searchParams.set('type', searchType);
      }
      navigate(`/search?${searchParams.toString()}`);
      setSearchQuery('');
      setSearchExpanded(false);
    }
  };

  const handleSearchToggle = () => {
    setSearchExpanded(!searchExpanded);
    if (!searchExpanded) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

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
          {/* Barra de cerca - visible excepte a l'inici sense sessió */}
          {(location.pathname !== '/' || isAuthenticated) && (
            <form className={`navbar-search-box ${searchExpanded ? 'expanded' : ''}`} onSubmit={handleSearch}>
              <SearchIcon size={18} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={getSearchPlaceholder()}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchExpanded(true)}
                onBlur={() => !searchQuery && setSearchExpanded(false)}
              />
              {searchQuery && (
                <button type="button" className="clear-search" onClick={clearSearch}>
                  <CloseIcon size={14} />
                </button>
              )}
            </form>
          )}

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
