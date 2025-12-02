"""
Torrentio Service - Gestió robusta de streams via Real-Debrid

Aquest mòdul proporciona:
- Cerca de streams a Torrentio
- Verificació d'URLs de Real-Debrid
- Cache de resultats
- Detecció intel·ligent d'idiomes
"""

import re
import asyncio
import logging
import hashlib
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field
import httpx

logger = logging.getLogger(__name__)

# Token de Real-Debrid
REALDEBRID_TOKEN = "MSHHVZNZEM26KBTF6MUWHNPP7B6JUTPUWGA7YOJDOVF3OY6UJ6XA"
TORRENTIO_BASE = "https://torrentio.strem.fun"

# Cache de streams (TTL: 1 hora)
_stream_cache: Dict[str, tuple] = {}  # key -> (data, timestamp)
CACHE_TTL = 3600  # 1 hora


@dataclass
class TorrentioStream:
    """Representa un stream de Torrentio verificat"""
    title: str
    url: str
    quality: str
    language: str
    size: Optional[str]
    source: str
    seeds: int = 0
    verified: bool = False


@dataclass
class TorrentioResult:
    """Resultat de cerca a Torrentio"""
    imdb_id: str
    tmdb_id: int
    media_type: str
    season: Optional[int] = None
    episode: Optional[int] = None
    streams: List[TorrentioStream] = field(default_factory=list)
    available_languages: List[str] = field(default_factory=list)
    best_by_language: Dict[str, TorrentioStream] = field(default_factory=dict)


def _get_cache_key(imdb_id: str, season: Optional[int], episode: Optional[int]) -> str:
    """Genera una clau única per al cache"""
    key = f"{imdb_id}"
    if season is not None:
        key += f":s{season}"
    if episode is not None:
        key += f":e{episode}"
    return key


def _is_cache_valid(key: str) -> bool:
    """Comprova si el cache és vàlid"""
    if key not in _stream_cache:
        return False
    _, timestamp = _stream_cache[key]
    return (datetime.now() - timestamp).total_seconds() < CACHE_TTL


def _detect_language(title: str, name: str) -> str:
    """
    Detecta l'idioma d'un stream basant-se en el títol i nom.
    Retorna el codi d'idioma o 'unknown'.
    """
    combined = (title + " " + name).lower()

    # Patrons per cada idioma (ordenats per especificitat)
    patterns = {
        'es': [
            r'\bcastellano\b', r'\bspanish\b', r'\bespañol\b', r'\bespa\b',
            r'\bspa\b', r'\[spa\]', r'\(spa\)', r'spanish\.dub', r'\bcast\b',
            r'audio\s*español', r'spanish\s*audio'
        ],
        'es-419': [
            r'\blatino\b', r'\blatin\b', r'\blat\b', r'\[lat\]', r'\(lat\)',
            r'la\.dub', r'\blatinoamerica\b', r'español\s*latino', r'spanish\s*latin'
        ],
        'it': [
            r'\bitalian\b', r'\bitaliano\b', r'\bita\b', r'\[ita\]', r'\(ita\)',
            r'ita\.dub', r'italian\s*audio'
        ],
        'fr': [
            r'\bfrench\b', r'\bfrançais\b', r'\bfrancais\b', r'\bfra\b',
            r'\[fra\]', r'\(fra\)', r'\bvff\b', r'\btruefrench\b', r'french\.dub'
        ],
        'ca': [
            r'\bcatalan\b', r'\bcatalà\b', r'\bcatala\b', r'\bcat\b',
            r'\[cat\]', r'\(cat\)'
        ],
        'de': [
            r'\bgerman\b', r'\bdeutsch\b', r'\bger\b', r'\[ger\]', r'\(ger\)',
            r'\bdeu\b', r'german\s*audio'
        ],
        'pt': [
            r'\bportuguese\b', r'\bportuguês\b', r'\bpor\b', r'\[por\]', r'\(por\)',
            r'\bbrazilian\b', r'portuguese\s*audio'
        ],
        'ja': [
            r'\bjapanese\b', r'\bjapones\b', r'\bjap\b', r'\[jap\]', r'\(jap\)',
            r'\bjpn\b', r'japanese\s*audio'
        ],
        'en': [
            r'\benglish\b', r'\beng\b', r'\[eng\]', r'\(eng\)', r'en\.dub',
            r'english\s*audio'
        ],
        'multi': [
            r'\bmulti\b', r'\bdual\b', r'\bmultiple\b', r'\bvarios\b',
            r'multi\s*audio', r'dual\s*audio'
        ],
    }

    for lang, lang_patterns in patterns.items():
        for pattern in lang_patterns:
            if re.search(pattern, combined):
                return lang

    return 'unknown'


def _detect_quality(title: str) -> str:
    """Detecta la qualitat del stream"""
    title_upper = title.upper()

    if any(x in title_upper for x in ['2160', '4K', 'UHD', '4K HDR', 'DOLBY VISION']):
        return '4K'
    elif '1080' in title:
        return '1080p'
    elif '720' in title:
        return '720p'
    elif '480' in title:
        return '480p'
    elif '360' in title:
        return '360p'
    else:
        return 'SD'


def _extract_size(title: str) -> Optional[str]:
    """Extreu la mida del fitxer si està disponible"""
    match = re.search(r'(\d+(?:\.\d+)?)\s*(GB|MB|TB)', title, re.IGNORECASE)
    return match.group(0) if match else None


def _extract_seeds(title: str) -> int:
    """Extreu el nombre de seeds si està disponible"""
    match = re.search(r'(\d+)\s*(?:seeds?|seeders?)', title, re.IGNORECASE)
    if match:
        return int(match.group(1))
    # Torrentio a vegades posa seeds al final com "👤 123"
    match = re.search(r'👤\s*(\d+)', title)
    if match:
        return int(match.group(1))
    return 0


def _extract_source(name: str) -> str:
    """Extreu la font del torrent"""
    sources = {
        'TPB': ['TPB', 'ThePirateBay', 'Pirate Bay'],
        '1337x': ['1337x'],
        'RARBG': ['RARBG'],
        'YTS': ['YTS', 'YIFY'],
        'EZTV': ['EZTV'],
        'Rutor': ['Rutor'],
        'Rutracker': ['Rutracker'],
        'Nyaa': ['Nyaa'],
        'TorrentGalaxy': ['TorrentGalaxy', 'TGx'],
    }

    for source, patterns in sources.items():
        for pattern in patterns:
            if pattern.lower() in name.lower():
                return source

    return 'Torrent'


async def verify_stream_url(url: str, timeout: float = 5.0) -> bool:
    """
    Verifica que una URL de Real-Debrid sigui vàlida.
    Fa una petició HEAD per comprovar que respon.
    """
    if not url:
        return False

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.head(url)
            # Real-Debrid retorna 200 o 206 per streams vàlids
            return response.status_code in [200, 206]
    except Exception as e:
        logger.debug(f"URL verification failed: {e}")
        return False


async def fetch_torrentio_streams(
    imdb_id: str,
    media_type: str,
    season: Optional[int] = None,
    episode: Optional[int] = None,
    verify_urls: bool = True
) -> TorrentioResult:
    """
    Obté streams de Torrentio i opcionalment verifica les URLs.

    Args:
        imdb_id: ID d'IMDB (ex: tt0388629)
        media_type: 'movie' o 'series'
        season: Número de temporada (per sèries)
        episode: Número d'episodi (per sèries)
        verify_urls: Si és True, verifica cada URL abans de retornar-la

    Returns:
        TorrentioResult amb tots els streams i millors per idioma
    """
    # Comprovar cache
    cache_key = _get_cache_key(imdb_id, season, episode)
    if _is_cache_valid(cache_key):
        logger.info(f"Cache hit for {cache_key}")
        return _stream_cache[cache_key][0]

    # Construir URL de Torrentio
    if media_type == 'movie':
        stremio_id = imdb_id
        stremio_type = 'movie'
    else:
        s = season or 1
        e = episode or 1
        stremio_id = f"{imdb_id}:{s}:{e}"
        stremio_type = 'series'

    torrentio_url = f"{TORRENTIO_BASE}/realdebrid={REALDEBRID_TOKEN}/stream/{stremio_type}/{stremio_id}.json"

    result = TorrentioResult(
        imdb_id=imdb_id,
        tmdb_id=0,  # S'omplirà externament
        media_type=media_type,
        season=season,
        episode=episode
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(torrentio_url)

            if response.status_code != 200:
                logger.warning(f"Torrentio returned {response.status_code}")
                return result

            data = response.json()
            raw_streams = data.get('streams', [])

            if not raw_streams:
                logger.info(f"No streams found for {stremio_id}")
                return result

            # Processar cada stream
            streams = []
            for raw in raw_streams:
                title = raw.get('title', '')
                name = raw.get('name', '')
                url = raw.get('url', '')

                if not url:
                    continue

                stream = TorrentioStream(
                    title=title,
                    url=url,
                    quality=_detect_quality(title),
                    language=_detect_language(title, name),
                    size=_extract_size(title),
                    source=_extract_source(name),
                    seeds=_extract_seeds(title),
                    verified=False
                )
                streams.append(stream)

            # Verificar URLs si es demana (en paral·lel per velocitat)
            if verify_urls and streams:
                # Verificar només els millors 10 streams per no tardar massa
                streams_to_verify = streams[:10]

                async def verify_one(s: TorrentioStream) -> TorrentioStream:
                    s.verified = await verify_stream_url(s.url)
                    return s

                await asyncio.gather(*[verify_one(s) for s in streams_to_verify])

                # Marcar la resta com no verificats però disponibles
                for s in streams[10:]:
                    s.verified = False

            result.streams = streams

            # Identificar idiomes disponibles
            languages = set()
            for s in streams:
                if s.language != 'unknown':
                    languages.add(s.language)
            result.available_languages = sorted(list(languages))

            # Trobar el millor stream per cada idioma
            for lang in result.available_languages:
                lang_streams = [s for s in streams if s.language == lang]
                # Ordenar per: verificat > qualitat > seeds
                quality_order = {'4K': 4, '1080p': 3, '720p': 2, '480p': 1, 'SD': 0}
                lang_streams.sort(
                    key=lambda x: (
                        x.verified,
                        quality_order.get(x.quality, 0),
                        x.seeds
                    ),
                    reverse=True
                )
                if lang_streams:
                    result.best_by_language[lang] = lang_streams[0]

            # Guardar al cache
            _stream_cache[cache_key] = (result, datetime.now())

            return result

    except httpx.TimeoutException:
        logger.error("Timeout connecting to Torrentio")
        return result
    except Exception as e:
        logger.error(f"Error fetching Torrentio streams: {e}")
        return result


async def get_verified_stream(
    imdb_id: str,
    media_type: str,
    language: str,
    quality: str = '1080p',
    season: Optional[int] = None,
    episode: Optional[int] = None
) -> Optional[TorrentioStream]:
    """
    Obté el millor stream verificat per un idioma i qualitat específics.

    Returns:
        TorrentioStream si es troba, None si no
    """
    result = await fetch_torrentio_streams(
        imdb_id=imdb_id,
        media_type=media_type,
        season=season,
        episode=episode,
        verify_urls=True
    )

    if not result.streams:
        return None

    # Buscar per idioma exacte
    candidates = [s for s in result.streams if s.language == language]

    # Si no hi ha, buscar 'multi'
    if not candidates:
        candidates = [s for s in result.streams if s.language == 'multi']

    if not candidates:
        return None

    # Ordenar per qualitat i seeds
    quality_order = {'4K': 4, '1080p': 3, '720p': 2, '480p': 1, 'SD': 0}
    preferred_quality = quality_order.get(quality, 2)

    def score_stream(s: TorrentioStream) -> tuple:
        q = quality_order.get(s.quality, 0)
        # Penalitzar si la qualitat no és la preferida
        quality_diff = abs(q - preferred_quality)
        return (s.verified, -quality_diff, q, s.seeds)

    candidates.sort(key=score_stream, reverse=True)

    # Retornar el millor candidat, preferiblement verificat
    best = candidates[0]

    # Si el millor no està verificat, intentar verificar-lo ara
    if not best.verified:
        best.verified = await verify_stream_url(best.url)

    return best if best.verified else None


def clear_cache():
    """Neteja tot el cache de streams"""
    global _stream_cache
    _stream_cache = {}
    logger.info("Stream cache cleared")
