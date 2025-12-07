"""
Fanart.tv API integration for high-quality artwork.
Provides logos, clearart, banners, and fallback posters/backdrops.
API: https://fanart.tv/api-docs/
"""

import asyncio
import json
import logging
from typing import Optional, Dict, Any, List
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)


class FanartTVClient:
    """Client per a l'API de Fanart.tv"""

    API_URL = "https://webservice.fanart.tv/v3"

    # API key personal (gratuït amb registre)
    # Els usuaris poden obtenir la seva a https://fanart.tv/get-an-api-key/
    DEFAULT_API_KEY = "fa7c5c7ce5f75d3c248b7e20a5326c04"  # Project key

    def __init__(self, api_key: str = None):
        self.api_key = api_key or self.DEFAULT_API_KEY

    def _sync_request(self, endpoint: str) -> Optional[Dict]:
        """Fa una petició síncrona a Fanart.tv"""
        try:
            url = f"{self.API_URL}{endpoint}?api_key={self.api_key}"
            req = Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "Hermes Media Server/1.0"
                }
            )

            with urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode('utf-8'))

        except HTTPError as e:
            if e.code == 404:
                logger.debug(f"Fanart.tv: No trobat - {endpoint}")
            else:
                logger.warning(f"Fanart.tv HTTP error: {e.code}")
            return None
        except (URLError, json.JSONDecodeError) as e:
            logger.warning(f"Fanart.tv request error: {e}")
            return None

    async def _request(self, endpoint: str) -> Optional[Dict]:
        """Fa una petició asíncrona a Fanart.tv"""
        return await asyncio.to_thread(self._sync_request, endpoint)

    async def get_tv_images(self, tvdb_id: int) -> Optional[Dict[str, Any]]:
        """
        Obté imatges d'una sèrie de TV per TVDB ID.

        Returns:
            Dict amb claus: hdtvlogo, tvposter, tvbanner, showbackground,
                           clearart, characterart, tvthumb, seasonposter, etc.
        """
        data = await self._request(f"/tv/{tvdb_id}")
        if not data:
            return None

        return self._format_tv_images(data)

    async def get_movie_images(self, tmdb_id: int) -> Optional[Dict[str, Any]]:
        """
        Obté imatges d'una pel·lícula per TMDB ID.

        Returns:
            Dict amb claus: hdmovielogo, movieposter, moviebackground,
                           hdmovieclearart, moviedisc, moviethumb, etc.
        """
        data = await self._request(f"/movies/{tmdb_id}")
        if not data:
            return None

        return self._format_movie_images(data)

    async def get_tv_images_by_imdb(self, imdb_id: str) -> Optional[Dict[str, Any]]:
        """Obté imatges d'una sèrie per IMDB ID (fallback)"""
        # Fanart.tv no suporta directament IMDB, caldria convertir
        return None

    def _format_tv_images(self, data: Dict) -> Dict[str, Any]:
        """Formata les imatges de TV al nostre format"""
        result = {
            "tvdb_id": data.get("thetvdb_id"),
            "name": data.get("name"),
            "logos": [],
            "posters": [],
            "backgrounds": [],
            "banners": [],
            "clearart": [],
            "thumbs": [],
            "season_posters": {},
            "season_banners": {},
            "characterart": []
        }

        # Logos HD (transparents, ideals per UI)
        for img in data.get("hdtvlogo", []):
            result["logos"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Logos normals com fallback
        for img in data.get("clearlogo", []):
            result["logos"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Pòsters
        for img in data.get("tvposter", []):
            result["posters"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Backgrounds/Fanart
        for img in data.get("showbackground", []):
            result["backgrounds"].append({
                "url": img.get("url"),
                "lang": img.get("lang", ""),
                "likes": int(img.get("likes", 0)),
                "season": img.get("season")
            })

        # Banners
        for img in data.get("tvbanner", []):
            result["banners"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Clear art
        for img in data.get("hdclearart", []) + data.get("clearart", []):
            result["clearart"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Thumbs (16:9)
        for img in data.get("tvthumb", []):
            result["thumbs"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Season posters
        for img in data.get("seasonposter", []):
            season = img.get("season", "all")
            if season not in result["season_posters"]:
                result["season_posters"][season] = []
            result["season_posters"][season].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Season banners
        for img in data.get("seasonbanner", []):
            season = img.get("season", "all")
            if season not in result["season_banners"]:
                result["season_banners"][season] = []
            result["season_banners"][season].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Character art
        for img in data.get("characterart", []):
            result["characterart"].append({
                "url": img.get("url"),
                "likes": int(img.get("likes", 0))
            })

        # Ordenar per likes (millor qualitat primer)
        for key in ["logos", "posters", "backgrounds", "banners", "clearart", "thumbs"]:
            result[key].sort(key=lambda x: x["likes"], reverse=True)

        return result

    def _format_movie_images(self, data: Dict) -> Dict[str, Any]:
        """Formata les imatges de pel·lícula al nostre format"""
        result = {
            "tmdb_id": data.get("tmdb_id"),
            "imdb_id": data.get("imdb_id"),
            "name": data.get("name"),
            "logos": [],
            "posters": [],
            "backgrounds": [],
            "banners": [],
            "clearart": [],
            "thumbs": [],
            "disc": []
        }

        # Logos HD
        for img in data.get("hdmovielogo", []):
            result["logos"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        for img in data.get("movielogo", []):
            result["logos"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Pòsters
        for img in data.get("movieposter", []):
            result["posters"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Backgrounds
        for img in data.get("moviebackground", []):
            result["backgrounds"].append({
                "url": img.get("url"),
                "lang": img.get("lang", ""),
                "likes": int(img.get("likes", 0))
            })

        # Banners
        for img in data.get("moviebanner", []):
            result["banners"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Clear art HD
        for img in data.get("hdmovieclearart", []) + data.get("movieclearart", []):
            result["clearart"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Thumbs
        for img in data.get("moviethumb", []):
            result["thumbs"].append({
                "url": img.get("url"),
                "lang": img.get("lang"),
                "likes": int(img.get("likes", 0))
            })

        # Disc art
        for img in data.get("moviedisc", []):
            result["disc"].append({
                "url": img.get("url"),
                "disc_type": img.get("disc_type"),
                "likes": int(img.get("likes", 0))
            })

        # Ordenar per likes
        for key in ["logos", "posters", "backgrounds", "banners", "clearart", "thumbs"]:
            result[key].sort(key=lambda x: x["likes"], reverse=True)

        return result

    def get_best_image(self, images: List[Dict], preferred_lang: str = "ca") -> Optional[str]:
        """
        Obté la millor imatge segons idioma i likes.

        Args:
            images: Llista d'imatges amb url, lang, likes
            preferred_lang: Idioma preferit (default: català)

        Returns:
            URL de la millor imatge o None
        """
        if not images:
            return None

        # Prioritat: català > espanyol > anglès > sense idioma > altres
        lang_priority = {preferred_lang: 0, "es": 1, "en": 2, "": 3, "00": 3}

        def sort_key(img):
            lang = img.get("lang", "")
            priority = lang_priority.get(lang, 4)
            likes = img.get("likes", 0)
            return (priority, -likes)

        sorted_images = sorted(images, key=sort_key)
        return sorted_images[0]["url"] if sorted_images else None


# Funcions d'utilitat per ús directe

async def get_tv_artwork(tvdb_id: int) -> Optional[Dict[str, Any]]:
    """Obté artwork d'una sèrie de TV"""
    client = FanartTVClient()
    return await client.get_tv_images(tvdb_id)


async def get_movie_artwork(tmdb_id: int) -> Optional[Dict[str, Any]]:
    """Obté artwork d'una pel·lícula"""
    client = FanartTVClient()
    return await client.get_movie_images(tmdb_id)


async def get_fallback_poster(tmdb_id: int = None, tvdb_id: int = None,
                              is_movie: bool = False) -> Optional[str]:
    """
    Obté un pòster de fallback quan TMDB no en té.

    Args:
        tmdb_id: ID de TMDB (per pel·lícules)
        tvdb_id: ID de TVDB (per sèries)
        is_movie: Si és una pel·lícula

    Returns:
        URL del pòster o None
    """
    client = FanartTVClient()

    if is_movie and tmdb_id:
        images = await client.get_movie_images(tmdb_id)
        if images and images.get("posters"):
            return client.get_best_image(images["posters"])
    elif tvdb_id:
        images = await client.get_tv_images(tvdb_id)
        if images and images.get("posters"):
            return client.get_best_image(images["posters"])

    return None


async def get_fallback_background(tmdb_id: int = None, tvdb_id: int = None,
                                  is_movie: bool = False) -> Optional[str]:
    """
    Obté un background de fallback quan TMDB no en té.
    """
    client = FanartTVClient()

    if is_movie and tmdb_id:
        images = await client.get_movie_images(tmdb_id)
        if images and images.get("backgrounds"):
            return client.get_best_image(images["backgrounds"])
    elif tvdb_id:
        images = await client.get_tv_images(tvdb_id)
        if images and images.get("backgrounds"):
            return client.get_best_image(images["backgrounds"])

    return None


async def get_logo(tmdb_id: int = None, tvdb_id: int = None,
                   is_movie: bool = False) -> Optional[str]:
    """
    Obté el logo d'una sèrie o pel·lícula.
    Útil per mostrar a sobre de backdrops.
    """
    client = FanartTVClient()

    if is_movie and tmdb_id:
        images = await client.get_movie_images(tmdb_id)
        if images and images.get("logos"):
            return client.get_best_image(images["logos"])
    elif tvdb_id:
        images = await client.get_tv_images(tvdb_id)
        if images and images.get("logos"):
            return client.get_best_image(images["logos"])

    return None
