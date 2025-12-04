"""
Subtitle Search Client
Busca subtítols des de múltiples fonts gratuïtes
"""

import httpx
import logging
import zipfile
import io
import re
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
    source: str  # Font del subtítol

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
    Client per buscar subtítols via múltiples fonts gratuïtes
    """

    def __init__(self):
        self.user_agent = "Hermes/1.0"
        self.subdl_api = "https://api.subdl.com/api/v1/subtitles"
        # Cache per evitar descarregues repetides
        self._download_cache: Dict[str, str] = {}

    def _get_language_name(self, code: str) -> str:
        """Retorna el nom de l'idioma"""
        names = {
            "en": "Anglès",
            "es": "Espanyol",
            "ca": "Català",
            "fr": "Francès",
            "de": "Alemany",
            "it": "Italià",
            "pt": "Portuguès",
            "ja": "Japonès",
            "ko": "Coreà",
            "zh": "Xinès",
            "ru": "Rus",
            "ar": "Àrab",
            "hi": "Hindi",
            "nl": "Neerlandès",
            "pl": "Polonès",
            "tr": "Turc",
            "sv": "Suec"
        }
        return names.get(code, code.upper())

    def _map_language_to_subdl(self, lang: str) -> str:
        """Mapeja codis d'idioma a format subdl"""
        mapping = {
            "ca": "catalan",
            "es": "spanish",
            "en": "english",
            "fr": "french",
            "de": "german",
            "it": "italian",
            "pt": "portuguese"
        }
        return mapping.get(lang, lang)

    async def search_subtitles(
        self,
        imdb_id: Optional[str] = None,
        tmdb_id: Optional[int] = None,
        query: Optional[str] = None,
        season: Optional[int] = None,
        episode: Optional[int] = None,
        languages: Optional[List[str]] = None
    ) -> List[Subtitle]:
        """
        Cerca subtítols

        Args:
            imdb_id: ID d'IMDB (e.g., "tt1234567")
            tmdb_id: ID de TMDB
            query: Cerca per nom
            season: Número de temporada (per sèries)
            episode: Número d'episodi (per sèries)
            languages: Llista de codis d'idioma (e.g., ["en", "es", "ca"])

        Returns:
            Llista de Subtitle ordenats per qualitat
        """
        all_subtitles = []

        # Buscar a subdl.com (API gratuïta)
        subdl_results = await self._search_subdl(
            imdb_id=imdb_id,
            tmdb_id=tmdb_id,
            query=query,
            season=season,
            episode=episode,
            languages=languages
        )
        all_subtitles.extend(subdl_results)

        # Ordenar per idioma prioritat i descàrregues
        lang_priority = {"ca": 0, "es": 1, "en": 2}
        all_subtitles.sort(key=lambda s: (
            lang_priority.get(s.language, 99),
            -s.download_count,
            -s.ratings
        ))

        logger.info(f"Trobats {len(all_subtitles)} subtítols en total")
        return all_subtitles

    async def _search_subdl(
        self,
        imdb_id: Optional[str] = None,
        tmdb_id: Optional[int] = None,
        query: Optional[str] = None,
        season: Optional[int] = None,
        episode: Optional[int] = None,
        languages: Optional[List[str]] = None
    ) -> List[Subtitle]:
        """Cerca subtítols a subdl.com"""
        subtitles = []

        try:
            params = {
                "subs_per_page": 30
            }

            # Usar IMDB ID o TMDB ID
            if imdb_id:
                params["imdb_id"] = imdb_id
            elif tmdb_id:
                params["tmdb_id"] = str(tmdb_id)
            elif query:
                params["film_name"] = query
            else:
                return []

            # Afegir temporada/episodi per sèries
            if season is not None:
                params["season_number"] = season
            if episode is not None:
                params["episode_number"] = episode

            # Idiomes (subdl usa noms complets)
            if languages:
                subdl_langs = [self._map_language_to_subdl(l) for l in languages]
                params["languages"] = ",".join(subdl_langs)

            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    self.subdl_api,
                    params=params,
                    headers={"User-Agent": self.user_agent}
                )

                if response.status_code != 200:
                    logger.warning(f"Subdl retorna {response.status_code}")
                    return []

                data = response.json()

                if not data.get("status"):
                    return []

                subs_data = data.get("subtitles", [])

                for sub in subs_data:
                    try:
                        # Mapeja l'idioma de subdl al nostre format
                        lang_name = sub.get("language", "").lower()
                        lang_code = self._subdl_lang_to_code(lang_name)

                        # Filtrar per idiomes desitjats
                        if languages and lang_code not in languages:
                            continue

                        subtitle = Subtitle(
                            id=f"subdl_{sub.get('sd_id', '')}",
                            language=lang_code,
                            language_name=self._get_language_name(lang_code),
                            release_name=sub.get("release_name", "")[:100],
                            download_url=sub.get("url", ""),
                            upload_date=sub.get("upload_date", ""),
                            ratings=float(sub.get("rating", 0) or 0),
                            download_count=int(sub.get("download_count", 0) or 0),
                            hearing_impaired=sub.get("hi", False),
                            ai_translated=False,
                            source="subdl"
                        )
                        subtitles.append(subtitle)
                    except Exception as e:
                        logger.debug(f"Error parsejant subtítol subdl: {e}")
                        continue

        except httpx.RequestError as e:
            logger.error(f"Error connectant amb Subdl: {e}")
        except Exception as e:
            logger.error(f"Error buscant a Subdl: {e}")

        return subtitles

    def _subdl_lang_to_code(self, lang_name: str) -> str:
        """Converteix nom d'idioma subdl a codi ISO"""
        mapping = {
            "catalan": "ca",
            "spanish": "es",
            "english": "en",
            "french": "fr",
            "german": "de",
            "italian": "it",
            "portuguese": "pt",
            "japanese": "ja",
            "korean": "ko",
            "chinese": "zh",
            "russian": "ru",
            "arabic": "ar"
        }
        return mapping.get(lang_name.lower(), lang_name[:2].lower())

    async def download_subtitle(self, subtitle_id: str) -> Optional[str]:
        """
        Descarrega un subtítol i retorna el contingut en format VTT

        Args:
            subtitle_id: ID del subtítol (format: source_id)

        Returns:
            Contingut del subtítol en format VTT o None si hi ha error
        """
        # Comprovar cache
        if subtitle_id in self._download_cache:
            return self._download_cache[subtitle_id]

        try:
            # Parsejar source i id
            if subtitle_id.startswith("subdl_"):
                content = await self._download_subdl(subtitle_id[6:])
            else:
                logger.error(f"Font de subtítol desconeguda: {subtitle_id}")
                return None

            if content:
                # Convertir a VTT si és necessari
                if self._is_srt(content):
                    content = self._srt_to_vtt(content)

                # Guardar a cache
                self._download_cache[subtitle_id] = content

            return content

        except Exception as e:
            logger.error(f"Error descarregant subtítol: {e}")
            return None

    async def _download_subdl(self, sd_id: str) -> Optional[str]:
        """Descarrega subtítol de subdl.com"""
        try:
            download_url = f"https://dl.subdl.com/subtitle/{sd_id}"

            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(
                    download_url,
                    headers={"User-Agent": self.user_agent}
                )

                if response.status_code != 200:
                    logger.error(f"Error descarregant de Subdl: {response.status_code}")
                    return None

                content_type = response.headers.get("content-type", "")

                # Si és un ZIP, extreure el primer arxiu .srt/.vtt
                if "zip" in content_type or response.content[:4] == b'PK\x03\x04':
                    return self._extract_subtitle_from_zip(response.content)

                # Si no és ZIP, assumir que és text
                return response.text

        except Exception as e:
            logger.error(f"Error descarregant de Subdl: {e}")
            return None

    def _extract_subtitle_from_zip(self, zip_content: bytes) -> Optional[str]:
        """Extreu el primer subtítol d'un arxiu ZIP"""
        try:
            with zipfile.ZipFile(io.BytesIO(zip_content)) as zf:
                # Buscar arxius de subtítols
                subtitle_files = [
                    f for f in zf.namelist()
                    if f.lower().endswith(('.srt', '.vtt', '.sub', '.ass'))
                ]

                if not subtitle_files:
                    logger.warning("No s'han trobat subtítols al ZIP")
                    return None

                # Preferir .srt, després .vtt
                for ext in ['.srt', '.vtt', '.ass', '.sub']:
                    for f in subtitle_files:
                        if f.lower().endswith(ext):
                            content = zf.read(f)
                            # Intentar decodificar amb diferents encodings
                            for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                                try:
                                    return content.decode(encoding)
                                except UnicodeDecodeError:
                                    continue
                            # Fallback amb errors='replace'
                            return content.decode('utf-8', errors='replace')

        except Exception as e:
            logger.error(f"Error extraient subtítol del ZIP: {e}")

        return None

    def _is_srt(self, content: str) -> bool:
        """Comprova si el contingut és format SRT"""
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

            # Saltar números de seqüència
            if line.isdigit():
                i += 1
                continue

            # Processar línia de temps
            if '-->' in line:
                # Convertir format de temps (comes a punts)
                line = line.replace(',', '.')
                vtt_content += line + '\n'
                i += 1

                # Afegir text fins línia buida
                while i < len(lines) and lines[i].strip():
                    vtt_content += lines[i] + '\n'
                    i += 1
                vtt_content += '\n'
            else:
                i += 1

        return vtt_content

    def is_configured(self) -> bool:
        """Sempre configurat (usa API gratuïta)"""
        return True


# Alias per compatibilitat
OpenSubtitlesClient = SubtitleClient
