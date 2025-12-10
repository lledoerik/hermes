"""
BBC iPlayer Catalog Scanner

Escaneja el catàleg complet de BBC iPlayer i fa matching amb TMDB
per crear el mapping automàticament.

Categories principals de BBC iPlayer:
- Films (pel·lícules)
- Drama
- Comedy
- Entertainment
- Documentaries
- etc.
"""

import asyncio
import logging
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# URLs de categories de BBC iPlayer
BBC_IPLAYER_BASE = "https://www.bbc.co.uk/iplayer"
BBC_CATEGORIES = {
    "films": f"{BBC_IPLAYER_BASE}/categories/films/featured",
    "films_all": f"{BBC_IPLAYER_BASE}/categories/films/all",
    "drama": f"{BBC_IPLAYER_BASE}/categories/drama-and-soaps/featured",
    "drama_all": f"{BBC_IPLAYER_BASE}/categories/drama-and-soaps/all",
    "comedy": f"{BBC_IPLAYER_BASE}/categories/comedy/featured",
    "comedy_all": f"{BBC_IPLAYER_BASE}/categories/comedy/all",
    "entertainment": f"{BBC_IPLAYER_BASE}/categories/entertainment/featured",
    "documentary": f"{BBC_IPLAYER_BASE}/categories/documentaries/featured",
    "documentary_all": f"{BBC_IPLAYER_BASE}/categories/documentaries/all",
    "lifestyle": f"{BBC_IPLAYER_BASE}/categories/lifestyle/featured",
    "music": f"{BBC_IPLAYER_BASE}/categories/music/featured",
    "news": f"{BBC_IPLAYER_BASE}/categories/news/featured",
    "science": f"{BBC_IPLAYER_BASE}/categories/science-and-nature/featured",
    "sport": f"{BBC_IPLAYER_BASE}/categories/sport/featured",
    "children": f"{BBC_IPLAYER_BASE}/categories/cbbc/featured",
    "cbeebies": f"{BBC_IPLAYER_BASE}/categories/cbeebies/featured",
    "signed": f"{BBC_IPLAYER_BASE}/categories/signed/featured",
    "audio_described": f"{BBC_IPLAYER_BASE}/categories/audio-described/featured",
}

# A-Z listing URLs
BBC_AZ_BASE = f"{BBC_IPLAYER_BASE}/a-z"


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
    episodes_url: Optional[str] = None  # URL per obtenir episodis (si és sèrie)


class BBCCatalogScanner:
    """
    Escaneja el catàleg de BBC iPlayer per descobrir tot el contingut disponible.
    """

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-GB,en;q=0.5",
        }
        self._programs_cache: Dict[str, BBCProgram] = {}

    async def _fetch_page(self, url: str) -> Optional[str]:
        """Fetch a page from BBC iPlayer"""
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url, headers=self.headers)
                if response.status_code == 200:
                    return response.text
                else:
                    logger.warning(f"BBC returned {response.status_code} for {url}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None

    def _extract_programs_from_html(self, html: str, is_film_category: bool = False) -> List[BBCProgram]:
        """
        Extreu programes d'una pàgina HTML de BBC iPlayer.
        """
        programs = []
        soup = BeautifulSoup(html, 'html.parser')

        # BBC utilitza diverses estructures, intentem trobar-les totes

        # Patró 1: Cards de programes
        cards = soup.find_all('div', {'class': re.compile(r'content-item|programme|card', re.I)})

        for card in cards:
            try:
                # Buscar link al programa
                link = card.find('a', href=re.compile(r'/iplayer/(episode|episodes)/'))
                if not link:
                    continue

                href = link.get('href', '')

                # Extreure programme_id
                match = re.search(r'/iplayer/(?:episode|episodes)/([a-z0-9]+)', href)
                if not match:
                    continue

                programme_id = match.group(1)

                # Evitar duplicats
                if programme_id in self._programs_cache:
                    continue

                # Extreure títol
                title_elem = card.find(['h2', 'h3', 'p', 'span'], {'class': re.compile(r'title|heading|name', re.I)})
                title = title_elem.get_text(strip=True) if title_elem else link.get_text(strip=True)

                if not title or len(title) < 2:
                    continue

                # Determinar si és episodi (sèrie) o pel·lícula
                is_episode = '/episode/' in href
                is_episodes = '/episodes/' in href

                # Extreure sinopsi
                synopsis_elem = card.find(['p', 'span'], {'class': re.compile(r'synopsis|description|subtitle', re.I)})
                synopsis = synopsis_elem.get_text(strip=True) if synopsis_elem else None

                # Extreure thumbnail
                img = card.find('img')
                thumbnail = img.get('src') or img.get('data-src') if img else None

                # Construir URL completa
                full_url = f"https://www.bbc.co.uk{href}" if href.startswith('/') else href

                program = BBCProgram(
                    programme_id=programme_id,
                    title=title,
                    url=full_url,
                    is_film=is_film_category or (is_episode and not is_episodes),
                    is_series=is_episodes or (not is_film_category and not is_episode),
                    synopsis=synopsis,
                    thumbnail=thumbnail,
                    episodes_url=full_url if is_episodes else None
                )

                programs.append(program)
                self._programs_cache[programme_id] = program

            except Exception as e:
                logger.debug(f"Error parsing card: {e}")
                continue

        return programs

    async def scan_category(self, category_url: str, is_film: bool = False) -> List[BBCProgram]:
        """
        Escaneja una categoria de BBC iPlayer.
        """
        logger.info(f"Scanning BBC category: {category_url}")

        html = await self._fetch_page(category_url)
        if not html:
            return []

        programs = self._extract_programs_from_html(html, is_film_category=is_film)
        logger.info(f"Found {len(programs)} programs in category")

        return programs

    async def scan_az_letter(self, letter: str) -> List[BBCProgram]:
        """
        Escaneja una lletra del llistat A-Z de BBC iPlayer.
        """
        url = f"{BBC_AZ_BASE}/{letter.lower()}"
        logger.info(f"Scanning BBC A-Z: {letter}")

        html = await self._fetch_page(url)
        if not html:
            return []

        programs = self._extract_programs_from_html(html)
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

            programs = await self.scan_az_letter(letter)
            all_programs.extend(programs)

            # Petit delay per no sobrecarregar BBC
            await asyncio.sleep(0.5)

        return all_programs

    async def scan_all_categories(self, progress_callback=None) -> List[BBCProgram]:
        """
        Escaneja totes les categories de BBC iPlayer.
        """
        all_programs = []
        categories = list(BBC_CATEGORIES.items())

        for i, (name, url) in enumerate(categories):
            if progress_callback:
                progress_callback(f"Scanning category: {name}", i / len(categories) * 100)

            is_film = 'film' in name.lower()
            programs = await self.scan_category(url, is_film=is_film)
            all_programs.extend(programs)

            # Petit delay per no sobrecarregar BBC
            await asyncio.sleep(0.5)

        return all_programs

    async def scan_full_catalog(self, progress_callback=None) -> Dict[str, Any]:
        """
        Escaneja el catàleg complet de BBC iPlayer:
        1. Totes les categories
        2. Tot l'abecedari A-Z

        Retorna un diccionari amb totes les pel·lícules i sèries trobades.
        """
        self._programs_cache = {}  # Reset cache

        # Escanejar categories
        if progress_callback:
            progress_callback("Scanning categories...", 0)

        await self.scan_all_categories(progress_callback)

        # Escanejar A-Z
        if progress_callback:
            progress_callback("Scanning A-Z listing...", 50)

        await self.scan_all_az(progress_callback)

        # Separar pel·lícules i sèries
        films = [p for p in self._programs_cache.values() if p.is_film]
        series = [p for p in self._programs_cache.values() if p.is_series]

        if progress_callback:
            progress_callback("Scan complete!", 100)

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
