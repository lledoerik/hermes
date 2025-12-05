"""
Real-Debrid API Client
Documentació: https://api.real-debrid.com/
"""

import httpx
import logging
from typing import Optional, Dict, List, Any
from urllib.parse import quote

logger = logging.getLogger(__name__)


class RealDebridError(Exception):
    """Error específic de Real-Debrid"""
    def __init__(self, message: str, code: Optional[int] = None):
        self.message = message
        self.code = code
        super().__init__(message)


class RealDebridClient:
    """Client per a l'API de Real-Debrid"""

    BASE_URL = "https://api.real-debrid.com/rest/1.0"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}"
        }

    async def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Any:
        """Fer una petició a l'API de Real-Debrid"""
        url = f"{self.BASE_URL}{endpoint}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                if method == "GET":
                    response = await client.get(url, headers=self.headers, params=params)
                elif method == "POST":
                    response = await client.post(url, headers=self.headers, data=data)
                elif method == "DELETE":
                    response = await client.delete(url, headers=self.headers)
                else:
                    raise ValueError(f"Mètode no suportat: {method}")

                # Real-Debrid retorna 204 per deletes exitosos
                if response.status_code == 204:
                    return None

                # Gestionar errors
                if response.status_code >= 400:
                    error_data = response.json() if response.text else {}
                    error_msg = error_data.get("error", f"Error HTTP {response.status_code}")
                    error_code = error_data.get("error_code")
                    logger.error(f"Real-Debrid error: {error_msg} (code: {error_code})")
                    raise RealDebridError(error_msg, error_code)

                return response.json() if response.text else None

            except httpx.RequestError as e:
                logger.error(f"Error de connexió amb Real-Debrid: {e}")
                raise RealDebridError(f"Error de connexió: {str(e)}")

    async def get_user(self) -> Dict:
        """Obtenir informació de l'usuari (validar API key)"""
        return await self._request("GET", "/user")

    async def check_instant_availability(self, hashes: List[str]) -> Dict:
        """
        Comprovar si els torrents estan en cache (disponibilitat instantània)

        Args:
            hashes: Llista de hashes de torrents (info_hash)

        Returns:
            Dict amb els hashes disponibles i les seves variants de fitxers
        """
        if not hashes:
            return {}

        # L'API accepta múltiples hashes separats per /
        hashes_str = "/".join(hashes)
        return await self._request("GET", f"/torrents/instantAvailability/{hashes_str}")

    async def add_magnet(self, magnet: str) -> Dict:
        """
        Afegir un magnet link a Real-Debrid

        Returns:
            Dict amb 'id' i 'uri' del torrent
        """
        result = await self._request("POST", "/torrents/addMagnet", data={"magnet": magnet})
        logger.info(f"Magnet afegit a Real-Debrid: {result.get('id')}")
        return result

    async def get_torrent_info(self, torrent_id: str) -> Dict:
        """Obtenir informació d'un torrent"""
        return await self._request("GET", f"/torrents/info/{torrent_id}")

    async def select_files(self, torrent_id: str, files: str = "all") -> None:
        """
        Seleccionar fitxers del torrent per descarregar

        Args:
            torrent_id: ID del torrent
            files: "all" o IDs separats per comes (e.g., "1,2,3")
        """
        await self._request("POST", f"/torrents/selectFiles/{torrent_id}", data={"files": files})
        logger.info(f"Fitxers seleccionats per torrent {torrent_id}")

    async def delete_torrent(self, torrent_id: str) -> None:
        """Eliminar un torrent"""
        await self._request("DELETE", f"/torrents/delete/{torrent_id}")
        logger.info(f"Torrent eliminat: {torrent_id}")

    async def unrestrict_link(self, link: str) -> Dict:
        """
        Obtenir URL directa d'un link (convertir link restringit a directe)

        Args:
            link: URL del fitxer (pot ser de Real-Debrid o altres hosters)

        Returns:
            Dict amb 'download' (URL directa), 'filename', 'filesize', etc.
        """
        result = await self._request("POST", "/unrestrict/link", data={"link": link})
        logger.info(f"Link unrestricted: {result.get('filename')}")
        return result

    def _parse_episode_from_filename(self, filename: str, target_season: int, target_episode: int) -> bool:
        """
        Comprovar si un nom de fitxer correspon a un episodi específic.

        Patrons suportats:
        - S01E16, s01e16
        - 1x16
        - E16 (quan ja sabem la temporada)
        - .116. (temporada 1, episodi 16)
        - Episode 16, Ep16
        """
        import re
        filename_lower = filename.lower()

        # Patró S01E16
        match = re.search(r's(\d{1,2})e(\d{1,3})', filename_lower)
        if match:
            s, e = int(match.group(1)), int(match.group(2))
            return s == target_season and e == target_episode

        # Patró 1x16
        match = re.search(r'(\d{1,2})x(\d{1,3})', filename_lower)
        if match:
            s, e = int(match.group(1)), int(match.group(2))
            return s == target_season and e == target_episode

        # Patró .116. o -116- (temporada 1, episodi 16)
        match = re.search(r'[.\-_](\d)(\d{2})[.\-_]', filename_lower)
        if match:
            s, e = int(match.group(1)), int(match.group(2))
            return s == target_season and e == target_episode

        # Patró E16 o EP16 o Episode 16 (assumim temporada correcta)
        match = re.search(r'(?:e|ep|episode)[.\s]?(\d{1,3})\b', filename_lower)
        if match:
            e = int(match.group(1))
            return e == target_episode

        return False

    async def get_streaming_url(self, magnet: str, file_idx: Optional[int] = None,
                                 season: Optional[int] = None, episode: Optional[int] = None) -> Optional[Dict]:
        """
        Mètode convenient per obtenir URL de streaming d'un magnet

        Args:
            magnet: Magnet link
            file_idx: Índex del fitxer a reproduir (de Torrentio, per season packs).
                      Si és None, selecciona el fitxer de vídeo més gran.
            season: Número de temporada (per sèries, ajuda a trobar el fitxer correcte)
            episode: Número d'episodi (per sèries, ajuda a trobar el fitxer correcte)

        Returns:
            Dict amb 'url' (streaming URL), 'filename', 'filesize'

        Raises:
            RealDebridError: Si hi ha un error específic de Real-Debrid
        """
        import asyncio
        torrent_id = None

        try:
            # 1. Afegir magnet
            add_result = await self.add_magnet(magnet)
            torrent_id = add_result["id"]

            # 2. Obtenir info del torrent
            info = await self.get_torrent_info(torrent_id)

            # 3. Seleccionar fitxers si cal
            if info.get("status") == "waiting_files_selection":
                files = info.get("files", [])
                if files:
                    video_extensions = {'.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'}
                    video_files = [
                        f for f in files
                        if any(f.get("path", "").lower().endswith(ext) for ext in video_extensions)
                    ]

                    selected_id = None

                    # PRIORITAT 1: Si tenim season i episode, buscar per nom de fitxer
                    # Això és el mètode més fiable per season packs
                    if season is not None and episode is not None and video_files:
                        logger.info(f"Buscant episodi S{season:02d}E{episode:02d} per nom de fitxer...")
                        for f in video_files:
                            filepath = f.get("path", "")
                            if self._parse_episode_from_filename(filepath, season, episode):
                                selected_id = f["id"]
                                logger.info(f"Trobat episodi per nom: {filepath}")
                                break

                        if selected_id is None:
                            logger.warning(f"No s'ha trobat S{season:02d}E{episode:02d} per nom, usant file_idx o fallback")

                    # PRIORITAT 2: Si tenim file_idx de Torrentio, usar-lo
                    if selected_id is None and file_idx is not None:
                        # Buscar el fitxer amb aquest índex
                        for f in files:
                            if f.get("id") == file_idx + 1:  # RD usa ids basats en 1
                                selected_id = f["id"]
                                logger.info(f"Seleccionant fitxer per fileIdx {file_idx}: {f.get('path')}")
                                break
                        # Si no trobem per id, provar per posició
                        if selected_id is None and file_idx < len(files):
                            selected_id = files[file_idx]["id"]
                            logger.info(f"Seleccionant fitxer per posició {file_idx}: {files[file_idx].get('path')}")

                    # PRIORITAT 3: Si no tenim file_idx o no l'hem trobat, seleccionar el vídeo més gran
                    if selected_id is None and video_files:
                        video_files.sort(key=lambda x: x.get("bytes", 0), reverse=True)
                        selected_id = video_files[0]["id"]
                        logger.info(f"Seleccionant vídeo més gran: {video_files[0].get('path')}")

                    if selected_id:
                        await self.select_files(torrent_id, str(selected_id))
                    else:
                        await self.select_files(torrent_id, "all")
                else:
                    await self.select_files(torrent_id, "all")

            # 4. Esperar que estigui llest i obtenir links
            # Max 40 segons d'espera (per torrents no cached pot trigar més)
            max_wait_seconds = 40
            last_status = None
            last_progress = 0

            for i in range(max_wait_seconds):
                info = await self.get_torrent_info(torrent_id)
                status = info.get("status")
                progress = info.get("progress", 0)

                # Log només quan canvia l'estat o cada 5 segons
                if status != last_status or i % 5 == 0:
                    logger.info(f"Torrent {torrent_id}: status={status}, progress={progress}%")
                    last_status = status
                    last_progress = progress

                if status == "downloaded":
                    links = info.get("links", [])
                    if links:
                        # Obtenir URL directa del primer link
                        unrestricted = await self.unrestrict_link(links[0])
                        return {
                            "url": unrestricted.get("download"),
                            "filename": unrestricted.get("filename"),
                            "filesize": unrestricted.get("filesize"),
                            "mimetype": unrestricted.get("mimeType"),
                            "torrent_id": torrent_id
                        }
                    else:
                        # Descarregat però sense links - error
                        logger.error(f"Torrent {torrent_id} descarregat però sense links")
                        raise RealDebridError("Torrent descarregat però sense links disponibles")

                elif status in ("error", "dead", "magnet_error", "virus"):
                    logger.error(f"Error amb torrent: {status}")
                    try:
                        await self.delete_torrent(torrent_id)
                    except Exception:
                        pass
                    raise RealDebridError(f"Error del torrent: {status}")

                elif status == "queued":
                    # En cua, esperar més temps
                    if i > 20:
                        raise RealDebridError("El torrent està en cua. Prova amb una font en cache (⚡)")

                elif status == "downloading":
                    # Descarregant, si no és cached pot trigar molt
                    if i > 30 and progress < 50:
                        logger.warning(f"Descarrega lenta: {progress}% després de {i}s")
                        raise RealDebridError(f"Descàrrega lenta ({progress}%). Prova amb una font en cache (⚡)")

                await asyncio.sleep(1)

            # Timeout
            logger.warning(f"Timeout esperant torrent {torrent_id} (últim estat: {last_status}, progrés: {last_progress}%)")
            raise RealDebridError(f"Temps d'espera excedit. Últim estat: {last_status}")

        except RealDebridError:
            # Re-llançar errors de Real-Debrid
            raise
        except Exception as e:
            logger.error(f"Error inesperat obtenint stream: {e}")
            raise RealDebridError(f"Error inesperat: {str(e)}")

    async def get_cached_streaming_url(self, info_hash: str, magnet: str) -> Optional[Dict]:
        """
        Obtenir URL de streaming només si està en cache (instantani)

        Args:
            info_hash: Hash del torrent
            magnet: Magnet link complet

        Returns:
            Dict amb URL o None si no està en cache
        """
        # Comprovar si està en cache
        availability = await self.check_instant_availability([info_hash])

        if not availability or info_hash not in availability:
            logger.info(f"Torrent no en cache: {info_hash[:8]}...")
            return None

        # Està en cache, obtenir URL
        return await self.get_streaming_url(magnet)
