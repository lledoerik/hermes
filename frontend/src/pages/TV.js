import React, { useState } from 'react';
import axios from 'axios';
import './TV.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const TvIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const RadioIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="2"></circle>
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>
  </svg>
);

const PlayIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const LiveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" fill="#ef4444" stroke="#ef4444"></circle>
  </svg>
);

// Canals de TV públics catalans
const TV_CHANNELS = [
  {
    id: 'tv3',
    name: 'TV3',
    description: 'Televisió de Catalunya',
    logo: 'https://statics.ccma.cat/multimedia/jpg/7/4/1627980970247.jpg',
    streamUrl: 'https://directes-tv-int.ccma.cat/live-origin/tv3-hls/master.m3u8',
    category: 'generalista'
  },
  {
    id: '324',
    name: '3/24',
    description: 'Canal de notícies 24 hores',
    logo: 'https://statics.ccma.cat/multimedia/jpg/1/1/1627980994111.jpg',
    streamUrl: 'https://directes-tv-int.ccma.cat/live-origin/324-hls/master.m3u8',
    category: 'noticies'
  },
  {
    id: '33',
    name: '33',
    description: 'Canal cultural',
    logo: 'https://statics.ccma.cat/multimedia/jpg/0/4/1627981009640.jpg',
    streamUrl: 'https://directes-tv-int.ccma.cat/live-origin/c33-hls/master.m3u8',
    category: 'cultural'
  },
  {
    id: 'sx3',
    name: 'SX3',
    description: 'Canal infantil i juvenil',
    logo: 'https://statics.ccma.cat/multimedia/jpg/2/3/1627981028332.jpg',
    streamUrl: 'https://directes-tv-int.ccma.cat/live-origin/sx3-hls/master.m3u8',
    category: 'infantil'
  },
  {
    id: 'esport3',
    name: 'Esport3',
    description: 'Canal esportiu',
    logo: 'https://statics.ccma.cat/multimedia/jpg/6/0/1664888116706.jpg',
    streamUrl: 'https://directes-tv-int.ccma.cat/live-origin/esport3-hls/master.m3u8',
    category: 'esports'
  },
  {
    id: 'la1',
    name: 'La 1',
    description: 'TVE Catalunya',
    logo: 'https://img.rtve.es/v/6543000/',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1688877.m3u8',
    category: 'generalista'
  },
  {
    id: 'la2',
    name: 'La 2',
    description: 'TVE 2',
    logo: 'https://img.rtve.es/v/6543006/',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1688885.m3u8',
    category: 'cultural'
  },
  {
    id: '24h',
    name: '24 Horas',
    description: 'Canal de notícies RTVE',
    logo: 'https://img.rtve.es/v/6543009/',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1694255.m3u8',
    category: 'noticies'
  },
  {
    id: 'clan',
    name: 'Clan',
    description: 'Canal infantil RTVE',
    logo: 'https://img.rtve.es/v/6543013/',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1688893.m3u8',
    category: 'infantil'
  },
  {
    id: 'teledeporte',
    name: 'Teledeporte',
    description: 'Canal esportiu RTVE',
    logo: 'https://img.rtve.es/v/6543016/',
    streamUrl: 'https://ztnr.rtve.es/ztnr/1712972.m3u8',
    category: 'esports'
  }
];

// Emissores de ràdio públiques catalanes
const RADIO_CHANNELS = [
  {
    id: 'catradio',
    name: 'Catalunya Ràdio',
    description: 'L\'emissora nacional de Catalunya',
    logo: 'https://statics.ccma.cat/multimedia/jpg/5/8/1627981055885.jpg',
    streamUrl: 'https://directes-radio-int.ccma.cat/live-content/catradio-hls/master.m3u8',
    category: 'generalista'
  },
  {
    id: 'catinfo',
    name: 'Catalunya Informació',
    description: 'Notícies les 24 hores',
    logo: 'https://statics.ccma.cat/multimedia/jpg/5/8/1627981055885.jpg',
    streamUrl: 'https://directes-radio-int.ccma.cat/live-content/catinfo-hls/master.m3u8',
    category: 'noticies'
  },
  {
    id: 'catmusica',
    name: 'Catalunya Música',
    description: 'Música clàssica i jazz',
    logo: 'https://statics.ccma.cat/multimedia/jpg/5/8/1627981055885.jpg',
    streamUrl: 'https://directes-radio-int.ccma.cat/live-content/catmusica-hls/master.m3u8',
    category: 'musica'
  },
  {
    id: 'icatfm',
    name: 'iCat',
    description: 'Música alternativa i cultura',
    logo: 'https://statics.ccma.cat/multimedia/jpg/5/8/1627981055885.jpg',
    streamUrl: 'https://directes-radio-int.ccma.cat/live-content/icat-hls/master.m3u8',
    category: 'musica'
  },
  {
    id: 'rne1',
    name: 'RNE 1',
    description: 'Radio Nacional de España',
    logo: 'https://img.rtve.es/v/6543019/',
    streamUrl: 'https://ztnr.rtve.es/ztnr/rne_r1_096.m3u8',
    category: 'generalista'
  },
  {
    id: 'rne5',
    name: 'Radio 5',
    description: 'Notícies i esports',
    logo: 'https://img.rtve.es/v/6543022/',
    streamUrl: 'https://ztnr.rtve.es/ztnr/rne_r5_096.m3u8',
    category: 'noticies'
  },
  {
    id: 'rneclasica',
    name: 'Radio Clásica',
    description: 'Música clàssica',
    logo: 'https://img.rtve.es/v/6543025/',
    streamUrl: 'https://ztnr.rtve.es/ztnr/rne_rca_096.m3u8',
    category: 'musica'
  },
  {
    id: 'radio3',
    name: 'Radio 3',
    description: 'Música i cultura',
    logo: 'https://img.rtve.es/v/6543028/',
    streamUrl: 'https://ztnr.rtve.es/ztnr/rne_r3_096.m3u8',
    category: 'musica'
  }
];

function TV() {
  const [activeTab, setActiveTab] = useState('tv');
  const [playingChannel, setPlayingChannel] = useState(null);
  const [filter, setFilter] = useState('all');

  const channels = activeTab === 'tv' ? TV_CHANNELS : RADIO_CHANNELS;

  const filteredChannels = filter === 'all'
    ? channels
    : channels.filter(ch => ch.category === filter);

  const categories = [...new Set(channels.map(ch => ch.category))];

  const handlePlay = (channel) => {
    setPlayingChannel(channel);
  };

  const handleClose = () => {
    setPlayingChannel(null);
  };

  return (
    <div className="tv-container">
      {/* Player Modal */}
      {playingChannel && (
        <div className="tv-player-overlay" onClick={handleClose}>
          <div className="tv-player-container" onClick={e => e.stopPropagation()}>
            <div className="tv-player-header">
              <div className="tv-player-info">
                <img src={playingChannel.logo} alt={playingChannel.name} className="tv-player-logo" />
                <div>
                  <h2>{playingChannel.name}</h2>
                  <p>{playingChannel.description}</p>
                </div>
              </div>
              <button className="tv-player-close" onClick={handleClose}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="tv-player-video">
              {activeTab === 'tv' ? (
                <video
                  autoPlay
                  controls
                  src={playingChannel.streamUrl}
                  style={{ width: '100%', height: '100%', background: '#000' }}
                >
                  El teu navegador no suporta vídeo HTML5.
                </video>
              ) : (
                <audio
                  autoPlay
                  controls
                  src={playingChannel.streamUrl}
                  style={{ width: '100%', marginTop: '40%' }}
                >
                  El teu navegador no suporta àudio HTML5.
                </audio>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="tv-header">
        <div className="tv-title">
          <span className="icon">{activeTab === 'tv' ? <TvIcon /> : <RadioIcon />}</span>
          <h1>{activeTab === 'tv' ? 'Televisió en Directe' : 'Ràdio en Directe'}</h1>
        </div>

        <div className="tv-tabs">
          <button
            className={activeTab === 'tv' ? 'active' : ''}
            onClick={() => { setActiveTab('tv'); setFilter('all'); }}
          >
            <TvIcon /> Televisió
          </button>
          <button
            className={activeTab === 'radio' ? 'active' : ''}
            onClick={() => { setActiveTab('radio'); setFilter('all'); }}
          >
            <RadioIcon /> Ràdio
          </button>
        </div>
      </div>

      <div className="tv-filters">
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          Tots
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            className={filter === cat ? 'active' : ''}
            onClick={() => setFilter(cat)}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      <div className="tv-grid">
        {filteredChannels.map((channel) => (
          <div
            key={channel.id}
            className="tv-card"
            onClick={() => handlePlay(channel)}
          >
            <div className="tv-card-logo">
              <img src={channel.logo} alt={channel.name} />
              <div className="tv-card-play">
                <PlayIcon size={32} />
              </div>
              <div className="tv-card-live">
                <LiveIcon /> EN DIRECTE
              </div>
            </div>
            <div className="tv-card-info">
              <h3>{channel.name}</h3>
              <p>{channel.description}</p>
              <span className="tv-card-category">{channel.category}</span>
            </div>
          </div>
        ))}
      </div>

      {filteredChannels.length === 0 && (
        <div className="tv-empty">
          <p>No hi ha canals disponibles en aquesta categoria</p>
        </div>
      )}
    </div>
  );
}

export default TV;
