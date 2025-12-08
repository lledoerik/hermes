"""
BBC iPlayer Client
Extreu URLs de streaming de BBC iPlayer utilitzant yt-dlp

Suport per 1080p:
- BBC iPlayer limita els navegadors a 720p
- Aquesta implementació intenta forçar 1080p modificant els paràmetres del manifest HLS
- No tots els programes tenen 1080p disponible (especialment contingut web-only)

Autenticació:
- Utilitza cookies de sessió guardades de forma segura (encriptades)
- Les cookies es configuren a través del panell d'administració
- Permet accés als amics sense que necessitin compte BBC
"""

import asyncio
import json
import logging
import re
import subprocess
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

import httpx

from .bbc_cookies import BBCCookieFile, has_bbc_cookies

logger = logging.getLogger(__name__)

# Bitrates de BBC iPlayer HLS
BBC_BITRATES = {
    "1080p": 12000000,  # Full HD
    "720p": 5070000,    # HD
    "540p": 2812000,    # SD+
    "396p": 1500000,    # SD
}


@dataclass
class BBCStream:
    """Representa un stream de BBC iPlayer"""
    programme_id: str
    title: str
    description: Optional[str]
    thumbnail: Optional[str]
    duration: Optional[int]  # en segons
    url: Optional[str]  # URL de streaming directe
    formats: List[Dict]  # Formats disponibles
    subtitles: Optional[Dict]  # Subtítols disponibles
    series_id: Optional[str] = None
    season: Optional[int] = None
    episode: Optional[int] = None
    quality: Optional[str] = None  # Qualitat real obtinguda

    def to_dict(self) -> Dict:
        return {
            "programme_id": self.programme_id,
            "title": self.title,
            "description": self.description,
            "thumbnail": self.thumbnail,
            "duration": self.duration,
            "url": self.url,
            "formats": self.formats,
            "subtitles": self.subtitles,
            "series_id": self.series_id,
            "season": self.season,
            "episode": self.episode,
            "quality": self.quality
        }


class BBCiPlayerClient:
    """Client per obtenir streams de BBC iPlayer via yt-dlp"""

    def __init__(self):
        self.base_url = "https://www.bbc.co.uk/iplayer/episode"

    def _extract_programme_id(self, url: str) -> Optional[str]:
        """
        Extreu el programme_id d'una URL de BBC iPlayer

        Exemples:
        - https://www.bbc.co.uk/iplayer/episode/m0025643/one-piece-whole-cake-island
        - m0025643
        """
        # Si ja és un ID directe
        if re.match(r'^[a-z]\d{7}$', url):
            return url

        # Extreure de la URL
        match = re.search(r'/episode/([a-z]\d{7})', url)
        if match:
            return match.group(1)

        # Format alternatiu
        match = re.search(r'([a-z]\d{7})', url)
        if match:
            return match.group(1)

        return None

    def _upgrade_to_1080p(self, url: str) -> str:
        """
        Intenta actualitzar una URL de 720p a 1080p

        BBC utilitza paràmetres de bitrate en les URLs HLS:
        - 720p: -video=5070000.m3u8
        - 1080p: -video=12000000.m3u8
        """
        if not url:
            return url

        # Patró per trobar el bitrate de 720p
        pattern_720p = r'-video=5070000\.m3u8'
        replacement_1080p = '-video=12000000.m3u8'

        # També pot aparèixer com a paràmetre a la URL
        pattern_720p_alt = r'video=5070000'
        replacement_1080p_alt = 'video=12000000'

        upgraded = re.sub(pattern_720p, replacement_1080p, url)
        upgraded = re.sub(pattern_720p_alt, replacement_1080p_alt, upgraded)

        return upgraded

    async def _verify_url_accessible(self, url: str) -> bool:
        """Verifica si una URL és accessible (no retorna 404)"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.head(url, follow_redirects=True)
                return response.status_code == 200
        except Exception as e:
            logger.debug(f"Error verificant URL: {e}")
            return False

    async def get_stream_info(
        self,
        url_or_id: str,
        quality: str = "best"
    ) -> Optional[BBCStream]:
        """
        Obtenir informació i URL de streaming d'un programa de BBC iPlayer

        Args:
            url_or_id: URL completa o programme_id (e.g., m0025643)
            quality: "best", "1080", "720", "480", "worst"
                    - "best" intentarà 1080p primer, amb fallback a 720p
                    - "1080" forçarà 1080p (pot fallar si no disponible)

        Returns:
            BBCStream amb tota la informació del programa
        """
        programme_id = self._extract_programme_id(url_or_id)
        if not programme_id:
            logger.error(f"No s'ha pogut extreure programme_id de: {url_or_id}")
            return None

        url = f"{self.base_url}/{programme_id}"

        try:
            # Utilitzar yt-dlp per obtenir informació
            result = await self._run_ytdlp([
                "--dump-json",
                "--no-download",
                url
            ])

            if not result:
                return None

            info = json.loads(result)

            # Obtenir URL directa
            stream_url, actual_quality = await self._get_best_url_with_1080p(url, quality)

            # Processar subtítols
            subtitles = {}
            if "subtitles" in info:
                for lang, subs in info.get("subtitles", {}).items():
                    if subs:
                        subtitles[lang] = subs[0].get("url") if subs else None

            # Extreure temporada/episodi del títol si existeix
            season, episode = self._extract_season_episode(info.get("title", ""))

            return BBCStream(
                programme_id=programme_id,
                title=info.get("title", ""),
                description=info.get("description"),
                thumbnail=info.get("thumbnail"),
                duration=info.get("duration"),
                url=stream_url,
                formats=info.get("formats", []),
                subtitles=subtitles if subtitles else None,
                series_id=info.get("series_id"),
                season=season,
                episode=episode,
                quality=actual_quality
            )

        except json.JSONDecodeError as e:
            logger.error(f"Error parsejant JSON de yt-dlp: {e}")
            return None
        except Exception as e:
            logger.error(f"Error obtenint info de BBC iPlayer: {e}")
            return None

    async def _get_best_url_with_1080p(
        self,
        url: str,
        quality: str = "best"
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Obtenir la millor URL de streaming, intentant 1080p si és possible

        Returns:
            (url, quality_achieved) - La URL i la qualitat real obtinguda
        """
        try:
            # Primer obtenim la URL de 720p (la màxima que yt-dlp pot obtenir directament)
            result = await self._run_ytdlp([
                "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
                "-g",
                url
            ])

            if not result:
                return None, None

            urls = result.strip().split("\n")
            base_url = urls[0] if urls else None

            if not base_url:
                return None, None

            # Si l'usuari vol 720p o menys, retornem directament
            if quality in ["720", "480", "worst"]:
                return base_url, "720p"

            # Intentar actualitzar a 1080p
            if quality in ["best", "1080"]:
                upgraded_url = self._upgrade_to_1080p(base_url)

                if upgraded_url != base_url:
                    # Verificar si la URL 1080p és accessible
                    logger.info(f"Intentant obtenir 1080p...")
                    is_accessible = await self._verify_url_accessible(upgraded_url)

                    if is_accessible:
                        logger.info("1080p disponible!")
                        return upgraded_url, "1080p"
                    else:
                        logger.info("1080p no disponible, utilitzant 720p")
                        if quality == "1080":
                            # L'usuari ha demanat específicament 1080p
                            logger.warning(
                                "1080p no disponible per aquest contingut. "
                                "Alguns programes (web-only) només tenen 720p."
                            )

            return base_url, "720p"

        except Exception as e:
            logger.error(f"Error obtenint URL: {e}")
            return None, None

    async def _get_best_url(self, url: str, quality: str = "best") -> Optional[str]:
        """Obtenir la millor URL de streaming directe (legacy)"""
        stream_url, _ = await self._get_best_url_with_1080p(url, quality)
        return stream_url

    async def get_formats(self, url_or_id: str) -> List[Dict]:
        """
        Obtenir tots els formats disponibles d'un programa

        Inclou formats 1080p sintètics si 720p està disponible

        Returns:
            Llista de formats amb resolució, codec, etc.
        """
        programme_id = self._extract_programme_id(url_or_id)
        if not programme_id:
            return []

        url = f"{self.base_url}/{programme_id}"

        try:
            result = await self._run_ytdlp([
                "--list-formats",
                "-J",
                url
            ])

            if result:
                info = json.loads(result)
                formats = info.get("formats", [])

                # Simplificar la sortida
                simplified = []
                has_720p = False

                for fmt in formats:
                    height = fmt.get("height")
                    if height == 720:
                        has_720p = True

                    simplified.append({
                        "format_id": fmt.get("format_id"),
                        "ext": fmt.get("ext"),
                        "resolution": fmt.get("resolution"),
                        "height": height,
                        "width": fmt.get("width"),
                        "vcodec": fmt.get("vcodec"),
                        "acodec": fmt.get("acodec"),
                        "filesize": fmt.get("filesize"),
                        "tbr": fmt.get("tbr")
                    })

                # Afegir format 1080p sintètic si tenim 720p
                if has_720p:
                    simplified.append({
                        "format_id": "1080p_upgraded",
                        "ext": "mp4",
                        "resolution": "1920x1080",
                        "height": 1080,
                        "width": 1920,
                        "vcodec": "avc1",
                        "acodec": "mp4a",
                        "filesize": None,
                        "tbr": 12000,
                        "note": "Pot no estar disponible per contingut web-only"
                    })

                return simplified

            return []

        except Exception as e:
            logger.error(f"Error obtenint formats: {e}")
            return []

    async def search_series(
        self,
        series_url: str
    ) -> List[Dict]:
        """
        Obtenir tots els episodis d'una sèrie de BBC iPlayer

        Args:
            series_url: URL de la sèrie o seriesId

        Returns:
            Llista d'episodis amb informació bàsica
        """
        try:
            result = await self._run_ytdlp([
                "--flat-playlist",
                "-J",
                series_url
            ])

            if result:
                info = json.loads(result)
                entries = info.get("entries", [])

                episodes = []
                for entry in entries:
                    episodes.append({
                        "programme_id": entry.get("id"),
                        "title": entry.get("title"),
                        "url": entry.get("url"),
                        "duration": entry.get("duration")
                    })

                return episodes

            return []

        except Exception as e:
            logger.error(f"Error obtenint sèrie: {e}")
            return []

    def _extract_season_episode(self, title: str) -> tuple:
        """Extreure temporada i episodi del títol"""
        season = None
        episode = None

        # Patrons comuns: "S01E05", "Series 1: Episode 5", "Season 1 Episode 5"
        patterns = [
            r'[Ss](\d+)[Ee](\d+)',
            r'[Ss]eries\s*(\d+).*[Ee]pisode\s*(\d+)',
            r'[Ss]eason\s*(\d+).*[Ee]pisode\s*(\d+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, title)
            if match:
                season = int(match.group(1))
                episode = int(match.group(2))
                break

        return season, episode

    async def _run_ytdlp(self, args: List[str]) -> Optional[str]:
        """
        Executar yt-dlp com a subprocess async

        Utilitza cookies de BBC si estan configurades per autenticar-se.
        """
        try:
            # Utilitzar context manager per gestionar el fitxer de cookies temporal
            with BBCCookieFile() as cookie_file:
                cmd = ["yt-dlp"]

                # Afegir cookies si disponibles
                if cookie_file:
                    cmd.extend(["--cookies", cookie_file])
                    logger.debug("Utilitzant cookies de BBC configurades")

                cmd.extend(args)

                logger.debug(f"Executant: {' '.join(cmd[:3])}...")  # No mostrar tot per seguretat

                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )

                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=60  # 60 segons timeout
                )

                if process.returncode != 0:
                    error_msg = stderr.decode() if stderr else "Error desconegut"
                    logger.error(f"yt-dlp error: {error_msg}")

                    # Errors comuns
                    if "not available in your country" in error_msg.lower():
                        raise BBCiPlayerError(
                            "Aquest contingut no està disponible fora del Regne Unit. "
                            "Necessites una IP del Regne Unit per accedir a BBC iPlayer."
                        )
                    if "sign in" in error_msg.lower():
                        if has_bbc_cookies():
                            raise BBCiPlayerError(
                                "Les cookies de BBC han expirat o són invàlides. "
                                "L'administrador ha de reconfigurar-les."
                            )
                        else:
                            raise BBCiPlayerError(
                                "Aquest contingut requereix autenticació. "
                                "L'administrador ha de configurar les cookies de BBC."
                            )

                    return None

                return stdout.decode() if stdout else None

        except asyncio.TimeoutError:
            logger.error("Timeout executant yt-dlp")
            return None
        except FileNotFoundError:
            logger.error("yt-dlp no està instal·lat. Instal·la'l amb: pip install yt-dlp")
            raise BBCiPlayerError(
                "yt-dlp no està instal·lat. "
                "Instal·la'l amb: pip install yt-dlp"
            )
        except BBCiPlayerError:
            raise
        except Exception as e:
            logger.error(f"Error executant yt-dlp: {e}")
            return None


class BBCiPlayerError(Exception):
    """Excepció per errors de BBC iPlayer"""
    pass
