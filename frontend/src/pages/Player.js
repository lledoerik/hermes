import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Hls from 'hls.js';
import { useAuth } from '../context/AuthContext';
import './Player.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

axios.defaults.baseURL = API_URL;

// SVG Icons
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z"/>
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
  </svg>
);

// Icona de retrocedir (cercle amb fletxa anti-horari i número)
const SkipBackIcon = ({ seconds }) => (
  <div className="skip-icon-wrapper">
    <svg viewBox="0 0 24 24" fill="currentColor">
      {/* Fletxa circular anti-horari */}
      <path d="M12.5 3C7.81 3 4 6.81 4 11.5c0 4.69 3.81 8.5 8.5 8.5s8.5-3.81 8.5-8.5h-2c0 3.59-2.91 6.5-6.5 6.5S6 15.09 6 11.5 8.91 5 12.5 5V3z"/>
      <path d="M10.5 3L7 6.5l3.5 3.5V3z"/>
    </svg>
    <span className="skip-seconds">{seconds}</span>
  </div>
);

// Icona d'avançar (cercle amb fletxa horari i número)
const SkipForwardIcon = ({ seconds }) => (
  <div className="skip-icon-wrapper">
    <svg viewBox="0 0 24 24" fill="currentColor">
      {/* Fletxa circular horari */}
      <path d="M11.5 3C16.19 3 20 6.81 20 11.5c0 4.69-3.81 8.5-8.5 8.5S3 16.19 3 11.5h2c0 3.59 2.91 6.5 6.5 6.5s6.5-2.91 6.5-6.5S15.09 5 11.5 5V3z"/>
      <path d="M13.5 3L17 6.5l-3.5 3.5V3z"/>
    </svg>
    <span className="skip-seconds">{seconds}</span>
  </div>
);

const VolumeHighIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
);

const VolumeLowIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
  </svg>
);

const VolumeMuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
  </svg>
);

const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
  </svg>
);

const FullscreenExitIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
  </svg>
);

const SubtitlesIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/>
  </svg>
);

const AudioIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
  </svg>
);

const SpeedIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 8v8l6-4-6-4zm11-5H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
  </svg>
);

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
  </svg>
);

const EpisodesIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
);

// Funció per obtenir el nom de l'idioma
const getLanguageName = (lang) => {
  if (!lang) return 'Desconegut';
  const normalizedLang = lang.toLowerCase().trim();

  const names = {
    'cat': 'Català', 'catalan': 'Català', 'català': 'Català', 'ca': 'Català',
    'spa': 'Castellà', 'esp': 'Castellà', 'spanish': 'Castellà', 'español': 'Castellà', 'castellano': 'Castellà', 'es': 'Castellà', 'cas': 'Castellà',
    'spa-la': 'Hispanoamericà', 'es-la': 'Hispanoamericà', 'es-419': 'Hispanoamericà', 'spanish-latin': 'Hispanoamericà', 'lat': 'Hispanoamericà', 'latino': 'Hispanoamericà',
    'eng': 'Anglès', 'english': 'Anglès', 'en': 'Anglès', 'en-us': 'Anglès',
    'en-gb': 'Anglès Britànic', 'british': 'Anglès Britànic',
    'jap': 'Japonès', 'jpn': 'Japonès', 'japanese': 'Japonès', 'ja': 'Japonès',
    'fre': 'Francès', 'fra': 'Francès', 'french': 'Francès', 'fr': 'Francès',
    'ger': 'Alemany', 'deu': 'Alemany', 'german': 'Alemany', 'de': 'Alemany',
    'ita': 'Italià', 'italian': 'Italià', 'it': 'Italià',
    'por': 'Portuguès', 'portuguese': 'Portuguès', 'pt': 'Portuguès',
    'pt-br': 'Portuguès Brasiler', 'brazilian': 'Portuguès Brasiler',
    'kor': 'Coreà', 'korean': 'Coreà', 'ko': 'Coreà',
    'chi': 'Xinès', 'zho': 'Xinès', 'chinese': 'Xinès', 'zh': 'Xinès',
    'rus': 'Rus', 'russian': 'Rus', 'ru': 'Rus',
  };

  return names[normalizedLang] || 'Desconegut';
};

function Player() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const videoRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressRef = useRef(null);
  const lastTapRef = useRef(0);
  const tapTimeoutRef = useRef(null);
  const playerContainerRef = useRef(null);
  const episodesMenuRef = useRef(null);
  const currentEpisodeRef = useRef(null);

  // Segons per avançar/retrocedir (configurable)
  const skipSeconds = 10;

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [skipIndicator, setSkipIndicator] = useState(null); // 'left', 'right', 'center'
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Popup states
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showEpisodesMenu, setShowEpisodesMenu] = useState(false);

  // Segments (intro, recap, outro) i next episode
  const [segments, setSegments] = useState([]);
  const [nextEpisode, setNextEpisode] = useState(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState([]);
  const [activeSegment, setActiveSegment] = useState(null);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const skipButtonTimerRef = useRef(null);

  // Progress saving
  const progressSaveIntervalRef = useRef(null);
  const [initialProgress, setInitialProgress] = useState(null);

  // Editor d'intros manual
  const [showIntroEditor, setShowIntroEditor] = useState(false);
  const [introStart, setIntroStart] = useState(null);
  const [introEnd, setIntroEnd] = useState(null);
  const [savingIntro, setSavingIntro] = useState(false);
  const [propagatingIntro, setPropagatingIntro] = useState(false);
  const [propagateResult, setPropagateResult] = useState(null);

  // Track selections
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // HLS streaming per canvi de pistes
  const [hlsUrl, setHlsUrl] = useState(null);
  const [isUsingHls, setIsUsingHls] = useState(false);
  const [hlsLoading, setHlsLoading] = useState(false);
  const hlsRef = useRef(null);

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Preferences from localStorage
  const preferredAudioLang = localStorage.getItem('hermes_audio_lang') || 'cat';
  const preferredSubtitleLang = localStorage.getItem('hermes_subtitle_lang') || 'off';

  useEffect(() => {
    loadMedia();
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Keyboard controls
    const handleKeyDown = (e) => {
      if (!videoRef.current || !videoReady) return;

      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(skipSeconds);
          showSkipIndicator('right');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-skipSeconds);
          showSkipIndicator('left');
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.min(1, videoRef.current.volume + 0.1);
            videoRef.current.volume = newVol;
            setVolume(newVol);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.max(0, videoRef.current.volume - 0.1);
            videoRef.current.volume = newVol;
            setVolume(newVol);
          }
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, videoReady]);

  // Gestionar HLS quan canvia l'URL
  useEffect(() => {
    if (!hlsUrl || !videoRef.current) return;

    // Destruir instància HLS anterior si existeix
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });

      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setVideoLoading(false);
        videoRef.current.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('HLS error fatal:', data);
          // Si falla HLS, tornar a streaming directe
          setIsUsingHls(false);
          setHlsUrl(null);
        }
      });

      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari suporta HLS nativament
      videoRef.current.src = hlsUrl;
      videoRef.current.addEventListener('loadedmetadata', () => {
        videoRef.current.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [hlsUrl]);

  // Scroll automàtic a l'episodi actual quan s'obre el menú
  useEffect(() => {
    if (showEpisodesMenu && currentEpisodeRef.current && episodesMenuRef.current) {
      // Utilitzem requestAnimationFrame per assegurar que el DOM està pintat
      requestAnimationFrame(() => {
        // Delay addicional per assegurar que el menú està completament renderitzat
        setTimeout(() => {
          if (currentEpisodeRef.current && episodesMenuRef.current) {
            // Calcular la posició per centrar l'element
            const menu = episodesMenuRef.current;
            const element = currentEpisodeRef.current;
            const menuRect = menu.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();

            // Scroll per centrar l'element al menú
            const scrollTop = element.offsetTop - (menuRect.height / 2) + (elementRect.height / 2);
            menu.scrollTo({
              top: Math.max(0, scrollTop),
              behavior: 'smooth'
            });
          }
        }, 100);
      });
    }
  }, [showEpisodesMenu]);

  const loadMedia = async () => {
    try {
      let response;
      if (type === 'episode') {
        response = await axios.get(`/api/library/episodes/${id}`);
      } else {
        response = await axios.get(`/api/library/movies/${id}`);
      }
      setItem(response.data);

      // Parse audio tracks
      if (response.data.audio_tracks) {
        try {
          const tracks = JSON.parse(response.data.audio_tracks);
          setAudioTracks(tracks);
          const preferredIndex = tracks.findIndex(t =>
            t.language?.toLowerCase().includes(preferredAudioLang)
          );
          if (preferredIndex >= 0) setSelectedAudio(preferredIndex);
        } catch (e) {
          console.error('Error parsing audio tracks:', e);
        }
      }

      // Parse subtitles
      if (response.data.subtitles) {
        try {
          const subs = JSON.parse(response.data.subtitles);
          setSubtitleTracks(subs);
          if (preferredSubtitleLang !== 'off') {
            const preferredIndex = subs.findIndex(s =>
              s.language?.toLowerCase().includes(preferredSubtitleLang)
            );
            if (preferredIndex >= 0) setSelectedSubtitle(preferredIndex);
          }
        } catch (e) {
          console.error('Error parsing subtitles:', e);
        }
      }

      // Carregar segments (intro, recap, outro)
      try {
        const mediaId = type === 'episode' ? id : response.data.media_id;
        if (mediaId) {
          const segmentsRes = await axios.get(`/api/segments/media/${mediaId}`);
          setSegments(segmentsRes.data || []);
        }
      } catch (e) {
        console.log('No hi ha segments definits');
      }

      // Carregar progrés de visualització per continuar on es va quedar
      try {
        const progressRes = await axios.get(`/api/media/${id}/progress`);
        if (progressRes.data && progressRes.data.progress_seconds > 0) {
          setInitialProgress(progressRes.data);
        }
      } catch (e) {
        console.log('No hi ha progrés guardat');
      }

      // Carregar navegació d'episodis (només per sèries)
      if (type === 'episode' && response.data.series_id) {
        const seriesId = response.data.series_id;
        const seasonNum = response.data.season_number;

        // Carregar següent episodi
        try {
          const nextRes = await axios.get(`/api/library/episodes/${id}/next`);
          setNextEpisode(nextRes.data);
        } catch (e) {
          console.log('No hi ha següent episodi');
        }

        // Carregar tots els episodis de la temporada
        try {
          const episodesRes = await axios.get(`/api/library/series/${seriesId}/seasons/${seasonNum}/episodes`);
          setSeriesEpisodes(episodesRes.data || []);
        } catch (e) {
          console.log('No s\'han pogut carregar els episodis');
        }
      }
    } catch (error) {
      console.error('Error carregant media:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFullscreenChange = () => {
    setIsFullscreen(!!document.fullscreenElement);
  };

  const closeAllMenus = () => {
    setShowAudioMenu(false);
    setShowSubtitleMenu(false);
    setShowSpeedMenu(false);
    setShowEpisodesMenu(false);
  };

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    // No amagar si hi ha algun menú obert o si el vídeo està pausat
    if (isPlaying && !showAudioMenu && !showSubtitleMenu && !showSpeedMenu) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        closeAllMenus();
      }, 3000);
    }
  }, [isPlaying, showAudioMenu, showSubtitleMenu, showSpeedMenu]);

  const handleMouseMove = () => {
    showControlsTemporarily();
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    // Utilitzar videoRef.current.paused directament és més fiable que l'estat
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const [hasAutoFullscreen, setHasAutoFullscreen] = useState(false);

  const handleVideoPlay = () => {
    setIsPlaying(true);

    // Auto fullscreen al primer play (especialment per mòbil)
    if (!hasAutoFullscreen && !document.fullscreenElement) {
      setHasAutoFullscreen(true);

      // Intentar entrar a fullscreen
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      }

      // Intentar bloquejar orientació horitzontal (mòbil)
      if (window.screen.orientation && window.screen.orientation.lock) {
        window.screen.orientation.lock('landscape').catch(() => {
          // Si falla, no passa res (alguns navegadors no ho suporten)
        });
      }
    }
  };

  const handleVideoPause = () => {
    setIsPlaying(false);
    // Guardar progrés quan es pausa
    saveProgress();
  };
  const handleVideoWaiting = () => setVideoLoading(true);
  const handleVideoCanPlay = () => {
    setVideoLoading(false);
    setVideoReady(true);

    // Si hi ha progrés inicial, posicionar el vídeo
    if (initialProgress && initialProgress.progress_seconds > 30 && videoRef.current) {
      // Només si no s'ha acabat (< 90%)
      if (initialProgress.progress_percentage < 90) {
        videoRef.current.currentTime = initialProgress.progress_seconds;
      }
      setInitialProgress(null); // Només una vegada
    }
  };

  // Funció per guardar progrés de visualització
  const saveProgress = useCallback(async () => {
    if (!videoRef.current || !id || duration === 0) return;

    const currentSec = videoRef.current.currentTime;
    // Només guardar si s'ha vist més de 10 segons
    if (currentSec < 10) return;

    try {
      await axios.post(`/api/media/${id}/progress`, {
        progress_seconds: currentSec,
        total_seconds: duration
      });
    } catch (error) {
      console.error('Error guardant progrés:', error);
    }
  }, [id, duration]);

  // Guardar progrés periòdicament mentre es reprodueix (cada 15 segons)
  useEffect(() => {
    if (isPlaying && duration > 0) {
      progressSaveIntervalRef.current = setInterval(() => {
        saveProgress();
      }, 15000); // Cada 15 segons
    } else {
      if (progressSaveIntervalRef.current) {
        clearInterval(progressSaveIntervalRef.current);
      }
    }

    return () => {
      if (progressSaveIntervalRef.current) {
        clearInterval(progressSaveIntervalRef.current);
      }
    };
  }, [isPlaying, duration, saveProgress]);

  // Guardar progrés quan l'usuari surt de la pàgina
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveProgress();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Guardar progrés al desmuntar el component
      saveProgress();
    };
  }, [saveProgress]);

  // Funció per mostrar indicador de skip
  const showSkipIndicator = (direction) => {
    setSkipIndicator(direction);
    setTimeout(() => setSkipIndicator(null), 500);
  };

  // Ripple effect per feedback visual al toc
  const [ripple, setRipple] = useState(null);

  const showRipple = (x, y, zone) => {
    setRipple({ x, y, zone });
    setTimeout(() => setRipple(null), 600);
  };

  // Touch handling per doble toc
  const handleTouchStart = (e) => {
    if (!videoReady) return;

    // Ignorar si el toc és sobre els controls (botons, menús, etc.)
    const target = e.target;
    const isControlElement = target.closest('.player-controls') ||
                            target.closest('.control-btn') ||
                            target.closest('.control-menu') ||
                            target.closest('.back-btn') ||
                            target.closest('.skip-segment-btn') ||
                            target.closest('.next-episode-btn') ||
                            target.closest('.intro-editor');

    if (isControlElement) {
      // Si toquem un control, cancel·lar qualsevol timeout d'amagar
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      return;
    }

    const now = Date.now();
    const timeDiff = now - lastTapRef.current;
    const touch = e.touches[0];
    const containerWidth = playerContainerRef.current?.offsetWidth || window.innerWidth;
    const containerHeight = playerContainerRef.current?.offsetHeight || window.innerHeight;
    const touchX = touch.clientX;
    const touchY = touch.clientY;

    // Determinar zona: esquerra (0-33%), centre (33-66%), dreta (66-100%)
    const zone = touchX < containerWidth * 0.33 ? 'left' : touchX > containerWidth * 0.66 ? 'right' : 'center';

    if (timeDiff < 300 && timeDiff > 0) {
      // Doble toc - prevenir comportament per defecte i fer l'acció
      e.preventDefault();
      clearTimeout(tapTimeoutRef.current);
      lastTapRef.current = 0;

      // Mostrar ripple effect
      showRipple(touchX, touchY, zone);

      if (zone === 'left') {
        skip(-skipSeconds);
        showSkipIndicator('left');
      } else if (zone === 'right') {
        skip(skipSeconds);
        showSkipIndicator('right');
      } else {
        togglePlay();
        showSkipIndicator('center');
      }
      // NO canviar l'estat de showControls en doble toc
    } else {
      // Primer toc - esperar per veure si és doble
      lastTapRef.current = now;
      tapTimeoutRef.current = setTimeout(() => {
        // Un sol toc - toggle controls (només si no és doble toc)
        if (showControls) {
          setShowControls(false);
          closeAllMenus();
        } else {
          showControlsTemporarily();
        }
        lastTapRef.current = 0;
      }, 300);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    if (videoRef.current.buffered.length > 0) {
      setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }

    // Detectar segment actiu (intro) - només mostrar si té bona confiança
    const active = segments.find(s =>
      time >= s.start_time &&
      time < s.end_time &&
      s.segment_type === 'intro' &&
      (!s.confidence || s.confidence >= 0.7) // Només si confiança >= 70%
    );

    // Gestionar el delay del botó skip (1.5 segons com Netflix)
    if (active && !activeSegment) {
      // Acaba d'entrar a un segment - iniciar timer
      if (skipButtonTimerRef.current) {
        clearTimeout(skipButtonTimerRef.current);
      }
      skipButtonTimerRef.current = setTimeout(() => {
        setShowSkipButton(true);
      }, 1500); // 1.5 segons de delay
    } else if (!active && activeSegment) {
      // Ha sortit del segment - amagar botó
      if (skipButtonTimerRef.current) {
        clearTimeout(skipButtonTimerRef.current);
      }
      setShowSkipButton(false);
    }

    setActiveSegment(active || null);

    // Mostrar "Següent capítol" quan estem als últims 30 segons o després de l'outro
    if (duration > 0 && nextEpisode) {
      const outroSegment = segments.find(s => s.segment_type === 'outro' || s.segment_type === 'credits');
      const isInOutro = outroSegment && time >= outroSegment.start_time;
      const isNearEnd = time >= duration - 30;
      setShowNextEpisode(isInOutro || isNearEnd);
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  // Funcions per saltar segments
  const skipIntro = () => {
    if (!videoRef.current || !activeSegment) return;
    videoRef.current.currentTime = activeSegment.end_time;
    setActiveSegment(null);
    setShowSkipButton(false);
    if (skipButtonTimerRef.current) {
      clearTimeout(skipButtonTimerRef.current);
    }
  };

  // Funcions per l'editor d'intros
  const toggleIntroEditor = () => {
    if (!showIntroEditor) {
      // Obrir editor - carregar intro existent si n'hi ha
      const existingIntro = segments.find(s => s.segment_type === 'intro');
      if (existingIntro) {
        setIntroStart(existingIntro.start_time);
        setIntroEnd(existingIntro.end_time);
      } else {
        setIntroStart(null);
        setIntroEnd(null);
      }
    }
    setShowIntroEditor(!showIntroEditor);
    closeAllMenus();
  };

  const markIntroStart = () => {
    if (videoRef.current) {
      setIntroStart(Math.floor(videoRef.current.currentTime * 10) / 10);
    }
  };

  const markIntroEnd = () => {
    if (videoRef.current) {
      setIntroEnd(Math.floor(videoRef.current.currentTime * 10) / 10);
    }
  };

  const previewIntro = () => {
    if (videoRef.current && introStart !== null) {
      videoRef.current.currentTime = introStart;
    }
  };

  const saveIntro = async (applyToAll = false) => {
    if (introStart === null || introEnd === null || introStart >= introEnd) {
      alert('Has de marcar inici i fi de la intro (fi > inici)');
      return;
    }

    setSavingIntro(true);
    try {
      if (applyToAll && item?.series_id) {
        // Guardar per tota la sèrie
        await axios.post(`/api/segments/series/${item.series_id}`, {
          segment_type: 'intro',
          start_time: introStart,
          end_time: introEnd
        });
      } else {
        // Guardar només per aquest episodi
        await axios.post(`/api/segments/media/${id}`, {
          segment_type: 'intro',
          start_time: introStart,
          end_time: introEnd
        });
      }

      // Recarregar segments
      const segmentsRes = await axios.get(`/api/segments/media/${id}`);
      setSegments(segmentsRes.data || []);

      setShowIntroEditor(false);
      alert(applyToAll ? 'Intro guardada per tots els episodis!' : 'Intro guardada!');
    } catch (error) {
      console.error('Error guardant intro:', error);
      alert('Error guardant la intro');
    } finally {
      setSavingIntro(false);
    }
  };

  const deleteIntro = async () => {
    if (!window.confirm('Segur que vols eliminar la intro d\'aquest episodi?')) return;

    try {
      const existingIntro = segments.find(s => s.segment_type === 'intro');
      if (existingIntro) {
        await axios.delete(`/api/segments/${existingIntro.id}`);

        // Recarregar segments
        const segmentsRes = await axios.get(`/api/segments/media/${id}`);
        setSegments(segmentsRes.data || []);

        setIntroStart(null);
        setIntroEnd(null);
        alert('Intro eliminada!');
      }
    } catch (error) {
      console.error('Error eliminant intro:', error);
      alert('Error eliminant la intro');
    }
  };

  const propagateIntroToAll = async () => {
    if (introStart === null || introEnd === null || introStart >= introEnd) {
      alert('Has de marcar inici i fi de la intro primer');
      return;
    }

    if (!window.confirm(
      'Això buscarà l\'àudio d\'aquesta intro a cada episodi de la sèrie i guardarà ' +
      'temps individuals per cada un. Pot trigar uns minuts. Continuar?'
    )) return;

    setPropagatingIntro(true);
    setPropagateResult(null);

    try {
      // Primer guardar la intro d'aquest episodi
      await axios.post(`/api/segments/media/${id}`, {
        segment_type: 'intro',
        start_time: introStart,
        end_time: introEnd
      });

      // Propagar a tots els episodis
      const response = await axios.post(`/api/segments/episode/${id}/propagate`, {
        intro_start: introStart,
        intro_end: introEnd
      });

      setPropagateResult(response.data);

      // Recarregar segments
      const segmentsRes = await axios.get(`/api/segments/media/${id}`);
      setSegments(segmentsRes.data || []);

    } catch (error) {
      console.error('Error propagant intro:', error);
      setPropagateResult({ status: 'error', message: 'Error de connexió' });
    } finally {
      setPropagatingIntro(false);
    }
  };

  const goToNextEpisode = () => {
    if (!nextEpisode) return;
    // Guardar progrés abans de navegar al següent episodi
    saveProgress();
    navigate(`/play/episode/${nextEpisode.id}`);
  };

  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(0);

  const calculateTimeFromPosition = useCallback((clientX) => {
    if (!progressRef.current || !duration) return 0;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent * duration;
  }, [duration]);

  const handleProgressMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const newTime = calculateTimeFromPosition(e.clientX);
    setDragTime(newTime);
  };

  const handleProgressTouchStart = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const touch = e.touches[0];
    const newTime = calculateTimeFromPosition(touch.clientX);
    setDragTime(newTime);
  };

  const handleProgressMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const newTime = calculateTimeFromPosition(e.clientX);
    setDragTime(newTime);
  }, [isDragging, calculateTimeFromPosition]);

  const handleProgressTouchMove = useCallback((e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const newTime = calculateTimeFromPosition(touch.clientX);
    setDragTime(newTime);
  }, [isDragging, calculateTimeFromPosition]);

  const handleProgressMouseUp = useCallback((e) => {
    if (!isDragging || !videoRef.current) return;
    setIsDragging(false);
    const newTime = calculateTimeFromPosition(e.clientX);
    videoRef.current.currentTime = newTime;
  }, [isDragging, calculateTimeFromPosition]);

  const handleProgressTouchEnd = useCallback((e) => {
    if (!isDragging || !videoRef.current) return;
    setIsDragging(false);
    // Usar l'última posició guardada (dragTime) perquè touchend no té touches
    videoRef.current.currentTime = dragTime;
  }, [isDragging, dragTime]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleProgressMouseMove);
      document.addEventListener('mouseup', handleProgressMouseUp);
      document.addEventListener('touchmove', handleProgressTouchMove, { passive: false });
      document.addEventListener('touchend', handleProgressTouchEnd);
      return () => {
        document.removeEventListener('mousemove', handleProgressMouseMove);
        document.removeEventListener('mouseup', handleProgressMouseUp);
        document.removeEventListener('touchmove', handleProgressTouchMove);
        document.removeEventListener('touchend', handleProgressTouchEnd);
      };
    }
  }, [isDragging, handleProgressMouseMove, handleProgressMouseUp, handleProgressTouchMove, handleProgressTouchEnd]);

  const handleProgressClick = (e) => {
    if (!progressRef.current || !videoRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = percent * duration;
  };

  const handleProgressHover = (e) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(percent * duration);
    setHoverPosition(percent * 100);
  };

  const handleProgressLeave = () => {
    setHoverTime(null);
  };

  const skip = (seconds) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Funció per sortir de fullscreen i desbloquejar orientació
  const exitFullscreenMode = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (window.screen.orientation && window.screen.orientation.unlock) {
      window.screen.orientation.unlock();
    }
  };

  // Cleanup quan es desmunta el component
  useEffect(() => {
    return () => {
      exitFullscreenMode();
      if (skipButtonTimerRef.current) {
        clearTimeout(skipButtonTimerRef.current);
      }
    };
  }, []);

  // Focus el contenidor quan el vídeo està llest per permetre controls de teclat
  useEffect(() => {
    if (videoReady && playerContainerRef.current) {
      playerContainerRef.current.focus();
    }
  }, [videoReady]);

  const handleBack = () => {
    exitFullscreenMode();
    if (item?.series_id) {
      navigate(`/series/${item.series_id}`);
    } else {
      navigate(-1);
    }
  };

  // Funció per crear un stream HLS amb les pistes seleccionades
  const createHlsStream = async (audioArrayIndex, subtitleArrayIndex) => {
    if (!item) return;

    // Guardar posició actual
    const currentPosition = videoRef.current ? videoRef.current.currentTime : 0;

    setHlsLoading(true);
    setVideoLoading(true);

    // Obtenir l'índex real del stream (no l'índex de l'array)
    // Els tracks tenen un camp 'index' que és l'índex real del stream al fitxer
    const actualAudioIndex = audioArrayIndex >= 0 && audioTracks[audioArrayIndex]
      ? audioTracks[audioArrayIndex].index
      : null;
    const actualSubtitleIndex = subtitleArrayIndex >= 0 && subtitleTracks[subtitleArrayIndex]
      ? subtitleTracks[subtitleArrayIndex].index
      : null;

    try {
      // Cridar l'API per crear el stream HLS amb els índexs reals
      const response = await axios.post(`/api/stream/${id}/hls`, {
        audio_index: actualAudioIndex,
        subtitle_index: actualSubtitleIndex,
        quality: '1080p'
      });

      if (response.data.playlist_url) {
        const fullUrl = `${API_URL}${response.data.playlist_url}`;

        // Esperar que el playlist estigui disponible (FFmpeg necessita temps)
        const waitForPlaylist = async (url, maxAttempts = 20) => {
          for (let i = 0; i < maxAttempts; i++) {
            try {
              const checkResponse = await axios.head(url);
              if (checkResponse.status === 200) {
                return true;
              }
            } catch {
              // Playlist encara no disponible, esperar
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          return false;
        };

        const playlistReady = await waitForPlaylist(fullUrl);

        if (playlistReady) {
          setHlsUrl(fullUrl);
          setIsUsingHls(true);

          // Restaurar posició després de carregar
          setTimeout(() => {
            if (videoRef.current && currentPosition > 0) {
              videoRef.current.currentTime = currentPosition;
            }
          }, 500);
        } else {
          console.error('Timeout esperant el playlist HLS');
        }
      }
    } catch (error) {
      console.error('Error creant stream HLS:', error);
      // Si falla, mantenir el vídeo actual
    } finally {
      setHlsLoading(false);
    }
  };

  const handleAudioChange = async (index) => {
    setSelectedAudio(index);
    if (audioTracks[index]?.language) {
      localStorage.setItem('hermes_audio_lang', audioTracks[index].language.toLowerCase());
    }
    setShowAudioMenu(false);

    // Crear nou stream HLS amb la pista d'àudio seleccionada
    await createHlsStream(index, selectedSubtitle);
  };

  const handleSubtitleChange = async (index) => {
    setSelectedSubtitle(index);
    if (index === -1) {
      localStorage.setItem('hermes_subtitle_lang', 'off');
    } else if (subtitleTracks[index]?.language) {
      localStorage.setItem('hermes_subtitle_lang', subtitleTracks[index].language.toLowerCase());
    }
    setShowSubtitleMenu(false);

    // Crear nou stream HLS amb els subtítols seleccionats
    await createHlsStream(selectedAudio, index);
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const getVideoUrl = () => {
    if (type === 'episode') {
      return `${API_URL}/api/stream/episode/${id}`;
    }
    return `${API_URL}/api/stream/movie/${id}`;
  };

  const VolumeIcon = () => {
    if (isMuted || volume === 0) return <VolumeMuteIcon />;
    if (volume > 0.5) return <VolumeHighIcon />;
    return <VolumeLowIcon />;
  };

  if (loading) {
    return (
      <div className="player-container">
        <div className="player-loading">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={playerContainerRef}
      className="player-container"
      tabIndex={0}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onClick={(e) => {
        // Assegurar focus per controls de teclat
        if (playerContainerRef.current) {
          playerContainerRef.current.focus();
        }
        // Només per desktop - evitar conflicte amb touch
        if (e.target === e.currentTarget && !('ontouchstart' in window)) {
          if (showControls) {
            setShowControls(false);
            closeAllMenus();
          } else {
            showControlsTemporarily();
          }
        }
      }}
    >
      <div className="player-wrapper">
        <video
          ref={videoRef}
          className="video-player"
          src={isUsingHls ? undefined : getVideoUrl()}
          autoPlay
          onPlay={handleVideoPlay}
          onPause={handleVideoPause}
          onWaiting={handleVideoWaiting}
          onCanPlay={handleVideoCanPlay}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        />

        {(videoLoading || hlsLoading) && (
          <div className="player-loading">
            <div className="loading-spinner"></div>
            {hlsLoading && <div className="loading-text">Canviant pista...</div>}
          </div>
        )}

        {/* Ripple effect i indicador de zona per doble toc */}
        {ripple && (
          <>
            <div
              className={`tap-ripple ${ripple.zone}`}
              style={{ left: ripple.x, top: ripple.y }}
            />
            {/* Indicador de zona només per esquerra/dreta */}
            {(ripple.zone === 'left' || ripple.zone === 'right') && (
              <div className={`tap-zone-indicator ${ripple.zone}`} />
            )}
          </>
        )}

        {/* Indicadors de skip/play per doble toc */}
        {skipIndicator && (
          <div className={`skip-indicator ${skipIndicator}`}>
            {skipIndicator === 'left' && <SkipBackIcon seconds={skipSeconds} />}
            {skipIndicator === 'right' && <SkipForwardIcon seconds={skipSeconds} />}
            {skipIndicator === 'center' && (isPlaying ? <PauseIcon /> : <PlayIcon />)}
          </div>
        )}

        {/* Botó Saltar Intro - amb delay de 1.5s com Netflix */}
        {showSkipButton && activeSegment && (
          <button className="skip-segment-btn" onClick={skipIntro}>
            Saltar intro
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
          </button>
        )}

        {/* Botó següent capítol - visible quan s'acosta al final */}
        {showNextEpisode && nextEpisode && (
          <button className="next-episode-btn" onClick={goToNextEpisode}>
            Següent capítol
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
          </button>
        )}

        {/* Editor d'intros */}
        {showIntroEditor && (
          <div className="intro-editor">
            <div className="intro-editor-header">
              <h3>Editor d'Intro</h3>
              <button className="close-editor" onClick={() => {
                setShowIntroEditor(false);
                setPropagateResult(null);
              }}>×</button>
            </div>

            <div className="intro-editor-content">
              {/* Estat actual de la intro */}
              {segments.find(s => s.segment_type === 'intro') ? (
                <div className="intro-status intro-status-found">
                  Intro definida: {formatTime(segments.find(s => s.segment_type === 'intro').start_time)} - {formatTime(segments.find(s => s.segment_type === 'intro').end_time)}
                </div>
              ) : (
                <div className="intro-status intro-status-missing">
                  Cap intro definida per aquest episodi
                </div>
              )}

              <div className="intro-times">
                <div className="time-field">
                  <label>Inici:</label>
                  <span className="time-value">
                    {introStart !== null ? formatTime(introStart) : '--:--'}
                  </span>
                  <button onClick={markIntroStart} className="mark-btn">
                    Marcar actual
                  </button>
                </div>
                <div className="time-field">
                  <label>Fi:</label>
                  <span className="time-value">
                    {introEnd !== null ? formatTime(introEnd) : '--:--'}
                  </span>
                  <button onClick={markIntroEnd} className="mark-btn">
                    Marcar actual
                  </button>
                </div>
              </div>

              {introStart !== null && introEnd !== null && (
                <div className="intro-duration">
                  Duració: {formatTime(introEnd - introStart)}
                </div>
              )}

              <div className="intro-editor-actions">
                <button onClick={previewIntro} disabled={introStart === null}>
                  Previsualitzar
                </button>
                <button onClick={() => saveIntro(false)} disabled={savingIntro}>
                  {savingIntro ? 'Guardant...' : 'Guardar'}
                </button>
                {segments.find(s => s.segment_type === 'intro') && (
                  <button onClick={deleteIntro} className="delete-btn">
                    Eliminar
                  </button>
                )}
              </div>

              {/* Propagació intel·ligent */}
              {item?.series_id && (
                <div className="intro-propagate-section">
                  <div className="section-divider">Aplicar a tota la sèrie</div>
                  <button
                    onClick={propagateIntroToAll}
                    disabled={propagatingIntro || introStart === null || introEnd === null}
                    className="propagate-btn"
                  >
                    {propagatingIntro ? 'Buscant intro a cada episodi...' : 'Detectar en tots els episodis'}
                  </button>
                  <p className="propagate-help">
                    Busca l'àudio d'aquesta intro a cada episodi i guarda temps individuals
                    (gestiona cold opens i variacions)
                  </p>

                  {/* Resultats de propagació */}
                  {propagateResult && (
                    <div className={`propagate-result ${propagateResult.status}`}>
                      {propagateResult.status === 'success' ? (
                        <>
                          <div className="result-summary">
                            ✓ {propagateResult.episodes_found} trobats
                            {propagateResult.episodes_not_found > 0 &&
                              ` · ${propagateResult.episodes_not_found} sense intro`
                            }
                          </div>
                          {propagateResult.details?.filter(d => d.status === 'not_found').length > 0 && (
                            <div className="result-details">
                              Sense intro: {propagateResult.details
                                .filter(d => d.status === 'not_found')
                                .map(d => `T${d.season}E${d.episode}`)
                                .join(', ')
                              }
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="result-error">
                          Error: {propagateResult.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="intro-editor-help">
                <p>Navega pel vídeo i marca l'inici i fi de la intro</p>
              </div>
            </div>
          </div>
        )}

        {/* Controls només visibles quan el vídeo està llest */}
        {videoReady && (
          <div className={`player-controls ${showControls ? 'visible' : 'hidden'}`}>
          {/* Top Bar */}
          <div className="player-top-bar">
            <button className="back-btn" onClick={handleBack}>
              <BackIcon />
              <span>Tornar</span>
            </button>
            <div className="player-title">
              <h2>{item?.name || 'Reproduint'}</h2>
              {item?.series_name && (
                <span>{item.series_name} - T{item.season_number} E{item.episode_number}</span>
              )}
            </div>
            <div style={{ width: '100px' }}></div>
          </div>

          {/* Center Controls - només play/pause */}
          <div className="player-center">
            <button className="center-btn play-pause-btn" onClick={togglePlay}>
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
          </div>

          {/* Bottom Bar */}
          <div className="player-bottom-bar">
            {/* Progress Bar */}
            <div className="progress-container">
              <div
                ref={progressRef}
                className={`progress-bar ${isDragging ? 'dragging' : ''}`}
                onMouseDown={handleProgressMouseDown}
                onMouseMove={handleProgressHover}
                onMouseLeave={handleProgressLeave}
                onClick={handleProgressClick}
                onTouchStart={handleProgressTouchStart}
              >
                {hoverTime !== null && (
                  <div
                    className="progress-tooltip"
                    style={{ left: `${hoverPosition}%` }}
                  >
                    {formatTime(hoverTime)}
                  </div>
                )}
                <div
                  className="progress-buffered"
                  style={{ width: `${(buffered / duration) * 100}%` }}
                />
                <div
                  className="progress-played"
                  style={{ width: `${((isDragging ? dragTime : currentTime) / duration) * 100}%` }}
                />
                <div
                  className="progress-handle"
                  style={{ left: `${((isDragging ? dragTime : currentTime) / duration) * 100}%` }}
                />
              </div>
              <div className="time-display">
                <span>{formatTime(isDragging ? dragTime : currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Bottom Controls Row */}
            <div className="bottom-controls">
              <div className="left-controls">
                <button className="control-btn" onClick={togglePlay}>
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button className="control-btn" onClick={() => skip(-skipSeconds)}>
                  <SkipBackIcon seconds={skipSeconds} />
                </button>
                <button className="control-btn" onClick={() => skip(skipSeconds)}>
                  <SkipForwardIcon seconds={skipSeconds} />
                </button>
                <div className="volume-control">
                  <button className="control-btn" onClick={toggleMute}>
                    <VolumeIcon />
                  </button>
                  <div className="volume-slider">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                    />
                  </div>
                </div>
              </div>

              <div className="right-controls">
                {/* Speed Button */}
                <div className="control-wrapper">
                  <button
                    className={`control-btn ${showSpeedMenu ? 'active' : ''}`}
                    onClick={() => {
                      const wasOpen = showSpeedMenu;
                      closeAllMenus();
                      if (!wasOpen) setShowSpeedMenu(true);
                    }}
                    title="Velocitat"
                  >
                    <SpeedIcon />
                    {playbackSpeed !== 1 && (
                      <span className="control-badge">{playbackSpeed}x</span>
                    )}
                  </button>
                  {showSpeedMenu && (
                    <div className="control-menu">
                      <div className="menu-header">Velocitat</div>
                      {speeds.map((speed) => (
                        <div
                          key={speed}
                          className={`menu-item ${playbackSpeed === speed ? 'selected' : ''}`}
                          onClick={() => handleSpeedChange(speed)}
                        >
                          {playbackSpeed === speed && <span className="check-icon">&#10003;</span>}
                          <span>{speed === 1 ? 'Normal' : `${speed}x`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Audio Button */}
                <div className="control-wrapper">
                  <button
                    className={`control-btn ${showAudioMenu ? 'active' : ''}`}
                    onClick={() => {
                      const wasOpen = showAudioMenu;
                      closeAllMenus();
                      if (!wasOpen) setShowAudioMenu(true);
                    }}
                    title="Audio"
                  >
                    <AudioIcon />
                  </button>
                  {showAudioMenu && (
                    <div className="control-menu">
                      <div className="menu-header">Audio</div>
                      {audioTracks.length > 0 ? (
                        audioTracks.map((track, index) => (
                          <div
                            key={index}
                            className={`menu-item ${selectedAudio === index ? 'selected' : ''}`}
                            onClick={() => handleAudioChange(index)}
                          >
                            {selectedAudio === index && <span className="check-icon">&#10003;</span>}
                            <div className="track-info">
                              <span className="track-name">
                                {getLanguageName(track.language)}
                              </span>
                              {track.codec && (
                                <span className="track-detail">
                                  {track.codec} {track.channels ? `${track.channels}ch` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="menu-item disabled">No hi ha pistes alternatives</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Subtitles Button */}
                <div className="control-wrapper">
                  <button
                    className={`control-btn ${showSubtitleMenu ? 'active' : ''} ${selectedSubtitle >= 0 ? 'has-selection' : ''}`}
                    onClick={() => {
                      const wasOpen = showSubtitleMenu;
                      closeAllMenus();
                      if (!wasOpen) setShowSubtitleMenu(true);
                    }}
                    title="Subtitols"
                  >
                    <SubtitlesIcon />
                  </button>
                  {showSubtitleMenu && (
                    <div className="control-menu">
                      <div className="menu-header">Subtitols</div>
                      <div
                        className={`menu-item ${selectedSubtitle === -1 ? 'selected' : ''}`}
                        onClick={() => handleSubtitleChange(-1)}
                      >
                        {selectedSubtitle === -1 && <span className="check-icon">&#10003;</span>}
                        <span>Desactivats</span>
                      </div>
                      {subtitleTracks.map((track, index) => (
                        <div
                          key={index}
                          className={`menu-item ${selectedSubtitle === index ? 'selected' : ''}`}
                          onClick={() => handleSubtitleChange(index)}
                        >
                          {selectedSubtitle === index && <span className="check-icon">&#10003;</span>}
                          <div className="track-info">
                            <span className="track-name">
                              {getLanguageName(track.language)}
                            </span>
                            {track.forced && <span className="track-detail">Forçat</span>}
                          </div>
                        </div>
                      ))}
                      {subtitleTracks.length === 0 && (
                        <div className="menu-item disabled">No hi ha subtitols</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Episodes Button (només per sèries) */}
                {type === 'episode' && seriesEpisodes.length > 0 && (
                  <div className="control-wrapper">
                    <button
                      className={`control-btn ${showEpisodesMenu ? 'active' : ''}`}
                      onClick={() => {
                        const wasOpen = showEpisodesMenu;
                        closeAllMenus();
                        if (!wasOpen) setShowEpisodesMenu(true);
                      }}
                      title="Capítols"
                    >
                      <EpisodesIcon />
                    </button>
                    {showEpisodesMenu && (
                      <div className="control-menu episodes-menu" ref={episodesMenuRef}>
                        <div className="menu-header">
                          Temporada {item?.season_number}
                        </div>
                        {seriesEpisodes.map((ep) => {
                          const isCurrent = ep.id === parseInt(id);
                          return (
                            <div
                              key={ep.id}
                              ref={isCurrent ? currentEpisodeRef : null}
                              className={`menu-item ${isCurrent ? 'selected current' : ''}`}
                              onClick={() => {
                                if (!isCurrent) {
                                  navigate(`/play/episode/${ep.id}`);
                                }
                                setShowEpisodesMenu(false);
                              }}
                            >
                              {isCurrent && <span className="check-icon"><PlayIcon /></span>}
                              <span className="episode-num">{ep.episode_number}.</span>
                              <span className="episode-title">{ep.title || `Episodi ${ep.episode_number}`}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Edit Intro Button (només per episodis i admins) */}
                {type === 'episode' && isAdmin && (
                  <button
                    className={`control-btn ${showIntroEditor ? 'active' : ''}`}
                    onClick={toggleIntroEditor}
                    title="Editar intro"
                  >
                    <EditIcon />
                  </button>
                )}

                {/* Fullscreen Button */}
                <button className="control-btn" onClick={toggleFullscreen}>
                  {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </button>
              </div>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Player;
