#!/usr/bin/env python3
"""
Hermes Media Server - API Principal
"""

import os
import sys
import json
import sqlite3
import logging
import asyncio
from pathlib import Path
from typing import Optional, List, Dict
from contextlib import contextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, Query, Request, BackgroundTasks, UploadFile, File
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

def init_all_tables():
    """Inicialitza totes les taules necessàries a la BD"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Taula media_segments
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS media_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER,
                series_id INTEGER,
                segment_type TEXT NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                source TEXT DEFAULT 'manual',
                confidence REAL DEFAULT 1.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Afegir columna series_id si no existeix (migració)
        try:
            cursor.execute("ALTER TABLE media_segments ADD COLUMN series_id INTEGER")
        except:
            pass  # La columna ja existeix

        # Taula authors (llibres)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS authors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT UNIQUE,
                photo_path TEXT,
                bio TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migració: afegir columna path a authors si no existeix
        try:
            cursor.execute("ALTER TABLE authors ADD COLUMN path TEXT")
        except:
            pass  # La columna ja existeix

        # Taula audiobook_authors
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audiobook_authors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT UNIQUE,
                photo_path TEXT,
                bio TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migració: afegir columna path a audiobook_authors si no existeix
        try:
            cursor.execute("ALTER TABLE audiobook_authors ADD COLUMN path TEXT")
        except:
            pass  # La columna ja existeix

        # Migracions per la taula series (per bases de dades existents)
        series_columns = [
            ("tmdb_id", "INTEGER"),
            ("title", "TEXT"),
            ("year", "INTEGER"),
            ("overview", "TEXT"),
            ("rating", "REAL"),
            ("genres", "TEXT"),
            ("runtime", "INTEGER"),
            # Camps per contingut importat
            ("is_imported", "INTEGER DEFAULT 0"),
            ("source_type", "TEXT"),  # 'tmdb', 'openlibrary', etc.
            ("external_url", "TEXT"),
            # Camps per tipus de contingut
            ("content_type", "TEXT"),  # movie, anime_movie, animated, series, anime, toons
            ("origin_country", "TEXT"),
            ("original_language", "TEXT"),
        ]
        for col_name, col_type in series_columns:
            try:
                cursor.execute(f"ALTER TABLE series ADD COLUMN {col_name} {col_type}")
            except:
                pass  # La columna ja existeix

        # Taula books (si no existeix)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author_id INTEGER,
                isbn TEXT,
                description TEXT,
                cover_path TEXT,
                file_path TEXT NOT NULL,
                file_format TEXT,
                pages INTEGER,
                language TEXT,
                publisher TEXT,
                published_date TEXT,
                added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES authors(id)
            )
        """)

        # Migracions per la taula books (columnes que necessita el scanner)
        books_columns = [
            ("file_hash", "TEXT"),
            ("format", "TEXT"),
            ("cover", "TEXT"),
            ("file_size", "INTEGER"),
            ("converted_path", "TEXT"),
            ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
            # Camps per contingut importat
            ("is_imported", "INTEGER DEFAULT 0"),
            ("source_type", "TEXT"),  # 'openlibrary', etc.
            ("external_url", "TEXT"),
            ("olid", "TEXT"),  # Open Library ID
            # Tipus de contingut: book, manga, comic
            ("content_type", "TEXT DEFAULT 'book'"),
        ]
        for col_name, col_type in books_columns:
            try:
                cursor.execute(f"ALTER TABLE books ADD COLUMN {col_name} {col_type}")
            except:
                pass

        # Migracions per la taula authors (columnes que necessita el scanner)
        try:
            cursor.execute("ALTER TABLE authors ADD COLUMN photo TEXT")
        except:
            pass

        # Taula audiobooks (si no existeix)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audiobooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author_id INTEGER,
                narrator TEXT,
                isbn TEXT,
                description TEXT,
                cover_path TEXT,
                folder_path TEXT NOT NULL,
                duration INTEGER,
                language TEXT,
                publisher TEXT,
                published_date TEXT,
                added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES audiobook_authors(id)
            )
        """)

        # Migracions per la taula audiobooks (columnes que necessita el scanner)
        audiobooks_columns = [
            ("cover", "TEXT"),
            ("total_duration", "INTEGER DEFAULT 0"),
            ("total_files", "INTEGER DEFAULT 0"),
            ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ]
        for col_name, col_type in audiobooks_columns:
            try:
                cursor.execute(f"ALTER TABLE audiobooks ADD COLUMN {col_name} {col_type}")
            except:
                pass

        # Migracions per la taula audiobook_authors
        try:
            cursor.execute("ALTER TABLE audiobook_authors ADD COLUMN photo TEXT")
        except:
            pass

        # Taula audiobook_files (necessària per l'scanner)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audiobook_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                audiobook_id INTEGER NOT NULL,
                file_path TEXT UNIQUE NOT NULL,
                file_name TEXT NOT NULL,
                title TEXT,
                track_number INTEGER DEFAULT 0,
                duration INTEGER DEFAULT 0,
                file_size INTEGER DEFAULT 0,
                format TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (audiobook_id) REFERENCES audiobooks(id)
            )
        """)

        # Taula reading_progress (necessària per l'scanner de llibres)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reading_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT 1,
                book_id INTEGER NOT NULL,
                current_position TEXT,
                current_page INTEGER DEFAULT 0,
                total_pages INTEGER,
                percentage REAL DEFAULT 0,
                last_read TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (book_id) REFERENCES books(id),
                UNIQUE(user_id, book_id)
            )
        """)

        # Taula audiobook_progress (necessària per audiollibres)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audiobook_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT 1,
                audiobook_id INTEGER NOT NULL,
                current_file_id INTEGER,
                current_position INTEGER DEFAULT 0,
                percentage REAL DEFAULT 0,
                last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (audiobook_id) REFERENCES audiobooks(id),
                FOREIGN KEY (current_file_id) REFERENCES audiobook_files(id),
                UNIQUE(user_id, audiobook_id)
            )
        """)

        # Migració: Crear índex UNIQUE per watch_progress si no existeix
        # (per bases de dades existents que no tenen la constraint)
        try:
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_progress_user_media
                ON watch_progress(user_id, media_id)
            """)
        except:
            pass  # L'índex ja existeix o la taula no existeix encara

        conn.commit()
        logger.info("Totes les taules inicialitzades correctament")

# Inicialitzar taules al arrancar
init_all_tables()

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
    avatar: Optional[str] = None

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


class WatchProgressRequest(BaseModel):
    """Per guardar el progrés de visualització"""
    progress_seconds: float
    total_seconds: float


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
        email=data.email,
        avatar=data.avatar
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


# ============================================================
# GESTIÓ D'INVITACIONS
# ============================================================

class InvitationRequest(BaseModel):
    max_uses: int = 1
    expires_days: int = 7

class RegisterWithInviteRequest(BaseModel):
    username: str
    password: str
    invitation_code: str
    email: Optional[str] = None
    display_name: Optional[str] = None


@app.post("/api/invitations")
async def create_invitation(request: Request, data: InvitationRequest):
    """Crea un codi d'invitació (només admin)"""
    from backend.auth import get_auth_manager

    user = require_auth(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Només els administradors poden crear invitacions")

    auth = get_auth_manager()
    result = auth.create_invitation(
        created_by=user["id"],
        max_uses=data.max_uses,
        expires_days=data.expires_days
    )

    return result


@app.get("/api/invitations")
async def get_invitations(request: Request):
    """Obté les invitacions (admin veu totes, usuaris només les seves)"""
    from backend.auth import get_auth_manager

    user = require_auth(request)
    auth = get_auth_manager()

    if user.get("is_admin"):
        invitations = auth.get_invitations()
    else:
        invitations = auth.get_invitations(created_by=user["id"])

    return {"invitations": invitations}


@app.delete("/api/invitations/{invitation_id}")
async def delete_invitation(request: Request, invitation_id: int):
    """Elimina una invitació"""
    from backend.auth import get_auth_manager

    user = require_auth(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Només els administradors poden eliminar invitacions")

    auth = get_auth_manager()
    if auth.delete_invitation(invitation_id):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Invitació no trobada")


@app.get("/api/invitations/validate/{code}")
async def validate_invitation(code: str):
    """Valida un codi d'invitació (endpoint públic)"""
    from backend.auth import get_auth_manager

    auth = get_auth_manager()
    return auth.validate_invitation(code)


@app.post("/api/auth/register-with-invite")
async def register_with_invitation(data: RegisterWithInviteRequest):
    """Registra un nou usuari amb codi d'invitació"""
    from backend.auth import get_auth_manager

    auth = get_auth_manager()
    result = auth.register_with_invitation(
        username=data.username,
        password=data.password,
        invitation_code=data.invitation_code,
        email=data.email,
        display_name=data.display_name
    )

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


# ============================================================
# GESTIÓ D'USUARIS (ADMIN)
# ============================================================

@app.get("/api/admin/users")
async def get_all_users(request: Request):
    """Obté tots els usuaris (només admin)"""
    from backend.auth import get_auth_manager

    user = require_auth(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    auth = get_auth_manager()
    users = auth.get_all_users()
    return {"users": users}


@app.put("/api/admin/users/{user_id}/toggle-active")
async def toggle_user_active(request: Request, user_id: int, active: bool = True):
    """Activa o desactiva un usuari"""
    from backend.auth import get_auth_manager

    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    auth = get_auth_manager()
    result = auth.toggle_user_active(user_id, active)

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@app.put("/api/admin/users/{user_id}/toggle-admin")
async def toggle_admin(request: Request, user_id: int, is_admin: bool = True):
    """Canvia l'estat d'admin d'un usuari"""
    from backend.auth import get_auth_manager

    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    auth = get_auth_manager()
    result = auth.toggle_admin(user_id, is_admin)

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@app.put("/api/admin/users/{user_id}/toggle-premium")
async def toggle_premium(request: Request, user_id: int, is_premium: bool = True):
    """Canvia l'estat de premium d'un usuari"""
    from backend.auth import get_auth_manager

    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    auth = get_auth_manager()
    result = auth.toggle_premium(user_id, is_premium)

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@app.delete("/api/admin/users/{user_id}")
async def delete_user(request: Request, user_id: int):
    """Elimina un usuari"""
    from backend.auth import get_auth_manager

    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    auth = get_auth_manager()
    result = auth.delete_user(user_id, admin["id"])

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

        # Obtenir contingut en progrés (no acabat) - sèries i pel·lícules
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
                s.media_type,
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

            # Determinar el tipus basant-se en media_type de la taula series
            media_type = row["media_type"] if row["media_type"] else "series"
            if media_type == "movies":
                item_type = "movie"
            else:
                item_type = "episode"

            watching.append({
                "id": row["media_id"],
                "type": item_type,
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


@app.post("/api/media/{media_id}/progress")
async def save_watch_progress(media_id: int, data: WatchProgressRequest, request: Request):
    """Guarda el progrés de visualització d'un vídeo/episodi"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1  # Default user_id 1 si no autenticat

    with get_db() as conn:
        cursor = conn.cursor()

        # Verificar que el media existeix
        cursor.execute("SELECT id FROM media_files WHERE id = ?", (media_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Media no trobat")

        # Usar UPSERT per insertar o actualitzar de forma atòmica
        cursor.execute("""
            INSERT INTO watch_progress (user_id, media_id, progress_seconds, total_seconds, updated_date)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, media_id) DO UPDATE SET
                progress_seconds = excluded.progress_seconds,
                total_seconds = excluded.total_seconds,
                updated_date = datetime('now')
        """, (user_id, media_id, data.progress_seconds, data.total_seconds))

        conn.commit()

        return {
            "status": "success",
            "message": "Progrés guardat",
            "progress_percentage": round((data.progress_seconds / data.total_seconds) * 100, 1) if data.total_seconds > 0 else 0
        }


@app.get("/api/media/{media_id}/progress")
async def get_watch_progress(media_id: int, request: Request):
    """Obté el progrés de visualització d'un vídeo/episodi"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT progress_seconds, total_seconds, updated_date
            FROM watch_progress
            WHERE user_id = ? AND media_id = ?
        """, (user_id, media_id))

        row = cursor.fetchone()
        if not row:
            return {
                "progress_seconds": 0,
                "total_seconds": 0,
                "progress_percentage": 0
            }

        progress_pct = 0
        if row["total_seconds"] and row["total_seconds"] > 0:
            progress_pct = (row["progress_seconds"] / row["total_seconds"]) * 100

        return {
            "progress_seconds": row["progress_seconds"],
            "total_seconds": row["total_seconds"],
            "progress_percentage": round(progress_pct, 1),
            "last_watched": row["updated_date"]
        }


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
async def get_series(content_type: str = None, page: int = 1, limit: int = 50, sort_by: str = "name"):
    """Retorna les sèries amb paginació. Filtre opcional: series, anime, toons (comma-separated for multiple)"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Parse content types (can be comma-separated)
        content_types = [ct.strip() for ct in content_type.split(',')] if content_type else None

        # Count total
        count_query = "SELECT COUNT(*) FROM series WHERE media_type = 'series'"
        count_params = []
        if content_types:
            placeholders = ','.join(['?' for _ in content_types])
            count_query += f" AND content_type IN ({placeholders})"
            count_params.extend(content_types)
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]

        # Main query
        query = """
            SELECT s.*, COUNT(DISTINCT m.season_number) as season_count,
                       COUNT(m.id) as episode_count, s.content_type
            FROM series s
            LEFT JOIN media_files m ON s.id = m.series_id
            WHERE s.media_type = 'series'
        """
        params = []

        if content_types:
            placeholders = ','.join(['?' for _ in content_types])
            query += f" AND s.content_type IN ({placeholders})"
            params.extend(content_types)

        query += " GROUP BY s.id"

        # Sorting
        if sort_by == "year":
            query += " ORDER BY s.year DESC, s.name"
        elif sort_by == "recent":
            query += " ORDER BY s.added_date DESC, s.name"
        elif sort_by == "episodes":
            query += " ORDER BY episode_count DESC, s.name"
        else:
            query += " ORDER BY s.name"

        # Pagination
        offset = (page - 1) * limit
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)

        series = []
        for row in cursor.fetchall():
            series.append({
                "id": row["id"],
                "name": row["name"],
                "path": row["path"],
                "poster": row["poster"],
                "backdrop": row["backdrop"],
                "season_count": row["season_count"],
                "episode_count": row["episode_count"],
                "content_type": row["content_type"] or "series"
            })

        return {
            "items": series,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit
        }

@app.get("/api/library/movies")
async def get_movies(content_type: str = None, page: int = 1, limit: int = 50, sort_by: str = "name"):
    """Retorna les pel·lícules amb paginació. Filtre opcional: movie, anime_movie, animated (comma-separated for multiple)"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Parse content types (can be comma-separated)
        content_types = [ct.strip() for ct in content_type.split(',')] if content_type else None

        # Count total
        count_query = "SELECT COUNT(*) FROM series WHERE media_type = 'movie'"
        count_params = []
        if content_types:
            placeholders = ','.join(['?' for _ in content_types])
            count_query += f" AND content_type IN ({placeholders})"
            count_params.extend(content_types)
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]

        # Main query
        query = """
            SELECT s.*, m.duration, m.file_size, m.id as media_id,
                   s.is_imported, s.year, s.rating, s.content_type
            FROM series s
            LEFT JOIN media_files m ON s.id = m.series_id
            WHERE s.media_type = 'movie'
        """
        params = []

        if content_types:
            placeholders = ','.join(['?' for _ in content_types])
            query += f" AND s.content_type IN ({placeholders})"
            params.extend(content_types)

        # Sorting
        if sort_by == "year":
            query += " ORDER BY s.year DESC, s.name"
        elif sort_by == "recent":
            query += " ORDER BY s.added_date DESC, s.name"
        elif sort_by == "duration":
            query += " ORDER BY m.duration DESC, s.name"
        else:
            query += " ORDER BY s.name"

        # Pagination
        offset = (page - 1) * limit
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)

        movies = []
        for row in cursor.fetchall():
            movies.append({
                "id": row["id"],
                "name": row["name"],
                "poster": row["poster"],
                "backdrop": row["backdrop"],
                "duration": row["duration"],
                "file_size": row["file_size"],
                "has_file": row["media_id"] is not None,
                "is_imported": row["is_imported"] == 1,
                "year": row["year"],
                "rating": row["rating"],
                "content_type": row["content_type"] or "movie"
            })

        return {
            "items": movies,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit
        }

@app.get("/api/series/{series_id}")
async def get_series_detail(series_id: int):
    """Retorna detalls d'una sèrie amb temporades"""
    import json as json_module
    with get_db() as conn:
        cursor = conn.cursor()

        # Info de la sèrie
        cursor.execute("SELECT * FROM series WHERE id = ?", (series_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        # Convertir a diccionari per poder usar .get()
        series = dict(row)

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

        # Parsejar gèneres si existeixen
        genres = None
        if series.get("genres"):
            try:
                genres = json_module.loads(series["genres"])
            except (json_module.JSONDecodeError, TypeError):
                genres = None

        # Parsejar creadors si existeixen
        creators = None
        if series.get("creators"):
            try:
                creators = json_module.loads(series["creators"])
            except (json_module.JSONDecodeError, TypeError):
                creators = None

        # Parsejar repartiment si existeix
        cast_members = None
        if series.get("cast_members"):
            try:
                cast_members = json_module.loads(series["cast_members"])
            except (json_module.JSONDecodeError, TypeError):
                cast_members = None

        return {
            "id": series["id"],
            "name": series["name"],
            "title": series.get("title"),
            "original_title": series.get("original_title"),
            "year": series.get("year"),
            "overview": series.get("overview"),
            "tagline": series.get("tagline"),
            "rating": series.get("rating"),
            "genres": genres,
            "runtime": series.get("runtime"),
            "director": series.get("director"),
            "creators": creators,
            "cast": cast_members,
            "tmdb_id": series.get("tmdb_id"),
            "poster": series.get("poster"),
            "backdrop": series.get("backdrop"),
            "external_url": series.get("external_url"),
            "external_source": series.get("external_source"),
            "seasons": seasons
        }

@app.patch("/api/series/{series_id}/external-url")
async def update_series_external_url(series_id: int, request: Request):
    """Actualitza la URL externa d'una sèrie/pel·lícula"""
    data = await request.json()
    external_url = data.get("external_url")
    external_source = data.get("external_source")

    with get_db() as conn:
        cursor = conn.cursor()

        # Verificar que existeix
        cursor.execute("SELECT id FROM series WHERE id = ?", (series_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        # Actualitzar
        cursor.execute("""
            UPDATE series
            SET external_url = ?, external_source = ?, updated_date = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (external_url, external_source, series_id))
        conn.commit()

    return {"success": True, "message": "URL externa actualitzada"}

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

@app.post("/api/library/scan-all")
async def scan_all_libraries(background_tasks: BackgroundTasks):
    """Escaneja TOTES les biblioteques: sèries, pel·lícules, llibres i audiollibres"""
    from backend.books.scanner import BooksScanner
    from backend.audiobooks.scanner import AudiobooksScanner

    def do_scan_all():
        results = {
            "media": {"series": 0, "movies": 0},
            "books": {"authors": 0, "books": 0},
            "audiobooks": {"authors": 0, "audiobooks": 0},
            "errors": []
        }

        # 1. Escanejar sèries i pel·lícules
        try:
            scanner = HermesScanner()
            for library in settings.MEDIA_LIBRARIES:
                if Path(library["path"]).exists():
                    logger.info(f"Escanejant biblioteca de media: {library['name']}")
                    scanner.scan_directory(library["path"], library["type"])
            stats = scanner.get_stats()
            results["media"]["series"] = stats.get("series", 0)
            results["media"]["movies"] = stats.get("movies", 0)
        except Exception as e:
            logger.error(f"Error escanejant media: {e}")
            results["errors"].append(f"Media: {str(e)}")

        # 2. Escanejar llibres
        try:
            books_scanner = BooksScanner()
            books_result = books_scanner.scan_all_libraries()
            results["books"]["authors"] = books_result.get("authors_found", 0)
            results["books"]["books"] = books_result.get("books_found", 0)
        except Exception as e:
            logger.error(f"Error escanejant llibres: {e}")
            results["errors"].append(f"Llibres: {str(e)}")

        # 3. Escanejar audiollibres
        try:
            audiobooks_scanner = AudiobooksScanner()
            audiobooks_result = audiobooks_scanner.scan_all_libraries()
            results["audiobooks"]["authors"] = audiobooks_result.get("authors_found", 0)
            results["audiobooks"]["audiobooks"] = audiobooks_result.get("audiobooks_found", 0)
        except Exception as e:
            logger.error(f"Error escanejant audiollibres: {e}")
            results["errors"].append(f"Audiollibres: {str(e)}")

        logger.info(f"Escaneig complet: {results}")
        return results

    background_tasks.add_task(do_scan_all)
    return {
        "status": "scanning",
        "message": "Escanejant totes les biblioteques en segon pla..."
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

    # Retornar 404 si no hi ha poster disponible
    raise HTTPException(status_code=404, detail="Poster not available")

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

    # Retornar 404 si no hi ha backdrop disponible
    raise HTTPException(status_code=404, detail="Backdrop not available")


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
        cursor.execute("SELECT id, name, path, media_type FROM series")
        series_list = cursor.fetchall()

        for series in series_list:
            should_remove = False
            series_path = series["path"]

            if not os.path.exists(series_path):
                # El path no existeix
                should_remove = True
            elif series["media_type"] == "movie" and os.path.isdir(series_path):
                # És una pel·lícula però el path és un directori (entrada antiga de carpeta plana)
                # Hauria de ser un fitxer, no un directori
                should_remove = True
                logger.info(f"Detectada pel·lícula amb path de directori (entrada antiga): {series['name']}")

            if should_remove:
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
async def get_library_season_episodes(series_id: int, season_number: int, request: Request):
    """Retorna episodis d'una temporada - format frontend"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    with get_db() as conn:
        cursor = conn.cursor()

        # Consulta amb LEFT JOIN a watch_progress per obtenir el progrés
        cursor.execute("""
            SELECT m.*, s.name as series_name, s.poster, s.backdrop,
                   wp.progress_seconds, wp.total_seconds
            FROM media_files m
            LEFT JOIN series s ON m.series_id = s.id
            LEFT JOIN watch_progress wp ON m.id = wp.media_id AND wp.user_id = ?
            WHERE m.series_id = ? AND m.season_number = ?
            ORDER BY m.episode_number
        """, (user_id, series_id, season_number))

        episodes = []
        for row in cursor.fetchall():
            # Calcular percentatge de progrés
            watch_progress = 0
            if row["progress_seconds"] and row["total_seconds"] and row["total_seconds"] > 0:
                watch_progress = round((row["progress_seconds"] / row["total_seconds"]) * 100, 1)

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
                "watch_progress": watch_progress
            })

        return episodes


@app.get("/api/library/movies/{movie_id}")
async def get_library_movie_detail(movie_id: int):
    """Detalls pel·lícula - format frontend"""
    import json as json_module
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.*, m.id as media_id, m.duration, m.file_size, m.width, m.height,
                   m.video_codec, m.audio_tracks, m.subtitle_tracks, m.file_path
            FROM series s
            LEFT JOIN media_files m ON s.id = m.series_id
            WHERE s.id = ? AND s.media_type = 'movie'
        """, (movie_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Pel·lícula no trobada")

        # Convertir a diccionari per poder usar .get()
        movie = dict(row)

        # Parsejar gèneres si existeixen
        genres = None
        if movie.get("genres"):
            try:
                genres = json_module.loads(movie["genres"])
            except (json_module.JSONDecodeError, TypeError):
                genres = None

        # Parsejar repartiment si existeix
        cast_members = None
        if movie.get("cast_members"):
            try:
                cast_members = json_module.loads(movie["cast_members"])
            except (json_module.JSONDecodeError, TypeError):
                cast_members = None

        return {
            "id": movie["id"],
            "media_id": movie.get("media_id"),
            "name": movie["name"],
            "title": movie.get("title"),
            "original_title": movie.get("original_title"),
            "year": movie.get("year"),
            "overview": movie.get("overview"),
            "tagline": movie.get("tagline"),
            "rating": movie.get("rating"),
            "genres": genres,
            "runtime": movie.get("runtime"),
            "director": movie.get("director"),
            "cast": cast_members,
            "tmdb_id": movie.get("tmdb_id"),
            "poster": movie.get("poster"),
            "backdrop": movie.get("backdrop"),
            "duration": movie.get("duration"),
            "file_size": movie.get("file_size"),
            "width": movie.get("width"),
            "height": movie.get("height"),
            "video_codec": movie.get("video_codec"),
            "audio_tracks": movie.get("audio_tracks"),
            "subtitles": movie.get("subtitle_tracks"),
            "file_path": movie.get("file_path"),
            "has_file": movie.get("media_id") is not None,
            "is_imported": movie.get("is_imported") == 1
        }


@app.get("/api/watch-providers/{media_type}/{tmdb_id}")
async def get_watch_providers(media_type: str, tmdb_id: int, country: str = "ES"):
    """
    Obtenir on es pot veure una pel·lícula o sèrie (Netflix, Disney+, etc.)
    Utilitza l'API de Watch Providers de TMDB.
    """
    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    from backend.metadata.tmdb import TMDBClient

    client = TMDBClient(api_key)
    try:
        if media_type == 'movie':
            providers = await client.get_movie_watch_providers(tmdb_id, country)
        elif media_type == 'series':
            providers = await client.get_tv_watch_providers(tmdb_id, country)
        else:
            raise HTTPException(status_code=400, detail="Tipus de contingut no vàlid")

        if not providers:
            return {"available": False, "providers": {}}

        # Processar els proveïdors
        result = {
            "available": True,
            "link": providers.get("link"),  # Enllaç a JustWatch/TMDB
            "flatrate": [],  # Streaming (Netflix, Disney+, etc.)
            "rent": [],      # Lloguer (iTunes, Google Play, etc.)
            "buy": []        # Compra (iTunes, Google Play, etc.)
        }

        for provider_type in ["flatrate", "rent", "buy"]:
            if providers.get(provider_type):
                for p in providers[provider_type]:
                    result[provider_type].append({
                        "id": p.get("provider_id"),
                        "name": p.get("provider_name"),
                        "logo": f"https://image.tmdb.org/t/p/w92{p.get('logo_path')}" if p.get("logo_path") else None
                    })

        return result
    finally:
        await client.close()


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

        # Primer verificar si la pel·lícula existeix
        cursor.execute("""
            SELECT s.id, s.name, s.is_imported FROM series s
            WHERE s.id = ? AND s.media_type = 'movie'
        """, (movie_id,))
        movie = cursor.fetchone()

        if not movie:
            raise HTTPException(status_code=404, detail="Pel·lícula no trobada")

        # Buscar el fitxer associat
        cursor.execute("""
            SELECT m.file_path FROM media_files m
            JOIN series s ON m.series_id = s.id
            WHERE s.id = ? AND s.media_type = 'movie'
        """, (movie_id,))
        result = cursor.fetchone()

        # Si no trobat, intentar amb media_files.id directament
        if not result:
            cursor.execute("""
                SELECT m.file_path FROM media_files m
                JOIN series s ON m.series_id = s.id
                WHERE m.id = ? AND s.media_type = 'movie'
            """, (movie_id,))
            result = cursor.fetchone()

        if not result:
            # La pel·lícula existeix però no té fitxer (importada de TMDB)
            raise HTTPException(
                status_code=404,
                detail="NO_FILE:Aquesta pel·lícula no té cap fitxer de vídeo associat. És només metadades importades de TMDB."
            )

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


@app.post("/api/segments/series/{series_id}/season/{season_number}/apply")
async def apply_segment_to_season(series_id: int, season_number: int, segment: SeriesSegmentRequest):
    """Aplica un segment a tots els episodis d'una temporada específica"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Verificar que existeix la sèrie
        cursor.execute("SELECT id FROM series WHERE id = ?", (series_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        # Obtenir tots els episodis de la temporada
        cursor.execute("""
            SELECT id FROM episodes
            WHERE series_id = ? AND season_number = ?
        """, (series_id, season_number))
        episodes = cursor.fetchall()

        if not episodes:
            raise HTTPException(status_code=404, detail=f"No s'han trobat episodis per la temporada {season_number}")

        updated_count = 0
        for (episode_id,) in episodes:
            # Eliminar segment existent del mateix tipus per aquest episodi
            cursor.execute("""
                DELETE FROM media_segments
                WHERE media_id = ? AND segment_type = ?
            """, (episode_id, segment.segment_type))

            # Inserir nou segment per l'episodi
            cursor.execute("""
                INSERT INTO media_segments (media_id, series_id, segment_type, start_time, end_time, source, confidence)
                VALUES (?, ?, ?, ?, ?, 'manual', 1.0)
            """, (episode_id, series_id, segment.segment_type, segment.start_time, segment.end_time))
            updated_count += 1

        conn.commit()
        return {
            "status": "success",
            "message": f"Segment {segment.segment_type} aplicat a {updated_count} episodis de la temporada {season_number}",
            "episodes_updated": updated_count
        }


@app.post("/api/segments/series/{series_id}/apply-all")
async def apply_segment_to_all_seasons(series_id: int, segment: SeriesSegmentRequest):
    """Aplica un segment a tots els episodis de totes les temporades"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Verificar que existeix la sèrie
        cursor.execute("SELECT id FROM series WHERE id = ?", (series_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        # Obtenir tots els episodis de la sèrie
        cursor.execute("""
            SELECT id FROM episodes
            WHERE series_id = ?
        """, (series_id,))
        episodes = cursor.fetchall()

        if not episodes:
            raise HTTPException(status_code=404, detail="No s'han trobat episodis per aquesta sèrie")

        updated_count = 0
        for (episode_id,) in episodes:
            # Eliminar segment existent del mateix tipus per aquest episodi
            cursor.execute("""
                DELETE FROM media_segments
                WHERE media_id = ? AND segment_type = ?
            """, (episode_id, segment.segment_type))

            # Inserir nou segment per l'episodi
            cursor.execute("""
                INSERT INTO media_segments (media_id, series_id, segment_type, start_time, end_time, source, confidence)
                VALUES (?, ?, ?, ?, ?, 'manual', 1.0)
            """, (episode_id, series_id, segment.segment_type, segment.start_time, segment.end_time))
            updated_count += 1

        conn.commit()
        return {
            "status": "success",
            "message": f"Segment {segment.segment_type} aplicat a {updated_count} episodis de totes les temporades",
            "episodes_updated": updated_count
        }


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
async def get_all_books(content_type: str = None):
    """Retorna tots els llibres. Filtre opcional: book, manga, comic (comma-separated for multiple)"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Parse content types (can be comma-separated)
        content_types = [ct.strip() for ct in content_type.split(',')] if content_type else None

        query = """
            SELECT b.*, a.name as author_name
            FROM books b
            LEFT JOIN authors a ON b.author_id = a.id
        """
        params = []

        if content_types:
            placeholders = ','.join(['?' for _ in content_types])
            query += f" WHERE (b.content_type IN ({placeholders}) OR (b.content_type IS NULL AND ? IN ({placeholders})))"
            params.extend(content_types)
            params.append('book')  # Treat NULL as 'book'
            params.extend(content_types)

        query += " ORDER BY b.title"

        cursor.execute(query, params)
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
async def get_audiobook_detail(audiobook_id: int, request: Request):
    """Retorna detalls d'un audiollibres"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

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

        # Obtenir progrés de l'usuari actual
        cursor.execute("""
            SELECT * FROM audiobook_progress
            WHERE audiobook_id = ? AND user_id = ?
        """, (audiobook_id, user_id))
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
async def update_audiobook_progress(audiobook_id: int, progress: AudiobookProgressRequest, request: Request):
    """Actualitza el progrés d'escolta"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

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

        # Actualitzar o inserir progrés per l'usuari actual
        cursor.execute("""
            INSERT INTO audiobook_progress (user_id, audiobook_id, current_file_id, current_position, total_listened, percentage, last_listened)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, audiobook_id) DO UPDATE SET
                current_file_id = excluded.current_file_id,
                current_position = excluded.current_position,
                total_listened = excluded.total_listened,
                percentage = excluded.percentage,
                last_listened = CURRENT_TIMESTAMP
        """, (user_id, audiobook_id, progress.file_id, progress.position, total_listened, percentage))

        conn.commit()

    return {"status": "success", "percentage": percentage}


@app.get("/api/audiobooks/{audiobook_id}/progress")
async def get_audiobook_progress(audiobook_id: int, request: Request):
    """Obté el progrés d'escolta"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM audiobook_progress
            WHERE audiobook_id = ? AND user_id = ?
        """, (audiobook_id, user_id))
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
                        "SELECT id, name, path, tmdb_id FROM series WHERE media_type = 'movie'"
                    ).fetchall()
                    for movie in movies:
                        results["movies"]["processed"] += 1
                        try:
                            movie_path = Path(movie["path"])
                            # Si el path és un fitxer (carpeta plana), usar el parent
                            if movie_path.is_file():
                                poster_dir = movie_path.parent
                                poster_path = poster_dir / "folder.jpg"
                                backdrop_path = poster_dir / "backdrop.jpg"
                            else:
                                poster_dir = movie_path
                                poster_path = movie_path / "folder.jpg"
                                backdrop_path = movie_path / "backdrop.jpg"

                            # Skip if already has tmdb_id (already identified)
                            if movie["tmdb_id"]:
                                continue

                            # Check if poster already exists (folder.jpg or poster.jpg)
                            existing_poster = None
                            for pname in ["folder.jpg", "poster.jpg"]:
                                p = poster_dir / pname
                                if p.exists():
                                    existing_poster = p
                                    break

                            metadata = await tmdb_client.fetch_movie_metadata(
                                movie["name"],
                                None,
                                poster_path if not existing_poster else None,
                                backdrop_path if not backdrop_path.exists() else None
                            )
                            if metadata["found"]:
                                # Save ALL metadata, not just poster
                                genres_json = json.dumps(metadata.get("genres", []))
                                conn.execute('''
                                    UPDATE series SET
                                        tmdb_id = ?,
                                        title = ?,
                                        year = ?,
                                        overview = ?,
                                        rating = ?,
                                        genres = ?,
                                        runtime = ?,
                                        poster = CASE WHEN ? = 1 THEN ? ELSE poster END,
                                        backdrop = CASE WHEN ? = 1 THEN ? ELSE backdrop END,
                                        updated_date = CURRENT_TIMESTAMP
                                    WHERE id = ?
                                ''', (
                                    metadata.get("tmdb_id"),
                                    metadata.get("title"),
                                    metadata.get("year"),
                                    metadata.get("overview"),
                                    metadata.get("rating"),
                                    genres_json,
                                    metadata.get("runtime"),
                                    1 if metadata.get("poster_downloaded") else 0,
                                    str(poster_path) if metadata.get("poster_downloaded") else None,
                                    1 if metadata.get("backdrop_downloaded") else 0,
                                    str(backdrop_path) if metadata.get("backdrop_downloaded") else None,
                                    movie["id"]
                                ))
                                results["movies"]["updated"] += 1
                                logger.info(f"Metadata updated: {movie['name']} -> {metadata.get('title')}")
                        except Exception as e:
                            results["movies"]["errors"] += 1
                            logger.error(f"Error fetching movie metadata: {e}")

                    # Series
                    series_list = conn.execute(
                        "SELECT id, name, path, tmdb_id FROM series WHERE media_type = 'series'"
                    ).fetchall()
                    for series in series_list:
                        results["series"]["processed"] += 1
                        try:
                            series_path = Path(series["path"])
                            poster_path = series_path / "folder.jpg"
                            backdrop_path = series_path / "backdrop.jpg"

                            # Skip if already has tmdb_id (already identified)
                            if series["tmdb_id"]:
                                continue

                            # Check if poster already exists (folder.jpg or poster.jpg)
                            existing_poster = None
                            for pname in ["folder.jpg", "poster.jpg"]:
                                p = series_path / pname
                                if p.exists():
                                    existing_poster = p
                                    break

                            metadata = await tmdb_client.fetch_tv_metadata(
                                series["name"],
                                None,
                                poster_path if not existing_poster else None,
                                backdrop_path if not backdrop_path.exists() else None
                            )
                            if metadata["found"]:
                                # Save ALL metadata, not just poster
                                genres_json = json.dumps(metadata.get("genres", []))
                                conn.execute('''
                                    UPDATE series SET
                                        tmdb_id = ?,
                                        title = ?,
                                        year = ?,
                                        overview = ?,
                                        rating = ?,
                                        genres = ?,
                                        runtime = ?,
                                        poster = CASE WHEN ? = 1 THEN ? ELSE poster END,
                                        backdrop = CASE WHEN ? = 1 THEN ? ELSE backdrop END,
                                        updated_date = CURRENT_TIMESTAMP
                                    WHERE id = ?
                                ''', (
                                    metadata.get("tmdb_id"),
                                    metadata.get("title"),
                                    metadata.get("year"),
                                    metadata.get("overview"),
                                    metadata.get("rating"),
                                    genres_json,
                                    metadata.get("runtime"),
                                    1 if metadata.get("poster_downloaded") else 0,
                                    str(poster_path) if metadata.get("poster_downloaded") else None,
                                    1 if metadata.get("backdrop_downloaded") else 0,
                                    str(backdrop_path) if metadata.get("backdrop_downloaded") else None,
                                    series["id"]
                                ))
                                results["series"]["updated"] += 1
                                logger.info(f"Metadata updated: {series['name']} -> {metadata.get('title')}")
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
                "SELECT id, name, path FROM series WHERE media_type = 'movie'"
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
                        movie["name"], None, poster_path, backdrop_path
                    )
                    if metadata["found"]:
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
                "SELECT id, name, path FROM series WHERE media_type = 'series'"
            ).fetchall()
            for series in series_list:
                try:
                    series_path = Path(series["path"])
                    poster_path = series_path / "poster.jpg"
                    backdrop_path = series_path / "backdrop.jpg"

                    if poster_path.exists():
                        continue

                    metadata = await client.fetch_tv_metadata(
                        series["name"], None, poster_path, backdrop_path
                    )
                    if metadata["found"]:
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


class UpdateByTmdbIdRequest(BaseModel):
    tmdb_id: int
    media_type: str = "movie"  # "movie" o "series"


@app.post("/api/metadata/series/{series_id}/update-by-tmdb")
async def update_series_by_tmdb_id(series_id: int, request: UpdateByTmdbIdRequest):
    """
    Actualitza les metadades d'una sèrie/pel·lícula usant directament l'ID de TMDB.
    Força la descàrrega de les imatges encara que ja existeixin.
    """
    from backend.metadata.tmdb import fetch_movie_by_tmdb_id, fetch_tv_by_tmdb_id

    tmdb_api_key = get_tmdb_api_key()
    if not tmdb_api_key:
        raise HTTPException(status_code=400, detail="No hi ha clau API de TMDB configurada")

    with get_db() as conn:
        cursor = conn.cursor()

        # Obtenir info de la sèrie/pel·lícula
        cursor.execute("SELECT id, name, path, media_type FROM series WHERE id = ?", (series_id,))
        series = cursor.fetchone()

        if not series:
            raise HTTPException(status_code=404, detail="Sèrie/pel·lícula no trobada")

        series_path = Path(series["path"])

        # Determinar paths per les imatges
        if series["media_type"] == "movie":
            if series_path.is_file():
                # Carpeta plana - imatges al costat del fitxer
                poster_dir = series_path.parent
                poster_path = poster_dir / f"{series_path.stem}_poster.jpg"
                backdrop_path = poster_dir / f"{series_path.stem}_backdrop.jpg"
            else:
                poster_path = series_path / "poster.jpg"
                backdrop_path = series_path / "backdrop.jpg"
        else:
            poster_path = series_path / "poster.jpg"
            backdrop_path = series_path / "backdrop.jpg"

        # Esborrar imatges existents per forçar la descàrrega
        if poster_path.exists():
            try:
                poster_path.unlink()
            except Exception as e:
                logger.warning(f"No s'ha pogut esborrar el poster existent: {e}")

        if backdrop_path.exists():
            try:
                backdrop_path.unlink()
            except Exception as e:
                logger.warning(f"No s'ha pogut esborrar el backdrop existent: {e}")

        # Obtenir metadades de TMDB
        if request.media_type == "movie":
            metadata = await fetch_movie_by_tmdb_id(
                tmdb_api_key,
                request.tmdb_id,
                poster_path,
                backdrop_path
            )
        else:
            metadata = await fetch_tv_by_tmdb_id(
                tmdb_api_key,
                request.tmdb_id,
                poster_path,
                backdrop_path
            )

        if not metadata["found"]:
            raise HTTPException(
                status_code=404,
                detail=f"No s'ha trobat cap {'pel·lícula' if request.media_type == 'movie' else 'sèrie'} amb TMDB ID {request.tmdb_id}"
            )

        # Actualitzar la base de dades amb les noves imatges I metadades
        update_fields = []
        update_values = []

        # Sempre guardar el TMDB ID i les metadades
        update_fields.append("tmdb_id = ?")
        update_values.append(request.tmdb_id)

        if metadata.get("title"):
            update_fields.append("title = ?")
            update_values.append(metadata["title"])

        if metadata.get("year"):
            update_fields.append("year = ?")
            update_values.append(metadata["year"])

        if metadata.get("overview"):
            update_fields.append("overview = ?")
            update_values.append(metadata["overview"])

        if metadata.get("rating"):
            update_fields.append("rating = ?")
            update_values.append(metadata["rating"])

        if metadata.get("genres"):
            import json
            update_fields.append("genres = ?")
            update_values.append(json.dumps(metadata["genres"]))

        if metadata.get("runtime"):
            update_fields.append("runtime = ?")
            update_values.append(metadata["runtime"])

        if metadata.get("tagline"):
            update_fields.append("tagline = ?")
            update_values.append(metadata["tagline"])

        if metadata.get("original_title"):
            update_fields.append("original_title = ?")
            update_values.append(metadata["original_title"])

        # Per pel·lícules: director
        if metadata.get("director"):
            update_fields.append("director = ?")
            update_values.append(metadata["director"])

        # Per sèries: creadors
        if metadata.get("creators"):
            update_fields.append("creators = ?")
            update_values.append(json.dumps(metadata["creators"]))

        # Repartiment (cast)
        if metadata.get("cast"):
            update_fields.append("cast_members = ?")
            update_values.append(json.dumps(metadata["cast"]))

        if metadata["poster_downloaded"]:
            update_fields.append("poster = ?")
            update_values.append(str(poster_path))

        if metadata["backdrop_downloaded"]:
            update_fields.append("backdrop = ?")
            update_values.append(str(backdrop_path))

        # Actualitzar data de modificació
        update_fields.append("updated_date = CURRENT_TIMESTAMP")

        if update_fields:
            update_values.append(series_id)
            cursor.execute(
                f"UPDATE series SET {', '.join(update_fields)} WHERE id = ?",
                update_values
            )
            conn.commit()

        return {
            "status": "success",
            "message": f"Metadades actualitzades per '{series['name']}'",
            "tmdb_id": request.tmdb_id,
            "title": metadata.get("title"),
            "poster_downloaded": metadata["poster_downloaded"],
            "backdrop_downloaded": metadata["backdrop_downloaded"],
            "metadata": metadata
        }


@app.post("/api/metadata/auto-fetch")
async def auto_fetch_all_metadata():
    """
    Busca automàticament metadades TMDB per a totes les sèries i pel·lícules
    que no tenen tmdb_id configurat.
    Retorna el nombre d'elements actualitzats.
    """
    from backend.metadata.tmdb import fetch_tv_metadata, fetch_movie_metadata
    import re

    tmdb_api_key = get_tmdb_api_key()
    if not tmdb_api_key:
        raise HTTPException(status_code=400, detail="No hi ha clau API de TMDB configurada")

    updated_count = 0
    errors = []

    with get_db() as conn:
        cursor = conn.cursor()

        # Get all items without tmdb_id
        cursor.execute("""
            SELECT id, name, path, media_type
            FROM series
            WHERE tmdb_id IS NULL OR tmdb_id = 0
        """)
        items = cursor.fetchall()

    for item in items:
        try:
            item_path = Path(item["path"])

            # Clean name for search
            name = item["name"]
            clean_name = re.sub(r'\s*\(\d{4}\)\s*$', '', name)
            clean_name = re.sub(r'\s*-\s*(720p|1080p|4K|HDR).*$', '', clean_name, flags=re.IGNORECASE)

            # Extract year if present
            year_match = re.search(r'\((\d{4})\)', name)
            year = int(year_match.group(1)) if year_match else None

            # Determine paths
            if item_path.is_dir():
                poster_path = item_path / "folder.jpg"
                backdrop_path = item_path / "backdrop.jpg"
            else:
                poster_path = item_path.parent / "folder.jpg"
                backdrop_path = item_path.parent / "backdrop.jpg"

            # Fetch metadata
            if item["media_type"] == "movie":
                result = await fetch_movie_metadata(
                    tmdb_api_key, clean_name, year,
                    poster_path if not poster_path.exists() else None,
                    backdrop_path if not backdrop_path.exists() else None
                )
            else:
                result = await fetch_tv_metadata(
                    tmdb_api_key, clean_name, year,
                    poster_path if not poster_path.exists() else None,
                    backdrop_path if not backdrop_path.exists() else None
                )

            if result and result.get("found"):
                # Update database
                with get_db() as conn:
                    cursor = conn.cursor()
                    genres_json = json.dumps(result.get("genres", []))

                    cursor.execute('''
                        UPDATE series SET
                            tmdb_id = ?,
                            title = ?,
                            year = ?,
                            overview = ?,
                            rating = ?,
                            genres = ?,
                            runtime = ?,
                            poster = CASE WHEN ? = 1 THEN ? ELSE poster END,
                            backdrop = CASE WHEN ? = 1 THEN ? ELSE backdrop END,
                            updated_date = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ''', (
                        result.get("tmdb_id"),
                        result.get("title"),
                        result.get("year"),
                        result.get("overview"),
                        result.get("rating"),
                        genres_json,
                        result.get("runtime"),
                        1 if result.get("poster_downloaded") else 0,
                        str(poster_path) if result.get("poster_downloaded") else None,
                        1 if result.get("backdrop_downloaded") else 0,
                        str(backdrop_path) if result.get("backdrop_downloaded") else None,
                        item["id"]
                    ))
                    conn.commit()

                updated_count += 1
                logger.info(f"Auto-fetch: {name} -> {result.get('title')}")

        except Exception as e:
            errors.append(f"{item['name']}: {str(e)}")
            logger.error(f"Auto-fetch error for {item['name']}: {e}")

    return {
        "status": "success",
        "updated": updated_count,
        "total_without_metadata": len(items),
        "errors": errors[:10] if errors else []
    }


@app.post("/api/metadata/refresh-all")
async def refresh_all_metadata(background_tasks: BackgroundTasks):
    """
    Força l'actualització de metadades TMDB per a TOTES les sèries i pel·lícules.
    Executa en background per no bloquejar.
    """
    from backend.metadata.tmdb import fetch_tv_metadata, fetch_movie_metadata
    import re

    tmdb_api_key = get_tmdb_api_key()
    if not tmdb_api_key:
        raise HTTPException(status_code=400, detail="No hi ha clau API de TMDB configurada")

    async def do_refresh():
        updated_count = 0
        errors = []

        with get_db() as conn:
            cursor = conn.cursor()

            # Get ALL items (including those with tmdb_id)
            cursor.execute("""
                SELECT id, name, path, media_type, tmdb_id
                FROM series
            """)
            items = cursor.fetchall()

        logger.info(f"Refresh-all: Processant {len(items)} elements...")

        for item in items:
            try:
                item_path = Path(item["path"])

                # Clean name for search
                name = item["name"]
                clean_name = re.sub(r'\s*\(\d{4}\)\s*$', '', name)
                clean_name = re.sub(r'\s*-\s*(720p|1080p|4K|HDR).*$', '', clean_name, flags=re.IGNORECASE)

                # Extract year if present
                year_match = re.search(r'\((\d{4})\)', name)
                year = int(year_match.group(1)) if year_match else None

                # Determine paths
                if item_path.is_dir():
                    poster_path = item_path / "folder.jpg"
                    backdrop_path = item_path / "backdrop.jpg"
                else:
                    poster_path = item_path.parent / "folder.jpg"
                    backdrop_path = item_path.parent / "backdrop.jpg"

                # Fetch metadata (force download images)
                if item["media_type"] == "movie":
                    result = await fetch_movie_metadata(
                        tmdb_api_key, clean_name, year,
                        poster_path,  # Always try to download
                        backdrop_path
                    )
                else:
                    result = await fetch_tv_metadata(
                        tmdb_api_key, clean_name, year,
                        poster_path,
                        backdrop_path
                    )

                if result and result.get("found"):
                    # Update database
                    with get_db() as conn:
                        cursor = conn.cursor()
                        genres_json = json.dumps(result.get("genres", []))

                        cursor.execute('''
                            UPDATE series SET
                                tmdb_id = ?,
                                title = ?,
                                year = ?,
                                overview = ?,
                                rating = ?,
                                genres = ?,
                                runtime = ?,
                                poster = CASE WHEN ? = 1 THEN ? ELSE poster END,
                                backdrop = CASE WHEN ? = 1 THEN ? ELSE backdrop END,
                                updated_date = CURRENT_TIMESTAMP
                            WHERE id = ?
                        ''', (
                            result.get("tmdb_id"),
                            result.get("title"),
                            result.get("year"),
                            result.get("overview"),
                            result.get("rating"),
                            genres_json,
                            result.get("runtime"),
                            1 if result.get("poster_downloaded") else 0,
                            str(poster_path) if result.get("poster_downloaded") else None,
                            1 if result.get("backdrop_downloaded") else 0,
                            str(backdrop_path) if result.get("backdrop_downloaded") else None,
                            item["id"]
                        ))
                        conn.commit()

                    updated_count += 1
                    logger.info(f"Refresh-all: {name} -> {result.get('title')}")

                # Small delay to avoid rate limiting
                await asyncio.sleep(0.3)

            except Exception as e:
                errors.append(f"{item['name']}: {str(e)}")
                logger.error(f"Refresh-all error for {item['name']}: {e}")

        logger.info(f"Refresh-all: Completat. {updated_count}/{len(items)} actualitzats.")

    background_tasks.add_task(asyncio.run, do_refresh())

    return {
        "status": "started",
        "message": "Actualització de metadades iniciada en background"
    }


# ============================================================
# BOOK/AUDIOBOOK METADATA
# ============================================================

class BookMetadataByIsbnRequest(BaseModel):
    isbn: str


class BookMetadataByOlidRequest(BaseModel):
    olid: str


class BookSearchRequest(BaseModel):
    title: str
    author: Optional[str] = None


@app.post("/api/metadata/books/{book_id}/update-by-isbn")
async def update_book_by_isbn(book_id: int, request: BookMetadataByIsbnRequest):
    """
    Actualitza les metadades d'un llibre usant l'ISBN.
    """
    from backend.metadata.openlibrary import fetch_book_by_isbn

    with get_db() as conn:
        cursor = conn.cursor()

        # Obtenir info del llibre
        cursor.execute("SELECT id, title, file_path FROM books WHERE id = ?", (book_id,))
        book = cursor.fetchone()

        if not book:
            raise HTTPException(status_code=404, detail="Llibre no trobat")

        book_path = Path(book["file_path"]).parent
        cover_path = book_path / "cover.jpg"

        # Esborrar portada existent
        if cover_path.exists():
            try:
                cover_path.unlink()
            except Exception as e:
                logger.warning(f"No s'ha pogut esborrar la portada existent: {e}")

        # Obtenir metadades
        metadata = await fetch_book_by_isbn(request.isbn, cover_path)

        if not metadata["found"]:
            raise HTTPException(
                status_code=404,
                detail=f"No s'ha trobat cap llibre amb ISBN {request.isbn}"
            )

        # Actualitzar la base de dades
        if metadata["cover_downloaded"]:
            cursor.execute(
                "UPDATE books SET cover = ? WHERE id = ?",
                (str(cover_path), book_id)
            )
            conn.commit()

        return {
            "status": "success",
            "message": f"Metadades actualitzades per '{book['title']}'",
            "isbn": request.isbn,
            "title": metadata.get("title"),
            "author": metadata.get("author"),
            "cover_downloaded": metadata["cover_downloaded"]
        }


@app.post("/api/metadata/books/{book_id}/update-by-olid")
async def update_book_by_olid(book_id: int, request: BookMetadataByOlidRequest):
    """
    Actualitza les metadades d'un llibre usant l'Open Library Work ID.
    """
    from backend.metadata.openlibrary import fetch_book_by_olid

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id, title, file_path FROM books WHERE id = ?", (book_id,))
        book = cursor.fetchone()

        if not book:
            raise HTTPException(status_code=404, detail="Llibre no trobat")

        book_path = Path(book["file_path"]).parent
        cover_path = book_path / "cover.jpg"

        if cover_path.exists():
            try:
                cover_path.unlink()
            except Exception as e:
                logger.warning(f"No s'ha pogut esborrar la portada existent: {e}")

        metadata = await fetch_book_by_olid(request.olid, cover_path)

        if not metadata["found"]:
            raise HTTPException(
                status_code=404,
                detail=f"No s'ha trobat cap llibre amb Open Library ID {request.olid}"
            )

        if metadata["cover_downloaded"]:
            cursor.execute(
                "UPDATE books SET cover = ? WHERE id = ?",
                (str(cover_path), book_id)
            )
            conn.commit()

        return {
            "status": "success",
            "message": f"Metadades actualitzades per '{book['title']}'",
            "olid": request.olid,
            "title": metadata.get("title"),
            "author": metadata.get("author"),
            "cover_downloaded": metadata["cover_downloaded"]
        }


@app.post("/api/metadata/books/search")
async def search_books_metadata(request: BookSearchRequest):
    """
    Cerca llibres a Open Library i retorna múltiples resultats.
    """
    from backend.metadata.openlibrary import search_books

    results = await search_books(request.title, request.author, limit=10)

    return {
        "status": "success",
        "results": results
    }


@app.post("/api/metadata/books/auto-fetch")
async def auto_fetch_all_book_covers(background_tasks: BackgroundTasks):
    """
    Busca automàticament portades per a tots els llibres que no en tinguin.
    Executa en background.
    """
    from backend.metadata.openlibrary import fetch_metadata_for_book

    async def do_fetch():
        updated_count = 0
        errors = []

        with get_db() as conn:
            cursor = conn.cursor()

            # Get all books without covers
            cursor.execute("""
                SELECT b.id, b.title, b.file_path, a.name as author
                FROM books b
                LEFT JOIN authors a ON b.author_id = a.id
                WHERE b.cover IS NULL OR b.cover = ''
            """)
            books = cursor.fetchall()

        logger.info(f"Auto-fetch books: Processant {len(books)} llibres sense portada...")

        for book in books:
            try:
                book_path = Path(book["file_path"]).parent
                cover_path = book_path / "cover.jpg"

                # Skip if cover already exists on disk
                if cover_path.exists():
                    # Update database with existing cover
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE books SET cover = ? WHERE id = ?",
                            (str(cover_path), book["id"])
                        )
                        conn.commit()
                    updated_count += 1
                    continue

                # Fetch metadata and cover
                result = await fetch_metadata_for_book(
                    book["title"],
                    book.get("author"),
                    cover_path
                )

                if result.get("cover_downloaded"):
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE books SET cover = ? WHERE id = ?",
                            (str(cover_path), book["id"])
                        )
                        conn.commit()
                    updated_count += 1
                    logger.info(f"Auto-fetch books: {book['title']} -> portada descarregada")

                # Small delay to avoid rate limiting
                await asyncio.sleep(0.5)

            except Exception as e:
                errors.append(f"{book['title']}: {str(e)}")
                logger.error(f"Auto-fetch books error for {book['title']}: {e}")

        logger.info(f"Auto-fetch books: Completat. {updated_count} portades actualitzades.")

    background_tasks.add_task(asyncio.run, do_fetch())

    return {
        "status": "started",
        "message": "Cerca automàtica de portades iniciada en background"
    }


@app.post("/api/metadata/audiobooks/auto-fetch")
async def auto_fetch_all_audiobook_covers(background_tasks: BackgroundTasks):
    """
    Busca automàticament portades per a tots els audiollibres que no en tinguin.
    Executa en background.
    """
    from backend.metadata.openlibrary import fetch_metadata_for_book

    async def do_fetch():
        updated_count = 0
        errors = []

        with get_db() as conn:
            cursor = conn.cursor()

            # Get all audiobooks without covers
            cursor.execute("""
                SELECT a.id, a.title, aa.name as author, a.folder_path
                FROM audiobooks a
                LEFT JOIN audiobook_authors aa ON a.author_id = aa.id
                WHERE a.cover IS NULL OR a.cover = ''
            """)
            audiobooks = cursor.fetchall()

        logger.info(f"Auto-fetch audiobooks: Processant {len(audiobooks)} audiollibres sense portada...")

        for audiobook in audiobooks:
            try:
                folder_path = Path(audiobook["folder_path"])
                cover_path = folder_path / "cover.jpg"

                # Skip if cover already exists on disk
                if cover_path.exists():
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE audiobooks SET cover = ? WHERE id = ?",
                            (str(cover_path), audiobook["id"])
                        )
                        conn.commit()
                    updated_count += 1
                    continue

                # Fetch metadata and cover
                result = await fetch_metadata_for_book(
                    audiobook["title"],
                    audiobook["author"],
                    cover_path
                )

                if result.get("cover_downloaded"):
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE audiobooks SET cover = ? WHERE id = ?",
                            (str(cover_path), audiobook["id"])
                        )
                        conn.commit()
                    updated_count += 1
                    logger.info(f"Auto-fetch audiobooks: {audiobook['title']} -> portada descarregada")

                # Small delay to avoid rate limiting
                await asyncio.sleep(0.5)

            except Exception as e:
                errors.append(f"{audiobook['title']}: {str(e)}")
                logger.error(f"Auto-fetch audiobooks error for {audiobook['title']}: {e}")

        logger.info(f"Auto-fetch audiobooks: Completat. {updated_count} portades actualitzades.")

    background_tasks.add_task(asyncio.run, do_fetch())

    return {
        "status": "started",
        "message": "Cerca automàtica de portades d'audiollibres iniciada en background"
    }


@app.post("/api/metadata/books/{book_id}/update-by-search-result")
async def update_book_by_search_result(book_id: int, cover_id: int = Query(...)):
    """
    Actualitza la portada d'un llibre usant el cover_id d'un resultat de cerca.
    """
    from backend.metadata.openlibrary import OpenLibraryClient

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id, title, file_path FROM books WHERE id = ?", (book_id,))
        book = cursor.fetchone()

        if not book:
            raise HTTPException(status_code=404, detail="Llibre no trobat")

        book_path = Path(book["file_path"]).parent
        cover_path = book_path / "cover.jpg"

        if cover_path.exists():
            try:
                cover_path.unlink()
            except Exception as e:
                logger.warning(f"No s'ha pogut esborrar la portada existent: {e}")

        client = OpenLibraryClient()
        try:
            downloaded = await client.download_cover(cover_id, cover_path)
        finally:
            await client.close()

        if not downloaded:
            raise HTTPException(
                status_code=404,
                detail="No s'ha pogut descarregar la portada"
            )

        cursor.execute(
            "UPDATE books SET cover = ? WHERE id = ?",
            (str(cover_path), book_id)
        )
        conn.commit()

        return {
            "status": "success",
            "message": f"Portada actualitzada per '{book['title']}'",
            "cover_downloaded": True
        }


@app.post("/api/metadata/books/{book_id}/upload-cover")
async def upload_book_cover(book_id: int, file: UploadFile = File(...)):
    """
    Puja una portada personalitzada per a un llibre.
    Útil quan Open Library no troba el llibre.
    """
    # Validar tipus de fitxer
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="El fitxer ha de ser una imatge")

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id, title, file_path FROM books WHERE id = ?", (book_id,))
        book = cursor.fetchone()

        if not book:
            raise HTTPException(status_code=404, detail="Llibre no trobat")

        book_path = Path(book["file_path"]).parent

        # Determinar extensió
        ext = '.jpg'
        if file.content_type == 'image/png':
            ext = '.png'
        elif file.content_type == 'image/webp':
            ext = '.webp'

        cover_path = book_path / f"cover{ext}"

        # Esborrar portada existent si n'hi ha
        for old_ext in ['.jpg', '.png', '.webp', '.jpeg']:
            old_cover = book_path / f"cover{old_ext}"
            if old_cover.exists():
                try:
                    old_cover.unlink()
                except Exception:
                    pass

        # Guardar nova portada
        try:
            content = await file.read()
            with open(cover_path, 'wb') as f:
                f.write(content)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error guardant la portada: {e}")

        # Actualitzar base de dades
        cursor.execute(
            "UPDATE books SET cover = ? WHERE id = ?",
            (str(cover_path), book_id)
        )
        conn.commit()

        return {
            "status": "success",
            "message": f"Portada pujada per '{book['title']}'",
            "cover_path": str(cover_path)
        }


@app.post("/api/metadata/audiobooks/{audiobook_id}/upload-cover")
async def upload_audiobook_cover(audiobook_id: int, file: UploadFile = File(...)):
    """
    Puja una portada personalitzada per a un audiollibres.
    """
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="El fitxer ha de ser una imatge")

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id, title, folder_path FROM audiobooks WHERE id = ?", (audiobook_id,))
        audiobook = cursor.fetchone()

        if not audiobook:
            raise HTTPException(status_code=404, detail="Audiollibres no trobat")

        folder_path = Path(audiobook["folder_path"])

        ext = '.jpg'
        if file.content_type == 'image/png':
            ext = '.png'
        elif file.content_type == 'image/webp':
            ext = '.webp'

        cover_path = folder_path / f"cover{ext}"

        for old_ext in ['.jpg', '.png', '.webp', '.jpeg']:
            old_cover = folder_path / f"cover{old_ext}"
            if old_cover.exists():
                try:
                    old_cover.unlink()
                except Exception:
                    pass

        try:
            content = await file.read()
            with open(cover_path, 'wb') as f:
                f.write(content)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error guardant la portada: {e}")

        cursor.execute(
            "UPDATE audiobooks SET cover = ? WHERE id = ?",
            (str(cover_path), audiobook_id)
        )
        conn.commit()

        return {
            "status": "success",
            "message": f"Portada pujada per '{audiobook['title']}'",
            "cover_path": str(cover_path)
        }


# Endpoints per audiollibres (mateixa lògica)
@app.post("/api/metadata/audiobooks/{audiobook_id}/update-by-isbn")
async def update_audiobook_by_isbn(audiobook_id: int, request: BookMetadataByIsbnRequest):
    """
    Actualitza les metadades d'un audiollibres usant l'ISBN.
    """
    from backend.metadata.openlibrary import fetch_book_by_isbn

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id, title, folder_path FROM audiobooks WHERE id = ?", (audiobook_id,))
        audiobook = cursor.fetchone()

        if not audiobook:
            raise HTTPException(status_code=404, detail="Audiollibres no trobat")

        cover_path = Path(audiobook["folder_path"]) / "cover.jpg"

        if cover_path.exists():
            try:
                cover_path.unlink()
            except Exception as e:
                logger.warning(f"No s'ha pogut esborrar la portada existent: {e}")

        metadata = await fetch_book_by_isbn(request.isbn, cover_path)

        if not metadata["found"]:
            raise HTTPException(
                status_code=404,
                detail=f"No s'ha trobat cap llibre amb ISBN {request.isbn}"
            )

        if metadata["cover_downloaded"]:
            cursor.execute(
                "UPDATE audiobooks SET cover = ? WHERE id = ?",
                (str(cover_path), audiobook_id)
            )
            conn.commit()

        return {
            "status": "success",
            "message": f"Metadades actualitzades per '{audiobook['title']}'",
            "isbn": request.isbn,
            "title": metadata.get("title"),
            "author": metadata.get("author"),
            "cover_downloaded": metadata["cover_downloaded"]
        }


@app.post("/api/metadata/audiobooks/{audiobook_id}/update-by-olid")
async def update_audiobook_by_olid(audiobook_id: int, request: BookMetadataByOlidRequest):
    """
    Actualitza les metadades d'un audiollibres usant l'Open Library Work ID.
    """
    from backend.metadata.openlibrary import fetch_book_by_olid

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id, title, folder_path FROM audiobooks WHERE id = ?", (audiobook_id,))
        audiobook = cursor.fetchone()

        if not audiobook:
            raise HTTPException(status_code=404, detail="Audiollibres no trobat")

        cover_path = Path(audiobook["folder_path"]) / "cover.jpg"

        if cover_path.exists():
            try:
                cover_path.unlink()
            except Exception as e:
                logger.warning(f"No s'ha pogut esborrar la portada existent: {e}")

        metadata = await fetch_book_by_olid(request.olid, cover_path)

        if not metadata["found"]:
            raise HTTPException(
                status_code=404,
                detail=f"No s'ha trobat cap llibre amb Open Library ID {request.olid}"
            )

        if metadata["cover_downloaded"]:
            cursor.execute(
                "UPDATE audiobooks SET cover = ? WHERE id = ?",
                (str(cover_path), audiobook_id)
            )
            conn.commit()

        return {
            "status": "success",
            "message": f"Metadades actualitzades per '{audiobook['title']}'",
            "olid": request.olid,
            "title": metadata.get("title"),
            "author": metadata.get("author"),
            "cover_downloaded": metadata["cover_downloaded"]
        }


@app.post("/api/metadata/audiobooks/{audiobook_id}/update-by-search-result")
async def update_audiobook_by_search_result(audiobook_id: int, cover_id: int = Query(...)):
    """
    Actualitza la portada d'un audiollibres usant el cover_id d'un resultat de cerca.
    """
    from backend.metadata.openlibrary import OpenLibraryClient

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id, title, folder_path FROM audiobooks WHERE id = ?", (audiobook_id,))
        audiobook = cursor.fetchone()

        if not audiobook:
            raise HTTPException(status_code=404, detail="Audiollibres no trobat")

        cover_path = Path(audiobook["folder_path"]) / "cover.jpg"

        if cover_path.exists():
            try:
                cover_path.unlink()
            except Exception as e:
                logger.warning(f"No s'ha pogut esborrar la portada existent: {e}")

        client = OpenLibraryClient()
        try:
            downloaded = await client.download_cover(cover_id, cover_path)
        finally:
            await client.close()

        if not downloaded:
            raise HTTPException(
                status_code=404,
                detail="No s'ha pogut descarregar la portada"
            )

        cursor.execute(
            "UPDATE audiobooks SET cover = ? WHERE id = ?",
            (str(cover_path), audiobook_id)
        )
        conn.commit()

        return {
            "status": "success",
            "message": f"Portada actualitzada per '{audiobook['title']}'",
            "cover_downloaded": True
        }


# ============================================================
# THUMBNAILS PER EPISODIS
# ============================================================

import subprocess

THUMBNAILS_DIR = settings.METADATA_DIR / "thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

# Estat global per seguiment de progrés
thumbnail_progress = {
    "active": False,
    "current": 0,
    "total": 0,
    "generated": 0,
    "errors": 0,
    "status": "idle"  # idle, deleting, generating, completed
}


@app.get("/api/thumbnails/progress")
async def get_thumbnail_progress():
    """Retorna l'estat actual de la generació de thumbnails"""
    return thumbnail_progress


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


@app.post("/api/thumbnails/regenerate-all")
async def regenerate_all_thumbnails():
    """Esborra i regenera TOTS els thumbnails"""
    global thumbnail_progress

    # Inicialitzar progrés
    thumbnail_progress["active"] = True
    thumbnail_progress["status"] = "deleting"
    thumbnail_progress["current"] = 0
    thumbnail_progress["total"] = 0
    thumbnail_progress["generated"] = 0
    thumbnail_progress["errors"] = 0

    # Esborrar tots els thumbnails existents
    deleted = 0
    if THUMBNAILS_DIR.exists():
        for thumb in THUMBNAILS_DIR.glob("*.jpg"):
            try:
                thumb.unlink()
                deleted += 1
            except Exception as e:
                logger.error(f"Error esborrant thumbnail {thumb}: {e}")

    logger.info(f"Thumbnails esborrats: {deleted}")

    # Regenerar tots
    thumbnail_progress["status"] = "generating"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, file_path FROM media_files")
        rows = cursor.fetchall()
        total = len(rows)
        thumbnail_progress["total"] = total

        logger.info(f"Iniciant generació de {total} thumbnails...")

        for i, row in enumerate(rows, 1):
            thumbnail_progress["current"] = i
            thumbnail_path = THUMBNAILS_DIR / f"{row['id']}.jpg"
            video_path = Path(row["file_path"])

            if not video_path.exists():
                thumbnail_progress["errors"] += 1
                logger.warning(f"[{i}/{total}] Fitxer no existeix: {video_path.name}")
                continue

            if generate_thumbnail(video_path, thumbnail_path):
                thumbnail_progress["generated"] += 1
                if thumbnail_progress["generated"] % 50 == 0 or i == total:
                    logger.info(f"[{i}/{total}] Progrés: {thumbnail_progress['generated']} generades, {thumbnail_progress['errors']} errors")
            else:
                thumbnail_progress["errors"] += 1

    thumbnail_progress["status"] = "completed"
    thumbnail_progress["active"] = False

    logger.info(f"COMPLETAT: {thumbnail_progress['generated']} thumbnails regenerats, {thumbnail_progress['errors']} errors")
    return {"status": "success", "deleted": deleted, "generated": thumbnail_progress["generated"], "errors": thumbnail_progress["errors"]}


# ============================================================
# 3CAT / CCMA CONTENT API
# ============================================================

@app.get("/api/3cat/programs")
async def get_3cat_programs(limit: int = 50):
    """Get list of 3Cat programs."""
    from backend.metadata.ccma import get_3cat_programs as fetch_programs
    try:
        programs = await fetch_programs(limit)
        if not programs:
            return {
                "programs": [],
                "count": 0,
                "status": "unavailable",
                "message": "L'API de 3Cat no està disponible temporalment"
            }
        return {"programs": programs, "count": len(programs), "status": "ok"}
    except Exception as e:
        logger.error(f"Error fetching 3Cat programs: {e}")
        return {
            "programs": [],
            "count": 0,
            "status": "error",
            "message": str(e)
        }


@app.get("/api/3cat/videos")
async def get_3cat_videos(
    program_id: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50
):
    """Get 3Cat videos, optionally filtered by program or category."""
    from backend.metadata.ccma import get_3cat_videos as fetch_videos
    try:
        videos = await fetch_videos(program_id, category, limit)
        if not videos:
            return {
                "videos": [],
                "count": 0,
                "status": "unavailable",
                "message": "No s'han pogut obtenir els vídeos de 3Cat"
            }
        return {"videos": videos, "count": len(videos), "status": "ok"}
    except Exception as e:
        logger.error(f"Error fetching 3Cat videos: {e}")
        return {
            "videos": [],
            "count": 0,
            "status": "error",
            "message": str(e)
        }


@app.get("/api/3cat/videos/{video_id}")
async def get_3cat_video_details(video_id: str):
    """Get details of a specific 3Cat video including stream URL."""
    from backend.metadata.ccma import get_3cat_video_details as fetch_details
    video = await fetch_details(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo no trobat")
    return video


@app.get("/api/3cat/search")
async def search_3cat_content(q: str, limit: int = 30):
    """Search 3Cat content."""
    from backend.metadata.ccma import search_3cat
    videos = await search_3cat(q, limit)
    return {"videos": videos, "count": len(videos)}


@app.get("/api/3cat/latest")
async def get_3cat_latest(content_type: Optional[str] = None, limit: int = 50):
    """
    Get latest 3Cat content.
    content_type can be: movie, series, program
    """
    from backend.metadata.ccma import get_3cat_videos as fetch_videos
    videos = await fetch_videos(None, None, limit)

    # Filter by content type if specified
    if content_type:
        videos = [v for v in videos if v.get('type') == content_type]

    return {"videos": videos, "count": len(videos)}


# ============================================================
# IMPORTACIÓ DE CONTINGUT (TMDB i OpenLibrary)
# ============================================================

class ImportSearchRequest(BaseModel):
    query: str
    media_type: str  # 'movie', 'series', 'book'
    year: Optional[int] = None

class ImportTMDBRequest(BaseModel):
    tmdb_id: int
    media_type: str  # 'movie' o 'series'

class ImportBookRequest(BaseModel):
    title: str
    author: Optional[str] = None
    olid: Optional[str] = None  # Open Library ID
    isbn: Optional[str] = None


@app.post("/api/import/search")
async def search_for_import(data: ImportSearchRequest):
    """
    Cerca contingut per importar des de TMDB (pel·lícules/sèries) o OpenLibrary (llibres).
    """
    results = []

    if data.media_type in ['movie', 'series']:
        # Cerca a TMDB
        api_key = get_tmdb_api_key()
        if not api_key:
            raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB per importar pel·lícules i sèries")

        from backend.metadata.tmdb import TMDBClient
        client = TMDBClient(api_key)

        try:
            if data.media_type == 'movie':
                # Cerca pel·lícules
                params = {"query": data.query, "language": "ca-ES"}
                if data.year:
                    params["year"] = data.year
                response = await client._request("/search/movie", params)

                if response and response.get("results"):
                    for item in response["results"][:15]:
                        release_date = item.get("release_date", "")
                        year = int(release_date[:4]) if release_date and len(release_date) >= 4 else None
                        results.append({
                            "id": item.get("id"),
                            "title": item.get("title"),
                            "original_title": item.get("original_title"),
                            "year": year,
                            "overview": item.get("overview", "")[:200] + "..." if item.get("overview") and len(item.get("overview", "")) > 200 else item.get("overview"),
                            "poster": f"https://image.tmdb.org/t/p/w342{item['poster_path']}" if item.get("poster_path") else None,
                            "rating": item.get("vote_average"),
                            "type": "movie",
                            "source": "tmdb"
                        })
            else:
                # Cerca sèries
                params = {"query": data.query, "language": "ca-ES"}
                if data.year:
                    params["first_air_date_year"] = data.year
                response = await client._request("/search/tv", params)

                if response and response.get("results"):
                    for item in response["results"][:15]:
                        first_air_date = item.get("first_air_date", "")
                        year = int(first_air_date[:4]) if first_air_date and len(first_air_date) >= 4 else None
                        results.append({
                            "id": item.get("id"),
                            "title": item.get("name"),
                            "original_title": item.get("original_name"),
                            "year": year,
                            "overview": item.get("overview", "")[:200] + "..." if item.get("overview") and len(item.get("overview", "")) > 200 else item.get("overview"),
                            "poster": f"https://image.tmdb.org/t/p/w342{item['poster_path']}" if item.get("poster_path") else None,
                            "rating": item.get("vote_average"),
                            "type": "series",
                            "source": "tmdb"
                        })
        finally:
            await client.close()

    elif data.media_type == 'book':
        # Cerca a OpenLibrary
        from backend.metadata.openlibrary import OpenLibraryClient
        client = OpenLibraryClient()

        try:
            books = await client.search_books_multiple(data.query, limit=15)
            for book in books:
                cover_url = f"https://covers.openlibrary.org/b/id/{book['cover_id']}-M.jpg" if book.get("cover_id") else None
                results.append({
                    "id": book.get("key"),
                    "title": book.get("title"),
                    "author": book.get("author"),
                    "year": book.get("year"),
                    "poster": cover_url,
                    "isbn": book.get("isbn"),
                    "type": "book",
                    "source": "openlibrary"
                })
        finally:
            await client.close()

    return {"results": results, "count": len(results)}


@app.post("/api/import/tmdb")
async def import_from_tmdb(data: ImportTMDBRequest):
    """
    Importa una pel·lícula o sèrie des de TMDB.
    Crea una entrada a la base de dades sense necessitat de fitxers físics.
    """
    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    from backend.metadata.tmdb import fetch_movie_by_tmdb_id, fetch_tv_by_tmdb_id
    from pathlib import Path

    virtual_path = f"imported/{data.media_type}/{data.tmdb_id}"

    # Verificar si ja existeix (per tmdb_id o path)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM series WHERE tmdb_id = ? OR path = ?", (data.tmdb_id, virtual_path))
        existing = cursor.fetchone()
        if existing:
            # Retornem èxit si ja existeix (pot passar amb imports paral·lels)
            return {
                "status": "success",
                "message": f"'{existing['name']}' ja existeix a la biblioteca",
                "id": existing['id'],
                "already_exists": True
            }

    # Obtenir metadades de TMDB
    if data.media_type == 'movie':
        metadata = await fetch_movie_by_tmdb_id(api_key, data.tmdb_id)
        media_type_db = 'movie'
    else:
        metadata = await fetch_tv_by_tmdb_id(api_key, data.tmdb_id)
        media_type_db = 'series'

    if not metadata.get("found"):
        raise HTTPException(status_code=404, detail="No s'ha trobat el contingut a TMDB")

    # Descarregar pòster i backdrop
    poster_path = None
    backdrop_path = None
    cache_dir = settings.CACHE_DIR / "imported"
    cache_dir.mkdir(parents=True, exist_ok=True)

    from backend.metadata.tmdb import TMDBClient
    client = TMDBClient(api_key)

    try:
        # Descarregar imatges
        if metadata.get("tmdb_id"):
            poster_file = cache_dir / f"{data.media_type}_{data.tmdb_id}_poster.jpg"
            backdrop_file = cache_dir / f"{data.media_type}_{data.tmdb_id}_backdrop.jpg"

            # Obtenir detalls complets per obtenir paths d'imatges
            if data.media_type == 'movie':
                details = await client.get_movie_details(data.tmdb_id)
            else:
                details = await client.get_tv_details(data.tmdb_id)

            if details:
                if details.get("poster_path"):
                    if await client.download_image(details["poster_path"], poster_file, "w500"):
                        poster_path = str(poster_file)

                if details.get("backdrop_path"):
                    if await client.download_image(details["backdrop_path"], backdrop_file, "w1280"):
                        backdrop_path = str(backdrop_file)
    finally:
        await client.close()

    # Inserir a la base de dades
    with get_db() as conn:
        cursor = conn.cursor()

        try:
            cursor.execute("""
                INSERT INTO series (
                    name, path, media_type, tmdb_id, title, year, overview, rating, genres, runtime,
                    poster, backdrop, director, creators, cast_members,
                    is_imported, source_type, external_url, added_date,
                    content_type, origin_country, original_language
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'tmdb', ?, datetime('now'), ?, ?, ?)
            """, (
                metadata.get("title"),
                virtual_path,
                media_type_db,
                metadata.get("tmdb_id"),
                metadata.get("title"),
                metadata.get("year"),
                metadata.get("overview"),
                metadata.get("rating"),
                json.dumps(metadata.get("genres", [])),
                metadata.get("runtime"),
                poster_path,
                backdrop_path,
                metadata.get("director"),
                json.dumps(metadata.get("creators", [])) if metadata.get("creators") else None,
                json.dumps(metadata.get("cast", [])) if metadata.get("cast") else None,
                f"https://www.themoviedb.org/{data.media_type}/{data.tmdb_id}",
                metadata.get("content_type"),
                json.dumps(metadata.get("origin_country", [])) if metadata.get("origin_country") else None,
                metadata.get("original_language")
            ))

            series_id = cursor.lastrowid
            conn.commit()

            return {
                "status": "success",
                "message": f"{'Pel·lícula' if data.media_type == 'movie' else 'Sèrie'} '{metadata.get('title')}' importada correctament",
                "id": series_id,
                "title": metadata.get("title"),
                "year": metadata.get("year"),
                "poster": poster_path
            }
        except Exception as e:
            # Si falla per UNIQUE constraint, l'element ja existeix (condició de carrera)
            if "UNIQUE constraint" in str(e):
                cursor.execute("SELECT id, name FROM series WHERE tmdb_id = ? OR path = ?", (data.tmdb_id, virtual_path))
                existing = cursor.fetchone()
                if existing:
                    return {
                        "status": "success",
                        "message": f"'{existing['name']}' ja existeix a la biblioteca",
                        "id": existing['id'],
                        "already_exists": True
                    }
            raise


@app.post("/api/import/book")
async def import_book_from_openlibrary(data: ImportBookRequest):
    """
    Importa un llibre des de OpenLibrary.
    Crea una entrada a la base de dades sense necessitat de fitxers físics.
    """
    from backend.metadata.openlibrary import OpenLibraryClient, fetch_book_by_olid, fetch_book_by_isbn
    from pathlib import Path

    metadata = None
    cover_downloaded = False

    cache_dir = settings.CACHE_DIR / "imported" / "books"
    cache_dir.mkdir(parents=True, exist_ok=True)

    # Obtenir metadades per ISBN, OLID, o cerca
    if data.isbn:
        cover_path = cache_dir / f"isbn_{data.isbn}_cover.jpg"
        metadata = await fetch_book_by_isbn(data.isbn, cover_path)
        if metadata.get("found"):
            cover_downloaded = metadata.get("cover_downloaded", False)

    elif data.olid:
        cover_path = cache_dir / f"olid_{data.olid}_cover.jpg"
        metadata = await fetch_book_by_olid(data.olid, cover_path)
        if metadata.get("found"):
            cover_downloaded = metadata.get("cover_downloaded", False)

    else:
        # Cerca per títol/autor
        client = OpenLibraryClient()
        try:
            result = await client.search_book(data.title, data.author)
            if result:
                cover_id = result.get("cover_i")
                cover_path = cache_dir / f"search_{data.title.replace(' ', '_')[:30]}_cover.jpg" if cover_id else None

                if cover_path and cover_id:
                    cover_downloaded = await client.download_cover(cover_id, cover_path)

                metadata = {
                    "found": True,
                    "title": result.get("title"),
                    "author": result.get("author_name", [None])[0] if result.get("author_name") else data.author,
                    "year": result.get("first_publish_year"),
                    "subjects": result.get("subject", [])[:5],
                    "description": result.get("description"),
                    "isbn": result.get("isbn", [None])[0] if result.get("isbn") else None,
                    "olid": result.get("key", "").replace("/works/", ""),
                    "cover_downloaded": cover_downloaded
                }
        finally:
            await client.close()

    if not metadata or not metadata.get("found"):
        raise HTTPException(status_code=404, detail="No s'ha trobat el llibre")

    # Verificar si ja existeix
    with get_db() as conn:
        cursor = conn.cursor()

        # Comprovar per OLID o títol+autor
        if metadata.get("olid"):
            cursor.execute("SELECT id FROM books WHERE olid = ?", (metadata.get("olid"),))
        else:
            cursor.execute("""
                SELECT b.id FROM books b
                LEFT JOIN authors a ON b.author_id = a.id
                WHERE b.title = ? AND (a.name = ? OR ? IS NULL)
            """, (metadata.get("title"), metadata.get("author"), metadata.get("author")))

        existing = cursor.fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Aquest llibre ja existeix a la biblioteca")

        # Crear o obtenir autor
        author_id = None
        if metadata.get("author"):
            cursor.execute("SELECT id FROM authors WHERE name = ?", (metadata.get("author"),))
            author_row = cursor.fetchone()
            if author_row:
                author_id = author_row["id"]
            else:
                author_path = f"imported/authors/{metadata.get('author').replace(' ', '_')[:50]}"
                cursor.execute("""
                    INSERT INTO authors (name, path, created_at)
                    VALUES (?, ?, datetime('now'))
                """, (metadata.get("author"), author_path))
                author_id = cursor.lastrowid

        # Inserir llibre
        virtual_path = f"imported/books/{metadata.get('olid') or metadata.get('title', 'unknown').replace(' ', '_')[:50]}"
        cover_final = str(cover_path) if cover_downloaded else None

        cursor.execute("""
            INSERT INTO books (
                title, author_id, isbn, description, cover_path, file_path,
                language, published_date, is_imported, source_type, external_url, olid, added_date
            ) VALUES (?, ?, ?, ?, ?, ?, 'ca', ?, 1, 'openlibrary', ?, ?, datetime('now'))
        """, (
            metadata.get("title"),
            author_id,
            metadata.get("isbn"),
            metadata.get("description"),
            cover_final,
            virtual_path,
            str(metadata.get("year")) if metadata.get("year") else None,
            f"https://openlibrary.org/works/{metadata.get('olid')}" if metadata.get("olid") else None,
            metadata.get("olid")
        ))

        book_id = cursor.lastrowid
        conn.commit()

        return {
            "status": "success",
            "message": f"Llibre '{metadata.get('title')}' importat correctament",
            "id": book_id,
            "title": metadata.get("title"),
            "author": metadata.get("author"),
            "year": metadata.get("year"),
            "cover": cover_final
        }


@app.get("/api/import/stats")
async def get_import_stats():
    """Retorna estadístiques del contingut importat"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Pel·lícules importades
        cursor.execute("SELECT COUNT(*) FROM series WHERE is_imported = 1 AND media_type = 'movie'")
        imported_movies = cursor.fetchone()[0]

        # Sèries importades
        cursor.execute("SELECT COUNT(*) FROM series WHERE is_imported = 1 AND media_type = 'series'")
        imported_series = cursor.fetchone()[0]

        # Llibres importats
        cursor.execute("SELECT COUNT(*) FROM books WHERE is_imported = 1")
        imported_books = cursor.fetchone()[0]

        return {
            "movies": imported_movies,
            "series": imported_series,
            "books": imported_books,
            "total": imported_movies + imported_series + imported_books
        }


@app.delete("/api/import/{media_type}/{item_id}")
async def delete_imported_item(media_type: str, item_id: int):
    """Elimina un element importat"""
    with get_db() as conn:
        cursor = conn.cursor()

        if media_type in ['movie', 'series']:
            cursor.execute("SELECT id, name, is_imported FROM series WHERE id = ?", (item_id,))
            item = cursor.fetchone()
            if not item:
                raise HTTPException(status_code=404, detail="Element no trobat")
            if not item["is_imported"]:
                raise HTTPException(status_code=400, detail="Aquest element no és importat")

            cursor.execute("DELETE FROM series WHERE id = ?", (item_id,))
            conn.commit()

            return {"status": "success", "message": f"'{item['name']}' eliminat"}

        elif media_type == 'book':
            cursor.execute("SELECT id, title, is_imported FROM books WHERE id = ?", (item_id,))
            item = cursor.fetchone()
            if not item:
                raise HTTPException(status_code=404, detail="Llibre no trobat")
            if not item["is_imported"]:
                raise HTTPException(status_code=400, detail="Aquest llibre no és importat")

            cursor.execute("DELETE FROM books WHERE id = ?", (item_id,))
            conn.commit()

            return {"status": "success", "message": f"'{item['title']}' eliminat"}

        else:
            raise HTTPException(status_code=400, detail="Tipus de contingut no vàlid")


# === DISCOVER (Popular/Trending Content) ===

@app.get("/api/discover/movies")
async def discover_movies(page: int = 1, category: str = "popular"):
    """
    Descobreix pel·lícules populars o en tendència des de TMDB.
    category: 'popular', 'top_rated', 'now_playing', 'upcoming'
    """
    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    from backend.metadata.tmdb import TMDBClient
    client = TMDBClient(api_key)

    try:
        endpoint_map = {
            "popular": "/movie/popular",
            "top_rated": "/movie/top_rated",
            "now_playing": "/movie/now_playing",
            "upcoming": "/movie/upcoming",
            "trending": "/trending/movie/week"
        }
        endpoint = endpoint_map.get(category, "/movie/popular")

        response = await client._request(endpoint, {"language": "ca-ES", "page": page})
        results = []

        if response and response.get("results"):
            # Get IDs of movies already in our library
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT tmdb_id FROM series WHERE media_type = 'movie' AND tmdb_id IS NOT NULL")
                existing_ids = {row[0] for row in cursor.fetchall()}

            for item in response["results"]:
                release_date = item.get("release_date", "")
                year = int(release_date[:4]) if release_date and len(release_date) >= 4 else None
                results.append({
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "original_title": item.get("original_title"),
                    "year": year,
                    "overview": item.get("overview", "")[:200] + "..." if item.get("overview") and len(item.get("overview", "")) > 200 else item.get("overview"),
                    "poster": f"https://image.tmdb.org/t/p/w342{item['poster_path']}" if item.get("poster_path") else None,
                    "backdrop": f"https://image.tmdb.org/t/p/w780{item['backdrop_path']}" if item.get("backdrop_path") else None,
                    "rating": item.get("vote_average"),
                    "type": "movie",
                    "source": "tmdb",
                    "in_library": item.get("id") in existing_ids
                })

        return {
            "results": results,
            "page": response.get("page", 1),
            "total_pages": min(response.get("total_pages", 1), 500),  # TMDB limita a 500 pàgines
            "total_results": response.get("total_results", 0),
            "category": category
        }
    finally:
        await client.close()


@app.get("/api/discover/series")
async def discover_series(page: int = 1, category: str = "popular"):
    """
    Descobreix sèries populars o en tendència des de TMDB.
    category: 'popular', 'top_rated', 'on_the_air', 'airing_today'
    """
    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    from backend.metadata.tmdb import TMDBClient
    client = TMDBClient(api_key)

    try:
        endpoint_map = {
            "popular": "/tv/popular",
            "top_rated": "/tv/top_rated",
            "on_the_air": "/tv/on_the_air",
            "airing_today": "/tv/airing_today",
            "trending": "/trending/tv/week"
        }
        endpoint = endpoint_map.get(category, "/tv/popular")

        response = await client._request(endpoint, {"language": "ca-ES", "page": page})
        results = []

        if response and response.get("results"):
            # Get IDs of series already in our library
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT tmdb_id FROM series WHERE media_type = 'series' AND tmdb_id IS NOT NULL")
                existing_ids = {row[0] for row in cursor.fetchall()}

            for item in response["results"]:
                first_air_date = item.get("first_air_date", "")
                year = int(first_air_date[:4]) if first_air_date and len(first_air_date) >= 4 else None
                results.append({
                    "id": item.get("id"),
                    "title": item.get("name"),
                    "original_title": item.get("original_name"),
                    "year": year,
                    "overview": item.get("overview", "")[:200] + "..." if item.get("overview") and len(item.get("overview", "")) > 200 else item.get("overview"),
                    "poster": f"https://image.tmdb.org/t/p/w342{item['poster_path']}" if item.get("poster_path") else None,
                    "backdrop": f"https://image.tmdb.org/t/p/w780{item['backdrop_path']}" if item.get("backdrop_path") else None,
                    "rating": item.get("vote_average"),
                    "type": "series",
                    "source": "tmdb",
                    "in_library": item.get("id") in existing_ids
                })

        return {
            "results": results,
            "page": response.get("page", 1),
            "total_pages": min(response.get("total_pages", 1), 500),
            "total_results": response.get("total_results", 0),
            "category": category
        }
    finally:
        await client.close()


# ============================================
# BULK IMPORT - Importació massiva de TMDB
# ============================================

# Global state for bulk import tracking
bulk_import_status = {
    "running": False,
    "media_type": None,
    "current_page": 0,
    "total_pages": 0,
    "imported_count": 0,
    "skipped_count": 0,
    "error_count": 0,
    "current_title": None,
    "started_at": None,
    "categories_done": [],
    "current_category": None
}


class BulkImportRequest(BaseModel):
    media_type: str  # 'movie' or 'series'
    max_pages: int = 50  # Màxim de pàgines per categoria (20 resultats/pàgina)
    categories: List[str] = None  # Si és None, importa totes les categories


@app.post("/api/admin/bulk-import/start")
async def start_bulk_import(request: BulkImportRequest, background_tasks: BackgroundTasks):
    """
    Inicia una importació massiva de pel·lícules o sèries des de TMDB.
    Només disponible per admins.
    """
    global bulk_import_status

    if bulk_import_status["running"]:
        raise HTTPException(status_code=400, detail="Ja hi ha una importació en curs")

    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    # Default categories
    if request.media_type == 'movie':
        categories = request.categories or ['popular', 'top_rated', 'now_playing', 'upcoming']
    else:
        categories = request.categories or ['popular', 'top_rated', 'on_the_air', 'airing_today']

    # Reset status
    bulk_import_status = {
        "running": True,
        "media_type": request.media_type,
        "current_page": 0,
        "total_pages": request.max_pages * len(categories),
        "imported_count": 0,
        "skipped_count": 0,
        "error_count": 0,
        "current_title": None,
        "started_at": datetime.now().isoformat(),
        "categories_done": [],
        "current_category": None
    }

    # Start background task
    background_tasks.add_task(
        run_bulk_import,
        api_key,
        request.media_type,
        categories,
        request.max_pages
    )

    return {
        "status": "started",
        "message": f"Importació massiva de {request.media_type} iniciada",
        "categories": categories,
        "max_pages_per_category": request.max_pages
    }


@app.get("/api/admin/bulk-import/status")
async def get_bulk_import_status():
    """Retorna l'estat actual de la importació massiva."""
    return bulk_import_status


@app.post("/api/admin/bulk-import/stop")
async def stop_bulk_import():
    """Atura la importació massiva en curs."""
    global bulk_import_status
    if bulk_import_status["running"]:
        bulk_import_status["running"] = False
        return {"status": "stopping", "message": "Aturant importació..."}
    return {"status": "not_running", "message": "No hi ha cap importació en curs"}


async def run_bulk_import(api_key: str, media_type: str, categories: List[str], max_pages: int):
    """Background task per importar massivament des de TMDB."""
    global bulk_import_status

    from backend.metadata.tmdb import TMDBClient, fetch_movie_by_tmdb_id, fetch_tv_by_tmdb_id
    import asyncio

    client = TMDBClient(api_key)

    # Endpoint maps
    if media_type == 'movie':
        endpoint_map = {
            "popular": "/movie/popular",
            "top_rated": "/movie/top_rated",
            "now_playing": "/movie/now_playing",
            "upcoming": "/movie/upcoming",
            "trending": "/trending/movie/week"
        }
        db_media_type = 'movie'
    else:
        endpoint_map = {
            "popular": "/tv/popular",
            "top_rated": "/tv/top_rated",
            "on_the_air": "/tv/on_the_air",
            "airing_today": "/tv/airing_today",
            "trending": "/trending/tv/week"
        }
        db_media_type = 'series'

    try:
        page_counter = 0

        for category in categories:
            if not bulk_import_status["running"]:
                break

            bulk_import_status["current_category"] = category
            endpoint = endpoint_map.get(category)
            if not endpoint:
                continue

            for page in range(1, max_pages + 1):
                if not bulk_import_status["running"]:
                    break

                page_counter += 1
                bulk_import_status["current_page"] = page_counter

                try:
                    # Fetch page from TMDB
                    response = await client._request(endpoint, {"language": "ca-ES", "page": page})

                    if not response or not response.get("results"):
                        break  # No more results

                    # Get existing IDs
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute(
                            "SELECT tmdb_id FROM series WHERE media_type = ? AND tmdb_id IS NOT NULL",
                            (db_media_type,)
                        )
                        existing_ids = {row[0] for row in cursor.fetchall()}

                    # Import each item
                    for item in response["results"]:
                        if not bulk_import_status["running"]:
                            break

                        tmdb_id = item.get("id")
                        title = item.get("title") if media_type == 'movie' else item.get("name")
                        bulk_import_status["current_title"] = title

                        # Skip if already exists
                        if tmdb_id in existing_ids:
                            bulk_import_status["skipped_count"] += 1
                            continue

                        try:
                            # Import with full metadata
                            if media_type == 'movie':
                                metadata = await fetch_movie_by_tmdb_id(api_key, tmdb_id)
                            else:
                                metadata = await fetch_tv_by_tmdb_id(api_key, tmdb_id)

                            if not metadata.get("found"):
                                bulk_import_status["error_count"] += 1
                                continue

                            # Download poster and backdrop
                            poster_path = None
                            backdrop_path = None
                            cache_dir = settings.CACHE_DIR / "imported"
                            cache_dir.mkdir(parents=True, exist_ok=True)

                            poster_file = cache_dir / f"{media_type}_{tmdb_id}_poster.jpg"
                            backdrop_file = cache_dir / f"{media_type}_{tmdb_id}_backdrop.jpg"

                            # Get details for image paths
                            if media_type == 'movie':
                                details = await client.get_movie_details(tmdb_id)
                            else:
                                details = await client.get_tv_details(tmdb_id)

                            if details:
                                if details.get("poster_path"):
                                    if await client.download_image(details["poster_path"], poster_file, "w500"):
                                        poster_path = str(poster_file)
                                if details.get("backdrop_path"):
                                    if await client.download_image(details["backdrop_path"], backdrop_file, "w1280"):
                                        backdrop_path = str(backdrop_file)

                            # Insert into database
                            virtual_path = f"imported/{media_type}/{tmdb_id}"

                            with get_db() as conn:
                                cursor = conn.cursor()
                                try:
                                    cursor.execute("""
                                        INSERT INTO series (
                                            name, path, media_type, tmdb_id, title, year, overview, rating,
                                            genres, runtime, poster, backdrop, director, creators, cast_members,
                                            is_imported, source_type, external_url, added_date,
                                            content_type, origin_country, original_language
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'tmdb', ?, datetime('now'), ?, ?, ?)
                                    """, (
                                        metadata.get("title"),
                                        virtual_path,
                                        db_media_type,
                                        tmdb_id,
                                        metadata.get("title"),
                                        metadata.get("year"),
                                        metadata.get("overview"),
                                        metadata.get("rating"),
                                        json.dumps(metadata.get("genres", [])),
                                        metadata.get("runtime"),
                                        poster_path,
                                        backdrop_path,
                                        metadata.get("director"),
                                        json.dumps(metadata.get("creators", [])) if metadata.get("creators") else None,
                                        json.dumps(metadata.get("cast", [])) if metadata.get("cast") else None,
                                        f"https://www.themoviedb.org/{media_type}/{tmdb_id}",
                                        metadata.get("content_type"),
                                        json.dumps(metadata.get("origin_country", [])) if metadata.get("origin_country") else None,
                                        metadata.get("original_language")
                                    ))
                                    conn.commit()
                                    bulk_import_status["imported_count"] += 1
                                    existing_ids.add(tmdb_id)  # Add to local set
                                except Exception as e:
                                    if "UNIQUE constraint" in str(e):
                                        bulk_import_status["skipped_count"] += 1
                                    else:
                                        bulk_import_status["error_count"] += 1

                            # Small delay to avoid rate limiting
                            await asyncio.sleep(0.1)

                        except Exception as e:
                            bulk_import_status["error_count"] += 1
                            print(f"Error importing {title}: {e}")

                    # Check if we've reached the last page
                    if page >= response.get("total_pages", 1):
                        break

                except Exception as e:
                    print(f"Error fetching page {page} of {category}: {e}")
                    bulk_import_status["error_count"] += 1

                # Rate limiting between pages
                await asyncio.sleep(0.25)

            bulk_import_status["categories_done"].append(category)

    finally:
        await client.close()
        bulk_import_status["running"] = False
        bulk_import_status["current_title"] = None
        bulk_import_status["current_category"] = None


# ============================================
# BULK IMPORT - Importació massiva de LLIBRES (Open Library)
# ============================================

# Global state for book bulk import tracking
book_bulk_import_status = {
    "running": False,
    "current_page": 0,
    "total_pages": 0,
    "imported_count": 0,
    "skipped_count": 0,
    "error_count": 0,
    "current_title": None,
    "started_at": None,
    "subjects_done": [],
    "current_subject": None
}


class BookBulkImportRequest(BaseModel):
    subjects: List[str] = None  # e.g., ['fiction', 'science_fiction', 'fantasy', 'mystery']
    max_per_subject: int = 100  # Max books per subject


@app.post("/api/admin/bulk-import/books/start")
async def start_book_bulk_import(request: BookBulkImportRequest, background_tasks: BackgroundTasks):
    """
    Inicia una importació massiva de llibres des d'Open Library.
    """
    global book_bulk_import_status

    if book_bulk_import_status["running"]:
        raise HTTPException(status_code=400, detail="Ja hi ha una importació de llibres en curs")

    # Default subjects
    subjects = request.subjects or [
        'fiction', 'science_fiction', 'fantasy', 'mystery', 'romance',
        'thriller', 'horror', 'historical_fiction', 'young_adult', 'classic_literature',
        'biography', 'history', 'science', 'philosophy', 'psychology'
    ]

    # Reset status
    book_bulk_import_status = {
        "running": True,
        "current_page": 0,
        "total_pages": len(subjects),
        "imported_count": 0,
        "skipped_count": 0,
        "error_count": 0,
        "current_title": None,
        "started_at": datetime.now().isoformat(),
        "subjects_done": [],
        "current_subject": None
    }

    # Start background task
    background_tasks.add_task(
        run_book_bulk_import,
        subjects,
        request.max_per_subject
    )

    return {
        "status": "started",
        "message": "Importació massiva de llibres iniciada",
        "subjects": subjects,
        "max_per_subject": request.max_per_subject
    }


@app.get("/api/admin/bulk-import/books/status")
async def get_book_bulk_import_status():
    """Retorna l'estat actual de la importació massiva de llibres."""
    return book_bulk_import_status


@app.post("/api/admin/bulk-import/books/stop")
async def stop_book_bulk_import():
    """Atura la importació massiva de llibres en curs."""
    global book_bulk_import_status
    if book_bulk_import_status["running"]:
        book_bulk_import_status["running"] = False
        return {"status": "stopping", "message": "Aturant importació de llibres..."}
    return {"status": "not_running", "message": "No hi ha cap importació de llibres en curs"}


async def run_book_bulk_import(subjects: List[str], max_per_subject: int):
    """Background task per importar massivament llibres des d'Open Library."""
    global book_bulk_import_status

    from backend.metadata.openlibrary import OpenLibraryClient
    import asyncio

    client = OpenLibraryClient()

    try:
        for subject in subjects:
            if not book_bulk_import_status["running"]:
                break

            book_bulk_import_status["current_subject"] = subject
            book_bulk_import_status["current_page"] += 1

            try:
                # Fetch books from Open Library by subject
                import urllib.request
                import urllib.parse

                offset = 0
                limit = 50  # Books per request
                imported_in_subject = 0

                while imported_in_subject < max_per_subject and book_bulk_import_status["running"]:
                    params = {
                        "q": f"subject:{subject}",
                        "limit": limit,
                        "offset": offset,
                        "fields": "key,title,author_name,first_publish_year,cover_i,isbn,subject"
                    }
                    query_string = urllib.parse.urlencode(params)
                    url = f"https://openlibrary.org/search.json?{query_string}"

                    req = urllib.request.Request(url)
                    req.add_header('User-Agent', 'Hermes Media Server/1.0')

                    try:
                        with urllib.request.urlopen(req, timeout=30) as response:
                            data = json.loads(response.read().decode('utf-8'))
                    except Exception as e:
                        print(f"Error fetching subject {subject}: {e}")
                        book_bulk_import_status["error_count"] += 1
                        break

                    docs = data.get("docs", [])
                    if not docs:
                        break  # No more results

                    # Get existing OLIDs
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT olid FROM books WHERE olid IS NOT NULL")
                        existing_olids = {row[0] for row in cursor.fetchall()}

                    for doc in docs:
                        if not book_bulk_import_status["running"]:
                            break

                        if imported_in_subject >= max_per_subject:
                            break

                        olid = doc.get("key", "").replace("/works/", "")
                        title = doc.get("title")
                        book_bulk_import_status["current_title"] = title

                        if not olid or not title:
                            continue

                        # Skip if already exists
                        if olid in existing_olids:
                            book_bulk_import_status["skipped_count"] += 1
                            continue

                        try:
                            # Get author
                            authors = doc.get("author_name", [])
                            author_name = authors[0] if authors else "Desconegut"
                            year = doc.get("first_publish_year")
                            cover_id = doc.get("cover_i")
                            subjects_list = doc.get("subject", [])[:5]
                            isbn = doc.get("isbn", [None])[0] if doc.get("isbn") else None

                            # Download cover
                            cover_path = None
                            if cover_id:
                                cache_dir = settings.CACHE_DIR / "imported" / "books"
                                cache_dir.mkdir(parents=True, exist_ok=True)
                                cover_file = cache_dir / f"{olid}_cover.jpg"

                                cover_downloaded = await client.download_cover(cover_id, cover_file)
                                if cover_downloaded:
                                    cover_path = str(cover_file)

                            # Get or create author
                            with get_db() as conn:
                                cursor = conn.cursor()

                                # Check if author exists
                                cursor.execute("SELECT id FROM authors WHERE name = ?", (author_name,))
                                author_row = cursor.fetchone()

                                if author_row:
                                    author_id = author_row[0]
                                else:
                                    # Create author
                                    virtual_path = f"imported/authors/{author_name.replace('/', '_')}"
                                    cursor.execute(
                                        "INSERT INTO authors (name, path, created_at) VALUES (?, ?, datetime('now'))",
                                        (author_name, virtual_path)
                                    )
                                    author_id = cursor.lastrowid
                                    conn.commit()

                                # Insert book
                                virtual_path = f"imported/books/{olid}"
                                try:
                                    cursor.execute("""
                                        INSERT INTO books (
                                            title, author_id, isbn, description, cover_path,
                                            file_path, published_date, olid, is_imported, source_type,
                                            external_url, added_date
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'openlibrary', ?, datetime('now'))
                                    """, (
                                        title,
                                        author_id,
                                        isbn,
                                        ", ".join(subjects_list) if subjects_list else None,
                                        cover_path,
                                        virtual_path,
                                        str(year) if year else None,
                                        olid,
                                        f"https://openlibrary.org/works/{olid}"
                                    ))
                                    conn.commit()
                                    book_bulk_import_status["imported_count"] += 1
                                    existing_olids.add(olid)
                                    imported_in_subject += 1
                                except Exception as e:
                                    if "UNIQUE constraint" in str(e):
                                        book_bulk_import_status["skipped_count"] += 1
                                    else:
                                        book_bulk_import_status["error_count"] += 1
                                        print(f"Error inserting book: {e}")

                            # Small delay
                            await asyncio.sleep(0.1)

                        except Exception as e:
                            book_bulk_import_status["error_count"] += 1
                            print(f"Error importing book {title}: {e}")

                    offset += limit

                    # Rate limiting
                    await asyncio.sleep(0.5)

            except Exception as e:
                print(f"Error with subject {subject}: {e}")
                book_bulk_import_status["error_count"] += 1

            book_bulk_import_status["subjects_done"].append(subject)

    finally:
        await client.close()
        book_bulk_import_status["running"] = False
        book_bulk_import_status["current_title"] = None
        book_bulk_import_status["current_subject"] = None


# ============================================
# BULK IMPORT - Importació massiva d'AUDIOLLIBRES (Audnexus)
# ============================================

# Global state for audiobook bulk import tracking
audiobook_bulk_import_status = {
    "running": False,
    "current_page": 0,
    "total_pages": 0,
    "imported_count": 0,
    "skipped_count": 0,
    "error_count": 0,
    "current_title": None,
    "started_at": None,
    "genres_done": [],
    "current_genre": None
}


class AudiobookBulkImportRequest(BaseModel):
    search_terms: List[str] = None  # Search terms to use
    max_per_term: int = 50  # Max audiobooks per search term


@app.post("/api/admin/bulk-import/audiobooks/start")
async def start_audiobook_bulk_import(request: AudiobookBulkImportRequest, background_tasks: BackgroundTasks):
    """
    Inicia una importació massiva d'audiollibres des d'Audnexus.
    """
    global audiobook_bulk_import_status

    if audiobook_bulk_import_status["running"]:
        raise HTTPException(status_code=400, detail="Ja hi ha una importació d'audiollibres en curs")

    # Default search terms (popular authors and genres)
    search_terms = request.search_terms or [
        'Stephen King', 'Brandon Sanderson', 'J.K. Rowling', 'George R.R. Martin',
        'Neil Gaiman', 'Terry Pratchett', 'Agatha Christie', 'Dan Brown',
        'thriller bestseller', 'fantasy epic', 'science fiction', 'mystery detective',
        'romance audiobook', 'horror', 'historical fiction', 'biography'
    ]

    # Reset status
    audiobook_bulk_import_status = {
        "running": True,
        "current_page": 0,
        "total_pages": len(search_terms),
        "imported_count": 0,
        "skipped_count": 0,
        "error_count": 0,
        "current_title": None,
        "started_at": datetime.now().isoformat(),
        "genres_done": [],
        "current_genre": None
    }

    # Start background task
    background_tasks.add_task(
        run_audiobook_bulk_import,
        search_terms,
        request.max_per_term
    )

    return {
        "status": "started",
        "message": "Importació massiva d'audiollibres iniciada",
        "search_terms": search_terms,
        "max_per_term": request.max_per_term
    }


@app.get("/api/admin/bulk-import/audiobooks/status")
async def get_audiobook_bulk_import_status():
    """Retorna l'estat actual de la importació massiva d'audiollibres."""
    return audiobook_bulk_import_status


@app.post("/api/admin/bulk-import/audiobooks/stop")
async def stop_audiobook_bulk_import():
    """Atura la importació massiva d'audiollibres en curs."""
    global audiobook_bulk_import_status
    if audiobook_bulk_import_status["running"]:
        audiobook_bulk_import_status["running"] = False
        return {"status": "stopping", "message": "Aturant importació d'audiollibres..."}
    return {"status": "not_running", "message": "No hi ha cap importació d'audiollibres en curs"}


async def run_audiobook_bulk_import(search_terms: List[str], max_per_term: int):
    """Background task per importar massivament audiollibres des d'Audnexus."""
    global audiobook_bulk_import_status

    from backend.metadata.audnexus import AudnexusClient
    import asyncio

    client = AudnexusClient(region="us")

    try:
        for term in search_terms:
            if not audiobook_bulk_import_status["running"]:
                break

            audiobook_bulk_import_status["current_genre"] = term
            audiobook_bulk_import_status["current_page"] += 1

            try:
                # Search audiobooks
                results = await client.search_audiobooks(term, limit=max_per_term)

                if not results:
                    audiobook_bulk_import_status["genres_done"].append(term)
                    continue

                # Get existing ASINs
                with get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT title FROM audiobooks")
                    existing_titles = {row[0].lower() for row in cursor.fetchall() if row[0]}

                for item in results:
                    if not audiobook_bulk_import_status["running"]:
                        break

                    asin = item.get("asin")
                    title = item.get("title")
                    audiobook_bulk_import_status["current_title"] = title

                    if not asin or not title:
                        continue

                    # Skip if already exists (by title)
                    if title.lower() in existing_titles:
                        audiobook_bulk_import_status["skipped_count"] += 1
                        continue

                    try:
                        # Get full details
                        details = await client.get_audiobook_by_asin(asin)
                        if not details or not details.get("found"):
                            audiobook_bulk_import_status["error_count"] += 1
                            continue

                        # Get author info
                        authors = details.get("authors", [])
                        author_name = authors[0].get("name") if authors else "Desconegut"
                        narrators = details.get("narrators", [])
                        narrator_name = narrators[0].get("name") if narrators else None

                        # Download cover
                        cover_path = None
                        if details.get("image"):
                            cache_dir = settings.CACHE_DIR / "imported" / "audiobooks"
                            cache_dir.mkdir(parents=True, exist_ok=True)
                            cover_file = cache_dir / f"{asin}_cover.jpg"

                            cover_downloaded = await client.download_cover(details["image"], cover_file)
                            if cover_downloaded:
                                cover_path = str(cover_file)

                        # Get or create author
                        with get_db() as conn:
                            cursor = conn.cursor()

                            # Check if author exists
                            cursor.execute("SELECT id FROM audiobook_authors WHERE name = ?", (author_name,))
                            author_row = cursor.fetchone()

                            if author_row:
                                author_id = author_row[0]
                            else:
                                # Create author
                                virtual_path = f"imported/audiobook_authors/{author_name.replace('/', '_')}"
                                cursor.execute(
                                    "INSERT INTO audiobook_authors (name, path, created_at) VALUES (?, ?, datetime('now'))",
                                    (author_name, virtual_path)
                                )
                                author_id = cursor.lastrowid
                                conn.commit()

                            # Calculate duration
                            duration_minutes = details.get("duration_minutes", 0)
                            total_duration = duration_minutes * 60 if duration_minutes else 0

                            # Insert audiobook
                            virtual_path = f"imported/audiobooks/{asin}"
                            try:
                                cursor.execute("""
                                    INSERT INTO audiobooks (
                                        title, author_id, narrator, isbn, description,
                                        cover_path, folder_path, duration, language,
                                        publisher, published_date, total_duration, cover,
                                        added_date
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                                """, (
                                    title,
                                    author_id,
                                    narrator_name,
                                    details.get("isbn"),
                                    details.get("summary") or details.get("description"),
                                    cover_path,
                                    virtual_path,
                                    total_duration,
                                    details.get("language"),
                                    details.get("publisher"),
                                    details.get("release_date"),
                                    total_duration,
                                    cover_path
                                ))
                                conn.commit()
                                audiobook_bulk_import_status["imported_count"] += 1
                                existing_titles.add(title.lower())
                            except Exception as e:
                                if "UNIQUE constraint" in str(e):
                                    audiobook_bulk_import_status["skipped_count"] += 1
                                else:
                                    audiobook_bulk_import_status["error_count"] += 1
                                    print(f"Error inserting audiobook: {e}")

                        # Small delay
                        await asyncio.sleep(0.2)

                    except Exception as e:
                        audiobook_bulk_import_status["error_count"] += 1
                        print(f"Error importing audiobook {title}: {e}")

                # Rate limiting between searches
                await asyncio.sleep(1)

            except Exception as e:
                print(f"Error with search term {term}: {e}")
                audiobook_bulk_import_status["error_count"] += 1

            audiobook_bulk_import_status["genres_done"].append(term)

    finally:
        await client.close()
        audiobook_bulk_import_status["running"] = False
        audiobook_bulk_import_status["current_title"] = None
        audiobook_bulk_import_status["current_genre"] = None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True
    )
