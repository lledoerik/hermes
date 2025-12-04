"""
OpenSubtitles API Client
Busca i descarrega subtítols des d'OpenSubtitles.com
"""

import httpx
import logging
import os
import re
import tempfile
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
            "ai_translated": self.ai_translated
        }


class OpenSubtitlesClient:
    """
    Client per buscar subtítols via OpenSubtitles API
    Utilitza l'API REST de opensubtitles.com
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENSUBTITLES_API_KEY", "")
        self.base_url = "https://api.opensubtitles.com/api/v1"
        self.user_agent = "Hermes v1.0"
        self.token = None

    def _get_headers(self) -> Dict[str, str]:
        """Retorna els headers per les peticions"""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": self.user_agent,
            "Accept": "application/json"
        }
        if self.api_key:
            headers["Api-Key"] = self.api_key
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

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
        Cerca subtítols a OpenSubtitles

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
        if not self.api_key:
            logger.warning("OpenSubtitles API key no configurada")
            return []

        # Construir paràmetres de cerca
        params = {}

        if imdb_id:
            # Netejar l'IMDB ID (treure 'tt' si és necessari)
            clean_imdb = imdb_id.replace("tt", "")
            params["imdb_id"] = clean_imdb
        elif tmdb_id:
            params["tmdb_id"] = tmdb_id
        elif query:
            params["query"] = query
        else:
            logger.error("Cal proporcionar imdb_id, tmdb_id o query")
            return []

        if season is not None:
            params["season_number"] = season
        if episode is not None:
            params["episode_number"] = episode

        # Idiomes per defecte: català, espanyol, anglès
        if languages:
            params["languages"] = ",".join(languages)
        else:
            params["languages"] = "ca,es,en"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.base_url}/subtitles",
                    params=params,
                    headers=self._get_headers()
                )

                if response.status_code == 401:
                    logger.error("OpenSubtitles: API key invàlida")
                    return []

                if response.status_code != 200:
                    logger.warning(f"OpenSubtitles retorna {response.status_code}")
                    return []

                data = response.json()
                subtitles_data = data.get("data", [])

                subtitles = []
                for sub_data in subtitles_data:
                    try:
                        attributes = sub_data.get("attributes", {})
                        files = attributes.get("files", [])

                        if not files:
                            continue

                        # Agafar el primer fitxer
                        file_info = files[0]

                        subtitle = Subtitle(
                            id=str(file_info.get("file_id", "")),
                            language=attributes.get("language", ""),
                            language_name=self._get_language_name(attributes.get("language", "")),
                            release_name=attributes.get("release", "")[:100],
                            download_url="",  # Es generarà després
                            upload_date=attributes.get("upload_date", ""),
                            ratings=float(attributes.get("ratings", 0)),
                            download_count=int(attributes.get("download_count", 0)),
                            hearing_impaired=attributes.get("hearing_impaired", False),
                            ai_translated=attributes.get("ai_translated", False)
                        )
                        subtitles.append(subtitle)
                    except Exception as e:
                        logger.debug(f"Error parsejant subtítol: {e}")
                        continue

                # Ordenar per popularitat (download_count) i rating
                subtitles.sort(key=lambda s: (-s.download_count, -s.ratings))

                logger.info(f"Trobats {len(subtitles)} subtítols")
                return subtitles

        except httpx.RequestError as e:
            logger.error(f"Error connectant amb OpenSubtitles: {e}")
            return []
        except Exception as e:
            logger.error(f"Error buscant subtítols: {e}")
            return []

    async def download_subtitle(self, file_id: str) -> Optional[str]:
        """
        Descarrega un subtítol i retorna el contingut en format VTT

        Args:
            file_id: ID del fitxer de subtítol

        Returns:
            Contingut del subtítol en format VTT o None si hi ha error
        """
        if not self.api_key:
            logger.warning("OpenSubtitles API key no configurada")
            return None

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Primer, obtenir l'URL de descàrrega
                response = await client.post(
                    f"{self.base_url}/download",
                    json={"file_id": int(file_id)},
                    headers=self._get_headers()
                )

                if response.status_code != 200:
                    logger.error(f"Error obtenint URL de descàrrega: {response.status_code}")
                    return None

                data = response.json()
                download_link = data.get("link")

                if not download_link:
                    logger.error("No s'ha obtingut l'URL de descàrrega")
                    return None

                # Descarregar el subtítol
                sub_response = await client.get(download_link)
                if sub_response.status_code != 200:
                    logger.error(f"Error descarregant subtítol: {sub_response.status_code}")
                    return None

                content = sub_response.text

                # Convertir a VTT si és SRT
                if self._is_srt(content):
                    content = self._srt_to_vtt(content)

                return content

        except Exception as e:
            logger.error(f"Error descarregant subtítol: {e}")
            return None

    def _is_srt(self, content: str) -> bool:
        """Comprova si el contingut és format SRT"""
        # SRT comença amb un número, VTT comença amb "WEBVTT"
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

        # Reemplaçar comes per punts en els temps
        # SRT: 00:00:01,234 --> 00:00:02,345
        # VTT: 00:00:01.234 --> 00:00:02.345
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
                # Convertir format de temps
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
            "sv": "Suec",
            "no": "Noruec",
            "da": "Danès",
            "fi": "Finès"
        }
        return names.get(code, code.upper())

    def is_configured(self) -> bool:
        """Comprova si l'API està configurada"""
        return bool(self.api_key)
