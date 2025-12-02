import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './StreamPlayer.css';

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

// SVG Icons
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
  </svg>
);

const ServerIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
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

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
  </svg>
);

const PrevIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
  </svg>
);

const NextIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
  </svg>
);

const EpisodesIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
  </svg>
);

const LanguageIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
  </svg>
);

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
  </svg>
);

const PlayCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
  </svg>
);

// Idiomes disponibles (preferits)
const PREFERRED_LANGUAGES = [
  { code: 'ca', name: 'Català', flag: '🇦🇩' },
  { code: 'en', name: 'Anglès', flag: '🇬🇧' },
  { code: 'es', name: 'Castellà', flag: '🇪🇸' },
  { code: 'es-419', name: 'Espanyol (Llatí)', flag: '🇲🇽' },
  { code: 'fr', name: 'Francès', flag: '🇫🇷' },
  { code: 'it', name: 'Italià', flag: '🇮🇹' },
];

// Mapa de codis d'idioma a noms i banderes
const LANGUAGE_INFO = {
  'ca': { name: 'Català', flag: '🇦🇩' },
  'en': { name: 'Anglès', flag: '🇬🇧' },
  'es': { name: 'Castellà', flag: '🇪🇸' },
  'es-419': { name: 'Espanyol (Llatí)', flag: '🇲🇽' },
  'fr': { name: 'Francès', flag: '🇫🇷' },
  'it': { name: 'Italià', flag: '🇮🇹' },
  'de': { name: 'Alemany', flag: '🇩🇪' },
  'pt': { name: 'Portuguès', flag: '🇵🇹' },
  'ja': { name: 'Japonès', flag: '🇯🇵' },
  'ko': { name: 'Coreà', flag: '🇰🇷' },
  'zh': { name: 'Xinès', flag: '🇨🇳' },
  'ru': { name: 'Rus', flag: '🇷🇺' },
  'ar': { name: 'Àrab', flag: '🇸🇦' },
  'hi': { name: 'Hindi', flag: '🇮🇳' },
  'nl': { name: 'Neerlandès', flag: '🇳🇱' },
  'pl': { name: 'Polonès', flag: '🇵🇱' },
  'sv': { name: 'Suec', flag: '🇸🇪' },
  'da': { name: 'Danès', flag: '🇩🇰' },
  'no': { name: 'Noruec', flag: '🇳🇴' },
  'fi': { name: 'Finès', flag: '🇫🇮' },
  'tr': { name: 'Turc', flag: '🇹🇷' },
  'el': { name: 'Grec', flag: '🇬🇷' },
  'he': { name: 'Hebreu', flag: '🇮🇱' },
  'th': { name: 'Tailandès', flag: '🇹🇭' },
  'vi': { name: 'Vietnamita', flag: '🇻🇳' },
  'id': { name: 'Indonesi', flag: '🇮🇩' },
  'ms': { name: 'Malai', flag: '🇲🇾' },
  'tl': { name: 'Tagal', flag: '🇵🇭' },
  'uk': { name: 'Ucraïnès', flag: '🇺🇦' },
  'cs': { name: 'Txec', flag: '🇨🇿' },
  'hu': { name: 'Hongarès', flag: '🇭🇺' },
  'ro': { name: 'Romanès', flag: '🇷🇴' },
};

// Helper per afegir paràmetres a URL
const addParams = (url, params) => {
  const separator = url.includes('?') ? '&' : '?';
  const paramStr = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return paramStr ? `${url}${separator}${paramStr}` : url;
};

// Fonts d'embed disponibles amb suport d'idioma i autoplay
// Nota: Algunes fonts tenen millor disponibilitat d'idiomes que d'altres
const EMBED_SOURCES = [
  {
    id: 'vidsrc',
    name: 'VidSrc',
    supportsLang: true,
    description: 'Multi-idioma',
    getUrl: (type, tmdbId, season, episode, lang) => {
      const base = type === 'movie'
        ? `https://vidsrc.cc/v2/embed/movie/${tmdbId}`
        : `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
      return addParams(base, { ds_lang: lang, autoplay: 1 });
    }
  },
  {
    id: 'vidsrc-pro',
    name: 'VidSrc Pro',
    supportsLang: true,
    description: 'Multi-servidor',
    getUrl: (type, tmdbId, season, episode, lang) => {
      const base = type === 'movie'
        ? `https://vidsrc.pro/embed/movie/${tmdbId}`
        : `https://vidsrc.pro/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
      return addParams(base, { ds_lang: lang });
    }
  },
  {
    id: 'vidsrc2',
    name: 'VidSrc 2',
    supportsLang: true,
    description: 'Alternatiu',
    getUrl: (type, tmdbId, season, episode, lang) => {
      const base = type === 'movie'
        ? `https://vidsrc.xyz/embed/movie/${tmdbId}`
        : `https://vidsrc.xyz/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
      return addParams(base, { ds_lang: lang, autoplay: 1 });
    }
  },
  {
    id: 'superembed',
    name: 'SuperEmbed',
    supportsLang: true,
    description: 'Multi-idioma + subtítols',
    getUrl: (type, tmdbId, season, episode, lang) => {
      // SuperEmbed utilitza IMDb ID o TMDB ID
      if (type === 'movie') {
        return `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&lang=${lang}`;
      }
      return `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}&lang=${lang}`;
    }
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed',
    supportsLang: true,
    description: 'Auto-detecció',
    getUrl: (type, tmdbId, season, episode, lang) => {
      const base = type === 'movie'
        ? `https://player.autoembed.cc/embed/movie/${tmdbId}`
        : `https://player.autoembed.cc/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`;
      return addParams(base, { lang, autoplay: 1 });
    }
  },
  {
    id: 'embedsu',
    name: 'Embed.su',
    supportsLang: true,
    description: 'Alta qualitat',
    getUrl: (type, tmdbId, season, episode, lang) => {
      if (type === 'movie') {
        return addParams(`https://embed.su/embed/movie/${tmdbId}`, { autoplay: 1, lang });
      }
      return addParams(`https://embed.su/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`, { autoplay: 1, lang });
    }
  },
  {
    id: '2embed',
    name: '2Embed',
    supportsLang: false,
    description: 'Bàsic',
    getUrl: (type, tmdbId, season, episode) => {
      if (type === 'movie') {
        return addParams(`https://www.2embed.cc/embed/${tmdbId}`, { autoplay: 1 });
      }
      return `https://www.2embed.cc/embedtv/${tmdbId}&s=${season || 1}&e=${episode || 1}&autoplay=1`;
    }
  },
  {
    id: 'multiembed',
    name: 'MultiEmbed',
    supportsLang: true,
    description: 'Multi-servidor',
    getUrl: (type, tmdbId, season, episode, lang) => {
      if (type === 'movie') {
        return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&autoplay=1&lang=${lang}`;
      }
      return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}&autoplay=1&lang=${lang}`;
    }
  },
  {
    id: 'smashystream',
    name: 'SmashyStream',
    supportsLang: true,
    description: 'Anime + Sèries',
    getUrl: (type, tmdbId, season, episode, lang) => {
      if (type === 'movie') {
        return `https://player.smashy.stream/movie/${tmdbId}?lang=${lang}`;
      }
      return `https://player.smashy.stream/tv/${tmdbId}?s=${season || 1}&e=${episode || 1}&lang=${lang}`;
    }
  },
  {
    id: 'moviesapi',
    name: 'MoviesAPI',
    supportsLang: true,
    description: 'Multi-qualitat',
    getUrl: (type, tmdbId, season, episode, lang) => {
      if (type === 'movie') {
        return `https://moviesapi.club/movie/${tmdbId}?lang=${lang}`;
      }
      return `https://moviesapi.club/tv/${tmdbId}-${season || 1}-${episode || 1}?lang=${lang}`;
    }
  },
];

function StreamPlayer() {
  const { type, tmdbId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const episodesMenuRef = useRef(null);
  const langMenuRef = useRef(null);

  // Parsejar paràmetres de la URL (season, episode)
  const searchParams = new URLSearchParams(location.search);
  const season = searchParams.get('s') ? parseInt(searchParams.get('s')) : null;
  const episode = searchParams.get('e') ? parseInt(searchParams.get('e')) : null;

  // Info del contingut (passada per state o carregada)
  const [mediaInfo, setMediaInfo] = useState(location.state?.mediaInfo || null);
  const [episodes, setEpisodes] = useState([]);
  const [seasons, setSeasons] = useState([]);

  // Carregar font preferida de localStorage
  const getInitialSource = () => {
    const saved = localStorage.getItem('hermes_stream_source');
    if (saved) {
      const index = EMBED_SOURCES.findIndex(s => s.id === saved);
      if (index >= 0) return index;
    }
    return 0;
  };

  // Carregar idioma preferit de localStorage
  const getInitialLanguage = () => {
    return localStorage.getItem('hermes_stream_lang') || 'ca';
  };

  const [currentSourceIndex, setCurrentSourceIndex] = useState(getInitialSource);
  const [preferredLang, setPreferredLang] = useState(getInitialLanguage);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [showEpisodesMenu, setShowEpisodesMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showLangTip, setShowLangTip] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStartOverlay, setShowStartOverlay] = useState(true);
  const [langChangeMessage, setLangChangeMessage] = useState(null);

  const currentSource = EMBED_SOURCES[currentSourceIndex];
  const mediaType = type === 'movie' ? 'movie' : 'tv';

  // Calcular idiomes disponibles basant-se en la info del media
  const availableLanguages = React.useMemo(() => {
    if (!mediaInfo) return PREFERRED_LANGUAGES;

    // Obtenir idiomes del contingut (spoken_languages per películes, languages per TV)
    const mediaLangs = mediaInfo.spoken_languages || mediaInfo.languages || [];
    const originalLang = mediaInfo.original_language;

    // Crear llista d'idiomes disponibles
    const available = [];
    const addedCodes = new Set();

    // Afegir idioma original primer si existeix
    if (originalLang && !addedCodes.has(originalLang)) {
      const langInfo = LANGUAGE_INFO[originalLang];
      if (langInfo) {
        available.push({
          code: originalLang,
          name: `${langInfo.name} (Original)`,
          flag: langInfo.flag,
          isOriginal: true
        });
        addedCodes.add(originalLang);
      }
    }

    // Afegir idiomes preferits que estiguin disponibles al contingut
    const mediaLangCodes = mediaLangs.map(l => l.iso_639_1);

    PREFERRED_LANGUAGES.forEach(lang => {
      if (!addedCodes.has(lang.code)) {
        // Afegir si està a la llista de spoken_languages o si és un idioma comú de doblatge
        const isInMedia = mediaLangCodes.includes(lang.code);
        // Sempre afegir anglès, castellà i els preferits principals (normalment tenen doblatge)
        const isCommonDub = ['en', 'es', 'fr', 'it', 'de'].includes(lang.code);

        if (isInMedia || isCommonDub) {
          available.push({ ...lang, isOriginal: false });
          addedCodes.add(lang.code);
        }
      }
    });

    // Si no hi ha cap idioma, retornar els preferits per defecte
    return available.length > 0 ? available : PREFERRED_LANGUAGES;
  }, [mediaInfo]);

  const currentLang = availableLanguages.find(l => l.code === preferredLang) || availableLanguages[0];

  // Construir URL amb idioma si la font ho suporta
  const embedUrl = currentSource.supportsLang
    ? currentSource.getUrl(mediaType, tmdbId, season, episode, preferredLang)
    : currentSource.getUrl(mediaType, tmdbId, season, episode);

  // Funcions per carregar dades
  const loadMediaInfo = useCallback(async () => {
    try {
      const endpoint = type === 'movie'
        ? `/api/tmdb/movie/${tmdbId}`
        : `/api/tmdb/tv/${tmdbId}`;
      const response = await axios.get(`${API_URL}${endpoint}`);
      setMediaInfo(response.data);

      // Per sèries, carregar temporades
      if (type !== 'movie' && response.data.seasons) {
        setSeasons(response.data.seasons.filter(s => s.season_number > 0));
      }
    } catch (error) {
      console.error('Error carregant info:', error);
    }
  }, [type, tmdbId]);

  const loadSeasonEpisodes = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/tmdb/tv/${tmdbId}/season/${season}`);
      if (response.data && response.data.episodes) {
        setEpisodes(response.data.episodes);
      }
    } catch (error) {
      console.error('Error carregant episodis:', error);
    }
  }, [tmdbId, season]);

  // Carregar info del media si no s'ha passat per state
  useEffect(() => {
    if (!mediaInfo && tmdbId) {
      loadMediaInfo();
    }
  }, [tmdbId, mediaInfo, loadMediaInfo]);

  // Carregar episodis de la temporada actual
  useEffect(() => {
    if (type !== 'movie' && tmdbId && season) {
      loadSeasonEpisodes();
    }
  }, [tmdbId, season, type, loadSeasonEpisodes]);

  // Mostrar tip d'idioma el primer cop
  useEffect(() => {
    const hasSeenTip = localStorage.getItem('hermes_lang_tip_seen');
    if (!hasSeenTip) {
      setTimeout(() => {
        setShowLangTip(true);
        setTimeout(() => {
          setShowLangTip(false);
          localStorage.setItem('hermes_lang_tip_seen', 'true');
        }, 8000);
      }, 3000);
    }
  }, []);

  // Amagar controls després d'un temps (més ràpid en fullscreen)
  useEffect(() => {
    let timeout;
    if (showControls && !showSourceMenu && !showEpisodesMenu && !showLangMenu) {
      // Amagar més ràpid en fullscreen per no interferir amb el reproductor intern
      const delay = isFullscreen ? 2000 : 4000;
      timeout = setTimeout(() => {
        setShowControls(false);
      }, delay);
    }
    return () => clearTimeout(timeout);
  }, [showControls, showSourceMenu, showEpisodesMenu, showLangMenu, isFullscreen]);

  // Mostrar controls només quan el ratolí està a la part superior (60px)
  const handleMouseMove = useCallback((e) => {
    // Només mostrar controls si el ratolí està a la part superior de la pantalla
    // Això evita interferir amb els controls del reproductor intern de l'iframe
    const isNearTop = e.clientY < 80;
    if (isNearTop) {
      setShowControls(true);
    }
  }, []);

  // Amagar controls quan es fa clic a l'iframe (l'usuari vol usar el reproductor intern)
  const handleContainerClick = useCallback((e) => {
    // Si el clic NO és en un botó de control, amaguem els controls
    const isControlClick = e.target.closest('.stream-btn') ||
                          e.target.closest('.stream-source-dropdown') ||
                          e.target.closest('.stream-episodes-dropdown') ||
                          e.target.closest('.stream-lang-dropdown');
    if (!isControlClick) {
      setShowControls(false);
    }
  }, []);

  // Funció per entrar en mode immersiu (fullscreen + landscape)
  const enterImmersiveMode = useCallback(async () => {
    try {
      // Entrar a pantalla completa
      if (containerRef.current && !document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      }

      // Bloquejar orientació en horitzontal (només mòbil)
      if (window.screen.orientation && window.screen.orientation.lock) {
        try {
          await window.screen.orientation.lock('landscape');
        } catch (e) {
          // Alguns navegadors no suporten lock d'orientació
          console.log('Orientation lock not supported');
        }
      }
    } catch (e) {
      console.log('Fullscreen request failed:', e);
    }
  }, []);

  // Quan l'iframe carrega
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    // Entrar automàticament en mode immersiu
    enterImmersiveMode();
  }, [enterImmersiveMode]);

  // Canviar de font
  const handleSourceChange = useCallback((index) => {
    setLoading(true);
    setCurrentSourceIndex(index);
    localStorage.setItem('hermes_stream_source', EMBED_SOURCES[index].id);
    setShowSourceMenu(false);
  }, []);

  // Canviar d'idioma
  const handleLanguageChange = useCallback((langCode) => {
    const langInfo = availableLanguages.find(l => l.code === langCode);
    setPreferredLang(langCode);
    localStorage.setItem('hermes_stream_lang', langCode);
    setShowLangMenu(false);

    // Mostrar missatge indicant que cal seleccionar l'idioma dins del reproductor
    setLangChangeMessage({
      lang: langInfo?.name || langCode,
      flag: langInfo?.flag || '🌐'
    });

    // Amagar el missatge després de 5 segons
    setTimeout(() => {
      setLangChangeMessage(null);
    }, 5000);

    // Recarregar el reproductor amb el nou idioma (si la font ho suporta)
    if (currentSource.supportsLang) {
      setLoading(true);
    }
  }, [currentSource.supportsLang, availableLanguages]);

  // Tornar enrere
  const handleBack = useCallback(() => {
    if (type === 'movie') {
      navigate(`/movies/${tmdbId}`);
    } else {
      navigate(`/series/${tmdbId}`);
    }
  }, [navigate, type, tmdbId]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Navegació d'episodis
  const goToPrevEpisode = useCallback(() => {
    if (!episode || episode <= 1) {
      if (season && season > 1) {
        navigate(`/stream/tv/${tmdbId}?s=${season - 1}&e=1`);
      }
      return;
    }
    navigate(`/stream/tv/${tmdbId}?s=${season}&e=${episode - 1}`);
    setLoading(true);
  }, [navigate, tmdbId, season, episode]);

  const goToNextEpisode = useCallback(() => {
    if (!episode) return;
    const maxEpisode = episodes.length > 0 ? episodes.length : 999;
    if (episode >= maxEpisode) {
      const maxSeason = seasons.length > 0 ? Math.max(...seasons.map(s => s.season_number)) : 999;
      if (season && season < maxSeason) {
        navigate(`/stream/tv/${tmdbId}?s=${season + 1}&e=1`);
        setLoading(true);
      }
      return;
    }
    navigate(`/stream/tv/${tmdbId}?s=${season}&e=${episode + 1}`);
    setLoading(true);
  }, [navigate, tmdbId, season, episode, episodes.length, seasons]);

  const goToEpisode = useCallback((ep) => {
    navigate(`/stream/tv/${tmdbId}?s=${season}&e=${ep.episode_number}`);
    setLoading(true);
    setShowEpisodesMenu(false);
  }, [navigate, tmdbId, season]);

  // Escoltar canvis de fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);

      // Desbloquejar orientació quan sortim de pantalla completa
      if (!isFs && window.screen.orientation && window.screen.orientation.unlock) {
        try {
          window.screen.orientation.unlock();
        } catch (e) {
          // Ignorar errors d'unlock
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handler per iniciar la reproducció amb mode immersiu
  const handleStartPlayback = useCallback(() => {
    setShowStartOverlay(false);
    enterImmersiveMode();
  }, [enterImmersiveMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showEpisodesMenu) {
          setShowEpisodesMenu(false);
        } else if (showSourceMenu) {
          setShowSourceMenu(false);
        } else if (showLangMenu) {
          setShowLangMenu(false);
        } else if (isFullscreen) {
          document.exitFullscreen();
        } else {
          handleBack();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'n' || e.key === 'N') {
        if (type !== 'movie') goToNextEpisode();
      } else if (e.key === 'p' || e.key === 'P') {
        if (type !== 'movie') goToPrevEpisode();
      } else if (e.key === 'l' || e.key === 'L') {
        setShowLangMenu(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handleBack, toggleFullscreen, goToNextEpisode, goToPrevEpisode, type, showEpisodesMenu, showSourceMenu, showLangMenu]);

  // Tancar menús quan es clica fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showEpisodesMenu && episodesMenuRef.current && !episodesMenuRef.current.contains(e.target)) {
        setShowEpisodesMenu(false);
      }
      if (showLangMenu && langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEpisodesMenu, showLangMenu]);

  // Construir títol
  const getTitle = () => {
    if (!mediaInfo) return '';
    return mediaInfo.title || mediaInfo.name || '';
  };

  const getEpisodeTitle = () => {
    if (!episode || !episodes.length) return '';
    const ep = episodes.find(e => e.episode_number === episode);
    return ep?.name || '';
  };

  return (
    <div
      className={`stream-player-container ${isFullscreen ? 'is-fullscreen' : ''}`}
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleContainerClick}
    >
      {/* Iframe del reproductor embed */}
      <iframe
        key={embedUrl}
        src={embedUrl}
        className="stream-iframe"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        onLoad={handleIframeLoad}
        title="Video Player"
      />

      {/* Loading overlay */}
      {loading && (
        <div className="stream-loading-overlay">
          <div className="stream-loading-spinner">
            <div className="spinner"></div>
            <p>Carregant {currentSource.name}...</p>
          </div>
        </div>
      )}

      {/* Start overlay - per activar mode immersiu amb interacció d'usuari */}
      {showStartOverlay && !loading && (
        <div className="stream-start-overlay" onClick={handleStartPlayback}>
          <div className="stream-start-content">
            <div className="stream-start-icon">
              <PlayCircleIcon />
            </div>
            <p className="stream-start-text">Toca per reproduir</p>
            <p className="stream-start-hint">Pantalla completa i horitzontal</p>
          </div>
        </div>
      )}

      {/* Tip d'idioma */}
      {showLangTip && (
        <div className="stream-lang-tip">
          <InfoIcon />
          <div>
            <strong>Consell:</strong> Per canviar l'idioma d'àudio, fes clic a la icona d'engranatge o àudio dins del reproductor.
            Els subtítols es poden seleccionar amb el botó d'idioma ({currentLang.flag}).
          </div>
          <button onClick={() => setShowLangTip(false)}>×</button>
        </div>
      )}

      {/* Missatge de canvi d'idioma */}
      {langChangeMessage && (
        <div className="stream-lang-change-message">
          <span className="lang-flag">{langChangeMessage.flag}</span>
          <div className="message-content">
            <strong>Idioma preferit: {langChangeMessage.lang}</strong>
            <p>Busca l'idioma dins del reproductor (icona ⚙️ o 🔊)</p>
          </div>
          <button onClick={() => setLangChangeMessage(null)}>×</button>
        </div>
      )}

      {/* Barra de controls superior */}
      <div className={`stream-controls-bar ${showControls ? 'visible' : ''}`}>
        {/* Botó tornar */}
        <button className="stream-btn stream-back-btn" onClick={handleBack} title="Tornar (Esc)">
          <BackIcon />
        </button>

        {/* Títol i info */}
        <div className="stream-title-section">
          <h2 className="stream-title">{getTitle()}</h2>
          {season && episode && (
            <div className="stream-episode-info">
              <span className="stream-se">T{season} E{episode}</span>
              {getEpisodeTitle() && (
                <span className="stream-ep-title">{getEpisodeTitle()}</span>
              )}
            </div>
          )}
        </div>

        {/* Espai flexible */}
        <div className="stream-spacer" />

        {/* Controls de navegació d'episodis */}
        {type !== 'movie' && season && episode && (
          <div className="stream-episode-nav">
            <button
              className="stream-btn stream-nav-btn"
              onClick={goToPrevEpisode}
              disabled={episode <= 1 && season <= 1}
              title="Episodi anterior (P)"
            >
              <PrevIcon />
            </button>

            {/* Menú d'episodis */}
            <div className="stream-episodes-wrapper" ref={episodesMenuRef}>
              <button
                className={`stream-btn stream-episodes-btn ${showEpisodesMenu ? 'active' : ''}`}
                onClick={() => setShowEpisodesMenu(!showEpisodesMenu)}
                title="Episodis"
              >
                <EpisodesIcon />
              </button>

              {showEpisodesMenu && (
                <div className="stream-episodes-dropdown">
                  <div className="stream-episodes-header">
                    Temporada {season}
                  </div>
                  <div className="stream-episodes-list">
                    {episodes.map((ep) => (
                      <button
                        key={ep.episode_number}
                        className={`stream-episode-option ${ep.episode_number === episode ? 'active' : ''}`}
                        onClick={() => goToEpisode(ep)}
                      >
                        <span className="ep-number">{ep.episode_number}</span>
                        <span className="ep-title">{ep.name || `Episodi ${ep.episode_number}`}</span>
                        {ep.episode_number === episode && <span className="ep-playing">&#9654;</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              className="stream-btn stream-nav-btn"
              onClick={goToNextEpisode}
              title="Episodi següent (N)"
            >
              <NextIcon />
            </button>
          </div>
        )}

        {/* Selector d'idioma i servidor (combinat) */}
        <div className="stream-settings-selector" ref={langMenuRef}>
          <button
            className={`stream-btn stream-settings-btn ${showLangMenu ? 'active' : ''}`}
            onClick={() => setShowLangMenu(!showLangMenu)}
            title="Idioma i servidor (L)"
          >
            <span className="lang-flag">{currentLang.flag}</span>
            <LanguageIcon />
          </button>

          {showLangMenu && (
            <div className="stream-settings-dropdown">
              {/* Secció d'idioma */}
              <div className="stream-settings-section">
                <div className="stream-settings-header">
                  <LanguageIcon />
                  <span>Idioma preferit</span>
                </div>
                <div className="stream-lang-list">
                  {availableLanguages.map((lang) => (
                    <button
                      key={lang.code}
                      className={`stream-lang-option ${lang.code === preferredLang ? 'active' : ''} ${lang.isOriginal ? 'original' : ''}`}
                      onClick={() => handleLanguageChange(lang.code)}
                    >
                      <span className="lang-flag">{lang.flag}</span>
                      <span className="lang-name">{lang.name}</span>
                      {lang.code === preferredLang && <span className="check">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Secció de servidor */}
              <div className="stream-settings-section">
                <div className="stream-settings-header">
                  <ServerIcon />
                  <span>Servidor: {currentSource.name}</span>
                </div>
                <div className="stream-source-list">
                  {EMBED_SOURCES.map((source, index) => (
                    <button
                      key={source.id}
                      className={`stream-source-option ${index === currentSourceIndex ? 'active' : ''}`}
                      onClick={() => handleSourceChange(index)}
                    >
                      <div className="source-info">
                        <span className="source-name">{source.name}</span>
                        {source.description && (
                          <span className="source-desc">{source.description}</span>
                        )}
                      </div>
                      {source.supportsLang && <span className="lang-support" title="Suporta idioma">🌐</span>}
                      {index === currentSourceIndex && <span className="check">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Botó fullscreen */}
        <button className="stream-btn" onClick={toggleFullscreen} title="Pantalla completa (F)">
          {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </button>
      </div>
    </div>
  );
}

export default StreamPlayer;
