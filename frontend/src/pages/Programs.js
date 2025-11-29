import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Programs.css';

// ============================================================
// ICONES SVG
// ============================================================
const PlayIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const PauseIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const VolumeIcon = ({ muted }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    {!muted && <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />}
    {muted && <line x1="23" y1="9" x2="17" y2="15" />}
    {muted && <line x1="17" y1="9" x2="23" y2="15" />}
  </svg>
);

const FullscreenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const TvIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
    <polyline points="17 2 12 7 7 2" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
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

// ============================================================
// CATEGORIES
// ============================================================
const CATEGORIES = [
  { id: 'all', name: 'Tot', icon: '📺' },
  { id: 'series', name: 'Sèries', icon: '🎬' },
  { id: 'movie', name: 'Pel·lícules', icon: '🎥' },
  { id: 'program', name: 'Programes', icon: '📡' },
  { id: 'informatiu', name: 'Informatius', icon: '📰' },
  { id: 'documental', name: 'Documentals', icon: '🎞️' },
  { id: 'infantil', name: 'Infantil', icon: '🧸' },
  { id: 'esport', name: 'Esports', icon: '⚽' },
];

// ============================================================
// API FUNCTIONS
// ============================================================
const API_BASE = '/api/3cat';

async function fetchPrograms(limit = 50) {
  try {
    const response = await fetch(`${API_BASE}/programs?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch programs');
    return await response.json();
  } catch (error) {
    console.error('Error fetching programs:', error);
    return [];
  }
}

async function fetchVideos(programId = null, category = null, limit = 50) {
  try {
    let url = `${API_BASE}/videos?limit=${limit}`;
    if (programId) url += `&program_id=${programId}`;
    if (category) url += `&category=${category}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch videos');
    return await response.json();
  } catch (error) {
    console.error('Error fetching videos:', error);
    return [];
  }
}

async function fetchLatestVideos(limit = 50) {
  try {
    const response = await fetch(`${API_BASE}/latest?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch latest');
    return await response.json();
  } catch (error) {
    console.error('Error fetching latest:', error);
    return [];
  }
}

async function searchVideos(query, limit = 30) {
  try {
    const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to search');
    return await response.json();
  } catch (error) {
    console.error('Error searching:', error);
    return [];
  }
}

async function fetchVideoDetails(videoId) {
  try {
    const response = await fetch(`${API_BASE}/videos/${videoId}`);
    if (!response.ok) throw new Error('Failed to fetch video details');
    return await response.json();
  } catch (error) {
    console.error('Error fetching video details:', error);
    return null;
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function formatDuration(seconds) {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateString;
  }
}

function formatViews(views) {
  if (!views) return '';
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
  return views.toString();
}

// ============================================================
// VIDEO PLAYER MODAL COMPONENT
// ============================================================
function VideoPlayerModal({ video, onClose }) {
  const videoRef = useRef(null);
  const progressRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const controlsTimeoutRef = useRef(null);

  // Load video details with stream URL
  const [streamUrl, setStreamUrl] = useState(null);

  useEffect(() => {
    async function loadVideo() {
      setIsLoading(true);
      setError(null);
      const details = await fetchVideoDetails(video.id);
      if (details && details.stream_url) {
        setStreamUrl(details.stream_url);
      } else {
        setError('No s\'ha pogut carregar el vídeo');
      }
      setIsLoading(false);
    }
    loadVideo();
  }, [video.id]);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [resetControlsTimeout]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(10);
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        default:
          break;
      }
      resetControlsTimeout();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, resetControlsTimeout]);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  };

  const seekBy = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const handleProgressClick = (e) => {
    if (videoRef.current && progressRef.current) {
      const rect = progressRef.current.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      videoRef.current.currentTime = percent * duration;
    }
  };

  const toggleFullscreen = () => {
    const container = document.querySelector('.video-player-modal');
    if (!document.fullscreenElement) {
      container?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration || 1;
      setCurrentTime(current);
      setDuration(total);
      setProgress((current / total) * 100);
    }
  };

  if (isLoading) {
    return (
      <div className="video-player-modal" onClick={onClose}>
        <div className="video-player-container" onClick={e => e.stopPropagation()}>
          <div className="video-loading">
            <div className="spinner"></div>
            <p>Carregant vídeo...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !streamUrl) {
    return (
      <div className="video-player-modal" onClick={onClose}>
        <div className="video-player-container" onClick={e => e.stopPropagation()}>
          <div className="video-error">
            <TvIcon />
            <h3>Error</h3>
            <p>{error || 'No s\'ha pogut carregar el vídeo'}</p>
            <button onClick={onClose} className="btn btn-primary btn-md">Tancar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="video-player-modal"
      onClick={onClose}
      onMouseMove={resetControlsTimeout}
    >
      <div className="video-player-container" onClick={e => e.stopPropagation()}>
        <video
          ref={videoRef}
          className="video-element"
          src={streamUrl}
          autoPlay
          playsInline
          muted={isMuted}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={(e) => setDuration(e.target.duration)}
          onClick={togglePlayPause}
        />

        {/* Top bar with close and title */}
        <div className={`video-top-bar ${showControls ? 'visible' : ''}`}>
          <button className="video-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
          <div className="video-title-bar">
            <h2>{video.title}</h2>
            {video.program && <span className="video-program">{video.program}</span>}
          </div>
        </div>

        {/* Center play button */}
        {!isPlaying && (
          <button className="video-center-play" onClick={togglePlayPause}>
            <PlayIcon size={48} />
          </button>
        )}

        {/* Bottom controls */}
        <div className={`video-controls ${showControls ? 'visible' : ''}`}>
          {/* Progress bar */}
          <div className="video-progress" ref={progressRef} onClick={handleProgressClick}>
            <div className="video-progress-bar">
              <div className="video-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="video-time">
              <span>{formatDuration(Math.floor(currentTime))}</span>
              <span>{formatDuration(Math.floor(duration))}</span>
            </div>
          </div>

          {/* Control buttons */}
          <div className="video-control-buttons">
            <button className="control-btn play-btn" onClick={togglePlayPause}>
              {isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
            </button>

            <div className="volume-control">
              <button className="control-btn" onClick={toggleMute}>
                <VolumeIcon muted={isMuted} />
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="volume-slider"
              />
            </div>

            <div className="video-info-bar">
              {video.date && <span className="video-date">{formatDate(video.date)}</span>}
              {video.views && (
                <span className="video-views">
                  <EyeIcon /> {formatViews(video.views)}
                </span>
              )}
            </div>

            <button className="control-btn" onClick={toggleFullscreen}>
              <FullscreenIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PROGRAM CARD COMPONENT
// ============================================================
function ProgramCard({ program, onClick }) {
  return (
    <div className="program-card" onClick={onClick}>
      <div className="program-card-image">
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
        <div className="program-card-placeholder" style={{ display: program.image ? 'none' : 'flex' }}>
          <TvIcon />
        </div>
        <div className="program-card-overlay">
          <PlayIcon size={32} />
        </div>
        {program.total_videos > 0 && (
          <span className="program-video-count">{program.total_videos} vídeos</span>
        )}
      </div>
      <div className="program-card-info">
        <h3>{program.title}</h3>
        {program.category && <span className="program-category">{program.category}</span>}
        {program.description && <p className="program-description">{program.description}</p>}
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
        {video.program && <span className="video-program-tag">{video.program}</span>}
        <div className="video-card-meta">
          {video.date && <span>{formatDate(video.date)}</span>}
          {video.views && <span><EyeIcon /> {formatViews(video.views)}</span>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PROGRAMS COMPONENT
// ============================================================
function Programs() {
  const [view, setView] = useState('videos'); // 'programs' o 'videos'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' o 'list'
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [videos, setVideos] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const searchTimeoutRef = useRef(null);

  // Initial load
  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      setError(null);
      try {
        const [programsData, videosData] = await Promise.all([
          fetchPrograms(30),
          fetchLatestVideos(50)
        ]);
        setPrograms(programsData);
        setVideos(videosData);
      } catch (err) {
        setError('Error carregant contingut');
      }
      setIsLoading(false);
    }
    loadInitialData();
  }, []);

  // Handle category change
  useEffect(() => {
    if (category !== 'all' && view === 'videos' && !searchResults) {
      async function loadCategoryVideos() {
        setIsLoading(true);
        const videosData = await fetchVideos(null, category, 50);
        setVideos(videosData);
        setIsLoading(false);
      }
      loadCategoryVideos();
    }
  }, [category, view, searchResults]);

  // Handle search
  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length > 2) {
      searchTimeoutRef.current = setTimeout(async () => {
        setIsLoading(true);
        const results = await searchVideos(query);
        setSearchResults(results);
        setIsLoading(false);
      }, 500);
    } else if (query.length === 0) {
      setSearchResults(null);
    }
  };

  // Handle program selection
  const handleProgramClick = async (program) => {
    setSelectedProgram(program);
    setIsLoading(true);
    const programVideos = await fetchVideos(program.id, null, 50);
    setVideos(programVideos);
    setView('videos');
    setIsLoading(false);
  };

  // Back to all programs
  const handleBackToPrograms = async () => {
    setSelectedProgram(null);
    setSearchResults(null);
    setSearchQuery('');
    setIsLoading(true);
    const videosData = await fetchLatestVideos(50);
    setVideos(videosData);
    setIsLoading(false);
  };

  // Filter content based on category
  const displayedVideos = searchResults || videos;
  const filteredVideos = category === 'all'
    ? displayedVideos
    : displayedVideos.filter(v => v.type === category || v.category?.toLowerCase().includes(category));

  const filteredPrograms = category === 'all'
    ? programs
    : programs.filter(p => p.type === category || p.category?.toLowerCase().includes(category));

  return (
    <div className="programs-page">
      {/* Header */}
      <header className="programs-header">
        <div className="programs-header-content">
          <h1>A la carta</h1>
          <p className="programs-subtitle">
            Contingut sota demanda de les millors cadenes
          </p>
        </div>

        {/* Search Bar */}
        <div className="programs-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Cercar programes, sèries, pel·lícules..."
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>
      </header>

      {/* View Toggle & Categories */}
      <div className="programs-controls">
        <div className="programs-tabs">
          <button
            className={`tab-btn ${view === 'videos' ? 'active' : ''}`}
            onClick={() => setView('videos')}
          >
            Últims vídeos
          </button>
          <button
            className={`tab-btn ${view === 'programs' ? 'active' : ''}`}
            onClick={() => setView('programs')}
          >
            Programes
          </button>
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

      {/* Selected Program Header */}
      {selectedProgram && (
        <div className="selected-program-header">
          <button className="back-btn" onClick={handleBackToPrograms}>
            ← Tornar
          </button>
          <div className="selected-program-info">
            <h2>{selectedProgram.title}</h2>
            {selectedProgram.category && (
              <span className="program-category-tag">{selectedProgram.category}</span>
            )}
          </div>
        </div>
      )}

      {/* Search Results Header */}
      {searchResults && searchQuery && (
        <div className="search-results-header">
          <h2>Resultats per "{searchQuery}"</h2>
          <span className="results-count">{searchResults.length} resultats</span>
          <button className="clear-search" onClick={handleBackToPrograms}>
            Esborrar cerca
          </button>
        </div>
      )}

      {/* Content */}
      <main className="programs-content">
        {isLoading ? (
          <div className="programs-loading">
            <div className="spinner"></div>
            <p>Carregant contingut...</p>
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
        ) : view === 'programs' && !searchResults ? (
          <div className={`programs-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
            {filteredPrograms.length > 0 ? (
              filteredPrograms.map(program => (
                <ProgramCard
                  key={program.id}
                  program={program}
                  onClick={() => handleProgramClick(program)}
                />
              ))
            ) : (
              <div className="no-content">
                <TvIcon />
                <p>No s'han trobat programes</p>
              </div>
            )}
          </div>
        ) : (
          <div className={`videos-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
            {filteredVideos.length > 0 ? (
              filteredVideos.map(video => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onClick={() => setSelectedVideo(video)}
                />
              ))
            ) : (
              <div className="no-content">
                <TvIcon />
                <p>No s'han trobat vídeos</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Video Player Modal */}
      {selectedVideo && (
        <VideoPlayerModal
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
        />
      )}
    </div>
  );
}

export default Programs;
