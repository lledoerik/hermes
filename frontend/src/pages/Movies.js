/**
 * Pàgina de Pel·lícules
 * Utilitza el component compartit MediaLibrary
 */

import React from 'react';
import MediaLibrary from '../components/MediaLibrary';
import './Library.css';

function Movies() {
  return <MediaLibrary type="movies" />;
}

export default Movies;
