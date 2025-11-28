#!/usr/bin/env python3
"""
Hermes Media Server - API Principal
"""

import os
import sys
import json
import sqlite3
import logging
from pathlib import Path
from typing import Optional, List, Dict
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Depends, Query, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
import mimetypes

# Afegir path per imports
sys.path.append(str(Path(__file__).parent.parent))
from config import settings
from backend.scanner.scan import HermesScanner
from backend.streaming.hls_engine import HermesStreamer

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Crear app FastAPI
app = FastAPI(
    title="Hermes Media Server",
    description="Sistema de streaming personal amb suport multi-pista",
    version="1.0.0"
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# === DATABASE ===
@contextmanager
def get_db():
    """Context manager per connexions a la BD"""
    conn = sqlite3.connect(
        settings.DATABASE_PATH,
        check_same_thread=False,
        isolation_level=None
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
    finally:
        conn.close()

# === MODELS ===
class ScanRequest(BaseModel):
    libraries: Optional[List[str]] = None
    force: bool = False

class StreamRequest(BaseModel):
    audio_index: Optional[int] = None
    subtitle_index: Optional[int] = None
    quality: str = "1080p"

class SegmentRequest(BaseModel):
    segment_type: str  # 'intro', 'recap', 'outro', 'credits', 'preview'
    start_time: float
    end_time: float
    source: str = "manual"

class SeriesSegmentRequest(BaseModel):
    """Per aplicar segments a tota una sèrie"""
    segment_type: str
    start_time: float
    end_time: float


# === STREAMING AMB RANGE SUPPORT ===

def get_range_header(range_header: str, file_size: int):
    """Parseja la capçalera Range i retorna start, end"""
    if not range_header:
        return 0, file_size - 1

    range_str = range_header.replace("bytes=", "")
    parts = range_str.split("-")

    start = int(parts[0]) if parts[0] else 0
    end = int(parts[1]) if parts[1] else file_size - 1

    # Limitar end a file_size - 1
    end = min(end, file_size - 1)

    return start, end


def stream_file_range(file_path: Path, start: int, end: int, chunk_size: int = 1024 * 1024):
    """Generator per streaming de rang de bytes"""
    with open(file_path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = f.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


async def stream_video_with_range(file_path: Path, request: Request):
    """Streaming de video amb suport Range requests per seek"""
    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    # Determinar el content type
    content_type, _ = mimetypes.guess_type(str(file_path))
    if not content_type:
        content_type = "video/mp4"

    if range_header:
        start, end = get_range_header(range_header, file_size)
        content_length = end - start + 1

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": content_type,
        }

        return StreamingResponse(
            stream_file_range(file_path, start, end),
            status_code=206,
            headers=headers,
            media_type=content_type
        )
    else:
        # Sense Range header, retornar tot el fitxer
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": content_type,
        }

        return StreamingResponse(
            stream_file_range(file_path, 0, file_size - 1),
            status_code=200,
            headers=headers,
            media_type=content_type
        )


# === ENDPOINTS ===

@app.get("/")
async def root():
    """Endpoint arrel"""
    return {
        "name": "Hermes Media Server",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/api/library/stats")
async def get_stats():
    """Retorna estadístiques de la biblioteca"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Series
        cursor.execute("SELECT COUNT(*) FROM series WHERE media_type = 'series'")
        series_count = cursor.fetchone()[0]
        
        # Pel·lícules
        cursor.execute("SELECT COUNT(*) FROM series WHERE media_type = 'movie'")
        movies_count = cursor.fetchone()[0]
        
        # Arxius
        cursor.execute("SELECT COUNT(*) FROM media_files")
        files_count = cursor.fetchone()[0]
        
        # Durada total
        cursor.execute("SELECT SUM(duration) FROM media_files")
        total_duration = cursor.fetchone()[0] or 0
        
        # Mida total
        cursor.execute("SELECT SUM(file_size) FROM media_files")
        total_size = cursor.fetchone()[0] or 0
        
        return {
            "series": series_count,
            "movies": movies_count,
            "files": files_count,
            "total_hours": round(total_duration / 3600, 1),
            "total_gb": round(total_size / (1024**3), 2)
        }

@app.get("/api/library/series")
async def get_series():
    """Retorna totes les sèries"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.*, COUNT(DISTINCT m.season_number) as season_count,
                       COUNT(m.id) as episode_count
            FROM series s
            LEFT JOIN media_files m ON s.id = m.series_id
            WHERE s.media_type = 'series'
            GROUP BY s.id
            ORDER BY s.name
        """)
        
        series = []
        for row in cursor.fetchall():
            series.append({
                "id": row["id"],
                "name": row["name"],
                "path": row["path"],
                "poster": row["poster"],
                "backdrop": row["backdrop"],
                "season_count": row["season_count"],
                "episode_count": row["episode_count"]
            })
        
        return series

@app.get("/api/library/movies")
async def get_movies():
    """Retorna totes les pel·lícules"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.*, m.duration, m.file_size
            FROM series s
            LEFT JOIN media_files m ON s.id = m.series_id
            WHERE s.media_type = 'movie'
            ORDER BY s.name
        """)
        
        movies = []
        for row in cursor.fetchall():
            movies.append({
                "id": row["id"],
                "name": row["name"],
                "poster": row["poster"],
                "backdrop": row["backdrop"],
                "duration": row["duration"],
                "file_size": row["file_size"]
            })
        
        return movies

@app.get("/api/series/{series_id}")
async def get_series_detail(series_id: int):
    """Retorna detalls d'una sèrie amb temporades"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Info de la sèrie
        cursor.execute("SELECT * FROM series WHERE id = ?", (series_id,))
        series = cursor.fetchone()
        
        if not series:
            raise HTTPException(status_code=404, detail="Sèrie no trobada")
        
        # Temporades
        cursor.execute("""
            SELECT DISTINCT season_number, COUNT(*) as episode_count
            FROM media_files
            WHERE series_id = ?
            GROUP BY season_number
            ORDER BY season_number
        """, (series_id,))
        
        seasons = []
        for row in cursor.fetchall():
            seasons.append({
                "season_number": row["season_number"],
                "episode_count": row["episode_count"]
            })
        
        return {
            "id": series["id"],
            "name": series["name"],
            "poster": series["poster"],
            "backdrop": series["backdrop"],
            "seasons": seasons
        }

@app.get("/api/series/{series_id}/season/{season_number}")
async def get_season_episodes(series_id: int, season_number: int):
    """Retorna episodis d'una temporada"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM media_files
            WHERE series_id = ? AND season_number = ?
            ORDER BY episode_number
        """, (series_id, season_number))
        
        episodes = []
        for row in cursor.fetchall():
            episodes.append({
                "id": row["id"],
                "episode_number": row["episode_number"],
                "title": row["title"],
                "file_path": row["file_path"],
                "duration": row["duration"],
                "audio_tracks": json.loads(row["audio_tracks"] or "[]"),
                "subtitle_tracks": json.loads(row["subtitle_tracks"] or "[]")
            })
        
        return episodes

@app.get("/api/stream/{media_id}/direct")
async def stream_direct(media_id: int, request: Request):
    """Streaming directe del fitxer amb suport Range"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM media_files WHERE id = ?", (media_id,))
        result = cursor.fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Arxiu no trobat")

        file_path = Path(result["file_path"])
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Arxiu no existeix")

        return await stream_video_with_range(file_path, request)

@app.post("/api/stream/{media_id}/hls")
async def stream_hls(media_id: int, request: StreamRequest):
    """Inicia streaming HLS amb selecció de pistes"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM media_files WHERE id = ?", (media_id,))
        media = cursor.fetchone()

        if not media:
            raise HTTPException(status_code=404, detail="Media no trobat")

        streamer = HermesStreamer()
        playlist_url = streamer.start_stream(
            media_id=media_id,
            file_path=media["file_path"],
            audio_index=request.audio_index,
            subtitle_index=request.subtitle_index,
            quality=request.quality
        )

        return {"playlist_url": playlist_url}

@app.get("/api/stream/hls/{stream_id}/playlist.m3u8")
async def get_hls_playlist(stream_id: str):
    """Serveix la playlist HLS"""
    playlist_path = Path(f"storage/cache/hls/{stream_id}/playlist.m3u8")

    if not playlist_path.exists():
        raise HTTPException(status_code=404, detail="Playlist no trobada")

    return FileResponse(
        path=playlist_path,
        media_type="application/vnd.apple.mpegurl",
        headers={"Cache-Control": "no-cache"}
    )

@app.get("/api/stream/hls/{stream_id}/{segment}")
async def get_hls_segment(stream_id: str, segment: str):
    """Serveix segments HLS (.ts)"""
    segment_path = Path(f"storage/cache/hls/{stream_id}/{segment}")

    if not segment_path.exists():
        raise HTTPException(status_code=404, detail="Segment no trobat")

    return FileResponse(
        path=segment_path,
        media_type="video/mp2t"
    )

@app.get("/api/media/{media_id}")
async def get_media_detail(media_id: int):
    """Retorna detalls d'un fitxer media individual"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.*, s.name as series_name, s.poster, s.backdrop
            FROM media_files m
            LEFT JOIN series s ON m.series_id = s.id
            WHERE m.id = ?
        """, (media_id,))
        media = cursor.fetchone()

        if not media:
            raise HTTPException(status_code=404, detail="Media no trobat")

        return {
            "id": media["id"],
            "title": media["title"],
            "series_name": media["series_name"],
            "season_number": media["season_number"],
            "episode_number": media["episode_number"],
            "file_path": media["file_path"],
            "duration": media["duration"],
            "width": media["width"],
            "height": media["height"],
            "video_codec": media["video_codec"],
            "audio_tracks": json.loads(media["audio_tracks"] or "[]"),
            "subtitle_tracks": json.loads(media["subtitle_tracks"] or "[]"),
            "poster": media["poster"],
            "backdrop": media["backdrop"]
        }

@app.get("/api/movie/{movie_id}")
async def get_movie_detail(movie_id: int):
    """Retorna detalls d'una pel·lícula"""
    with get_db() as conn:
        cursor = conn.cursor()
        # Primer obtenim la info de la pel·lícula
        cursor.execute("""
            SELECT s.*, m.id as media_id, m.duration, m.file_size, m.width, m.height,
                   m.video_codec, m.audio_tracks, m.subtitle_tracks, m.file_path
            FROM series s
            LEFT JOIN media_files m ON s.id = m.series_id
            WHERE s.id = ? AND s.media_type = 'movie'
        """, (movie_id,))
        movie = cursor.fetchone()

        if not movie:
            raise HTTPException(status_code=404, detail="Pel·lícula no trobada")

        return {
            "id": movie["id"],
            "media_id": movie["media_id"],
            "name": movie["name"],
            "poster": movie["poster"],
            "backdrop": movie["backdrop"],
            "duration": movie["duration"],
            "file_size": movie["file_size"],
            "width": movie["width"],
            "height": movie["height"],
            "video_codec": movie["video_codec"],
            "audio_tracks": json.loads(movie["audio_tracks"] or "[]"),
            "subtitle_tracks": json.loads(movie["subtitle_tracks"] or "[]"),
            "file_path": movie["file_path"]
        }

@app.post("/api/library/scan")
async def scan_library(request: ScanRequest = None):
    """Escaneja la biblioteca"""
    scanner = HermesScanner()
    
    for library in settings.MEDIA_LIBRARIES:
        if Path(library["path"]).exists():
            logger.info(f"Escanejant {library['name']}")
            scanner.scan_directory(library["path"], library["type"])
    
    stats = scanner.get_stats()
    return {
        "status": "success",
        "stats": stats
    }

@app.get("/api/image/poster/{item_id}")
async def get_poster(item_id: int):
    """Retorna el poster d'un item"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT poster FROM series WHERE id = ?", (item_id,))
        result = cursor.fetchone()
        
        if result and result["poster"]:
            poster_path = Path(result["poster"])
            if poster_path.exists():
                return FileResponse(poster_path)
    
    # Retornar placeholder si no hi ha poster
    return {"error": "No poster available"}

@app.get("/api/image/backdrop/{item_id}")
async def get_backdrop(item_id: int):
    """Retorna el backdrop d'un item"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT backdrop FROM series WHERE id = ?", (item_id,))
        result = cursor.fetchone()

        if result and result["backdrop"]:
            backdrop_path = Path(result["backdrop"])
            if backdrop_path.exists():
                return FileResponse(backdrop_path)

    return {"error": "No backdrop available"}


# === ENDPOINTS COMPATIBILITAT FRONTEND ===

@app.get("/api/library/series/{series_id}")
async def get_library_series_detail(series_id: int):
    """Alias per compatibilitat amb frontend - Detalls sèrie"""
    return await get_series_detail(series_id)


@app.get("/api/library/series/{series_id}/seasons")
async def get_series_seasons(series_id: int):
    """Retorna les temporades d'una sèrie"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Verificar que existeix la sèrie
        cursor.execute("SELECT id FROM series WHERE id = ?", (series_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        cursor.execute("""
            SELECT DISTINCT season_number, COUNT(*) as episode_count
            FROM media_files
            WHERE series_id = ?
            GROUP BY season_number
            ORDER BY season_number
        """, (series_id,))

        seasons = []
        for row in cursor.fetchall():
            seasons.append({
                "id": row["season_number"],
                "season_number": row["season_number"],
                "episode_count": row["episode_count"]
            })

        return seasons


@app.delete("/api/library/series/{series_id}")
async def delete_series(series_id: int):
    """
    Elimina una sèrie i tots els seus episodis de la base de dades.
    No elimina els fitxers del disc, només de la BD.
    """
    with get_db() as conn:
        cursor = conn.cursor()

        # Verificar que existeix
        cursor.execute("SELECT name FROM series WHERE id = ?", (series_id,))
        series = cursor.fetchone()
        if not series:
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        series_name = series["name"]

        # Obtenir IDs dels episodis per eliminar segments i progress
        cursor.execute("SELECT id FROM media_files WHERE series_id = ?", (series_id,))
        episode_ids = [row["id"] for row in cursor.fetchall()]

        # Eliminar segments dels episodis
        if episode_ids:
            placeholders = ",".join("?" * len(episode_ids))
            cursor.execute(f"DELETE FROM media_segments WHERE media_id IN ({placeholders})", episode_ids)
            cursor.execute(f"DELETE FROM watch_progress WHERE media_id IN ({placeholders})", episode_ids)

        # Eliminar segments de la sèrie
        cursor.execute("DELETE FROM media_segments WHERE series_id = ?", (series_id,))

        # Eliminar episodis
        cursor.execute("DELETE FROM media_files WHERE series_id = ?", (series_id,))
        episodes_deleted = cursor.rowcount

        # Eliminar sèrie
        cursor.execute("DELETE FROM series WHERE id = ?", (series_id,))

        conn.commit()

        return {
            "status": "success",
            "message": f"Sèrie '{series_name}' eliminada",
            "episodes_deleted": episodes_deleted
        }


@app.post("/api/library/cleanup")
async def cleanup_library():
    """
    Neteja la biblioteca eliminant sèries i episodis que ja no existeixen al disc.
    """
    import os

    with get_db() as conn:
        cursor = conn.cursor()

        stats = {
            "series_removed": 0,
            "episodes_removed": 0,
            "series_details": []
        }

        # Buscar sèries amb paths que no existeixen
        cursor.execute("SELECT id, name, path FROM series")
        series_list = cursor.fetchall()

        for series in series_list:
            if not os.path.exists(series["path"]):
                # La carpeta de la sèrie no existeix, eliminar-la
                series_id = series["id"]
                series_name = series["name"]

                # Obtenir IDs dels episodis
                cursor.execute("SELECT id FROM media_files WHERE series_id = ?", (series_id,))
                episode_ids = [row["id"] for row in cursor.fetchall()]

                # Eliminar segments i progress
                if episode_ids:
                    placeholders = ",".join("?" * len(episode_ids))
                    cursor.execute(f"DELETE FROM media_segments WHERE media_id IN ({placeholders})", episode_ids)
                    cursor.execute(f"DELETE FROM watch_progress WHERE media_id IN ({placeholders})", episode_ids)

                cursor.execute("DELETE FROM media_segments WHERE series_id = ?", (series_id,))
                cursor.execute("DELETE FROM media_files WHERE series_id = ?", (series_id,))
                episodes_count = cursor.rowcount
                cursor.execute("DELETE FROM series WHERE id = ?", (series_id,))

                stats["series_removed"] += 1
                stats["episodes_removed"] += episodes_count
                stats["series_details"].append({
                    "name": series_name,
                    "episodes_removed": episodes_count
                })

                logger.info(f"Netejat: {series_name} ({episodes_count} episodis)")

        # També buscar episodis orfes (fitxers que no existeixen)
        cursor.execute("SELECT id, file_path, series_id FROM media_files")
        for media in cursor.fetchall():
            if not os.path.exists(media["file_path"]):
                media_id = media["id"]
                cursor.execute("DELETE FROM media_segments WHERE media_id = ?", (media_id,))
                cursor.execute("DELETE FROM watch_progress WHERE media_id = ?", (media_id,))
                cursor.execute("DELETE FROM media_files WHERE id = ?", (media_id,))
                stats["episodes_removed"] += 1

        conn.commit()

        return {
            "status": "success",
            "message": f"Neteja completada: {stats['series_removed']} sèries i {stats['episodes_removed']} episodis eliminats",
            **stats
        }


@app.get("/api/library/series/{series_id}/seasons/{season_number}/episodes")
async def get_library_season_episodes(series_id: int, season_number: int):
    """Retorna episodis d'una temporada - format frontend"""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT m.*, s.name as series_name, s.poster, s.backdrop
            FROM media_files m
            LEFT JOIN series s ON m.series_id = s.id
            WHERE m.series_id = ? AND m.season_number = ?
            ORDER BY m.episode_number
        """, (series_id, season_number))

        episodes = []
        for row in cursor.fetchall():
            episodes.append({
                "id": row["id"],
                "series_id": series_id,
                "series_name": row["series_name"],
                "season_number": row["season_number"],
                "episode_number": row["episode_number"],
                "name": row["title"],
                "file_path": row["file_path"],
                "duration": row["duration"],
                "audio_tracks": row["audio_tracks"],
                "subtitles": row["subtitle_tracks"],
                "poster": row["poster"],
                "backdrop": row["backdrop"],
                "watch_progress": 0  # TODO: Implementar progress
            })

        return episodes


@app.get("/api/library/movies/{movie_id}")
async def get_library_movie_detail(movie_id: int):
    """Detalls pel·lícula - format frontend"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.*, m.id as media_id, m.duration, m.file_size, m.width, m.height,
                   m.video_codec, m.audio_tracks, m.subtitle_tracks, m.file_path
            FROM series s
            LEFT JOIN media_files m ON s.id = m.series_id
            WHERE s.id = ? AND s.media_type = 'movie'
        """, (movie_id,))
        movie = cursor.fetchone()

        if not movie:
            raise HTTPException(status_code=404, detail="Pel·lícula no trobada")

        return {
            "id": movie["id"],
            "media_id": movie["media_id"],
            "name": movie["name"],
            "poster": movie["poster"],
            "backdrop": movie["backdrop"],
            "duration": movie["duration"],
            "file_size": movie["file_size"],
            "width": movie["width"],
            "height": movie["height"],
            "video_codec": movie["video_codec"],
            "audio_tracks": movie["audio_tracks"],
            "subtitles": movie["subtitle_tracks"],
            "file_path": movie["file_path"]
        }


@app.get("/api/library/episodes/{episode_id}")
async def get_episode_detail(episode_id: int):
    """Detalls d'un episodi individual"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.*, s.name as series_name, s.id as series_id, s.poster, s.backdrop
            FROM media_files m
            LEFT JOIN series s ON m.series_id = s.id
            WHERE m.id = ?
        """, (episode_id,))
        episode = cursor.fetchone()

        if not episode:
            raise HTTPException(status_code=404, detail="Episodi no trobat")

        return {
            "id": episode["id"],
            "series_id": episode["series_id"],
            "series_name": episode["series_name"],
            "name": episode["title"],
            "season_number": episode["season_number"],
            "episode_number": episode["episode_number"],
            "file_path": episode["file_path"],
            "duration": episode["duration"],
            "audio_tracks": episode["audio_tracks"],
            "subtitles": episode["subtitle_tracks"],
            "poster": episode["poster"],
            "backdrop": episode["backdrop"]
        }


@app.get("/api/stream/episode/{episode_id}")
async def stream_episode(episode_id: int, request: Request):
    """Streaming directe d'un episodi amb suport Range"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM media_files WHERE id = ?", (episode_id,))
        result = cursor.fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Episodi no trobat")

        file_path = Path(result["file_path"])
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Arxiu no existeix")

        return await stream_video_with_range(file_path, request)


@app.get("/api/stream/movie/{movie_id}")
async def stream_movie(movie_id: int, request: Request):
    """Streaming directe d'una pel·lícula amb suport Range"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.file_path FROM media_files m
            JOIN series s ON m.series_id = s.id
            WHERE s.id = ? AND s.media_type = 'movie'
        """, (movie_id,))
        result = cursor.fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Pel·lícula no trobada")

        file_path = Path(result["file_path"])
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Arxiu no existeix")

        return await stream_video_with_range(file_path, request)


# === SEGMENTS (INTRO/RECAP/OUTRO) ===

@app.get("/api/segments/media/{media_id}")
async def get_media_segments(media_id: int):
    """Retorna els segments d'un fitxer media (episodi o pel·lícula)"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Obtenir segments específics per aquest media
        cursor.execute("""
            SELECT * FROM media_segments
            WHERE media_id = ?
            ORDER BY start_time
        """, (media_id,))

        segments = []
        for row in cursor.fetchall():
            row_dict = dict(row)
            segments.append({
                "id": row_dict["id"],
                "segment_type": row_dict["segment_type"],
                "start_time": row_dict["start_time"],
                "end_time": row_dict["end_time"],
                "source": row_dict["source"],
                "confidence": row_dict.get("confidence", 1.0)
            })

        # Si no hi ha segments específics, buscar per sèrie
        if not segments:
            cursor.execute("""
                SELECT series_id FROM media_files WHERE id = ?
            """, (media_id,))
            result = cursor.fetchone()

            if result and result["series_id"]:
                cursor.execute("""
                    SELECT * FROM media_segments
                    WHERE series_id = ? AND media_id IS NULL
                    ORDER BY start_time
                """, (result["series_id"],))

                for row in cursor.fetchall():
                    row_dict = dict(row)
                    segments.append({
                        "id": row_dict["id"],
                        "segment_type": row_dict["segment_type"],
                        "start_time": row_dict["start_time"],
                        "end_time": row_dict["end_time"],
                        "source": row_dict["source"],
                        "confidence": row_dict.get("confidence", 1.0)
                    })

        return segments


@app.post("/api/segments/media/{media_id}")
async def save_media_segment(media_id: int, segment: SegmentRequest):
    """Guarda un segment per a un fitxer media específic"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Verificar que existeix el media
        cursor.execute("SELECT id FROM media_files WHERE id = ?", (media_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Media no trobat")

        # Eliminar segment existent del mateix tipus
        cursor.execute("""
            DELETE FROM media_segments
            WHERE media_id = ? AND segment_type = ?
        """, (media_id, segment.segment_type))

        # Inserir nou segment
        cursor.execute("""
            INSERT INTO media_segments (media_id, segment_type, start_time, end_time, source)
            VALUES (?, ?, ?, ?, ?)
        """, (media_id, segment.segment_type, segment.start_time, segment.end_time, segment.source))

        conn.commit()
        return {"status": "success", "message": f"Segment {segment.segment_type} guardat"}


@app.post("/api/segments/series/{series_id}")
async def save_series_segment(series_id: int, segment: SeriesSegmentRequest):
    """Guarda un segment per a tota una sèrie (s'aplica a tots els episodis)"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Verificar que existeix la sèrie
        cursor.execute("SELECT id FROM series WHERE id = ?", (series_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        # Eliminar segment existent del mateix tipus per la sèrie
        cursor.execute("""
            DELETE FROM media_segments
            WHERE series_id = ? AND media_id IS NULL AND segment_type = ?
        """, (series_id, segment.segment_type))

        # Inserir nou segment per la sèrie
        cursor.execute("""
            INSERT INTO media_segments (series_id, segment_type, start_time, end_time, source)
            VALUES (?, ?, ?, ?, 'manual')
        """, (series_id, segment.segment_type, segment.start_time, segment.end_time))

        conn.commit()
        return {"status": "success", "message": f"Segment {segment.segment_type} guardat per la sèrie"}


@app.delete("/api/segments/{segment_id}")
async def delete_segment(segment_id: int):
    """Elimina un segment"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM media_segments WHERE id = ?", (segment_id,))
        conn.commit()
        return {"status": "success"}


@app.delete("/api/segments/series/{series_id}")
async def delete_series_segments(series_id: int):
    """Elimina tots els segments d'una sèrie"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM media_segments WHERE series_id = ?", (series_id,))
        cursor.execute("DELETE FROM media_segments WHERE media_id IN (SELECT id FROM media_files WHERE series_id = ?)", (series_id,))
        deleted = cursor.rowcount
        conn.commit()
        return {"status": "success", "deleted": deleted}


@app.post("/api/segments/series/{series_id}/detect")
async def detect_series_segments(series_id: int, clear_existing: bool = True):
    """Detecta intros per una sèrie usant audio fingerprinting"""
    from backend.segments.fingerprint import AudioFingerprinter

    # Opcionalment esborrar segments existents
    if clear_existing:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM media_segments WHERE series_id = ?", (series_id,))
            cursor.execute("DELETE FROM media_segments WHERE media_id IN (SELECT id FROM media_files WHERE series_id = ?)", (series_id,))
            conn.commit()

    try:
        fingerprinter = AudioFingerprinter()
        result = fingerprinter.detect_intro_for_series(series_id)
        return result
    except Exception as e:
        logger.error(f"Error detectant intros: {e}")
        return {"status": "error", "message": str(e)}


@app.delete("/api/segments/cleanup")
async def cleanup_segments(min_confidence: float = 0.7):
    """Elimina tots els segments amb confiança baixa o duracions poc realistes"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Eliminar segments amb baixa confiança
        cursor.execute("""
            DELETE FROM media_segments
            WHERE confidence < ? OR confidence IS NULL
        """, (min_confidence,))
        low_confidence = cursor.rowcount

        # Eliminar segments amb duració poc realista (> 2 min o < 30s)
        cursor.execute("""
            DELETE FROM media_segments
            WHERE (end_time - start_time) > 120
               OR (end_time - start_time) < 30
        """)
        bad_duration = cursor.rowcount

        conn.commit()
        return {
            "status": "success",
            "deleted_low_confidence": low_confidence,
            "deleted_bad_duration": bad_duration,
            "total_deleted": low_confidence + bad_duration
        }


class PropagateIntroRequest(BaseModel):
    intro_start: float
    intro_end: float


@app.post("/api/segments/episode/{episode_id}/propagate")
async def propagate_intro(episode_id: int, request: PropagateIntroRequest, background_tasks: BackgroundTasks):
    """
    Propaga una intro marcada manualment a tots els episodis de la sèrie.

    Busca l'àudio de la intro de referència a cada episodi individualment,
    gestionant cold opens i variacions de timing.
    """
    from backend.segments.fingerprint import AudioFingerprinter

    try:
        fingerprinter = AudioFingerprinter()
        result = fingerprinter.propagate_intro_to_episodes(
            episode_id,
            request.intro_start,
            request.intro_end
        )
        return result
    except Exception as e:
        logger.error(f"Error propagant intro: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/api/library/episodes/{episode_id}/next")
async def get_next_episode(episode_id: int):
    """Retorna el següent episodi d'una sèrie"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Obtenir info de l'episodi actual
        cursor.execute("""
            SELECT series_id, season_number, episode_number
            FROM media_files WHERE id = ?
        """, (episode_id,))
        current = cursor.fetchone()

        if not current:
            raise HTTPException(status_code=404, detail="Episodi no trobat")

        # Buscar següent episodi (mateixa temporada)
        cursor.execute("""
            SELECT id, season_number, episode_number, title
            FROM media_files
            WHERE series_id = ? AND season_number = ? AND episode_number > ?
            ORDER BY episode_number
            LIMIT 1
        """, (current["series_id"], current["season_number"], current["episode_number"]))

        next_ep = cursor.fetchone()

        # Si no hi ha més episodis en aquesta temporada, buscar primera de la següent
        if not next_ep:
            cursor.execute("""
                SELECT id, season_number, episode_number, title
                FROM media_files
                WHERE series_id = ? AND season_number > ?
                ORDER BY season_number, episode_number
                LIMIT 1
            """, (current["series_id"], current["season_number"]))
            next_ep = cursor.fetchone()

        if not next_ep:
            return None

        return {
            "id": next_ep["id"],
            "season_number": next_ep["season_number"],
            "episode_number": next_ep["episode_number"],
            "title": next_ep["title"]
        }


@app.get("/api/library/episodes/{episode_id}/prev")
async def get_prev_episode(episode_id: int):
    """Retorna l'episodi anterior d'una sèrie"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Obtenir info de l'episodi actual
        cursor.execute("""
            SELECT series_id, season_number, episode_number
            FROM media_files WHERE id = ?
        """, (episode_id,))
        current = cursor.fetchone()

        if not current:
            raise HTTPException(status_code=404, detail="Episodi no trobat")

        # Buscar episodi anterior (mateixa temporada)
        cursor.execute("""
            SELECT id, season_number, episode_number, title
            FROM media_files
            WHERE series_id = ? AND season_number = ? AND episode_number < ?
            ORDER BY episode_number DESC
            LIMIT 1
        """, (current["series_id"], current["season_number"], current["episode_number"]))

        prev_ep = cursor.fetchone()

        # Si no hi ha episodis anteriors en aquesta temporada, buscar últim de l'anterior
        if not prev_ep:
            cursor.execute("""
                SELECT id, season_number, episode_number, title
                FROM media_files
                WHERE series_id = ? AND season_number < ?
                ORDER BY season_number DESC, episode_number DESC
                LIMIT 1
            """, (current["series_id"], current["season_number"]))
            prev_ep = cursor.fetchone()

        if not prev_ep:
            return None

        return {
            "id": prev_ep["id"],
            "season_number": prev_ep["season_number"],
            "episode_number": prev_ep["episode_number"],
            "title": prev_ep["title"]
        }


# === AUTO-DETECTION DE SEGMENTS ===

class TemplateRequest(BaseModel):
    """Per aplicar template de segments a una sèrie"""
    intro_start: Optional[float] = None
    intro_end: Optional[float] = None
    outro_start: Optional[float] = None  # Pot ser negatiu (des del final)
    outro_end: Optional[float] = None


@app.post("/api/segments/detect/series/{series_id}")
async def detect_segments_for_series(series_id: int):
    """Detecta automàticament intros per una sèrie usant audio fingerprinting"""
    try:
        from backend.segments.fingerprint import AudioFingerprinter

        fingerprinter = AudioFingerprinter()
        result = fingerprinter.detect_intro_for_series(series_id)

        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error detectant intros: {e}")
        raise HTTPException(status_code=500, detail="Error detectant intros")


@app.post("/api/segments/template/series/{series_id}")
async def apply_segment_template(series_id: int, template: TemplateRequest):
    """Aplica una plantilla de timestamps a tots els episodis d'una sèrie

    Útil quan l'intro sempre comença i acaba al mateix temps.
    Exemple: intro_start=0, intro_end=90 per una intro de 90 segons
    Per l'outro, es poden usar valors negatius per indicar des del final:
    outro_start=-90, outro_end=0 significa els últims 90 segons
    """
    from backend.segments.detector import SegmentDetector

    detector = SegmentDetector()
    updated = detector.apply_template_to_series(
        series_id,
        intro_start=template.intro_start,
        intro_end=template.intro_end,
        outro_start=template.outro_start,
        outro_end=template.outro_end
    )

    return {
        "status": "success",
        "series_id": series_id,
        "episodes_updated": updated
    }


# ============================================================
# ESCANEIG D'INTROS PER TOTA LA BIBLIOTECA
# ============================================================

@app.post("/api/segments/detect/all")
async def detect_intros_all_series(background_tasks: BackgroundTasks):
    """
    Detecta intros per totes les sèries de la biblioteca.

    Usa el nou algorisme v2 que:
    - Compara segments d'àudio entre episodis consecutius
    - Detecta l'opening independentment de la seva posició (cold opens)
    - Detecta canvis d'opening entre temporades/arcs
    """
    from backend.segments.fingerprint import detect_intros_for_all_series

    # Executar en background per no bloquejar
    background_tasks.add_task(detect_intros_for_all_series)

    return {
        "status": "started",
        "message": "Escaneig iniciat en background. Revisa els logs per veure el progrés."
    }


@app.get("/api/segments/detect/all/sync")
async def detect_intros_all_series_sync():
    """
    Detecta intros per totes les sèries (versió síncrona).
    ATENCIÓ: Pot trigar molt! Usar només per proves o biblioteques petites.
    """
    from backend.segments.fingerprint import detect_intros_for_all_series

    results = detect_intros_for_all_series()
    return results


@app.post("/api/segments/detect/series/{series_id}/v2")
async def detect_intros_series_v2(series_id: int):
    """
    Detecta intros per una sèrie usant l'algorisme v2.

    Millor per sèries amb:
    - Cold opens (escenes abans de l'opening)
    - Canvis d'opening
    - Intros en posicions variables
    """
    from backend.segments.fingerprint import AudioFingerprinterV2

    try:
        fingerprinter = AudioFingerprinterV2()
        result = fingerprinter.detect_intros_for_series(series_id)
        return result
    except Exception as e:
        logger.error(f"Error detectant intros v2: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# BIBLIOTECA DE LLIBRES
# ============================================================

@app.get("/api/books/authors")
async def get_authors():
    """Retorna tots els autors"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.*, COUNT(b.id) as book_count
            FROM authors a
            LEFT JOIN books b ON a.id = b.author_id
            GROUP BY a.id
            ORDER BY a.name
        """)
        authors = [dict(row) for row in cursor.fetchall()]
        return authors


@app.get("/api/books/authors/{author_id}")
async def get_author_detail(author_id: int):
    """Retorna detalls d'un autor i els seus llibres"""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM authors WHERE id = ?", (author_id,))
        author = cursor.fetchone()
        if not author:
            raise HTTPException(status_code=404, detail="Autor no trobat")

        cursor.execute("""
            SELECT * FROM books WHERE author_id = ?
            ORDER BY title
        """, (author_id,))
        books = [dict(row) for row in cursor.fetchall()]

        return {
            **dict(author),
            "books": books
        }


@app.get("/api/books")
async def get_all_books():
    """Retorna tots els llibres"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.*, a.name as author_name
            FROM books b
            LEFT JOIN authors a ON b.author_id = a.id
            ORDER BY b.title
        """)
        books = [dict(row) for row in cursor.fetchall()]
        return books


@app.get("/api/books/{book_id}")
async def get_book_detail(book_id: int):
    """Retorna detalls d'un llibre"""
    from backend.books.reader import BookReader

    reader = BookReader()
    book = reader.get_book_info(book_id)

    if not book:
        raise HTTPException(status_code=404, detail="Llibre no trobat")

    # Afegir progrés de lectura
    progress = reader.get_reading_progress(book_id)
    book['reading_progress'] = progress

    return book


@app.get("/api/books/{book_id}/content")
async def get_book_content(book_id: int):
    """Retorna el contingut estructurat d'un llibre (per EPUB)"""
    from backend.books.reader import BookReader

    reader = BookReader()
    content_type, file_path = reader.get_book_content_type(book_id)

    if not file_path:
        raise HTTPException(status_code=404, detail="Llibre no trobat")

    if content_type == 'epub':
        content = reader.get_epub_content(book_id)
        if content:
            return {"type": "epub", "content": content}

    elif content_type == 'pdf':
        return {"type": "pdf", "file_path": file_path}

    raise HTTPException(status_code=400, detail=f"Format {content_type} no suportat per visualització")


@app.get("/api/books/{book_id}/resource/{resource_path:path}")
async def get_book_resource(book_id: int, resource_path: str):
    """Serveix un recurs d'un EPUB (HTML, CSS, imatges)"""
    from backend.books.reader import BookReader

    reader = BookReader()
    content, mime_type = reader.get_epub_resource(book_id, resource_path)

    if content is None:
        raise HTTPException(status_code=404, detail="Recurs no trobat")

    return Response(content=content, media_type=mime_type)


@app.get("/api/books/{book_id}/file")
async def get_book_file(book_id: int):
    """Serveix el fitxer del llibre directament (per PDF viewer)"""
    from backend.books.reader import BookReader

    reader = BookReader()
    book = reader.get_book_info(book_id)

    if not book:
        raise HTTPException(status_code=404, detail="Llibre no trobat")

    file_path = book['file_path']

    # Si és MOBI/AZW i tenim versió convertida, servir l'EPUB
    if book['format'] in ['mobi', 'azw', 'azw3'] and book.get('converted_path'):
        if os.path.exists(book['converted_path']):
            file_path = book['converted_path']

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Fitxer no trobat")

    return FileResponse(
        path=file_path,
        filename=os.path.basename(file_path),
        media_type='application/octet-stream'
    )


@app.get("/api/books/{book_id}/cover")
async def get_book_cover(book_id: int):
    """Serveix la portada d'un llibre"""
    from backend.books.reader import BookReader

    reader = BookReader()
    book = reader.get_book_info(book_id)

    if not book or not book.get('cover'):
        raise HTTPException(status_code=404, detail="Portada no trobada")

    if not os.path.exists(book['cover']):
        raise HTTPException(status_code=404, detail="Fitxer de portada no trobat")

    return FileResponse(path=book['cover'], media_type='image/jpeg')


class ReadingProgressRequest(BaseModel):
    position: str
    page: int = 0
    total_pages: int = 0


@app.post("/api/books/{book_id}/progress")
async def update_reading_progress(book_id: int, progress: ReadingProgressRequest):
    """Actualitza el progrés de lectura"""
    from backend.books.reader import BookReader

    reader = BookReader()
    reader.update_reading_progress(
        book_id,
        progress.position,
        progress.page,
        progress.total_pages
    )

    return {"status": "success"}


@app.get("/api/books/{book_id}/progress")
async def get_reading_progress(book_id: int):
    """Obté el progrés de lectura"""
    from backend.books.reader import BookReader

    reader = BookReader()
    progress = reader.get_reading_progress(book_id)

    if not progress:
        return {"current_position": None, "current_page": 0, "percentage": 0}

    return progress


@app.post("/api/books/scan")
async def scan_books_library(background_tasks: BackgroundTasks):
    """Escaneja la biblioteca de llibres"""
    from backend.books.scanner import BooksScanner

    def do_scan():
        scanner = BooksScanner()
        return scanner.scan_all_libraries()

    background_tasks.add_task(do_scan)

    return {
        "status": "started",
        "message": "Escaneig de llibres iniciat"
    }


@app.get("/api/books/scan/sync")
async def scan_books_library_sync():
    """Escaneja la biblioteca de llibres (síncron)"""
    from backend.books.scanner import BooksScanner

    scanner = BooksScanner()
    result = scanner.scan_all_libraries()
    return result


@app.post("/api/books/cleanup")
async def cleanup_books_library():
    """Neteja llibres i autors que ja no existeixen"""
    from backend.books.scanner import BooksScanner

    scanner = BooksScanner()
    result = scanner.cleanup_missing_books()
    return {
        "status": "success",
        **result
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True
    )
