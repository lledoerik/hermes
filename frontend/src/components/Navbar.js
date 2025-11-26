import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

function Navbar() {
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const navLinks = [
    { path: '/', label: 'Inici' },
    { path: '/series', label: 'Series' },
    { path: '/movies', label: 'Pel-licules' },
  ];

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // TODO: Implement search
      console.log('Searching:', searchQuery);
    }
  };

  return (
    <nav className="navbar glass-strong">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <span className="navbar-logo">H</span>
          <span className="navbar-title">Hermes</span>
        </Link>

        <div className="navbar-links">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`navbar-link ${location.pathname === link.path ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="navbar-actions">
          <form className={`search-form ${isSearchOpen ? 'open' : ''}`} onSubmit={handleSearch}>
            <input
              type="text"
              className="search-input"
              placeholder="Cercar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => !searchQuery && setIsSearchOpen(false)}
            />
            <button
              type="button"
              className="search-toggle"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
