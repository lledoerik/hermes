import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  MovieIcon,
  SeriesIcon,
  SearchIcon,
  PlusIcon,
  UserIcon
} from './icons';
import './BottomNav.css';

// Home icon component
const HomeIcon = ({ size = 24, className = '' }) => (
  <svg
    className={`icon icon-home ${className}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

function BottomNav() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  // Close search when navigating
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, [location.pathname]);

  // Check if should hide on player pages
  const isPlayerPage = location.pathname.startsWith('/player') ||
      location.pathname.startsWith('/watch') ||
      location.pathname.startsWith('/book/');

  const handleSearchClick = (e) => {
    e.preventDefault();
    setSearchOpen(true);
    // Focus the input after render
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleSearchClose = () => {
    setSearchOpen(false);
    setSearchQuery('');
  };

  const navItems = [
    { to: '/', icon: HomeIcon, label: 'Inici' },
    { to: '/movies', icon: MovieIcon, label: 'Pel·lis' },
    { to: '#search', icon: SearchIcon, label: 'Cerca', isCenter: true, onClick: handleSearchClick },
    { to: '/series', icon: SeriesIcon, label: 'Sèries' },
    {
      to: isAuthenticated ? '/watchlist' : '/login',
      icon: isAuthenticated ? PlusIcon : UserIcon,
      label: isAuthenticated ? 'Llista' : 'Entrar'
    }
  ];

  // Hide on player pages
  if (isPlayerPage) {
    return null;
  }

  return (
    <>
      {/* Search overlay */}
      {searchOpen && (
        <div className="bottom-nav-search-overlay" onClick={handleSearchClose}>
          <form
            className="bottom-nav-search-form"
            onSubmit={handleSearchSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <SearchIcon size={20} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Cerca pel·lícules, sèries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <button type="button" className="search-close-btn" onClick={handleSearchClose}>
              ✕
            </button>
          </form>
        </div>
      )}

      <nav className="bottom-nav">
        <div className="bottom-nav__container">
          {navItems.map((item) => (
            item.onClick ? (
              <button
                key={item.to}
                className={`bottom-nav__item ${item.isCenter ? 'bottom-nav__item--center' : ''}`}
                onClick={item.onClick}
              >
                <span className="bottom-nav__icon">
                  <item.icon size={item.isCenter ? 22 : 20} />
                </span>
                <span className="bottom-nav__label">{item.label}</span>
              </button>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `bottom-nav__item ${isActive ? 'active' : ''} ${item.isCenter ? 'bottom-nav__item--center' : ''}`
                }
              >
                <span className="bottom-nav__icon">
                  <item.icon size={item.isCenter ? 22 : 20} />
                </span>
                <span className="bottom-nav__label">{item.label}</span>
              </NavLink>
            )
          ))}
        </div>
      </nav>
    </>
  );
}

export default BottomNav;
