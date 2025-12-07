"""
AniDB API integration for anime episode titles in multiple languages.
Uses the HTTP API for title data and XML dumps for episode info.
API: https://wiki.anidb.net/API
"""

import asyncio
import gzip
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from io import BytesIO
from pathlib import Path
from typing import Optional, Dict, Any, List
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)


class AniDBClient:
    """
    Client per a AniDB.

    AniDB té una API més restrictiva que altres serveis:
    - Rate limiting estricte (1 request/2 segons)
    - Requereix client ID per algunes operacions
    - El dump de títols es pot descarregar sense límits
    """

    # HTTP API URLs
    TITLES_DUMP_URL = "https://anidb.net/api/anime-titles.xml.gz"
    HTTP_API_URL = "https://api.anidb.net:9001/httpapi"

    # Client ID per l'API (cal registrar-se a AniDB)
    # https://anidb.net/perl-bin/animedb.pl?show=client
    CLIENT_NAME = "hermes"
    CLIENT_VERSION = 1

    # Rate limiting
    MIN_REQUEST_DELAY = 2.0  # 1 request cada 2 segons mínim

    def __init__(self, cache_dir: str = None):
        self._last_request_time = 0
        self.cache_dir = Path(cache_dir) if cache_dir else Path("/tmp/anidb_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._titles_cache = None
        self._titles_cache_time = 0

    def _rate_limit(self):
        """Aplica rate limiting"""
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self.MIN_REQUEST_DELAY:
            time.sleep(self.MIN_REQUEST_DELAY - elapsed)
        self._last_request_time = time.time()

    def _sync_request(self, url: str, is_gzip: bool = False) -> Optional[bytes]:
        """Fa una petició HTTP síncrona"""
        self._rate_limit()

        try:
            req = Request(
                url,
                headers={
                    "User-Agent": "Hermes Media Server/1.0",
                    "Accept-Encoding": "gzip" if is_gzip else "identity"
                }
            )

            with urlopen(req, timeout=30) as response:
                data = response.read()

                if is_gzip:
                    try:
                        data = gzip.decompress(data)
                    except Exception:
                        pass  # Potser no estava comprimit

                return data

        except (URLError, HTTPError) as e:
            logger.warning(f"AniDB request error: {e}")
            return None

    async def _request(self, url: str, is_gzip: bool = False) -> Optional[bytes]:
        """Fa una petició asíncrona"""
        return await asyncio.to_thread(self._sync_request, url, is_gzip)

    async def load_titles_dump(self, force_refresh: bool = False) -> Dict[int, Dict]:
        """
        Carrega el dump de títols d'AniDB.
        Es cacheja localment i es refresca cada 24h.

        Returns:
            Dict amb anime_id -> {titles: [...], type: str}
        """
        cache_file = self.cache_dir / "anime-titles.json"
        cache_max_age = 24 * 60 * 60  # 24 hores

        # Intentar carregar del cache
        if not force_refresh and cache_file.exists():
            try:
                cache_age = time.time() - cache_file.stat().st_mtime
                if cache_age < cache_max_age:
                    with open(cache_file, 'r', encoding='utf-8') as f:
                        self._titles_cache = json.load(f)
                        # Convertir claus a int
                        self._titles_cache = {
                            int(k): v for k, v in self._titles_cache.items()
                        }
                        logger.debug(f"AniDB titles loaded from cache ({len(self._titles_cache)} entries)")
                        return self._titles_cache
            except Exception as e:
                logger.warning(f"Error loading AniDB cache: {e}")

        # Descarregar dump
        logger.info("Downloading AniDB titles dump...")
        data = await self._request(self.TITLES_DUMP_URL, is_gzip=True)

        if not data:
            logger.error("Failed to download AniDB titles dump")
            return self._titles_cache or {}

        # Parsejar XML
        try:
            root = ET.fromstring(data.decode('utf-8'))
            titles_dict = {}

            for anime in root.findall('anime'):
                aid = int(anime.get('aid', 0))
                if not aid:
                    continue

                titles = []
                for title in anime.findall('title'):
                    titles.append({
                        'type': title.get('type'),  # main, official, syn, short
                        'lang': title.get('{http://www.w3.org/XML/1998/namespace}lang', 'x-jat'),
                        'title': title.text
                    })

                titles_dict[aid] = {
                    'titles': titles
                }

            self._titles_cache = titles_dict

            # Guardar a cache
            try:
                with open(cache_file, 'w', encoding='utf-8') as f:
                    json.dump(titles_dict, f, ensure_ascii=False)
                logger.info(f"AniDB titles cached ({len(titles_dict)} entries)")
            except Exception as e:
                logger.warning(f"Error saving AniDB cache: {e}")

            return titles_dict

        except ET.ParseError as e:
            logger.error(f"Error parsing AniDB XML: {e}")
            return self._titles_cache or {}

    async def search_anime(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Cerca anime per títol usant el dump de títols.

        Returns:
            Llista d'anime amb seus títols en diferents idiomes
        """
        titles = await self.load_titles_dump()
        if not titles:
            return []

        query_lower = query.lower().strip()
        results = []

        for aid, data in titles.items():
            best_score = 0
            main_title = None
            matched_title = None

            for t in data.get('titles', []):
                title_text = t.get('title', '')
                title_lower = title_text.lower()

                # Títol principal
                if t.get('type') == 'main':
                    main_title = title_text

                # Coincidència exacta
                if title_lower == query_lower:
                    best_score = 100
                    matched_title = title_text
                # Comença amb query
                elif title_lower.startswith(query_lower) and best_score < 90:
                    best_score = 90
                    matched_title = title_text
                # Conté query
                elif query_lower in title_lower and best_score < 70:
                    best_score = 70
                    matched_title = title_text

            if best_score > 0:
                # Obtenir títols per idioma
                title_by_lang = {}
                for t in data.get('titles', []):
                    lang = t.get('lang', '')
                    ttype = t.get('type', '')
                    if ttype in ('main', 'official') and lang not in title_by_lang:
                        title_by_lang[lang] = t.get('title')

                results.append({
                    'anidb_id': aid,
                    'title': main_title or matched_title,
                    'matched_title': matched_title,
                    'title_en': title_by_lang.get('en'),
                    'title_ja': title_by_lang.get('ja'),
                    'title_romaji': title_by_lang.get('x-jat'),  # Japonès romanitzat
                    'title_es': title_by_lang.get('es'),
                    'title_ca': title_by_lang.get('ca'),  # Si existeix!
                    'all_titles': title_by_lang,
                    'score': best_score
                })

        # Ordenar per puntuació i limitar
        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:limit]

    async def get_anime_titles(self, anidb_id: int) -> Optional[Dict[str, Any]]:
        """
        Obté tots els títols d'un anime per ID.

        Returns:
            Dict amb títols en diferents idiomes
        """
        titles = await self.load_titles_dump()
        data = titles.get(anidb_id)

        if not data:
            return None

        title_by_lang = {}
        main_title = None
        synonyms = []

        for t in data.get('titles', []):
            lang = t.get('lang', '')
            ttype = t.get('type', '')
            title_text = t.get('title', '')

            if ttype == 'main':
                main_title = title_text
            elif ttype == 'official':
                if lang not in title_by_lang:
                    title_by_lang[lang] = title_text
            elif ttype == 'syn':
                synonyms.append(title_text)

        return {
            'anidb_id': anidb_id,
            'main_title': main_title,
            'title_en': title_by_lang.get('en'),
            'title_ja': title_by_lang.get('ja'),
            'title_romaji': title_by_lang.get('x-jat'),
            'title_es': title_by_lang.get('es'),
            'title_ca': title_by_lang.get('ca'),
            'title_de': title_by_lang.get('de'),
            'title_fr': title_by_lang.get('fr'),
            'title_pt': title_by_lang.get('pt-br') or title_by_lang.get('pt'),
            'title_it': title_by_lang.get('it'),
            'title_zh': title_by_lang.get('zh-Hans') or title_by_lang.get('zh-Hant'),
            'title_ko': title_by_lang.get('ko'),
            'synonyms': synonyms,
            'all_titles': title_by_lang
        }

    async def get_anime_by_anilist_id(self, anilist_id: int) -> Optional[Dict[str, Any]]:
        """
        Busca un anime a AniDB per AniList ID.
        Nota: Això requereix una cerca o mapejat extern.
        """
        # AniDB no té mapejat directe a AniList
        # Caldria usar un servei com arm.haglund.dev o similar
        # Per ara, retornem None
        return None

    async def get_anime_by_mal_id(self, mal_id: int) -> Optional[int]:
        """
        Converteix MAL ID a AniDB ID.
        Nota: Requereix una base de dades de mapejat.
        """
        # Podríem usar arm.haglund.dev/api/ids?source=myanimelist&id=XXX
        # Per ara, retornem None
        return None


class AniDBMappingClient:
    """
    Client per obtenir mapejat entre IDs de diferents bases de dades d'anime.
    Usa arm.haglund.dev API.
    """

    API_URL = "https://arm.haglund.dev/api"

    async def _request(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Fa una petició a l'API de mapejat"""
        def sync_request():
            try:
                url = f"{self.API_URL}{endpoint}"
                if params:
                    query = "&".join(f"{k}={v}" for k, v in params.items())
                    url = f"{url}?{query}"

                req = Request(url, headers={"Accept": "application/json"})
                with urlopen(req, timeout=10) as response:
                    return json.loads(response.read().decode('utf-8'))

            except (URLError, HTTPError, json.JSONDecodeError) as e:
                logger.warning(f"Mapping API error: {e}")
                return None

        return await asyncio.to_thread(sync_request)

    async def get_ids(self, source: str, source_id: int) -> Optional[Dict[str, int]]:
        """
        Obté IDs de totes les bases de dades per un anime.

        Args:
            source: 'anilist', 'myanimelist', 'anidb', 'kitsu', 'thetvdb'
            source_id: ID a la base de dades font

        Returns:
            Dict amb anilist, myanimelist, anidb, kitsu, thetvdb IDs
        """
        data = await self._request("/ids", {"source": source, "id": source_id})
        if not data:
            return None

        return {
            "anilist": data.get("anilist"),
            "myanimelist": data.get("myanimelist"),
            "anidb": data.get("anidb"),
            "kitsu": data.get("kitsu"),
            "thetvdb": data.get("thetvdb")
        }

    async def anilist_to_anidb(self, anilist_id: int) -> Optional[int]:
        """Converteix AniList ID a AniDB ID"""
        ids = await self.get_ids("anilist", anilist_id)
        return ids.get("anidb") if ids else None

    async def mal_to_anidb(self, mal_id: int) -> Optional[int]:
        """Converteix MAL ID a AniDB ID"""
        ids = await self.get_ids("myanimelist", mal_id)
        return ids.get("anidb") if ids else None

    async def anidb_to_tvdb(self, anidb_id: int) -> Optional[int]:
        """Converteix AniDB ID a TVDB ID (útil per Fanart.tv)"""
        ids = await self.get_ids("anidb", anidb_id)
        return ids.get("thetvdb") if ids else None


# Funcions d'utilitat per ús directe

async def search_anime(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Cerca ràpida d'anime per títol"""
    client = AniDBClient()
    return await client.search_anime(query, limit)


async def get_anime_titles(anidb_id: int) -> Optional[Dict[str, Any]]:
    """Obté títols d'un anime en tots els idiomes disponibles"""
    client = AniDBClient()
    return await client.get_anime_titles(anidb_id)


async def get_catalan_title(anidb_id: int) -> Optional[str]:
    """Obté el títol en català d'un anime si existeix"""
    titles = await get_anime_titles(anidb_id)
    if titles:
        return titles.get("title_ca")
    return None


async def convert_anilist_to_anidb(anilist_id: int) -> Optional[int]:
    """Converteix AniList ID a AniDB ID"""
    mapper = AniDBMappingClient()
    return await mapper.anilist_to_anidb(anilist_id)


async def convert_mal_to_anidb(mal_id: int) -> Optional[int]:
    """Converteix MAL ID a AniDB ID"""
    mapper = AniDBMappingClient()
    return await mapper.mal_to_anidb(mal_id)


async def get_all_anime_ids(source: str, source_id: int) -> Optional[Dict[str, int]]:
    """Obté IDs de totes les bases de dades d'anime"""
    mapper = AniDBMappingClient()
    return await mapper.get_ids(source, source_id)
