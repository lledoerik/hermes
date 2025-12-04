"""
Subtitle Search Client
Busca subtítols des de fonts gratuïtes sense necessitat de clau API
"""

import httpx
import logging
import zipfile
import gzip
import io
import re
import base64
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
    Client per buscar subtítols via OpenSubtitles.org (scraping públic)
    """

    def __init__(self):
        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        self._download_cache: Dict[str, str] = {}

    def _get_language_name(self, code: str) -> str:
        """Retorna el nom de l'idioma"""
        names = {
            "eng": "Anglès", "en": "Anglès", "english": "Anglès",
            "spa": "Espanyol", "es": "Espanyol", "spanish": "Espanyol",
            "cat": "Català", "ca": "Català", "catalan": "Català",
            "fre": "Francès", "fr": "Francès", "french": "Francès",
            "ger": "Alemany", "de": "Alemany", "german": "Alemany",
            "ita": "Italià", "it": "Italià", "italian": "Italià",
            "por": "Portuguès", "pt": "Portuguès", "portuguese": "Portuguès",
        }
        return names.get(code.lower(), code.upper())

    def _normalize_lang(self, lang: str) -> str:
        """Normalitza codi d'idioma a format curt"""
        mapping = {
            "english": "en", "eng": "en",
            "spanish": "es", "spa": "es",
            "catalan": "ca", "cat": "ca",
            "french": "fr", "fre": "fr",
            "german": "de", "ger": "de",
            "italian": "it", "ita": "it",
            "portuguese": "pt", "por": "pt",
        }
        return mapping.get(lang.lower(), lang[:2].lower() if len(lang) > 2 else lang.lower())

    async def search_subtitles(
        self,
        imdb_id: Optional[str] = None,
        tmdb_id: Optional[int] = None,
        query: Optional[str] = None,
        season: Optional[int] = None,
        episode: Optional[int] = None,
        languages: Optional[List[str]] = None
    ) -> List[Subtitle]:
        """Cerca subtítols"""
        subtitles = []

        # Intentar OpenSubtitles.org via scraping
        os_results = await self._search_opensubtitles_web(
            imdb_id=imdb_id,
            season=season,
            episode=episode,
            languages=languages
        )
        subtitles.extend(os_results)

        # Ordenar per idioma i descàrregues
        lang_priority = {"ca": 0, "es": 1, "en": 2}
        subtitles.sort(key=lambda s: (
            lang_priority.get(s.language, 99),
            -s.download_count
        ))

        logger.info(f"Trobats {len(subtitles)} subtítols")
        return subtitles

    async def _search_opensubtitles_web(
        self,
        imdb_id: Optional[str] = None,
        season: Optional[int] = None,
        episode: Optional[int] = None,
        languages: Optional[List[str]] = None
    ) -> List[Subtitle]:
        """Cerca subtítols via OpenSubtitles.org web"""
        subtitles = []

        if not imdb_id:
            return []

        try:
            # Construir URL de cerca
            clean_imdb = imdb_id.replace("tt", "")

            # Per sèries, buscar per episodi
            if season is not None and episode is not None:
                url = f"https://www.opensubtitles.org/en/search/imdbid-{clean_imdb}/season-{season}/episode-{episode}/sublanguageid-cat,spa,eng"
            else:
                url = f"https://www.opensubtitles.org/en/search/imdbid-{clean_imdb}/sublanguageid-cat,spa,eng"

            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                response = await client.get(url, headers={
                    "User-Agent": self.user_agent,
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "en-US,en;q=0.9"
                })

                if response.status_code != 200:
                    logger.warning(f"OpenSubtitles web retorna {response.status_code}")
                    return []

                html = response.text

                # Parsejar HTML per trobar subtítols
                # Buscar patró de links de descàrrega
                import re

                # Patró per trobar subtítols a la taula de resultats
                # Format: /en/subtitleserve/sub/XXXXXX
                pattern = r'/en/subtitleserve/sub/(\d+)'
                matches = re.findall(pattern, html)

                # També buscar info dels subtítols
                # Buscar les files de la taula
                row_pattern = r'<a[^>]*href="/en/subtitles/(\d+)[^"]*"[^>]*>([^<]+)</a>'
                name_matches = re.findall(row_pattern, html)

                # Buscar idiomes
                lang_pattern = r'<a[^>]*title="([^"]+)"[^>]*class="[^"]*flag[^"]*"'
                lang_matches = re.findall(lang_pattern, html)

                seen_ids = set()
                for i, sub_id in enumerate(matches[:30]):  # Limitar a 30
                    if sub_id in seen_ids:
                        continue
                    seen_ids.add(sub_id)

                    # Intentar determinar idioma
                    lang = "en"  # Per defecte
                    if i < len(lang_matches):
                        lang_name = lang_matches[i].lower()
                        if "spanish" in lang_name or "español" in lang_name:
                            lang = "es"
                        elif "catalan" in lang_name or "català" in lang_name:
                            lang = "ca"
                        elif "english" in lang_name:
                            lang = "en"

                    # Filtrar per idiomes desitjats
                    if languages and lang not in languages:
                        continue

                    # Nom del release
                    release_name = f"Subtitle {sub_id}"
                    if i < len(name_matches):
                        release_name = name_matches[i][1][:100]

                    subtitle = Subtitle(
                        id=f"osweb_{sub_id}",
                        language=lang,
                        language_name=self._get_language_name(lang),
                        release_name=release_name,
                        download_url=f"https://www.opensubtitles.org/en/subtitleserve/sub/{sub_id}",
                        upload_date="",
                        ratings=0.0,
                        download_count=1000 - i,  # Ordre aproximat
                        hearing_impaired=False,
                        ai_translated=False,
                        source="opensubtitles"
                    )
                    subtitles.append(subtitle)

        except Exception as e:
            logger.error(f"Error cercant a OpenSubtitles web: {e}")

        return subtitles

    async def download_subtitle(self, subtitle_id: str) -> Optional[str]:
        """Descarrega un subtítol i retorna en format VTT"""
        if subtitle_id in self._download_cache:
            return self._download_cache[subtitle_id]

        try:
            if subtitle_id.startswith("osweb_"):
                sub_id = subtitle_id[6:]
                content = await self._download_opensubtitles_web(sub_id)
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

    async def _download_opensubtitles_web(self, sub_id: str) -> Optional[str]:
        """Descarrega subtítol d'OpenSubtitles.org"""
        try:
            url = f"https://www.opensubtitles.org/en/subtitleserve/sub/{sub_id}"

            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url, headers={
                    "User-Agent": self.user_agent
                })

                if response.status_code != 200:
                    logger.error(f"Error descarregant subtítol: {response.status_code}")
                    return None

                content_type = response.headers.get("content-type", "")

                # Si és ZIP, extreure
                if "zip" in content_type or response.content[:4] == b'PK\x03\x04':
                    return self._extract_subtitle_from_zip(response.content)

                # Si és GZIP
                if response.content[:2] == b'\x1f\x8b':
                    try:
                        content = gzip.decompress(response.content).decode('utf-8', errors='replace')
                        return content
                    except:
                        pass

                # Text directe
                return response.text

        except Exception as e:
            logger.error(f"Error descarregant d'OpenSubtitles: {e}")
            return None

    def _extract_subtitle_from_zip(self, zip_content: bytes) -> Optional[str]:
        """Extreu subtítol d'un ZIP"""
        try:
            with zipfile.ZipFile(io.BytesIO(zip_content)) as zf:
                subtitle_files = [
                    f for f in zf.namelist()
                    if f.lower().endswith(('.srt', '.vtt', '.sub', '.ass'))
                ]

                if not subtitle_files:
                    return None

                for ext in ['.srt', '.vtt', '.ass', '.sub']:
                    for f in subtitle_files:
                        if f.lower().endswith(ext):
                            content = zf.read(f)
                            for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                                try:
                                    return content.decode(encoding)
                                except UnicodeDecodeError:
                                    continue
                            return content.decode('utf-8', errors='replace')

        except Exception as e:
            logger.error(f"Error extraient subtítol del ZIP: {e}")

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
        """Sempre disponible"""
        return True


# Alias per compatibilitat
OpenSubtitlesClient = SubtitleClient
