"""
Servei centralitzat de metadata amb cache intel·ligent.

Arquitectura "Lazy Loading":
- Fetch on-demand quan l'usuari accedeix al contingut
- Cache amb TTL (24h per defecte)
- Background refresh quan cache > 12h
- Fallback entre fonts (TMDB → AniList → TVDB → AniDB)
"""

import asyncio
import logging
import time
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ContentType(Enum):
    MOVIE = "movie"
    SERIES = "series"
    ANIME = "anime"


class MetadataSource(Enum):
    TMDB = "tmdb"
    ANILIST = "anilist"
    TVDB = "tvdb"
    ANIDB = "anidb"
    FANART = "fanart"


@dataclass
class CacheEntry:
    """Entrada de cache amb TTL i metadata."""
    data: Any
    timestamp: float
    source: MetadataSource
    ttl: int = 86400  # 24h per defecte

    def is_valid(self) -> bool:
        """Comprova si el cache encara és vàlid."""
        return (time.time() - self.timestamp) < self.ttl

    def is_stale(self) -> bool:
        """Comprova si el cache és vell (>12h) però encara vàlid."""
        age = time.time() - self.timestamp
        return age > (self.ttl / 2) and age < self.ttl

    @property
    def age_hours(self) -> float:
        """Retorna l'edat del cache en hores."""
        return (time.time() - self.timestamp) / 3600


class MetadataCache:
    """Cache intel·ligent amb TTL i estadístiques."""

    def __init__(self, default_ttl: int = 86400):
        self._cache: Dict[str, CacheEntry] = {}
        self._default_ttl = default_ttl
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[CacheEntry]:
        """Obtenir entrada del cache."""
        entry = self._cache.get(key)
        if entry and entry.is_valid():
            self._hits += 1
            return entry
        elif entry:
            # Cache expirat, eliminar
            del self._cache[key]
        self._misses += 1
        return None

    def set(self, key: str, data: Any, source: MetadataSource, ttl: int = None):
        """Guardar al cache."""
        self._cache[key] = CacheEntry(
            data=data,
            timestamp=time.time(),
            source=source,
            ttl=ttl or self._default_ttl
        )

    def invalidate(self, key: str):
        """Invalidar una entrada."""
        if key in self._cache:
            del self._cache[key]

    def invalidate_pattern(self, pattern: str):
        """Invalidar totes les entrades que coincideixin amb el patró."""
        keys_to_delete = [k for k in self._cache.keys() if pattern in k]
        for key in keys_to_delete:
            del self._cache[key]

    def clear(self):
        """Netejar tot el cache."""
        self._cache.clear()
        self._hits = 0
        self._misses = 0

    @property
    def stats(self) -> Dict[str, Any]:
        """Estadístiques del cache."""
        total = self._hits + self._misses
        return {
            "entries": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": (self._hits / total * 100) if total > 0 else 0,
            "size_mb": sum(len(str(e.data)) for e in self._cache.values()) / 1024 / 1024
        }


# Cache global per metadata
metadata_cache = MetadataCache(default_ttl=86400)  # 24h


class MetadataService:
    """
    Servei centralitzat per obtenir metadata de múltiples fonts.

    Prioritat per anime: AniList → TMDB → TVDB
    Prioritat per sèries: TMDB → TVDB
    Prioritat per películes: TMDB
    Artwork fallback: Fanart.tv
    """

    def __init__(self):
        self._background_tasks = set()

    async def get_series_metadata(
        self,
        tmdb_id: int = None,
        anilist_id: int = None,
        content_type: ContentType = None,
        prefer_catalan: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Obté metadata d'una sèrie amb cache intel·ligent.

        Args:
            tmdb_id: ID de TMDB
            anilist_id: ID d'AniList (per anime)
            content_type: Tipus de contingut (auto-detectat si no s'especifica)
            prefer_catalan: Intentar obtenir dades en català

        Returns:
            Dict amb metadata completa
        """
        # Generar clau de cache
        cache_key = f"series:{tmdb_id or ''}:{anilist_id or ''}"

        # Comprovar cache
        cached = metadata_cache.get(cache_key)
        if cached:
            # Si el cache és vell, refrescar en background
            if cached.is_stale():
                self._schedule_background_refresh(cache_key, tmdb_id, anilist_id, content_type)
            return cached.data

        # Fetch fresh data
        data = await self._fetch_series_metadata(tmdb_id, anilist_id, content_type, prefer_catalan)

        if data:
            metadata_cache.set(cache_key, data, data.get("_source", MetadataSource.TMDB))

        return data

    async def _fetch_series_metadata(
        self,
        tmdb_id: int,
        anilist_id: int,
        content_type: ContentType,
        prefer_catalan: bool
    ) -> Optional[Dict[str, Any]]:
        """Fetch real de metadata des de les APIs."""
        from backend.metadata.tmdb import TMDBClient, LANGUAGE_FALLBACK
        from backend.metadata.anilist import AniListClient

        result = {}
        source = MetadataSource.TMDB

        # === PASO 1: Detectar si és anime ===
        # Primer fem una petició ràpida a TMDB per detectar si és anime
        is_anime = content_type == ContentType.ANIME or anilist_id is not None
        tmdb_data = None

        if not is_anime and tmdb_id:
            from config import settings
            tmdb_client = TMDBClient(settings.TMDB_API_KEY)
            try:
                # Petició ràpida per detectar gènere i origen
                tmdb_data = await tmdb_client.get_tv_details(tmdb_id)
                if tmdb_data and self._is_anime(tmdb_data):
                    is_anime = True
                    logger.info(f"Auto-detectat anime: {tmdb_data.get('name')} (TMDB: {tmdb_id})")
            finally:
                await tmdb_client.close()

        # === PASO 2: Per anime, buscar a AniList ===
        if is_anime and (anilist_id or tmdb_id):
            anilist_client = AniListClient()

            # Si no tenim anilist_id, buscar per títol
            if not anilist_id:
                # Usar dades de TMDB si ja les tenim, sinó obtenir-les
                if not tmdb_data and tmdb_id:
                    from config import settings
                    tmdb_client = TMDBClient(settings.TMDB_API_KEY)
                    try:
                        tmdb_data = await tmdb_client.get_tv_details(tmdb_id)
                    finally:
                        await tmdb_client.close()

                if tmdb_data:
                    # Buscar a AniList pel títol original (japonès) o anglès
                    search_titles = [
                        tmdb_data.get("original_name"),
                        tmdb_data.get("name")
                    ]

                    for search_title in search_titles:
                        if search_title:
                            search_result = await anilist_client.search_anime(
                                search_title,
                                year=tmdb_data.get("first_air_date", "")[:4] if tmdb_data.get("first_air_date") else None,
                                is_adult=False
                            )
                            if search_result:
                                anilist_id = search_result["anilist_id"]
                                logger.info(f"Trobat a AniList: {search_result.get('title')} (ID: {anilist_id})")
                                break

            # Obtenir dades completes d'AniList
            if anilist_id:
                anilist_data = await anilist_client.get_anime_details(anilist_id)
                if anilist_data:
                    result = {
                        "id": tmdb_id,
                        "anilist_id": anilist_id,
                        "mal_id": anilist_data.get("mal_id"),
                        "title": anilist_data.get("title_english") or anilist_data.get("title_romaji"),
                        "title_original": anilist_data.get("title_native"),
                        "title_romaji": anilist_data.get("title_romaji"),
                        "overview": anilist_data.get("description"),
                        "poster_path": anilist_data.get("cover_image"),
                        "backdrop_path": anilist_data.get("banner_image"),
                        "genres": anilist_data.get("genres", []),
                        "rating": anilist_data.get("score"),
                        "year": anilist_data.get("year"),
                        "status": anilist_data.get("status"),
                        "episodes_count": anilist_data.get("episodes"),
                        "studios": anilist_data.get("studios", []),
                        "content_type": "anime",
                        "_source": MetadataSource.ANILIST
                    }
                    source = MetadataSource.ANILIST
                    logger.info(f"Metadata AniList carregada: {result['title']}")

        # === PASO 3: Fallback a TMDB si no tenim dades d'AniList ===
        if not result and tmdb_id:
            from config import settings

            # Reutilitzar tmdb_data si ja el tenim, sinó obtenir amb idioma preferit
            if not tmdb_data or prefer_catalan:
                tmdb_client = TMDBClient(settings.TMDB_API_KEY)
                try:
                    if prefer_catalan:
                        tmdb_data = await tmdb_client.get_tv_details(tmdb_id, language="ca-ES")

                        # Si no hi ha contingut en català, fallback
                        if not tmdb_data or not tmdb_data.get("overview"):
                            for lang in LANGUAGE_FALLBACK[1:]:
                                tmdb_data = await tmdb_client.get_tv_details(tmdb_id, language=lang)
                                if tmdb_data and tmdb_data.get("overview"):
                                    break
                    else:
                        tmdb_data = await tmdb_client.get_tv_details(tmdb_id)
                finally:
                    await tmdb_client.close()

            if tmdb_data:
                result = {
                    "id": tmdb_id,
                    "title": tmdb_data.get("name"),
                    "title_original": tmdb_data.get("original_name"),
                    "overview": tmdb_data.get("overview"),
                    "poster_path": tmdb_data.get("poster_path"),
                    "backdrop_path": tmdb_data.get("backdrop_path"),
                    "genres": [g["name"] for g in tmdb_data.get("genres", [])],
                    "rating": tmdb_data.get("vote_average"),
                    "year": tmdb_data.get("first_air_date", "")[:4] if tmdb_data.get("first_air_date") else None,
                    "status": tmdb_data.get("status"),
                    "episodes_count": tmdb_data.get("number_of_episodes"),
                    "seasons_count": tmdb_data.get("number_of_seasons"),
                    "networks": [n["name"] for n in tmdb_data.get("networks", [])],
                    "content_type": "anime" if self._is_anime(tmdb_data) else "series",
                    "_source": MetadataSource.TMDB
                }

        # === PASO 4: Fallback artwork de Fanart.tv ===
        if result and (not result.get("poster_path") or not result.get("backdrop_path")):
            artwork = await self._get_fallback_artwork(tmdb_id, is_movie=False)
            if artwork:
                if not result.get("poster_path") and artwork.get("poster"):
                    result["poster_path"] = artwork["poster"]
                if not result.get("backdrop_path") and artwork.get("background"):
                    result["backdrop_path"] = artwork["background"]
                if artwork.get("logo"):
                    result["logo_path"] = artwork["logo"]

        return result

    async def get_movie_metadata(
        self,
        tmdb_id: int,
        prefer_catalan: bool = True
    ) -> Optional[Dict[str, Any]]:
        """Obté metadata d'una pel·lícula."""
        cache_key = f"movie:{tmdb_id}"

        cached = metadata_cache.get(cache_key)
        if cached:
            if cached.is_stale():
                self._schedule_background_refresh_movie(cache_key, tmdb_id)
            return cached.data

        data = await self._fetch_movie_metadata(tmdb_id, prefer_catalan)

        if data:
            metadata_cache.set(cache_key, data, MetadataSource.TMDB)

        return data

    async def _fetch_movie_metadata(
        self,
        tmdb_id: int,
        prefer_catalan: bool
    ) -> Optional[Dict[str, Any]]:
        """Fetch real de metadata de pel·lícula."""
        from backend.metadata.tmdb import TMDBClient, LANGUAGE_FALLBACK
        from config import settings

        tmdb_client = TMDBClient(settings.TMDB_API_KEY)
        try:
            if prefer_catalan:
                tmdb_data = await tmdb_client.get_movie_details(tmdb_id, language="ca-ES")
                if not tmdb_data or not tmdb_data.get("overview"):
                    for lang in LANGUAGE_FALLBACK[1:]:
                        tmdb_data = await tmdb_client.get_movie_details(tmdb_id, language=lang)
                        if tmdb_data and tmdb_data.get("overview"):
                            break
            else:
                tmdb_data = await tmdb_client.get_movie_details(tmdb_id)

            if not tmdb_data:
                return None

            result = {
                "id": tmdb_id,
                "title": tmdb_data.get("title"),
                "title_original": tmdb_data.get("original_title"),
                "overview": tmdb_data.get("overview"),
                "poster_path": tmdb_data.get("poster_path"),
                "backdrop_path": tmdb_data.get("backdrop_path"),
                "genres": [g["name"] for g in tmdb_data.get("genres", [])],
                "rating": tmdb_data.get("vote_average"),
                "year": tmdb_data.get("release_date", "")[:4] if tmdb_data.get("release_date") else None,
                "runtime": tmdb_data.get("runtime"),
                "status": tmdb_data.get("status"),
                "budget": tmdb_data.get("budget"),
                "revenue": tmdb_data.get("revenue"),
                "content_type": "movie",
                "_source": MetadataSource.TMDB
            }

            # Fallback artwork
            if not result.get("poster_path") or not result.get("backdrop_path"):
                artwork = await self._get_fallback_artwork(tmdb_id, is_movie=True)
                if artwork:
                    if not result.get("poster_path") and artwork.get("poster"):
                        result["poster_path"] = artwork["poster"]
                    if not result.get("backdrop_path") and artwork.get("background"):
                        result["backdrop_path"] = artwork["background"]
                    if artwork.get("logo"):
                        result["logo_path"] = artwork["logo"]

            return result

        finally:
            await tmdb_client.close()

    async def get_episodes_metadata(
        self,
        tmdb_id: int,
        season_number: int,
        anilist_id: int = None,
        content_type: ContentType = None
    ) -> Optional[Dict[str, Any]]:
        """Obté metadata dels episodis d'una temporada."""
        cache_key = f"episodes:{tmdb_id}:{season_number}:{anilist_id or ''}"

        cached = metadata_cache.get(cache_key)
        if cached:
            if cached.is_stale():
                self._schedule_background_refresh_episodes(cache_key, tmdb_id, season_number, anilist_id)
            return cached.data

        data = await self._fetch_episodes_metadata(tmdb_id, season_number, anilist_id, content_type)

        if data:
            metadata_cache.set(cache_key, data, data.get("_source", MetadataSource.TMDB))

        return data

    async def _fetch_episodes_metadata(
        self,
        tmdb_id: int,
        season_number: int,
        anilist_id: int,
        content_type: ContentType
    ) -> Optional[Dict[str, Any]]:
        """Fetch real de metadata d'episodis."""
        from backend.metadata.tmdb import TMDBClient, LANGUAGE_FALLBACK, translate_batch_to_catalan
        from backend.metadata.anilist import AniListClient
        from config import settings

        is_anime = content_type == ContentType.ANIME or anilist_id is not None
        result = {"episodes": [], "_source": MetadataSource.TMDB}

        # Per anime amb AniList
        if is_anime and anilist_id:
            anilist_client = AniListClient()
            anilist_data = await anilist_client.get_anime_details(anilist_id)

            if anilist_data:
                # AniList no té descripcions d'episodis, però podem obtenir info bàsica
                episodes_count = anilist_data.get("episodes") or 0

                # Obtenir episodis de TMDB per les imatges i descripcions
                tmdb_client = TMDBClient(settings.TMDB_API_KEY)
                try:
                    tmdb_episodes = await tmdb_client.get_tv_season_details(tmdb_id, season_number)

                    if tmdb_episodes and tmdb_episodes.get("episodes"):
                        # Traduir títols i descripcions al català
                        names = [ep.get("name", "") for ep in tmdb_episodes["episodes"]]
                        overviews = [ep.get("overview", "") for ep in tmdb_episodes["episodes"]]
                        translated_names = translate_batch_to_catalan(names)
                        translated_overviews = translate_batch_to_catalan(overviews)

                        for i, ep in enumerate(tmdb_episodes["episodes"]):
                            result["episodes"].append({
                                "episode_number": ep.get("episode_number"),
                                "name": translated_names[i] if i < len(translated_names) else ep.get("name"),
                                "overview": translated_overviews[i] if i < len(translated_overviews) else ep.get("overview"),
                                "still_path": ep.get("still_path"),
                                "air_date": ep.get("air_date"),
                                "runtime": ep.get("runtime"),
                                "vote_average": ep.get("vote_average")
                            })

                        result["_source"] = MetadataSource.ANILIST
                finally:
                    await tmdb_client.close()

        # Fallback a TMDB normal
        if not result["episodes"] and tmdb_id:
            tmdb_client = TMDBClient(settings.TMDB_API_KEY)
            try:
                # Intentar català
                tmdb_data = await tmdb_client.get_tv_season_details(tmdb_id, season_number, language="ca-ES")
                source_lang = "ca"

                # Fallback si no hi ha català
                if not tmdb_data or not tmdb_data.get("episodes"):
                    for lang in LANGUAGE_FALLBACK[1:]:
                        tmdb_data = await tmdb_client.get_tv_season_details(tmdb_id, season_number, language=lang)
                        if tmdb_data and tmdb_data.get("episodes"):
                            source_lang = lang.split("-")[0]
                            break

                if tmdb_data and tmdb_data.get("episodes"):
                    episodes = tmdb_data["episodes"]

                    # Traduir si no és català
                    if source_lang != "ca":
                        overviews = [ep.get("overview", "") for ep in episodes]
                        names = [ep.get("name", "") for ep in episodes]

                        translated_overviews = translate_batch_to_catalan(overviews, source_lang)
                        translated_names = translate_batch_to_catalan(names, source_lang)

                        for i, ep in enumerate(episodes):
                            result["episodes"].append({
                                "episode_number": ep.get("episode_number"),
                                "name": translated_names[i] if i < len(translated_names) else ep.get("name"),
                                "overview": translated_overviews[i] if i < len(translated_overviews) else ep.get("overview"),
                                "still_path": ep.get("still_path"),
                                "air_date": ep.get("air_date"),
                                "runtime": ep.get("runtime"),
                                "vote_average": ep.get("vote_average")
                            })
                    else:
                        for ep in episodes:
                            result["episodes"].append({
                                "episode_number": ep.get("episode_number"),
                                "name": ep.get("name"),
                                "overview": ep.get("overview"),
                                "still_path": ep.get("still_path"),
                                "air_date": ep.get("air_date"),
                                "runtime": ep.get("runtime"),
                                "vote_average": ep.get("vote_average")
                            })

                    result["season_number"] = season_number
                    result["name"] = tmdb_data.get("name")
                    result["overview"] = tmdb_data.get("overview")
                    result["poster_path"] = tmdb_data.get("poster_path")

            finally:
                await tmdb_client.close()

        return result if result["episodes"] else None

    async def _get_fallback_artwork(self, tmdb_id: int, is_movie: bool) -> Optional[Dict[str, str]]:
        """Obté artwork de Fanart.tv com a fallback."""
        from backend.metadata.fanart import FanartTVClient

        client = FanartTVClient()

        try:
            if is_movie:
                images = await client.get_movie_images(tmdb_id)
            else:
                # Necessitem TVDB ID per sèries
                # Intentar obtenir-lo via TMDB external IDs
                from backend.metadata.tmdb import TMDBClient
                from config import settings

                tmdb_client = TMDBClient(settings.TMDB_API_KEY)
                try:
                    external_ids = await tmdb_client._request(f"/tv/{tmdb_id}/external_ids")
                    tvdb_id = external_ids.get("tvdb_id") if external_ids else None
                finally:
                    await tmdb_client.close()

                if tvdb_id:
                    images = await client.get_tv_images(tvdb_id)
                else:
                    return None

            if images:
                return {
                    "poster": client.get_best_image(images.get("posters", [])),
                    "background": client.get_best_image(images.get("backgrounds", [])),
                    "logo": client.get_best_image(images.get("logos", [])),
                    "banner": client.get_best_image(images.get("banners", []))
                }
        except Exception as e:
            logger.warning(f"Error getting fallback artwork: {e}")

        return None

    def _is_anime(self, tmdb_data: Dict) -> bool:
        """Detecta si una sèrie és anime basant-se en les dades de TMDB."""
        genres = [g.get("id") for g in tmdb_data.get("genres", [])]
        origin = tmdb_data.get("origin_country", [])

        # Gènere Animation (16) + origen japonès
        is_animation = 16 in genres
        is_japanese = "JP" in origin

        return is_animation and is_japanese

    def _schedule_background_refresh(self, cache_key: str, tmdb_id: int, anilist_id: int, content_type: ContentType):
        """Programa un refresh en background."""
        async def refresh():
            try:
                data = await self._fetch_series_metadata(tmdb_id, anilist_id, content_type, True)
                if data:
                    metadata_cache.set(cache_key, data, data.get("_source", MetadataSource.TMDB))
                    logger.debug(f"Background refresh completed for {cache_key}")
            except Exception as e:
                logger.warning(f"Background refresh failed for {cache_key}: {e}")

        task = asyncio.create_task(refresh())
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    def _schedule_background_refresh_movie(self, cache_key: str, tmdb_id: int):
        """Programa un refresh de película en background."""
        async def refresh():
            try:
                data = await self._fetch_movie_metadata(tmdb_id, True)
                if data:
                    metadata_cache.set(cache_key, data, MetadataSource.TMDB)
            except Exception as e:
                logger.warning(f"Background refresh failed for {cache_key}: {e}")

        task = asyncio.create_task(refresh())
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    def _schedule_background_refresh_episodes(self, cache_key: str, tmdb_id: int, season: int, anilist_id: int):
        """Programa un refresh d'episodis en background."""
        async def refresh():
            try:
                data = await self._fetch_episodes_metadata(tmdb_id, season, anilist_id, None)
                if data:
                    metadata_cache.set(cache_key, data, data.get("_source", MetadataSource.TMDB))
            except Exception as e:
                logger.warning(f"Background refresh failed for {cache_key}: {e}")

        task = asyncio.create_task(refresh())
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    def get_cache_stats(self) -> Dict[str, Any]:
        """Retorna estadístiques del cache."""
        return metadata_cache.stats

    def invalidate_cache(self, tmdb_id: int = None, anilist_id: int = None):
        """Invalida el cache per un contingut específic."""
        if tmdb_id:
            metadata_cache.invalidate_pattern(f":{tmdb_id}")
        if anilist_id:
            metadata_cache.invalidate_pattern(f":{anilist_id}")

    def clear_cache(self):
        """Neteja tot el cache."""
        metadata_cache.clear()


# Instància global del servei
metadata_service = MetadataService()
