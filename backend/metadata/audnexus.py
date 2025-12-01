"""
Audnexus API integration for fetching audiobook metadata.
Community API for Audible audiobook data - no API key required.
https://github.com/laxamentumtech/audnexus
"""
import asyncio
import json
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional, Dict, Any, List
import re


class AudnexusClient:
    BASE_URL = "https://api.audnex.us"

    def __init__(self, region: str = "us"):
        """
        Initialize client with region.
        Supported regions: us, uk, de, fr, it, es, jp, ca, au, in
        """
        self.region = region

    async def close(self):
        """No-op for compatibility"""
        pass

    def _clean_title(self, title: str) -> str:
        """Clean title for better search results."""
        title = re.sub(r'\s*\([^)]*\)\s*$', '', title)
        title = re.sub(r'\s*-\s*.*$', '', title)
        title = re.sub(r'[_\-\.]+', ' ', title)
        return title.strip()

    def _sync_search_audiobooks(self, title: str, author: str = None, limit: int = 10) -> List[Dict[str, Any]]:
        """Search for audiobooks by title and optionally author."""
        clean_title = self._clean_title(title)

        try:
            # Build search query
            params = {
                "name": clean_title,
                "region": self.region
            }
            if author:
                params["author"] = author

            query_string = urllib.parse.urlencode(params)
            url = f"{self.BASE_URL}/books?{query_string}"

            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')
            req.add_header('Accept', 'application/json')

            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))

            results = []
            items = data if isinstance(data, list) else data.get("books", [])

            for item in items[:limit]:
                results.append({
                    "asin": item.get("asin"),
                    "title": item.get("title"),
                    "authors": [a.get("name") for a in item.get("authors", [])],
                    "narrators": [n.get("name") for n in item.get("narrators", [])],
                    "duration_minutes": item.get("runtimeLengthMin"),
                    "release_date": item.get("releaseDate"),
                    "publisher": item.get("publisherName"),
                    "language": item.get("language"),
                    "image": item.get("image"),
                    "rating": item.get("rating"),
                    "summary": item.get("summary"),
                    "genres": [g.get("name") for g in item.get("genres", []) if g.get("name")],
                    "series": item.get("seriesPrimary", {}).get("name") if item.get("seriesPrimary") else None,
                    "series_position": item.get("seriesPrimary", {}).get("position") if item.get("seriesPrimary") else None
                })

            return results

        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            print(f"HTTP Error searching Audnexus: {e}")
            return []
        except Exception as e:
            print(f"Error searching Audnexus: {e}")
            return []

    async def search_audiobooks(self, title: str, author: str = None, limit: int = 10) -> List[Dict[str, Any]]:
        """Search for audiobooks returning multiple results."""
        return await asyncio.to_thread(self._sync_search_audiobooks, title, author, limit)

    def _sync_get_audiobook_by_asin(self, asin: str) -> Optional[Dict[str, Any]]:
        """Get audiobook details by ASIN (Amazon Standard Identification Number)."""
        try:
            url = f"{self.BASE_URL}/books/{asin}?region={self.region}"
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')
            req.add_header('Accept', 'application/json')

            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))

            return {
                "found": True,
                "asin": data.get("asin"),
                "title": data.get("title"),
                "subtitle": data.get("subtitle"),
                "authors": [{"name": a.get("name"), "asin": a.get("asin")} for a in data.get("authors", [])],
                "narrators": [{"name": n.get("name")} for n in data.get("narrators", [])],
                "duration_minutes": data.get("runtimeLengthMin"),
                "release_date": data.get("releaseDate"),
                "publisher": data.get("publisherName"),
                "language": data.get("language"),
                "image": data.get("image"),
                "rating": data.get("rating"),
                "num_ratings": data.get("ratingCount"),
                "summary": data.get("summary"),
                "description": data.get("description"),
                "genres": [{"name": g.get("name"), "type": g.get("type")} for g in data.get("genres", [])],
                "series": {
                    "name": data.get("seriesPrimary", {}).get("name"),
                    "position": data.get("seriesPrimary", {}).get("position"),
                    "asin": data.get("seriesPrimary", {}).get("asin")
                } if data.get("seriesPrimary") else None,
                "copyright": data.get("copyright"),
                "isbn": data.get("isbn"),
                "asin_url": f"https://www.audible.com/pd/{asin}"
            }

        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"HTTP Error getting audiobook by ASIN: {e}")
            return None
        except Exception as e:
            print(f"Error getting audiobook by ASIN: {e}")
            return None

    async def get_audiobook_by_asin(self, asin: str) -> Optional[Dict[str, Any]]:
        """Get audiobook information by ASIN."""
        return await asyncio.to_thread(self._sync_get_audiobook_by_asin, asin)

    def _sync_get_author(self, asin: str) -> Optional[Dict[str, Any]]:
        """Get author details by ASIN."""
        try:
            url = f"{self.BASE_URL}/authors/{asin}?region={self.region}"
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')
            req.add_header('Accept', 'application/json')

            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))

            return {
                "found": True,
                "asin": data.get("asin"),
                "name": data.get("name"),
                "description": data.get("description"),
                "image": data.get("image"),
                "genres": [g.get("name") for g in data.get("genres", []) if g.get("name")]
            }

        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"HTTP Error getting author: {e}")
            return None
        except Exception as e:
            print(f"Error getting author: {e}")
            return None

    async def get_author(self, asin: str) -> Optional[Dict[str, Any]]:
        """Get author information by ASIN."""
        return await asyncio.to_thread(self._sync_get_author, asin)

    def _sync_get_chapters(self, asin: str) -> Optional[List[Dict[str, Any]]]:
        """Get chapter information for an audiobook."""
        try:
            url = f"{self.BASE_URL}/books/{asin}/chapters?region={self.region}"
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')
            req.add_header('Accept', 'application/json')

            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))

            chapters = data.get("chapters", [])
            return [{
                "title": ch.get("title"),
                "start_offset_ms": ch.get("startOffsetMs"),
                "start_offset_sec": ch.get("startOffsetSec"),
                "length_ms": ch.get("lengthMs")
            } for ch in chapters]

        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"HTTP Error getting chapters: {e}")
            return None
        except Exception as e:
            print(f"Error getting chapters: {e}")
            return None

    async def get_chapters(self, asin: str) -> Optional[List[Dict[str, Any]]]:
        """Get chapter information for an audiobook."""
        return await asyncio.to_thread(self._sync_get_chapters, asin)

    def _sync_download_cover(self, image_url: str, save_path: Path) -> bool:
        """Download cover image."""
        if not image_url:
            return False

        try:
            req = urllib.request.Request(image_url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')

            with urllib.request.urlopen(req, timeout=30) as response:
                content_type = response.headers.get("content-type", "")
                if "image" not in content_type:
                    return False

                content = response.read()

                if len(content) < 1000:
                    return False

                save_path.parent.mkdir(parents=True, exist_ok=True)
                with open(save_path, 'wb') as f:
                    f.write(content)
                return True

        except Exception as e:
            print(f"Error downloading cover: {e}")
            return False

    async def download_cover(self, image_url: str, save_path: Path) -> bool:
        """Download cover image and save to path."""
        return await asyncio.to_thread(self._sync_download_cover, image_url, save_path)

    async def fetch_audiobook_metadata(self, title: str, author: str = None, save_cover_to: Path = None) -> Dict[str, Any]:
        """
        Fetch metadata for an audiobook and optionally download its cover.
        """
        result = {
            "found": False,
            "asin": None,
            "title": None,
            "authors": [],
            "narrators": [],
            "duration_minutes": None,
            "release_date": None,
            "publisher": None,
            "summary": None,
            "genres": [],
            "series": None,
            "cover_downloaded": False
        }

        # Search for the audiobook
        search_results = await self.search_audiobooks(title, author, limit=1)
        if not search_results:
            return result

        # Get first result and fetch full details
        first_result = search_results[0]
        asin = first_result.get("asin")

        if asin:
            details = await self.get_audiobook_by_asin(asin)
            if details and details.get("found"):
                result["found"] = True
                result["asin"] = asin
                result["title"] = details.get("title")
                result["authors"] = [a.get("name") for a in details.get("authors", [])]
                result["narrators"] = [n.get("name") for n in details.get("narrators", [])]
                result["duration_minutes"] = details.get("duration_minutes")
                result["release_date"] = details.get("release_date")
                result["publisher"] = details.get("publisher")
                result["summary"] = details.get("summary") or details.get("description")
                result["genres"] = [g.get("name") for g in details.get("genres", [])]
                result["series"] = details.get("series")
                result["rating"] = details.get("rating")
                result["language"] = details.get("language")

                # Download cover if requested
                if save_cover_to and details.get("image"):
                    result["cover_downloaded"] = await self.download_cover(
                        details["image"], save_cover_to
                    )

        return result


async def search_audiobooks(title: str, author: str = None, limit: int = 10, region: str = "us") -> List[Dict[str, Any]]:
    """
    Search for audiobooks and return multiple results.
    """
    client = AudnexusClient(region=region)
    try:
        return await client.search_audiobooks(title, author, limit)
    finally:
        await client.close()


async def fetch_audiobook_by_asin(asin: str, cover_path: Path = None, region: str = "us") -> Dict[str, Any]:
    """
    Fetch audiobook metadata by ASIN and optionally download cover.
    """
    client = AudnexusClient(region=region)
    try:
        result = {
            "found": False,
            "title": None,
            "authors": [],
            "narrators": [],
            "cover_downloaded": False
        }

        audiobook = await client.get_audiobook_by_asin(asin)
        if not audiobook or not audiobook.get("found"):
            return result

        result["found"] = True
        result["asin"] = asin
        result["title"] = audiobook.get("title")
        result["authors"] = [a.get("name") for a in audiobook.get("authors", [])]
        result["narrators"] = [n.get("name") for n in audiobook.get("narrators", [])]
        result["duration_minutes"] = audiobook.get("duration_minutes")
        result["release_date"] = audiobook.get("release_date")
        result["publisher"] = audiobook.get("publisher")
        result["summary"] = audiobook.get("summary")
        result["genres"] = [g.get("name") for g in audiobook.get("genres", [])]
        result["series"] = audiobook.get("series")
        result["rating"] = audiobook.get("rating")
        result["language"] = audiobook.get("language")

        if cover_path and audiobook.get("image"):
            result["cover_downloaded"] = await client.download_cover(
                audiobook["image"], cover_path
            )

        return result
    finally:
        await client.close()


async def fetch_audiobook_metadata(title: str, author: str = None, cover_path: Path = None, region: str = "us") -> Dict[str, Any]:
    """
    Convenience function to fetch metadata for an audiobook.
    """
    client = AudnexusClient(region=region)
    try:
        return await client.fetch_audiobook_metadata(title, author, cover_path)
    finally:
        await client.close()
