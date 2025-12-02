#!/usr/bin/env python3
"""
Motor de streaming HLS per Hermes
Suporta múltiples pistes d'àudio i subtítols
Suporta fitxers locals i URLs remotes (Real-Debrid, etc.)
"""

import os
import subprocess
import hashlib
import shutil
import asyncio
from pathlib import Path
from typing import Optional, Union
import logging

logger = logging.getLogger(__name__)


def check_ffmpeg_available() -> bool:
    """Comprova si FFmpeg està disponible al sistema"""
    try:
        result = subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


FFMPEG_AVAILABLE = check_ffmpeg_available()


class HermesStreamer:
    """Gestor de streaming HLS amb suport multi-pista"""

    def __init__(self):
        self.cache_dir = Path("storage/cache/hls")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.active_streams = {}

    def start_stream(self, media_id: int, file_path: str,
                     audio_index: Optional[int] = None,
                     subtitle_index: Optional[int] = None,
                     quality: str = "1080p") -> str:
        """
        Inicia un stream HLS amb selecció de pistes d'àudio i subtítols.

        Args:
            media_id: ID del media
            file_path: Path al fitxer de vídeo
            audio_index: Índex de la pista d'àudio (0-based dins les pistes d'àudio)
            subtitle_index: Índex de la pista de subtítols (0-based dins les pistes de subtítols)
            quality: Qualitat del vídeo (1080p, 720p, 480p)

        Returns:
            URL de la playlist HLS
        """

        # Generar ID únic pel stream basat en paràmetres
        stream_key = f"{media_id}_{audio_index}_{subtitle_index}_{quality}"
        stream_id = hashlib.md5(stream_key.encode()).hexdigest()[:12]

        # Crear directori pel stream
        stream_dir = self.cache_dir / stream_id
        stream_dir.mkdir(exist_ok=True)

        # Playlist path
        playlist_path = stream_dir / "playlist.m3u8"

        # Si ja existeix i és vàlid, retornar
        if playlist_path.exists() and playlist_path.stat().st_size > 0:
            return f"/api/stream/hls/{stream_id}/playlist.m3u8"

        # Configuració de qualitat
        quality_settings = {
            "4k": {"scale": "3840:-2", "bitrate": "15M", "maxrate": "20M"},
            "1080p": {"scale": "1920:-2", "bitrate": "6M", "maxrate": "8M"},
            "720p": {"scale": "1280:-2", "bitrate": "3M", "maxrate": "4M"},
            "480p": {"scale": "854:-2", "bitrate": "1.5M", "maxrate": "2M"},
        }

        q = quality_settings.get(quality, quality_settings["1080p"])

        # Construir comanda FFmpeg
        cmd = ['ffmpeg', '-y', '-i', file_path]

        # Mapping de streams
        # Video sempre és el primer stream de video
        cmd.extend(['-map', '0:v:0'])

        # Àudio - seleccionar la pista específica o la primera
        # audio_index ara és l'índex absolut del stream, utilitzem -map 0:{index}
        if audio_index is not None:
            cmd.extend(['-map', f'0:{audio_index}'])
            logger.info(f"Seleccionant àudio amb índex absolut {audio_index}")
        else:
            cmd.extend(['-map', '0:a:0?'])  # Primer àudio si existeix

        # Subtítols - burning (incrustar al vídeo)
        if subtitle_index is not None:
            # Escapar el path per al filtre de FFmpeg (necessita escapar : i \)
            escaped_path = file_path.replace('\\', '/').replace(':', '\\:').replace("'", "'\\''")

            # Utilitzar filtres per cremar subtítols al vídeo
            # El stream_index aquí és l'índex absolut del stream dins del fitxer
            subtitle_filter = f"subtitles='{escaped_path}':si={subtitle_index}"

            # Escalar si cal + subtítols
            video_filter = subtitle_filter
            cmd.extend(['-vf', video_filter])
            cmd.extend(['-c:v', 'libx264', '-preset', 'fast', '-crf', '22'])
            logger.info(f"Cremant subtítols amb índex {subtitle_index}")
        else:
            # Sense subtítols, copiar vídeo si és possible
            cmd.extend(['-c:v', 'copy'])

        # Configuració d'àudio
        cmd.extend([
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ac', '2'  # Stereo
        ])

        # Configuració HLS
        cmd.extend([
            '-f', 'hls',
            '-hls_time', '4',
            '-hls_list_size', '0',
            '-hls_segment_type', 'mpegts',
            '-hls_flags', 'independent_segments',
            '-hls_segment_filename', str(stream_dir / 'segment%04d.ts'),
            str(playlist_path)
        ])

        logger.info(f"Iniciant stream {stream_id}: {' '.join(cmd[:10])}...")

        # Executar FFmpeg en background
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

            self.active_streams[stream_id] = {
                'media_id': media_id,
                'file_path': file_path,
                'audio_index': audio_index,
                'subtitle_index': subtitle_index,
                'quality': quality,
                'playlist': str(playlist_path),
                'process': process
            }

        except Exception as e:
            logger.error(f"Error iniciant FFmpeg: {e}")
            raise

        return f"/api/stream/hls/{stream_id}/playlist.m3u8"

    def stop_stream(self, stream_id: str) -> bool:
        """Atura un stream actiu"""
        if stream_id in self.active_streams:
            stream = self.active_streams[stream_id]
            if 'process' in stream and stream['process'].poll() is None:
                stream['process'].terminate()
            del self.active_streams[stream_id]
            return True
        return False

    def cleanup_stream(self, stream_id: str) -> bool:
        """Elimina els fitxers d'un stream"""
        stream_dir = self.cache_dir / stream_id
        if stream_dir.exists():
            shutil.rmtree(stream_dir)
            return True
        return False

    def cleanup_old_streams(self, max_age_hours: int = 24):
        """Neteja streams antics"""
        import time
        current_time = time.time()
        max_age_seconds = max_age_hours * 3600

        for stream_dir in self.cache_dir.iterdir():
            if stream_dir.is_dir():
                dir_age = current_time - stream_dir.stat().st_mtime
                if dir_age > max_age_seconds:
                    stream_id = stream_dir.name
                    self.stop_stream(stream_id)
                    self.cleanup_stream(stream_id)
                    logger.info(f"Netejat stream antic: {stream_id}")

    def get_active_streams(self):
        """Retorna streams actius"""
        return {
            k: {key: v for key, v in val.items() if key != 'process'}
            for k, val in self.active_streams.items()
        }

    def get_stream_status(self, stream_id: str) -> dict:
        """Retorna l'estat d'un stream"""
        if stream_id not in self.active_streams:
            return {"status": "not_found"}

        stream = self.active_streams[stream_id]
        playlist_path = Path(stream['playlist'])

        # Comptar segments generats
        stream_dir = playlist_path.parent
        segments = list(stream_dir.glob("segment*.ts"))

        process_status = "unknown"
        if 'process' in stream:
            if stream['process'].poll() is None:
                process_status = "running"
            else:
                process_status = "finished" if stream['process'].returncode == 0 else "error"

        return {
            "status": process_status,
            "stream_id": stream_id,
            "segments_ready": len(segments),
            "playlist_exists": playlist_path.exists(),
            "media_id": stream['media_id']
        }

    def start_remote_stream(
        self,
        stream_url: str,
        stream_key: str,
        quality: str = "1080p",
        force_transcode: bool = True
    ) -> dict:
        """
        Inicia un stream HLS des d'una URL remota (Real-Debrid, etc.)

        Args:
            stream_url: URL del stream remot
            stream_key: Clau única per identificar el stream
            quality: Qualitat de sortida (1080p, 720p, 480p)
            force_transcode: Si True, sempre transcodifica a H.264

        Returns:
            dict amb playlist_url i stream_id, o error si FFmpeg no disponible
        """
        if not FFMPEG_AVAILABLE:
            return {
                "error": "FFmpeg no està instal·lat",
                "message": "Per transcodificar streams, instal·la FFmpeg: apt install ffmpeg",
                "stream_url": stream_url  # Retornem la URL original com a fallback
            }

        # Generar ID únic pel stream
        stream_id = hashlib.md5(f"{stream_key}_{quality}".encode()).hexdigest()[:12]

        # Crear directori pel stream
        stream_dir = self.cache_dir / stream_id
        stream_dir.mkdir(exist_ok=True)

        # Playlist path
        playlist_path = stream_dir / "playlist.m3u8"

        # Si ja existeix i el procés està actiu, retornar
        if stream_id in self.active_streams:
            process = self.active_streams[stream_id].get('process')
            if process and process.poll() is None:
                return {
                    "stream_id": stream_id,
                    "playlist_url": f"/api/stream/hls/{stream_id}/playlist.m3u8",
                    "status": "running"
                }

        # Netejar stream anterior si existeix
        if playlist_path.exists():
            shutil.rmtree(stream_dir)
            stream_dir.mkdir(exist_ok=True)

        # Configuració de qualitat
        quality_settings = {
            "4k": {"crf": "20", "preset": "fast", "maxrate": "20M", "bufsize": "40M"},
            "1080p": {"crf": "22", "preset": "fast", "maxrate": "8M", "bufsize": "16M"},
            "720p": {"crf": "23", "preset": "fast", "maxrate": "4M", "bufsize": "8M"},
            "480p": {"crf": "24", "preset": "fast", "maxrate": "2M", "bufsize": "4M"},
        }

        q = quality_settings.get(quality, quality_settings["1080p"])

        # Construir comanda FFmpeg per URL remota
        cmd = [
            'ffmpeg', '-y',
            '-reconnect', '1',                    # Reconnectar si es perd la connexió
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-timeout', '30000000',               # Timeout de 30 segons
            '-i', stream_url,                     # URL del stream
            '-map', '0:v:0',                      # Primer stream de vídeo
            '-map', '0:a:0?',                     # Primer stream d'àudio (opcional)
        ]

        if force_transcode:
            # Transcodificar a H.264 (compatible amb tots els navegadors)
            cmd.extend([
                '-c:v', 'libx264',
                '-preset', q['preset'],
                '-crf', q['crf'],
                '-maxrate', q['maxrate'],
                '-bufsize', q['bufsize'],
                '-pix_fmt', 'yuv420p',            # Compatibilitat màxima
            ])
        else:
            # Intentar copiar el vídeo sense re-codificar
            cmd.extend(['-c:v', 'copy'])

        # Configuració d'àudio
        cmd.extend([
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ac', '2'
        ])

        # Configuració HLS
        cmd.extend([
            '-f', 'hls',
            '-hls_time', '4',                     # Segments de 4 segons
            '-hls_list_size', '0',                # Mantenir tots els segments
            '-hls_segment_type', 'mpegts',
            '-hls_flags', 'independent_segments+append_list',
            '-hls_segment_filename', str(stream_dir / 'segment%04d.ts'),
            str(playlist_path)
        ])

        logger.info(f"Iniciant transcodificació remota {stream_id}")
        logger.debug(f"Comanda: ffmpeg -i [URL] ... {str(playlist_path)}")

        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

            self.active_streams[stream_id] = {
                'stream_url': stream_url,
                'stream_key': stream_key,
                'quality': quality,
                'playlist': str(playlist_path),
                'process': process,
                'type': 'remote'
            }

            return {
                "stream_id": stream_id,
                "playlist_url": f"/api/stream/hls/{stream_id}/playlist.m3u8",
                "status": "starting"
            }

        except Exception as e:
            logger.error(f"Error iniciant FFmpeg: {e}")
            return {
                "error": str(e),
                "stream_url": stream_url
            }

    async def wait_for_playlist(self, stream_id: str, timeout: float = 30.0) -> bool:
        """
        Espera fins que la playlist HLS estigui disponible.

        Returns:
            True si la playlist està llesta, False si timeout
        """
        playlist_path = self.cache_dir / stream_id / "playlist.m3u8"
        elapsed = 0
        interval = 0.5

        while elapsed < timeout:
            if playlist_path.exists() and playlist_path.stat().st_size > 0:
                # Verificar que hi ha almenys un segment
                segment_path = self.cache_dir / stream_id / "segment0000.ts"
                if segment_path.exists():
                    return True
            await asyncio.sleep(interval)
            elapsed += interval

        return False
