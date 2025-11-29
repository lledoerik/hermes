import React, { useState } from 'react';
import './TV.css';

// SVG Icons
const PlayIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const LiveIcon = () => (
  <span className="live-dot"></span>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const VolumeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
  </svg>
);

// Canals de TV - URLs actualitzades de TDTChannels (GitHub)
const TV_CHANNELS = [
  // 3Cat - Televisió de Catalunya
  {
    id: 'tv3',
    name: 'TV3',
    description: 'La televisió de Catalunya',
    logo: 'https://www.3cat.cat/statics/images/favicons/tv3/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/tv3-hls/master.m3u8',
    category: '3cat',
    hd: true
  },
  {
    id: '324',
    name: '3/24',
    description: 'Canal de notícies 24 hores',
    logo: 'https://www.3cat.cat/statics/images/favicons/324/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/canal324-hls/master.m3u8',
    category: '3cat',
    hd: true
  },
  {
    id: '33',
    name: '33',
    description: 'Canal cultural i de documentals',
    logo: 'https://www.3cat.cat/statics/images/favicons/c33/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/c33-hls/master.m3u8',
    category: '3cat',
    hd: true
  },
  {
    id: 'sx3',
    name: 'SX3',
    description: 'Canal infantil i juvenil',
    logo: 'https://www.3cat.cat/statics/images/favicons/sx3/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/sx3-hls/master.m3u8',
    category: '3cat',
    hd: true
  },
  {
    id: 'esport3',
    name: 'Esport3',
    description: 'Canal esportiu',
    logo: 'https://www.3cat.cat/statics/images/favicons/esport3/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/esport3-hls/master.m3u8',
    category: '3cat',
    hd: true
  },
  {
    id: 'bondia',
    name: 'Bon Dia TV',
    description: 'Informació i actualitat',
    logo: 'https://www.3cat.cat/statics/images/favicons/324/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/bondia-hls/master.m3u8',
    category: '3cat',
    hd: false
  },
  // 3Cat FAST Channels
  {
    id: '3cat-bunquer',
    name: '3Cat El Búnquer',
    description: 'Canal temàtic',
    logo: 'https://www.3cat.cat/statics/images/favicons/tv3/apple-touch-icon-180x180.png',
    streamUrl: 'https://fast-tailor.3catdirectes.cat/v1/channel/bunquer/hls.m3u8',
    category: '3cat-fast',
    hd: false
  },
  {
    id: '3cat-platsbruts',
    name: '3Cat Plats Bruts',
    description: 'Sèrie clàssica',
    logo: 'https://www.3cat.cat/statics/images/favicons/tv3/apple-touch-icon-180x180.png',
    streamUrl: 'https://fast-tailor.3catdirectes.cat/v1/channel/ccma-channel2/hls.m3u8',
    category: '3cat-fast',
    hd: false
  },
  // RTVE
  {
    id: 'la1',
    name: 'La 1',
    description: 'Primer canal de TVE',
    logo: 'https://www.rtve.es/favicon.ico',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1688877.m3u8',
    category: 'rtve',
    hd: true
  },
  {
    id: 'la2',
    name: 'La 2',
    description: 'Segon canal de TVE',
    logo: 'https://www.rtve.es/favicon.ico',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1688885.m3u8',
    category: 'rtve',
    hd: true
  },
  {
    id: '24h',
    name: '24 Horas',
    description: 'Canal de notícies RTVE',
    logo: 'https://www.rtve.es/favicon.ico',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1694255.m3u8',
    category: 'rtve',
    hd: true
  },
  {
    id: 'clan',
    name: 'Clan',
    description: 'Canal infantil RTVE',
    logo: 'https://www.rtve.es/favicon.ico',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1688893.m3u8',
    category: 'rtve',
    hd: true
  },
  {
    id: 'teledeporte',
    name: 'Teledeporte',
    description: 'Canal esportiu RTVE',
    logo: 'https://www.rtve.es/favicon.ico',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1712972.m3u8',
    category: 'rtve',
    hd: true
  }
];

// Emissores de ràdio
const RADIO_CHANNELS = [
  {
    id: 'catradio',
    name: 'Catalunya Ràdio',
    description: "L'emissora nacional de Catalunya",
    logo: 'https://www.3cat.cat/statics/images/favicons/catradio/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/catradio-hls/master.m3u8',
    category: 'catradio'
  },
  {
    id: 'catinfo',
    name: 'Catalunya Informació',
    description: 'Notícies les 24 hores',
    logo: 'https://www.3cat.cat/statics/images/favicons/catradio/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/catinfo-hls/master.m3u8',
    category: 'catradio'
  },
  {
    id: 'catmusica',
    name: 'Catalunya Música',
    description: 'Música clàssica i jazz',
    logo: 'https://www.3cat.cat/statics/images/favicons/catradio/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/catmusica-hls/master.m3u8',
    category: 'catradio'
  },
  {
    id: 'icat',
    name: 'iCat',
    description: 'Música alternativa i cultura',
    logo: 'https://www.3cat.cat/statics/images/favicons/catradio/apple-touch-icon-180x180.png',
    streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/icat-hls/master.m3u8',
    category: 'catradio'
  },
  {
    id: 'rne1',
    name: 'RNE 1',
    description: 'Radio Nacional de España',
    logo: 'https://www.rtve.es/favicon.ico',
    streamUrl: 'https://ztnr.rtve.es/ztnr/rne_r1_096.m3u8',
    category: 'rne'
  },
  {
    id: 'rne5',
    name: 'Radio 5',
    description: 'Notícies tot el dia',
    logo: 'https://www.rtve.es/favicon.ico',
    streamUrl: 'https://ztnr.rtve.es/ztnr/rne_r5_096.m3u8',
    category: 'rne'
  },
  {
    id: 'radio3',
    name: 'Radio 3',
    description: 'Música i cultura',
    logo: 'https://www.rtve.es/favicon.ico',
    streamUrl: 'https://ztnr.rtve.es/ztnr/rne_r3_096.m3u8',
    category: 'rne'
  },
  {
    id: 'rneclasica',
    name: 'Radio Clásica',
    description: 'Música clàssica',
    logo: 'https://www.rtve.es/favicon.ico',
    streamUrl: 'https://ztnr.rtve.es/ztnr/rne_rca_096.m3u8',
    category: 'rne'
  }
];

const CATEGORIES = {
  tv: [
    { id: 'all', name: 'Tots' },
    { id: '3cat', name: '3Cat' },
    { id: '3cat-fast', name: '3Cat FAST' },
    { id: 'rtve', name: 'RTVE' }
  ],
  radio: [
    { id: 'all', name: 'Totes' },
    { id: 'catradio', name: 'Catalunya Ràdio' },
    { id: 'rne', name: 'RNE' }
  ]
};

function TV() {
  const [activeTab, setActiveTab] = useState('tv');
  const [filter, setFilter] = useState('all');
  const [playingChannel, setPlayingChannel] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const channels = activeTab === 'tv' ? TV_CHANNELS : RADIO_CHANNELS;
  const categories = CATEGORIES[activeTab];

  const filteredChannels = filter === 'all'
    ? channels
    : channels.filter(ch => ch.category === filter);

  const handlePlay = (channel) => {
    setPlayingChannel(channel);
  };

  const handleClose = () => {
    setPlayingChannel(null);
    setIsFullscreen(false);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className="tv-page">
      {/* Player Modal */}
      {playingChannel && (
        <div className={`tv-player-modal ${isFullscreen ? 'fullscreen' : ''}`}>
          <div className="tv-player-wrapper">
            {/* Video/Audio Player */}
            <div className="tv-player-content">
              {activeTab === 'tv' ? (
                <video
                  autoPlay
                  controls
                  playsInline
                  className="tv-video-player"
                >
                  <source src={playingChannel.streamUrl} type="application/x-mpegURL" />
                  El teu navegador no suporta vídeo HLS.
                </video>
              ) : (
                <div className="radio-player-visual">
                  <div className="radio-wave">
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <audio autoPlay controls src={playingChannel.streamUrl}>
                    El teu navegador no suporta àudio.
                  </audio>
                </div>
              )}
            </div>

            {/* Player Controls Bar */}
            <div className="tv-player-bar">
              <div className="player-channel-info">
                <div className="player-live-badge">
                  <LiveIcon /> EN DIRECTE
                </div>
                <h2>{playingChannel.name}</h2>
                <p>{playingChannel.description}</p>
              </div>
              <div className="player-controls">
                <button className="player-btn" onClick={toggleFullscreen}>
                  {isFullscreen ? 'Minimitzar' : 'Pantalla completa'}
                </button>
                <button className="player-btn close-btn" onClick={handleClose}>
                  <CloseIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="tv-header">
        <div className="tv-header-content">
          <h1>
            {activeTab === 'tv' ? 'Televisió en Directe' : 'Ràdio en Directe'}
          </h1>
          <p className="tv-subtitle">
            Canals públics gratuïts i legals
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="tv-tab-switcher">
          <button
            className={`tab-btn ${activeTab === 'tv' ? 'active' : ''}`}
            onClick={() => { setActiveTab('tv'); setFilter('all'); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
              <polyline points="17 2 12 7 7 2"></polyline>
            </svg>
            Televisió
          </button>
          <button
            className={`tab-btn ${activeTab === 'radio' ? 'active' : ''}`}
            onClick={() => { setActiveTab('radio'); setFilter('all'); }}
          >
            <VolumeIcon />
            Ràdio
          </button>
        </div>
      </header>

      {/* Category Filter */}
      <div className="tv-categories">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`category-btn ${filter === cat.id ? 'active' : ''}`}
            onClick={() => setFilter(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Channels Grid */}
      <div className="tv-channels-grid">
        {filteredChannels.map(channel => (
          <div
            key={channel.id}
            className="tv-channel-card"
            onClick={() => handlePlay(channel)}
          >
            <div className="channel-logo-wrapper">
              <img
                src={channel.logo}
                alt={channel.name}
                className="channel-logo"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="channel-logo-fallback" style={{ display: 'none' }}>
                {channel.name.charAt(0)}
              </div>
              <div className="channel-play-overlay">
                <PlayIcon size={40} />
              </div>
              <div className="channel-live-indicator">
                <LiveIcon /> DIRECTE
              </div>
              {channel.hd && <span className="channel-hd-badge">HD</span>}
            </div>
            <div className="channel-info">
              <h3>{channel.name}</h3>
              <p>{channel.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Attribution */}
      <footer className="tv-footer">
        <p>
          Streams proporcionats per <a href="https://github.com/LaQuay/TDTChannels" target="_blank" rel="noopener noreferrer">TDTChannels</a>.
          100% legal i gratuït.
        </p>
      </footer>
    </div>
  );
}

export default TV;
