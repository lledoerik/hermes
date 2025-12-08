import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config/api';
import './DebridPlayer.css';

// Loading screen component (same style as DebridPlayer)
function LoadingScreen({ message }) {
  return (
    <div className="debrid-player">
      <div className="loading-overlay">
        <div className="spinner"></div>
        {message && <p style={{ marginTop: '16px', color: '#fff' }}>{message}</p>}
      </div>
    </div>
  );
}

// Error screen component
function ErrorScreen({ error, onBack }) {
  return (
    <div className="debrid-player">
      <div className="error-overlay">
        <p>{error}</p>
        <button onClick={onBack}>Tornar</button>
      </div>
    </div>
  );
}

function BBCPlayer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Get URL from query params (support both 'url' and 'id')
  const urlParam = searchParams.get('url');
  const idParam = searchParams.get('id');
  const quality = searchParams.get('quality') || 'best';

  // Construir URL de BBC si només tenim l'ID
  const bbcUrl = urlParam || (idParam ? `https://www.bbc.co.uk/iplayer/episode/${idParam}` : null);

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch stream from BBC iPlayer and redirect to DebridPlayer
  useEffect(() => {
    if (!bbcUrl) {
      setError('No BBC iPlayer URL provided');
      setLoading(false);
      return;
    }

    const fetchStream = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await axios.get(`${API_URL}/api/bbc/stream`, {
          params: { url: bbcUrl, quality }
        });

        if (response.data.status === 'success') {
          const { url, title, season, episode, quality: actualQuality, subtitles } = response.data;

          // Build subtitle text (season/episode info)
          const subtitleText = season && episode ? `T${season}E${episode}` : '';

          // Get subtitle URL (prefer English) - use proxy to convert TTML to VTT
          let subtitleUrl = '';
          if (subtitles) {
            const rawSubUrl = subtitles.en || subtitles.eng || Object.values(subtitles)[0] || '';
            if (rawSubUrl) {
              // Use our proxy endpoint to convert TTML to VTT
              subtitleUrl = `${API_URL}/api/bbc/subtitles?url=${encodeURIComponent(rawSubUrl)}`;
            }
          }

          // Redirect to DebridPlayer with direct mode params
          const params = new URLSearchParams({
            directUrl: url,
            directTitle: title || 'BBC Programme',
            directBadge: 'BBC iPlayer',
            directQuality: actualQuality || '',
            directSubtitle: subtitleText,
            directSubtitleUrl: subtitleUrl
          });

          // Navigate to DebridPlayer in direct mode
          navigate(`/debrid/direct/bbc?${params.toString()}`, { replace: true });
        } else {
          setError('Failed to get stream');
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching BBC stream:', err);
        const errorMsg = err.response?.data?.detail || err.message || 'Error loading stream';
        setError(errorMsg);
        setLoading(false);
      }
    };

    fetchStream();
  }, [bbcUrl, quality, navigate]);

  if (loading) {
    return <LoadingScreen message="Carregant BBC iPlayer..." />;
  }

  if (error) {
    return <ErrorScreen error={error} onBack={() => navigate(-1)} />;
  }

  return null;
}

export default BBCPlayer;
