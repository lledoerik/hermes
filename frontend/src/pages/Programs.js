import React from 'react';
import './Programs.css';

// SVG Icons
const ExternalLinkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15 3 21 3 21 9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>
);

const TvIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

// Programes destacats de 3Cat
const FEATURED_PROGRAMS = [
  {
    id: 'polonia',
    name: 'Polònia',
    description: 'Sàtira política amb imitacions dels personatges més destacats',
    image: 'https://statics.3cat.cat/multimedia/jpg/9/1/1699954684819.jpg',
    url: 'https://www.3cat.cat/3cat/polonia/'
  },
  {
    id: 'telenoticies',
    name: 'Telenotícies',
    description: 'Informatiu de referència de la televisió catalana',
    image: 'https://statics.3cat.cat/multimedia/jpg/5/0/1697017994305.jpg',
    url: 'https://www.3cat.cat/3cat/telenoticies/'
  },
  {
    id: 'apm',
    name: 'APM?',
    description: 'El millor de la televisió amb humor',
    image: 'https://statics.3cat.cat/multimedia/jpg/6/4/1697017895746.jpg',
    url: 'https://www.3cat.cat/3cat/apm/'
  },
  {
    id: 'criatures',
    name: 'Crims',
    description: 'Docusèrie sobre casos criminals reals',
    image: 'https://statics.3cat.cat/multimedia/jpg/3/9/1697017843593.jpg',
    url: 'https://www.3cat.cat/3cat/crims/'
  },
  {
    id: 'elsuperchef',
    name: 'El Superxef',
    description: 'Competició culinària amb talent català',
    image: 'https://statics.3cat.cat/multimedia/jpg/8/0/1697017790408.jpg',
    url: 'https://www.3cat.cat/3cat/el-superxef/'
  },
  {
    id: 'fora-de-joc',
    name: 'Fora de Joc',
    description: "Debat esportiu amb els millors analistes",
    image: 'https://statics.3cat.cat/multimedia/jpg/1/2/1697017747321.jpg',
    url: 'https://www.3cat.cat/3cat/fora-de-joc/'
  }
];

const CATEGORIES = [
  { id: 'tots', name: 'Tots els programes', url: 'https://www.3cat.cat/3cat/programes/' },
  { id: 'series', name: 'Sèries', url: 'https://www.3cat.cat/3cat/series/' },
  { id: 'pelis', name: 'Pel·lícules', url: 'https://www.3cat.cat/3cat/cinema/' },
  { id: 'documentals', name: 'Documentals', url: 'https://www.3cat.cat/3cat/documentals/' },
  { id: 'info', name: 'Informatius', url: 'https://www.3cat.cat/3cat/informatius/' },
  { id: 'infantil', name: 'Infantil', url: 'https://www.3cat.cat/3cat/sx3/' }
];

function Programs() {
  const openExternal = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="programs-page">
      {/* Hero Section */}
      <section className="programs-hero">
        <div className="programs-hero-content">
          <div className="programs-logo">
            <img src="https://www.3cat.cat/statics/images/favicons/tv3/apple-touch-icon-180x180.png" alt="3Cat" />
          </div>
          <h1>Programes 3Cat</h1>
          <p className="programs-hero-subtitle">
            Tot el contingut de la televisió pública catalana: sèries, pel·lícules, documentals i molt més.
            Contingut 100% legal i gratuït.
          </p>
          <button
            className="programs-cta-btn"
            onClick={() => openExternal('https://www.3cat.cat')}
          >
            Visita 3Cat.cat <ExternalLinkIcon />
          </button>
        </div>
      </section>

      {/* Categories */}
      <section className="programs-categories">
        <h2>Categories</h2>
        <div className="categories-grid">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className="category-card"
              onClick={() => openExternal(cat.url)}
            >
              <span>{cat.name}</span>
              <ExternalLinkIcon />
            </button>
          ))}
        </div>
      </section>

      {/* Featured Programs */}
      <section className="programs-featured">
        <h2>Programes destacats</h2>
        <div className="featured-grid">
          {FEATURED_PROGRAMS.map(program => (
            <div
              key={program.id}
              className="featured-card"
              onClick={() => openExternal(program.url)}
            >
              <div className="featured-image">
                <img
                  src={program.image}
                  alt={program.name}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="featured-placeholder" style={{ display: 'none' }}>
                  <TvIcon />
                </div>
                <div className="featured-overlay">
                  <span>Veure a 3Cat</span>
                  <ExternalLinkIcon />
                </div>
              </div>
              <div className="featured-info">
                <h3>{program.name}</h3>
                <p>{program.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Info Section */}
      <section className="programs-info">
        <div className="info-card">
          <TvIcon />
          <h3>Per què 3Cat?</h3>
          <p>
            3Cat és la plataforma de streaming de la Corporació Catalana de Mitjans Audiovisuals (CCMA).
            Ofereix tot el contingut de TV3, 3/24, 33, SX3 i Esport3 de forma gratuïta.
          </p>
          <ul>
            <li>Més de 75.000 vídeos disponibles</li>
            <li>Contingut en català</li>
            <li>100% legal i gratuït</li>
            <li>Sèries, pel·lícules, documentals i informatius</li>
          </ul>
          <button
            className="info-btn"
            onClick={() => openExternal('https://www.3cat.cat')}
          >
            Descobreix 3Cat <ExternalLinkIcon />
          </button>
        </div>
      </section>
    </div>
  );
}

export default Programs;
