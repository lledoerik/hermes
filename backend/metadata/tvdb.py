"""
TheTVDB API v4 integration for TV series metadata.
Provides detailed episode information for Western TV shows.
API: https://thetvdb.github.io/v4-api/
"""

import asyncio
import json
import logging
import time
from typing import Optional, Dict, Any, List
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)


class TVDBClient:
    """Client per a l'API v4 de TheTVDB"""

    API_URL = "https://api4.thetvdb.com/v4"

    # Token d'autenticació (cal registrar-se a thetvdb.com)
    # Els usuaris poden obtenir la seva API key a https://thetvdb.com/api-information
    DEFAULT_API_KEY = "f28f7abd-01a1-4ac1-a5e9-06f2c1ff1cce"  # Project key

    # Cache del token JWT
    _token = None
    _token_expires = 0

    def __init__(self, api_key: str = None):
        self.api_key = api_key or self.DEFAULT_API_KEY

    def _get_token(self) -> Optional[str]:
        """Obté o renova el token JWT"""
        now = time.time()

        # Si el token encara és vàlid, retornar-lo
        if TVDBClient._token and TVDBClient._token_expires > now:
            return TVDBClient._token

        try:
            # Login per obtenir token
            login_data = json.dumps({"apikey": self.api_key}).encode('utf-8')
            req = Request(
                f"{self.API_URL}/login",
                data=login_data,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            )

            with urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode('utf-8'))

            if result.get("status") == "success" and result.get("data", {}).get("token"):
                TVDBClient._token = result["data"]["token"]
                # El token dura 30 dies, però renovem cada 24h per seguretat
                TVDBClient._token_expires = now + (24 * 60 * 60)
                logger.debug("TVDB token obtained successfully")
                return TVDBClient._token

        except (URLError, HTTPError, json.JSONDecodeError) as e:
            logger.error(f"TVDB login error: {e}")

        return None

    def _sync_request(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Fa una petició síncrona autenticada a TVDB"""
        token = self._get_token()
        if not token:
            return None

        try:
            url = f"{self.API_URL}{endpoint}"
            if params:
                query = "&".join(f"{k}={v}" for k, v in params.items())
                url = f"{url}?{query}"

            req = Request(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    "User-Agent": "Hermes Media Server/1.0"
                }
            )

            with urlopen(req, timeout=15) as response:
                result = json.loads(response.read().decode('utf-8'))

            if result.get("status") == "success":
                return result.get("data")

            return None

        except HTTPError as e:
            if e.code == 404:
                logger.debug(f"TVDB: No trobat - {endpoint}")
            elif e.code == 401:
                # Token expirat, intentar renovar
                TVDBClient._token = None
                TVDBClient._token_expires = 0
                logger.warning("TVDB token expired, will retry")
            else:
                logger.warning(f"TVDB HTTP error: {e.code}")
            return None
        except (URLError, json.JSONDecodeError) as e:
            logger.warning(f"TVDB request error: {e}")
            return None

    async def _request(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Fa una petició asíncrona a TVDB"""
        return await asyncio.to_thread(self._sync_request, endpoint, params)

    async def search_series(self, query: str, year: int = None,
                           language: str = "cat") -> List[Dict[str, Any]]:
        """
        Cerca sèries per títol.

        Args:
            query: Títol a cercar
            year: Any d'emissió (opcional)
            language: Idioma preferit (cat, spa, eng)

        Returns:
            Llista de resultats
        """
        params = {"query": query, "type": "series"}
        if year:
            params["year"] = str(year)

        data = await self._request("/search", params)
        if not data:
            return []

        results = []
        for item in data:
            results.append({
                "tvdb_id": item.get("tvdb_id") or item.get("id"),
                "name": item.get("name") or item.get("translations", {}).get("eng"),
                "name_translated": item.get("translations", {}).get(language[:3]),
                "overview": item.get("overview") or item.get("overviews", {}).get("eng"),
                "overview_translated": item.get("overviews", {}).get(language[:3]),
                "year": item.get("year"),
                "network": item.get("network"),
                "status": item.get("status"),
                "image_url": item.get("image_url") or item.get("thumbnail"),
                "primary_language": item.get("primary_language"),
                "type": item.get("type")
            })

        return results

    async def get_series(self, tvdb_id: int) -> Optional[Dict[str, Any]]:
        """
        Obté informació detallada d'una sèrie.

        Args:
            tvdb_id: ID de TVDB

        Returns:
            Dict amb informació de la sèrie
        """
        data = await self._request(f"/series/{tvdb_id}/extended")
        if not data:
            return None

        return self._format_series(data)

    async def get_series_episodes(self, tvdb_id: int, season: int = None,
                                  language: str = "cat") -> List[Dict[str, Any]]:
        """
        Obté episodis d'una sèrie.

        Args:
            tvdb_id: ID de TVDB
            season: Número de temporada (opcional, tots si None)
            language: Idioma per traduccions

        Returns:
            Llista d'episodis
        """
        # Primer obtenir episodis amb info bàsica
        params = {"page": "0"}
        if season is not None:
            params["season"] = str(season)

        all_episodes = []
        page = 0

        while True:
            params["page"] = str(page)
            data = await self._request(f"/series/{tvdb_id}/episodes/default", params)

            if not data or not data.get("episodes"):
                break

            for ep in data.get("episodes", []):
                all_episodes.append(self._format_episode(ep, language))

            # Comprovar si hi ha més pàgines
            if len(data.get("episodes", [])) < 500:  # Pàgina incompleta = última
                break
            page += 1

        return all_episodes

    async def get_episode_details(self, episode_id: int) -> Optional[Dict[str, Any]]:
        """Obté detalls complets d'un episodi"""
        data = await self._request(f"/episodes/{episode_id}/extended")
        if not data:
            return None

        return self._format_episode(data)

    async def get_season(self, season_id: int) -> Optional[Dict[str, Any]]:
        """Obté informació d'una temporada"""
        data = await self._request(f"/seasons/{season_id}/extended")
        if not data:
            return None

        return {
            "id": data.get("id"),
            "number": data.get("number"),
            "name": data.get("name"),
            "overview": data.get("overview"),
            "image": data.get("image"),
            "year": data.get("year"),
            "episodes": [
                self._format_episode(ep) for ep in data.get("episodes", [])
            ]
        }

    async def get_series_translations(self, tvdb_id: int,
                                      language: str = "cat") -> Optional[Dict[str, str]]:
        """
        Obté traduccions d'una sèrie.

        Args:
            tvdb_id: ID de TVDB
            language: Codi d'idioma (cat, spa, eng, etc.)

        Returns:
            Dict amb name i overview traduïts
        """
        data = await self._request(f"/series/{tvdb_id}/translations/{language}")
        if not data:
            return None

        return {
            "name": data.get("name"),
            "overview": data.get("overview"),
            "language": data.get("language")
        }

    async def get_episode_translations(self, episode_id: int,
                                       language: str = "cat") -> Optional[Dict[str, str]]:
        """Obté traduccions d'un episodi"""
        data = await self._request(f"/episodes/{episode_id}/translations/{language}")
        if not data:
            return None

        return {
            "name": data.get("name"),
            "overview": data.get("overview"),
            "language": data.get("language")
        }

    async def get_artwork(self, tvdb_id: int, type_id: int = None) -> List[Dict[str, Any]]:
        """
        Obté artwork d'una sèrie.

        Args:
            tvdb_id: ID de TVDB
            type_id: Tipus d'artwork (1=banner, 2=poster, 3=background, etc.)

        Returns:
            Llista d'imatges
        """
        data = await self._request(f"/series/{tvdb_id}/artworks")
        if not data:
            return []

        artworks = []
        for art in data.get("artworks", data if isinstance(data, list) else []):
            if type_id and art.get("type") != type_id:
                continue

            artworks.append({
                "id": art.get("id"),
                "type": art.get("type"),
                "url": art.get("image"),
                "thumbnail": art.get("thumbnail"),
                "language": art.get("language"),
                "score": art.get("score", 0),
                "width": art.get("width"),
                "height": art.get("height")
            })

        # Ordenar per puntuació
        artworks.sort(key=lambda x: x.get("score", 0), reverse=True)
        return artworks

    def _format_series(self, data: Dict) -> Dict[str, Any]:
        """Formata la informació d'una sèrie"""
        translations = data.get("translations", {})
        name_translations = translations.get("nameTranslations", [])
        overview_translations = translations.get("overviewTranslations", [])

        # Buscar traducció catalana o espanyola
        name_cat = next((t["name"] for t in name_translations
                        if t.get("language") == "cat"), None)
        name_spa = next((t["name"] for t in name_translations
                        if t.get("language") == "spa"), None)
        overview_cat = next((t["overview"] for t in overview_translations
                            if t.get("language") == "cat"), None)
        overview_spa = next((t["overview"] for t in overview_translations
                            if t.get("language") == "spa"), None)

        return {
            "tvdb_id": data.get("id"),
            "name": data.get("name"),
            "name_cat": name_cat,
            "name_spa": name_spa,
            "slug": data.get("slug"),
            "overview": data.get("overview"),
            "overview_cat": overview_cat,
            "overview_spa": overview_spa,
            "image": data.get("image"),
            "first_aired": data.get("firstAired"),
            "last_aired": data.get("lastAired"),
            "next_aired": data.get("nextAired"),
            "status": data.get("status", {}).get("name") if isinstance(data.get("status"), dict) else data.get("status"),
            "original_network": data.get("originalNetwork", {}).get("name") if isinstance(data.get("originalNetwork"), dict) else None,
            "genres": [g.get("name") for g in data.get("genres", [])],
            "original_language": data.get("originalLanguage"),
            "default_season_type": data.get("defaultSeasonType"),
            "year": data.get("year"),
            "average_runtime": data.get("averageRuntime"),
            "seasons": [
                {
                    "id": s.get("id"),
                    "number": s.get("number"),
                    "name": s.get("name"),
                    "type": s.get("type", {}).get("name") if isinstance(s.get("type"), dict) else s.get("type"),
                    "image": s.get("image")
                }
                for s in data.get("seasons", [])
            ],
            "remote_ids": {
                r.get("sourceName"): r.get("id")
                for r in data.get("remoteIds", [])
            }
        }

    def _format_episode(self, data: Dict, language: str = "cat") -> Dict[str, Any]:
        """Formata la informació d'un episodi"""
        # Buscar traduccions
        translations = data.get("translations", {})
        name_translations = translations.get("nameTranslations", []) if isinstance(translations, dict) else []

        name_translated = None
        overview_translated = None

        for t in name_translations:
            if t.get("language") == language:
                name_translated = t.get("name")
                break

        overview_translations = translations.get("overviewTranslations", []) if isinstance(translations, dict) else []
        for t in overview_translations:
            if t.get("language") == language:
                overview_translated = t.get("overview")
                break

        return {
            "id": data.get("id"),
            "series_id": data.get("seriesId"),
            "name": data.get("name"),
            "name_translated": name_translated,
            "overview": data.get("overview"),
            "overview_translated": overview_translated,
            "season_number": data.get("seasonNumber"),
            "episode_number": data.get("number"),
            "absolute_number": data.get("absoluteNumber"),
            "runtime": data.get("runtime"),
            "image": data.get("image"),
            "aired": data.get("aired"),
            "year": data.get("year"),
            "is_movie": data.get("isMovie", False),
            "finale_type": data.get("finaleType")
        }


# Funcions d'utilitat per ús directe

async def search_tv_series(query: str, year: int = None) -> List[Dict[str, Any]]:
    """Cerca ràpida de sèries"""
    client = TVDBClient()
    return await client.search_series(query, year)


async def get_tv_episodes(tvdb_id: int, season: int = None) -> List[Dict[str, Any]]:
    """Obté episodis d'una sèrie"""
    client = TVDBClient()
    return await client.get_series_episodes(tvdb_id, season)


async def get_tv_series_details(tvdb_id: int) -> Optional[Dict[str, Any]]:
    """Obté detalls complets d'una sèrie"""
    client = TVDBClient()
    return await client.get_series(tvdb_id)


async def convert_tmdb_to_tvdb(tmdb_id: int) -> Optional[int]:
    """
    Converteix un ID de TMDB a TVDB.
    Útil per usar Fanart.tv que requereix TVDB IDs per sèries.
    """
    # Això normalment es fa via TMDB external_ids
    # O cercant a TVDB pels remote_ids
    # Per ara, retornar None i implementar quan calgui
    return None
