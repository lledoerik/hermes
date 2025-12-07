"""
AniList API integration for anime metadata.
Provides better anime-specific data than TMDB, with adult content filtering.
API: https://anilist.gitbook.io/anilist-apiv2-docs/
"""

import asyncio
import json
import logging
from typing import Optional, Dict, Any, List
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)

# Idiomes per ordre de preferència
TITLE_PREFERENCE = ["english", "romaji", "native"]


class AniListClient:
    """Client per a l'API GraphQL d'AniList"""

    API_URL = "https://graphql.anilist.co"

    # Rate limiting: 90 requests/minute
    # Implementem un delay mínim entre requests
    MIN_REQUEST_DELAY = 0.7  # ~85 requests/minute per seguretat

    def __init__(self):
        self._last_request_time = 0

    def _sync_request(self, query: str, variables: Dict = None) -> Optional[Dict]:
        """Fa una petició GraphQL síncrona a AniList"""
        import time

        # Rate limiting
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self.MIN_REQUEST_DELAY:
            time.sleep(self.MIN_REQUEST_DELAY - elapsed)

        try:
            payload = {"query": query}
            if variables:
                payload["variables"] = variables

            data = json.dumps(payload).encode('utf-8')
            req = Request(
                self.API_URL,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "Hermes Media Server/1.0"
                }
            )

            with urlopen(req, timeout=15) as response:
                self._last_request_time = time.time()
                result = json.loads(response.read().decode('utf-8'))

                if result.get("errors"):
                    logger.warning(f"AniList errors: {result['errors']}")
                    return None

                return result.get("data")

        except (URLError, HTTPError) as e:
            logger.error(f"AniList request error: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"AniList JSON error: {e}")
            return None

    async def _request(self, query: str, variables: Dict = None) -> Optional[Dict]:
        """Fa una petició GraphQL asíncrona a AniList"""
        return await asyncio.to_thread(self._sync_request, query, variables)

    async def search_anime(
        self,
        title: str,
        year: int = None,
        is_adult: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Cerca un anime per títol.

        Args:
            title: Títol a cercar
            year: Any d'emissió (opcional)
            is_adult: Si True, inclou contingut adult (default: False)

        Returns:
            Diccionari amb info bàsica de l'anime o None
        """
        query = """
        query ($search: String, $year: Int, $isAdult: Boolean) {
            Media(
                search: $search,
                type: ANIME,
                seasonYear: $year,
                isAdult: $isAdult
            ) {
                id
                idMal
                title {
                    romaji
                    english
                    native
                }
                format
                status
                episodes
                duration
                seasonYear
                season
                averageScore
                popularity
                isAdult
                coverImage {
                    extraLarge
                    large
                    medium
                }
                bannerImage
            }
        }
        """

        variables = {
            "search": self._clean_title(title),
            "isAdult": is_adult
        }
        if year:
            variables["year"] = year

        data = await self._request(query, variables)
        if data and data.get("Media"):
            return self._format_basic_info(data["Media"])

        # Si no troba amb any, provar sense
        if year:
            del variables["year"]
            data = await self._request(query, variables)
            if data and data.get("Media"):
                return self._format_basic_info(data["Media"])

        return None

    async def search_anime_list(
        self,
        title: str,
        limit: int = 10,
        is_adult: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Cerca múltiples resultats per un títol.
        Útil per mostrar opcions a l'usuari.
        """
        query = """
        query ($search: String, $perPage: Int, $isAdult: Boolean) {
            Page(page: 1, perPage: $perPage) {
                media(search: $search, type: ANIME, isAdult: $isAdult) {
                    id
                    idMal
                    title {
                        romaji
                        english
                        native
                    }
                    format
                    status
                    episodes
                    seasonYear
                    averageScore
                    isAdult
                    coverImage {
                        large
                    }
                }
            }
        }
        """

        variables = {
            "search": self._clean_title(title),
            "perPage": limit,
            "isAdult": is_adult
        }

        data = await self._request(query, variables)
        if data and data.get("Page", {}).get("media"):
            return [self._format_basic_info(m) for m in data["Page"]["media"]]

        return []

    async def get_anime_details(self, anilist_id: int) -> Optional[Dict[str, Any]]:
        """
        Obté informació completa d'un anime per ID.
        Inclou episodis, personatges, staff, etc.
        """
        query = """
        query ($id: Int) {
            Media(id: $id, type: ANIME) {
                id
                idMal
                title {
                    romaji
                    english
                    native
                }
                description(asHtml: false)
                format
                status
                episodes
                duration
                seasonYear
                season
                startDate { year, month, day }
                endDate { year, month, day }
                averageScore
                meanScore
                popularity
                favourites
                isAdult
                genres
                tags {
                    name
                    rank
                    isMediaSpoiler
                }
                studios(isMain: true) {
                    nodes {
                        id
                        name
                        isAnimationStudio
                    }
                }
                coverImage {
                    extraLarge
                    large
                    medium
                    color
                }
                bannerImage
                source
                hashtag
                synonyms
                countryOfOrigin
                nextAiringEpisode {
                    airingAt
                    episode
                    timeUntilAiring
                }
                externalLinks {
                    url
                    site
                    type
                }
                streamingEpisodes {
                    title
                    thumbnail
                    url
                    site
                }
                relations {
                    edges {
                        relationType
                        node {
                            id
                            title { romaji, english }
                            type
                            format
                        }
                    }
                }
            }
        }
        """

        data = await self._request(query, {"id": anilist_id})
        if data and data.get("Media"):
            return self._format_full_details(data["Media"])

        return None

    async def get_anime_by_mal_id(self, mal_id: int) -> Optional[Dict[str, Any]]:
        """Obté un anime pel seu ID de MyAnimeList"""
        query = """
        query ($malId: Int) {
            Media(idMal: $malId, type: ANIME) {
                id
                idMal
                title {
                    romaji
                    english
                    native
                }
                description(asHtml: false)
                format
                status
                episodes
                duration
                seasonYear
                averageScore
                isAdult
                genres
                studios(isMain: true) {
                    nodes { name }
                }
                coverImage {
                    extraLarge
                    large
                }
                bannerImage
            }
        }
        """

        data = await self._request(query, {"malId": mal_id})
        if data and data.get("Media"):
            return self._format_full_details(data["Media"])

        return None

    async def get_episodes_info(self, anilist_id: int) -> List[Dict[str, Any]]:
        """
        Obté informació dels episodis disponibles.
        Nota: AniList no té descripcions d'episodis com TMDB.
        """
        query = """
        query ($id: Int) {
            Media(id: $id, type: ANIME) {
                episodes
                duration
                nextAiringEpisode {
                    episode
                    airingAt
                }
                streamingEpisodes {
                    title
                    thumbnail
                    url
                    site
                }
                airingSchedule(notYetAired: false) {
                    nodes {
                        episode
                        airingAt
                    }
                }
            }
        }
        """

        data = await self._request(query, {"id": anilist_id})
        if not data or not data.get("Media"):
            return []

        media = data["Media"]
        episodes = []
        total_eps = media.get("episodes") or 0
        duration = media.get("duration")

        # Intentar obtenir thumbnails dels streaming episodes
        streaming_eps = {
            self._extract_episode_number(ep.get("title", "")): ep
            for ep in media.get("streamingEpisodes", [])
            if ep.get("title")
        }

        # Crear llista d'episodis
        for i in range(1, total_eps + 1):
            ep_info = {
                "episode_number": i,
                "name": f"Episodi {i}",
                "runtime": duration,
                "still_path": None,
                "overview": None  # AniList no té descripcions per episodi
            }

            # Afegir thumbnail si disponible
            if i in streaming_eps:
                ep_info["still_path"] = streaming_eps[i].get("thumbnail")
                ep_info["name"] = streaming_eps[i].get("title", ep_info["name"])

            episodes.append(ep_info)

        return episodes

    async def get_related_anime(self, anilist_id: int) -> List[Dict[str, Any]]:
        """Obté anime relacionat (seqüeles, prequeles, spin-offs)"""
        details = await self.get_anime_details(anilist_id)
        if details and details.get("relations"):
            return details["relations"]
        return []

    def _clean_title(self, title: str) -> str:
        """Neteja el títol per millorar la cerca"""
        import re
        # Eliminar anys entre parèntesis
        title = re.sub(r'\s*\(\d{4}\)\s*', '', title)
        # Eliminar info de qualitat
        title = re.sub(r'\s*\[.*?\]\s*', '', title)
        # Eliminar "Season X" o "Temporada X"
        title = re.sub(r'\s*(Season|Temporada|Part|Cour)\s*\d+', '', title, flags=re.IGNORECASE)
        # Eliminar números de temporada al final
        title = re.sub(r'\s+\d+$', '', title)
        # Eliminar "The Animation" que a vegades sobra
        title = re.sub(r'\s*-?\s*The Animation$', '', title, flags=re.IGNORECASE)
        return title.strip()

    def _extract_episode_number(self, title: str) -> Optional[int]:
        """Extreu el número d'episodi d'un títol"""
        import re
        match = re.search(r'Episode\s*(\d+)', title, re.IGNORECASE)
        if match:
            return int(match.group(1))
        return None

    def _get_preferred_title(self, titles: Dict) -> str:
        """Obté el títol preferit segons l'ordre de preferència"""
        for pref in TITLE_PREFERENCE:
            if titles.get(pref):
                return titles[pref]
        return titles.get("romaji") or "Unknown"

    def _format_basic_info(self, media: Dict) -> Dict[str, Any]:
        """Formata info bàsica d'un anime"""
        titles = media.get("title", {})
        cover = media.get("coverImage", {})

        return {
            "anilist_id": media.get("id"),
            "mal_id": media.get("idMal"),
            "title": self._get_preferred_title(titles),
            "title_romaji": titles.get("romaji"),
            "title_english": titles.get("english"),
            "title_native": titles.get("native"),
            "format": media.get("format"),  # TV, MOVIE, OVA, ONA, SPECIAL
            "status": media.get("status"),  # FINISHED, RELEASING, NOT_YET_RELEASED
            "episodes": media.get("episodes"),
            "duration": media.get("duration"),
            "year": media.get("seasonYear"),
            "season": media.get("season"),
            "rating": media.get("averageScore"),
            "popularity": media.get("popularity"),
            "is_adult": media.get("isAdult", False),
            "poster": cover.get("extraLarge") or cover.get("large"),
            "poster_medium": cover.get("medium"),
            "banner": media.get("bannerImage")
        }

    def _format_full_details(self, media: Dict) -> Dict[str, Any]:
        """Formata informació completa d'un anime"""
        basic = self._format_basic_info(media)

        # Afegir camps addicionals
        basic.update({
            "overview": self._clean_description(media.get("description")),
            "genres": media.get("genres", []),
            "tags": [
                {"name": t["name"], "rank": t["rank"]}
                for t in media.get("tags", [])
                if not t.get("isMediaSpoiler")
            ][:10],
            "studios": [
                s["name"] for s in media.get("studios", {}).get("nodes", [])
            ],
            "source": media.get("source"),  # MANGA, LIGHT_NOVEL, ORIGINAL, etc.
            "country": media.get("countryOfOrigin"),
            "synonyms": media.get("synonyms", []),
            "start_date": self._format_date(media.get("startDate")),
            "end_date": self._format_date(media.get("endDate")),
            "next_airing": media.get("nextAiringEpisode"),
            "external_links": [
                {"site": l["site"], "url": l["url"]}
                for l in media.get("externalLinks", [])
                if l.get("type") == "STREAMING"
            ],
            "relations": [
                {
                    "id": r["node"]["id"],
                    "title": r["node"]["title"].get("romaji") or r["node"]["title"].get("english"),
                    "type": r["node"]["type"],
                    "format": r["node"]["format"],
                    "relation": r["relationType"]
                }
                for r in media.get("relations", {}).get("edges", [])
            ]
        })

        return basic

    def _clean_description(self, description: str) -> Optional[str]:
        """Neteja la descripció HTML d'AniList"""
        if not description:
            return None

        import re
        # Eliminar tags HTML
        text = re.sub(r'<br\s*/?>', '\n', description)
        text = re.sub(r'<[^>]+>', '', text)
        # Eliminar múltiples salts de línia
        text = re.sub(r'\n{3,}', '\n\n', text)
        # Eliminar "(Source: ...)" al final
        text = re.sub(r'\s*\(Source:.*?\)\s*$', '', text, flags=re.IGNORECASE)

        return text.strip()

    def _format_date(self, date_obj: Dict) -> Optional[str]:
        """Formata una data d'AniList a ISO format"""
        if not date_obj:
            return None

        year = date_obj.get("year")
        month = date_obj.get("month")
        day = date_obj.get("day")

        if year and month and day:
            return f"{year}-{month:02d}-{day:02d}"
        elif year and month:
            return f"{year}-{month:02d}"
        elif year:
            return str(year)

        return None


# Funcions d'utilitat per ús directe

async def search_anime(title: str, year: int = None) -> Optional[Dict[str, Any]]:
    """Cerca ràpida d'un anime (sense contingut adult)"""
    client = AniListClient()
    return await client.search_anime(title, year, is_adult=False)


async def get_anime_metadata(anilist_id: int) -> Optional[Dict[str, Any]]:
    """Obté metadata completa d'un anime"""
    client = AniListClient()
    return await client.get_anime_details(anilist_id)


async def get_anime_by_mal(mal_id: int) -> Optional[Dict[str, Any]]:
    """Obté anime pel seu ID de MyAnimeList"""
    client = AniListClient()
    return await client.get_anime_by_mal_id(mal_id)
