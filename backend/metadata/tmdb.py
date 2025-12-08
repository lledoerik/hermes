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

# Idiomes per ordre de preferència (català, anglès)
LANGUAGE_FALLBACK = ["ca-ES", "en-US"]


def contains_non_latin_characters(text: str) -> bool:
    """
    Detecta si un text conté caràcters no-llatins (japonès, xinès, coreà, rus, àrab, etc.).
    Retorna True si el text conté caràcters fora de l'alfabet llatí estès.
    """
    if not text:
        return False

    # Rang de caràcters llatins estesos (inclou accents, ñ, ç, etc.)
    # Latin: U+0000-U+024F, Latin Extended: U+1E00-U+1EFF
    # També permetem números, puntuació bàsica i espais
    for char in text:
        code = ord(char)
        # Permetre: ASCII bàsic, Latin-1 Supplement, Latin Extended-A/B, Latin Extended Additional
        # i caràcters de puntuació/números comuns
        if not (
            (0x0000 <= code <= 0x024F) or  # Basic Latin + Latin Extended A/B
            (0x1E00 <= code <= 0x1EFF) or  # Latin Extended Additional
            (0x2000 <= code <= 0x206F) or  # General Punctuation
            (0x20A0 <= code <= 0x20CF) or  # Currency Symbols
            char in ' \t\n\r'
        ):
            return True
    return False


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


def translate_batch_to_catalan(texts: list, source_lang: str = "auto") -> list:
    """
    Tradueix múltiples textos al català d'un sol cop (MOLT més ràpid).
    Utilitza un separador únic per combinar i després separar.
    """
    if not texts:
        return texts

    # Filtrar textos buits i guardar els índexs originals
    valid_indices = []
    valid_texts = []
    for i, text in enumerate(texts):
        if text and text.strip():
            valid_indices.append(i)
            valid_texts.append(text.strip())

    if not valid_texts:
        return texts

    try:
        from deep_translator import GoogleTranslator

        # Detectar idioma font
        if source_lang == "auto" or source_lang.startswith("en"):
            source_lang = "en"
        elif source_lang.startswith("es"):
            source_lang = "es"
        else:
            source_lang = "auto"

        translator = GoogleTranslator(source=source_lang, target='ca')

        # Separador únic que no apareix en text normal
        SEPARATOR = " ||| "

        # Combinar tots els textos
        combined = SEPARATOR.join(valid_texts)

        # Si és massa llarg, dividir en chunks
        MAX_CHARS = 4500
        if len(combined) <= MAX_CHARS:
            # Traduir tot d'un sol cop
            translated_combined = translator.translate(combined)
            translated_texts = translated_combined.split(SEPARATOR)
        else:
            # Dividir en chunks i traduir per separat
            translated_texts = []
            current_chunk = []
            current_length = 0

            for text in valid_texts:
                text_length = len(text) + len(SEPARATOR)
                if current_length + text_length > MAX_CHARS and current_chunk:
                    # Traduir chunk actual
                    chunk_combined = SEPARATOR.join(current_chunk)
                    chunk_translated = translator.translate(chunk_combined)
                    translated_texts.extend(chunk_translated.split(SEPARATOR))
                    current_chunk = [text]
                    current_length = text_length
                else:
                    current_chunk.append(text)
                    current_length += text_length

            # Traduir últim chunk
            if current_chunk:
                chunk_combined = SEPARATOR.join(current_chunk)
                chunk_translated = translator.translate(chunk_combined)
                translated_texts.extend(chunk_translated.split(SEPARATOR))

        # Reconstruir la llista original amb els textos traduïts
        result = list(texts)  # Copiar original
        for i, idx in enumerate(valid_indices):
            if i < len(translated_texts):
                result[idx] = translated_texts[i].strip()

        return result

    except ImportError:
        print("Avís: deep-translator no instal·lat")
        return texts
    except Exception as e:
        print(f"Error traduint batch: {e}")
        return texts


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

    async def get_movie_watch_providers(self, movie_id: int, country: str = "ES") -> Optional[Dict[str, Any]]:
        """Get watch providers (streaming services) for a movie."""
        data = await self._request(f"/movie/{movie_id}/watch/providers")
        if data and data.get("results"):
            return data["results"].get(country)
        return None

    async def get_tv_watch_providers(self, tv_id: int, country: str = "ES") -> Optional[Dict[str, Any]]:
        """Get watch providers (streaming services) for a TV series."""
        data = await self._request(f"/tv/{tv_id}/watch/providers")
        if data and data.get("results"):
            return data["results"].get(country)
        return None

    async def get_tv_seasons(self, tv_id: int) -> List[Dict[str, Any]]:
        """Get all seasons for a TV series from TMDB."""
        # First get TV details which includes seasons list
        result = []
        for lang in LANGUAGE_FALLBACK:
            data = await self._request(f"/tv/{tv_id}", {"language": lang})
            if data and data.get("seasons"):
                for season in data["seasons"]:
                    result.append({
                        "season_number": season.get("season_number"),
                        "name": season.get("name"),
                        "episode_count": season.get("episode_count"),
                        "air_date": season.get("air_date"),
                        "overview": season.get("overview", ""),
                        "poster_path": season.get("poster_path")
                    })
                break
        return result

    async def get_tv_season_details(self, tv_id: int, season_number: int) -> Optional[Dict[str, Any]]:
        """Get detailed information about a specific season including all episodes."""
        result = None
        used_language = None

        for lang in LANGUAGE_FALLBACK:
            data = await self._request(f"/tv/{tv_id}/season/{season_number}", {"language": lang})
            if data:
                if not result or (data.get("overview") and not result.get("overview")):
                    result = data
                    used_language = lang
                    # Comprovar si els episodis tenen overview
                    episodes_with_overview = sum(1 for ep in data.get("episodes", []) if ep.get("overview"))
                    total_episodes = len(data.get("episodes", []))
                    print(f"[TMDB] Temporada {season_number} en {lang}: {episodes_with_overview}/{total_episodes} episodis amb descripció")
                    if episodes_with_overview > 0:
                        break  # Tenim contingut, no cal provar més idiomes

        # Translate overview if not in Catalan
        if result and used_language:
            if used_language == "ca-ES":
                print(f"[TMDB] Contingut en CATALÀ - No cal traduir!")
            else:
                print(f"[TMDB] Idioma final: {used_language} - Traduint al català...")

        if result and used_language and used_language != "ca-ES":
            # Collect all texts to translate in a single batch (MUCH faster!)
            texts_to_translate = []
            text_indices = []  # Track where each text goes

            # Season overview
            if result.get("overview"):
                texts_to_translate.append(result["overview"])
                text_indices.append(("season_overview", None))

            # Episode names and overviews - collect all at once
            if result.get("episodes"):
                for i, episode in enumerate(result["episodes"]):
                    if episode.get("name"):
                        texts_to_translate.append(episode["name"])
                        text_indices.append(("episode_name", i))
                    if episode.get("overview"):
                        texts_to_translate.append(episode["overview"])
                        text_indices.append(("episode_overview", i))

            # Translate all texts in one batch call (1-2 API calls instead of 24+)
            if texts_to_translate:
                translated = await asyncio.to_thread(
                    translate_batch_to_catalan, texts_to_translate, used_language
                )

                # Apply translations back to the correct places
                for idx, (text_type, episode_idx) in enumerate(text_indices):
                    if idx < len(translated):
                        if text_type == "season_overview":
                            result["overview"] = translated[idx]
                        elif text_type == "episode_name" and episode_idx is not None:
                            result["episodes"][episode_idx]["name"] = translated[idx]
                        elif text_type == "episode_overview" and episode_idx is not None:
                            result["episodes"][episode_idx]["overview"] = translated[idx]

        return result

    def _detect_content_type(self, media_type: str, genre_ids: List[int],
                             original_language: str, origin_countries: List[str]) -> str:
        """
        Detect content type based on genres and origin.
        - Animation (genre 16) from Japan -> anime/anime_movie
        - Animation (genre 16) not from Japan -> toons/animated
        - Otherwise -> series/movie
        """
        ANIMATION_GENRE_ID = 16

        is_animation = ANIMATION_GENRE_ID in genre_ids
        is_japanese = (
            original_language == "ja" or
            "JP" in (origin_countries or [])
        )

        if media_type == "movie":
            if is_animation:
                return "anime_movie" if is_japanese else "animated"
            return "movie"
        else:  # series
            if is_animation:
                return "anime" if is_japanese else "toons"
            return "series"

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

    async def get_movies_now_playing(self, region: str = "ES") -> List[int]:
        """Get list of TMDB IDs for movies currently in theaters."""
        tmdb_ids = []
        # Fetch up to 3 pages (60 movies) to get a good coverage
        for page in range(1, 4):
            data = await self._request("/movie/now_playing", {"region": region, "page": page})
            if data and data.get("results"):
                for movie in data["results"]:
                    tmdb_ids.append(movie["id"])
            else:
                break
        return tmdb_ids

    async def get_tv_on_the_air(self) -> List[int]:
        """Get list of TMDB IDs for TV series currently on the air."""
        tmdb_ids = []
        for page in range(1, 4):
            data = await self._request("/tv/on_the_air", {"page": page})
            if data and data.get("results"):
                for tv in data["results"]:
                    tmdb_ids.append(tv["id"])
            else:
                break
        return tmdb_ids

    async def get_tv_airing_today(self) -> List[int]:
        """Get list of TMDB IDs for TV series airing today."""
        tmdb_ids = []
        for page in range(1, 4):
            data = await self._request("/tv/airing_today", {"page": page})
            if data and data.get("results"):
                for tv in data["results"]:
                    tmdb_ids.append(tv["id"])
            else:
                break
        return tmdb_ids

    async def get_external_ids(self, media_type: str, tmdb_id: int) -> Optional[Dict[str, Any]]:
        """
        Get external IDs (IMDB, TVDB, etc.) for a movie or TV series.
        media_type: 'movie' or 'tv'
        """
        endpoint = f"/{media_type}/{tmdb_id}/external_ids"
        return await self._request(endpoint)

    async def get_imdb_id(self, media_type: str, tmdb_id: int) -> Optional[str]:
        """Get IMDB ID for a movie or TV series."""
        data = await self.get_external_ids(media_type, tmdb_id)
        if data:
            return data.get("imdb_id")
        return None

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
        result["title_english"] = None  # Es pot omplir més avall

        # Si el títol conté caràcters no-llatins (japonès, coreà, xinès, rus, etc.),
        # obtenir el títol anglès com a alternativa cercable
        if contains_non_latin_characters(result["title"]):
            english_data = await self._request(f"/movie/{movie['id']}", {"language": "en-US"})
            if english_data and english_data.get("title"):
                english_title = english_data["title"]
                # Si el títol anglès és diferent i no conté caràcters no-llatins
                if english_title != result["title"] and not contains_non_latin_characters(english_title):
                    result["title_english"] = english_title
                    # Usar el títol anglès com a títol principal per millor UX
                    result["title"] = english_title

        result["overview"] = movie.get("overview")
        result["tagline"] = movie.get("tagline")
        result["rating"] = movie.get("vote_average")
        result["runtime"] = movie.get("runtime")
        result["original_language"] = movie.get("original_language")
        result["origin_country"] = movie.get("origin_country", [])
        # For movies, production_countries is more reliable
        if movie.get("production_countries"):
            result["origin_country"] = [c.get("iso_3166_1") for c in movie["production_countries"]]

        # Extract year from release date
        release_date = movie.get("release_date", "")
        if release_date:
            result["year"] = int(release_date[:4])
            result["release_date"] = release_date

        # Extract genres and genre IDs for content type detection
        genre_ids = []
        if movie.get("genres"):
            result["genres"] = [g["name"] for g in movie["genres"]]
            genre_ids = [g["id"] for g in movie["genres"]]

        # Detect content type (movie, anime_movie, animated)
        result["content_type"] = self._detect_content_type(
            "movie", genre_ids, result["original_language"], result["origin_country"]
        )

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
        result["title_english"] = None  # Es pot omplir més avall

        # Si el títol conté caràcters no-llatins (japonès, coreà, xinès, rus, etc.),
        # obtenir el títol anglès com a alternativa cercable
        if contains_non_latin_characters(result["title"]):
            english_data = await self._request(f"/tv/{tv['id']}", {"language": "en-US"})
            if english_data and english_data.get("name"):
                english_title = english_data["name"]
                # Si el títol anglès és diferent i no conté caràcters no-llatins
                if english_title != result["title"] and not contains_non_latin_characters(english_title):
                    result["title_english"] = english_title
                    # Usar el títol anglès com a títol principal per millor UX
                    result["title"] = english_title

        result["overview"] = tv.get("overview")
        result["tagline"] = tv.get("tagline")
        result["rating"] = tv.get("vote_average")
        result["seasons"] = tv.get("number_of_seasons")
        result["episodes"] = tv.get("number_of_episodes")
        result["original_language"] = tv.get("original_language")
        result["origin_country"] = tv.get("origin_country", [])

        # Extract year from first air date
        first_air_date = tv.get("first_air_date", "")
        if first_air_date:
            result["year"] = int(first_air_date[:4])
            result["release_date"] = first_air_date

        # Extract genres and genre IDs for content type detection
        genre_ids = []
        if tv.get("genres"):
            result["genres"] = [g["name"] for g in tv["genres"]]
            genre_ids = [g["id"] for g in tv["genres"]]

        # Detect content type (series, anime, toons)
        result["content_type"] = self._detect_content_type(
            "series", genre_ids, result["original_language"], result["origin_country"]
        )

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
        result["vote_count"] = movie.get("vote_count")
        result["runtime"] = movie.get("runtime")
        result["original_language"] = movie.get("original_language")
        result["popularity"] = movie.get("popularity")
        # For movies, production_countries is more reliable
        origin_country = []
        if movie.get("production_countries"):
            origin_country = [c.get("iso_3166_1") for c in movie["production_countries"]]
        result["origin_country"] = origin_country

        release_date = movie.get("release_date", "")
        if release_date:
            result["year"] = int(release_date[:4])
            result["release_date"] = release_date

        genre_ids = []
        if movie.get("genres"):
            result["genres"] = [g["name"] for g in movie["genres"]]
            genre_ids = [g["id"] for g in movie["genres"]]

        # Detect content type
        result["content_type"] = client._detect_content_type(
            "movie", genre_ids, result["original_language"], origin_country
        )

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
        result["vote_count"] = tv.get("vote_count")
        result["seasons"] = tv.get("number_of_seasons")
        result["episodes"] = tv.get("number_of_episodes")
        result["original_language"] = tv.get("original_language")
        result["origin_country"] = tv.get("origin_country", [])
        result["popularity"] = tv.get("popularity")

        first_air_date = tv.get("first_air_date", "")
        if first_air_date:
            result["year"] = int(first_air_date[:4])
            result["release_date"] = first_air_date

        genre_ids = []
        if tv.get("genres"):
            result["genres"] = [g["name"] for g in tv["genres"]]
            genre_ids = [g["id"] for g in tv["genres"]]

        # Detect content type
        result["content_type"] = client._detect_content_type(
            "series", genre_ids, result["original_language"], result["origin_country"]
        )

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
