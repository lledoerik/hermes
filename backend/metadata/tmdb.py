"""
TMDB (The Movie Database) API integration for fetching movie/series metadata and posters.
Requires an API key from https://www.themoviedb.org/
"""
import asyncio
import json
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from typing import Optional, Dict, Any, List
import re

# Idiomes per ordre de preferència (català, espanyol, anglès)
LANGUAGE_FALLBACK = ["ca-ES", "es-ES", "en-US"]


def translate_to_catalan(text: str, source_lang: str = "auto") -> str:
    """Tradueix text al català utilitzant Google Translate (deep-translator)."""
    if not text or not text.strip():
        return text

    try:
        from deep_translator import GoogleTranslator
        # Detectar idioma font si és "auto"
        if source_lang == "auto" or source_lang.startswith("en"):
            source_lang = "en"
        elif source_lang.startswith("es"):
            source_lang = "es"
        else:
            source_lang = "auto"

        translator = GoogleTranslator(source=source_lang, target='ca')
        # deep-translator té un límit de 5000 caràcters
        if len(text) > 4500:
            text = text[:4500] + "..."
        return translator.translate(text)
    except ImportError:
        # Si no està instal·lat deep-translator, retornar el text original
        print("Avís: deep-translator no instal·lat. Executa: pip install deep-translator")
        return text
    except Exception as e:
        print(f"Error traduint: {e}")
        return text


class TMDBClient:
    BASE_URL = "https://api.themoviedb.org/3"
    IMAGE_BASE_URL = "https://image.tmdb.org/t/p"

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def close(self):
        """No-op for compatibility"""
        pass

    def _clean_title(self, title: str) -> str:
        """Clean title for better search results."""
        # Remove year in parentheses
        title = re.sub(r'\s*\(\d{4}\)\s*$', '', title)
        # Remove common suffixes
        title = re.sub(r'\s*-\s*(720p|1080p|4K|HDR|BluRay|WEB-DL|x264|x265).*$', '', title, flags=re.IGNORECASE)
        # Replace separators with spaces
        title = re.sub(r'[_\-\.]+', ' ', title)
        return title.strip()

    def _extract_year(self, title: str) -> Optional[int]:
        """Try to extract year from title."""
        match = re.search(r'\((\d{4})\)', title)
        if match:
            return int(match.group(1))
        return None

    def _sync_request(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Make a synchronous API request."""
        if params is None:
            params = {}
        params["api_key"] = self.api_key

        try:
            query_string = urllib.parse.urlencode(params)
            url = f"{self.BASE_URL}{endpoint}?{query_string}"

            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')

            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode('utf-8'))
        except Exception as e:
            print(f"TMDB API error: {e}")
            return None

    async def _request(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Make an async API request."""
        return await asyncio.to_thread(self._sync_request, endpoint, params)

    async def search_movie(self, title: str, year: int = None) -> Optional[Dict[str, Any]]:
        """Search for a movie by title."""
        clean_title = self._clean_title(title)
        extracted_year = year or self._extract_year(title)

        params = {"query": clean_title, "language": "ca-ES"}
        if extracted_year:
            params["year"] = extracted_year

        data = await self._request("/search/movie", params)
        if not data or not data.get("results"):
            # Try without year
            if extracted_year:
                params.pop("year", None)
                data = await self._request("/search/movie", params)

        if data and data.get("results"):
            return data["results"][0]
        return None

    async def search_tv(self, title: str, year: int = None) -> Optional[Dict[str, Any]]:
        """Search for a TV series by title."""
        clean_title = self._clean_title(title)
        extracted_year = year or self._extract_year(title)

        params = {"query": clean_title, "language": "ca-ES"}
        if extracted_year:
            params["first_air_date_year"] = extracted_year

        data = await self._request("/search/tv", params)
        if not data or not data.get("results"):
            # Try without year
            if extracted_year:
                params.pop("first_air_date_year", None)
                data = await self._request("/search/tv", params)

        if data and data.get("results"):
            return data["results"][0]
        return None

    async def get_movie_details(self, movie_id: int) -> Optional[Dict[str, Any]]:
        """Get detailed information about a movie with language fallback and translation."""
        result = None
        used_language = None

        # Provar cada idioma fins trobar contingut
        for lang in LANGUAGE_FALLBACK:
            data = await self._request(f"/movie/{movie_id}", {"language": lang})
            if data:
                # Si és el primer resultat o té overview (sinopsi), utilitzar-lo
                if not result or (data.get("overview") and not result.get("overview")):
                    result = data
                    used_language = lang
                    # Si tenim overview, no cal provar més idiomes
                    if data.get("overview"):
                        break

        # Si les dades no són en català, traduir
        if result and used_language and used_language != "ca-ES":
            if result.get("overview"):
                result["overview"] = await asyncio.to_thread(
                    translate_to_catalan, result["overview"], used_language
                )
            # Els gèneres es tradueixen automàticament per TMDB, però per si de cas
            # No traduïm el títol per mantenir coherència amb pòsters/cerca

        return result

    async def get_tv_details(self, tv_id: int) -> Optional[Dict[str, Any]]:
        """Get detailed information about a TV series with language fallback and translation."""
        result = None
        used_language = None

        # Provar cada idioma fins trobar contingut
        for lang in LANGUAGE_FALLBACK:
            data = await self._request(f"/tv/{tv_id}", {"language": lang})
            if data:
                # Si és el primer resultat o té overview (sinopsi), utilitzar-lo
                if not result or (data.get("overview") and not result.get("overview")):
                    result = data
                    used_language = lang
                    # Si tenim overview, no cal provar més idiomes
                    if data.get("overview"):
                        break

        # Si les dades no són en català, traduir
        if result and used_language and used_language != "ca-ES":
            if result.get("overview"):
                result["overview"] = await asyncio.to_thread(
                    translate_to_catalan, result["overview"], used_language
                )

        return result

    async def get_movie_credits(self, movie_id: int) -> Optional[Dict[str, Any]]:
        """Get cast and crew for a movie."""
        return await self._request(f"/movie/{movie_id}/credits")

    async def get_tv_credits(self, tv_id: int) -> Optional[Dict[str, Any]]:
        """Get cast and crew for a TV series."""
        # aggregate_credits gives us all cast across seasons
        data = await self._request(f"/tv/{tv_id}/aggregate_credits")
        if not data:
            # Fallback to regular credits
            data = await self._request(f"/tv/{tv_id}/credits")
        return data

    def get_poster_url(self, poster_path: str, size: str = "w500") -> Optional[str]:
        """
        Get poster image URL.
        Sizes: w92, w154, w185, w342, w500, w780, original
        """
        if not poster_path:
            return None
        return f"{self.IMAGE_BASE_URL}/{size}{poster_path}"

    def get_backdrop_url(self, backdrop_path: str, size: str = "w1280") -> Optional[str]:
        """
        Get backdrop image URL.
        Sizes: w300, w780, w1280, original
        """
        if not backdrop_path:
            return None
        return f"{self.IMAGE_BASE_URL}/{size}{backdrop_path}"

    def _sync_download_image(self, image_path: str, save_path: Path, size: str = "w500") -> bool:
        """Download an image synchronously."""
        if not image_path:
            return False

        url = f"{self.IMAGE_BASE_URL}/{size}{image_path}"

        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')

            with urllib.request.urlopen(req, timeout=30) as response:
                # Check if it's actually an image
                content_type = response.headers.get("content-type", "")
                if "image" not in content_type:
                    return False

                # Save the image
                save_path.parent.mkdir(parents=True, exist_ok=True)
                with open(save_path, 'wb') as f:
                    f.write(response.read())
                return True

        except Exception as e:
            print(f"Error downloading image: {e}")
            return False

    async def download_image(self, image_path: str, save_path: Path, size: str = "w500") -> bool:
        """Download an image and save to path."""
        return await asyncio.to_thread(self._sync_download_image, image_path, save_path, size)

    async def fetch_movie_metadata(self, title: str, year: int = None,
                                    poster_path: Path = None,
                                    backdrop_path: Path = None) -> Dict[str, Any]:
        """Fetch metadata for a movie and optionally download images."""
        result = {
            "found": False,
            "tmdb_id": None,
            "title": None,
            "original_title": None,
            "year": None,
            "overview": None,
            "tagline": None,
            "rating": None,
            "genres": [],
            "runtime": None,
            "director": None,
            "cast": [],
            "poster_downloaded": False,
            "backdrop_downloaded": False
        }

        movie = await self.search_movie(title, year)
        if not movie:
            return result

        # Get detailed info
        details = await self.get_movie_details(movie["id"])
        if details:
            movie = details

        result["found"] = True
        result["tmdb_id"] = movie.get("id")
        result["title"] = movie.get("title")
        result["original_title"] = movie.get("original_title")
        result["overview"] = movie.get("overview")
        result["tagline"] = movie.get("tagline")
        result["rating"] = movie.get("vote_average")
        result["runtime"] = movie.get("runtime")

        # Extract year from release date
        release_date = movie.get("release_date", "")
        if release_date:
            result["year"] = int(release_date[:4])

        # Extract genres
        if movie.get("genres"):
            result["genres"] = [g["name"] for g in movie["genres"]]

        # Get credits (director and cast)
        credits = await self.get_movie_credits(movie["id"])
        if credits:
            # Get director from crew
            for person in credits.get("crew", []):
                if person.get("job") == "Director":
                    result["director"] = person.get("name")
                    break
            # Get top cast (first 10)
            cast_list = credits.get("cast", [])[:10]
            result["cast"] = [
                {"name": c.get("name"), "character": c.get("character")}
                for c in cast_list
            ]

        # Download poster
        if poster_path and movie.get("poster_path"):
            result["poster_downloaded"] = await self.download_image(
                movie["poster_path"], poster_path, "w500"
            )

        # Download backdrop
        if backdrop_path and movie.get("backdrop_path"):
            result["backdrop_downloaded"] = await self.download_image(
                movie["backdrop_path"], backdrop_path, "w1280"
            )

        return result

    async def fetch_tv_metadata(self, title: str, year: int = None,
                                 poster_path: Path = None,
                                 backdrop_path: Path = None) -> Dict[str, Any]:
        """Fetch metadata for a TV series and optionally download images."""
        result = {
            "found": False,
            "tmdb_id": None,
            "title": None,
            "original_title": None,
            "year": None,
            "overview": None,
            "tagline": None,
            "rating": None,
            "genres": [],
            "seasons": None,
            "episodes": None,
            "creators": [],
            "cast": [],
            "poster_downloaded": False,
            "backdrop_downloaded": False
        }

        tv = await self.search_tv(title, year)
        if not tv:
            return result

        # Get detailed info
        details = await self.get_tv_details(tv["id"])
        if details:
            tv = details

        result["found"] = True
        result["tmdb_id"] = tv.get("id")
        result["title"] = tv.get("name")
        result["original_title"] = tv.get("original_name")
        result["overview"] = tv.get("overview")
        result["tagline"] = tv.get("tagline")
        result["rating"] = tv.get("vote_average")
        result["seasons"] = tv.get("number_of_seasons")
        result["episodes"] = tv.get("number_of_episodes")

        # Extract year from first air date
        first_air_date = tv.get("first_air_date", "")
        if first_air_date:
            result["year"] = int(first_air_date[:4])

        # Extract genres
        if tv.get("genres"):
            result["genres"] = [g["name"] for g in tv["genres"]]

        # Extract creators
        if tv.get("created_by"):
            result["creators"] = [c.get("name") for c in tv["created_by"]]

        # Get credits (cast)
        credits = await self.get_tv_credits(tv["id"])
        if credits:
            # Get top cast (first 10)
            cast_list = credits.get("cast", [])[:10]
            result["cast"] = [
                {
                    "name": c.get("name"),
                    "character": c.get("character") or (c.get("roles", [{}])[0].get("character") if c.get("roles") else None)
                }
                for c in cast_list
            ]

        # Download poster
        if poster_path and tv.get("poster_path"):
            result["poster_downloaded"] = await self.download_image(
                tv["poster_path"], poster_path, "w500"
            )

        # Download backdrop
        if backdrop_path and tv.get("backdrop_path"):
            result["backdrop_downloaded"] = await self.download_image(
                tv["backdrop_path"], backdrop_path, "w1280"
            )

        return result


async def fetch_movie_metadata(api_key: str, title: str, year: int = None,
                                poster_path: Path = None, backdrop_path: Path = None) -> Dict[str, Any]:
    """Convenience function to fetch metadata for a single movie."""
    client = TMDBClient(api_key)
    try:
        return await client.fetch_movie_metadata(title, year, poster_path, backdrop_path)
    finally:
        await client.close()


async def fetch_tv_metadata(api_key: str, title: str, year: int = None,
                             poster_path: Path = None, backdrop_path: Path = None) -> Dict[str, Any]:
    """Convenience function to fetch metadata for a single TV series."""
    client = TMDBClient(api_key)
    try:
        return await client.fetch_tv_metadata(title, year, poster_path, backdrop_path)
    finally:
        await client.close()


async def fetch_movie_by_tmdb_id(api_key: str, tmdb_id: int,
                                  poster_path: Path = None, backdrop_path: Path = None) -> Dict[str, Any]:
    """Fetch metadata for a movie using its TMDB ID directly."""
    client = TMDBClient(api_key)
    try:
        result = {
            "found": False,
            "tmdb_id": tmdb_id,
            "title": None,
            "original_title": None,
            "year": None,
            "overview": None,
            "tagline": None,
            "rating": None,
            "genres": [],
            "runtime": None,
            "director": None,
            "cast": [],
            "poster_downloaded": False,
            "backdrop_downloaded": False
        }

        movie = await client.get_movie_details(tmdb_id)
        if not movie:
            return result

        result["found"] = True
        result["title"] = movie.get("title")
        result["original_title"] = movie.get("original_title")
        result["overview"] = movie.get("overview")
        result["tagline"] = movie.get("tagline")
        result["rating"] = movie.get("vote_average")
        result["runtime"] = movie.get("runtime")

        release_date = movie.get("release_date", "")
        if release_date:
            result["year"] = int(release_date[:4])

        if movie.get("genres"):
            result["genres"] = [g["name"] for g in movie["genres"]]

        # Get credits (director and cast)
        credits = await client.get_movie_credits(tmdb_id)
        if credits:
            for person in credits.get("crew", []):
                if person.get("job") == "Director":
                    result["director"] = person.get("name")
                    break
            cast_list = credits.get("cast", [])[:10]
            result["cast"] = [
                {"name": c.get("name"), "character": c.get("character")}
                for c in cast_list
            ]

        if poster_path and movie.get("poster_path"):
            result["poster_downloaded"] = await client.download_image(
                movie["poster_path"], poster_path, "w500"
            )

        if backdrop_path and movie.get("backdrop_path"):
            result["backdrop_downloaded"] = await client.download_image(
                movie["backdrop_path"], backdrop_path, "w1280"
            )

        return result
    finally:
        await client.close()


async def fetch_tv_by_tmdb_id(api_key: str, tmdb_id: int,
                               poster_path: Path = None, backdrop_path: Path = None) -> Dict[str, Any]:
    """Fetch metadata for a TV series using its TMDB ID directly."""
    client = TMDBClient(api_key)
    try:
        result = {
            "found": False,
            "tmdb_id": tmdb_id,
            "title": None,
            "original_title": None,
            "year": None,
            "overview": None,
            "tagline": None,
            "rating": None,
            "genres": [],
            "seasons": None,
            "episodes": None,
            "creators": [],
            "cast": [],
            "poster_downloaded": False,
            "backdrop_downloaded": False
        }

        tv = await client.get_tv_details(tmdb_id)
        if not tv:
            return result

        result["found"] = True
        result["title"] = tv.get("name")
        result["original_title"] = tv.get("original_name")
        result["overview"] = tv.get("overview")
        result["tagline"] = tv.get("tagline")
        result["rating"] = tv.get("vote_average")
        result["seasons"] = tv.get("number_of_seasons")
        result["episodes"] = tv.get("number_of_episodes")

        first_air_date = tv.get("first_air_date", "")
        if first_air_date:
            result["year"] = int(first_air_date[:4])

        if tv.get("genres"):
            result["genres"] = [g["name"] for g in tv["genres"]]

        # Extract creators
        if tv.get("created_by"):
            result["creators"] = [c.get("name") for c in tv["created_by"]]

        # Get credits (cast)
        credits = await client.get_tv_credits(tmdb_id)
        if credits:
            cast_list = credits.get("cast", [])[:10]
            result["cast"] = [
                {
                    "name": c.get("name"),
                    "character": c.get("character") or (c.get("roles", [{}])[0].get("character") if c.get("roles") else None)
                }
                for c in cast_list
            ]

        if poster_path and tv.get("poster_path"):
            result["poster_downloaded"] = await client.download_image(
                tv["poster_path"], poster_path, "w500"
            )

        if backdrop_path and tv.get("backdrop_path"):
            result["backdrop_downloaded"] = await client.download_image(
                tv["backdrop_path"], backdrop_path, "w1280"
            )

        return result
    finally:
        await client.close()
