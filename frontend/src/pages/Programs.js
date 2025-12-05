import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL, formatDuration } from '../config/api';
import {
  PlayIcon,
  SearchIcon,
  TvIcon,
  GridIcon,
  ListIcon,
  ClockIcon,
  ChevronLeftIcon,
  ExternalIcon
} from '../components/icons';
import './Programs.css';

// ============================================================
// CATEGORIES 3Cat
// ============================================================
const CATEGORIES = [
  { id: 'all', name: 'Tot', icon: null },
  { id: 'informatius', name: 'Informatius', icon: null },
  { id: 'entreteniment', name: 'Entreteniment', icon: null },
  { id: 'esports', name: 'Esports', icon: null },
  { id: 'infantil', name: 'Infantil', icon: null },
  { id: 'documentals', name: 'Documentals', icon: null },
  { id: 'cultura', name: 'Cultura', icon: null },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================
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
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();
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

  // Redirect non-admin users
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Load programs
  const loadPrograms = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/3cat/programs?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setPrograms(data.programs || []);
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
        setVideos(data.videos || []);
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
        setVideos(data.videos || []);
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
        setVideos(data.videos || []);
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
                <ChevronLeftIcon /> Tornar
              </button>
              <h1>{selectedProgram.title}</h1>
              <p className="programs-subtitle">
                {selectedProgram.description || `Vídeos del programa ${selectedProgram.title}`}
              </p>
            </>
          ) : (
            <>
              <h1>A la carta - 3Cat</h1>
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
