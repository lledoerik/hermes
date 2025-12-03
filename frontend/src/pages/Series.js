/**
 * Pàgina de Sèries
 * Utilitza el component compartit MediaLibrary
 */

import React from 'react';
import MediaLibrary from '../components/MediaLibrary';
import './Library.css';

function Series() {
  return <MediaLibrary type="series" />;
}

export default Series;
