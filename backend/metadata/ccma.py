"""
CCMA (3Cat) API integration for fetching public Catalan TV content.
"""
import asyncio
import json
import urllib.request
import urllib.parse
from typing import Optional, Dict, Any, List
import re


class CCMAClient:
    """Client per accedir a l'API de 3Cat (CCMA)"""

    BASE_URL = "https://api.ccma.cat/videos"
    PROGRAMS_URL = "https://api.ccma.cat/programes"
    IMAGE_BASE = "https://statics.ccma.cat"

    def __init__(self):
        pass

    def _sync_request(self, url: str) -> Optional[Dict]:
        """Make a synchronous API request."""
        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Hermes Media Server/1.0')
            req.add_header('Accept', 'application/json')

            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode('utf-8'))
        except Exception as e:
            print(f"CCMA API error: {e}")
            return None

    async def _request(self, url: str) -> Optional[Dict]:
        """Make an async API request."""
        return await asyncio.to_thread(self._sync_request, url)

    async def get_programs(self, limit: int = 50) -> List[Dict]:
        """Get list of programs from 3Cat."""
        try:
            url = f"{self.PROGRAMS_URL}?limit={limit}&ordre=data_modificacio&direccio=DESC"
            data = await self._request(url)

            if not data or 'resposta' not in data:
                return []

            programs = []
            items = data.get('resposta', {}).get('items', {}).get('item', [])

            for item in items:
                program = {
                    'id': item.get('id'),
                    'title': item.get('titol'),
                    'description': item.get('descripcio', '')[:500] if item.get('descripcio') else None,
                    'category': item.get('genere', {}).get('text') if isinstance(item.get('genere'), dict) else item.get('genere'),
                    'image': item.get('imatges', {}).get('imatge', [{}])[0].get('text') if item.get('imatges') else None,
                    'type': self._classify_content(item),
                    'total_videos': item.get('videos_totals', 0),
                    'url': item.get('url'),
                }
                programs.append(program)

            return programs

        except Exception as e:
            print(f"Error getting programs: {e}")
            return []

    async def get_program_videos(self, program_id: str, limit: int = 20) -> List[Dict]:
        """Get videos from a specific program."""
        try:
            url = f"{self.BASE_URL}?programaid={program_id}&limit={limit}&ordre=data_emissio&direccio=DESC"
            data = await self._request(url)

            if not data or 'resposta' not in data:
                return []

            videos = []
            items = data.get('resposta', {}).get('items', {}).get('item', [])

            for item in items:
                video = self._parse_video(item)
                if video:
                    videos.append(video)

            return videos

        except Exception as e:
            print(f"Error getting program videos: {e}")
            return []

    async def get_latest_videos(self, category: str = None, limit: int = 50) -> List[Dict]:
        """Get latest videos, optionally filtered by category."""
        try:
            url = f"{self.BASE_URL}?limit={limit}&ordre=data_emissio&direccio=DESC"
            if category:
                url += f"&tipus_contingut={category}"

            data = await self._request(url)

            if not data or 'resposta' not in data:
                return []

            videos = []
            items = data.get('resposta', {}).get('items', {}).get('item', [])

            for item in items:
                video = self._parse_video(item)
                if video:
                    videos.append(video)

            return videos

        except Exception as e:
            print(f"Error getting latest videos: {e}")
            return []

    async def search_videos(self, query: str, limit: int = 30) -> List[Dict]:
        """Search for videos."""
        try:
            encoded_query = urllib.parse.quote(query)
            url = f"{self.BASE_URL}?text={encoded_query}&limit={limit}&ordre=data_emissio&direccio=DESC"

            data = await self._request(url)

            if not data or 'resposta' not in data:
                return []

            videos = []
            items = data.get('resposta', {}).get('items', {}).get('item', [])

            for item in items:
                video = self._parse_video(item)
                if video:
                    videos.append(video)

            return videos

        except Exception as e:
            print(f"Error searching videos: {e}")
            return []

    async def get_video_details(self, video_id: str) -> Optional[Dict]:
        """Get detailed info about a video including stream URL."""
        try:
            url = f"{self.BASE_URL}/{video_id}"
            data = await self._request(url)

            if not data or 'resposta' not in data:
                return None

            item = data.get('resposta', {})
            return self._parse_video(item, include_stream=True)

        except Exception as e:
            print(f"Error getting video details: {e}")
            return None

    def _parse_video(self, item: Dict, include_stream: bool = False) -> Optional[Dict]:
        """Parse video item from API response."""
        try:
            # Get image URL
            image = None
            if item.get('imatges'):
                images = item['imatges'].get('imatge', [])
                if isinstance(images, list) and len(images) > 0:
                    image = images[0].get('text')
                elif isinstance(images, dict):
                    image = images.get('text')

            # Get stream URL if requested
            stream_url = None
            if include_stream and item.get('media'):
                media = item['media']
                if media.get('url'):
                    urls = media['url']
                    # Prefer HLS
                    for u in urls if isinstance(urls, list) else [urls]:
                        if isinstance(u, dict):
                            url_text = u.get('text', '')
                            if '.m3u8' in url_text:
                                stream_url = url_text
                                break
                    # Fallback to first available
                    if not stream_url and urls:
                        first_url = urls[0] if isinstance(urls, list) else urls
                        stream_url = first_url.get('text') if isinstance(first_url, dict) else first_url

            # Determine content type
            content_type = 'program'
            tipologia = item.get('tipologia', {})
            if isinstance(tipologia, dict):
                tipo_text = tipologia.get('text', '').lower()
            else:
                tipo_text = str(tipologia).lower()

            if 'pel·lícula' in tipo_text or 'film' in tipo_text or 'cinema' in tipo_text:
                content_type = 'movie'
            elif 'sèrie' in tipo_text or 'capítol' in tipo_text or 'episodi' in tipo_text:
                content_type = 'series'

            video = {
                'id': item.get('id'),
                'title': item.get('titol'),
                'description': item.get('descripcio', '')[:500] if item.get('descripcio') else None,
                'program': item.get('programa', {}).get('text') if isinstance(item.get('programa'), dict) else item.get('programa'),
                'program_id': item.get('programa', {}).get('id') if isinstance(item.get('programa'), dict) else None,
                'duration': item.get('durada'),  # in seconds
                'date': item.get('data_emissio'),
                'image': image,
                'type': content_type,
                'category': item.get('genere', {}).get('text') if isinstance(item.get('genere'), dict) else item.get('genere'),
                'views': item.get('visualitzacions'),
            }

            if include_stream:
                video['stream_url'] = stream_url

            return video

        except Exception as e:
            print(f"Error parsing video: {e}")
            return None

    def _classify_content(self, item: Dict) -> str:
        """Classify content as movie, series, or program."""
        genere = item.get('genere', {})
        if isinstance(genere, dict):
            genere_text = genere.get('text', '').lower()
        else:
            genere_text = str(genere).lower()

        title = (item.get('titol') or '').lower()

        if 'cinema' in genere_text or 'pel·lícula' in genere_text:
            return 'movie'
        elif 'sèrie' in genere_text or 'ficció' in genere_text:
            return 'series'
        else:
            return 'program'


async def get_3cat_programs(limit: int = 50) -> List[Dict]:
    """Get list of 3Cat programs."""
    client = CCMAClient()
    return await client.get_programs(limit)


async def get_3cat_videos(program_id: str = None, category: str = None, limit: int = 50) -> List[Dict]:
    """Get 3Cat videos, optionally filtered."""
    client = CCMAClient()
    if program_id:
        return await client.get_program_videos(program_id, limit)
    return await client.get_latest_videos(category, limit)


async def get_3cat_video_details(video_id: str) -> Optional[Dict]:
    """Get details of a specific 3Cat video."""
    client = CCMAClient()
    return await client.get_video_details(video_id)


async def search_3cat(query: str, limit: int = 30) -> List[Dict]:
    """Search 3Cat content."""
    client = CCMAClient()
    return await client.search_videos(query, limit)
