import React, { useEffect, useRef, useState } from 'react';
import './ExternalPlayer.css';

/**
 * Component per reproduir contingut de fonts externes
 * Suporta: YouTube, Vimeo, URLs directes (mp4, m3u8, webm), Internet Archive, 3Cat
 */

// Detecta el tipus de font a partir de la URL
const detectSource = (url) => {
  if (!url) return null;

  const urlLower = url.toLowerCase();

  // YouTube
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return 'youtube';
  }

  // Vimeo
  if (urlLower.includes('vimeo.com')) {
    return 'vimeo';
  }

  // Internet Archive
  if (urlLower.includes('archive.org')) {
    return 'archive';
  }

  // 3Cat / TV3
  if (urlLower.includes('3cat.cat') || urlLower.includes('ccma.cat') || urlLower.includes('tv3.cat')) {
    return '3cat';
  }

  // Dailymotion
  if (urlLower.includes('dailymotion.com') || urlLower.includes('dai.ly')) {
    return 'dailymotion';
  }

  // Twitch
  if (urlLower.includes('twitch.tv')) {
    return 'twitch';
  }

  // SuperEmbed / 2embed (APIs d'streaming)
  if (urlLower.includes('superembed') || urlLower.includes('2embed') || urlLower.includes('vidsrc')) {
    return 'embed_api';
  }

  // URLs directes de vídeo
  if (urlLower.endsWith('.mp4') || urlLower.endsWith('.webm') || urlLower.endsWith('.ogg')) {
    return 'direct';
  }

  // HLS streams
  if (urlLower.endsWith('.m3u8') || urlLower.includes('.m3u8')) {
    return 'hls';
  }

  // DASH streams
  if (urlLower.endsWith('.mpd')) {
    return 'dash';
  }

  // Iframe genèric (per altres embeds)
  if (urlLower.includes('embed') || urlLower.includes('iframe')) {
    return 'iframe';
  }

  // Per defecte, intentem com a iframe
  return 'iframe';
};

// Extreu l'ID de YouTube d'una URL
const getYouTubeId = (url) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

// Extreu l'ID de Vimeo d'una URL
const getVimeoId = (url) => {
  const regExp = /vimeo\.com\/(?:video\/)?(\d+)/;
  const match = url.match(regExp);
  return match ? match[1] : null;
};

// Extreu l'ID de Dailymotion
const getDailymotionId = (url) => {
  const regExp = /dailymotion\.com\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/;
  const match = url.match(regExp);
  if (match) return match[1];

  const shortRegExp = /dai\.ly\/([a-zA-Z0-9]+)/;
  const shortMatch = url.match(shortRegExp);
  return shortMatch ? shortMatch[1] : null;
};

// Extreu el canal de Twitch
const getTwitchChannel = (url) => {
  const regExp = /twitch\.tv\/([a-zA-Z0-9_]+)/;
  const match = url.match(regExp);
  return match ? match[1] : null;
};

const ExternalPlayer = ({
  url,
  title = 'Reproductor extern',
  onError,
  onReady,
  autoplay = true,
  className = ''
}) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const source = detectSource(url);

  // Neteja HLS quan el component es desmunta
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // Inicialitza HLS.js per a streams m3u8
  useEffect(() => {
    if (source === 'hls' && videoRef.current) {
      // Comprova si el navegador suporta HLS nativament (Safari)
      if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = url;
        if (autoplay) videoRef.current.play();
      } else {
        // Utilitza HLS.js per altres navegadors
        import('hls.js').then(({ default: Hls }) => {
          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
            });
            hlsRef.current = hls;
            hls.loadSource(url);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setLoading(false);
              if (autoplay) videoRef.current.play();
              onReady?.();
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
              if (data.fatal) {
                setError('Error carregant el stream HLS');
                onError?.(data);
              }
            });
          } else {
            setError('El teu navegador no suporta HLS');
          }
        });
      }
    }
  }, [url, source, autoplay, onError, onReady]);

  const handleLoad = () => {
    setLoading(false);
    onReady?.();
  };

  const handleError = (e) => {
    setLoading(false);
    setError('Error carregant el vídeo');
    onError?.(e);
  };

  if (!url) {
    return (
      <div className={`external-player external-player--empty ${className}`}>
        <p>No hi ha cap URL configurada</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`external-player external-player--error ${className}`}>
        <p>{error}</p>
        <button onClick={() => { setError(null); setLoading(true); }}>
          Tornar a intentar
        </button>
      </div>
    );
  }

  // Renderitza segons el tipus de font
  switch (source) {
    case 'youtube': {
      const videoId = getYouTubeId(url);
      if (!videoId) {
        return <div className="external-player external-player--error">URL de YouTube no vàlida</div>;
      }
      return (
        <div className={`external-player external-player--youtube ${className}`}>
          {loading && <div className="external-player__loading">Carregant YouTube...</div>}
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&rel=0&modestbranding=1`}
            title={title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={handleLoad}
          />
        </div>
      );
    }

    case 'vimeo': {
      const videoId = getVimeoId(url);
      if (!videoId) {
        return <div className="external-player external-player--error">URL de Vimeo no vàlida</div>;
      }
      return (
        <div className={`external-player external-player--vimeo ${className}`}>
          {loading && <div className="external-player__loading">Carregant Vimeo...</div>}
          <iframe
            src={`https://player.vimeo.com/video/${videoId}?autoplay=${autoplay ? 1 : 0}`}
            title={title}
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            onLoad={handleLoad}
          />
        </div>
      );
    }

    case 'dailymotion': {
      const videoId = getDailymotionId(url);
      if (!videoId) {
        return <div className="external-player external-player--error">URL de Dailymotion no vàlida</div>;
      }
      return (
        <div className={`external-player external-player--dailymotion ${className}`}>
          {loading && <div className="external-player__loading">Carregant Dailymotion...</div>}
          <iframe
            src={`https://www.dailymotion.com/embed/video/${videoId}?autoplay=${autoplay ? 1 : 0}`}
            title={title}
            frameBorder="0"
            allow="autoplay; fullscreen"
            allowFullScreen
            onLoad={handleLoad}
          />
        </div>
      );
    }

    case 'twitch': {
      const channel = getTwitchChannel(url);
      if (!channel) {
        return <div className="external-player external-player--error">URL de Twitch no vàlida</div>;
      }
      return (
        <div className={`external-player external-player--twitch ${className}`}>
          {loading && <div className="external-player__loading">Carregant Twitch...</div>}
          <iframe
            src={`https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}&autoplay=${autoplay}`}
            title={title}
            frameBorder="0"
            allowFullScreen
            onLoad={handleLoad}
          />
        </div>
      );
    }

    case 'archive':
    case 'direct':
      return (
        <div className={`external-player external-player--direct ${className}`}>
          {loading && <div className="external-player__loading">Carregant vídeo...</div>}
          <video
            ref={videoRef}
            src={url}
            controls
            autoPlay={autoplay}
            onLoadedData={handleLoad}
            onError={handleError}
          >
            El teu navegador no suporta la reproducció de vídeo.
          </video>
        </div>
      );

    case 'hls':
      return (
        <div className={`external-player external-player--hls ${className}`}>
          {loading && <div className="external-player__loading">Carregant stream...</div>}
          <video
            ref={videoRef}
            controls
            autoPlay={autoplay}
            onError={handleError}
          >
            El teu navegador no suporta la reproducció de vídeo.
          </video>
        </div>
      );

    case '3cat':
    case 'embed_api':
    case 'iframe':
    default:
      return (
        <div className={`external-player external-player--iframe ${className}`}>
          {loading && <div className="external-player__loading">Carregant...</div>}
          <iframe
            src={url}
            title={title}
            frameBorder="0"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            onLoad={handleLoad}
            onError={handleError}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </div>
      );
  }
};

export default ExternalPlayer;
