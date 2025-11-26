import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Navbar.css';

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const searchRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        if (!searchQuery) setSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchQuery]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

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
          <form
            ref={searchRef}
            className={`navbar-search ${searchExpanded ? 'expanded' : ''}`}
            onSubmit={handleSearch}
          >
            <input
              type="text"
              placeholder="Cercar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span
              className="search-icon"
              onClick={() => {
                if (searchExpanded && searchQuery) {
                  handleSearch({ preventDefault: () => {} });
                } else {
                  setSearchExpanded(!searchExpanded);
                }
              }}
            >
              🔍
            </span>
          </form>

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
