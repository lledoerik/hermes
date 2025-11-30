import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './AudiobookPlayer.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

// SVG Icons
const PlayIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const PauseIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16"></rect>
    <rect x="14" y="4" width="4" height="16"></rect>
  </svg>
);

const SkipBackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="19 20 9 12 19 4 19 20"></polygon>
    <line x1="5" y1="19" x2="5" y2="5"></line>
  </svg>
);

const SkipForwardIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 4 15 12 5 20 5 4"></polygon>
    <line x1="19" y1="5" x2="19" y2="19"></line>
  </svg>
);

const Rewind10Icon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"></path>
    <text x="8" y="16" fontSize="8" fill="currentColor" stroke="none">10</text>
  </svg>
);

const Forward30Icon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"></path>
    <text x="7" y="16" fontSize="8" fill="currentColor" stroke="none">30</text>
  </svg>
);

const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);

const ListIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6"></line>
    <line x1="8" y1="12" x2="21" y2="12"></line>
    <line x1="8" y1="18" x2="21" y2="18"></line>
    <line x1="3" y1="6" x2="3.01" y2="6"></line>
    <line x1="3" y1="12" x2="3.01" y2="12"></line>
    <line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);

const VolumeIcon = ({ muted }) => (
  muted ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    </svg>
  )
);

const SpeedIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const SleepIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
);

const BookmarkIcon = ({ filled }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// Sleep timer options (in minutes)
const SLEEP_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hora' },
  { value: -1, label: 'Fi capitol' }
];

// Playback speed options
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

// Skip indicator icons
const RewindIndicator = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="11 19 2 12 11 5 11 19"></polygon>
    <polygon points="22 19 13 12 22 5 22 19"></polygon>
  </svg>
);

const ForwardIndicator = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="13 19 22 12 13 5 13 19"></polygon>
    <polygon points="2 19 11 12 2 5 2 19"></polygon>
  </svg>
);

function AudiobookPlayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const sleepTimerRef = useRef(null);
  const containerRef = useRef(null);
  const lastTapRef = useRef({ time: 0, side: null });
  const chaptersPanelRef = useRef(null);
  const currentChapterRef = useRef(null);

  const [audiobook, setAudiobook] = useState(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(() => parseFloat(localStorage.getItem('audiobook_speed')) || 1);
  const [showChapters, setShowChapters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [skipIndicator, setSkipIndicator] = useState(null);

  // Sleep timer state
  const [sleepTimer, setSleepTimer] = useState(0); // minuts restants
  const [sleepMode, setSleepMode] = useState(0); // 0=off, -1=fi capitol, >0=minuts
  const [sleepEndTime, setSleepEndTime] = useState(null);

  // Bookmarks state
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Carregar audiollibres
  useEffect(() => {
    const loadAudiobook = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/audiobooks/${id}`);
        setAudiobook(response.data);

        // Si hi ha progrés guardat, continuar des d'allà
        if (response.data.progress?.current_file_id) {
          const fileIndex = response.data.files.findIndex(
            f => f.id === response.data.progress.current_file_id
          );
          if (fileIndex !== -1) {
            setCurrentFileIndex(fileIndex);
            setCurrentTime(response.data.progress.current_position || 0);
          }
        }
      } catch (error) {
        console.error('Error carregant audiollibres:', error);
        setError('No s\'ha pogut carregar l\'audiollibre');
      } finally {
        setLoading(false);
      }
    };

    loadAudiobook();

    // Carregar marcadors des de localStorage
    const savedBookmarks = localStorage.getItem(`audiobook_bookmarks_${id}`);
    if (savedBookmarks) {
      try {
        setBookmarks(JSON.parse(savedBookmarks));
      } catch {
        setBookmarks([]);
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, [id]);

  // Sleep timer effect
  useEffect(() => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
    }

    if (sleepMode > 0 && sleepEndTime) {
      sleepTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((sleepEndTime - Date.now()) / 60000));
        setSleepTimer(remaining);

        if (remaining <= 0) {
          // Temps esgotat - pausar
          if (audioRef.current) {
            audioRef.current.pause();
          }
          setIsPlaying(false);
          setSleepMode(0);
          setSleepEndTime(null);
          clearInterval(sleepTimerRef.current);
        }
      }, 1000);
    }

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, [sleepMode, sleepEndTime]);

  // Scroll automàtic al capítol actual quan s'obre el panell
  useEffect(() => {
    if (showChapters && currentChapterRef.current && chaptersPanelRef.current) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (currentChapterRef.current && chaptersPanelRef.current) {
            const panel = chaptersPanelRef.current;
            const element = currentChapterRef.current;
            const panelRect = panel.getBoundingClientRect();

            const scrollTop = element.offsetTop - (panelRect.height / 2) + (element.offsetHeight / 2);
            panel.scrollTo({
              top: Math.max(0, scrollTop),
              behavior: 'smooth'
            });
          }
        }, 150);
      });
    }
  }, [showChapters]);

  // Guardar velocitat a localStorage
  useEffect(() => {
    localStorage.setItem('audiobook_speed', playbackRate.toString());
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Guardar progrés periòdicament
  const saveProgress = useCallback(async () => {
    if (!audiobook || !audioRef.current) return;

    const currentFile = audiobook.files[currentFileIndex];
    if (!currentFile) return;

    try {
      await axios.post(`${API_URL}/api/audiobooks/${id}/progress`, {
        file_id: currentFile.id,
        position: Math.floor(audioRef.current.currentTime)
      });
    } catch (error) {
      console.error('Error guardant progrés:', error);
    }
  }, [audiobook, currentFileIndex, id]);

  // Configurar interval per guardar progrés
  useEffect(() => {
    if (isPlaying) {
      progressIntervalRef.current = setInterval(saveProgress, 30000); // Cada 30 segons
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, saveProgress]);

  // Handlers d'àudio
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);

      // Si tenim temps guardat, saltar-hi
      if (currentTime > 0 && audioRef.current.currentTime === 0) {
        audioRef.current.currentTime = currentTime;
      }
    }
  };

  const handleEnded = () => {
    // Si el sleep timer està en mode "fi de capítol", pausar
    if (sleepMode === -1) {
      setIsPlaying(false);
      setSleepMode(0);
      saveProgress();
      return;
    }

    // Passar al següent fitxer
    if (currentFileIndex < audiobook.files.length - 1) {
      setCurrentFileIndex(prev => prev + 1);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      saveProgress();
    }
  };

  // Sleep timer functions
  const setSleepTimerMinutes = (minutes) => {
    if (minutes === 0) {
      setSleepMode(0);
      setSleepEndTime(null);
      setSleepTimer(0);
    } else if (minutes === -1) {
      setSleepMode(-1); // Fi de capítol
      setSleepTimer(-1);
    } else {
      setSleepMode(minutes);
      setSleepEndTime(Date.now() + minutes * 60 * 1000);
      setSleepTimer(minutes);
    }
    setShowSettings(false);
  };

  // Bookmark functions
  const addBookmark = useCallback(() => {
    if (!audiobook || !audioRef.current) return;

    const currentFile = audiobook.files[currentFileIndex];
    const newBookmark = {
      id: Date.now(),
      fileIndex: currentFileIndex,
      fileId: currentFile.id,
      fileTitle: currentFile.title || currentFile.file_name,
      position: Math.floor(audioRef.current.currentTime),
      createdAt: new Date().toISOString()
    };

    const updatedBookmarks = [...bookmarks, newBookmark];
    setBookmarks(updatedBookmarks);
    localStorage.setItem(`audiobook_bookmarks_${id}`, JSON.stringify(updatedBookmarks));
  }, [audiobook, currentFileIndex, bookmarks, id]);

  const removeBookmark = useCallback((bookmarkId) => {
    const updatedBookmarks = bookmarks.filter(b => b.id !== bookmarkId);
    setBookmarks(updatedBookmarks);
    localStorage.setItem(`audiobook_bookmarks_${id}`, JSON.stringify(updatedBookmarks));
  }, [bookmarks, id]);

  const goToBookmark = useCallback((bookmark) => {
    if (bookmark.fileIndex !== currentFileIndex) {
      saveProgress();
      setCurrentFileIndex(bookmark.fileIndex);
    }
    // Esperar a que carregui el fitxer si cal
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = bookmark.position;
      }
    }, 100);
    setShowBookmarks(false);
    setIsPlaying(true);
  }, [currentFileIndex, saveProgress]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        saveProgress();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e) => {
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;

    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const skipBack = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
    }
  };

  const skipForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 30);
    }
  };

  const previousTrack = () => {
    if (currentFileIndex > 0) {
      saveProgress();
      setCurrentFileIndex(prev => prev - 1);
      setCurrentTime(0);
    }
  };

  const nextTrack = () => {
    if (currentFileIndex < audiobook.files.length - 1) {
      saveProgress();
      setCurrentFileIndex(prev => prev + 1);
      setCurrentTime(0);
    }
  };

  const selectTrack = (index) => {
    saveProgress();
    setCurrentFileIndex(index);
    setCurrentTime(0);
    setShowChapters(false);
    setIsPlaying(true);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  const cyclePlaybackRate = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(playbackRate);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % SPEED_OPTIONS.length : 0;
    const newRate = SPEED_OPTIONS[nextIndex];
    setPlaybackRate(newRate);
  };

  const setSpeed = (speed) => {
    setPlaybackRate(speed);
    setShowSettings(false);
  };

  // Show skip indicator
  const showSkipIndicator = useCallback((side, seconds) => {
    setSkipIndicator({ side, seconds });
    setTimeout(() => setSkipIndicator(null), 500);
  }, []);

  // Double tap handler
  const handleDoubleTap = useCallback((side) => {
    if (side === 'left') {
      if (audioRef.current) {
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
        showSkipIndicator('left', 10);
      }
    } else {
      if (audioRef.current) {
        audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 30);
        showSkipIndicator('right', 30);
      }
    }
  }, [duration, showSkipIndicator]);

  // Handle tap on container for double-tap detection
  const handleContainerClick = useCallback((e) => {
    // Ignore clicks on buttons, controls, sliders
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.audiobook-controls') ||
        e.target.closest('.audiobook-extra-controls') || e.target.closest('.audiobook-progress') ||
        e.target.closest('.chapters-panel') || e.target.closest('.audiobook-header')) {
      return;
    }

    const now = Date.now();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const side = clickX < rect.width / 2 ? 'left' : 'right';

    // Check if it's a double tap (within 300ms and same side)
    if (now - lastTapRef.current.time < 300 && lastTapRef.current.side === side) {
      handleDoubleTap(side);
      lastTapRef.current = { time: 0, side: null };
    } else {
      lastTapRef.current = { time: now, side };
    }
  }, [handleDoubleTap]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
            showSkipIndicator('left', 10);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 30);
            showSkipIndicator('right', 30);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(prev => {
            const newVol = Math.min(1, prev + 0.1);
            if (audioRef.current) audioRef.current.volume = newVol;
            return newVol;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(prev => {
            const newVol = Math.max(0, prev - 0.1);
            if (audioRef.current) audioRef.current.volume = newVol;
            return newVol;
          });
          break;
        case 'KeyM':
          toggleMute();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, showSkipIndicator]);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/img/hermes.png" alt="Hermes" className="loading-logo" />
        <div className="loading-text">Carregant audiollibres...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="audiobook-player-container">
        <div className="audiobook-error">
          <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48" style={{color: '#ef4444', marginBottom: '10px'}}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <h2>{error}</h2>
          <button onClick={() => navigate('/audiobooks')}>
            <BackIcon /> Tornar a la biblioteca
          </button>
        </div>
      </div>
    );
  }

  if (!audiobook) {
    return (
      <div className="audiobook-player-container">
        <div className="audiobook-error">
          <h2>Audiollibres no trobat</h2>
          <button onClick={() => navigate('/audiobooks')}>
            <BackIcon /> Tornar a la biblioteca
          </button>
        </div>
      </div>
    );
  }

  const currentFile = audiobook.files[currentFileIndex];
  const streamUrl = currentFile
    ? `${API_URL}/api/audiobooks/${id}/files/${currentFile.id}/stream`
    : null;

  const coverUrl = audiobook.cover
    ? `${API_URL}/api/audiobooks/${id}/cover`
    : null;

  return (
    <div className="audiobook-player-container" ref={containerRef} onClick={handleContainerClick}>
      {/* Skip Indicators */}
      {skipIndicator && (
        <div className={`skip-indicator ${skipIndicator.side}`}>
          {skipIndicator.side === 'left' ? <RewindIndicator /> : <ForwardIndicator />}
          <span>{skipIndicator.seconds}s</span>
        </div>
      )}

      {/* Background */}
      <div className="audiobook-bg">
        {coverUrl && <img src={coverUrl} alt="" className="audiobook-bg-image" />}
        <div className="audiobook-bg-overlay"></div>
      </div>

      {/* Header */}
      <header className="audiobook-header">
        <button className="back-btn" onClick={() => {
          saveProgress();
          navigate('/audiobooks');
        }}>
          <BackIcon />
        </button>
        <div className="audiobook-title-header">
          <h1>{audiobook.title}</h1>
          <span className="author">{audiobook.author_name}</span>
        </div>
        <div className="header-actions">
          <button
            className={`header-btn ${showBookmarks ? 'active' : ''}`}
            onClick={() => { setShowBookmarks(!showBookmarks); setShowChapters(false); setShowSettings(false); }}
            title="Marcadors"
          >
            <BookmarkIcon filled={bookmarks.length > 0} />
          </button>
          <button
            className={`header-btn ${showChapters ? 'active' : ''}`}
            onClick={() => { setShowChapters(!showChapters); setShowBookmarks(false); setShowSettings(false); }}
            title="Capitols"
          >
            <ListIcon />
          </button>
          <button
            className={`header-btn ${showSettings ? 'active' : ''}`}
            onClick={() => { setShowSettings(!showSettings); setShowChapters(false); setShowBookmarks(false); }}
            title="Configuracio"
          >
            <SleepIcon />
            {sleepMode !== 0 && (
              <span className="sleep-badge">
                {sleepMode === -1 ? 'Fi' : sleepTimer}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="audiobook-main">
        {/* Cover */}
        <div className="audiobook-cover-container">
          {coverUrl ? (
            <img src={coverUrl} alt={audiobook.title} className="audiobook-cover" />
          ) : (
            <div className="audiobook-cover-placeholder">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
              </svg>
            </div>
          )}
        </div>

        {/* Current track info */}
        <div className="current-track-info">
          <h2 className="track-title">{currentFile?.title || currentFile?.file_name}</h2>
          <div className="track-meta">
            <p className="track-number">
              Capitol {currentFileIndex + 1} de {audiobook.files.length}
            </p>
            <button className="bookmark-current-btn" onClick={addBookmark} title="Afegir marcador">
              <BookmarkIcon filled={false} />
            </button>
          </div>
        </div>

        {/* Sleep timer indicator */}
        {sleepMode !== 0 && (
          <div className="sleep-indicator">
            <SleepIcon />
            <span>
              {sleepMode === -1
                ? 'Aturaras al final del capitol'
                : `Aturara en ${sleepTimer} min`}
            </span>
          </div>
        )}

        {/* Progress bar */}
        <div className="audiobook-progress">
          <div className="progress-bar" onClick={handleSeek}>
            <div
              className="progress-fill"
              style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
            />
          </div>
          <div className="progress-times">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="audiobook-controls">
          <button className="control-btn secondary" onClick={skipBack} title="Retrocedir 10s">
            <Rewind10Icon />
          </button>
          <button className="control-btn secondary" onClick={previousTrack} disabled={currentFileIndex === 0}>
            <SkipBackIcon />
          </button>
          <button className="control-btn primary" onClick={togglePlay}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="control-btn secondary" onClick={nextTrack} disabled={currentFileIndex === audiobook.files.length - 1}>
            <SkipForwardIcon />
          </button>
          <button className="control-btn secondary" onClick={skipForward} title="Avançar 30s">
            <Forward30Icon />
          </button>
        </div>

        {/* Extra controls */}
        <div className="audiobook-extra-controls">
          <div className="volume-control">
            <button className="control-btn small" onClick={toggleMute}>
              <VolumeIcon muted={isMuted} />
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider"
            />
          </div>
          <button className="speed-btn" onClick={cyclePlaybackRate}>
            <SpeedIcon />
            <span>{playbackRate}x</span>
          </button>
        </div>
      </main>

      {/* Chapters sidebar */}
      <div className={`sidebar-panel ${showChapters ? 'open' : ''}`}>
        <div className="panel-header">
          <h3>Capitols</h3>
          <button onClick={() => setShowChapters(false)} aria-label="Tancar"><CloseIcon /></button>
        </div>
        <div className="panel-content" ref={chaptersPanelRef}>
          {audiobook.files.map((file, index) => {
            const isCurrent = index === currentFileIndex;
            return (
              <div
                key={file.id}
                ref={isCurrent ? currentChapterRef : null}
                className={`chapter-item ${isCurrent ? 'active' : ''}`}
                onClick={() => selectTrack(index)}
              >
                <span className="chapter-number">{index + 1}</span>
                <div className="chapter-info">
                  <span className="chapter-title">{file.title || file.file_name}</span>
                  <span className="chapter-duration">{formatTime(file.duration)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bookmarks sidebar */}
      <div className={`sidebar-panel ${showBookmarks ? 'open' : ''}`}>
        <div className="panel-header">
          <h3>Marcadors</h3>
          <button onClick={() => setShowBookmarks(false)} aria-label="Tancar"><CloseIcon /></button>
        </div>
        <div className="panel-content">
          {bookmarks.length === 0 ? (
            <div className="empty-panel">
              <BookmarkIcon filled={false} />
              <p>Cap marcador encara</p>
              <span>Prem el boto de marcador per desar la posicio actual</span>
            </div>
          ) : (
            bookmarks.map((bookmark) => (
              <div key={bookmark.id} className="bookmark-item">
                <div className="bookmark-info" onClick={() => goToBookmark(bookmark)}>
                  <span className="bookmark-file">{bookmark.fileTitle}</span>
                  <span className="bookmark-position">{formatTime(bookmark.position)}</span>
                </div>
                <button className="delete-bookmark" onClick={() => removeBookmark(bookmark.id)} aria-label="Eliminar marcador">
                  <CloseIcon />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Settings sidebar */}
      <div className={`sidebar-panel ${showSettings ? 'open' : ''}`}>
        <div className="panel-header">
          <h3>Configuracio</h3>
          <button onClick={() => setShowSettings(false)} aria-label="Tancar"><CloseIcon /></button>
        </div>
        <div className="panel-content">
          {/* Sleep Timer */}
          <div className="settings-section">
            <h4>Temporitzador de son</h4>
            <div className="sleep-options">
              {SLEEP_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`sleep-option ${sleepMode === option.value ? 'active' : ''}`}
                  onClick={() => setSleepTimerMinutes(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Playback Speed */}
          <div className="settings-section">
            <h4>Velocitat de reproduccio</h4>
            <div className="speed-options">
              {SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  className={`speed-option ${playbackRate === speed ? 'active' : ''}`}
                  onClick={() => setSpeed(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Overlay to close panels */}
      {(showChapters || showBookmarks || showSettings) && (
        <div
          className="panel-overlay"
          onClick={() => { setShowChapters(false); setShowBookmarks(false); setShowSettings(false); }}
        />
      )}

      {/* Audio element */}
      {streamUrl && (
        <audio
          ref={audioRef}
          src={streamUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          autoPlay={isPlaying}
        />
      )}
    </div>
  );
}

export default AudiobookPlayer;
