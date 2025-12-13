import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  MovieIcon,
  SeriesIcon,
  SearchIcon,
  WatchlistIcon,
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

  // Hide on player pages
  if (location.pathname.startsWith('/player') ||
      location.pathname.startsWith('/watch') ||
      location.pathname.startsWith('/book/')) {
    return null;
  }

  const navItems = [
    { to: '/', icon: HomeIcon, label: 'Inici' },
    { to: '/movies', icon: MovieIcon, label: 'Pel·lícules' },
    { to: '/search', icon: SearchIcon, label: 'Cerca', isCenter: true },
    { to: '/series', icon: SeriesIcon, label: 'Sèries' },
    {
      to: isAuthenticated ? '/watchlist' : '/login',
      icon: isAuthenticated ? WatchlistIcon : UserIcon,
      label: isAuthenticated ? 'Llista' : 'Entrar'
    }
  ];

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav__container">
        {navItems.map((item) => (
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
        ))}
      </div>
    </nav>
  );
}

export default BottomNav;
