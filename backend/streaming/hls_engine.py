#!/usr/bin/env python3
"""
Motor de streaming HLS per Hermes
"""

import os
import subprocess
import hashlib
from pathlib import Path
from typing import Optional

class HermesStreamer:
    """Gestor de streaming HLS"""
    
    def __init__(self):
        self.cache_dir = Path("storage/cache/hls")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.active_streams = {}
        
    def start_stream(self, media_id: int, file_path: str, 
                    audio_index: Optional[int] = None,
                    subtitle_index: Optional[int] = None,
                    quality: str = "1080p") -> str:
        """Inicia un stream HLS"""
        
        # Generar ID únic pel stream
        stream_id = hashlib.md5(f"{media_id}_{audio_index}_{subtitle_index}".encode()).hexdigest()[:8]
        
        # Crear directori pel stream
        stream_dir = self.cache_dir / stream_id
        stream_dir.mkdir(exist_ok=True)
        
        # Playlist path
        playlist_path = stream_dir / "playlist.m3u8"
        
        # Si ja existeix, retornar
        if playlist_path.exists():
            return f"/api/stream/hls/{stream_id}/playlist.m3u8"
        
        # Construir comanda FFmpeg
        cmd = [
            'ffmpeg', '-i', file_path,
            '-c:v', 'copy',  # Copiar vídeo sense recodificar
            '-c:a', 'aac',   # Audio a AAC
            '-b:a', '128k',
            '-hls_time', '4',
            '-hls_list_size', '0',
            '-hls_segment_filename', str(stream_dir / 'segment%03d.ts'),
            '-f', 'hls',
            str(playlist_path)
        ]
        
        # Afegir selecció de pistes
        if audio_index is not None:
            cmd.insert(3, '-map')
            cmd.insert(4, f'0:v:0')
            cmd.insert(5, '-map')
            cmd.insert(6, f'0:a:{audio_index}')
        
        # Executar en background
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        self.active_streams[stream_id] = {
            'media_id': media_id,
            'file_path': file_path,
            'playlist': str(playlist_path)
        }
        
        return f"/api/stream/hls/{stream_id}/playlist.m3u8"
    
    def get_active_streams(self):
        """Retorna streams actius"""
        return self.active_streams
