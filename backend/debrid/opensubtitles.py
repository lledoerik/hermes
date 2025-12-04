"""
Subtitle Search Client
Busca subtítols des de múltiples fonts
"""

import httpx
import logging
import zipfile
import gzip
import io
import re
import base64
import xmlrpc.client
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class Subtitle:
    """Representa un subtítol"""
    id: str
    language: str
    language_name: str
    release_name: str
    download_url: str
    upload_date: str
    ratings: float
    download_count: int
    hearing_impaired: bool
    ai_translated: bool
    source: str

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "language": self.language,
            "language_name": self.language_name,
            "release_name": self.release_name,
            "download_url": self.download_url,
            "upload_date": self.upload_date,
            "ratings": self.ratings,
            "download_count": self.download_count,
            "hearing_impaired": self.hearing_impaired,
            "ai_translated": self.ai_translated,
            "source": self.source
        }


class SubtitleClient:
    """
    Client per buscar subtítols via OpenSubtitles XML-RPC (gratuït, sense clau)
    """

    def __init__(self):
        self.user_agent = "Hermes v1.0"
        self.xmlrpc_url = "https://api.opensubtitles.org/xml-rpc"
        self._token = None
        self._download_cache: Dict[str, str] = {}

    def _get_language_name(self, code: str) -> str:
        """Retorna el nom de l'idioma"""
        names = {
            "eng": "Anglès", "en": "Anglès",
            "spa": "Espanyol", "es": "Espanyol",
            "cat": "Català", "ca": "Català",
            "fre": "Francès", "fr": "Francès",
            "ger": "Alemany", "de": "Alemany",
            "ita": "Italià", "it": "Italià",
            "por": "Portuguès", "pt": "Portuguès",
            "jpn": "Japonès", "ja": "Japonès",
            "kor": "Coreà", "ko": "Coreà",
            "chi": "Xinès", "zh": "Xinès",
            "rus": "Rus", "ru": "Rus",
        }
        return names.get(code.lower(), code.upper())

    def _map_language(self, lang: str) -> str:
        """Mapeja codis d'idioma ISO 639-1 a ISO 639-2"""
        mapping = {
            "ca": "cat",
            "es": "spa",
            "en": "eng",
            "fr": "fre",
            "de": "ger",
            "it": "ita",
            "pt": "por"
        }
        return mapping.get(lang, lang)

    async def _login(self) -> Optional[str]:
        """Login anònim a OpenSubtitles"""
        if self._token:
            return self._token

        try:
            # Usar xmlrpc de forma async
            import asyncio
            loop = asyncio.get_event_loop()

            def do_login():
                server = xmlrpc.client.ServerProxy(self.xmlrpc_url)
                result = server.LogIn("", "", "en", self.user_agent)
                if result.get("status") == "200 OK":
                    return result.get("token")
                return None

            self._token = await loop.run_in_executor(None, do_login)
            return self._token
        except Exception as e:
            logger.error(f"Error login OpenSubtitles: {e}")
            return None

    async def search_subtitles(
        self,
        imdb_id: Optional[str] = None,
        tmdb_id: Optional[int] = None,
        query: Optional[str] = None,
        season: Optional[int] = None,
        episode: Optional[int] = None,
        languages: Optional[List[str]] = None
    ) -> List[Subtitle]:
        """Cerca subtítols a OpenSubtitles"""
        subtitles = []

        token = await self._login()
        if not token:
            logger.warning("No s'ha pogut connectar amb OpenSubtitles")
            return []

        try:
            import asyncio
            loop = asyncio.get_event_loop()

            # Preparar paràmetres de cerca
            search_params = {}

            if imdb_id:
                # Netejar IMDB ID
                clean_imdb = imdb_id.replace("tt", "")
                search_params["imdbid"] = clean_imdb
            elif query:
                search_params["query"] = query
            else:
                return []

            if season is not None:
                search_params["season"] = str(season)
            if episode is not None:
                search_params["episode"] = str(episode)

            # Convertir idiomes
            if languages:
                os_langs = [self._map_language(l) for l in languages]
                search_params["sublanguageid"] = ",".join(os_langs)
            else:
                search_params["sublanguageid"] = "cat,spa,eng"

            def do_search():
                server = xmlrpc.client.ServerProxy(self.xmlrpc_url)
                result = server.SearchSubtitles(token, [search_params])
                return result

            result = await loop.run_in_executor(None, do_search)

            if result.get("status") != "200 OK":
                logger.warning(f"OpenSubtitles cerca fallida: {result.get('status')}")
                return []

            data = result.get("data", [])
            if not data or data is False:
                return []

            for sub in data:
                try:
                    lang_code = sub.get("SubLanguageID", "").lower()
                    # Mapejar a codi curt
                    short_code = {"cat": "ca", "spa": "es", "eng": "en", "fre": "fr"}.get(lang_code, lang_code[:2])

                    subtitle = Subtitle(
                        id=f"os_{sub.get('IDSubtitleFile', '')}",
                        language=short_code,
                        language_name=self._get_language_name(lang_code),
                        release_name=sub.get("MovieReleaseName", "")[:100],
                        download_url=sub.get("SubDownloadLink", ""),
                        upload_date=sub.get("SubAddDate", ""),
                        ratings=float(sub.get("SubRating", 0) or 0),
                        download_count=int(sub.get("SubDownloadsCnt", 0) or 0),
                        hearing_impaired=sub.get("SubHearingImpaired", "0") == "1",
                        ai_translated=False,
                        source="opensubtitles"
                    )
                    subtitles.append(subtitle)
                except Exception as e:
                    logger.debug(f"Error parsejant subtítol: {e}")
                    continue

            # Ordenar per idioma i descàrregues
            lang_priority = {"ca": 0, "es": 1, "en": 2}
            subtitles.sort(key=lambda s: (
                lang_priority.get(s.language, 99),
                -s.download_count
            ))

            logger.info(f"Trobats {len(subtitles)} subtítols")
            return subtitles

        except Exception as e:
            logger.error(f"Error cercant subtítols: {e}")
            return []

    async def download_subtitle(self, subtitle_id: str) -> Optional[str]:
        """Descarrega un subtítol i retorna en format VTT"""
        if subtitle_id in self._download_cache:
            return self._download_cache[subtitle_id]

        try:
            if subtitle_id.startswith("os_"):
                file_id = subtitle_id[3:]
                content = await self._download_opensubtitles(file_id)
            else:
                logger.error(f"Font desconeguda: {subtitle_id}")
                return None

            if content:
                if self._is_srt(content):
                    content = self._srt_to_vtt(content)
                self._download_cache[subtitle_id] = content

            return content

        except Exception as e:
            logger.error(f"Error descarregant subtítol: {e}")
            return None

    async def _download_opensubtitles(self, file_id: str) -> Optional[str]:
        """Descarrega subtítol d'OpenSubtitles via XML-RPC"""
        token = await self._login()
        if not token:
            return None

        try:
            import asyncio
            loop = asyncio.get_event_loop()

            def do_download():
                server = xmlrpc.client.ServerProxy(self.xmlrpc_url)
                result = server.DownloadSubtitles(token, [file_id])
                return result

            result = await loop.run_in_executor(None, do_download)

            if result.get("status") != "200 OK":
                logger.error(f"Error descarregant: {result.get('status')}")
                return None

            data = result.get("data", [])
            if not data:
                return None

            # El contingut ve en base64 i comprimit amb gzip
            encoded = data[0].get("data", "")
            if not encoded:
                return None

            # Decodificar base64 i descomprimir gzip
            compressed = base64.b64decode(encoded)
            content = gzip.decompress(compressed).decode('utf-8', errors='replace')
            return content

        except Exception as e:
            logger.error(f"Error descarregant d'OpenSubtitles: {e}")
            return None

    def _is_srt(self, content: str) -> bool:
        """Comprova si és format SRT"""
        first_lines = content.strip().split('\n')[:5]
        for line in first_lines:
            line = line.strip()
            if line.isdigit():
                return True
            if line.upper().startswith("WEBVTT"):
                return False
        return True

    def _srt_to_vtt(self, srt_content: str) -> str:
        """Converteix SRT a VTT"""
        vtt_content = "WEBVTT\n\n"
        lines = srt_content.strip().split('\n')

        i = 0
        while i < len(lines):
            line = lines[i].strip()

            if line.isdigit():
                i += 1
                continue

            if '-->' in line:
                line = line.replace(',', '.')
                vtt_content += line + '\n'
                i += 1

                while i < len(lines) and lines[i].strip():
                    vtt_content += lines[i] + '\n'
                    i += 1
                vtt_content += '\n'
            else:
                i += 1

        return vtt_content

    def is_configured(self) -> bool:
        """Sempre disponible (usa API gratuïta)"""
        return True


# Alias per compatibilitat
OpenSubtitlesClient = SubtitleClient
