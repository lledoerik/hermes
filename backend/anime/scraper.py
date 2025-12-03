"""
Anime Scraper Module - Hermes Media Server
Scrapers for Spanish (AnimeFLV, HenaoJara) and Catalan (Fansubs.cat) anime sources
"""

import re
import json
import logging
import asyncio
from typing import Optional, List, Dict, Any
from urllib.parse import quote, urljoin
import httpx

logger = logging.getLogger(__name__)

# User agent to avoid blocks
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,ca;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}


class AnimeFLVScraper:
    """Scraper for AnimeFLV - Spanish subtitled anime"""

    BASE_URL = "https://www3.animeflv.net"

    def __init__(self):
        self.client = httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
            timeout=30.0
        )

    async def search(self, query: str) -> List[Dict[str, Any]]:
        """Search for anime by name"""
        try:
            url = f"{self.BASE_URL}/browse?q={quote(query)}"
            response = await self.client.get(url)
            response.raise_for_status()

            html = response.text
            results = []

            # Parse anime list from HTML
            # Pattern: <article class="Anime">...<a href="/anime/slug">...<h3>Title</h3>
            pattern = r'<article class="Anime[^"]*"[^>]*>.*?<a href="(/anime/[^"]+)"[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*>.*?<h3[^>]*>([^<]+)</h3>'
            matches = re.findall(pattern, html, re.DOTALL)

            for match in matches[:20]:  # Limit to 20 results
                slug = match[0].replace('/anime/', '')
                cover = match[1]
                if not cover.startswith('http'):
                    cover = urljoin(self.BASE_URL, cover)
                title = match[2].strip()

                results.append({
                    'id': slug,
                    'title': title,
                    'cover': cover,
                    'source': 'animeflv',
                    'language': 'es-sub'  # Spanish subtitles
                })

            return results
        except Exception as e:
            logger.error(f"AnimeFLV search error: {e}")
            return []

    async def get_anime_info(self, anime_id: str) -> Optional[Dict[str, Any]]:
        """Get anime details and episode list"""
        try:
            url = f"{self.BASE_URL}/anime/{anime_id}"
            response = await self.client.get(url)
            response.raise_for_status()

            html = response.text

            # Extract title
            title_match = re.search(r'<h1[^>]*class="Title"[^>]*>([^<]+)</h1>', html)
            title = title_match.group(1).strip() if title_match else anime_id

            # Extract cover
            cover_match = re.search(r'<div class="AnimeCover[^"]*"[^>]*>.*?<img[^>]*src="([^"]*)"', html, re.DOTALL)
            cover = cover_match.group(1) if cover_match else ''
            if cover and not cover.startswith('http'):
                cover = urljoin(self.BASE_URL, cover)

            # Extract synopsis
            synopsis_match = re.search(r'<div class="Description"[^>]*>.*?<p>([^<]+)</p>', html, re.DOTALL)
            synopsis = synopsis_match.group(1).strip() if synopsis_match else ''

            # Extract episodes from JavaScript variable
            # var episodes = [[ep_num, ep_id], ...]
            episodes_match = re.search(r'var episodes\s*=\s*(\[\[.*?\]\])', html, re.DOTALL)
            episodes = []

            if episodes_match:
                try:
                    eps_data = json.loads(episodes_match.group(1))
                    for ep in eps_data:
                        ep_num = ep[0]
                        episodes.append({
                            'number': ep_num,
                            'id': f"{anime_id}-{ep_num}",
                            'title': f"Episodi {ep_num}"
                        })
                except:
                    pass

            # Sort episodes by number
            episodes.sort(key=lambda x: x['number'])

            return {
                'id': anime_id,
                'title': title,
                'cover': cover,
                'synopsis': synopsis,
                'episodes': episodes,
                'source': 'animeflv',
                'language': 'es-sub'
            }
        except Exception as e:
            logger.error(f"AnimeFLV get_anime_info error: {e}")
            return None

    async def get_episode_sources(self, anime_id: str, episode: int) -> List[Dict[str, Any]]:
        """Get video sources for an episode"""
        try:
            url = f"{self.BASE_URL}/ver/{anime_id}-{episode}"
            response = await self.client.get(url)
            response.raise_for_status()

            html = response.text
            sources = []

            # Extract video servers from JavaScript
            # var videos = {"SUB": [...], "LAT": [...]}
            videos_match = re.search(r'var videos\s*=\s*(\{.*?\});', html, re.DOTALL)

            if videos_match:
                try:
                    videos_data = json.loads(videos_match.group(1))

                    for lang_key, servers in videos_data.items():
                        lang = 'Subtitulat' if lang_key == 'SUB' else 'Latino' if lang_key == 'LAT' else lang_key

                        for server in servers:
                            server_name = server.get('title', 'Unknown')
                            server_url = server.get('code', '') or server.get('url', '')

                            if server_url:
                                # Decode base64 if needed
                                if 'embed' in server_url or server_url.startswith('http'):
                                    sources.append({
                                        'name': f"{server_name} ({lang})",
                                        'url': server_url,
                                        'language': lang_key.lower(),
                                        'server': server_name.lower()
                                    })
                except Exception as e:
                    logger.error(f"Error parsing videos: {e}")

            # Fallback: extract iframe URLs directly
            if not sources:
                iframe_pattern = r'<iframe[^>]*src="([^"]+)"[^>]*>'
                iframes = re.findall(iframe_pattern, html)
                for i, iframe_url in enumerate(iframes):
                    sources.append({
                        'name': f"Servidor {i+1}",
                        'url': iframe_url,
                        'language': 'sub',
                        'server': 'unknown'
                    })

            return sources
        except Exception as e:
            logger.error(f"AnimeFLV get_episode_sources error: {e}")
            return []

    async def close(self):
        await self.client.aclose()


class HenaoJaraScraper:
    """Scraper for HenaoJara - Spanish Latino dubbed anime"""

    BASE_URL = "https://henaojara.com"

    def __init__(self):
        self.client = httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
            timeout=30.0
        )

    async def search(self, query: str) -> List[Dict[str, Any]]:
        """Search for anime by name"""
        try:
            url = f"{self.BASE_URL}/?s={quote(query)}"
            response = await self.client.get(url)
            response.raise_for_status()

            html = response.text
            results = []

            # Parse search results
            # Pattern varies, looking for article/post structures
            pattern = r'<article[^>]*>.*?<a href="([^"]+)"[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*>.*?<h[23][^>]*>([^<]+)</h[23]>'
            matches = re.findall(pattern, html, re.DOTALL | re.IGNORECASE)

            for match in matches[:20]:
                url = match[0]
                cover = match[1]
                title = match[2].strip()

                # Extract slug from URL
                slug = url.rstrip('/').split('/')[-1]

                results.append({
                    'id': slug,
                    'title': title,
                    'cover': cover,
                    'url': url,
                    'source': 'henaojara',
                    'language': 'es-lat'  # Spanish Latino
                })

            return results
        except Exception as e:
            logger.error(f"HenaoJara search error: {e}")
            return []

    async def get_anime_info(self, anime_id: str) -> Optional[Dict[str, Any]]:
        """Get anime details and episode list"""
        try:
            # Try different URL patterns
            urls_to_try = [
                f"{self.BASE_URL}/ver/season/{anime_id}/",
                f"{self.BASE_URL}/veronline/{anime_id}/",
                f"{self.BASE_URL}/animeonline/{anime_id}/",
            ]

            html = None
            for url in urls_to_try:
                try:
                    response = await self.client.get(url)
                    if response.status_code == 200:
                        html = response.text
                        break
                except:
                    continue

            if not html:
                return None

            # Extract title
            title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
            title = title_match.group(1).strip() if title_match else anime_id

            # Extract cover
            cover_match = re.search(r'<img[^>]*class="[^"]*poster[^"]*"[^>]*src="([^"]*)"', html, re.IGNORECASE)
            if not cover_match:
                cover_match = re.search(r'<img[^>]*src="([^"]*)"[^>]*class="[^"]*poster', html, re.IGNORECASE)
            cover = cover_match.group(1) if cover_match else ''

            # Extract episodes
            # Pattern: episode links with numbers
            episode_pattern = r'<a[^>]*href="([^"]*episodio[^"]*)"[^>]*>.*?(\d+).*?</a>'
            ep_matches = re.findall(episode_pattern, html, re.DOTALL | re.IGNORECASE)

            episodes = []
            seen_eps = set()
            for match in ep_matches:
                ep_url = match[0]
                ep_num = int(match[1])
                if ep_num not in seen_eps:
                    seen_eps.add(ep_num)
                    episodes.append({
                        'number': ep_num,
                        'id': ep_url,
                        'url': ep_url,
                        'title': f"Capítulo {ep_num}"
                    })

            episodes.sort(key=lambda x: x['number'])

            return {
                'id': anime_id,
                'title': title,
                'cover': cover,
                'episodes': episodes,
                'source': 'henaojara',
                'language': 'es-lat'
            }
        except Exception as e:
            logger.error(f"HenaoJara get_anime_info error: {e}")
            return None

    async def get_episode_sources(self, episode_url: str) -> List[Dict[str, Any]]:
        """Get video sources for an episode"""
        try:
            if not episode_url.startswith('http'):
                episode_url = urljoin(self.BASE_URL, episode_url)

            response = await self.client.get(episode_url)
            response.raise_for_status()

            html = response.text
            sources = []

            # Look for iframe embeds
            iframe_pattern = r'<iframe[^>]*src="([^"]+)"[^>]*>'
            iframes = re.findall(iframe_pattern, html, re.IGNORECASE)

            for iframe_url in iframes:
                # Determine server name from URL
                server_name = 'Desconegut'
                if 'fembed' in iframe_url or 'fplayer' in iframe_url:
                    server_name = 'Fembed'
                elif 'streamtape' in iframe_url:
                    server_name = 'Streamtape'
                elif 'okru' in iframe_url or 'ok.ru' in iframe_url:
                    server_name = 'OK.ru'
                elif 'mp4upload' in iframe_url:
                    server_name = 'MP4Upload'
                elif 'uqload' in iframe_url:
                    server_name = 'Uqload'
                elif 'streamwish' in iframe_url:
                    server_name = 'StreamWish'
                elif 'dood' in iframe_url:
                    server_name = 'Doodstream'
                elif 'filemoon' in iframe_url:
                    server_name = 'Filemoon'

                sources.append({
                    'name': server_name,
                    'url': iframe_url,
                    'language': 'es-lat',
                    'server': server_name.lower()
                })

            # Look for video links in data attributes or JavaScript
            video_pattern = r'data-video="([^"]+)"'
            video_matches = re.findall(video_pattern, html)
            for video_url in video_matches:
                if video_url not in [s['url'] for s in sources]:
                    sources.append({
                        'name': 'Video',
                        'url': video_url,
                        'language': 'es-lat',
                        'server': 'unknown'
                    })

            return sources
        except Exception as e:
            logger.error(f"HenaoJara get_episode_sources error: {e}")
            return []

    async def close(self):
        await self.client.aclose()


class FansubsCatScraper:
    """Scraper for Fansubs.cat - Catalan subtitled anime"""

    BASE_URL = "https://anime.fansubs.cat"
    API_URL = "https://api.fansubs.cat"

    def __init__(self):
        self.client = httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
            timeout=30.0
        )

    async def search(self, query: str) -> List[Dict[str, Any]]:
        """Search for anime by name"""
        try:
            # Try the API first
            api_url = f"{self.API_URL}/anime/search?q={quote(query)}"
            try:
                response = await self.client.get(api_url)
                if response.status_code == 200:
                    data = response.json()
                    results = []
                    for item in data.get('results', data) if isinstance(data, dict) else data:
                        if isinstance(item, dict):
                            results.append({
                                'id': item.get('slug', item.get('id', '')),
                                'title': item.get('title', item.get('name', '')),
                                'cover': item.get('cover', item.get('poster', '')),
                                'source': 'fansubscat',
                                'language': 'ca'  # Catalan
                            })
                    return results[:20]
            except:
                pass

            # Fallback to web scraping
            url = f"{self.BASE_URL}/cerca?q={quote(query)}"
            response = await self.client.get(url)
            response.raise_for_status()

            html = response.text
            results = []

            # Parse search results
            pattern = r'<a[^>]*href="(/anime/[^"]+)"[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*>.*?<[^>]*>([^<]+)<'
            matches = re.findall(pattern, html, re.DOTALL | re.IGNORECASE)

            for match in matches[:20]:
                slug = match[0].replace('/anime/', '').strip('/')
                cover = match[1]
                title = match[2].strip()

                results.append({
                    'id': slug,
                    'title': title,
                    'cover': cover,
                    'source': 'fansubscat',
                    'language': 'ca'
                })

            return results
        except Exception as e:
            logger.error(f"FansubsCat search error: {e}")
            return []

    async def get_anime_info(self, anime_id: str) -> Optional[Dict[str, Any]]:
        """Get anime details and episode list"""
        try:
            # Try API first
            api_url = f"{self.API_URL}/anime/{anime_id}"
            try:
                response = await self.client.get(api_url)
                if response.status_code == 200:
                    data = response.json()
                    episodes = []
                    for ep in data.get('episodes', []):
                        episodes.append({
                            'number': ep.get('number', 0),
                            'id': ep.get('id', ''),
                            'title': ep.get('title', f"Episodi {ep.get('number', 0)}")
                        })

                    return {
                        'id': anime_id,
                        'title': data.get('title', anime_id),
                        'cover': data.get('cover', ''),
                        'synopsis': data.get('synopsis', ''),
                        'episodes': episodes,
                        'source': 'fansubscat',
                        'language': 'ca'
                    }
            except:
                pass

            # Fallback to web scraping
            url = f"{self.BASE_URL}/anime/{anime_id}"
            response = await self.client.get(url)
            response.raise_for_status()

            html = response.text

            # Extract title
            title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
            title = title_match.group(1).strip() if title_match else anime_id

            # Extract episodes
            episode_pattern = r'<a[^>]*href="(/anime/[^/]+/(\d+))"[^>]*>'
            ep_matches = re.findall(episode_pattern, html)

            episodes = []
            seen_eps = set()
            for match in ep_matches:
                ep_url = match[0]
                ep_num = int(match[1])
                if ep_num not in seen_eps:
                    seen_eps.add(ep_num)
                    episodes.append({
                        'number': ep_num,
                        'id': ep_url,
                        'url': ep_url,
                        'title': f"Episodi {ep_num}"
                    })

            episodes.sort(key=lambda x: x['number'])

            return {
                'id': anime_id,
                'title': title,
                'cover': '',
                'episodes': episodes,
                'source': 'fansubscat',
                'language': 'ca'
            }
        except Exception as e:
            logger.error(f"FansubsCat get_anime_info error: {e}")
            return None

    async def get_episode_sources(self, anime_id: str, episode: int) -> List[Dict[str, Any]]:
        """Get video sources for an episode"""
        try:
            # Try API first
            api_url = f"{self.API_URL}/anime/{anime_id}/episode/{episode}"
            try:
                response = await self.client.get(api_url)
                if response.status_code == 200:
                    data = response.json()
                    sources = []
                    for source in data.get('sources', []):
                        sources.append({
                            'name': source.get('name', 'Fansubs.cat'),
                            'url': source.get('url', ''),
                            'language': 'ca',
                            'server': source.get('server', 'fansubscat')
                        })
                    if sources:
                        return sources
            except:
                pass

            # Fallback to web page
            url = f"{self.BASE_URL}/anime/{anime_id}/{episode}"
            response = await self.client.get(url)
            response.raise_for_status()

            html = response.text
            sources = []

            # Look for video sources
            # Fansubs.cat usually provides direct download links or embedded players
            video_pattern = r'<source[^>]*src="([^"]+)"[^>]*>'
            video_matches = re.findall(video_pattern, html)
            for video_url in video_matches:
                sources.append({
                    'name': 'Fansubs.cat',
                    'url': video_url,
                    'language': 'ca',
                    'server': 'fansubscat',
                    'type': 'direct'
                })

            # Look for iframe embeds
            iframe_pattern = r'<iframe[^>]*src="([^"]+)"[^>]*>'
            iframes = re.findall(iframe_pattern, html)
            for iframe_url in iframes:
                sources.append({
                    'name': 'Reproductor',
                    'url': iframe_url,
                    'language': 'ca',
                    'server': 'embed'
                })

            # Look for download links
            download_pattern = r'<a[^>]*href="([^"]*(?:mega|drive|mediafire|torrent)[^"]*)"[^>]*>'
            downloads = re.findall(download_pattern, html, re.IGNORECASE)
            for dl_url in downloads:
                server_name = 'Descàrrega'
                if 'mega' in dl_url.lower():
                    server_name = 'MEGA'
                elif 'drive' in dl_url.lower():
                    server_name = 'Google Drive'
                elif 'mediafire' in dl_url.lower():
                    server_name = 'MediaFire'
                elif 'torrent' in dl_url.lower():
                    server_name = 'Torrent'

                sources.append({
                    'name': server_name,
                    'url': dl_url,
                    'language': 'ca',
                    'server': server_name.lower().replace(' ', ''),
                    'type': 'download'
                })

            return sources
        except Exception as e:
            logger.error(f"FansubsCat get_episode_sources error: {e}")
            return []

    async def close(self):
        await self.client.aclose()


class AnimeScraperManager:
    """Manager for all anime scrapers"""

    def __init__(self):
        self.scrapers = {
            'animeflv': AnimeFLVScraper(),
            'henaojara': HenaoJaraScraper(),
            'fansubscat': FansubsCatScraper(),
        }

    async def search_all(self, query: str) -> Dict[str, List[Dict[str, Any]]]:
        """Search across all sources"""
        results = {}

        # Run searches in parallel
        tasks = {
            name: scraper.search(query)
            for name, scraper in self.scrapers.items()
        }

        for name, task in tasks.items():
            try:
                results[name] = await task
            except Exception as e:
                logger.error(f"Error searching {name}: {e}")
                results[name] = []

        return results

    async def search(self, query: str, source: str = None) -> List[Dict[str, Any]]:
        """Search in specific source or all sources"""
        if source and source in self.scrapers:
            return await self.scrapers[source].search(query)

        # Search all and combine results
        all_results = await self.search_all(query)
        combined = []
        for source_results in all_results.values():
            combined.extend(source_results)
        return combined

    async def get_anime_info(self, source: str, anime_id: str) -> Optional[Dict[str, Any]]:
        """Get anime info from specific source"""
        if source not in self.scrapers:
            return None
        return await self.scrapers[source].get_anime_info(anime_id)

    async def get_episode_sources(self, source: str, anime_id: str, episode: int) -> List[Dict[str, Any]]:
        """Get episode sources from specific source"""
        if source not in self.scrapers:
            return []

        if source == 'animeflv':
            return await self.scrapers[source].get_episode_sources(anime_id, episode)
        elif source == 'henaojara':
            # HenaoJara needs the full episode URL
            anime_info = await self.scrapers[source].get_anime_info(anime_id)
            if anime_info:
                for ep in anime_info.get('episodes', []):
                    if ep.get('number') == episode:
                        return await self.scrapers[source].get_episode_sources(ep.get('url', ''))
            return []
        elif source == 'fansubscat':
            return await self.scrapers[source].get_episode_sources(anime_id, episode)

        return []

    async def close_all(self):
        """Close all scraper connections"""
        for scraper in self.scrapers.values():
            await scraper.close()


# Global instance
anime_manager = AnimeScraperManager()
