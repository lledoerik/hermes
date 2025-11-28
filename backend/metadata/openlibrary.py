"""
Open Library API integration for fetching book metadata and covers.
No API key required.
"""
import asyncio
import json
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional, Dict, Any, List
import re


class OpenLibraryClient:
    BASE_URL = "https://openlibrary.org"
    COVERS_URL = "https://covers.openlibrary.org"

    def __init__(self):
        pass

    async def close(self):
        """No-op for compatibility"""
        pass

    def _clean_title(self, title: str) -> str:
        """Clean title for better search results."""
        # Remove common suffixes and clean up
        title = re.sub(r'\s*\([^)]*\)\s*$', '', title)  # Remove (year) etc
        title = re.sub(r'\s*-\s*.*$', '', title)  # Remove " - subtitle"
        title = re.sub(r'[_\-\.]+', ' ', title)  # Replace separators with spaces
        return title.strip()

    def _sync_search_book(self, title: str, author: str = None) -> Optional[Dict[str, Any]]:
        """Synchronous search for a book."""
        clean_title = self._clean_title(title)
        query = clean_title
        if author:
            query = f"{clean_title} {author}"

        try:
            params = {
                "q": query,
                "limit": 5,
                "fields": "key,title,author_name,first_publish_year,cover_i,isbn,subject,description"
            }
            query_string = urllib.parse.urlencode(params)
            url = f"{self.BASE_URL}/search.json?{query_string}"

            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')

            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))

            if data.get("numFound", 0) > 0 and data.get("docs"):
                return data["docs"][0]

            return None

        except Exception as e:
            print(f"Error searching Open Library: {e}")
            return None

    async def search_book(self, title: str, author: str = None) -> Optional[Dict[str, Any]]:
        """
        Search for a book by title and optionally author.
        Returns the best matching result.
        """
        result = await asyncio.to_thread(self._sync_search_book, title, author)

        # Try search without author if no results
        if result is None and author:
            result = await asyncio.to_thread(self._sync_search_book, title, None)

        return result

    def _sync_search_books_multiple(self, title: str, author: str = None, limit: int = 10) -> List[Dict[str, Any]]:
        """Synchronous search returning multiple results."""
        clean_title = self._clean_title(title)
        query = clean_title
        if author:
            query = f"{clean_title} {author}"

        try:
            params = {
                "q": query,
                "limit": limit,
                "fields": "key,title,author_name,first_publish_year,cover_i,isbn,subject"
            }
            query_string = urllib.parse.urlencode(params)
            url = f"{self.BASE_URL}/search.json?{query_string}"

            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')

            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))

            results = []
            for doc in data.get("docs", []):
                results.append({
                    "key": doc.get("key", "").replace("/works/", ""),
                    "title": doc.get("title"),
                    "author": doc.get("author_name", [None])[0],
                    "year": doc.get("first_publish_year"),
                    "cover_id": doc.get("cover_i"),
                    "isbn": doc.get("isbn", [None])[0] if doc.get("isbn") else None
                })
            return results

        except Exception as e:
            print(f"Error searching Open Library: {e}")
            return []

    async def search_books_multiple(self, title: str, author: str = None, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search for books returning multiple results for user selection.
        """
        return await asyncio.to_thread(self._sync_search_books_multiple, title, author, limit)

    def _sync_get_book_by_isbn(self, isbn: str) -> Optional[Dict[str, Any]]:
        """Get book by ISBN synchronously."""
        # Clean ISBN (remove dashes and spaces)
        isbn = re.sub(r'[\s\-]', '', isbn)

        try:
            url = f"{self.BASE_URL}/isbn/{isbn}.json"
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')

            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))

            # Get work info for more details
            work_key = None
            if data.get("works"):
                work_key = data["works"][0].get("key")

            # Get cover
            cover_id = None
            if data.get("covers"):
                cover_id = data["covers"][0]

            result = {
                "found": True,
                "title": data.get("title"),
                "isbn": isbn,
                "cover_id": cover_id,
                "publishers": data.get("publishers", []),
                "publish_date": data.get("publish_date"),
                "number_of_pages": data.get("number_of_pages"),
                "work_key": work_key
            }

            # Try to get author info
            if data.get("authors"):
                author_key = data["authors"][0].get("key")
                if author_key:
                    try:
                        author_url = f"{self.BASE_URL}{author_key}.json"
                        author_req = urllib.request.Request(author_url)
                        author_req.add_header('User-Agent', 'Hermes Media Server/1.0')
                        with urllib.request.urlopen(author_req, timeout=30) as author_response:
                            author_data = json.loads(author_response.read().decode('utf-8'))
                            result["author"] = author_data.get("name")
                    except Exception:
                        pass

            return result

        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"HTTP Error getting book by ISBN: {e}")
            return None
        except Exception as e:
            print(f"Error getting book by ISBN: {e}")
            return None

    async def get_book_by_isbn(self, isbn: str) -> Optional[Dict[str, Any]]:
        """Get book information by ISBN."""
        return await asyncio.to_thread(self._sync_get_book_by_isbn, isbn)

    def _sync_get_book_by_olid(self, olid: str) -> Optional[Dict[str, Any]]:
        """Get book by Open Library Work ID synchronously."""
        # Clean OLID (remove /works/ prefix if present)
        olid = olid.replace("/works/", "").strip()

        try:
            url = f"{self.BASE_URL}/works/{olid}.json"
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')

            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))

            # Get cover
            cover_id = None
            if data.get("covers"):
                cover_id = data["covers"][0]

            # Get description
            description = None
            if data.get("description"):
                desc = data["description"]
                if isinstance(desc, dict):
                    description = desc.get("value", "")
                else:
                    description = desc

            result = {
                "found": True,
                "title": data.get("title"),
                "olid": olid,
                "cover_id": cover_id,
                "subjects": data.get("subjects", [])[:5],
                "description": description[:500] if description else None
            }

            # Try to get author info
            if data.get("authors"):
                author_ref = data["authors"][0]
                author_key = author_ref.get("author", {}).get("key") if isinstance(author_ref, dict) else None
                if author_key:
                    try:
                        author_url = f"{self.BASE_URL}{author_key}.json"
                        author_req = urllib.request.Request(author_url)
                        author_req.add_header('User-Agent', 'Hermes Media Server/1.0')
                        with urllib.request.urlopen(author_req, timeout=30) as author_response:
                            author_data = json.loads(author_response.read().decode('utf-8'))
                            result["author"] = author_data.get("name")
                    except Exception:
                        pass

            return result

        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"HTTP Error getting book by OLID: {e}")
            return None
        except Exception as e:
            print(f"Error getting book by OLID: {e}")
            return None

    async def get_book_by_olid(self, olid: str) -> Optional[Dict[str, Any]]:
        """Get book information by Open Library Work ID."""
        return await asyncio.to_thread(self._sync_get_book_by_olid, olid)

    def get_cover_url(self, cover_id: int, size: str = "L") -> Optional[str]:
        """
        Get cover image URL.
        Size: S (small), M (medium), L (large)
        """
        if not cover_id:
            return None
        return f"{self.COVERS_URL}/b/id/{cover_id}-{size}.jpg"

    def _sync_download_cover(self, cover_id: int, save_path: Path, size: str = "L") -> bool:
        """Download cover image synchronously."""
        url = self.get_cover_url(cover_id, size)
        if not url:
            return False

        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')

            with urllib.request.urlopen(req, timeout=30) as response:
                # Check if it's actually an image (not a placeholder)
                content_type = response.headers.get("content-type", "")
                if "image" not in content_type:
                    return False

                content = response.read()

                # Check minimum size (placeholder images are very small)
                if len(content) < 1000:
                    return False

                # Save the image
                save_path.parent.mkdir(parents=True, exist_ok=True)
                with open(save_path, 'wb') as f:
                    f.write(content)
                return True

        except Exception as e:
            print(f"Error downloading cover: {e}")
            return False

    async def download_cover(self, cover_id: int, save_path: Path, size: str = "L") -> bool:
        """
        Download cover image and save to path.
        Returns True if successful.
        """
        return await asyncio.to_thread(self._sync_download_cover, cover_id, save_path, size)

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


async def fetch_book_by_isbn(isbn: str, cover_path: Path = None) -> Dict[str, Any]:
    """
    Fetch book metadata by ISBN and optionally download cover.
    """
    client = OpenLibraryClient()
    try:
        result = {
            "found": False,
            "title": None,
            "author": None,
            "year": None,
            "cover_downloaded": False
        }

        book = await client.get_book_by_isbn(isbn)
        if not book or not book.get("found"):
            return result

        result["found"] = True
        result["title"] = book.get("title")
        result["author"] = book.get("author")
        result["year"] = book.get("publish_date")
        result["isbn"] = isbn

        # Download cover if requested
        if cover_path and book.get("cover_id"):
            result["cover_downloaded"] = await client.download_cover(book["cover_id"], cover_path)

        return result
    finally:
        await client.close()


async def fetch_book_by_olid(olid: str, cover_path: Path = None) -> Dict[str, Any]:
    """
    Fetch book metadata by Open Library Work ID and optionally download cover.
    """
    client = OpenLibraryClient()
    try:
        result = {
            "found": False,
            "title": None,
            "author": None,
            "description": None,
            "cover_downloaded": False
        }

        book = await client.get_book_by_olid(olid)
        if not book or not book.get("found"):
            return result

        result["found"] = True
        result["title"] = book.get("title")
        result["author"] = book.get("author")
        result["description"] = book.get("description")
        result["subjects"] = book.get("subjects", [])
        result["olid"] = olid

        # Download cover if requested
        if cover_path and book.get("cover_id"):
            result["cover_downloaded"] = await client.download_cover(book["cover_id"], cover_path)

        return result
    finally:
        await client.close()


async def search_books(title: str, author: str = None, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search for books and return multiple results.
    """
    client = OpenLibraryClient()
    try:
        return await client.search_books_multiple(title, author, limit)
    finally:
        await client.close()
