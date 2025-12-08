import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import StreamPlayer from '../components/StreamPlayer';
import { API_URL } from '../config/api';

function BBCPlayer() {
  const [searchParams] = useSearchParams();

  // Get URL from query params (support both 'url' and 'id')
  const urlParam = searchParams.get('url');
  const idParam = searchParams.get('id');
  const quality = searchParams.get('quality') || 'best';

  // Construir URL de BBC si només tenim l'ID
  const bbcUrl = urlParam || (idParam ? `https://www.bbc.co.uk/iplayer/episode/${idParam}` : null);

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);

  // Fetch stream from BBC iPlayer
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
          setStreamUrl(response.data.url);
          setMetadata({
            title: response.data.title,
            description: response.data.description,
            thumbnail: response.data.thumbnail,
            duration: response.data.duration,
            season: response.data.season,
            episode: response.data.episode,
            quality: response.data.quality
          });
        } else {
          setError('Failed to get stream');
        }
      } catch (err) {
        console.error('Error fetching BBC stream:', err);
        const errorMsg = err.response?.data?.detail || err.message || 'Error loading stream';
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchStream();
  }, [bbcUrl, quality]);

  // Build subtitle (season/episode info)
  const subtitle = metadata?.season && metadata?.episode
    ? `T${metadata.season}E${metadata.episode}`
    : '';

  return (
    <StreamPlayer
      streamUrl={streamUrl}
      title={metadata?.title || 'BBC Programme'}
      subtitle={subtitle}
      badge="BBC iPlayer"
      quality={metadata?.quality}
      loading={loading}
      error={error}
    />
  );
}

export default BBCPlayer;
