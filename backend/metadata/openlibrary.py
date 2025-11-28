"""
Open Library API integration for fetching book metadata and covers.
No API key required.
"""
import httpx
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
import re


class OpenLibraryClient:
    BASE_URL = "https://openlibrary.org"
    COVERS_URL = "https://covers.openlibrary.org"

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        await self.client.aclose()

    def _clean_title(self, title: str) -> str:
        """Clean title for better search results."""
        # Remove common suffixes and clean up
        title = re.sub(r'\s*\([^)]*\)\s*$', '', title)  # Remove (year) etc
        title = re.sub(r'\s*-\s*.*$', '', title)  # Remove " - subtitle"
        title = re.sub(r'[_\-\.]+', ' ', title)  # Replace separators with spaces
        return title.strip()

    async def search_book(self, title: str, author: str = None) -> Optional[Dict[str, Any]]:
        """
        Search for a book by title and optionally author.
        Returns the best matching result.
        """
        clean_title = self._clean_title(title)
        query = clean_title
        if author:
            query = f"{clean_title} {author}"

        try:
            response = await self.client.get(
                f"{self.BASE_URL}/search.json",
                params={
                    "q": query,
                    "limit": 5,
                    "fields": "key,title,author_name,first_publish_year,cover_i,isbn,subject,description"
                }
            )
            response.raise_for_status()
            data = response.json()

            if data.get("numFound", 0) > 0 and data.get("docs"):
                # Return the first (best) match
                return data["docs"][0]

            # Try search without author if no results
            if author:
                return await self.search_book(title, None)

            return None

        except Exception as e:
            print(f"Error searching Open Library: {e}")
            return None

    async def get_cover_url(self, cover_id: int, size: str = "L") -> Optional[str]:
        """
        Get cover image URL.
        Size: S (small), M (medium), L (large)
        """
        if not cover_id:
            return None
        return f"{self.COVERS_URL}/b/id/{cover_id}-{size}.jpg"

    async def download_cover(self, cover_id: int, save_path: Path, size: str = "L") -> bool:
        """
        Download cover image and save to path.
        Returns True if successful.
        """
        url = await self.get_cover_url(cover_id, size)
        if not url:
            return False

        try:
            response = await self.client.get(url)
            response.raise_for_status()

            # Check if it's actually an image (not a placeholder)
            content_type = response.headers.get("content-type", "")
            if "image" not in content_type:
                return False

            # Check minimum size (placeholder images are very small)
            if len(response.content) < 1000:
                return False

            # Save the image
            save_path.parent.mkdir(parents=True, exist_ok=True)
            save_path.write_bytes(response.content)
            return True

        except Exception as e:
            print(f"Error downloading cover: {e}")
            return False

    async def fetch_book_metadata(self, title: str, author: str = None, save_cover_to: Path = None) -> Dict[str, Any]:
        """
        Fetch metadata for a book and optionally download its cover.
        Returns a dict with metadata.
        """
        result = {
            "found": False,
            "title": None,
            "author": None,
            "year": None,
            "cover_downloaded": False,
            "subjects": [],
            "description": None
        }

        book = await self.search_book(title, author)
        if not book:
            return result

        result["found"] = True
        result["title"] = book.get("title")
        result["author"] = book.get("author_name", [None])[0]
        result["year"] = book.get("first_publish_year")
        result["subjects"] = book.get("subject", [])[:5]  # First 5 subjects

        # Get description if available
        if book.get("description"):
            desc = book["description"]
            if isinstance(desc, dict):
                desc = desc.get("value", "")
            result["description"] = desc[:500] if desc else None

        # Download cover if requested and available
        cover_id = book.get("cover_i")
        if cover_id and save_cover_to:
            result["cover_downloaded"] = await self.download_cover(cover_id, save_cover_to)

        return result


async def fetch_metadata_for_book(title: str, author: str = None, cover_path: Path = None) -> Dict[str, Any]:
    """
    Convenience function to fetch metadata for a single book.
    """
    client = OpenLibraryClient()
    try:
        return await client.fetch_book_metadata(title, author, cover_path)
    finally:
        await client.close()


# Synchronous wrapper for use in non-async contexts
def fetch_metadata_for_book_sync(title: str, author: str = None, cover_path: Path = None) -> Dict[str, Any]:
    """Synchronous wrapper for fetch_metadata_for_book."""
    return asyncio.run(fetch_metadata_for_book(title, author, cover_path))
