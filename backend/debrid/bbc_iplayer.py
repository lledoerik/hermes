"""
BBC iPlayer Client
Extreu URLs de streaming de BBC iPlayer utilitzant yt-dlp
"""

import asyncio
import json
import logging
import re
import subprocess
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


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
            "episode": self.episode
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

            # Obtenir URL directa del millor format
            stream_url = await self._get_best_url(url, quality)

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
                episode=episode
            )

        except json.JSONDecodeError as e:
            logger.error(f"Error parsejant JSON de yt-dlp: {e}")
            return None
        except Exception as e:
            logger.error(f"Error obtenint info de BBC iPlayer: {e}")
            return None

    async def _get_best_url(self, url: str, quality: str = "best") -> Optional[str]:
        """Obtenir la millor URL de streaming directe"""
        try:
            # Mapa de qualitats
            format_selector = {
                "best": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
                "1080": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
                "720": "bestvideo[height<=720]+bestaudio/best[height<=720]",
                "480": "bestvideo[height<=480]+bestaudio/best[height<=480]",
                "worst": "worstvideo+worstaudio/worst"
            }.get(quality, "best")

            result = await self._run_ytdlp([
                "-f", format_selector,
                "-g",  # Obtenir URL directe
                url
            ])

            if result:
                # yt-dlp pot retornar múltiples URLs (video + audio)
                urls = result.strip().split("\n")
                return urls[0] if urls else None

            return None

        except Exception as e:
            logger.error(f"Error obtenint URL directa: {e}")
            return None

    async def get_formats(self, url_or_id: str) -> List[Dict]:
        """
        Obtenir tots els formats disponibles d'un programa

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
                "-J",  # JSON output
                url
            ])

            if result:
                info = json.loads(result)
                formats = info.get("formats", [])

                # Simplificar la sortida
                simplified = []
                for fmt in formats:
                    simplified.append({
                        "format_id": fmt.get("format_id"),
                        "ext": fmt.get("ext"),
                        "resolution": fmt.get("resolution"),
                        "height": fmt.get("height"),
                        "width": fmt.get("width"),
                        "vcodec": fmt.get("vcodec"),
                        "acodec": fmt.get("acodec"),
                        "filesize": fmt.get("filesize"),
                        "tbr": fmt.get("tbr")  # bitrate total
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
        """Executar yt-dlp com a subprocess async"""
        try:
            cmd = ["yt-dlp"] + args

            logger.debug(f"Executant: {' '.join(cmd)}")

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
                    raise BBCiPlayerError(
                        "Aquest contingut requereix iniciar sessió a BBC iPlayer."
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
        except Exception as e:
            logger.error(f"Error executant yt-dlp: {e}")
            return None


class BBCiPlayerError(Exception):
    """Excepció per errors de BBC iPlayer"""
    pass
