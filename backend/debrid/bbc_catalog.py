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
            logger.info(f"Scanning BBC A-Z API: {url}")

            data = await self._fetch_json(url)
            if not data:
                break

            # Extreure programes
            atoz_programmes = data.get("atoz_programmes", {})
            elements = atoz_programmes.get("elements", [])

            if not elements:
                elements = data.get("programmes", []) or data.get("elements", [])

            logger.info(f"Found {len(elements)} elements for letter {letter}, page {page}")

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

    async def scan_all_az(self, progress_callback=None) -> List[BBCProgram]:
        """
        Escaneja tot l'abecedari A-Z de BBC iPlayer.
        """
        all_programs = []
        letters = list("abcdefghijklmnopqrstuvwxyz") + ["0-9"]

        for i, letter in enumerate(letters):
            if progress_callback:
                progress_callback(f"Scanning A-Z: {letter.upper()}", i / len(letters) * 100)

            programs = await self.scan_az_api(letter)
            all_programs.extend(programs)
            await asyncio.sleep(0.5)

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
            f"{BBC_API_BASE}/home/highlights",
            f"{BBC_API_BASE}/groups/popular/episodes",
            f"{BBC_API_BASE}/groups/featured/episodes",
            f"{BBC_API_BASE}/groups/most-popular/episodes",
        ]

        for url in endpoints:
            logger.info(f"Scanning BBC featured: {url}")
            data = await self._fetch_json(url)
            if not data:
                continue

            # Extreure programes de diferents formats de resposta
            for key in ["home_highlights", "group_episodes", "elements", "programmes"]:
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

            await asyncio.sleep(0.3)

        return programs

    async def scan_full_catalog(self, progress_callback=None) -> Dict[str, Any]:
        """
        Escaneja el catàleg complet de BBC iPlayer:
        1. Contingut destacat/popular
        2. Totes les categories (21 categories)
        3. Tots els canals (BBC One, Two, etc.)
        4. Tot l'abecedari A-Z

        Retorna un diccionari amb totes les pel·lícules i sèries trobades.
        """
        self._programs_cache = {}  # Reset cache

        # Fase 1: Escanejar contingut destacat/popular (0-10%)
        if progress_callback:
            progress_callback("Scanning featured content...", 0)
        await self.scan_featured_api()
        logger.info(f"After featured: {len(self._programs_cache)} programs")

        # Fase 2: Escanejar totes les categories (10-40%)
        if progress_callback:
            progress_callback("Scanning all categories...", 10)

        def category_progress(msg, pct):
            if progress_callback:
                # Map 0-100% to 10-40%
                progress_callback(msg, 10 + (pct * 0.3))

        await self.scan_all_categories(category_progress)
        logger.info(f"After categories: {len(self._programs_cache)} programs")

        # Fase 3: Escanejar tots els canals (40-60%)
        if progress_callback:
            progress_callback("Scanning all channels...", 40)

        def channel_progress(msg, pct):
            if progress_callback:
                # Map 0-100% to 40-60%
                progress_callback(msg, 40 + (pct * 0.2))

        await self.scan_all_channels(channel_progress)
        logger.info(f"After channels: {len(self._programs_cache)} programs")

        # Fase 4: Escanejar A-Z complet (60-95%)
        if progress_callback:
            progress_callback("Scanning A-Z listing...", 60)

        def az_progress(msg, pct):
            if progress_callback:
                # Map 0-100% to 60-95%
                progress_callback(msg, 60 + (pct * 0.35))

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
                        return results[0]

            return None

        except Exception as e:
            logger.error(f"TMDB search error for '{title}': {e}")
            return None

    async def match_program(self, program: BBCProgram) -> Optional[Dict]:
        """
        Intenta trobar el match de TMDB per un programa de BBC.
        """
        content_type = "movie" if program.is_film else "tv"

        # Netejar el títol (treure coses com "Series 1", "Season 2", etc.)
        clean_title = re.sub(r'\s*[-:]\s*Series\s*\d+.*$', '', program.title, flags=re.I)
        clean_title = re.sub(r'\s*[-:]\s*Season\s*\d+.*$', '', clean_title, flags=re.I)
        clean_title = clean_title.strip()

        # Cercar a TMDB
        result = await self.search_tmdb(clean_title, content_type)

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
        """
        tmdb_title = (tmdb_result.get("title") or tmdb_result.get("name") or "").lower()
        bbc_lower = bbc_title.lower()

        # Match exacte
        if bbc_lower == tmdb_title:
            return 100.0

        # Match parcial
        if bbc_lower in tmdb_title or tmdb_title in bbc_lower:
            return 80.0

        # Calcular similaritat simple
        words_bbc = set(bbc_lower.split())
        words_tmdb = set(tmdb_title.split())
        common = len(words_bbc & words_tmdb)
        total = len(words_bbc | words_tmdb)

        if total > 0:
            return (common / total) * 100

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

        for i, program in enumerate(programs):
            if progress_callback:
                progress_callback(
                    f"Matching: {program.title[:30]}...",
                    i / len(programs) * 100
                )

            result = await self.match_program(program)

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
