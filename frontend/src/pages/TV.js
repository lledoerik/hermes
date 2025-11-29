import React, { useState, useRef, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import './TV.css';

// ============================================================
// ICONES SVG
// ============================================================
const PlayIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const PauseIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const VolumeIcon = ({ muted }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    {!muted && <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />}
    {muted && <line x1="23" y1="9" x2="17" y2="15" />}
    {muted && <line x1="17" y1="9" x2="23" y2="15" />}
  </svg>
);

const FullscreenIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const ExitFullscreenIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const GridIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const ListIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const RadioIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
  </svg>
);

const TvIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
    <polyline points="17 2 12 7 7 2" />
  </svg>
);

const SkipBackIcon = ({ seconds = 10 }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.5 4V1l-5 4 5 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4.5c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
    <text x="12.5" y="14" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">{seconds}</text>
  </svg>
);

const SkipForwardIcon = ({ seconds = 10 }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.5 4V1l5 4-5 4V6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
    <text x="11.5" y="14" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">{seconds}</text>
  </svg>
);

const LiveIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="12" r="4" fill="currentColor"/>
  </svg>
);

// ============================================================
// CANALS DE TV - TDT Espanya (URLs verificades novembre 2025)
// Font: TDTChannels (github.com/LaQuay/TDTChannels)
// ============================================================
const TV_CHANNELS = [
  // === 3Cat - Televisió de Catalunya ===
  { id: 1, name: 'TV3', description: 'La televisió de Catalunya', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_tv3_180.png', streamUrl: 'https://directes3-tv-cat.3catdirectes.cat/live-content/tv3-hls/master.m3u8', category: 'autonòmica', region: 'Catalunya', hd: true },
  { id: 2, name: '3/24', description: 'Canal de notícies 24h', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_324_180.png', streamUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/canal324-hls/master.m3u8', category: 'notícies', region: 'Catalunya', hd: true },
  { id: 3, name: '33', description: 'Canal cultural', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_c33_180.png', streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-origin/c33-super3-hls/master.m3u8', category: 'autonòmica', region: 'Catalunya', hd: true },
  { id: 4, name: 'SX3', description: 'Canal infantil i juvenil', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_sx3_180.png', streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-content/super3-hls/master.m3u8', category: 'infantil', region: 'Catalunya', hd: true },
  { id: 5, name: 'Esport3', description: 'Canal esportiu', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_esport3_180.png', streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-origin/esport3-hls/master.m3u8', category: 'esports', region: 'Catalunya', hd: true },

  // === RTVE - Televisión Española ===
  { id: 10, name: 'La 1', description: 'Primera cadena de TVE', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/1688877.m3u8', category: 'generalista', region: 'Espanya', hd: true },
  { id: 11, name: 'La 2', description: 'Cultura i documentals', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/1688885.m3u8', category: 'generalista', region: 'Espanya', hd: true },
  { id: 12, name: '24 Horas', description: 'Canal de notícies RTVE', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/1694255.m3u8', category: 'notícies', region: 'Espanya', hd: true },
  { id: 13, name: 'Clan', description: 'Canal infantil RTVE', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/5466990.m3u8', category: 'infantil', region: 'Espanya', hd: true },
  { id: 14, name: 'Teledeporte', description: 'Esports RTVE', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/1712295.m3u8', category: 'esports', region: 'Espanya', hd: true },

  // === Autonòmiques principals ===
  { id: 20, name: 'À Punt', description: 'TV Valenciana', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Logo_%C3%A0_punt.png', streamUrl: 'https://bcovlive-a.akamaihd.net/8499d938ef904e39b58a4adec2ddeada/eu-west-1/6057955885001/playlist_dvr.m3u8', category: 'autonòmica', region: 'País Valencià', hd: true },
  { id: 21, name: 'IB3', description: 'TV Illes Balears', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/IB3_logo_2022.svg', streamUrl: 'https://ibsatiphone.ib3tv.com/hls/directeTV1_iphone.m3u8', category: 'autonòmica', region: 'Illes Balears', hd: true },
  { id: 22, name: 'ETB 1', description: 'TV Euskadi en euskera', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4f/ETB1.svg', streamUrl: 'https://multimedia.eitb.eus/live-content/etb1hd-hls/master.m3u8', category: 'autonòmica', region: 'Euskadi', hd: true },
  { id: 23, name: 'ETB 2', description: 'TV Euskadi en castellà', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/ETB2.svg', streamUrl: 'https://multimedia.eitb.eus/live-content/etb2hd-hls/master.m3u8', category: 'autonòmica', region: 'Euskadi', hd: true },
  { id: 24, name: 'TVG', description: 'TV Galicia', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Tvg.svg', streamUrl: 'https://crtvg-live.hls.adaptive.level3.net/crtvg/smil:crtvg.smil/index.m3u8', category: 'autonòmica', region: 'Galícia', hd: true },
  { id: 25, name: 'TVG 2', description: 'Cultura galega', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Tvg.svg', streamUrl: 'https://crtvg2-live.hls.adaptive.level3.net/crtvg2/smil:crtvg2.smil/index.m3u8', category: 'autonòmica', region: 'Galícia', hd: true },
  { id: 26, name: 'Canal Sur', description: 'TV Andalusia', logo: 'https://upload.wikimedia.org/wikipedia/commons/d/d2/Canal_Sur_logo.svg', streamUrl: 'https://cdnlive.shooowit.net/rtvalive/smil:channel1.smil/playlist.m3u8', category: 'autonòmica', region: 'Andalusia', hd: true },
  { id: 27, name: 'Telemadrid', description: 'TV Madrid', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/54/Logo_TeleMadrid.svg', streamUrl: 'https://telemadridhls-live.hls.adaptive.level3.net/telemadrid/smil:telemadrid.smil/playlist.m3u8', category: 'autonòmica', region: 'Madrid', hd: true },
  { id: 28, name: 'Aragón TV', description: 'TV Aragó', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Arag%C3%B3n_TV_logo.svg', streamUrl: 'https://cartv.streaming.aranova.es/hls/live/aragontv_canal1.m3u8', category: 'autonòmica', region: 'Aragó', hd: true },
  { id: 29, name: 'CMM', description: 'TV Castilla-La Mancha', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/CMM.svg', streamUrl: 'https://cdnlive.shooowit.net/cmmlive/smil:cmmtv.smil/playlist.m3u8', category: 'autonòmica', region: 'Castilla-La Mancha', hd: true },
  { id: 30, name: 'TPA', description: 'TV Principado Asturias', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/75/TPA_logo.svg', streamUrl: 'https://rtpa-live.hls.adaptive.level3.net/rtpa/smil:rtpa.smil/index.m3u8', category: 'autonòmica', region: 'Astúries', hd: true },
  { id: 31, name: '7 RM', description: 'TV Región de Murcia', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/72/7_Region_de_Murcia_logo.svg', streamUrl: 'https://cdn.7tvmurcia.es/hls/live.m3u8', category: 'autonòmica', region: 'Múrcia', hd: true },
  { id: 32, name: 'Canal Extremadura', description: 'TV Extremadura', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/60/Canal_Extremadura_TV_logo.svg', streamUrl: 'https://cdnlive.shooowit.net/caborientallive/smil:extremadura.smil/playlist.m3u8', category: 'autonòmica', region: 'Extremadura', hd: true },
  { id: 33, name: 'CyL TV', description: 'TV Castella i Lleó', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/23/CyLTV.svg', streamUrl: 'https://streaming-o.rtvcyl.es/cylc7/smil:cylc7.smil/playlist.m3u8', category: 'autonòmica', region: 'Castella i Lleó', hd: true },
  { id: 34, name: 'TV Canarias', description: 'TV Canàries', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Televisi%C3%B3n_Canaria_Logo.svg', streamUrl: 'https://rtvc-live.flumotion.com/playlist.m3u8', category: 'autonòmica', region: 'Canàries', hd: true },

  // === Temàtiques nacionals ===
  { id: 40, name: 'TRECE', description: 'Canal catòlic', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/34/TRECE_logo.svg', streamUrl: 'https://live-edge-bom-1.cdn.enetres.net/A62F6E09D69245B7B19DC0B0D5D04A72021/live-1500/index.m3u8', category: 'temàtica', region: 'Espanya', hd: true },
  { id: 41, name: 'El Toro TV', description: 'Canal taurí', logo: 'https://eltorotv.com/favicon.ico', streamUrl: 'https://streaming-1.eltorotv.com/lb0/eltorotv-streaming-web/index.m3u8', category: 'temàtica', region: 'Espanya', hd: true },
  { id: 42, name: 'Real Madrid TV', description: 'Canal del Real Madrid', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Real_Madrid_TV.svg', streamUrl: 'https://rmtv-live.akamaized.net/hls/live/2033988/rmtv/master.m3u8', category: 'esports', region: 'Espanya', hd: true },
  { id: 43, name: 'Barça TV+', description: 'Canal del FC Barcelona', logo: 'https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg', streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-content/barcatv-hls/master.m3u8', category: 'esports', region: 'Catalunya', hd: true },

  // === Internacionals en espanyol ===
  { id: 50, name: 'DW Español', description: 'Deutsche Welle en espanyol', logo: 'https://upload.wikimedia.org/wikipedia/commons/8/81/Deutsche_Welle_Logo.svg', streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 51, name: 'France 24 Español', description: 'France 24 en espanyol', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/66/France_24_logo_%282018%29.svg', streamUrl: 'https://stream.france24.com/F24_ES_LO_HLS/live_web.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 52, name: 'Euronews', description: 'Euronews en espanyol', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/37/Euronews_logo_%282022%29.svg', streamUrl: 'https://euronews-euronews-spanish-2-eu.rakuten.wurl.tv/playlist.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 53, name: 'RT en Español', description: 'Russia Today en espanyol', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/RT_logo.svg', streamUrl: 'https://rt-esp.rttv.com/live/rtesp/playlist.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 54, name: 'NHK World', description: 'NHK Japó en anglès', logo: 'https://upload.wikimedia.org/wikipedia/commons/8/80/NHK_World_Japan_logo.svg', streamUrl: 'https://nhkworld.webcdn.stream.ne.jp/www11/nhkworld-tv/domestic/263942/live.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 55, name: 'Al Jazeera', description: 'Al Jazeera en anglès', logo: 'https://upload.wikimedia.org/wikipedia/en/f/f2/Al_Jazeera_English.svg', streamUrl: 'https://live-hls-web-aje.getaj.net/AJE/01.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 56, name: 'CGTN Español', description: 'TV Xina en espanyol', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/68/CGTN.svg', streamUrl: 'https://livees.cgtn.com/1000e/prog_index.m3u8', category: 'notícies', region: 'Internacional', hd: true },

  // === Locals Catalunya ===
  { id: 60, name: 'betevé', description: 'TV Barcelona', logo: 'https://upload.wikimedia.org/wikipedia/commons/d/d7/Betev%C3%A9_logo.svg', streamUrl: 'https://cdnapisec.kaltura.com/p/2346171/sp/234617100/playManifest/entryId/1_2vffmgpo/format/applehttp/protocol/https/a.m3u8', category: 'local', region: 'Barcelona', hd: true },
  { id: 61, name: '8tv', description: 'TV privada catalana', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/8tv_logo.svg', streamUrl: 'https://streaming-8tv.streaming-br.com/8tv/smil:live.smil/playlist.m3u8', category: 'local', region: 'Catalunya', hd: true },
  { id: 62, name: 'TAC 12', description: 'TV Terrassa i Rubí', logo: 'https://tac12.tv/favicon.ico', streamUrl: 'https://cdnlive.shooowit.net/tac12live/smil:tac12.smil/playlist.m3u8', category: 'local', region: 'Barcelona', hd: true },
  { id: 63, name: 'El Punt Avui TV', description: 'Actualitat catalana', logo: 'https://www.elpuntavui.cat/favicon.ico', streamUrl: 'https://cdnlive.shooowit.net/elpuntavuilive/smil:elpuntavuitv.smil/playlist.m3u8', category: 'local', region: 'Catalunya', hd: true },

  // === Música i entreteniment ===
  { id: 70, name: 'Hit TV', description: 'Videoclips i música', logo: 'https://hittv.es/favicon.ico', streamUrl: 'https://hittv-live.akamaized.net/hls/live/2033979/hittv/master.m3u8', category: 'música', region: 'Espanya', hd: true },
  { id: 71, name: 'Sol Música', description: 'Música espanyola i llatina', logo: 'https://solmusica.com/favicon.ico', streamUrl: 'https://cdnlive.shooowit.net/solmusicalive/smil:solmusica.smil/playlist.m3u8', category: 'música', region: 'Espanya', hd: true },
];

// ============================================================
// EMISSORES DE RÀDIO (URLs verificades novembre 2025)
// Font: TDTChannels (github.com/LaQuay/TDTChannels)
// ============================================================
const RADIO_CHANNELS = [
  // === Catalunya Ràdio ===
  { id: 100, name: 'Catalunya Ràdio', description: 'Emissora nacional catalana', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_catradio_180.png', streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/catalunya-radio-hls/master.m3u8', category: 'generalista', region: 'Catalunya' },
  { id: 101, name: 'Catalunya Informació', description: 'Notícies 24h', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_catinformacio_180.png', streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/catinfo-hls/master.m3u8', category: 'notícies', region: 'Catalunya' },
  { id: 102, name: 'Catalunya Música', description: 'Música clàssica', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_catmusica_180.png', streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/catmusica-hls/master.m3u8', category: 'música', region: 'Catalunya' },
  { id: 103, name: 'iCat', description: 'Música alternativa i indie', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_icat_180.png', streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/icat-hls/master.m3u8', category: 'música', region: 'Catalunya' },

  // === RNE - Radio Nacional ===
  { id: 110, name: 'RNE 1', description: 'Radio Nacional de España', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r1_main.m3u8', category: 'generalista', region: 'Espanya' },
  { id: 111, name: 'Radio Clásica', description: 'RNE Música clàssica', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r2_main.m3u8', category: 'música', region: 'Espanya' },
  { id: 112, name: 'Radio 3', description: 'Música i cultura', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r3_main.m3u8', category: 'música', region: 'Espanya' },
  { id: 113, name: 'Ràdio 4', description: 'RNE Catalunya', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r4_main.m3u8', category: 'generalista', region: 'Catalunya' },
  { id: 114, name: 'Radio 5', description: 'Notícies 24h', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r5_main.m3u8', category: 'notícies', region: 'Espanya' },
  { id: 115, name: 'Radio Exterior', description: 'RNE Internacional', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_rne_main.m3u8', category: 'generalista', region: 'Internacional' },

  // === Comercials nacionals ===
  { id: 120, name: 'Cadena SER', description: 'Ràdio generalista', logo: 'https://upload.wikimedia.org/wikipedia/commons/d/d9/Cadena_SER_logo.svg', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CADENASERAAC.aac', category: 'generalista', region: 'Espanya' },
  { id: 121, name: 'COPE', description: 'Ràdio generalista', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/5d/COPE_Logo.svg', streamUrl: 'https://flucast09-h-cloud.flumotion.com/cope/net1.aac', category: 'generalista', region: 'Espanya' },
  { id: 122, name: 'Onda Cero', description: 'Ràdio generalista', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c0/Onda_Cero.svg', streamUrl: 'https://atres-live.ondacero.es/live/ondaceroeventos1/master.m3u8', category: 'generalista', region: 'Espanya' },

  // === Música comercial ===
  { id: 130, name: 'Los 40', description: 'Èxits actuals', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/35/Los_40_Principales_logo.svg', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40AAC.aac', category: 'música', region: 'Espanya' },
  { id: 131, name: 'Los 40 Classic', description: 'Clàssics', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/35/Los_40_Principales_logo.svg', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_CLASSICAAC.aac', category: 'música', region: 'Espanya' },
  { id: 132, name: 'Cadena Dial', description: 'Música en espanyol', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Cadena_Dial_logo.svg', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CADENADIAL.aac', category: 'música', region: 'Espanya' },
  { id: 133, name: 'Europa FM', description: 'Pop i rock actual', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/07/Europa_FM_logo.svg', streamUrl: 'https://atres-live.europafm.com/live/europafm/master.m3u8', category: 'música', region: 'Espanya' },
  { id: 134, name: 'Kiss FM', description: 'Dance i electrònica', logo: 'https://kissfm.es/favicon.ico', streamUrl: 'https://kissfm.kissfmradio.cires21.com/kissfm.mp3', category: 'música', region: 'Espanya' },
  { id: 135, name: 'Rock FM', description: 'Rock clàssic i actual', logo: 'https://upload.wikimedia.org/wikipedia/commons/d/d4/Rock_FM_logo.svg', streamUrl: 'https://rockfm.cope.stream.flumotion.com/cope/rockfm.aac', category: 'música', region: 'Espanya' },

  // === Ràdio catalana ===
  { id: 140, name: 'RAC1', description: 'Ràdio catalana privada', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/62/RAC1_logo.svg', streamUrl: 'https://streaming.rac1.cat/rac1-master.m3u8', category: 'generalista', region: 'Catalunya' },
  { id: 141, name: 'RAC105', description: 'Pop i rock en català', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/62/RAC1_logo.svg', streamUrl: 'https://streaming.rac105.cat/rac105-master.m3u8', category: 'música', region: 'Catalunya' },
  { id: 142, name: 'Flaix FM', description: 'Dance i remember', logo: 'https://ffrm.es/favicon.ico', streamUrl: 'https://shoutcast.ccma.cat/flaix', category: 'música', region: 'Catalunya' },
  { id: 143, name: 'Ràdio Flaixbac', description: 'Remember 80s 90s', logo: 'https://ffrm.es/favicon.ico', streamUrl: 'https://shoutcast.ccma.cat/flaixbac', category: 'música', region: 'Catalunya' },

  // === Internacionals ===
  { id: 150, name: 'BBC World Service', description: 'BBC en anglès', logo: 'https://upload.wikimedia.org/wikipedia/commons/e/eb/BBC_World_Service_red.svg', streamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', category: 'notícies', region: 'Internacional' },
  { id: 151, name: 'France Inter', description: 'Ràdio francesa', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/cf/France_Inter_logo.svg', streamUrl: 'https://icecast.radiofrance.fr/franceinter-hifi.aac', category: 'generalista', region: 'Internacional' },
];

// Categories per filtrar
const TV_CATEGORIES = [
  { id: 'all', name: 'Tots', icon: '📺' },
  { id: 'autonòmica', name: 'Autonòmiques', icon: '🗺️' },
  { id: 'notícies', name: 'Notícies', icon: '📰' },
  { id: 'esports', name: 'Esports', icon: '⚽' },
  { id: 'infantil', name: 'Infantil', icon: '🧸' },
  { id: 'entreteniment', name: 'Entreteniment', icon: '🎬' },
  { id: 'música', name: 'Música', icon: '🎵' },
  { id: 'temàtica', name: 'Temàtiques', icon: '🎯' },
  { id: 'local', name: 'Locals', icon: '📍' },
];

const RADIO_CATEGORIES = [
  { id: 'all', name: 'Totes', icon: '📻' },
  { id: 'generalista', name: 'Generalistes', icon: '🎙️' },
  { id: 'música', name: 'Música', icon: '🎵' },
  { id: 'notícies', name: 'Notícies', icon: '📰' },
];

// ============================================================
// COMPONENT PRINCIPAL
// ============================================================
function TV() {
  const [mode, setMode] = useState('tv'); // 'tv' o 'radio'
  const [viewMode, setViewMode] = useState('fullscreen'); // 'fullscreen' o 'grid'
  const [currentChannel, setCurrentChannel] = useState(TV_CHANNELS[0]);
  const [filter, setFilter] = useState('all');
  const [showChannelList, setShowChannelList] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [channelNumber, setChannelNumber] = useState('');
  const [showChannelInfo, setShowChannelInfo] = useState(false);
  const [hasAutoFullscreen, setHasAutoFullscreen] = useState(false);
  const [skipIndicator, setSkipIndicator] = useState(null); // 'left', 'right', 'center'
  const [isLive, setIsLive] = useState(true);

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const channelNumberTimeoutRef = useRef(null);
  const channelInfoTimeoutRef = useRef(null);
  const lastTapRef = useRef(0);
  const tapTimeoutRef = useRef(null);
  const hlsRef = useRef(null);

  const skipSeconds = 10;

  // HLS.js setup per streams .m3u8
  useEffect(() => {
    const mediaElement = mode === 'tv' ? videoRef.current : audioRef.current;
    const streamUrl = currentChannel.streamUrl;

    if (!mediaElement || !streamUrl) return;

    // Destruir instància HLS anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsStream = streamUrl.includes('.m3u8');

    if (isHlsStream && Hls.isSupported()) {
      // Usar HLS.js per navegadors que no suporten HLS nativament
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(mediaElement);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        mediaElement.play().catch(() => {});
        setIsPlaying(true);
        setIsLive(true);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('HLS network error, trying to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('HLS media error, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
              console.error('HLS fatal error:', data);
              hls.destroy();
              break;
          }
        }
      });
    } else if (mediaElement.canPlayType('application/vnd.apple.mpegurl') || !isHlsStream) {
      // Safari suporta HLS nativament, o és un stream directe (AAC, MP3, etc.)
      mediaElement.src = streamUrl;
      mediaElement.load();
      mediaElement.play().catch(() => {});
      setIsPlaying(true);
      setIsLive(true);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentChannel, mode]);

  const channels = mode === 'tv' ? TV_CHANNELS : RADIO_CHANNELS;
  const categories = mode === 'tv' ? TV_CATEGORIES : RADIO_CATEGORIES;

  const filteredChannels = filter === 'all'
    ? channels
    : channels.filter(ch => ch.category === filter);

  // Ocultar controls després d'un temps
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    if (viewMode === 'fullscreen') {
      controlsTimeoutRef.current = setTimeout(() => {
        if (!showChannelList) {
          setShowControls(false);
        }
      }, 4000);
    }
  }, [viewMode, showChannelList]);

  // Gestió de teclat
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Números per canviar de canal
      if (e.key >= '0' && e.key <= '9') {
        setChannelNumber(prev => {
          const newNum = prev + e.key;
          if (channelNumberTimeoutRef.current) {
            clearTimeout(channelNumberTimeoutRef.current);
          }
          channelNumberTimeoutRef.current = setTimeout(() => {
            const num = parseInt(newNum);
            const channel = channels.find(ch => ch.id === num);
            if (channel) {
              setCurrentChannel(channel);
              showChannelInfoBriefly();
            }
            setChannelNumber('');
          }, 1500);
          return newNum;
        });
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          changeChannel(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeChannel(1);
          break;
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'g':
        case 'G':
          setShowChannelList(prev => !prev);
          break;
        case 'Escape':
          if (showChannelList) {
            setShowChannelList(false);
          } else if (isFullscreen) {
            exitFullscreen();
          }
          break;
        case 'i':
        case 'I':
          showChannelInfoBriefly();
          break;
        default:
          break;
      }
      resetControlsTimeout();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, currentChannel, isFullscreen, showChannelList, resetControlsTimeout]);

  // Mostrar info del canal breument
  const showChannelInfoBriefly = () => {
    setShowChannelInfo(true);
    if (channelInfoTimeoutRef.current) {
      clearTimeout(channelInfoTimeoutRef.current);
    }
    channelInfoTimeoutRef.current = setTimeout(() => {
      setShowChannelInfo(false);
    }, 5000);
  };

  // Canviar canal (amunt/avall)
  const changeChannel = (direction) => {
    const currentIndex = channels.findIndex(ch => ch.id === currentChannel.id);
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = channels.length - 1;
    if (newIndex >= channels.length) newIndex = 0;
    setCurrentChannel(channels[newIndex]);
    showChannelInfoBriefly();
  };

  // Play/Pause
  const togglePlayPause = () => {
    const media = mode === 'tv' ? videoRef.current : audioRef.current;
    if (media) {
      if (isPlaying) {
        media.pause();
      } else {
        media.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Auto fullscreen + landscape lock on first play (com Player.js)
  const handleVideoPlay = () => {
    setIsPlaying(true);

    // Auto fullscreen al primer play (especialment per mòbil)
    if (!hasAutoFullscreen && !document.fullscreenElement && viewMode === 'fullscreen') {
      setHasAutoFullscreen(true);

      // Intentar entrar a fullscreen
      const elem = containerRef.current || document.documentElement;
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
      setIsFullscreen(true);
    }
  };

  // Funció per mostrar indicador de skip
  const showSkipIndicator = (direction) => {
    setSkipIndicator(direction);
    setTimeout(() => setSkipIndicator(null), 500);
  };

  // Skip forward/back
  const skip = (seconds) => {
    const media = mode === 'tv' ? videoRef.current : audioRef.current;
    if (media && media.duration && isFinite(media.duration)) {
      const newTime = Math.max(0, Math.min(media.duration, media.currentTime + seconds));
      media.currentTime = newTime;
      setIsLive(false);
    }
  };

  // Tornar al directe
  const goToLive = () => {
    const media = mode === 'tv' ? videoRef.current : audioRef.current;
    if (media) {
      // Per streams en directe, anar al final del buffer
      if (media.duration && isFinite(media.duration)) {
        media.currentTime = media.duration;
      } else if (media.seekable && media.seekable.length > 0) {
        media.currentTime = media.seekable.end(media.seekable.length - 1);
      }
      media.play();
      setIsLive(true);
      setIsPlaying(true);
    }
  };

  // Touch handling per doble toc (com Player.js)
  const handleTouchStart = (e) => {
    // Ignorar si el toc és sobre els controls
    const target = e.target;
    const isControlElement = target.closest('.tv-bottom-controls') ||
                            target.closest('.tv-top-controls') ||
                            target.closest('.control-btn') ||
                            target.closest('.tv-channel-sidebar') ||
                            target.closest('.nav-btn');

    if (isControlElement) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      return;
    }

    const now = Date.now();
    const timeDiff = now - lastTapRef.current;
    const touch = e.touches[0];
    const containerWidth = containerRef.current?.offsetWidth || window.innerWidth;
    const touchX = touch.clientX;

    // Determinar zona: esquerra (0-33%), centre (33-66%), dreta (66-100%)
    const zone = touchX < containerWidth * 0.33 ? 'left' : touchX > containerWidth * 0.66 ? 'right' : 'center';

    if (timeDiff < 300 && timeDiff > 0) {
      // Doble toc
      clearTimeout(tapTimeoutRef.current);
      lastTapRef.current = 0;

      if (zone === 'left') {
        skip(-skipSeconds);
        showSkipIndicator('left');
      } else if (zone === 'right') {
        skip(skipSeconds);
        showSkipIndicator('right');
      } else {
        togglePlayPause();
        showSkipIndicator('center');
      }
    } else {
      // Primer toc - esperar per veure si és doble
      lastTapRef.current = now;
      tapTimeoutRef.current = setTimeout(() => {
        // Un sol toc - toggle controls
        if (showControls) {
          setShowControls(false);
        } else {
          resetControlsTimeout();
        }
        lastTapRef.current = 0;
      }, 300);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      // Sortir de fullscreen i desbloquejar orientació quan es desmunta
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (window.screen.orientation && window.screen.orientation.unlock) {
        window.screen.orientation.unlock();
      }
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
    };
  }, []);

  // Mute
  const toggleMute = () => {
    const media = mode === 'tv' ? videoRef.current : audioRef.current;
    if (media) {
      media.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // Volum
  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    const media = mode === 'tv' ? videoRef.current : audioRef.current;
    if (media) {
      media.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Detectar canvis de fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Seleccionar canal
  const selectChannel = (channel) => {
    setCurrentChannel(channel);
    setShowChannelList(false);
    showChannelInfoBriefly();
    setIsPlaying(true);
  };

  // Canviar mode TV/Radio
  const switchMode = (newMode) => {
    setMode(newMode);
    setFilter('all');
    const newChannels = newMode === 'tv' ? TV_CHANNELS : RADIO_CHANNELS;
    setCurrentChannel(newChannels[0]);
    setIsPlaying(true);
  };

  // Renderitzar vista Grid
  const renderGridView = () => (
    <div className="tv-grid-view">
      <div className="tv-grid-header">
        <div className="tv-mode-switcher">
          <button
            className={`mode-btn ${mode === 'tv' ? 'active' : ''}`}
            onClick={() => switchMode('tv')}
          >
            <TvIcon /> Televisió
          </button>
          <button
            className={`mode-btn ${mode === 'radio' ? 'active' : ''}`}
            onClick={() => switchMode('radio')}
          >
            <RadioIcon /> Ràdio
          </button>
        </div>

        <div className="tv-view-switcher">
          <button
            className={`view-btn ${viewMode === 'fullscreen' ? 'active' : ''}`}
            onClick={() => setViewMode('fullscreen')}
            title="Vista reproductor"
          >
            <FullscreenIcon />
          </button>
          <button
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Vista graella"
          >
            <GridIcon />
          </button>
        </div>
      </div>

      <div className="tv-categories-bar">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`category-chip ${filter === cat.id ? 'active' : ''}`}
            onClick={() => setFilter(cat.id)}
          >
            <span className="category-icon">{cat.icon}</span>
            {cat.name}
          </button>
        ))}
      </div>

      <div className="tv-channels-grid">
        {filteredChannels.map(channel => (
          <div
            key={channel.id}
            className={`channel-card ${currentChannel.id === channel.id ? 'active' : ''}`}
            onClick={() => {
              selectChannel(channel);
              setViewMode('fullscreen');
            }}
          >
            <div className="channel-card-logo">
              <img
                src={channel.logo}
                alt={channel.name}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="channel-card-fallback" style={{ display: 'none' }}>
                {channel.name.charAt(0)}
              </div>
              <div className="channel-card-number">{channel.id}</div>
              {channel.hd && <span className="channel-hd-badge">HD</span>}
            </div>
            <div className="channel-card-info">
              <h3>{channel.name}</h3>
              <p>{channel.description}</p>
              {channel.region && <span className="channel-region">{channel.region}</span>}
            </div>
            <div className="channel-card-live">
              <span className="live-dot"></span>
              EN DIRECTE
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Renderitzar vista Fullscreen (estil Movistar+)
  const renderFullscreenView = () => (
    <div
      className={`tv-fullscreen-view ${showControls ? 'controls-visible' : ''}`}
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onTouchStart={handleTouchStart}
      onClick={(e) => {
        if (e.target === e.currentTarget || e.target.classList.contains('tv-video-container')) {
          resetControlsTimeout();
        }
      }}
    >
      {/* Video/Audio Player */}
      <div className="tv-video-container">
        {mode === 'tv' ? (
          <video
            ref={videoRef}
            playsInline
            muted={isMuted}
            className="tv-video-player"
            key={currentChannel.id}
            onPlay={handleVideoPlay}
            onPause={() => setIsPlaying(false)}
          />
        ) : (
          <div className="tv-radio-visual">
            <div className="radio-visualization">
              <div className="radio-cover">
                <img
                  src={currentChannel.logo}
                  alt={currentChannel.name}
                  onError={(e) => e.target.style.display = 'none'}
                />
              </div>
              <div className="radio-waves">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>
            <audio
              ref={audioRef}
              muted={isMuted}
              key={currentChannel.id}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          </div>
        )}
      </div>

      {/* Indicadors de skip/play per doble toc */}
      {skipIndicator && (
        <div className={`skip-indicator ${skipIndicator}`}>
          {skipIndicator === 'left' && <SkipBackIcon seconds={skipSeconds} />}
          {skipIndicator === 'right' && <SkipForwardIcon seconds={skipSeconds} />}
          {skipIndicator === 'center' && (isPlaying ? <PauseIcon size={48} /> : <PlayIcon size={48} />)}
        </div>
      )}

      {/* Número de canal (quan s'escriu) */}
      {channelNumber && (
        <div className="tv-channel-number-display">
          {channelNumber}
        </div>
      )}

      {/* Info del canal (estil Movistar+) */}
      {showChannelInfo && (
        <div className="tv-channel-info-overlay">
          <div className="channel-info-content">
            <div className="channel-info-number">{currentChannel.id}</div>
            <img
              src={currentChannel.logo}
              alt={currentChannel.name}
              className="channel-info-logo"
              onError={(e) => e.target.style.display = 'none'}
            />
            <div className="channel-info-details">
              <h2>{currentChannel.name}</h2>
              <p>{currentChannel.description}</p>
              <div className="channel-info-meta">
                <span className="live-indicator"><span className="live-dot"></span> EN DIRECTE</span>
                {currentChannel.hd && <span className="hd-badge">HD</span>}
                {currentChannel.region && <span className="region-badge">{currentChannel.region}</span>}
              </div>
            </div>
          </div>
          <div className="channel-nav-hint">
            <span>▲ Canal anterior</span>
            <span>▼ Canal següent</span>
          </div>
        </div>
      )}

      {/* Controls superiors */}
      <div className={`tv-top-controls ${showControls ? 'visible' : ''}`}>
        <button
          className="tv-back-btn"
          onClick={() => setViewMode('grid')}
        >
          ← Tornar
        </button>
        <div className="tv-mode-pills">
          <button
            className={`mode-pill ${mode === 'tv' ? 'active' : ''}`}
            onClick={() => switchMode('tv')}
          >
            Televisió
          </button>
          <button
            className={`mode-pill ${mode === 'radio' ? 'active' : ''}`}
            onClick={() => switchMode('radio')}
          >
            Ràdio
          </button>
        </div>
        <button
          className="tv-guide-btn"
          onClick={() => setShowChannelList(!showChannelList)}
        >
          <ListIcon /> Guia
        </button>
      </div>

      {/* Controls inferiors (estil Movistar+) */}
      <div className={`tv-bottom-controls ${showControls ? 'visible' : ''}`}>
        <div className="tv-current-channel">
          <div className="current-channel-number">{currentChannel.id}</div>
          <img
            src={currentChannel.logo}
            alt={currentChannel.name}
            className="current-channel-logo"
            onError={(e) => e.target.style.display = 'none'}
          />
          <div className="current-channel-info">
            <h3>{currentChannel.name}</h3>
            <p>{currentChannel.description}</p>
          </div>
          <div className="current-channel-live">
            <span className="live-dot"></span> EN DIRECTE
          </div>
        </div>

        <div className="tv-player-controls">
          <div className="tv-nav-controls">
            <button className="nav-btn" onClick={() => changeChannel(-1)} title="Canal anterior">
              <ChevronUpIcon />
            </button>
            <button className="nav-btn" onClick={() => changeChannel(1)} title="Canal següent">
              <ChevronDownIcon />
            </button>
          </div>

          <button className="control-btn skip-btn" onClick={() => { skip(-skipSeconds); showSkipIndicator('left'); }} title="Retrocedir 10s">
            <SkipBackIcon seconds={skipSeconds} />
          </button>

          <button className="control-btn play-btn" onClick={togglePlayPause}>
            {isPlaying ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
          </button>

          <button className="control-btn skip-btn" onClick={() => { skip(skipSeconds); showSkipIndicator('right'); }} title="Avançar 10s">
            <SkipForwardIcon seconds={skipSeconds} />
          </button>

          <button className={`control-btn live-btn ${isLive ? 'active' : ''}`} onClick={goToLive} title="Tornar al directe">
            <LiveIcon />
            <span className="live-text">DIRECTE</span>
          </button>

          <div className="volume-control">
            <button className="control-btn" onClick={toggleMute}>
              <VolumeIcon muted={isMuted} />
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="volume-slider"
            />
          </div>

          <button className="control-btn" onClick={toggleFullscreen}>
            {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>

      {/* Llista de canals lateral */}
      {showChannelList && (
        <div className="tv-channel-sidebar">
          <div className="sidebar-header">
            <h2>Canals</h2>
            <button onClick={() => setShowChannelList(false)}>✕</button>
          </div>
          <div className="sidebar-categories">
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`sidebar-category ${filter === cat.id ? 'active' : ''}`}
                onClick={() => setFilter(cat.id)}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
          <div className="sidebar-channels">
            {filteredChannels.map(channel => (
              <div
                key={channel.id}
                className={`sidebar-channel ${currentChannel.id === channel.id ? 'active' : ''}`}
                onClick={() => selectChannel(channel)}
              >
                <span className="sidebar-channel-num">{channel.id}</span>
                <img
                  src={channel.logo}
                  alt={channel.name}
                  onError={(e) => e.target.style.display = 'none'}
                />
                <div className="sidebar-channel-info">
                  <span className="sidebar-channel-name">{channel.name}</span>
                  <span className="sidebar-channel-desc">{channel.description}</span>
                </div>
                {channel.hd && <span className="hd-mini">HD</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="tv-page">
      {viewMode === 'grid' ? renderGridView() : renderFullscreenView()}
    </div>
  );
}

export default TV;
