import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';

// Styles
import './styles/global.css';

// Components
import Navbar from './components/Navbar';

// Pages
import Home from './pages/Home';
import Series from './pages/Series';
import Movies from './pages/Movies';
import SeriesDetail from './pages/SeriesDetail';
import MovieDetail from './pages/MovieDetail';
import Player from './pages/Player';

// Layout component that conditionally shows navbar
function Layout({ children }) {
  const location = useLocation();
  const isPlayerPage = location.pathname.startsWith('/play/');

  return (
    <>
      {!isPlayerPage && <Navbar />}
      {children}
    </>
  );
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/series" element={<Series />} />
        <Route path="/series/:id" element={<SeriesDetail />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/movie/:id" element={<MovieDetail />} />
        <Route path="/play/:mediaId" element={<Player />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <Router>
      <div className="app">
        <AppRoutes />
      </div>
    </Router>
  );
}

export default App;
