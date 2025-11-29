import React, { useState, useRef, useEffect, useCallback } from 'react';
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
// CANALS DE TV - TDT Espanya complet (URLs actualitzades)
// ============================================================
const TV_CHANNELS = [
  // === 3Cat - Televisió de Catalunya (URLs actualitzades) ===
  { id: 1, name: 'TV3', description: 'La televisió de Catalunya', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_tv3_180.png', streamUrl: 'https://directes3-tv-cat.3catdirectes.cat/live-content/tv3-hls/master.m3u8', category: 'autonòmica', region: 'Catalunya', hd: true },
  { id: 2, name: '3/24', description: 'Canal de notícies 24h', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_324_180.png', streamUrl: 'https://directes3-tv-cat.3catdirectes.cat/live-content/324-hls/master.m3u8', category: 'notícies', region: 'Catalunya', hd: true },
  { id: 3, name: '33', description: 'Canal cultural', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_c33_180.png', streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-origin/c33-super3-hls/master.m3u8', category: 'autonòmica', region: 'Catalunya', hd: true },
  { id: 4, name: 'SX3', description: 'Canal infantil i juvenil', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_sx3_180.png', streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-content/super3-hls/master.m3u8', category: 'infantil', region: 'Catalunya', hd: true },
  { id: 5, name: 'Esport3', description: 'Canal esportiu', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_esport3_180.png', streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-origin/esport3-hls/master.m3u8', category: 'esports', region: 'Catalunya', hd: true },

  // === 3Cat FAST Channels ===
  { id: 6, name: 'El Búnquer', description: 'Humor i entreteniment', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_tv3_180.png', streamUrl: 'https://fast-channels.3catdirectes.cat/live-origin/bunquer-hls/master.m3u8', category: 'entreteniment', region: 'Catalunya' },
  { id: 7, name: 'Plats Bruts', description: 'Sèrie clàssica', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_tv3_180.png', streamUrl: 'https://fast-channels.3catdirectes.cat/live-origin/platsbruts-hls/master.m3u8', category: 'entreteniment', region: 'Catalunya' },
  { id: 8, name: 'Pol·lència', description: 'Sèrie de comèdia', logo: 'https://statics.3cat.cat/recursos/frontal/ico/icon_tv3_180.png', streamUrl: 'https://fast-channels.3catdirectes.cat/live-origin/pollencia-hls/master.m3u8', category: 'entreteniment', region: 'Catalunya' },

  // === RTVE - Televisión Española ===
  { id: 10, name: 'La 1', description: 'Primera cadena de TVE', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/1688877.m3u8', category: 'generalista', region: 'Espanya', hd: true },
  { id: 11, name: 'La 2', description: 'Cultura i documentals', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/1688885.m3u8', category: 'generalista', region: 'Espanya', hd: true },
  { id: 12, name: '24 Horas', description: 'Canal de notícies RTVE', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/1694255.m3u8', category: 'notícies', region: 'Espanya', hd: true },
  { id: 13, name: 'Clan', description: 'Canal infantil RTVE', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/5466990.m3u8', category: 'infantil', region: 'Espanya', hd: true },
  { id: 14, name: 'Teledeporte', description: 'Esports RTVE', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/1712295.m3u8', category: 'esports', region: 'Espanya', hd: true },
  { id: 15, name: 'Star HD', description: 'Canal de cinema RTVE', logo: 'https://img2.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVEes.png', streamUrl: 'https://ztnr.rtve.es/ztnr/4997583.m3u8', category: 'entreteniment', region: 'Espanya', hd: true },

  // === Altres autonòmiques (URLs verificades) ===
  { id: 40, name: 'À Punt', description: 'TV Valenciana', logo: 'https://apuntmedia.es/assets/img/logos/logoApunt.png', streamUrl: 'https://bcovlive-a.akamaihd.net/8499d938ef904e39b58a4adec2ddeada/eu-west-1/6057955885001/playlist_dvr.m3u8', category: 'autonòmica', region: 'País Valencià', hd: true },
  { id: 41, name: 'IB3', description: 'TV Illes Balears', logo: 'https://ib3.org/ib3-ico.png', streamUrl: 'https://ibsatiphone.ib3tv.com/hls/directeTV1_iphone.m3u8', category: 'autonòmica', region: 'Illes Balears', hd: true },
  { id: 42, name: 'ETB 1', description: 'TV Euskadi en euskera', logo: 'https://www.eitb.eus/favicon.ico', streamUrl: 'https://multimedia.eitb.eus/live-content/etb1hd-hls/master.m3u8', category: 'autonòmica', region: 'Euskadi', hd: true },
  { id: 43, name: 'ETB 2', description: 'TV Euskadi en castellà', logo: 'https://www.eitb.eus/favicon.ico', streamUrl: 'https://multimedia.eitb.eus/live-content/etb2hd-hls/master.m3u8', category: 'autonòmica', region: 'Euskadi', hd: true },
  { id: 44, name: 'TVG', description: 'TV Galicia', logo: 'https://www.crtvg.es/files/favicons/tvg-128x128.png', streamUrl: 'https://crtvg-europa.flumotion.cloud/playlist.m3u8', category: 'autonòmica', region: 'Galícia', hd: true },
  { id: 45, name: 'TVG 2', description: 'Cultura galega', logo: 'https://www.crtvg.es/files/favicons/tvg-128x128.png', streamUrl: 'https://crtvg2-europa.flumotion.cloud/playlist.m3u8', category: 'autonòmica', region: 'Galícia', hd: true },
  { id: 46, name: 'Canal Sur', description: 'TV Andalusia', logo: 'https://www.canalsur.es/recursos/img/favicon.png', streamUrl: 'https://cdnlive.shooowit.net/rtvalive/smil:channel1HD.smil/playlist.m3u8', category: 'autonòmica', region: 'Andalusia', hd: true },
  { id: 47, name: 'Telemadrid', description: 'TV Madrid', logo: 'https://www.telemadrid.es/favicon.ico', streamUrl: 'https://telemadridhls-live.hls.adaptive.level3.net/telemadrid/smil:telemadrid.smil/playlist.m3u8', category: 'autonòmica', region: 'Madrid', hd: true },
  { id: 48, name: 'Aragón TV', description: 'TV Aragó', logo: 'https://www.cartv.es/favicon.ico', streamUrl: 'https://cartv.streaming.aranova.es/hls/live/aragontv_canal1.m3u8', category: 'autonòmica', region: 'Aragó', hd: true },
  { id: 49, name: 'CMM', description: 'TV Castilla-La Mancha', logo: 'https://www.cmmedia.es/favicon.ico', streamUrl: 'https://cdnlive.shooowit.net/cmmlive/smil:cmmtv.smil/playlist.m3u8', category: 'autonòmica', region: 'Castilla-La Mancha', hd: true },
  { id: 50, name: 'TV Canarias', description: 'TV Canàries', logo: 'https://www.rtvc.es/favicon.ico', streamUrl: 'https://rtvc.flumotion.cloud/rtvc/live/chunklist_w213463505.m3u8', category: 'autonòmica', region: 'Canàries', hd: true },
  { id: 51, name: 'TPA', description: 'TV Principado Asturias', logo: 'https://www.rtpa.es/favicon.ico', streamUrl: 'https://rtpa-live.flumotion.cloud/playlist.m3u8', category: 'autonòmica', region: 'Astúries', hd: true },
  { id: 52, name: '7 Región de Murcia', description: 'TV Múrcia', logo: 'https://7tvmurcia.es/favicon.ico', streamUrl: 'https://cdn.7tvmurcia.es/hls/live.m3u8', category: 'autonòmica', region: 'Múrcia', hd: true },
  { id: 53, name: 'Extremadura TV', description: 'TV Extremadura', logo: 'https://www.canalextremadura.es/favicon.ico', streamUrl: 'https://cdnlive.shooowit.net/caborientallive/smil:extremadura.smil/playlist.m3u8', category: 'autonòmica', region: 'Extremadura', hd: true },
  { id: 54, name: 'CyL TV', description: 'TV Castella i Lleó', logo: 'https://cyltv.es/favicon.ico', streamUrl: 'https://streaming-o.rtvcyl.es/cylc7/smil:cylc7.smil/playlist.m3u8', category: 'autonòmica', region: 'Castella i Lleó', hd: true },
  { id: 55, name: 'La Rioja TV', description: 'TV La Rioja', logo: 'https://www.larioja.org/favicon.ico', streamUrl: 'https://streaming.larioja.org/hls/tvr.m3u8', category: 'autonòmica', region: 'La Rioja', hd: true },

  // === Temàtiques ===
  { id: 60, name: 'TRECE', description: 'Canal catòlic', logo: 'https://www.trece.es/favicon.ico', streamUrl: 'https://live-edge-bom-1.cdn.enetres.net/A62F6E09D69245B7B19DC0B0D5D04A72021/live-1500/index.m3u8', category: 'temàtica', region: 'Espanya', hd: true },
  { id: 61, name: 'Ten', description: 'Entreteniment', logo: 'https://tentv.es/favicon.ico', streamUrl: 'https://cdnlive.shooowit.net/tenlive/smil:tenlive.smil/playlist.m3u8', category: 'temàtica', region: 'Espanya', hd: true },
  { id: 62, name: 'Real Madrid TV', description: 'Canal del Real Madrid', logo: 'https://www.realmadrid.com/favicon.ico', streamUrl: 'https://rmtv-live.akamaized.net/hls/live/2033988/rmtv/master.m3u8', category: 'esports', region: 'Espanya', hd: true },
  { id: 63, name: 'Barça TV', description: 'Canal del FC Barcelona', logo: 'https://www.fcbarcelona.com/favicon.ico', streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-content/barcatv-hls/master.m3u8', category: 'esports', region: 'Catalunya', hd: true },

  // === Internacionals en espanyol ===
  { id: 70, name: 'DW Español', description: 'Deutsche Welle en espanyol', logo: 'https://www.dw.com/favicon.ico', streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 71, name: 'France 24 Español', description: 'France 24 en espanyol', logo: 'https://www.france24.com/favicon.ico', streamUrl: 'https://stream.france24.com/F24_ES_LO_HLS/live_web.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 72, name: 'Euronews Español', description: 'Euronews en espanyol', logo: 'https://www.euronews.com/favicon.ico', streamUrl: 'https://euronews-euronews-spanish-2-eu.rakuten.wurl.tv/playlist.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 73, name: 'RT en Español', description: 'Russia Today en espanyol', logo: 'https://www.rt.com/favicon.ico', streamUrl: 'https://rt-esp.rttv.com/live/rtesp/playlist.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 74, name: 'NHK World', description: 'NHK Japó en anglès', logo: 'https://www3.nhk.or.jp/favicon.ico', streamUrl: 'https://nhkworld.webcdn.stream.ne.jp/www11/nhkworld-tv/domestic/263942/live.m3u8', category: 'notícies', region: 'Internacional', hd: true },
  { id: 75, name: 'Al Jazeera', description: 'Al Jazeera en anglès', logo: 'https://www.aljazeera.com/favicon.ico', streamUrl: 'https://live-hls-web-aje.getaj.net/AJE/01.m3u8', category: 'notícies', region: 'Internacional', hd: true },

  // === Barcelona locals ===
  { id: 80, name: 'betevé', description: 'TV Barcelona', logo: 'https://beteve.cat/favicon.ico', streamUrl: 'https://cdnapisec.kaltura.com/p/2346171/sp/234617100/playManifest/entryId/1_2vffmgpo/format/applehttp/protocol/https/a.m3u8', category: 'local', region: 'Barcelona', hd: true },
  { id: 81, name: '8tv', description: 'TV privada catalana', logo: 'https://8tv.cat/favicon.ico', streamUrl: 'https://streaming-8tv.streaming-br.com/8tv/smil:live.smil/playlist.m3u8', category: 'local', region: 'Catalunya', hd: true },

  // === Música ===
  { id: 90, name: 'MTV España', description: 'Canal de música', logo: 'https://www.mtv.es/favicon.ico', streamUrl: 'https://amtv-es.akamaized.net/hls/live/2029613/mtves/index.m3u8', category: 'música', region: 'Espanya', hd: true },
  { id: 91, name: 'Sol Música', description: 'Música espanyola i llatina', logo: 'https://solmusica.com/favicon.ico', streamUrl: 'https://cdnlive.shooowit.net/solmusicalive/smil:solmusica.smil/playlist.m3u8', category: 'música', region: 'Espanya', hd: true },
  { id: 92, name: 'Hit TV', description: 'Videoclips i música', logo: 'https://hittv.es/favicon.ico', streamUrl: 'https://hittv-live.akamaized.net/hls/live/2033979/hittv/master.m3u8', category: 'música', region: 'Espanya', hd: true },
];

// ============================================================
// EMISSORES DE RÀDIO
// ============================================================
const RADIO_CHANNELS = [
  // Catalunya Ràdio
  { id: 100, name: 'Catalunya Ràdio', description: 'Emissora nacional', logo: 'https://www.3cat.cat/statics/images/favicons/catradio/apple-touch-icon-180x180.png', streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/catradio-hls/master.m3u8', category: 'generalista', region: 'Catalunya' },
  { id: 101, name: 'Catalunya Informació', description: 'Notícies 24h', logo: 'https://www.3cat.cat/statics/images/favicons/catradio/apple-touch-icon-180x180.png', streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/catinfo-hls/master.m3u8', category: 'notícies', region: 'Catalunya' },
  { id: 102, name: 'Catalunya Música', description: 'Música clàssica', logo: 'https://www.3cat.cat/statics/images/favicons/catradio/apple-touch-icon-180x180.png', streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/catmusica-hls/master.m3u8', category: 'música', region: 'Catalunya' },
  { id: 103, name: 'iCat', description: 'Música alternativa', logo: 'https://www.3cat.cat/statics/images/favicons/catradio/apple-touch-icon-180x180.png', streamUrl: 'https://directes-radio-int.3catdirectes.cat/live-content/icat-hls/master.m3u8', category: 'música', region: 'Catalunya' },

  // RNE
  { id: 110, name: 'RNE 1', description: 'Radio Nacional', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://ztnr.rtve.es/ztnr/rne_r1_096.m3u8', category: 'generalista', region: 'Espanya' },
  { id: 111, name: 'Radio 3', description: 'Música i cultura', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://ztnr.rtve.es/ztnr/rne_r3_096.m3u8', category: 'música', region: 'Espanya' },
  { id: 112, name: 'Radio 5', description: 'Notícies 24h', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://ztnr.rtve.es/ztnr/rne_r5_096.m3u8', category: 'notícies', region: 'Espanya' },
  { id: 113, name: 'Radio Clásica', description: 'Música clàssica', logo: 'https://img.rtve.es/css/rtve.commons/rtve.header.footer/i/logoRTVE.png', streamUrl: 'https://ztnr.rtve.es/ztnr/rne_rca_096.m3u8', category: 'música', region: 'Espanya' },

  // Comercials
  { id: 120, name: 'Los 40', description: 'Èxits actuals', logo: 'https://los40.com/favicon.ico', streamUrl: 'https://24343.live.streamtheworld.com/LOS40.mp3', category: 'música', region: 'Espanya' },
  { id: 121, name: 'Cadena SER', description: 'Ràdio generalista', logo: 'https://cadenaser.com/favicon.ico', streamUrl: 'https://24343.live.streamtheworld.com/CADENA_SER.mp3', category: 'generalista', region: 'Espanya' },
  { id: 122, name: 'COPE', description: 'Ràdio generalista', logo: 'https://www.cope.es/favicon.ico', streamUrl: 'https://flucast-b05-01.flumotion.com/cope/live.mp3', category: 'generalista', region: 'Espanya' },
  { id: 123, name: 'Onda Cero', description: 'Ràdio generalista', logo: 'https://www.ondacero.es/favicon.ico', streamUrl: 'https://livefastly-webradiobeta.antena3.com/ondacero/live.mp3', category: 'generalista', region: 'Espanya' },
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

  const skipSeconds = 10;

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
            autoPlay
            playsInline
            muted={isMuted}
            className="tv-video-player"
            key={currentChannel.streamUrl}
            onPlay={handleVideoPlay}
            onPause={() => setIsPlaying(false)}
          >
            <source src={currentChannel.streamUrl} type="application/x-mpegURL" />
          </video>
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
              autoPlay
              muted={isMuted}
              key={currentChannel.streamUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            >
              <source src={currentChannel.streamUrl} />
            </audio>
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
