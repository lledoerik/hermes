import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Detectar URL dinàmicament
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:8000' 
  : `http://${window.location.hostname}:8000`;

axios.defaults.baseURL = API_URL;

function App() {
  const [series, setSeries] = useState([]);
  const [movies, setMovies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    try {
      const [seriesRes, moviesRes, statsRes] = await Promise.all([
        axios.get('/api/library/series'),
        axios.get('/api/library/movies'),
        axios.get('/api/library/stats')
      ]);
      
      setSeries(seriesRes.data);
      setMovies(moviesRes.data);
      setStats(statsRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error carregant biblioteca:', error);
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setLoading(true);
    try {
      await axios.post('/api/library/scan');
      await loadLibrary();
    } catch (error) {
      console.error('Error escanejant:', error);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <h2>Carregant Hermes...</h2>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>🎬 Hermes Media Server</h1>
        <button onClick={handleScan} style={styles.scanButton}>
          🔄 Escanejar
        </button>
      </header>

      {stats && (
        <div style={styles.stats}>
          <span>📺 {stats.series} Sèries</span>
          <span>🎥 {stats.movies} Pel·lícules</span>
          <span>📁 {stats.files} Arxius</span>
          <span>⏱️ {stats.total_hours}h Total</span>
        </div>
      )}

      <section style={styles.section}>
        <h2>Sèries ({series.length})</h2>
        <div style={styles.grid}>
          {series.map(item => (
            <div key={item.id} style={styles.card}>
              <div style={styles.poster}>
                {item.poster ? (
                  <img src={`${API_URL}/api/image/poster/${item.id}`} alt={item.name} style={styles.image} />
                ) : (
                  <div style={styles.placeholder}>📺</div>
                )}
              </div>
              <h3 style={styles.title}>{item.name}</h3>
              <p style={styles.info}>{item.season_count} temporades • {item.episode_count} episodis</p>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2>Pel·lícules ({movies.length})</h2>
        <div style={styles.grid}>
          {movies.map(item => (
            <div key={item.id} style={styles.card}>
              <div style={styles.poster}>
                {item.poster ? (
                  <img src={`${API_URL}/api/image/poster/${item.id}`} alt={item.name} style={styles.image} />
                ) : (
                  <div style={styles.placeholder}>🎬</div>
                )}
              </div>
              <h3 style={styles.title}>{item.name}</h3>
              <p style={styles.info}>{Math.round(item.duration / 60)} min</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#ffffff',
    padding: '20px'
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#ffffff'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
    borderBottom: '1px solid #333',
    paddingBottom: '20px'
  },
  scanButton: {
    padding: '10px 20px',
    fontSize: '16px',
    backgroundColor: '#e50914',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer'
  },
  stats: {
    display: 'flex',
    gap: '30px',
    marginBottom: '30px',
    fontSize: '18px'
  },
  section: {
    marginBottom: '40px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '20px',
    marginTop: '20px'
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.2s'
  },
  poster: {
    aspectRatio: '2/3',
    backgroundColor: '#2a2a2a'
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '48px'
  },
  title: {
    margin: '10px',
    fontSize: '14px'
  },
  info: {
    margin: '0 10px 10px',
    fontSize: '12px',
    color: '#888'
  }
};

export default App;
