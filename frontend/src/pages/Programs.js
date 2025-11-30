import React, { useState, useEffect, useCallback } from 'react';
import './Programs.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

// ============================================================
// ICONES SVG
// ============================================================
const PlayIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const TvIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
    <polyline points="17 2 12 7 7 2"></polyline>
  </svg>
);

const GridIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const ListIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ExternalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// ============================================================
// CATEGORIES 3Cat
// ============================================================
const CATEGORIES = [
  { id: 'all', name: 'Tot', icon: '📺' },
  { id: 'informatius', name: 'Informatius', icon: '📰' },
  { id: 'entreteniment', name: 'Entreteniment', icon: '🎭' },
  { id: 'esports', name: 'Esports', icon: '⚽' },
  { id: 'infantil', name: 'Infantil', icon: '👶' },
  { id: 'documentals', name: 'Documentals', icon: '🎬' },
  { id: 'cultura', name: 'Cultura', icon: '🎨' },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function formatDuration(seconds) {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================================
// PROGRAM CARD COMPONENT
// ============================================================
function ProgramCard({ program, onClick }) {
  return (
    <div className="video-card" onClick={onClick}>
      <div className="video-card-image">
        {program.image ? (
          <img
            src={program.image}
            alt={program.title}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div className="video-card-placeholder" style={{ display: program.image ? 'none' : 'flex' }}>
          <TvIcon />
        </div>
        <div className="video-card-overlay">
          <PlayIcon size={32} />
        </div>
        {program.video_count > 0 && (
          <span className="video-duration">
            {program.video_count} vídeos
          </span>
        )}
      </div>
      <div className="video-card-info">
        <h3>{program.title}</h3>
        <span className="video-program-tag">
          {program.channel || '3Cat'}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// VIDEO CARD COMPONENT
// ============================================================
function VideoCard({ video, onClick }) {
  return (
    <div className="video-card" onClick={onClick}>
      <div className="video-card-image">
        {video.image ? (
          <img
            src={video.image}
            alt={video.title}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div className="video-card-placeholder" style={{ display: video.image ? 'none' : 'flex' }}>
          <TvIcon />
        </div>
        <div className="video-card-overlay">
          <PlayIcon size={32} />
        </div>
        {video.duration && (
          <span className="video-duration">
            <ClockIcon /> {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="video-card-info">
        <h3>{video.title}</h3>
        <div className="video-meta">
          {video.program && <span className="video-program-tag">{video.program}</span>}
          {video.date && <span className="video-date">{formatDate(video.date)}</span>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VIDEO PLAYER MODAL
// ============================================================
function VideoPlayer({ video, onClose }) {
  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadStream() {
      try {
        const res = await fetch(`${API_URL}/api/3cat/videos/${video.id}`);
        if (res.ok) {
          const data = await res.json();
          setStreamUrl(data.stream_url);
        } else {
          setError('No s\'ha pogut obtenir el vídeo');
        }
      } catch (err) {
        setError('Error carregant el vídeo');
      }
      setLoading(false);
    }
    loadStream();
  }, [video.id]);

  // Close on escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="video-player-modal" onClick={onClose}>
      <div className="video-player-content" onClick={(e) => e.stopPropagation()}>
        <button className="video-player-close" onClick={onClose}>✕</button>
        <div className="video-player-header">
          <h2>{video.title}</h2>
          {video.program && <span className="video-player-program">{video.program}</span>}
        </div>

        {loading ? (
          <div className="video-player-loading">
            <div className="spinner"></div>
            <p>Carregant vídeo...</p>
          </div>
        ) : error ? (
          <div className="video-player-error">
            <p>{error}</p>
            <a
              href={`https://www.3cat.cat/3cat/video/${video.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Veure a 3Cat <ExternalIcon />
            </a>
          </div>
        ) : (
          <video
            className="video-player-video"
            src={streamUrl}
            controls
            autoPlay
            playsInline
          />
        )}

        {video.description && (
          <p className="video-player-description">{video.description}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN PROGRAMS COMPONENT
// ============================================================
function Programs() {
  const [viewMode, setViewMode] = useState('grid');
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [programs, setPrograms] = useState([]);
  const [videos, setVideos] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('programs'); // 'programs' or 'latest'

  // Load programs
  const loadPrograms = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/3cat/programs?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setPrograms(data);
      } else {
        setError('Error carregant programes');
      }
    } catch (err) {
      console.error('Error loading programs:', err);
      setError('Error de connexió');
    }
    setIsLoading(false);
  }, []);

  // Load latest videos
  const loadLatest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/3cat/latest?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setVideos(data);
      } else {
        setError('Error carregant vídeos');
      }
    } catch (err) {
      console.error('Error loading videos:', err);
      setError('Error de connexió');
    }
    setIsLoading(false);
  }, []);

  // Load program videos
  const loadProgramVideos = useCallback(async (programId) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/3cat/videos?program_id=${programId}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setVideos(data);
      } else {
        setError('Error carregant vídeos');
      }
    } catch (err) {
      console.error('Error loading program videos:', err);
      setError('Error de connexió');
    }
    setIsLoading(false);
  }, []);

  // Search content
  const searchContent = useCallback(async (query) => {
    if (!query.trim()) {
      if (activeTab === 'programs') {
        loadPrograms();
      } else {
        loadLatest();
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/3cat/search?q=${encodeURIComponent(query)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setVideos(data);
        setActiveTab('latest'); // Switch to videos view for search results
      } else {
        setError('Error cercant');
      }
    } catch (err) {
      console.error('Error searching:', err);
      setError('Error de connexió');
    }
    setIsLoading(false);
  }, [activeTab, loadPrograms, loadLatest]);

  // Initial load
  useEffect(() => {
    if (selectedProgram) {
      loadProgramVideos(selectedProgram.id);
    } else if (activeTab === 'programs') {
      loadPrograms();
    } else {
      loadLatest();
    }
  }, [activeTab, selectedProgram, loadPrograms, loadLatest, loadProgramVideos]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchContent(searchQuery);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, searchContent]);

  // Filter programs by category
  const filteredPrograms = category === 'all'
    ? programs
    : programs.filter(p => p.category?.toLowerCase().includes(category));

  // Handle program click
  const handleProgramClick = (program) => {
    setSelectedProgram(program);
  };

  // Handle back to programs
  const handleBack = () => {
    setSelectedProgram(null);
    setSearchQuery('');
  };

  // Handle video click
  const handleVideoClick = (video) => {
    setSelectedVideo(video);
  };

  const totalCount = selectedProgram ? videos.length : (activeTab === 'programs' ? filteredPrograms.length : videos.length);

  return (
    <div className="programs-page">
      {/* Header */}
      <header className="programs-header">
        <div className="programs-header-content">
          {selectedProgram ? (
            <>
              <button className="back-btn" onClick={handleBack}>
                <BackIcon /> Tornar
              </button>
              <h1>{selectedProgram.title}</h1>
              <p className="programs-subtitle">
                {selectedProgram.description || `Vídeos del programa ${selectedProgram.title}`}
              </p>
            </>
          ) : (
            <>
              <h1>📺 A la carta - 3Cat</h1>
              <p className="programs-subtitle">
                Programes i continguts de TV3, 3/24, 33 i més
              </p>
            </>
          )}
        </div>

        {/* Search Bar */}
        {!selectedProgram && (
          <div className="programs-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Cercar programes, vídeos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </header>

      {/* Tabs */}
      {!selectedProgram && !searchQuery && (
        <div className="programs-tabs">
          <button
            className={`tab-btn ${activeTab === 'programs' ? 'active' : ''}`}
            onClick={() => setActiveTab('programs')}
          >
            Programes
          </button>
          <button
            className={`tab-btn ${activeTab === 'latest' ? 'active' : ''}`}
            onClick={() => setActiveTab('latest')}
          >
            Últims vídeos
          </button>
        </div>
      )}

      {/* View Toggle & Categories */}
      <div className="programs-controls">
        <div className="programs-stats">
          <span className="stats-count">
            {totalCount} {selectedProgram || activeTab === 'latest' ? 'vídeos' : 'programes'}
          </span>
        </div>

        <div className="programs-view-toggle">
          <button
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Vista graella"
          >
            <GridIcon />
          </button>
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="Vista llista"
          >
            <ListIcon />
          </button>
        </div>
      </div>

      {/* Categories Bar */}
      {!selectedProgram && activeTab === 'programs' && !searchQuery && (
        <div className="programs-categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`category-chip ${category === cat.id ? 'active' : ''}`}
              onClick={() => setCategory(cat.id)}
            >
              <span className="category-icon">{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <main className="programs-content">
        {isLoading ? (
          <div className="programs-loading">
            <div className="spinner"></div>
            <p>Carregant contingut de 3Cat...</p>
          </div>
        ) : error ? (
          <div className="programs-error">
            <TvIcon />
            <h3>Error</h3>
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="btn btn-primary btn-md">
              Tornar a intentar
            </button>
          </div>
        ) : totalCount === 0 ? (
          <div className="no-content">
            <TvIcon />
            <p>No s'ha trobat contingut</p>
            {searchQuery && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSearchQuery('')}
              >
                Esborrar cerca
              </button>
            )}
          </div>
        ) : (
          <div className={`videos-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
            {/* Programs or Videos */}
            {selectedProgram || activeTab === 'latest' || searchQuery ? (
              // Show videos
              videos.map(video => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onClick={() => handleVideoClick(video)}
                />
              ))
            ) : (
              // Show programs
              filteredPrograms.map(program => (
                <ProgramCard
                  key={program.id}
                  program={program}
                  onClick={() => handleProgramClick(program)}
                />
              ))
            )}
          </div>
        )}
      </main>

      {/* Video Player Modal */}
      {selectedVideo && (
        <VideoPlayer
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
        />
      )}
    </div>
  );
}

export default Programs;
