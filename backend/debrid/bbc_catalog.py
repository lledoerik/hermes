"""
BBC iPlayer Catalog Scanner

Escaneja el catàleg complet de BBC iPlayer i fa matching amb TMDB
per crear el mapping automàticament.

Utilitza l'API interna de BBC iPlayer (ibl.api.bbc.co.uk) per obtenir
el catàleg complet en format JSON.
"""

import asyncio
import logging
import re
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime

import httpx

from backend.debrid.bbc_cookies import get_bbc_cookies_dict

logger = logging.getLogger(__name__)

# BBC iPlayer Internal API
BBC_API_BASE = "https://ibl.api.bbc.co.uk/ibl/v1"

# Categories disponibles a BBC iPlayer (llista completa)
BBC_CATEGORIES = {
    # Gèneres principals
    "films": "films",
    "drama": "drama-and-soaps",
    "comedy": "comedy",
    "entertainment": "entertainment",
    "documentaries": "documentaries",
    "lifestyle": "lifestyle",
    "music": "music",
    "news": "news",
    "science": "science-and-nature",
    "sport": "sport",
    # Categories addicionals
    "arts": "arts",
    "food": "food",
    "history": "history",
    "archive": "archive",
    # Contingut infantil
    "cbbc": "cbbc",
    "cbeebies": "cbeebies",
    # Accessibilitat
    "audio-described": "audio-described",
    "signed": "signed",
    # Regional
    "northern-ireland": "northern-ireland",
    "scotland": "scotland",
    "wales": "wales",
}

# Canals BBC per escaneig addicional
BBC_CHANNELS = [
    "bbc_one",
    "bbc_two",
    "bbc_three",
    "bbc_four",
    "cbbc",
    "cbeebies",
    "bbc_news",
    "bbc_parliament",
    "bbc_alba",
    "s4c",
]

# JustWatch API configuration
JUSTWATCH_API_BASE = "https://apis.justwatch.com/content"
JUSTWATCH_GRAPHQL = "https://apis.justwatch.com/graphql"
JUSTWATCH_BBC_PROVIDER_ID = 38  # BBC iPlayer provider ID in JustWatch


class JustWatchBBCScanner:
    """
    Escaneja el catàleg de BBC iPlayer utilitzant JustWatch.
    JustWatch té el catàleg complet i actualitzat.
    """

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    async def get_provider_id(self) -> Optional[int]:
        """
        Obté el provider ID de BBC iPlayer a JustWatch.
        """
        url = f"{JUSTWATCH_API_BASE}/providers/locale/en_GB"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers)
                if response.status_code == 200:
                    providers = response.json()
                    for provider in providers:
                        name = provider.get("clear_name", "").lower()
                        tech_name = provider.get("technical_name", "").lower()
                        if "bbc" in name and "iplayer" in name:
                            logger.info(f"Found BBC iPlayer provider: ID={provider.get('id')}, name={provider.get('clear_name')}")
                            return provider.get("id")
                        if "bbciplayer" in tech_name or "bbc_iplayer" in tech_name:
                            return provider.get("id")
        except Exception as e:
            logger.error(f"Error getting JustWatch provider ID: {e}")

        return JUSTWATCH_BBC_PROVIDER_ID  # Fallback to known ID

    async def scan_all_content(self, progress_callback=None) -> List[Dict]:
        """
        Escaneja tot el contingut de BBC iPlayer via JustWatch.
        Retorna llista de títols amb informació bàsica.
        """
        all_titles = []

        # Escanejar pel·lícules
        if progress_callback:
            progress_callback("JustWatch: Scanning movies...", 0)

        movies = await self._scan_content_type("movie", progress_callback, 0, 40)
        all_titles.extend(movies)
        logger.info(f"JustWatch: Found {len(movies)} movies")

        # Escanejar sèries
        if progress_callback:
            progress_callback("JustWatch: Scanning TV shows...", 40)

        shows = await self._scan_content_type("show", progress_callback, 40, 100)
        all_titles.extend(shows)
        logger.info(f"JustWatch: Found {len(shows)} TV shows")

        logger.info(f"JustWatch total: {len(all_titles)} titles")
        return all_titles

    async def _scan_content_type(self, content_type: str, progress_callback, start_pct: float, end_pct: float) -> List[Dict]:
        """
        Escaneja un tipus de contingut (movie o show) de JustWatch.
        """
        titles = []
        page = 1
        page_size = 100
        total_pages = 1

        while page <= total_pages:
            url = f"{JUSTWATCH_API_BASE}/titles/en_GB/popular"

            params = {
                "body": json.dumps({
                    "providers": ["bip"],  # BBC iPlayer short code
                    "content_types": [content_type],
                    "page": page,
                    "page_size": page_size,
                })
            }

            # Alternative: direct filter endpoint
            filter_url = f"{JUSTWATCH_API_BASE}/titles/en_GB/popular"
            payload = {
                "providers": ["bip"],
                "content_types": [content_type],
                "page": page,
                "page_size": page_size,
            }

            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(filter_url, json=payload, headers=self.headers)

                    if response.status_code != 200:
                        # Try alternative endpoint
                        alt_url = f"{JUSTWATCH_API_BASE}/titles/en_GB/list"
                        response = await client.post(alt_url, json=payload, headers=self.headers)

                    if response.status_code == 200:
                        data = response.json()
                        items = data.get("items", [])

                        if not items:
                            break

                        for item in items:
                            title_info = {
                                "justwatch_id": item.get("id"),
                                "title": item.get("title"),
                                "original_title": item.get("original_title"),
                                "content_type": content_type,
                                "year": item.get("original_release_year"),
                                "tmdb_id": None,
                                "imdb_id": None,
                            }

                            # Extreure IDs externs
                            for scoring in item.get("scoring", []):
                                if scoring.get("provider_type") == "tmdb:id":
                                    title_info["tmdb_id"] = scoring.get("value")
                                elif scoring.get("provider_type") == "imdb:id":
                                    title_info["imdb_id"] = scoring.get("value")

                            titles.append(title_info)

                        # Actualitzar paginació
                        total_pages = data.get("total_pages", 1)
                        total_results = data.get("total_results", len(items))

                        if progress_callback:
                            pct = start_pct + (page / max(total_pages, 1)) * (end_pct - start_pct)
                            progress_callback(f"JustWatch: {content_type}s page {page}/{total_pages}", pct)

                        page += 1
                        await asyncio.sleep(0.5)  # Rate limiting
                    else:
                        logger.warning(f"JustWatch API returned {response.status_code}")
                        break

            except Exception as e:
                logger.error(f"Error scanning JustWatch {content_type}s: {e}")
                break

        return titles

    async def scan_via_graphql(self, progress_callback=None) -> List[Dict]:
        """
        Escaneja BBC iPlayer via GraphQL API de JustWatch (més robust).
        """
        all_titles = []

        # GraphQL query per obtenir contingut d'un provider
        query = """
        query GetPopularTitles($country: Country!, $providers: [String!], $after: String, $first: Int, $filter: TitleFilter) {
            popularTitles(country: $country, providers: $providers, after: $after, first: $first, filter: $filter) {
                edges {
                    node {
                        id
                        objectType
                        content(country: $country, language: "en") {
                            title
                            originalReleaseYear
                            externalIds {
                                tmdbId
                                imdbId
                            }
                        }
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
                totalCount
            }
        }
        """

        for content_type in ["MOVIE", "SHOW"]:
            cursor = None
            page = 0

            while True:
                variables = {
                    "country": "GB",
                    "providers": ["bip"],
                    "first": 100,
                    "filter": {"objectTypes": [content_type]},
                }

                if cursor:
                    variables["after"] = cursor

                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.post(
                            JUSTWATCH_GRAPHQL,
                            json={"query": query, "variables": variables},
                            headers=self.headers
                        )

                        if response.status_code == 200:
                            data = response.json()
                            result = data.get("data", {}).get("popularTitles", {})

                            edges = result.get("edges", [])
                            if not edges:
                                break

                            for edge in edges:
                                node = edge.get("node", {})
                                content = node.get("content", {})
                                external_ids = content.get("externalIds", {})

                                title_info = {
                                    "justwatch_id": node.get("id"),
                                    "title": content.get("title"),
                                    "content_type": "movie" if content_type == "MOVIE" else "show",
                                    "year": content.get("originalReleaseYear"),
                                    "tmdb_id": external_ids.get("tmdbId"),
                                    "imdb_id": external_ids.get("imdbId"),
                                }
                                all_titles.append(title_info)

                            page_info = result.get("pageInfo", {})
                            if not page_info.get("hasNextPage"):
                                break

                            cursor = page_info.get("endCursor")
                            page += 1

                            if progress_callback:
                                total = result.get("totalCount", 0)
                                pct = min(95, (len(all_titles) / max(total, 1)) * 100)
                                progress_callback(f"JustWatch GraphQL: {len(all_titles)} titles", pct)

                            await asyncio.sleep(0.3)
                        else:
                            logger.warning(f"JustWatch GraphQL returned {response.status_code}")
                            break

                except Exception as e:
                    logger.error(f"Error with JustWatch GraphQL: {e}")
                    break

        return all_titles


class TMDBBBCScanner:
    """
    Escaneja el contingut de BBC iPlayer utilitzant TMDB Discover API.

    TMDB té informació de quins títols estan disponibles a cada streaming provider.
    Això ens dona directament els TMDB IDs sense necessitat de fer matching!

    Provider ID per BBC iPlayer a TMDB: 38
    """

    # BBC iPlayer provider ID a TMDB
    BBC_IPLAYER_PROVIDER_ID = 38

    def __init__(self, tmdb_api_key: str):
        self.api_key = tmdb_api_key
        self.base_url = "https://api.themoviedb.org/3"

    async def discover_all_content(self, progress_callback=None) -> List[Dict]:
        """
        Descobreix tot el contingut disponible a BBC iPlayer via TMDB Discover API.
        Retorna llista de títols amb TMDB IDs.
        """
        all_titles = []

        # Escanejar pel·lícules
        if progress_callback:
            progress_callback("TMDB Discover: Scanning BBC iPlayer movies...", 0)

        movies = await self._discover_content_type("movie", progress_callback, 0, 45)
        all_titles.extend(movies)
        logger.info(f"TMDB Discover: Found {len(movies)} movies on BBC iPlayer")

        # Escanejar sèries
        if progress_callback:
            progress_callback("TMDB Discover: Scanning BBC iPlayer TV shows...", 45)

        shows = await self._discover_content_type("tv", progress_callback, 45, 95)
        all_titles.extend(shows)
        logger.info(f"TMDB Discover: Found {len(shows)} TV shows on BBC iPlayer")

        if progress_callback:
            progress_callback("TMDB Discover: Complete!", 100)

        logger.info(f"TMDB Discover total: {len(all_titles)} titles on BBC iPlayer")
        return all_titles

    async def _discover_content_type(
        self,
        content_type: str,
        progress_callback,
        start_pct: float,
        end_pct: float
    ) -> List[Dict]:
        """
        Descobreix un tipus de contingut (movie o tv) disponible a BBC iPlayer.
        """
        titles = []
        page = 1
        total_pages = 1

        # Endpoint: /discover/movie o /discover/tv
        endpoint = f"{self.base_url}/discover/{content_type}"

        while page <= total_pages and page <= 500:  # TMDB max 500 pages
            params = {
                "api_key": self.api_key,
                "language": "en-GB",
                "watch_region": "GB",  # UK
                "with_watch_providers": str(self.BBC_IPLAYER_PROVIDER_ID),
                "sort_by": "popularity.desc",
                "page": page
            }

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.get(endpoint, params=params)

                    if response.status_code == 200:
                        data = response.json()
                        results = data.get("results", [])
                        total_pages = min(data.get("total_pages", 1), 500)
                        total_results = data.get("total_results", 0)

                        for item in results:
                            title_info = {
                                "tmdb_id": item.get("id"),
                                "title": item.get("title") or item.get("name"),
                                "original_title": item.get("original_title") or item.get("original_name"),
                                "content_type": content_type,
                                "year": None,
                                "overview": item.get("overview"),
                                "poster_path": item.get("poster_path"),
                                "vote_average": item.get("vote_average"),
                            }

                            # Extreure any
                            date_str = item.get("release_date") or item.get("first_air_date") or ""
                            if date_str and len(date_str) >= 4:
                                try:
                                    title_info["year"] = int(date_str[:4])
                                except ValueError:
                                    pass

                            titles.append(title_info)

                        # Progress callback
                        if progress_callback and total_pages > 0:
                            pct = start_pct + ((page / total_pages) * (end_pct - start_pct))
                            progress_callback(
                                f"TMDB Discover: {content_type}s page {page}/{total_pages} ({len(titles)} found)",
                                pct
                            )

                        logger.debug(f"TMDB Discover {content_type} page {page}/{total_pages}: {len(results)} results")

                        page += 1
                        await asyncio.sleep(0.25)  # Rate limiting

                    elif response.status_code == 401:
                        logger.error("TMDB API key invalid (401)")
                        break
                    elif response.status_code == 429:
                        logger.warning("TMDB rate limited, waiting...")
                        await asyncio.sleep(2)
                    else:
                        logger.warning(f"TMDB Discover returned {response.status_code}: {response.text[:200]}")
                        break

            except Exception as e:
                logger.error(f"Error in TMDB Discover {content_type}: {e}")
                break

        return titles

    async def find_bbc_programme_id(self, tmdb_id: int, title: str, content_type: str) -> Optional[str]:
        """
        Intenta trobar el BBC programme ID per un títol de TMDB.
        Prova múltiples mètodes de cerca.
        """
        cookies = get_bbc_cookies_dict()
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
        }

        # Mètode 1: Search suggest API
        pid = await self._search_bbc_suggest(title, cookies, headers)
        if pid:
            return pid

        # Mètode 2: Search API complet
        pid = await self._search_bbc_full(title, cookies, headers)
        if pid:
            return pid

        # Mètode 3: Cerca directa per A-Z (primera lletra del títol)
        pid = await self._search_bbc_az(title, cookies, headers)
        if pid:
            return pid

        logger.debug(f"Could not find BBC PID for '{title}' (TMDB: {tmdb_id})")
        return None

    async def _search_bbc_suggest(self, title: str, cookies: dict, headers: dict) -> Optional[str]:
        """Cerca via suggest API"""
        try:
            search_url = f"{BBC_API_BASE}/search/suggest"
            params = {"q": title, "rights": "web", "api_key": "D2FgtcTxGqqIgLsfBWTJdrQh2tVdeaAp"}

            async with httpx.AsyncClient(timeout=10.0, cookies=cookies) as client:
                response = await client.get(search_url, params=params, headers=headers)

                if response.status_code == 200:
                    data = response.json()
                    results = data.get("search_suggest", {}).get("results", [])

                    if results:
                        # Buscar coincidència pel títol
                        title_lower = title.lower()
                        for result in results:
                            result_title = (result.get("title") or "").lower()
                            if result_title == title_lower or title_lower in result_title or result_title in title_lower:
                                pid = result.get("id") or result.get("pid") or result.get("tleo_id")
                                if pid:
                                    logger.debug(f"Found via suggest: '{title}' -> {pid}")
                                    return pid

                        # Retornar el primer resultat si hi ha
                        first = results[0]
                        pid = first.get("id") or first.get("pid") or first.get("tleo_id")
                        if pid:
                            logger.debug(f"Found via suggest (first result): '{title}' -> {pid}")
                            return pid
                else:
                    logger.debug(f"BBC suggest API returned {response.status_code} for '{title}'")

        except Exception as e:
            logger.debug(f"Error in BBC suggest search for '{title}': {e}")

        return None

    async def _search_bbc_full(self, title: str, cookies: dict, headers: dict) -> Optional[str]:
        """Cerca via search API complet"""
        try:
            search_url = f"{BBC_API_BASE}/search"
            params = {
                "q": title,
                "rights": "web",
                "page": 1,
                "page_size": 10,
                "api_key": "D2FgtcTxGqqIgLsfBWTJdrQh2tVdeaAp"
            }

            async with httpx.AsyncClient(timeout=10.0, cookies=cookies) as client:
                response = await client.get(search_url, params=params, headers=headers)

                if response.status_code == 200:
                    data = response.json()
                    # L'estructura pot variar
                    results = (
                        data.get("search", {}).get("results", []) or
                        data.get("results", []) or
                        data.get("programmes", [])
                    )

                    if results:
                        title_lower = title.lower()
                        for result in results:
                            result_title = (result.get("title") or result.get("name") or "").lower()
                            if result_title == title_lower or title_lower in result_title or result_title in title_lower:
                                pid = result.get("id") or result.get("pid") or result.get("tleo_id") or result.get("programme_id")
                                if pid:
                                    logger.debug(f"Found via full search: '{title}' -> {pid}")
                                    return pid

                        # Primer resultat
                        first = results[0]
                        pid = first.get("id") or first.get("pid") or first.get("tleo_id") or first.get("programme_id")
                        if pid:
                            logger.debug(f"Found via full search (first): '{title}' -> {pid}")
                            return pid

        except Exception as e:
            logger.debug(f"Error in BBC full search for '{title}': {e}")

        return None

    async def _search_bbc_az(self, title: str, cookies: dict, headers: dict) -> Optional[str]:
        """Cerca via A-Z listing"""
        try:
            # Obtenir primera lletra
            first_char = title[0].lower() if title else "a"
            if not first_char.isalpha():
                first_char = "0-9"

            az_url = f"{BBC_API_BASE}/atoz/{first_char}/programmes"
            params = {"rights": "web", "page": 1, "per_page": 200, "api_key": "D2FgtcTxGqqIgLsfBWTJdrQh2tVdeaAp"}

            async with httpx.AsyncClient(timeout=15.0, cookies=cookies) as client:
                response = await client.get(az_url, params=params, headers=headers)

                if response.status_code == 200:
                    data = response.json()
                    programmes = data.get("atoz_programmes", {}).get("elements", [])

                    title_lower = title.lower()
                    for prog in programmes:
                        prog_title = (prog.get("title") or "").lower()
                        if prog_title == title_lower or title_lower in prog_title or prog_title in title_lower:
                            pid = prog.get("id") or prog.get("pid") or prog.get("tleo_id")
                            if pid:
                                logger.debug(f"Found via A-Z: '{title}' -> {pid}")
                                return pid

        except Exception as e:
            logger.debug(f"Error in BBC A-Z search for '{title}': {e}")

        return None


@dataclass
class BBCProgram:
    """Representa un programa de BBC iPlayer"""
    programme_id: str
    title: str
    url: str
    is_film: bool = False
    is_series: bool = False
    synopsis: Optional[str] = None
    thumbnail: Optional[str] = None
    episodes_url: Optional[str] = None
    type: Optional[str] = None  # "episode", "series", "brand", "film"


class BBCCatalogScanner:
    """
    Escaneja el catàleg de BBC iPlayer utilitzant l'API interna.
    """

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-GB,en;q=0.5",
        }
        self._programs_cache: Dict[str, BBCProgram] = {}
        self._cookies: Optional[Dict[str, str]] = None

    def _load_cookies(self) -> Dict[str, str]:
        """Load BBC cookies for authenticated requests"""
        if self._cookies is None:
            try:
                self._cookies = get_bbc_cookies_dict() or {}
                if self._cookies:
                    logger.info(f"Loaded {len(self._cookies)} BBC cookies for catalog scanning")
                else:
                    logger.warning("No BBC cookies available - API requests may be geo-blocked")
            except Exception as e:
                logger.warning(f"Could not load BBC cookies: {e}")
                self._cookies = {}
        return self._cookies

    async def _fetch_json(self, url: str) -> Optional[Dict]:
        """Fetch JSON from BBC API with cookie authentication"""
        cookies = self._load_cookies()
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, cookies=cookies) as client:
                response = await client.get(url, headers=self.headers)
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.warning(f"BBC API returned {response.status_code} for {url}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None

    def _parse_programme(self, item: Dict, is_film_category: bool = False) -> Optional[BBCProgram]:
        """Parse a programme from API response"""
        try:
            # Extreure informació bàsica
            programme_id = item.get("id") or item.get("pid") or item.get("tleo_id")
            if not programme_id:
                return None

            title = item.get("title") or item.get("programme", {}).get("title", "")
            if not title:
                return None

            # Determinar tipus
            item_type = item.get("type", "").lower()
            is_film = is_film_category or item_type == "film" or item.get("master_brand", {}).get("id") == "bbc_films"
            is_series = item_type in ("series", "brand", "episode") and not is_film

            # Construir URL
            if item_type == "episode" or "/episode/" in str(item.get("href", "")):
                url = f"https://www.bbc.co.uk/iplayer/episode/{programme_id}"
            else:
                url = f"https://www.bbc.co.uk/iplayer/episodes/{programme_id}"

            # Sinopsi
            synopsis = (
                item.get("synopsis") or
                item.get("synopses", {}).get("medium") or
                item.get("synopses", {}).get("short") or
                item.get("programme", {}).get("synopses", {}).get("medium")
            )

            # Thumbnail
            images = item.get("images", {}) or item.get("image", {})
            if isinstance(images, dict):
                thumbnail = images.get("standard") or images.get("promotional") or images.get("default")
                if isinstance(thumbnail, dict):
                    thumbnail = thumbnail.get("url")
            else:
                thumbnail = None

            return BBCProgram(
                programme_id=programme_id,
                title=title,
                url=url,
                is_film=is_film,
                is_series=is_series,
                synopsis=synopsis,
                thumbnail=thumbnail,
                episodes_url=url if is_series else None,
                type=item_type
            )
        except Exception as e:
            logger.debug(f"Error parsing programme: {e}")
            return None

    async def scan_category_api(self, category_id: str, is_film: bool = False) -> List[BBCProgram]:
        """
        Escaneja una categoria utilitzant l'API de BBC.
        """
        programs = []
        page = 1
        per_page = 200

        while True:
            url = f"{BBC_API_BASE}/categories/{category_id}/programmes?per_page={per_page}&page={page}"
            logger.info(f"Scanning BBC API: {url}")

            data = await self._fetch_json(url)
            if not data:
                break

            # Extreure programes
            category_programmes = data.get("category_programmes", {})
            elements = category_programmes.get("elements", [])

            if not elements:
                # Provar format alternatiu
                elements = data.get("programmes", []) or data.get("elements", [])

            logger.info(f"Found {len(elements)} elements in page {page}")

            for item in elements:
                prog = self._parse_programme(item, is_film_category=is_film)
                if prog and prog.programme_id not in self._programs_cache:
                    programs.append(prog)
                    self._programs_cache[prog.programme_id] = prog

            # Comprovar si hi ha més pàgines
            total = category_programmes.get("count", 0) or data.get("total", 0)
            if page * per_page >= total or len(elements) < per_page:
                break

            page += 1
            await asyncio.sleep(0.3)

        return programs

    async def scan_az_api(self, letter: str) -> List[BBCProgram]:
        """
        Escaneja una lletra de l'A-Z utilitzant l'API.
        """
        programs = []
        page = 1
        per_page = 200

        # Normalitzar lletra
        letter_param = letter.lower() if letter != "0-9" else "0-9"

        while True:
            url = f"{BBC_API_BASE}/atoz/{letter_param}/programmes?per_page={per_page}&page={page}"
            logger.debug(f"Scanning BBC A-Z API: {url}")

            data = await self._fetch_json(url)
            if not data:
                break

            # Extreure programes
            atoz_programmes = data.get("atoz_programmes", {})
            elements = atoz_programmes.get("elements", [])

            if not elements:
                elements = data.get("programmes", []) or data.get("elements", [])

            logger.debug(f"Found {len(elements)} elements for letter {letter}, page {page}")

            for item in elements:
                prog = self._parse_programme(item)
                if prog and prog.programme_id not in self._programs_cache:
                    programs.append(prog)
                    self._programs_cache[prog.programme_id] = prog

            # Comprovar paginació
            total = atoz_programmes.get("count", 0) or data.get("total", 0)
            if page * per_page >= total or len(elements) < per_page:
                break

            page += 1
            await asyncio.sleep(0.3)

        return programs

    async def scan_az_web(self, letter: str) -> List[BBCProgram]:
        """
        Escaneja una lletra de l'A-Z fent scraping de la pàgina web.
        Això retorna TOTS els programes, no només els de l'API.
        """
        import re
        import json

        programs = []
        cookies = self._load_cookies()

        # La web utilitza lletres en minúscula
        letter_param = letter.lower() if letter != "0-9" else "0-9"
        url = f"https://www.bbc.co.uk/iplayer/a-z/{letter_param}"

        logger.info(f"Scanning BBC A-Z Web: {url}")

        try:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, cookies=cookies) as client:
                response = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-GB,en;q=0.5",
                })

                if response.status_code != 200:
                    logger.warning(f"BBC A-Z Web returned {response.status_code} for {url}")
                    return programs

                html = response.text

                # Buscar el JSON incrustat a la pàgina (redux state)
                # Els patrons són ordenats per prioritat
                patterns = [
                    # Patró principal de BBC iPlayer
                    r'window\.__IPLAYER_REDUX_STATE__\s*=\s*(\{.*\});?\s*</script>',
                    # Alternatius
                    r'window\.__PRELOADED_STATE__\s*=\s*(\{.*\});?\s*</script>',
                    r'<script[^>]*id="initial-data"[^>]*>\s*(\{.*\})\s*</script>',
                    # JSON dins de data attributes
                    r'data-redux-state=["\'](\{[^"\']+\})["\']',
                ]

                json_data = None
                for pattern in patterns:
                    match = re.search(pattern, html, re.DOTALL)
                    if match:
                        try:
                            raw_json = match.group(1)
                            # Netejar el JSON si cal
                            raw_json = raw_json.strip().rstrip(';')
                            json_data = json.loads(raw_json)
                            logger.info(f"Found embedded JSON for letter {letter} (pattern matched)")
                            break
                        except json.JSONDecodeError as e:
                            logger.debug(f"JSON decode failed for pattern: {e}")
                            continue

                if json_data:
                    # Extreure programes del JSON
                    programmes = self._extract_programmes_from_redux(json_data)
                    for prog in programmes:
                        if prog.programme_id not in self._programs_cache:
                            programs.append(prog)
                            self._programs_cache[prog.programme_id] = prog
                    logger.info(f"Extracted {len(programmes)} programmes from Redux for letter {letter}")

                # SEMPRE parsejar HTML com a complement (troba coses que el JSON pot no tenir)
                html_programmes = self._parse_html_programmes(html)
                new_from_html = 0
                for prog in html_programmes:
                    if prog.programme_id not in self._programs_cache:
                        programs.append(prog)
                        self._programs_cache[prog.programme_id] = prog
                        new_from_html += 1

                if new_from_html > 0:
                    logger.info(f"Found {new_from_html} additional programmes from HTML for letter {letter}")

        except Exception as e:
            logger.error(f"Error scanning A-Z web for letter {letter}: {e}")

        return programs

    def _extract_programmes_from_redux(self, redux_state: Dict) -> List[BBCProgram]:
        """
        Extreu programes del redux state de la pàgina web.
        Fa una cerca recursiva per trobar tots els programes.
        """
        programs = []
        seen_ids = set()

        def extract_from_dict(d: Dict, depth: int = 0):
            """Extreu programes recursivament d'un diccionari."""
            if depth > 10:  # Limitar profunditat
                return

            for key, value in d.items():
                # Si la clau sembla un PID de BBC (8+ chars alfanumèrics)
                if isinstance(key, str) and len(key) >= 7 and key.isalnum() and isinstance(value, dict):
                    if "title" in value or "name" in value:
                        prog = self._parse_redux_programme(value, key)
                        if prog and prog.programme_id not in seen_ids:
                            programs.append(prog)
                            seen_ids.add(prog.programme_id)

                # Si el valor és un dict amb camps de programa
                if isinstance(value, dict):
                    if ("title" in value or "name" in value) and ("id" in value or "pid" in value or "tleoId" in value):
                        prog = self._parse_redux_programme(value)
                        if prog and prog.programme_id not in seen_ids:
                            programs.append(prog)
                            seen_ids.add(prog.programme_id)
                    # Continuar buscant recursivament
                    extract_from_dict(value, depth + 1)

                # Si el valor és una llista, processar cada element
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            if ("title" in item or "name" in item):
                                prog = self._parse_redux_programme(item)
                                if prog and prog.programme_id not in seen_ids:
                                    programs.append(prog)
                                    seen_ids.add(prog.programme_id)
                            extract_from_dict(item, depth + 1)

        # Buscar en ubicacions conegudes primer
        known_paths = [
            ["programmes"],
            ["atoz", "programmes"],
            ["atoz", "items"],
            ["entities", "programmes"],
            ["entities", "tleos"],
            ["data", "programmes"],
            ["data", "items"],
            ["header", "programmes"],
            ["navigation", "items"],
        ]

        for path in known_paths:
            obj = redux_state
            for key in path:
                if isinstance(obj, dict):
                    obj = obj.get(key, {})
                else:
                    break

            if isinstance(obj, dict) and obj:
                for pid, prog_data in obj.items():
                    if isinstance(prog_data, dict):
                        prog = self._parse_redux_programme(prog_data, pid)
                        if prog and prog.programme_id not in seen_ids:
                            programs.append(prog)
                            seen_ids.add(prog.programme_id)
            elif isinstance(obj, list):
                for item in obj:
                    if isinstance(item, dict):
                        prog = self._parse_redux_programme(item)
                        if prog and prog.programme_id not in seen_ids:
                            programs.append(prog)
                            seen_ids.add(prog.programme_id)

        # Cerca recursiva general
        extract_from_dict(redux_state)

        return programs

    def _parse_redux_programme(self, data: Dict, pid: str = None) -> Optional[BBCProgram]:
        """
        Parseja un programa del redux state.
        """
        try:
            programme_id = pid or data.get("id") or data.get("pid") or data.get("tleoId")
            if not programme_id:
                return None

            title = data.get("title") or data.get("name") or ""
            if not title:
                return None

            # Determinar tipus
            prog_type = data.get("type", "").lower()
            is_film = prog_type == "film" or data.get("isFilm", False)
            is_series = prog_type in ("series", "brand", "episode") or data.get("isSeries", False)

            if not is_film and not is_series:
                is_series = True  # Default a sèrie

            # URL
            url = data.get("url") or f"https://www.bbc.co.uk/iplayer/episodes/{programme_id}"

            return BBCProgram(
                programme_id=programme_id,
                title=title,
                url=url,
                is_film=is_film,
                is_series=is_series,
                synopsis=data.get("synopsis") or data.get("description") or data.get("shortSynopsis"),
                thumbnail=data.get("image") or data.get("thumbnail") or data.get("imageUrl"),
                episodes_url=url if is_series else None
            )
        except Exception as e:
            logger.debug(f"Error parsing redux programme: {e}")
            return None

    def _parse_html_programmes(self, html: str) -> List[BBCProgram]:
        """
        Parseja programes directament de l'HTML.
        Utilitza múltiples patrons per capturar tot el possible.
        """
        import re
        from html import unescape

        programs = []
        seen_pids = set()

        # Patró 1: Enllaços a episodis/sèries
        # /iplayer/episodes/{pid} o /iplayer/episode/{pid}
        patterns = [
            # Enllaços amb text
            r'href=["\']?/iplayer/episodes?/([a-z0-9]+)["\']?[^>]*>([^<]+)</a>',
            # Enllaços en data attributes
            r'data-pid=["\']([a-z0-9]+)["\']',
            r'data-programme-id=["\']([a-z0-9]+)["\']',
            r'data-tleo-id=["\']([a-z0-9]+)["\']',
            # Href sense text (agafarem el títol d'un altre lloc)
            r'href=["\']?/iplayer/episodes?/([a-z0-9]{7,})["\']',
            # Programes en JSON-LD
            r'"url"\s*:\s*"https?://www\.bbc\.co\.uk/iplayer/episodes?/([a-z0-9]+)"',
        ]

        # Extreure títols per PID (de diversos llocs)
        pid_titles = {}

        # Buscar títols en diversos formats
        title_patterns = [
            r'href=["\']?/iplayer/episodes?/([a-z0-9]+)["\'][^>]*>\s*<[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)',
            r'data-pid=["\']([a-z0-9]+)["\'][^>]*>\s*<[^>]*>([^<]+)',
            r'aria-label=["\']([^"\']+)["\'][^>]*href=["\']?/iplayer/episodes?/([a-z0-9]+)',
        ]

        for pattern in title_patterns:
            for match in re.finditer(pattern, html, re.IGNORECASE | re.DOTALL):
                groups = match.groups()
                if len(groups) >= 2:
                    # Depenent del patró, el PID pot ser al grup 1 o 2
                    if groups[0] and len(groups[0]) >= 7 and groups[0].isalnum():
                        pid_titles[groups[0]] = unescape(groups[1].strip())
                    elif groups[1] and len(groups[1]) >= 7 and groups[1].isalnum():
                        pid_titles[groups[1]] = unescape(groups[0].strip())

        # Processar tots els patrons
        for i, pattern in enumerate(patterns):
            for match in re.finditer(pattern, html, re.IGNORECASE):
                groups = match.groups()
                pid = None
                title = None

                if len(groups) >= 2:
                    pid = groups[0]
                    title = unescape(groups[1].strip()) if groups[1] else None
                elif len(groups) >= 1:
                    pid = groups[0]

                if pid and len(pid) >= 7 and pid.isalnum() and pid not in seen_pids:
                    # Buscar títol si no el tenim
                    if not title:
                        title = pid_titles.get(pid)

                    # Si encara no tenim títol, buscar-lo a prop en l'HTML
                    if not title:
                        # Buscar en un context proper
                        context_start = max(0, match.start() - 500)
                        context_end = min(len(html), match.end() + 500)
                        context = html[context_start:context_end]

                        title_match = re.search(r'class="[^"]*title[^"]*"[^>]*>([^<]+)', context)
                        if title_match:
                            title = unescape(title_match.group(1).strip())

                    if title and len(title) > 1:
                        seen_pids.add(pid)
                        prog = BBCProgram(
                            programme_id=pid,
                            title=title,
                            url=f"https://www.bbc.co.uk/iplayer/episodes/{pid}",
                            is_film=False,
                            is_series=True,
                            episodes_url=f"https://www.bbc.co.uk/iplayer/episodes/{pid}"
                        )
                        programs.append(prog)

        return programs

    async def scan_all_az(self, progress_callback=None) -> List[BBCProgram]:
        """
        Escaneja tot l'abecedari A-Z de BBC iPlayer.
        Utilitza tant l'API com web scraping per màxima cobertura.
        """
        all_programs = []
        letters = list("abcdefghijklmnopqrstuvwxyz") + ["0-9"]

        for i, letter in enumerate(letters):
            before_count = len(self._programs_cache)

            # Primera passada: API
            if progress_callback:
                progress_callback(f"A-Z API: {letter.upper()}", (i / len(letters)) * 100)

            api_programs = await self.scan_az_api(letter)
            all_programs.extend(api_programs)

            # Segona passada: Web scraping (per trobar el que l'API es deixa)
            if progress_callback:
                progress_callback(f"A-Z Web: {letter.upper()}", (i / len(letters)) * 100)

            web_programs = await self.scan_az_web(letter)
            all_programs.extend(web_programs)

            after_count = len(self._programs_cache)
            logger.info(f"Letter {letter.upper()}: found {after_count - before_count} new programs (API: {len(api_programs)}, Web: {len(web_programs)})")

            await asyncio.sleep(0.3)

        return all_programs

    async def scan_all_categories(self, progress_callback=None) -> List[BBCProgram]:
        """
        Escaneja totes les categories de BBC iPlayer.
        """
        all_programs = []
        categories = list(BBC_CATEGORIES.items())

        for i, (name, category_id) in enumerate(categories):
            if progress_callback:
                progress_callback(f"Scanning category: {name}", i / len(categories) * 100)

            is_film = name == "films"
            programs = await self.scan_category_api(category_id, is_film=is_film)
            all_programs.extend(programs)
            await asyncio.sleep(0.5)

        return all_programs

    async def scan_channel_api(self, channel_id: str) -> List[BBCProgram]:
        """
        Escaneja un canal de BBC (BBC One, BBC Two, etc.)
        """
        programs = []
        page = 1
        per_page = 200

        while True:
            url = f"{BBC_API_BASE}/channels/{channel_id}/highlights?per_page={per_page}&page={page}"
            logger.info(f"Scanning BBC Channel: {channel_id}, page {page}")

            data = await self._fetch_json(url)
            if not data:
                # Provar endpoint alternatiu
                url = f"{BBC_API_BASE}/channels/{channel_id}/programmes?per_page={per_page}&page={page}"
                data = await self._fetch_json(url)
                if not data:
                    break

            # Extreure programes
            channel_programmes = data.get("channel_highlights", {}) or data.get("channel_programmes", {})
            elements = channel_programmes.get("elements", [])

            if not elements:
                elements = data.get("programmes", []) or data.get("elements", [])

            logger.info(f"Found {len(elements)} elements in channel {channel_id}, page {page}")

            for item in elements:
                prog = self._parse_programme(item)
                if prog and prog.programme_id not in self._programs_cache:
                    programs.append(prog)
                    self._programs_cache[prog.programme_id] = prog

            # Comprovar paginació
            total = channel_programmes.get("count", 0) or data.get("total", 0)
            if page * per_page >= total or len(elements) < per_page:
                break

            page += 1
            await asyncio.sleep(0.3)

        return programs

    async def scan_all_channels(self, progress_callback=None) -> List[BBCProgram]:
        """
        Escaneja tots els canals de BBC.
        """
        all_programs = []

        for i, channel_id in enumerate(BBC_CHANNELS):
            if progress_callback:
                progress_callback(f"Scanning channel: {channel_id}", i / len(BBC_CHANNELS) * 100)

            programs = await self.scan_channel_api(channel_id)
            all_programs.extend(programs)
            await asyncio.sleep(0.5)

        return all_programs

    async def scan_featured_api(self) -> List[BBCProgram]:
        """
        Escaneja contingut destacat/popular de BBC iPlayer.
        """
        programs = []
        endpoints = [
            # Home i destacats
            f"{BBC_API_BASE}/home/highlights",
            f"{BBC_API_BASE}/home/highlights?lang=en",
            # Grups populars
            f"{BBC_API_BASE}/groups/popular/episodes",
            f"{BBC_API_BASE}/groups/featured/episodes",
            f"{BBC_API_BASE}/groups/most-popular/episodes",
            f"{BBC_API_BASE}/groups/trending/episodes",
            # Boxsets (sèries completes)
            f"{BBC_API_BASE}/groups/boxsets/episodes",
            f"{BBC_API_BASE}/groups/box-sets/episodes",
            f"{BBC_API_BASE}/groups/complete-series/episodes",
            # Nou contingut
            f"{BBC_API_BASE}/groups/new/episodes",
            f"{BBC_API_BASE}/groups/new-on-iplayer/episodes",
            f"{BBC_API_BASE}/groups/added-recently/episodes",
            f"{BBC_API_BASE}/groups/just-added/episodes",
            f"{BBC_API_BASE}/groups/latest/episodes",
            # Editors' picks
            f"{BBC_API_BASE}/groups/editors-picks/episodes",
            f"{BBC_API_BASE}/groups/recommended/episodes",
            f"{BBC_API_BASE}/groups/must-see/episodes",
            # Per expirar aviat
            f"{BBC_API_BASE}/groups/last-chance/episodes",
            f"{BBC_API_BASE}/groups/leaving-soon/episodes",
            # Exclusius
            f"{BBC_API_BASE}/groups/exclusive/episodes",
            f"{BBC_API_BASE}/groups/iplayer-exclusive/episodes",
            f"{BBC_API_BASE}/groups/only-on-iplayer/episodes",
        ]

        for url in endpoints:
            logger.debug(f"Scanning BBC featured: {url}")
            data = await self._fetch_json(url)
            if not data:
                continue

            # Extreure programes de diferents formats de resposta
            for key in ["home_highlights", "group_episodes", "elements", "programmes", "episodes"]:
                container = data.get(key, {})
                if isinstance(container, dict):
                    elements = container.get("elements", [])
                elif isinstance(container, list):
                    elements = container
                else:
                    continue

                for item in elements:
                    prog = self._parse_programme(item)
                    if prog and prog.programme_id not in self._programs_cache:
                        programs.append(prog)
                        self._programs_cache[prog.programme_id] = prog

            await asyncio.sleep(0.2)

        logger.info(f"Featured scan found {len(programs)} programs")
        return programs

    async def scan_groups_api(self) -> List[BBCProgram]:
        """
        Escaneja grups i col·leccions especials de BBC iPlayer.
        """
        programs = []

        # Primer obtenim la llista de grups disponibles
        groups_url = f"{BBC_API_BASE}/groups"
        data = await self._fetch_json(groups_url)

        if data:
            groups_list = data.get("groups", {}).get("elements", [])
            for group in groups_list:
                group_id = group.get("id") or group.get("pid")
                if group_id:
                    # Escanejar cada grup
                    group_url = f"{BBC_API_BASE}/groups/{group_id}/episodes?per_page=200"
                    group_data = await self._fetch_json(group_url)

                    if group_data:
                        elements = group_data.get("group_episodes", {}).get("elements", [])
                        if not elements:
                            elements = group_data.get("elements", [])

                        for item in elements:
                            prog = self._parse_programme(item)
                            if prog and prog.programme_id not in self._programs_cache:
                                programs.append(prog)
                                self._programs_cache[prog.programme_id] = prog

                    await asyncio.sleep(0.2)

        logger.info(f"Groups scan found {len(programs)} programs")
        return programs

    async def scan_full_catalog(self, progress_callback=None) -> Dict[str, Any]:
        """
        Escaneja el catàleg complet de BBC iPlayer:
        0. JustWatch (catàleg complet amb TMDB IDs) (0-15%)
        1. Contingut destacat/popular/boxsets/nou (15-20%)
        2. Grups i col·leccions (20-25%)
        3. Totes les categories - 21 categories (25-45%)
        4. Tots els canals - BBC One, Two, etc. (45-55%)
        5. Tot l'abecedari A-Z amb web scraping (55-95%)

        Retorna un diccionari amb totes les pel·lícules i sèries trobades.
        """
        self._programs_cache = {}  # Reset cache
        self._justwatch_data = []  # Store JustWatch results with TMDB IDs

        # Fase 0: JustWatch (catàleg complet) (0-15%)
        if progress_callback:
            progress_callback("JustWatch: Getting complete BBC iPlayer catalog...", 0)

        try:
            jw_scanner = JustWatchBBCScanner()

            def jw_progress(msg, pct):
                if progress_callback:
                    progress_callback(msg, pct * 0.15)

            # Provar GraphQL primer (més robust)
            jw_titles = await jw_scanner.scan_via_graphql(jw_progress)

            # Si GraphQL falla, provar REST API
            if not jw_titles:
                jw_titles = await jw_scanner.scan_all_content(jw_progress)

            self._justwatch_data = jw_titles
            logger.info(f"JustWatch: Found {len(jw_titles)} titles with TMDB IDs")

            # Convertir JustWatch titles a BBCProgram (sense BBC PID però amb TMDB)
            for title in jw_titles:
                # Generar un ID temporal basat en JustWatch
                jw_id = str(title.get("justwatch_id", ""))
                if jw_id and title.get("title"):
                    # Crear programa amb les dades de JustWatch
                    prog = BBCProgram(
                        programme_id=f"jw_{jw_id}",  # Prefix per identificar origen
                        title=title.get("title"),
                        url="",  # No tenim URL de BBC encara
                        is_film=title.get("content_type") == "movie",
                        is_series=title.get("content_type") == "show",
                    )
                    self._programs_cache[prog.programme_id] = prog

            logger.info(f"After JustWatch: {len(self._programs_cache)} programs")
        except Exception as e:
            logger.warning(f"JustWatch scan failed (continuing with BBC sources): {e}")

        # Fase 1: Escanejar contingut destacat/popular/boxsets/nou (15-20%)
        if progress_callback:
            progress_callback("Scanning featured, boxsets, new content...", 15)
        await self.scan_featured_api()
        logger.info(f"After featured/boxsets: {len(self._programs_cache)} programs")

        # Fase 2: Escanejar grups i col·leccions (20-25%)
        if progress_callback:
            progress_callback("Scanning groups and collections...", 20)
        await self.scan_groups_api()
        logger.info(f"After groups: {len(self._programs_cache)} programs")

        # Fase 3: Escanejar totes les categories (25-45%)
        if progress_callback:
            progress_callback("Scanning all 21 categories...", 25)

        def category_progress(msg, pct):
            if progress_callback:
                # Map 0-100% to 25-45%
                progress_callback(msg, 25 + (pct * 0.20))

        await self.scan_all_categories(category_progress)
        logger.info(f"After categories: {len(self._programs_cache)} programs")

        # Fase 4: Escanejar tots els canals (45-55%)
        if progress_callback:
            progress_callback("Scanning all BBC channels...", 45)

        def channel_progress(msg, pct):
            if progress_callback:
                # Map 0-100% to 45-55%
                progress_callback(msg, 45 + (pct * 0.10))

        await self.scan_all_channels(channel_progress)
        logger.info(f"After channels: {len(self._programs_cache)} programs")

        # Fase 5: Escanejar A-Z complet amb web scraping (55-95%)
        if progress_callback:
            progress_callback("Scanning complete A-Z (API + Web scraping)...", 55)

        def az_progress(msg, pct):
            if progress_callback:
                # Map 0-100% to 55-95%
                progress_callback(msg, 55 + (pct * 0.40))

        await self.scan_all_az(az_progress)
        logger.info(f"After A-Z: {len(self._programs_cache)} programs")

        # Separar pel·lícules i sèries
        films = [p for p in self._programs_cache.values() if p.is_film]
        series = [p for p in self._programs_cache.values() if p.is_series]

        if progress_callback:
            progress_callback("Scan complete!", 100)

        logger.info(f"Full catalog scan complete: {len(films)} films, {len(series)} series, {len(self._programs_cache)} total")

        return {
            "status": "success",
            "scanned_at": datetime.utcnow().isoformat(),
            "total_programs": len(self._programs_cache),
            "films_count": len(films),
            "series_count": len(series),
            "films": [
                {
                    "programme_id": p.programme_id,
                    "title": p.title,
                    "url": p.url,
                    "synopsis": p.synopsis,
                    "thumbnail": p.thumbnail
                }
                for p in films
            ],
            "series": [
                {
                    "programme_id": p.programme_id,
                    "title": p.title,
                    "url": p.url,
                    "episodes_url": p.episodes_url,
                    "synopsis": p.synopsis,
                    "thumbnail": p.thumbnail
                }
                for p in series
            ]
        }


class BBCTMDBMatcher:
    """
    Fa matching entre programes de BBC iPlayer i TMDB.
    """

    def __init__(self, tmdb_api_key: str):
        self.tmdb_api_key = tmdb_api_key
        self.tmdb_base_url = "https://api.themoviedb.org/3"

    async def search_tmdb(
        self,
        title: str,
        content_type: str = "tv",  # "tv" o "movie"
        year: Optional[int] = None
    ) -> Optional[Dict]:
        """
        Cerca un títol a TMDB.
        """
        try:
            endpoint = "search/movie" if content_type == "movie" else "search/tv"
            params = {
                "api_key": self.tmdb_api_key,
                "query": title,
                "language": "en-GB"  # BBC és UK
            }
            if year:
                params["year" if content_type == "movie" else "first_air_date_year"] = year

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.tmdb_base_url}/{endpoint}",
                    params=params
                )

                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])

                    if results:
                        # Retornar el primer resultat (més rellevant)
                        logger.debug(f"TMDB match for '{title}': {results[0].get('name') or results[0].get('title')}")
                        return results[0]
                    else:
                        logger.debug(f"TMDB: No results for '{title}' ({content_type})")
                elif response.status_code == 401:
                    logger.error(f"TMDB API key invalid/unauthorized (401) for '{title}'")
                elif response.status_code == 429:
                    logger.warning(f"TMDB rate limited (429) for '{title}'")
                else:
                    logger.warning(f"TMDB API error {response.status_code} for '{title}': {response.text[:200]}")

            return None

        except Exception as e:
            logger.error(f"TMDB search error for '{title}': {e}")
            return None

    async def match_program(self, program: BBCProgram) -> Optional[Dict]:
        """
        Intenta trobar el match de TMDB per un programa de BBC.
        Utilitza múltiples estratègies de cerca per maximitzar matches.
        """
        content_type = "movie" if program.is_film else "tv"

        # Netejar el títol (treure coses com "Series 1", "Season 2", etc.)
        clean_title = re.sub(r'\s*[-:]\s*Series\s*\d+.*$', '', program.title, flags=re.I)
        clean_title = re.sub(r'\s*[-:]\s*Season\s*\d+.*$', '', clean_title, flags=re.I)
        clean_title = re.sub(r'\s*\([^)]+\)\s*$', '', clean_title)  # Treure (2024), (UK), etc.
        clean_title = clean_title.strip()

        # Estratègia 1: Cercar amb títol net
        result = await self.search_tmdb(clean_title, content_type)

        # Estratègia 2: Si no trobem, provar amb el tipus oposat
        if not result:
            alt_type = "movie" if content_type == "tv" else "tv"
            result = await self.search_tmdb(clean_title, alt_type)
            if result:
                content_type = alt_type

        # Estratègia 3: Treure prefixos comuns de BBC
        if not result:
            prefixes_to_remove = ["BBC ", "The ", "A ", "An "]
            for prefix in prefixes_to_remove:
                if clean_title.lower().startswith(prefix.lower()):
                    alt_title = clean_title[len(prefix):].strip()
                    result = await self.search_tmdb(alt_title, content_type)
                    if result:
                        break

        # Estratègia 4: Cercar només la primera part (abans de ":" o "-")
        if not result and (":" in clean_title or " - " in clean_title):
            first_part = re.split(r'\s*[:\-]\s*', clean_title)[0].strip()
            if len(first_part) > 3:
                result = await self.search_tmdb(first_part, content_type)

        if result:
            return {
                "tmdb_id": result.get("id"),
                "tmdb_title": result.get("title") or result.get("name"),
                "content_type": content_type,
                "original_title": result.get("original_title") or result.get("original_name"),
                "overview": result.get("overview"),
                "poster_path": result.get("poster_path"),
                "backdrop_path": result.get("backdrop_path"),
                "vote_average": result.get("vote_average"),
                "release_date": result.get("release_date") or result.get("first_air_date"),
                "confidence": self._calculate_confidence(program.title, result)
            }

        return None

    def _calculate_confidence(self, bbc_title: str, tmdb_result: Dict) -> float:
        """
        Calcula un score de confiança del match (0-100).
        Utilitza múltiples mètriques per una avaluació més precisa.
        """
        import unicodedata

        def normalize(text: str) -> str:
            """Normalitza text per comparació."""
            text = unicodedata.normalize('NFD', text)
            text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
            text = re.sub(r'[^\w\s]', ' ', text.lower())
            text = re.sub(r'\s+', ' ', text).strip()
            return text

        tmdb_title = tmdb_result.get("title") or tmdb_result.get("name") or ""
        tmdb_original = tmdb_result.get("original_title") or tmdb_result.get("original_name") or ""

        bbc_norm = normalize(bbc_title)
        tmdb_norm = normalize(tmdb_title)
        tmdb_orig_norm = normalize(tmdb_original)

        # Match exacte amb qualsevol variant
        if bbc_norm == tmdb_norm or bbc_norm == tmdb_orig_norm:
            return 100.0

        # Match parcial fort
        if bbc_norm in tmdb_norm or tmdb_norm in bbc_norm:
            return 85.0
        if bbc_norm in tmdb_orig_norm or tmdb_orig_norm in bbc_norm:
            return 85.0

        # Calcular similaritat per paraules (Jaccard index millorat)
        words_bbc = set(bbc_norm.split())
        words_tmdb = set(tmdb_norm.split())

        # Eliminar paraules comunes que no aporten
        stopwords = {'the', 'a', 'an', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'with', 'bbc'}
        words_bbc -= stopwords
        words_tmdb -= stopwords

        if not words_bbc or not words_tmdb:
            return 50.0

        common = len(words_bbc & words_tmdb)
        total = len(words_bbc | words_tmdb)

        if total > 0:
            jaccard = (common / total) * 100
            # Bonus si totes les paraules BBC estan a TMDB
            if words_bbc <= words_tmdb:
                jaccard = min(jaccard + 15, 95)
            return jaccard

        return 50.0  # Score per defecte

    async def match_all_programs(
        self,
        programs: List[BBCProgram],
        progress_callback=None,
        min_confidence: float = 60.0
    ) -> Dict[str, Any]:
        """
        Fa matching de tots els programes amb TMDB.
        """
        matched = []
        unmatched = []
        low_confidence = []

        # Log first 5 programs for debugging
        logger.info(f"Starting TMDB matching for {len(programs)} programs (min_confidence={min_confidence})")
        for p in programs[:5]:
            logger.info(f"  Sample program: '{p.title}' (id={p.programme_id}, film={p.is_film}, series={p.is_series})")

        for i, program in enumerate(programs):
            if progress_callback:
                progress_callback(
                    f"Matching: {program.title[:30]}...",
                    i / len(programs) * 100
                )

            result = await self.match_program(program)

            # Log progress every 50 programs
            if (i + 1) % 50 == 0:
                logger.info(f"TMDB matching progress: {i + 1}/{len(programs)} - matched={len(matched)}, unmatched={len(unmatched)}, low_conf={len(low_confidence)}")

            if result:
                match_data = {
                    "bbc_programme_id": program.programme_id,
                    "bbc_title": program.title,
                    "bbc_url": program.url,
                    "is_film": program.is_film,
                    "is_series": program.is_series,
                    **result
                }

                if result["confidence"] >= min_confidence:
                    matched.append(match_data)
                else:
                    low_confidence.append(match_data)
            else:
                unmatched.append({
                    "bbc_programme_id": program.programme_id,
                    "bbc_title": program.title,
                    "bbc_url": program.url,
                    "is_film": program.is_film,
                    "is_series": program.is_series
                })

            # Rate limiting per TMDB API
            await asyncio.sleep(0.25)

        if progress_callback:
            progress_callback("Matching complete!", 100)

        return {
            "status": "success",
            "total_programs": len(programs),
            "matched_count": len(matched),
            "unmatched_count": len(unmatched),
            "low_confidence_count": len(low_confidence),
            "matched": matched,
            "unmatched": unmatched,
            "low_confidence": low_confidence
        }
