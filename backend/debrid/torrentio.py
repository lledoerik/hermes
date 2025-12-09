"""
Torrentio API Client
Busca torrents usant l'addon de Stremio Torrentio
"""

import httpx
import logging
import re
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class TorrentStream:
    """Representa un stream de torrent"""
    name: str
    title: str
    info_hash: str
    magnet: str
    size: Optional[str]
    seeders: Optional[int]
    quality: Optional[str]
    source: Optional[str]
    languages: List[str]
    file_idx: Optional[int] = None  # Index del fitxer per sèries (season packs)

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "title": self.title,
            "info_hash": self.info_hash,
            "magnet": self.magnet,
            "size": self.size,
            "seeders": self.seeders,
            "quality": self.quality,
            "source": self.source,
            "languages": self.languages,
            "file_idx": self.file_idx
        }


class TorrentioClient:
    """Client per buscar torrents via Torrentio addon"""

    def __init__(self, base_url: str = "https://torrentio.strem.fun"):
        self.base_url = base_url.rstrip("/")

    def _parse_stream(self, stream: Dict) -> Optional[TorrentStream]:
        """Parsejar un stream de Torrentio al nostre format"""
        try:
            name = stream.get("name", "")
            title = stream.get("title", "")

            # Extreure info_hash de múltiples llocs possibles
            info_hash = None
            behavior_hints = stream.get("behaviorHints", {})

            # 1. Directament del stream (clau principal - format més comú!)
            if "infoHash" in stream:
                info_hash = stream["infoHash"]

            # 2. De behaviorHints.infoHash (format alternatiu)
            if not info_hash and "infoHash" in behavior_hints:
                info_hash = behavior_hints["infoHash"]

            # 3. De bingeGroup (format: hash:fileIdx)
            if not info_hash and "bingeGroup" in behavior_hints:
                binge = behavior_hints["bingeGroup"]
                if ":" in binge:
                    info_hash = binge.split(":")[0]
                elif len(binge) == 40:
                    info_hash = binge

            # 3. De la URL (pot tenir el hash en diversos formats)
            if not info_hash:
                url = stream.get("url", "")
                # Format: /hash/fileIdx o similar
                hash_match = re.search(r'/([a-fA-F0-9]{40})(?:/|$|\?)', url)
                if hash_match:
                    info_hash = hash_match.group(1).lower()
                else:
                    # Buscar hash en qualsevol lloc de la URL
                    hash_match = re.search(r'([a-fA-F0-9]{40})', url)
                    if hash_match:
                        info_hash = hash_match.group(1).lower()

            # 4. Del title (alguns proveïdors ho posen aquí)
            if not info_hash:
                hash_match = re.search(r'([a-fA-F0-9]{40})', title)
                if hash_match:
                    info_hash = hash_match.group(1).lower()

            # 5. Del name
            if not info_hash:
                hash_match = re.search(r'([a-fA-F0-9]{40})', name)
                if hash_match:
                    info_hash = hash_match.group(1).lower()

            if not info_hash:
                logger.debug(f"No s'ha trobat info_hash per stream: {name[:50]}...")
                return None

            # Construir magnet link
            # Torrentio pot proporcionar-lo directament o cal construir-lo
            magnet = stream.get("url", "")
            if not magnet.startswith("magnet:"):
                # Construir magnet bàsic
                stream_title = title.split("\n")[0] if title else name
                magnet = f"magnet:?xt=urn:btih:{info_hash}&dn={stream_title}"

            # Extreure mida del title
            size = None
            size_match = re.search(r'💾\s*([\d.]+\s*(?:GB|MB|TB))', title)
            if size_match:
                size = size_match.group(1)
            else:
                size_match = re.search(r'([\d.]+\s*(?:GB|MB|TB))', title)
                if size_match:
                    size = size_match.group(1)

            # Extreure seeders
            seeders = None
            seeders_match = re.search(r'👤\s*(\d+)', title)
            if seeders_match:
                seeders = int(seeders_match.group(1))

            # Extreure qualitat del name
            quality = None
            for q in ["2160p", "4K", "1080p", "720p", "480p", "HDRip", "WEBRip", "BluRay", "HDTV"]:
                if q.lower() in name.lower():
                    quality = q
                    break

            # Extreure font (proveïdor)
            source = None
            source_match = re.match(r'\[([^\]]+)\]', name)
            if source_match:
                source = source_match.group(1)

            # Extreure idiomes (flags)
            languages = []
            flag_pattern = r'[🇪🇸🇬🇧🇺🇸🇫🇷🇩🇪🇮🇹🇯🇵🇰🇷🇨🇳🇷🇺🇵🇹🇧🇷🇲🇽🇦🇷]+'
            flags = re.findall(flag_pattern, title + name)
            if flags:
                languages = flags

            # Extreure fileIdx (índex del fitxer per season packs)
            file_idx = None
            if "fileIdx" in stream:
                file_idx = stream["fileIdx"]
            elif "fileIdx" in behavior_hints:
                file_idx = behavior_hints["fileIdx"]

            return TorrentStream(
                name=name,
                title=title,
                info_hash=info_hash,
                magnet=magnet,
                size=size,
                seeders=seeders,
                quality=quality,
                source=source,
                languages=languages,
                file_idx=file_idx
            )

        except Exception as e:
            logger.error(f"Error parsejant stream: {e}")
            return None

    async def search_movie(self, imdb_id: str) -> List[TorrentStream]:
        """
        Buscar torrents per una pel·lícula

        Args:
            imdb_id: ID d'IMDB (e.g., "tt1234567")

        Returns:
            Llista de TorrentStream
        """
        url = f"{self.base_url}/stream/movie/{imdb_id}.json"
        return await self._fetch_streams(url)

    async def search_series(
        self,
        imdb_id: str,
        season: int,
        episode: int
    ) -> List[TorrentStream]:
        """
        Buscar torrents per un episodi de sèrie

        Args:
            imdb_id: ID d'IMDB de la sèrie
            season: Número de temporada
            episode: Número d'episodi

        Returns:
            Llista de TorrentStream
        """
        url = f"{self.base_url}/stream/series/{imdb_id}:{season}:{episode}.json"
        return await self._fetch_streams(url)

    async def _fetch_streams(self, url: str) -> List[TorrentStream]:
        """Obtenir streams d'una URL de Torrentio"""
        try:
            # Headers complets per simular un navegador real
            # Torrentio pot bloquejar peticions que no semblin de navegador
            # NOTA: NO especifiquem Accept-Encoding per deixar que httpx gestioni
            # la compressió automàticament (evita errors de decodificació gzip)
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-GB,en;q=0.9,ca;q=0.8,es;q=0.7",
                "Origin": "https://web.stremio.com",
                "Referer": "https://web.stremio.com/",
                "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "cross-site",
                "Connection": "keep-alive",
            }
            async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
                response = await client.get(url)

                if response.status_code != 200:
                    logger.warning(f"Torrentio retorna {response.status_code} per {url}")
                    return []

                data = response.json()
                streams_data = data.get("streams", [])

                # Debug: mostrar primer stream per veure format
                if streams_data:
                    sample = streams_data[0]
                    logger.info(f"Sample stream: name={sample.get('name', '')[:60]}")
                    logger.info(f"Sample stream keys: {list(sample.keys())}")
                    logger.info(f"Sample behaviorHints: {sample.get('behaviorHints', {})}")
                    logger.info(f"Sample URL: {sample.get('url', '')[:100]}...")

                streams = []
                for stream_data in streams_data:
                    stream = self._parse_stream(stream_data)
                    if stream:
                        streams.append(stream)

                logger.info(f"Trobats {len(streams)} torrents de {len(streams_data)} streams")
                return streams

        except httpx.RequestError as e:
            logger.error(f"Error connectant amb Torrentio: {e}")
            return []
        except Exception as e:
            logger.error(f"Error buscant torrents: {e}")
            return []

    async def search(
        self,
        imdb_id: str,
        media_type: str = "movie",
        season: Optional[int] = None,
        episode: Optional[int] = None
    ) -> List[TorrentStream]:
        """
        Mètode genèric de cerca

        Args:
            imdb_id: ID d'IMDB
            media_type: "movie" o "series"
            season: Temporada (només per series)
            episode: Episodi (només per series)

        Returns:
            Llista de TorrentStream ordenats per qualitat i seeders
        """
        if media_type == "movie":
            streams = await self.search_movie(imdb_id)
        else:
            if season is None or episode is None:
                logger.error("Season i episode són requerits per series")
                return []
            streams = await self.search_series(imdb_id, season, episode)

        # Ordenar per qualitat i després per seeders
        quality_order = {"2160p": 0, "4K": 0, "1080p": 1, "720p": 2, "480p": 3}

        def sort_key(s: TorrentStream):
            q_score = quality_order.get(s.quality, 4) if s.quality else 4
            seeders = s.seeders or 0
            return (q_score, -seeders)

        streams.sort(key=sort_key)
        return streams
