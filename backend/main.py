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

# Auth Models
class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    display_name: Optional[str] = None

class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

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


# === AUTENTICACIÓ ===

def get_current_user(request: Request) -> Optional[Dict]:
    """Obté l'usuari actual del token"""
    from backend.auth import get_auth_manager

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.replace("Bearer ", "")
    auth = get_auth_manager()
    return auth.verify_token(token)


def require_auth(request: Request) -> Dict:
    """Requereix autenticació"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticat")
    return user


@app.post("/api/auth/register")
async def register(data: RegisterRequest):
    """Registra un nou usuari"""
    from backend.auth import get_auth_manager

    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="La contrasenya ha de tenir mínim 4 caràcters")

    auth = get_auth_manager()
    result = auth.register(
        username=data.username,
        password=data.password,
        email=data.email,
        display_name=data.display_name
    )

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@app.post("/api/auth/login")
async def login(data: LoginRequest):
    """Inicia sessió"""
    from backend.auth import get_auth_manager

    auth = get_auth_manager()
    result = auth.login(data.username, data.password)

    if result["status"] == "error":
        raise HTTPException(status_code=401, detail=result["message"])

    return result


@app.get("/api/auth/me")
async def get_current_user_info(request: Request):
    """Retorna informació de l'usuari actual"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticat")
    return user


@app.put("/api/auth/profile")
async def update_profile(request: Request, data: ProfileUpdateRequest):
    """Actualitza el perfil de l'usuari"""
    from backend.auth import get_auth_manager

    user = require_auth(request)
    auth = get_auth_manager()
    result = auth.update_profile(
        user_id=user["id"],
        display_name=data.display_name,
        email=data.email
    )

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@app.put("/api/auth/password")
async def change_password(request: Request, data: PasswordChangeRequest):
    """Canvia la contrasenya"""
    from backend.auth import get_auth_manager

    user = require_auth(request)
    auth = get_auth_manager()
    result = auth.change_password(
        user_id=user["id"],
        old_password=data.old_password,
        new_password=data.new_password
    )

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@app.get("/api/user/continue-watching")
async def get_continue_watching(request: Request):
    """Retorna el contingut que l'usuari està veient (per continuar)"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1  # Default user_id 1 si no autenticat

    with get_db() as conn:
        cursor = conn.cursor()

        # Obtenir episodis en progrés (no acabats)
        cursor.execute("""
            SELECT
                wp.media_id,
                wp.progress_seconds,
                wp.total_seconds,
                wp.updated_date,
                mf.title as episode_title,
                mf.season_number,
                mf.episode_number,
                mf.duration,
                s.id as series_id,
                s.name as series_name,
                s.poster,
                s.backdrop
            FROM watch_progress wp
            JOIN media_files mf ON wp.media_id = mf.id
            LEFT JOIN series s ON mf.series_id = s.id
            WHERE wp.user_id = ?
            AND wp.progress_seconds > 30
            AND (wp.total_seconds IS NULL OR wp.progress_seconds < wp.total_seconds * 0.9)
            ORDER BY wp.updated_date DESC
            LIMIT 20
        """, (user_id,))

        watching = []
        for row in cursor.fetchall():
            progress_pct = 0
            if row["total_seconds"] and row["total_seconds"] > 0:
                progress_pct = (row["progress_seconds"] / row["total_seconds"]) * 100

            watching.append({
                "id": row["media_id"],
                "type": "episode" if row["series_id"] else "movie",
                "series_id": row["series_id"],
                "series_name": row["series_name"],
                "title": row["episode_title"],
                "season_number": row["season_number"],
                "episode_number": row["episode_number"],
                "poster": row["poster"],
                "backdrop": row["backdrop"],
                "progress_seconds": row["progress_seconds"],
                "total_seconds": row["total_seconds"],
                "progress_percentage": round(progress_pct, 1),
                "last_watched": row["updated_date"]
            })

        return watching


@app.get("/api/user/recently-watched")
async def get_recently_watched(request: Request, limit: int = 10):
    """Retorna contingut vist recentment"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT DISTINCT
                s.id as series_id,
                s.name as series_name,
                s.poster,
                MAX(wp.updated_date) as last_watched
            FROM watch_progress wp
            JOIN media_files mf ON wp.media_id = mf.id
            JOIN series s ON mf.series_id = s.id
            WHERE wp.user_id = ?
            GROUP BY s.id
            ORDER BY last_watched DESC
            LIMIT ?
        """, (user_id, limit))

        return [dict(row) for row in cursor.fetchall()]


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
    book_info = reader.get_book_info(book_id)

    if not book_info:
        raise HTTPException(status_code=404, detail="Llibre no trobat")

    content_type, file_path = reader.get_book_content_type(book_id)

    if not file_path:
        raise HTTPException(status_code=404, detail="Fitxer del llibre no trobat")

    if content_type == 'epub':
        content = reader.get_epub_content(book_id)
        if content:
            return {"type": "epub", "content": content}
        else:
            # Error parsing EPUB - retornem info perquè el frontend pugui descarregar-lo
            return {
                "type": "epub",
                "error": "No s'ha pogut processar l'EPUB",
                "download_available": True,
                "book_info": {
                    "title": book_info.get("title"),
                    "format": book_info.get("format")
                }
            }

    elif content_type == 'pdf':
        return {"type": "pdf", "file_path": file_path}

    # Formats MOBI/AZW - necessiten conversió o descàrrega directa
    elif content_type in ['mobi', 'azw', 'azw3']:
        return {
            "type": content_type,
            "message": f"Format {content_type.upper()} - Necessita conversió a EPUB o descàrrega directa",
            "download_available": True,
            "book_info": {
                "title": book_info.get("title"),
                "format": book_info.get("format")
            }
        }

    raise HTTPException(status_code=400, detail=f"Format {content_type} no suportat")


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


# ============================================================
# BIBLIOTECA D'AUDIOLLIBRES
# ============================================================

@app.get("/api/audiobooks/authors")
async def get_audiobook_authors():
    """Retorna tots els autors d'audiollibres"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.*, COUNT(ab.id) as audiobook_count
            FROM audiobook_authors a
            LEFT JOIN audiobooks ab ON a.id = ab.author_id
            GROUP BY a.id
            ORDER BY a.name
        """)
        authors = [dict(row) for row in cursor.fetchall()]
        return authors


@app.get("/api/audiobooks/authors/{author_id}")
async def get_audiobook_author_detail(author_id: int):
    """Retorna detalls d'un autor i els seus audiollibres"""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM audiobook_authors WHERE id = ?", (author_id,))
        author = cursor.fetchone()
        if not author:
            raise HTTPException(status_code=404, detail="Autor no trobat")

        cursor.execute("""
            SELECT * FROM audiobooks WHERE author_id = ?
            ORDER BY title
        """, (author_id,))
        audiobooks = [dict(row) for row in cursor.fetchall()]

        return {
            **dict(author),
            "audiobooks": audiobooks
        }


@app.get("/api/audiobooks")
async def get_all_audiobooks():
    """Retorna tots els audiollibres"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT ab.*, a.name as author_name
            FROM audiobooks ab
            LEFT JOIN audiobook_authors a ON ab.author_id = a.id
            ORDER BY ab.title
        """)
        audiobooks = [dict(row) for row in cursor.fetchall()]
        return audiobooks


@app.get("/api/audiobooks/{audiobook_id}")
async def get_audiobook_detail(audiobook_id: int):
    """Retorna detalls d'un audiollibres"""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT ab.*, a.name as author_name
            FROM audiobooks ab
            LEFT JOIN audiobook_authors a ON ab.author_id = a.id
            WHERE ab.id = ?
        """, (audiobook_id,))
        audiobook = cursor.fetchone()

        if not audiobook:
            raise HTTPException(status_code=404, detail="Audiollibres no trobat")

        # Obtenir fitxers
        cursor.execute("""
            SELECT * FROM audiobook_files
            WHERE audiobook_id = ?
            ORDER BY track_number, file_name
        """, (audiobook_id,))
        files = [dict(row) for row in cursor.fetchall()]

        # Obtenir progrés
        cursor.execute("""
            SELECT * FROM audiobook_progress
            WHERE audiobook_id = ? AND user_id = 1
        """, (audiobook_id,))
        progress = cursor.fetchone()

        return {
            **dict(audiobook),
            "files": files,
            "progress": dict(progress) if progress else None
        }


@app.get("/api/audiobooks/{audiobook_id}/cover")
async def get_audiobook_cover(audiobook_id: int):
    """Serveix la portada d'un audiollibres"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT cover FROM audiobooks WHERE id = ?", (audiobook_id,))
        audiobook = cursor.fetchone()

        if not audiobook or not audiobook['cover']:
            raise HTTPException(status_code=404, detail="Portada no trobada")

        if not os.path.exists(audiobook['cover']):
            raise HTTPException(status_code=404, detail="Fitxer de portada no trobat")

        return FileResponse(path=audiobook['cover'], media_type='image/jpeg')


@app.get("/api/audiobooks/{audiobook_id}/files/{file_id}/stream")
async def stream_audiobook_file(audiobook_id: int, file_id: int, request: Request):
    """Serveix un fitxer d'àudio amb suport per Range requests"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM audiobook_files
            WHERE id = ? AND audiobook_id = ?
        """, (file_id, audiobook_id))
        file_info = cursor.fetchone()

        if not file_info:
            raise HTTPException(status_code=404, detail="Fitxer no trobat")

        file_path = file_info['file_path']
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Fitxer d'àudio no trobat")

        file_size = os.path.getsize(file_path)

        # Determinar mime type
        ext = file_info['format'].lower()
        mime_types = {
            'mp3': 'audio/mpeg',
            'm4a': 'audio/mp4',
            'm4b': 'audio/mp4',
            'ogg': 'audio/ogg',
            'flac': 'audio/flac',
            'opus': 'audio/opus',
            'aac': 'audio/aac'
        }
        mime_type = mime_types.get(ext, 'audio/mpeg')

        # Range request support
        range_header = request.headers.get('range')
        if range_header:
            range_match = range_header.replace('bytes=', '').split('-')
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1

            if start >= file_size:
                raise HTTPException(status_code=416, detail="Range not satisfiable")

            chunk_size = end - start + 1

            def iterfile():
                with open(file_path, 'rb') as f:
                    f.seek(start)
                    remaining = chunk_size
                    while remaining > 0:
                        read_size = min(8192, remaining)
                        data = f.read(read_size)
                        if not data:
                            break
                        remaining -= len(data)
                        yield data

            headers = {
                'Content-Range': f'bytes {start}-{end}/{file_size}',
                'Accept-Ranges': 'bytes',
                'Content-Length': str(chunk_size),
                'Content-Type': mime_type
            }

            return StreamingResponse(
                iterfile(),
                status_code=206,
                headers=headers,
                media_type=mime_type
            )

        # Full file
        return FileResponse(
            path=file_path,
            media_type=mime_type,
            headers={'Accept-Ranges': 'bytes'}
        )


class AudiobookProgressRequest(BaseModel):
    file_id: int
    position: int = 0


@app.post("/api/audiobooks/{audiobook_id}/progress")
async def update_audiobook_progress(audiobook_id: int, progress: AudiobookProgressRequest):
    """Actualitza el progrés d'escolta"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Obtenir info del audiollibres
        cursor.execute("SELECT total_duration FROM audiobooks WHERE id = ?", (audiobook_id,))
        audiobook = cursor.fetchone()
        if not audiobook:
            raise HTTPException(status_code=404, detail="Audiollibres no trobat")

        # Calcular temps total escoltat
        cursor.execute("""
            SELECT SUM(duration) as listened FROM audiobook_files
            WHERE audiobook_id = ? AND track_number < (
                SELECT track_number FROM audiobook_files WHERE id = ?
            )
        """, (audiobook_id, progress.file_id))
        prev = cursor.fetchone()
        total_listened = (prev['listened'] or 0) + progress.position

        # Calcular percentatge
        percentage = 0
        if audiobook['total_duration'] > 0:
            percentage = (total_listened / audiobook['total_duration']) * 100

        # Actualitzar o inserir progrés
        cursor.execute("""
            INSERT INTO audiobook_progress (user_id, audiobook_id, current_file_id, current_position, total_listened, percentage, last_listened)
            VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, audiobook_id) DO UPDATE SET
                current_file_id = excluded.current_file_id,
                current_position = excluded.current_position,
                total_listened = excluded.total_listened,
                percentage = excluded.percentage,
                last_listened = CURRENT_TIMESTAMP
        """, (audiobook_id, progress.file_id, progress.position, total_listened, percentage))

        conn.commit()

    return {"status": "success", "percentage": percentage}


@app.get("/api/audiobooks/{audiobook_id}/progress")
async def get_audiobook_progress(audiobook_id: int):
    """Obté el progrés d'escolta"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM audiobook_progress
            WHERE audiobook_id = ? AND user_id = 1
        """, (audiobook_id,))
        progress = cursor.fetchone()

        if not progress:
            return {"current_file_id": None, "current_position": 0, "percentage": 0}

        return dict(progress)


@app.post("/api/audiobooks/scan")
async def scan_audiobooks_library(background_tasks: BackgroundTasks):
    """Escaneja la biblioteca d'audiollibres"""
    from backend.audiobooks.scanner import AudiobooksScanner

    def do_scan():
        scanner = AudiobooksScanner()
        return scanner.scan_all_libraries()

    background_tasks.add_task(do_scan)

    return {
        "status": "started",
        "message": "Escaneig d'audiollibres iniciat"
    }


@app.get("/api/audiobooks/scan/sync")
async def scan_audiobooks_library_sync():
    """Escaneja la biblioteca d'audiollibres (síncron)"""
    from backend.audiobooks.scanner import AudiobooksScanner

    scanner = AudiobooksScanner()
    result = scanner.scan_all_libraries()
    return result


@app.post("/api/audiobooks/cleanup")
async def cleanup_audiobooks_library():
    """Neteja audiollibres que ja no existeixen"""
    from backend.audiobooks.scanner import AudiobooksScanner

    scanner = AudiobooksScanner()
    result = scanner.cleanup_missing_audiobooks()
    return {
        "status": "success",
        **result
    }


# === METADATA API ===

class MetadataRequest(BaseModel):
    tmdb_api_key: Optional[str] = None  # Optional TMDB API key


def get_tmdb_api_key(request_key: str = None) -> str:
    """Get TMDB API key from request, file, or environment"""
    if request_key:
        return request_key

    # Try config file
    config_path = settings.METADATA_DIR / "tmdb_key.txt"
    if config_path.exists():
        key = config_path.read_text().strip()
        if key:
            return key

    # Try environment
    return os.environ.get("TMDB_API_KEY", "")


@app.post("/api/metadata/fetch-all")
async def fetch_all_metadata(request: MetadataRequest):
    """Fetch metadata for all content (movies, series, books, audiobooks)"""
    from backend.metadata.openlibrary import OpenLibraryClient
    from backend.metadata.tmdb import TMDBClient

    # Get TMDB key from request or stored config
    tmdb_api_key = get_tmdb_api_key(request.tmdb_api_key)
    logger.info(f"TMDB API key configured: {bool(tmdb_api_key)}")

    async def do_fetch():
        results = {
            "movies": {"processed": 0, "updated": 0, "errors": 0},
            "series": {"processed": 0, "updated": 0, "errors": 0},
            "books": {"processed": 0, "updated": 0, "errors": 0},
            "audiobooks": {"processed": 0, "updated": 0, "errors": 0},
            "tmdb_configured": bool(tmdb_api_key)
        }

        # Fetch metadata for books
        ol_client = OpenLibraryClient()
        try:
            with get_db() as conn:
                books = conn.execute("""
                    SELECT b.id, b.title, b.file_path, a.name as author_name
                    FROM books b
                    LEFT JOIN authors a ON b.author_id = a.id
                """).fetchall()
                for book in books:
                    results["books"]["processed"] += 1
                    try:
                        book_path = Path(book["file_path"]).parent
                        cover_path = book_path / "cover.jpg"

                        # Skip if cover already exists
                        if cover_path.exists():
                            continue

                        metadata = await ol_client.fetch_book_metadata(
                            book["title"],
                            book["author_name"],
                            cover_path
                        )
                        if metadata["cover_downloaded"]:
                            results["books"]["updated"] += 1
                    except Exception as e:
                        results["books"]["errors"] += 1
                        logger.error(f"Error fetching book metadata: {e}")

                # Fetch for audiobooks
                audiobooks = conn.execute("""
                    SELECT ab.id, ab.title, ab.folder_path, a.name as author_name
                    FROM audiobooks ab
                    LEFT JOIN audiobook_authors a ON ab.author_id = a.id
                """).fetchall()
                for ab in audiobooks:
                    results["audiobooks"]["processed"] += 1
                    try:
                        ab_path = Path(ab["folder_path"])
                        cover_path = ab_path / "cover.jpg"

                        # Skip if cover already exists
                        if cover_path.exists():
                            continue

                        metadata = await ol_client.fetch_book_metadata(
                            ab["title"],
                            ab["author_name"],
                            cover_path
                        )
                        if metadata["cover_downloaded"]:
                            results["audiobooks"]["updated"] += 1
                    except Exception as e:
                        results["audiobooks"]["errors"] += 1
                        logger.error(f"Error fetching audiobook metadata: {e}")
        finally:
            await ol_client.close()

        # Fetch metadata for movies/series if TMDB key provided
        if tmdb_api_key:
            tmdb_client = TMDBClient(tmdb_api_key)
            try:
                with get_db() as conn:
                    # Movies
                    movies = conn.execute(
                        "SELECT id, name, year, path FROM series WHERE media_type = 'movie'"
                    ).fetchall()
                    for movie in movies:
                        results["movies"]["processed"] += 1
                        try:
                            movie_path = Path(movie["path"])
                            # Si el path és un fitxer (carpeta plana), usar el parent
                            if movie_path.is_file():
                                poster_dir = movie_path.parent
                                poster_path = poster_dir / f"{movie_path.stem}_poster.jpg"
                                backdrop_path = poster_dir / f"{movie_path.stem}_backdrop.jpg"
                            else:
                                poster_path = movie_path / "poster.jpg"
                                backdrop_path = movie_path / "backdrop.jpg"

                            # Skip if poster already exists
                            if poster_path.exists():
                                continue

                            metadata = await tmdb_client.fetch_movie_metadata(
                                movie["name"],
                                movie["year"],
                                poster_path,
                                backdrop_path
                            )
                            if metadata["found"]:
                                # Update database with metadata
                                conn.execute("""
                                    UPDATE series SET
                                        overview = COALESCE(?, overview),
                                        rating = COALESCE(?, rating),
                                        year = COALESCE(?, year),
                                        genres = COALESCE(?, genres)
                                    WHERE id = ?
                                """, (
                                    metadata["overview"],
                                    metadata["rating"],
                                    metadata["year"],
                                    ", ".join(metadata["genres"]) if metadata["genres"] else None,
                                    movie["id"]
                                ))
                                if metadata["poster_downloaded"]:
                                    conn.execute(
                                        "UPDATE series SET poster = ? WHERE id = ?",
                                        (str(poster_path), movie["id"])
                                    )
                                results["movies"]["updated"] += 1
                        except Exception as e:
                            results["movies"]["errors"] += 1
                            logger.error(f"Error fetching movie metadata: {e}")

                    # Series
                    series_list = conn.execute(
                        "SELECT id, name, year, path FROM series WHERE media_type = 'series'"
                    ).fetchall()
                    for series in series_list:
                        results["series"]["processed"] += 1
                        try:
                            series_path = Path(series["path"])
                            poster_path = series_path / "poster.jpg"
                            backdrop_path = series_path / "backdrop.jpg"

                            # Skip if poster already exists
                            if poster_path.exists():
                                continue

                            metadata = await tmdb_client.fetch_tv_metadata(
                                series["name"],
                                series["year"],
                                poster_path,
                                backdrop_path
                            )
                            if metadata["found"]:
                                conn.execute("""
                                    UPDATE series SET
                                        overview = COALESCE(?, overview),
                                        rating = COALESCE(?, rating),
                                        year = COALESCE(?, year),
                                        genres = COALESCE(?, genres)
                                    WHERE id = ?
                                """, (
                                    metadata["overview"],
                                    metadata["rating"],
                                    metadata["year"],
                                    ", ".join(metadata["genres"]) if metadata["genres"] else None,
                                    series["id"]
                                ))
                                if metadata["poster_downloaded"]:
                                    conn.execute(
                                        "UPDATE series SET poster = ? WHERE id = ?",
                                        (str(poster_path), series["id"])
                                    )
                                results["series"]["updated"] += 1
                        except Exception as e:
                            results["series"]["errors"] += 1
                            logger.error(f"Error fetching series metadata: {e}")
            finally:
                await tmdb_client.close()

        return results

    # Executar síncronament per retornar resultats
    fetch_results = await do_fetch()
    return {"status": "success", "results": fetch_results}


@app.post("/api/metadata/fetch-books")
async def fetch_books_metadata():
    """Fetch metadata for all books and audiobooks from Open Library"""
    from backend.metadata.openlibrary import OpenLibraryClient

    results = {"books": 0, "audiobooks": 0, "errors": 0}
    client = OpenLibraryClient()

    try:
        with get_db() as conn:
            # Books
            books = conn.execute("""
                SELECT b.id, b.title, b.file_path, a.name as author_name
                FROM books b
                LEFT JOIN authors a ON b.author_id = a.id
            """).fetchall()
            for book in books:
                try:
                    book_path = Path(book["file_path"]).parent
                    cover_path = book_path / "cover.jpg"

                    if cover_path.exists():
                        continue

                    metadata = await client.fetch_book_metadata(
                        book["title"], book["author_name"], cover_path
                    )
                    if metadata["cover_downloaded"]:
                        results["books"] += 1
                except Exception as e:
                    results["errors"] += 1
                    logger.error(f"Error fetching book metadata: {e}")

            # Audiobooks
            audiobooks = conn.execute("""
                SELECT ab.id, ab.title, ab.folder_path, a.name as author_name
                FROM audiobooks ab
                LEFT JOIN audiobook_authors a ON ab.author_id = a.id
            """).fetchall()
            for ab in audiobooks:
                try:
                    ab_path = Path(ab["folder_path"])
                    cover_path = ab_path / "cover.jpg"

                    if cover_path.exists():
                        continue

                    metadata = await client.fetch_book_metadata(
                        ab["title"], ab["author_name"], cover_path
                    )
                    if metadata["cover_downloaded"]:
                        results["audiobooks"] += 1
                except Exception as e:
                    results["errors"] += 1
                    logger.error(f"Error fetching audiobook metadata: {e}")
    finally:
        await client.close()

    return {"status": "success", **results}


@app.post("/api/metadata/fetch-videos")
async def fetch_videos_metadata(request: MetadataRequest):
    """Fetch metadata for movies and series from TMDB"""
    if not request.tmdb_api_key:
        raise HTTPException(status_code=400, detail="TMDB API key is required")

    from backend.metadata.tmdb import TMDBClient

    results = {"movies": 0, "series": 0, "errors": 0}
    client = TMDBClient(request.tmdb_api_key)

    try:
        with get_db() as conn:
            # Movies
            movies = conn.execute(
                "SELECT id, name, year, path FROM series WHERE media_type = 'movie'"
            ).fetchall()
            for movie in movies:
                try:
                    movie_path = Path(movie["path"])
                    # Si el path és un fitxer (carpeta plana), usar el parent
                    if movie_path.is_file():
                        poster_dir = movie_path.parent
                        poster_path = poster_dir / f"{movie_path.stem}_poster.jpg"
                        backdrop_path = poster_dir / f"{movie_path.stem}_backdrop.jpg"
                    else:
                        poster_path = movie_path / "poster.jpg"
                        backdrop_path = movie_path / "backdrop.jpg"

                    if poster_path.exists():
                        continue

                    metadata = await client.fetch_movie_metadata(
                        movie["name"], movie["year"], poster_path, backdrop_path
                    )
                    if metadata["found"]:
                        conn.execute("""
                            UPDATE series SET
                                overview = COALESCE(?, overview),
                                rating = COALESCE(?, rating),
                                year = COALESCE(?, year),
                                genres = COALESCE(?, genres)
                            WHERE id = ?
                        """, (
                            metadata["overview"],
                            metadata["rating"],
                            metadata["year"],
                            ", ".join(metadata["genres"]) if metadata["genres"] else None,
                            movie["id"]
                        ))
                        if metadata["poster_downloaded"]:
                            conn.execute(
                                "UPDATE series SET poster = ? WHERE id = ?",
                                (str(poster_path), movie["id"])
                            )
                        results["movies"] += 1
                except Exception as e:
                    results["errors"] += 1
                    logger.error(f"Error fetching movie metadata: {e}")

            # Series
            series_list = conn.execute(
                "SELECT id, name, year, path FROM series WHERE media_type = 'series'"
            ).fetchall()
            for series in series_list:
                try:
                    series_path = Path(series["path"])
                    poster_path = series_path / "poster.jpg"
                    backdrop_path = series_path / "backdrop.jpg"

                    if poster_path.exists():
                        continue

                    metadata = await client.fetch_tv_metadata(
                        series["name"], series["year"], poster_path, backdrop_path
                    )
                    if metadata["found"]:
                        conn.execute("""
                            UPDATE series SET
                                overview = COALESCE(?, overview),
                                rating = COALESCE(?, rating),
                                year = COALESCE(?, year),
                                genres = COALESCE(?, genres)
                            WHERE id = ?
                        """, (
                            metadata["overview"],
                            metadata["rating"],
                            metadata["year"],
                            ", ".join(metadata["genres"]) if metadata["genres"] else None,
                            series["id"]
                        ))
                        if metadata["poster_downloaded"]:
                            conn.execute(
                                "UPDATE series SET poster = ? WHERE id = ?",
                                (str(poster_path), series["id"])
                            )
                        results["series"] += 1
                except Exception as e:
                    results["errors"] += 1
                    logger.error(f"Error fetching series metadata: {e}")
    finally:
        await client.close()

    return {"status": "success", **results}


@app.get("/api/metadata/tmdb-key")
async def get_tmdb_key_status():
    """Check if TMDB API key is configured"""
    # Check if key is stored in a config file or environment
    tmdb_key = os.environ.get("TMDB_API_KEY", "")
    config_path = settings.METADATA_DIR / "tmdb_key.txt"

    if config_path.exists():
        tmdb_key = config_path.read_text().strip()

    return {"configured": bool(tmdb_key)}


@app.post("/api/metadata/tmdb-key")
async def save_tmdb_key(api_key: str = Query(...)):
    """Save TMDB API key to config"""
    config_path = settings.METADATA_DIR / "tmdb_key.txt"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(api_key)
    return {"status": "success", "message": "API key guardada"}


# ============================================================
# THUMBNAILS PER EPISODIS
# ============================================================

import subprocess

THUMBNAILS_DIR = settings.METADATA_DIR / "thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)


def generate_thumbnail(video_path: Path, output_path: Path, time_percent: int = 20) -> bool:
    """
    Genera un thumbnail d'un vídeo a un percentatge específic de la durada.

    Args:
        video_path: Path al fitxer de vídeo
        output_path: Path on guardar el thumbnail
        time_percent: Percentatge de la durada del vídeo (per defecte 20%)

    Returns:
        True si s'ha generat correctament
    """
    try:
        # Primer obtenim la durada del vídeo
        probe_cmd = [
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', str(video_path)
        ]
        result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        duration = float(result.stdout.strip())

        # Calculem el temps on extreure el frame
        seek_time = (duration * time_percent) / 100

        # Generem el thumbnail
        output_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            'ffmpeg', '-y',
            '-ss', str(seek_time),
            '-i', str(video_path),
            '-vframes', '1',
            '-q:v', '3',
            '-vf', 'scale=480:-1',
            str(output_path)
        ]

        subprocess.run(cmd, capture_output=True, timeout=60)
        return output_path.exists()

    except Exception as e:
        logger.error(f"Error generant thumbnail: {e}")
        return False


@app.get("/api/media/{media_id}/thumbnail")
async def get_media_thumbnail(media_id: int):
    """Retorna el thumbnail d'un episodi/pel·lícula"""
    thumbnail_path = THUMBNAILS_DIR / f"{media_id}.jpg"

    # Si existeix, retornar-lo
    if thumbnail_path.exists():
        return FileResponse(thumbnail_path, media_type="image/jpeg")

    # Si no existeix, intentar generar-lo
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM media_files WHERE id = ?", (media_id,))
        result = cursor.fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Media no trobat")

        video_path = Path(result["file_path"])
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="Fitxer no existeix")

        # Generar thumbnail
        if generate_thumbnail(video_path, thumbnail_path):
            return FileResponse(thumbnail_path, media_type="image/jpeg")
        else:
            raise HTTPException(status_code=500, detail="Error generant thumbnail")


@app.post("/api/thumbnails/generate-all")
async def generate_all_thumbnails():
    """Genera thumbnails per tots els episodis/pel·lícules que no en tinguin"""
    generated = 0
    errors = 0
    skipped = 0

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, file_path FROM media_files")

        for row in cursor.fetchall():
            thumbnail_path = THUMBNAILS_DIR / f"{row['id']}.jpg"

            if thumbnail_path.exists():
                skipped += 1
                continue

            video_path = Path(row["file_path"])
            if not video_path.exists():
                errors += 1
                continue

            if generate_thumbnail(video_path, thumbnail_path):
                generated += 1
            else:
                errors += 1

    logger.info(f"Thumbnails generats: {generated}, errors: {errors}, omesos: {skipped}")
    return {"status": "success", "generated": generated, "errors": errors, "skipped": skipped}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True
    )
