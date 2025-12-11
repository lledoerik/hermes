#!/usr/bin/env python3
"""
Hermes Media Server - API Principal
"""

import os
import sys
import json
import re
import sqlite3
import logging
import asyncio
import unicodedata
from pathlib import Path
from typing import Optional, List, Dict
from contextlib import contextmanager, asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, Query, Request, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
import mimetypes

# Scheduler per sincronització automàtica
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

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

# Scheduler global per sincronització automàtica
scheduler = AsyncIOScheduler()

# Cache en memòria per a TMDB (episodis, detalls de sèries)
# TTL: 24 hores per defecte
class SimpleCache:
    """Cache simple en memòria amb TTL per entrada."""
    def __init__(self, default_ttl: int = 86400):  # 24h per defecte
        self._cache: Dict[str, tuple] = {}  # key -> (value, timestamp, ttl)
        self._default_ttl = default_ttl

    def get(self, key: str):
        """Obtenir valor del cache si no ha expirat."""
        if key in self._cache:
            value, timestamp, ttl = self._cache[key]
            import time
            if time.time() - timestamp < ttl:
                return value
            else:
                del self._cache[key]
        return None

    def set(self, key: str, value, ttl: int = None):
        """Guardar valor al cache amb TTL opcional (usa default si no especificat)."""
        import time
        actual_ttl = ttl if ttl is not None else self._default_ttl
        self._cache[key] = (value, time.time(), actual_ttl)

    def clear(self):
        """Netejar tot el cache."""
        self._cache.clear()

    def size(self) -> int:
        """Retorna el nombre d'elements al cache."""
        return len(self._cache)

    def cleanup_expired(self):
        """Eliminar entrades expirades del cache."""
        import time
        current_time = time.time()
        expired_keys = [
            key for key, (_, timestamp, ttl) in self._cache.items()
            if current_time - timestamp >= ttl
        ]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)

# Instàncies de cache globals
tmdb_cache = SimpleCache(default_ttl=86400)  # 24h per episodis/detalls
torrents_cache = SimpleCache(default_ttl=1800)  # 30min per torrents
stream_url_cache = SimpleCache(default_ttl=14400)  # 4h per URLs de Real-Debrid

# Client httpx global amb connection pooling per reutilitzar connexions
import httpx
import asyncio
_http_client: httpx.AsyncClient = None

# Semàfor per limitar connexions concurrents als proxies de streaming
# Evita sobrecàrrega del servidor amb massa streams simultanis
MAX_CONCURRENT_STREAMS = 20
MAX_CONCURRENT_BBC_SEGMENTS = 50
_stream_semaphore: asyncio.Semaphore = None
_bbc_segment_semaphore: asyncio.Semaphore = None


def get_http_client() -> httpx.AsyncClient:
    """Obtenir el client HTTP global amb connection pooling."""
    global _http_client
    if _http_client is None:
        raise RuntimeError("HTTP client not initialized. App must be started first.")
    return _http_client


def get_stream_semaphore() -> asyncio.Semaphore:
    """Obtenir el semàfor per limitar streams concurrents."""
    global _stream_semaphore
    if _stream_semaphore is None:
        _stream_semaphore = asyncio.Semaphore(MAX_CONCURRENT_STREAMS)
    return _stream_semaphore


def get_bbc_segment_semaphore() -> asyncio.Semaphore:
    """Obtenir el semàfor per limitar segments BBC concurrents."""
    global _bbc_segment_semaphore
    if _bbc_segment_semaphore is None:
        _bbc_segment_semaphore = asyncio.Semaphore(MAX_CONCURRENT_BBC_SEGMENTS)
    return _bbc_segment_semaphore


# Lifespan per gestionar startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestiona l'inici i tancament de l'aplicació."""
    global _http_client

    # Startup - crear client HTTP global amb connection pooling
    _http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=10.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        follow_redirects=True,
    )
    logger.info("HTTP client global iniciat amb connection pooling")

    scheduler.add_job(
        daily_sync_job,
        CronTrigger(hour=2, minute=30),
        id="daily_sync",
        name="Sincronització diària TMDB + Llibres",
        replace_existing=True
    )
    scheduler.start()
    logger.info("Scheduler iniciat - Sincronització diària programada a les 2:30 AM")

    yield  # L'aplicació s'executa aquí

    # Shutdown
    scheduler.shutdown()
    logger.info("Scheduler aturat")

    # Tancar client HTTP
    if _http_client:
        await _http_client.aclose()
        _http_client = None
        logger.info("HTTP client global tancat")


# Crear app FastAPI
app = FastAPI(
    title="Hermes Media Server",
    description="Sistema de streaming personal amb suport multi-pista",
    version="1.0.0",
    lifespan=lifespan
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

def normalize_for_sort(text: str) -> str:
    """
    Normalitza text per ordenar: elimina accents i converteix a minúscules.
    Així 'Érase' s'ordena com 'erase' (a la E, no al final).
    """
    if not text:
        return ""
    # Descompon accents (é → e + ́) i elimina marques diacrítiques
    normalized = unicodedata.normalize('NFD', text)
    # Elimina caràcters de combinació (accents)
    without_accents = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    return without_accents.lower()


def collate_noaccent(str1: str, str2: str) -> int:
    """Col·lació personalitzada per SQLite que ignora accents."""
    s1 = normalize_for_sort(str1 or "")
    s2 = normalize_for_sort(str2 or "")
    if s1 < s2:
        return -1
    elif s1 > s2:
        return 1
    return 0


@contextmanager
def get_db():
    """Context manager per connexions a la BD"""
    conn = sqlite3.connect(
        settings.DATABASE_PATH,
        check_same_thread=False,
        isolation_level=None
    )
    conn.row_factory = sqlite3.Row
    # Registrar col·lació personalitzada per ordenar sense accents
    conn.create_collation("NOACCENT", collate_noaccent)
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
            # Camps per metadades TMDB (temporades/episodis totals)
            ("tmdb_seasons", "INTEGER"),
            ("tmdb_episodes", "INTEGER"),
            # Data d'estrena completa per filtrar 'en cartellera' i 'pròximament'
            ("release_date", "TEXT"),
            # Popularitat de TMDB per ordenar
            ("popularity", "REAL"),
            # Nombre de vots per filtrar valoracions fiables
            ("vote_count", "INTEGER"),
            # Camps per AniList (anime metadata)
            ("anilist_id", "INTEGER"),
            ("mal_id", "INTEGER"),  # MyAnimeList ID
            # Camp per TheTVDB (sèries occidentals i Fanart.tv)
            ("tvdb_id", "INTEGER"),
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

        # Taula streaming_progress (progrés de streaming extern via TMDB ID)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS streaming_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT 1,
                tmdb_id INTEGER NOT NULL,
                media_type TEXT NOT NULL,
                season_number INTEGER,
                episode_number INTEGER,
                progress_percent REAL DEFAULT 0,
                completed INTEGER DEFAULT 0,
                title TEXT,
                poster_path TEXT,
                backdrop_path TEXT,
                still_path TEXT,
                updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, tmdb_id, media_type, season_number, episode_number)
            )
        """)

        # Migració: Afegir columna still_path si no existeix
        try:
            cursor.execute("ALTER TABLE streaming_progress ADD COLUMN still_path TEXT")
        except:
            pass  # La columna ja existeix

        # Migració: Afegir columnes progress_seconds i total_seconds
        try:
            cursor.execute("ALTER TABLE streaming_progress ADD COLUMN progress_seconds INTEGER")
        except:
            pass
        try:
            cursor.execute("ALTER TABLE streaming_progress ADD COLUMN total_seconds INTEGER")
        except:
            pass

        # Migració: Netejar duplicats de pel·lícules a streaming_progress
        try:
            cursor.execute("""
                DELETE FROM streaming_progress
                WHERE media_type = 'movie'
                AND id NOT IN (
                    SELECT MAX(id)
                    FROM streaming_progress
                    WHERE media_type = 'movie'
                    GROUP BY user_id, tmdb_id
                )
            """)
            conn.commit()
        except Exception as e:
            logger.debug(f"Migració neteja duplicats: {e}")

        # Migració: Convertir NULL a 0 per pel·lícules (per UNIQUE constraint)
        try:
            cursor.execute("""
                UPDATE streaming_progress
                SET season_number = 0, episode_number = 0
                WHERE media_type = 'movie'
                AND (season_number IS NULL OR episode_number IS NULL)
            """)
            conn.commit()
        except Exception as e:
            logger.debug(f"Migració NULL a 0: {e}")

        # Taula watchlist (llista de contingut per veure)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                tmdb_id INTEGER NOT NULL,
                media_type TEXT NOT NULL,
                title TEXT,
                poster_path TEXT,
                backdrop_path TEXT,
                year INTEGER,
                rating REAL,
                added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, tmdb_id, media_type)
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

        # Taula settings (configuració del sistema)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

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


class StreamingProgressRequest(BaseModel):
    """Per guardar el progrés de visualització de streaming extern"""
    tmdb_id: int
    media_type: str  # 'movie' o 'series'
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    progress_percent: float = 50.0
    progress_seconds: Optional[int] = None  # Segons actuals de visualització
    total_seconds: Optional[int] = None  # Durada total en segons
    completed: bool = False
    title: Optional[str] = None
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    still_path: Optional[str] = None  # Miniatura de l'episodi


class WatchlistRequest(BaseModel):
    """Per afegir/eliminar contingut de la watchlist"""
    tmdb_id: int
    media_type: str  # 'movie' o 'series'
    title: Optional[str] = None
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    year: Optional[int] = None
    rating: Optional[float] = None


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


@app.get("/api/admin/fix-non-latin-titles/stream")
async def fix_non_latin_titles_stream(request: Request):
    """
    Versió amb streaming SSE per mostrar progrés en temps real.
    Retorna events: progress, updated, error, done
    """
    from backend.metadata.tmdb import TMDBClient, contains_non_latin_characters
    from backend.metadata.anilist import AniListClient
    from backend.auth import get_auth_manager

    # Verificar auth via query param o header (SSE no suporta headers customs)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        token = request.query_params.get("token", "")

    # Validar el token
    user = None
    if token:
        auth = get_auth_manager()
        user = auth.verify_token(token)

    if not user or not user.get("is_admin"):
        async def error_gen():
            yield f"data: {json.dumps({'type': 'error', 'message': 'No autoritzat'})}\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream")

    api_key = get_tmdb_api_key()
    if not api_key:
        async def error_gen():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Cal configurar la clau TMDB'})}\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream")

    async def generate_progress():
        updated = []
        errors = []

        with get_db() as conn:
            cursor = conn.cursor()

            # Assegurar que les columnes necessàries existeixen
            for column, col_type in [
                ("title_english", "TEXT"),
                ("title_romaji", "TEXT"),
                ("title_native", "TEXT"),
                ("anilist_id", "INTEGER"),
                ("mal_id", "INTEGER"),
                ("original_title", "TEXT")
            ]:
                try:
                    cursor.execute(f"ALTER TABLE series ADD COLUMN {column} {col_type}")
                    conn.commit()
                except Exception:
                    pass

            # Trobar contingut que necessita actualització
            cursor.execute("""
                SELECT id, name, title, title_english, tmdb_id, media_type, content_type, genres, origin_country, original_language
                FROM series
                WHERE tmdb_id IS NOT NULL
            """)

            series_to_update = []
            for row in cursor.fetchall():
                name = row["name"] or ""
                title = row["title"] or ""
                title_english = row["title_english"] or ""
                needs_update = (
                    contains_non_latin_characters(name) or
                    contains_non_latin_characters(title) or
                    not title_english
                )
                if needs_update:
                    series_to_update.append(dict(row))

            total = len(series_to_update)
            yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"

            if total == 0:
                yield f"data: {json.dumps({'type': 'done', 'updated': 0, 'errors': 0, 'message': 'No hi ha títols per actualitzar'})}\n\n"
                return

            tmdb_client = TMDBClient(api_key)
            anilist_client = AniListClient()

            try:
                for idx, item in enumerate(series_to_update):
                    try:
                        tmdb_id = item["tmdb_id"]
                        media_type = item["media_type"]
                        best_title = None
                        source = "TMDB"
                        has_non_latin = contains_non_latin_characters(item["name"] or "") or contains_non_latin_characters(item["title"] or "")

                        # Detectar si és anime
                        is_anime = False
                        content_type = item.get("content_type", "")
                        genres_str = item.get("genres", "") or ""
                        origin_country = item.get("origin_country", "") or ""
                        original_language = item.get("original_language", "") or ""

                        if content_type == "anime":
                            is_anime = True
                        elif "Animation" in genres_str or "Animació" in genres_str:
                            if original_language == "ja" or "JP" in origin_country:
                                is_anime = True

                        # Enviar progrés
                        yield f"data: {json.dumps({'type': 'progress', 'current': idx + 1, 'total': total, 'title': item['name']})}\n\n"

                        # Provar idiomes en ordre de preferència: Català → Anglès
                        languages_to_try = [
                            ("ca-ES", "TMDB (català)"),
                            ("en-US", "TMDB (anglès)")
                        ]

                        # Determinar endpoints a provar (primer el tipus correcte, després l'altre)
                        if media_type == "movie":
                            endpoints = [("/movie/", "title"), ("/tv/", "name")]
                        else:
                            endpoints = [("/tv/", "name"), ("/movie/", "title")]

                        # Intentar per ID directe primer
                        for lang_code, lang_source in languages_to_try:
                            for endpoint, title_key in endpoints:
                                data = await tmdb_client._request(f"{endpoint}{tmdb_id}", {"language": lang_code})
                                if data:
                                    tmdb_title = data.get(title_key)
                                    if tmdb_title and not contains_non_latin_characters(tmdb_title):
                                        best_title = tmdb_title
                                        source = lang_source
                                        break
                            if best_title:
                                break

                        # Fallback: cercar per nom si l'ID no funciona
                        if not best_title:
                            search_name = item["name"] or item["title"]
                            if search_name:
                                for lang_code, lang_source in languages_to_try:
                                    # Cercar com a TV
                                    search_url = f"/search/tv"
                                    data = await tmdb_client._request(search_url, {"query": search_name, "language": lang_code})
                                    if data and data.get("results"):
                                        first_result = data["results"][0]
                                        tmdb_title = first_result.get("name")
                                        if tmdb_title and not contains_non_latin_characters(tmdb_title):
                                            best_title = tmdb_title
                                            source = f"{lang_source} (cerca)"
                                            # Actualitzar tmdb_id correcte
                                            new_tmdb_id = first_result.get("id")
                                            if new_tmdb_id:
                                                cursor.execute("UPDATE series SET tmdb_id = ? WHERE id = ?", (new_tmdb_id, item["id"]))
                                            break

                                    # Cercar com a movie
                                    if not best_title:
                                        search_url = f"/search/movie"
                                        data = await tmdb_client._request(search_url, {"query": search_name, "language": lang_code})
                                        if data and data.get("results"):
                                            first_result = data["results"][0]
                                            tmdb_title = first_result.get("title")
                                            if tmdb_title and not contains_non_latin_characters(tmdb_title):
                                                best_title = tmdb_title
                                                source = f"{lang_source} (cerca)"
                                                new_tmdb_id = first_result.get("id")
                                                if new_tmdb_id:
                                                    cursor.execute("UPDATE series SET tmdb_id = ? WHERE id = ?", (new_tmdb_id, item["id"]))
                                                break

                                    if best_title:
                                        break

                        # Per anime, també obtenir AniList IDs
                        if is_anime and media_type == "series":
                            try:
                                search_title = best_title if best_title else item["name"]
                                anilist_result = await anilist_client.search_anime(search_title)
                                if anilist_result and anilist_result.get("anilist_id"):
                                    cursor.execute("""
                                        UPDATE series SET anilist_id = ?, mal_id = ?, content_type = 'anime'
                                        WHERE id = ?
                                    """, (
                                        anilist_result.get("anilist_id"),
                                        anilist_result.get("mal_id"),
                                        item["id"]
                                    ))
                            except Exception as e:
                                logger.warning(f"Error consultant AniList per {item['name']}: {e}")

                        if best_title and not contains_non_latin_characters(best_title):
                            if has_non_latin:
                                cursor.execute("""
                                    UPDATE series
                                    SET name = ?, title = ?, title_english = ?, original_title = COALESCE(original_title, ?)
                                    WHERE id = ?
                                """, (best_title, best_title, best_title, item["name"], item["id"]))
                            else:
                                cursor.execute("""
                                    UPDATE series SET title_english = ? WHERE id = ?
                                """, (best_title, item["id"]))

                            conn.commit()
                            updated.append({"old": item["name"], "new": best_title, "source": source})

                            yield f"data: {json.dumps({'type': 'updated', 'old_title': item['name'], 'new_title': best_title, 'source': source})}\n\n"
                        else:
                            errors.append({"title": item["name"], "error": "No s'ha trobat títol"})

                    except Exception as e:
                        errors.append({"title": item["name"], "error": str(e)})
                        yield f"data: {json.dumps({'type': 'item_error', 'title': item['name'], 'error': str(e)})}\n\n"

            finally:
                await tmdb_client.close()

        yield f"data: {json.dumps({'type': 'done', 'updated': len(updated), 'errors': len(errors), 'message': f'Actualitzats {len(updated)} de {total} títols'})}\n\n"

    return StreamingResponse(
        generate_progress(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.post("/api/admin/fix-non-latin-titles")
async def fix_non_latin_titles(request: Request):
    """
    Actualitza títols amb prioritat d'idioma: Català → Castellà → Anglès
    1. Títols no-llatins → obté títol en l'idioma preferit de TMDB
    2. Tot contingut sense title_english → obté i guarda títol alternatiu per cerca
    Així es pot cercar per títol original o anglès encara que estigui guardat en català.
    """
    from backend.metadata.tmdb import TMDBClient, contains_non_latin_characters
    from backend.metadata.anilist import AniListClient

    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    updated = []
    errors = []

    with get_db() as conn:
        cursor = conn.cursor()

        # Assegurar que les columnes necessàries existeixen (migració automàtica)
        for column, col_type in [
            ("title_english", "TEXT"),
            ("title_romaji", "TEXT"),
            ("title_native", "TEXT"),
            ("anilist_id", "INTEGER"),
            ("mal_id", "INTEGER"),
            ("original_title", "TEXT")
        ]:
            try:
                cursor.execute(f"ALTER TABLE series ADD COLUMN {column} {col_type}")
                conn.commit()
                logger.info(f"Columna '{column}' afegida a la taula series")
            except Exception:
                pass  # La columna ja existeix

        # Trobar contingut que necessita actualització:
        # 1. Títols no-llatins (japonès, coreà, etc.) - canviar títol principal
        # 2. Sense title_english - afegir títol anglès per cerca
        cursor.execute("""
            SELECT id, name, title, title_english, tmdb_id, media_type, content_type, genres, origin_country, original_language
            FROM series
            WHERE tmdb_id IS NOT NULL
        """)

        series_to_update = []
        for row in cursor.fetchall():
            name = row["name"] or ""
            title = row["title"] or ""
            title_english = row["title_english"] or ""

            # Processar si:
            # 1. Títol conté caràcters no-llatins (necessita canvi de títol principal)
            # 2. O no té title_english (necessita afegir-lo per cerca)
            needs_update = (
                contains_non_latin_characters(name) or
                contains_non_latin_characters(title) or
                not title_english
            )
            if needs_update:
                series_to_update.append(dict(row))

        logger.info(f"Trobades {len(series_to_update)} sèries per actualitzar")

        # Clients
        tmdb_client = TMDBClient(api_key)
        anilist_client = AniListClient()

        try:
            for item in series_to_update:
                try:
                    tmdb_id = item["tmdb_id"]
                    media_type = item["media_type"]
                    best_title = None
                    source = "TMDB"
                    has_non_latin = contains_non_latin_characters(item["name"] or "") or contains_non_latin_characters(item["title"] or "")

                    # Detectar si és anime
                    is_anime = False
                    content_type = item.get("content_type", "")
                    genres_str = item.get("genres", "") or ""
                    origin_country = item.get("origin_country", "") or ""
                    original_language = item.get("original_language", "") or ""

                    if content_type == "anime":
                        is_anime = True
                    elif "Animation" in genres_str or "Animació" in genres_str:
                        if original_language == "ja" or "JP" in origin_country:
                            is_anime = True

                    # Provar idiomes en ordre de preferència: Català → Anglès
                    languages_to_try = [
                        ("ca-ES", "TMDB (català)"),
                        ("en-US", "TMDB (anglès)")
                    ]

                    for lang_code, lang_source in languages_to_try:
                        if media_type == "movie":
                            data = await tmdb_client._request(f"/movie/{tmdb_id}", {"language": lang_code})
                            tmdb_title = data.get("title") if data else None
                        else:
                            data = await tmdb_client._request(f"/tv/{tmdb_id}", {"language": lang_code})
                            tmdb_title = data.get("name") if data else None

                        # Si trobem un títol en llatí, usar-lo
                        if tmdb_title and not contains_non_latin_characters(tmdb_title):
                            best_title = tmdb_title
                            source = lang_source
                            break  # Aturar quan trobem un títol vàlid

                    # Per anime, també obtenir AniList IDs
                    if is_anime and media_type == "series":
                        try:
                            # Cercar per títol trobat (més precís que japonès)
                            search_title = best_title if best_title else item["name"]
                            anilist_result = await anilist_client.search_anime(search_title)
                            if anilist_result:
                                # Guardar anilist_id i mal_id
                                if anilist_result.get("anilist_id"):
                                    cursor.execute("""
                                        UPDATE series SET anilist_id = ?, mal_id = ?, content_type = 'anime'
                                        WHERE id = ?
                                    """, (
                                        anilist_result.get("anilist_id"),
                                        anilist_result.get("mal_id"),
                                        item["id"]
                                    ))
                        except Exception as e:
                            logger.warning(f"Error consultant AniList per {item['name']}: {e}")

                    if best_title and not contains_non_latin_characters(best_title):
                        # Si té títol no-llatí, canviar el títol principal
                        # Si no, només afegir title_english per cerca
                        if has_non_latin:
                            cursor.execute("""
                                UPDATE series
                                SET name = ?, title = ?, title_english = ?, original_title = COALESCE(original_title, ?)
                                WHERE id = ?
                            """, (
                                best_title,
                                best_title,
                                best_title,
                                item["name"],
                                item["id"]
                            ))
                        else:
                            # Només afegir title_english per cerca (no canviar títol principal)
                            cursor.execute("""
                                UPDATE series SET title_english = ? WHERE id = ?
                            """, (best_title, item["id"]))

                        conn.commit()

                        updated.append({
                            "id": item["id"],
                            "old_title": item["name"],
                            "new_title": best_title if has_non_latin else f"{item['name']} (+{source}: {best_title})",
                            "source": source
                        })
                        logger.info(f"Títol actualitzat ({source}): {item['name']} -> {best_title}")
                    else:
                        errors.append({
                            "id": item["id"],
                            "title": item["name"],
                            "error": "No s'ha pogut obtenir títol en català, castellà ni anglès"
                        })

                except Exception as e:
                    errors.append({
                        "id": item["id"],
                        "title": item["name"],
                        "error": str(e)
                    })
                    logger.warning(f"Error actualitzant {item['name']}: {e}")

        finally:
            await tmdb_client.close()

    return {
        "status": "success",
        "total_found": len(series_to_update),
        "updated": len(updated),
        "errors": len(errors),
        "updated_items": updated,
        "error_items": errors[:10]
    }


@app.post("/api/admin/precache-episodes")
async def precache_episodes(request: Request):
    """
    Pre-cacheja metadades d'episodis (títols traduïts) per totes les sèries.
    Això fa que la càrrega sigui instantània per l'usuari.
    """
    from backend.metadata.service import MetadataService

    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    cached = []
    errors = []

    with get_db() as conn:
        cursor = conn.cursor()

        # Obtenir totes les sèries amb tmdb_id
        cursor.execute("""
            SELECT id, name, tmdb_id, anilist_id, content_type, tmdb_seasons
            FROM series
            WHERE tmdb_id IS NOT NULL AND media_type = 'series'
        """)

        series_list = [dict(row) for row in cursor.fetchall()]

    metadata_service = MetadataService()

    logger.info(f"Pre-cache: {len(series_list)} sèries a processar")

    for series in series_list:
        try:
            tmdb_id = series["tmdb_id"]
            # NO usar AniList per evitar rate limiting (429 errors)
            # Només necessitem dades de TMDB per episodis

            # Obtenir número de temporades des de la BD o TMDB
            tmdb_seasons = series.get("tmdb_seasons") or 10  # màxim 10 si no ho sabem
            max_seasons = min(tmdb_seasons, 20)  # límit raonable

            series_cached = 0
            for season_num in range(1, max_seasons + 1):
                try:
                    data = await metadata_service.get_episodes_metadata(
                        tmdb_id=tmdb_id,
                        season_number=season_num,
                        anilist_id=None,  # Evitar AniList rate limiting
                        content_type=None
                    )
                    if data and data.get("episodes"):
                        cached.append({
                            "series": series["name"],
                            "season": season_num,
                            "episodes": len(data["episodes"])
                        })
                        series_cached += 1
                    else:
                        # Continuar amb la següent temporada (algunes sèries salten temporades)
                        if season_num > 3 and series_cached == 0:
                            break  # Si després de 3 intents no hi ha res, parar
                except Exception as e:
                    logger.debug(f"Pre-cache error {series['name']} S{season_num}: {e}")
                    if season_num > 3 and series_cached == 0:
                        break

            # Petita pausa per no sobrecarregar TMDB
            await asyncio.sleep(0.1)

            if series_cached > 0:
                logger.debug(f"Pre-cache: {series['name']} - {series_cached} temporades")

        except Exception as e:
            errors.append({
                "series": series["name"],
                "error": str(e)
            })
            logger.warning(f"Pre-cache error {series.get('name', 'unknown')}: {e}")

    return {
        "status": "success",
        "cached_seasons": len(cached),
        "errors": len(errors),
        "details": cached[:20],  # Primeres 20
        "error_details": errors[:10]
    }


@app.get("/api/user/continue-watching")
async def get_continue_watching(request: Request):
    """Retorna el contingut que l'usuari està veient (per continuar)"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1  # Default user_id 1 si no autenticat

    watching = []

    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Obtenir contingut local en progrés (no acabat) - sèries i pel·lícules
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
                s.backdrop,
                s.tmdb_id
            FROM watch_progress wp
            JOIN media_files mf ON wp.media_id = mf.id
            LEFT JOIN series s ON mf.series_id = s.id
            WHERE wp.user_id = ?
            AND wp.progress_seconds > 30
            AND (wp.total_seconds IS NULL OR wp.progress_seconds < wp.total_seconds * 0.9)
            ORDER BY wp.updated_date DESC
            LIMIT 20
        """, (user_id,))

        for row in cursor.fetchall():
            progress_pct = 0
            if row["total_seconds"] and row["total_seconds"] > 0:
                progress_pct = (row["progress_seconds"] / row["total_seconds"]) * 100

            # Determinar el tipus basant-se en media_type de la taula series
            media_type = row["media_type"] if row["media_type"] else "series"
            if media_type == "movie":
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
                "last_watched": row["updated_date"],
                "tmdb_id": row["tmdb_id"],
                "source": "local"
            })

        # 2. Obtenir contingut de streaming en progrés (no acabat)
        cursor.execute("""
            SELECT
                id,
                tmdb_id,
                media_type,
                season_number,
                episode_number,
                progress_percent,
                progress_seconds,
                total_seconds,
                completed,
                title,
                poster_path,
                backdrop_path,
                still_path,
                updated_date
            FROM streaming_progress
            WHERE user_id = ?
            AND completed = 0
            AND progress_percent > 0
            ORDER BY updated_date DESC
            LIMIT 30
        """, (user_id,))

        # Filtrar duplicats en Python - més fiable que SQL complex
        # Per sèries: només mostrar l'episodi més recent (agrupar per tmdb_id)
        seen_movies = set()  # Per pel·lícules: només tmdb_id
        seen_series = set()  # Per sèries: només tmdb_id (un entry per sèrie)

        for row in cursor.fetchall():
            tmdb_id = row["tmdb_id"]
            media_type = row["media_type"]

            # Filtrar duplicats
            if media_type == "movie":
                if tmdb_id in seen_movies:
                    continue  # Saltar duplicat
                seen_movies.add(tmdb_id)
                item_type = "movie"
            else:
                # Per sèries, només mostrar un entry (l'episodi més recent)
                if tmdb_id in seen_series:
                    continue  # Ja tenim aquesta sèrie
                seen_series.add(tmdb_id)
                item_type = "series"

            # Usar valors reals si disponibles, si no estimar
            progress_secs = row["progress_seconds"]
            total_secs = row["total_seconds"]
            if progress_secs is None or total_secs is None:
                # Fallback per entrades antigues sense segons reals
                total_secs = 6000  # 100 min estimat
                progress_secs = int((row["progress_percent"] / 100) * total_secs)

            watching.append({
                "id": row["id"],
                "type": item_type,
                "tmdb_id": tmdb_id,
                "series_name": row["title"],
                "title": row["title"],
                "season_number": row["season_number"],
                "episode_number": row["episode_number"],
                "poster": row["poster_path"],
                "backdrop": row["backdrop_path"],
                "still_path": row["still_path"],
                "progress_seconds": progress_secs,
                "total_seconds": total_secs,
                "progress_percentage": row["progress_percent"],
                "last_watched": row["updated_date"],
                "source": "streaming"
            })

        # Ordenar tot per data i limitar
        watching.sort(key=lambda x: x.get("last_watched", ""), reverse=True)
        return watching[:20]


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


# === WATCHLIST ===

@app.get("/api/user/watchlist")
async def get_watchlist(request: Request):
    """Retorna la watchlist de l'usuari (sense límit)"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Cal iniciar sessió")
    user_id = user["id"]

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                id,
                tmdb_id,
                media_type,
                title,
                poster_path,
                backdrop_path,
                year,
                rating,
                added_date
            FROM watchlist
            WHERE user_id = ?
            ORDER BY added_date DESC
        """, (user_id,))

        items = []
        for row in cursor.fetchall():
            items.append({
                "id": row["id"],
                "tmdb_id": row["tmdb_id"],
                "media_type": row["media_type"],
                "title": row["title"],
                "poster_path": row["poster_path"],
                "backdrop_path": row["backdrop_path"],
                "year": row["year"],
                "rating": row["rating"],
                "added_date": row["added_date"]
            })

        return items


@app.post("/api/user/watchlist")
async def add_to_watchlist(data: WatchlistRequest, request: Request):
    """Afegeix un element a la watchlist"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Cal iniciar sessió")
    user_id = user["id"]

    with get_db() as conn:
        cursor = conn.cursor()

        try:
            cursor.execute("""
                INSERT INTO watchlist (
                    user_id, tmdb_id, media_type, title, poster_path, backdrop_path, year, rating
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, data.tmdb_id, data.media_type, data.title,
                  data.poster_path, data.backdrop_path, data.year, data.rating))

            conn.commit()

            return {
                "status": "success",
                "message": "Afegit a la llista",
                "tmdb_id": data.tmdb_id
            }
        except Exception as e:
            if "UNIQUE constraint" in str(e):
                return {
                    "status": "exists",
                    "message": "Ja està a la llista",
                    "tmdb_id": data.tmdb_id
                }
            raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/user/watchlist/{tmdb_id}")
async def remove_from_watchlist(tmdb_id: int, media_type: str, request: Request):
    """Elimina un element de la watchlist"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Cal iniciar sessió")
    user_id = user["id"]

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM watchlist
            WHERE user_id = ? AND tmdb_id = ? AND media_type = ?
        """, (user_id, tmdb_id, media_type))

        conn.commit()

        if cursor.rowcount > 0:
            return {
                "status": "success",
                "message": "Eliminat de la llista",
                "tmdb_id": tmdb_id
            }
        else:
            return {
                "status": "not_found",
                "message": "No estava a la llista",
                "tmdb_id": tmdb_id
            }


@app.get("/api/user/watchlist/check/{tmdb_id}")
async def check_in_watchlist(tmdb_id: int, media_type: str, request: Request):
    """Comprova si un element està a la watchlist"""
    user = get_current_user(request)
    if not user:
        return {"in_watchlist": False}
    user_id = user["id"]

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id FROM watchlist
            WHERE user_id = ? AND tmdb_id = ? AND media_type = ?
        """, (user_id, tmdb_id, media_type))

        return {"in_watchlist": cursor.fetchone() is not None}


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


# === STREAMING PROGRESS (EXTERN) ===

@app.post("/api/streaming/progress")
async def save_streaming_progress(data: StreamingProgressRequest, request: Request):
    """Guarda el progrés de visualització de streaming extern (via TMDB ID)"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    with get_db() as conn:
        cursor = conn.cursor()

        # Normalitzar season_number i episode_number per pel·lícules
        # Usar 0 en lloc de NULL per evitar problemes amb UNIQUE constraint
        season = data.season_number if data.media_type == "series" else 0
        episode = data.episode_number if data.media_type == "series" else 0

        # Usar UPSERT per insertar o actualitzar
        cursor.execute("""
            INSERT INTO streaming_progress (
                user_id, tmdb_id, media_type, season_number, episode_number,
                progress_percent, progress_seconds, total_seconds,
                completed, title, poster_path, backdrop_path, still_path, updated_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
                progress_percent = excluded.progress_percent,
                progress_seconds = COALESCE(excluded.progress_seconds, streaming_progress.progress_seconds),
                total_seconds = COALESCE(excluded.total_seconds, streaming_progress.total_seconds),
                completed = excluded.completed,
                title = COALESCE(excluded.title, streaming_progress.title),
                poster_path = COALESCE(excluded.poster_path, streaming_progress.poster_path),
                backdrop_path = COALESCE(excluded.backdrop_path, streaming_progress.backdrop_path),
                still_path = COALESCE(excluded.still_path, streaming_progress.still_path),
                updated_date = datetime('now')
        """, (user_id, data.tmdb_id, data.media_type, season, episode,
              data.progress_percent, data.progress_seconds, data.total_seconds,
              1 if data.completed else 0, data.title,
              data.poster_path, data.backdrop_path, data.still_path))

        conn.commit()

        return {
            "status": "success",
            "message": "Progrés de streaming guardat",
            "progress_percent": data.progress_percent,
            "completed": data.completed
        }


@app.get("/api/streaming/progress")
async def get_streaming_progress(
    request: Request,
    tmdb_id: int = Query(...),
    media_type: str = Query(...),
    season: Optional[int] = Query(None),
    episode: Optional[int] = Query(None)
):
    """Obté el progrés de visualització de streaming extern"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    with get_db() as conn:
        cursor = conn.cursor()

        # Normalitzar per pel·lícules
        if media_type == "movie":
            season = None
            episode = None

        # Construir consulta dinàmicament per gestionar NULLs correctament
        if media_type == "movie":
            cursor.execute("""
                SELECT progress_percent, completed, title, updated_date
                FROM streaming_progress
                WHERE user_id = ? AND tmdb_id = ? AND media_type = 'movie'
                ORDER BY updated_date DESC
                LIMIT 1
            """, (user_id, tmdb_id))
        else:
            cursor.execute("""
                SELECT progress_percent, completed, title, updated_date
                FROM streaming_progress
                WHERE user_id = ? AND tmdb_id = ? AND media_type = ?
                AND COALESCE(season_number, 0) = COALESCE(?, 0)
                AND COALESCE(episode_number, 0) = COALESCE(?, 0)
                ORDER BY updated_date DESC
                LIMIT 1
            """, (user_id, tmdb_id, media_type, season, episode))

        row = cursor.fetchone()
        if not row:
            return {
                "progress_percent": 0,
                "completed": False,
                "exists": False
            }

        return {
            "progress_percent": row["progress_percent"],
            "completed": bool(row["completed"]),
            "title": row["title"],
            "last_watched": row["updated_date"],
            "exists": True
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
async def get_series(content_type: str = None, page: int = 1, limit: int = 50, sort_by: str = "name", search: str = None, category: str = None):
    """Retorna les sèries amb paginació. Filtre opcional: series, anime, toons (comma-separated for multiple)
    Categories: popular (mínim vots + ordenar per rating), on_the_air (en emissió TMDB), airing_today (avui TMDB)"""
    from backend.metadata.tmdb import TMDBClient, contains_non_latin_characters

    # Per on_the_air i airing_today, obtenim els IDs de TMDB
    tmdb_ids = []
    if category in ["on_the_air", "airing_today"]:
        api_key = get_tmdb_api_key()
        if api_key:
            try:
                client = TMDBClient(api_key)
                if category == "on_the_air":
                    tmdb_ids = await client.get_tv_on_the_air()
                else:
                    tmdb_ids = await client.get_tv_airing_today()
            except Exception as e:
                logger.error(f"Error obtenint {category} de TMDB: {e}")

    with get_db() as conn:
        cursor = conn.cursor()

        # Parse content types (can be comma-separated)
        content_types = [ct.strip() for ct in content_type.split(',')] if content_type else None

        # Build WHERE clause
        where_conditions = ["s.media_type = 'series'"]
        count_params = []

        # Content type filter
        if content_types:
            placeholders = ','.join(['?' for _ in content_types])
            where_conditions.append(f"s.content_type IN ({placeholders})")
            count_params.extend(content_types)

        # Search filter (inclou títols alternatius per qualsevol idioma)
        if search:
            where_conditions.append("(s.name LIKE ? OR s.title LIKE ? OR s.title_english LIKE ? OR s.title_romaji LIKE ? OR s.title_native LIKE ? OR s.original_title LIKE ?)")
            search_pattern = f"%{search}%"
            count_params.extend([search_pattern] * 6)

        # Category-specific filters
        if category == "popular":
            # Populars: mínim 100 vots per assegurar valoració fiable
            where_conditions.append("COALESCE(s.vote_count, 0) >= 100")
        elif category in ["on_the_air", "airing_today"]:
            # En emissió / Avui: filtrar per IDs de TMDB
            if tmdb_ids:
                placeholders = ','.join(['?' for _ in tmdb_ids])
                where_conditions.append(f"s.tmdb_id IN ({placeholders})")
                count_params.extend(tmdb_ids)
            else:
                # Si no hi ha IDs, retornar buit
                return {"items": [], "total": 0, "page": page, "limit": limit, "total_pages": 0}

        where_clause = " AND ".join(where_conditions)

        # Count total
        count_query = f"SELECT COUNT(*) FROM series s WHERE {where_clause}"
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]

        # Main query
        query = f"""
            SELECT s.*, COUNT(DISTINCT m.season_number) as season_count,
                       COUNT(m.id) as episode_count, s.content_type
            FROM series s
            LEFT JOIN media_files m ON s.id = m.series_id
            WHERE {where_clause}
        """
        params = count_params.copy()

        query += " GROUP BY s.id"

        # Sorting basat en categoria o sort_by
        if category == "popular":
            # Populars: ordenar per rating DESC (les millor valorades amb mínim vots)
            query += " ORDER BY COALESCE(s.rating, 0) DESC, s.name COLLATE NOACCENT"
        elif category in ["on_the_air", "airing_today"]:
            # En emissió / Avui: ordenar per popularitat
            query += " ORDER BY COALESCE(s.popularity, 0) DESC, s.name COLLATE NOACCENT"
        elif sort_by == "year":
            query += " ORDER BY s.year DESC, s.name COLLATE NOACCENT"
        elif sort_by == "episodes":
            query += " ORDER BY episode_count DESC, s.name COLLATE NOACCENT"
        elif sort_by == "seasons":
            query += " ORDER BY season_count DESC, s.name COLLATE NOACCENT"
        else:
            query += " ORDER BY s.name COLLATE NOACCENT"

        # Pagination
        offset = (page - 1) * limit
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)

        series = []
        for row in cursor.fetchall():
            # Usar TMDB metadata si no hi ha fitxers locals
            local_seasons = row["season_count"]
            local_episodes = row["episode_count"]
            tmdb_seasons = row["tmdb_seasons"] if "tmdb_seasons" in row.keys() else None
            tmdb_episodes = row["tmdb_episodes"] if "tmdb_episodes" in row.keys() else None

            # Prioritzar: si hi ha locals, usar-los; si no, usar TMDB
            final_seasons = local_seasons if local_seasons > 0 else (tmdb_seasons or 0)
            final_episodes = local_episodes if local_episodes > 0 else (tmdb_episodes or 0)

            # Preferir títol en llatí (title_english > title_romaji > name)
            display_name = row["name"]
            title_english = row["title_english"] if "title_english" in row.keys() else None
            title_romaji = row["title_romaji"] if "title_romaji" in row.keys() else None

            # Si el nom principal té caràcters no-llatins, buscar alternativa
            if contains_non_latin_characters(display_name or ""):
                if title_english and not contains_non_latin_characters(title_english):
                    display_name = title_english
                elif title_romaji and not contains_non_latin_characters(title_romaji):
                    display_name = title_romaji

            # Si estem cercant i no tenim títol llatí, saltar aquest item
            if search and contains_non_latin_characters(display_name or ""):
                continue

            series.append({
                "id": row["id"],
                "name": display_name,
                "original_name": row["name"],  # Guardar nom original per referència
                "path": row["path"],
                "poster": row["poster"],
                "backdrop": row["backdrop"],
                "season_count": final_seasons,
                "episode_count": final_episodes,
                "local_season_count": local_seasons,
                "local_episode_count": local_episodes,
                "tmdb_id": row["tmdb_id"] if "tmdb_id" in row.keys() else None,
                "year": row["year"] if "year" in row.keys() else None,
                "rating": row["rating"] if "rating" in row.keys() else None,
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
async def get_movies(content_type: str = None, page: int = 1, limit: int = 50, sort_by: str = "name", search: str = None, category: str = None):
    """Retorna les pel·lícules amb paginació. Filtre opcional: movie, anime_movie, animated (comma-separated for multiple)
    Categories: popular (mínim vots + ordenar per rating), now_playing (en cartellera TMDB), upcoming (release_date > avui)"""
    from datetime import datetime, date
    from backend.metadata.tmdb import TMDBClient, contains_non_latin_characters

    # Per now_playing, obtenim els IDs de TMDB
    now_playing_ids = []
    if category == "now_playing":
        api_key = get_tmdb_api_key()
        if api_key:
            try:
                client = TMDBClient(api_key)
                now_playing_ids = await client.get_movies_now_playing()
            except Exception as e:
                logger.error(f"Error obtenint now_playing de TMDB: {e}")

    with get_db() as conn:
        cursor = conn.cursor()

        # Parse content types (can be comma-separated)
        content_types = [ct.strip() for ct in content_type.split(',')] if content_type else None

        # Build WHERE clause
        where_conditions = ["s.media_type = 'movie'"]
        count_params = []

        # Content type filter
        if content_types:
            placeholders = ','.join(['?' for _ in content_types])
            where_conditions.append(f"s.content_type IN ({placeholders})")
            count_params.extend(content_types)

        # Search filter (inclou títols alternatius per qualsevol idioma)
        if search:
            where_conditions.append("(s.name LIKE ? OR s.title LIKE ? OR s.title_english LIKE ? OR s.title_romaji LIKE ? OR s.title_native LIKE ? OR s.original_title LIKE ?)")
            search_pattern = f"%{search}%"
            count_params.extend([search_pattern] * 6)

        # Category-specific filters
        if category == "popular":
            # Populars: mínim 100 vots per assegurar valoració fiable
            where_conditions.append("COALESCE(s.vote_count, 0) >= 100")
        elif category == "now_playing":
            # Cartellera: filtrar per IDs de TMDB now_playing
            if now_playing_ids:
                placeholders = ','.join(['?' for _ in now_playing_ids])
                where_conditions.append(f"s.tmdb_id IN ({placeholders})")
                count_params.extend(now_playing_ids)
            else:
                # Si no hi ha IDs, retornar buit
                return {"items": [], "total": 0, "page": page, "limit": limit, "total_pages": 0}
        elif category == "upcoming":
            # Pròximament: release_date > avui (dia i mes)
            today = date.today().isoformat()  # Format YYYY-MM-DD
            where_conditions.append("s.release_date > ?")
            count_params.append(today)

        where_clause = " AND ".join(where_conditions)

        # Count total
        count_query = f"SELECT COUNT(*) FROM series s WHERE {where_clause}"
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]

        # Main query
        query = f"""
            SELECT s.*, m.duration, m.file_size, m.id as media_id,
                   s.is_imported, s.year, s.rating, s.content_type
            FROM series s
            LEFT JOIN media_files m ON s.id = m.series_id
            WHERE {where_clause}
        """
        params = count_params.copy()

        # Sorting basat en categoria o sort_by
        if category == "popular":
            # Populars: ordenar per rating DESC (les millor valorades amb mínim vots)
            query += " ORDER BY COALESCE(s.rating, 0) DESC, s.name COLLATE NOACCENT"
        elif category == "now_playing":
            # Cartellera: ordenar per popularitat
            query += " ORDER BY COALESCE(s.popularity, 0) DESC, s.name COLLATE NOACCENT"
        elif category == "upcoming":
            # Pròximament: ordenar per data d'estrena ASC (properes primer)
            query += " ORDER BY s.release_date ASC, s.name COLLATE NOACCENT"
        elif sort_by == "year":
            query += " ORDER BY s.year DESC, s.name COLLATE NOACCENT"
        elif sort_by == "duration":
            query += " ORDER BY m.duration DESC, s.name COLLATE NOACCENT"
        else:
            query += " ORDER BY s.name COLLATE NOACCENT"

        # Pagination
        offset = (page - 1) * limit
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)

        movies = []
        for row in cursor.fetchall():
            # Preferir títol en llatí (title_english > title_romaji > name)
            display_name = row["name"]
            title_english = row["title_english"] if "title_english" in row.keys() else None
            title_romaji = row["title_romaji"] if "title_romaji" in row.keys() else None

            # Si el nom principal té caràcters no-llatins, buscar alternativa
            if contains_non_latin_characters(display_name or ""):
                if title_english and not contains_non_latin_characters(title_english):
                    display_name = title_english
                elif title_romaji and not contains_non_latin_characters(title_romaji):
                    display_name = title_romaji

            # Si estem cercant i no tenim títol llatí, saltar aquest item
            if search and contains_non_latin_characters(display_name or ""):
                continue

            movies.append({
                "id": row["id"],
                "name": display_name,
                "original_name": row["name"],
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

        # Comprovar si té episodis locals
        has_local_episodes = len(seasons) > 0

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
            "anilist_id": series.get("anilist_id"),
            "mal_id": series.get("mal_id"),
            "content_type": series.get("content_type"),
            "poster": series.get("poster"),
            "backdrop": series.get("backdrop"),
            "external_url": series.get("external_url"),
            "external_source": series.get("external_source"),
            "seasons": seasons,
            "has_local_episodes": has_local_episodes
        }


@app.get("/api/series/{series_id}/enriched")
async def get_series_detail_enriched(series_id: int):
    """
    Retorna detalls d'una sèrie amb enriquiment automàtic:
    - Detecta si és anime i afegeix dades d'AniList
    - Afegeix artwork de Fanart.tv si falta pòster/backdrop

    Endpoint segur: Si l'enriquiment falla, retorna les dades bàsiques.
    """
    import json as json_module
    from backend.metadata.anilist import AniListClient
    from backend.metadata.fanart import FanartTVClient

    with get_db() as conn:
        cursor = conn.cursor()

        # Info de la sèrie
        cursor.execute("SELECT * FROM series WHERE id = ?", (series_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

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

        has_local_episodes = len(seasons) > 0

        # Parsejar camps JSON
        genres = None
        if series.get("genres"):
            try:
                genres = json_module.loads(series["genres"])
            except (json_module.JSONDecodeError, TypeError):
                genres = None

        creators = None
        if series.get("creators"):
            try:
                creators = json_module.loads(series["creators"])
            except (json_module.JSONDecodeError, TypeError):
                creators = None

        cast_members = None
        if series.get("cast_members"):
            try:
                cast_members = json_module.loads(series["cast_members"])
            except (json_module.JSONDecodeError, TypeError):
                cast_members = None

        # === DETECCIÓ D'ANIME I ENRIQUIMENT ANILIST ===
        is_anime = series.get("content_type") == "anime" or series.get("anilist_id") is not None
        anilist_data = None

        # Auto-detectar anime: gènere Animation (16) + origen japonès
        if not is_anime and genres:
            genre_names = [g.get("name", g) if isinstance(g, dict) else g for g in genres]
            is_animation = "Animation" in genre_names or "Animació" in genre_names
            # Comprovar origen japonès via TMDB
            if is_animation and series.get("tmdb_id"):
                try:
                    api_key = get_tmdb_api_key()
                    if api_key:
                        from backend.metadata.tmdb import TMDBClient
                        tmdb_client = TMDBClient(api_key)
                        try:
                            details = await tmdb_client.get_tv_details(series["tmdb_id"])
                            if details and "JP" in details.get("origin_country", []):
                                is_anime = True
                                logger.info(f"Auto-detectat anime: {series['name']} (ID: {series_id})")
                        finally:
                            await tmdb_client.close()
                except Exception as e:
                    logger.warning(f"Error detectant anime: {e}")

        # Si és anime, intentar enriquir amb AniList
        if is_anime:
            try:
                anilist_client = AniListClient()

                # Si ja tenim anilist_id, usar-lo
                if series.get("anilist_id"):
                    anilist_data = await anilist_client.get_anime_details(series["anilist_id"])
                # Si no, buscar per títol
                elif series.get("name") or series.get("original_title"):
                    search_title = series.get("original_title") or series.get("name")
                    year = series.get("year")
                    search_result = await anilist_client.search_anime(search_title, year=year, is_adult=False)
                    if search_result:
                        anilist_data = await anilist_client.get_anime_details(search_result["anilist_id"])
                        # Guardar anilist_id per futures consultes
                        if anilist_data:
                            cursor.execute("""
                                UPDATE series SET anilist_id = ?, content_type = 'anime'
                                WHERE id = ?
                            """, (search_result["anilist_id"], series_id))
                            conn.commit()

            except Exception as e:
                logger.warning(f"Error enriquint amb AniList: {e}")

        # === FALLBACK ARTWORK DE FANART.TV ===
        fanart_data = None
        if not series.get("poster") or not series.get("backdrop"):
            try:
                fanart_client = FanartTVClient()

                # Intentar amb TVDB ID si el tenim
                tvdb_id = series.get("tvdb_id")
                if not tvdb_id and series.get("tmdb_id"):
                    # Obtenir TVDB ID via TMDB
                    api_key = get_tmdb_api_key()
                    if api_key:
                        from backend.metadata.tmdb import TMDBClient
                        tmdb_client = TMDBClient(api_key)
                        try:
                            external_ids = await tmdb_client._request(f"/tv/{series['tmdb_id']}/external_ids")
                            if external_ids:
                                tvdb_id = external_ids.get("tvdb_id")
                        finally:
                            await tmdb_client.close()

                if tvdb_id:
                    images = await fanart_client.get_tv_images(tvdb_id)
                    if images:
                        fanart_data = {
                            "poster": fanart_client.get_best_image(images.get("posters", [])),
                            "background": fanart_client.get_best_image(images.get("backgrounds", [])),
                            "logo": fanart_client.get_best_image(images.get("logos", []))
                        }
            except Exception as e:
                logger.warning(f"Error obtenint artwork Fanart.tv: {e}")

        # Construir resposta final
        result = {
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
            "anilist_id": series.get("anilist_id"),
            "mal_id": series.get("mal_id"),
            "content_type": "anime" if is_anime else series.get("content_type", "series"),
            "poster": series.get("poster"),
            "backdrop": series.get("backdrop"),
            "external_url": series.get("external_url"),
            "external_source": series.get("external_source"),
            "seasons": seasons,
            "has_local_episodes": has_local_episodes,
            "is_anime": is_anime
        }

        # Aplicar dades d'AniList si en tenim
        if anilist_data:
            # Usar títol anglès d'AniList si existeix
            # IMPORTANT: Actualitzar tant "name" com "title" perquè el frontend comprova "title" primer
            new_title = None
            if anilist_data.get("title_english"):
                new_title = anilist_data["title_english"]
            elif anilist_data.get("title_romaji"):
                new_title = anilist_data["title_romaji"]

            if new_title:
                result["name"] = new_title
                result["title"] = new_title

                # IMPORTANT: Actualitzar també la base de dades perquè la cerca funcioni
                # Guardem el títol anglès/romaji com a nom principal i mantenim l'original com title_native
                try:
                    cursor.execute("""
                        UPDATE series
                        SET name = ?, title = ?,
                            title_romaji = ?, title_native = ?,
                            mal_id = ?
                        WHERE id = ?
                    """, (
                        new_title,
                        new_title,
                        anilist_data.get("title_romaji"),
                        anilist_data.get("title_native"),
                        anilist_data.get("mal_id"),
                        series_id
                    ))
                    conn.commit()
                    logger.info(f"Títol d'anime actualitzat a la BD: {series['name']} -> {new_title}")
                except Exception as e:
                    logger.warning(f"Error actualitzant títol a BD: {e}")

            result["title_romaji"] = anilist_data.get("title_romaji")
            result["title_native"] = anilist_data.get("title_native")
            result["anilist_id"] = anilist_data.get("anilist_id")
            result["mal_id"] = anilist_data.get("mal_id")

            # Usar descripció d'AniList si és millor (AniList retorna "overview", no "description")
            if anilist_data.get("overview") and (not result.get("overview") or len(anilist_data["overview"]) > len(result.get("overview", ""))):
                result["overview"] = anilist_data["overview"]

            # Usar pòster/backdrop d'AniList si no en tenim (AniList retorna "poster" i "banner")
            if not result.get("poster") and anilist_data.get("poster"):
                result["poster"] = anilist_data["poster"]
            if not result.get("backdrop") and anilist_data.get("banner"):
                result["backdrop"] = anilist_data["banner"]

            result["studios"] = anilist_data.get("studios", [])
            result["anilist_score"] = anilist_data.get("rating")  # AniList retorna "rating", no "score"
            result["anilist_status"] = anilist_data.get("status")

        # Aplicar artwork de Fanart.tv com a fallback
        if fanart_data:
            if not result.get("poster") and fanart_data.get("poster"):
                result["poster"] = fanart_data["poster"]
            if not result.get("backdrop") and fanart_data.get("background"):
                result["backdrop"] = fanart_data["background"]
            if fanart_data.get("logo"):
                result["logo"] = fanart_data["logo"]

        return result


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

# === ENDPOINTS DE STREAMING LOCAL (DESACTIVATS) ===
# Aquests endpoints estan desactivats perquè ara s'utilitza streaming extern (embeds).
# Es mantenen comentats per si es vol recuperar la funcionalitat de fitxers locals.

# @app.get("/api/stream/{media_id}/direct")
# async def stream_direct(media_id: int, request: Request):
#     """Streaming directe del fitxer amb suport Range"""
#     with get_db() as conn:
#         cursor = conn.cursor()
#         cursor.execute("SELECT file_path FROM media_files WHERE id = ?", (media_id,))
#         result = cursor.fetchone()
#
#         if not result:
#             raise HTTPException(status_code=404, detail="Arxiu no trobat")
#
#         file_path = Path(result["file_path"])
#         if not file_path.exists():
#             raise HTTPException(status_code=404, detail="Arxiu no existeix")
#
#         return await stream_video_with_range(file_path, request)
#
# @app.post("/api/stream/{media_id}/hls")
# async def stream_hls(media_id: int, request: StreamRequest):
#     """Inicia streaming HLS amb selecció de pistes"""
#     with get_db() as conn:
#         cursor = conn.cursor()
#         cursor.execute("SELECT * FROM media_files WHERE id = ?", (media_id,))
#         media = cursor.fetchone()
#
#         if not media:
#             raise HTTPException(status_code=404, detail="Media no trobat")
#
#         streamer = HermesStreamer()
#         playlist_url = streamer.start_stream(
#             media_id=media_id,
#             file_path=media["file_path"],
#             audio_index=request.audio_index,
#             subtitle_index=request.subtitle_index,
#             quality=request.quality
#         )
#
#         return {"playlist_url": playlist_url}
#
# @app.get("/api/stream/hls/{stream_id}/playlist.m3u8")
# async def get_hls_playlist(stream_id: str):
#     """Serveix la playlist HLS"""
#     playlist_path = Path(f"storage/cache/hls/{stream_id}/playlist.m3u8")
#
#     if not playlist_path.exists():
#         raise HTTPException(status_code=404, detail="Playlist no trobada")
#
#     return FileResponse(
#         path=playlist_path,
#         media_type="application/vnd.apple.mpegurl",
#         headers={"Cache-Control": "no-cache"}
#     )
#
# @app.get("/api/stream/hls/{stream_id}/{segment}")
# async def get_hls_segment(stream_id: str, segment: str):
#     """Serveix segments HLS (.ts)"""
#     segment_path = Path(f"storage/cache/hls/{stream_id}/{segment}")
#
#     if not segment_path.exists():
#         raise HTTPException(status_code=404, detail="Segment no trobat")
#
#     return FileResponse(
#         path=segment_path,
#         media_type="video/mp2t"
#     )

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


@app.get("/api/library/series/{series_id}/enriched")
async def get_library_series_detail_enriched(series_id: int):
    """
    Detalls de sèrie amb enriquiment automàtic AniList i Fanart.tv.
    Usar aquest endpoint per obtenir millors títols d'anime.
    """
    return await get_series_detail_enriched(series_id)


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

        # Deep links per proveïdors principals
        provider_deep_links = {
            8: "https://www.netflix.com/search?q=",      # Netflix
            9: "https://www.amazon.com/s?k=",             # Amazon Prime Video
            337: "https://www.disneyplus.com/search?q=",  # Disney+
            384: "https://www.max.com/search?q=",         # HBO Max
            119: "https://www.primevideo.com/search?phrase=",  # Amazon Prime Video
            350: "https://tv.apple.com/search?term=",     # Apple TV+
            531: "https://www.paramountplus.com/search/?q=",  # Paramount+
            283: "https://www.crunchyroll.com/search?q=", # Crunchyroll
            1899: "https://www.max.com/search?q=",        # Max
            619: "https://www.filmin.es/buscar?q=",       # Filmin
            149: "https://www.movistarplus.es/busqueda?q=",  # Movistar+
            63: "https://www.skyshowtime.com/search?q=",   # SkyShowtime
        }

        for provider_type in ["flatrate", "rent", "buy"]:
            if providers.get(provider_type):
                for p in providers[provider_type]:
                    provider_id = p.get("provider_id")
                    provider_name = p.get("provider_name", "")

                    # Generar deep link si el tenim
                    deep_link = None
                    if provider_id in provider_deep_links:
                        # Utilitzar el títol per a la cerca
                        search_title = ""
                        if media_type == 'movie':
                            movie_details = await client.get_movie_details(tmdb_id)
                            search_title = movie_details.get("title", "") if movie_details else ""
                        else:
                            tv_details = await client.get_tv_details(tmdb_id)
                            search_title = tv_details.get("name", "") if tv_details else ""

                        if search_title:
                            import urllib.parse
                            deep_link = provider_deep_links[provider_id] + urllib.parse.quote(search_title)

                    result[provider_type].append({
                        "id": provider_id,
                        "name": provider_name,
                        "logo": f"https://image.tmdb.org/t/p/w92{p.get('logo_path')}" if p.get("logo_path") else None,
                        "deep_link": deep_link
                    })

        return result
    finally:
        await client.close()


@app.get("/api/tmdb/search")
async def search_tmdb(q: str, limit: int = 20):
    """
    Cerca a TMDB per pel·lícules i sèries.
    Retorna resultats combinats amb poster URLs.
    Prioritat d'idioma: Català → Castellà → Anglès
    """
    from backend.metadata.tmdb import TMDBClient, contains_non_latin_characters

    if not q or len(q) < 2:
        return {"movies": [], "series": []}

    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    client = TMDBClient(api_key)

    try:
        # Idiomes per ordre de preferència: Català → Anglès
        languages = ["ca-ES", "en-US"]

        movies = []
        series = []
        seen_movie_ids = set()
        seen_series_ids = set()

        # Cercar en cada idioma i combinar resultats
        for lang in languages:
            movies_data = await client._request("/search/movie", {"query": q, "language": lang})
            tv_data = await client._request("/search/tv", {"query": q, "language": lang})

            if movies_data and movies_data.get("results"):
                for m in movies_data["results"][:limit]:
                    tmdb_id = m["id"]
                    title = m.get("title")

                    # Si ja tenim aquest ID amb un títol llatí, saltar
                    if tmdb_id in seen_movie_ids:
                        continue

                    # Només afegir si el títol és llatí
                    if title and not contains_non_latin_characters(title):
                        seen_movie_ids.add(tmdb_id)
                        year = None
                        if m.get("release_date"):
                            try:
                                year = int(m["release_date"][:4])
                            except:
                                pass
                        movies.append({
                            "tmdb_id": tmdb_id,
                            "name": title,
                            "original_name": m.get("original_title"),
                            "year": year,
                            "overview": m.get("overview"),
                            "rating": m.get("vote_average"),
                            "poster": client.get_poster_url(m.get("poster_path")),
                            "backdrop": client.get_backdrop_url(m.get("backdrop_path")),
                            "type": "movie",
                            "is_tmdb": True
                        })

            if tv_data and tv_data.get("results"):
                for s in tv_data["results"][:limit]:
                    tmdb_id = s["id"]
                    title = s.get("name")

                    if tmdb_id in seen_series_ids:
                        continue

                    if title and not contains_non_latin_characters(title):
                        seen_series_ids.add(tmdb_id)
                        year = None
                        if s.get("first_air_date"):
                            try:
                                year = int(s["first_air_date"][:4])
                            except:
                                pass
                        series.append({
                            "tmdb_id": tmdb_id,
                            "name": title,
                            "original_name": s.get("original_name"),
                            "year": year,
                            "overview": s.get("overview"),
                            "rating": s.get("vote_average"),
                            "poster": client.get_poster_url(s.get("poster_path")),
                            "backdrop": client.get_backdrop_url(s.get("backdrop_path")),
                            "type": "series",
                            "is_tmdb": True
                        })

        return {"movies": movies[:limit], "series": series[:limit]}
    finally:
        await client.close()


@app.get("/api/tmdb/movie/{tmdb_id}")
async def get_tmdb_movie_details(tmdb_id: int):
    """
    Obtenir detalls d'una pel·lícula des de TMDB.
    """
    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    from backend.metadata.tmdb import TMDBClient, contains_non_latin_characters

    client = TMDBClient(api_key)
    try:
        data = await client._request(f"/movie/{tmdb_id}", {"language": "ca-ES"})
        if not data:
            raise HTTPException(status_code=404, detail="Pel·lícula no trobada")

        year = None
        if data.get("release_date"):
            year = int(data["release_date"][:4])

        # Obtenir títol - si conté caràcters no llatins (japonès, etc), usar anglès
        title = data.get("title")
        if title and contains_non_latin_characters(title):
            english_data = await client._request(f"/movie/{tmdb_id}", {"language": "en-US"})
            if english_data and english_data.get("title"):
                english_title = english_data["title"]
                if not contains_non_latin_characters(english_title):
                    title = english_title

        return {
            "id": f"tmdb-{tmdb_id}",
            "tmdb_id": tmdb_id,
            "name": title,
            "title": title,
            "original_name": data.get("original_title"),
            "year": year,
            "overview": data.get("overview"),
            "rating": data.get("vote_average"),
            "runtime": data.get("runtime"),
            "poster": client.get_poster_url(data.get("poster_path")),
            "poster_path": data.get("poster_path"),
            "backdrop": client.get_backdrop_url(data.get("backdrop_path")),
            "backdrop_path": data.get("backdrop_path"),
            "genres": data.get("genres", []),
            "original_language": data.get("original_language"),
            "is_tmdb": True,
            "media_type": "movie"
        }
    finally:
        await client.close()


@app.get("/api/tmdb/tv/{tmdb_id}")
async def get_tmdb_tv_details(tmdb_id: int):
    """
    Obtenir detalls d'una sèrie des de TMDB.
    """
    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    from backend.metadata.tmdb import TMDBClient, contains_non_latin_characters

    client = TMDBClient(api_key)
    try:
        data = await client._request(f"/tv/{tmdb_id}", {"language": "ca-ES"})
        if not data:
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        year = None
        if data.get("first_air_date"):
            year = int(data["first_air_date"][:4])

        # Obtenir títol - si conté caràcters no llatins (japonès, etc), usar anglès
        title = data.get("name")
        if title and contains_non_latin_characters(title):
            english_data = await client._request(f"/tv/{tmdb_id}", {"language": "en-US"})
            if english_data and english_data.get("name"):
                english_title = english_data["name"]
                if not contains_non_latin_characters(english_title):
                    title = english_title

        return {
            "id": f"tmdb-{tmdb_id}",
            "tmdb_id": tmdb_id,
            "name": title,
            "title": title,
            "original_name": data.get("original_name"),
            "year": year,
            "overview": data.get("overview"),
            "rating": data.get("vote_average"),
            "poster": client.get_poster_url(data.get("poster_path")),
            "poster_path": data.get("poster_path"),
            "backdrop": client.get_backdrop_url(data.get("backdrop_path")),
            "backdrop_path": data.get("backdrop_path"),
            "genres": data.get("genres", []),
            "original_language": data.get("original_language"),
            "seasons": data.get("seasons", []),
            "season_count": data.get("number_of_seasons", 0),
            "episode_count": data.get("number_of_episodes", 0),
            "is_tmdb": True,
            "media_type": "series"
        }
    finally:
        await client.close()


@app.get("/api/tmdb/tv/{tmdb_id}/seasons")
async def get_tmdb_tv_seasons(tmdb_id: int):
    """
    Obtenir totes les temporades d'una sèrie des de TMDB.
    Retorna la llista de temporades amb episodi count, etc.
    """
    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    from backend.metadata.tmdb import TMDBClient

    client = TMDBClient(api_key)
    try:
        seasons = await client.get_tv_seasons(tmdb_id)
        # Filter out season 0 (specials) unless it's the only season
        if len(seasons) > 1:
            seasons = [s for s in seasons if s["season_number"] != 0]
        return {
            "tmdb_id": tmdb_id,
            "seasons": seasons
        }
    finally:
        await client.close()


@app.get("/api/tmdb/tv/{tmdb_id}/season/{season_number}")
async def get_tmdb_tv_season_details(tmdb_id: int, season_number: int):
    """
    Obtenir tots els episodis d'una temporada específica des de TMDB.
    Retorna informació detallada de cada episodi.
    Utilitza cache en memòria (24h) per millorar rendiment.
    """
    # Comprovar cache primer
    cache_key = f"tmdb:season:{tmdb_id}:{season_number}"
    cached_result = tmdb_cache.get(cache_key)
    if cached_result:
        logger.debug(f"Cache hit per temporada {tmdb_id}/{season_number}")
        return cached_result

    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

    from backend.metadata.tmdb import TMDBClient

    client = TMDBClient(api_key)
    try:
        season_data = await client.get_tv_season_details(tmdb_id, season_number)
        if not season_data:
            raise HTTPException(status_code=404, detail="Temporada no trobada")

        # Format episodes for frontend
        episodes = []
        for ep in season_data.get("episodes", []):
            episodes.append({
                "episode_number": ep.get("episode_number"),
                "name": ep.get("name"),
                "overview": ep.get("overview", ""),
                "air_date": ep.get("air_date"),
                "runtime": ep.get("runtime"),
                "still_path": f"https://image.tmdb.org/t/p/w300{ep.get('still_path')}" if ep.get("still_path") else None,
                "vote_average": ep.get("vote_average")
            })

        result = {
            "tmdb_id": tmdb_id,
            "season_number": season_number,
            "name": season_data.get("name"),
            "overview": season_data.get("overview", ""),
            "air_date": season_data.get("air_date"),
            "episodes": episodes
        }

        # Guardar al cache
        tmdb_cache.set(cache_key, result)
        logger.debug(f"Cache set per temporada {tmdb_id}/{season_number}")

        return result
    finally:
        await client.close()


# === ANILIST API ENDPOINTS ===

@app.get("/api/anilist/search")
async def search_anilist(q: str, limit: int = 10):
    """
    Cerca anime a AniList (sense contingut adult).
    Retorna múltiples resultats per selecció manual.
    """
    from backend.metadata.anilist import AniListClient

    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Cal un terme de cerca")

    client = AniListClient()
    results = await client.search_anime_list(q, limit=limit, is_adult=False)

    return {
        "query": q,
        "results": results
    }


@app.get("/api/anilist/anime/{anilist_id}")
async def get_anilist_anime(anilist_id: int):
    """
    Obté informació completa d'un anime d'AniList.
    """
    from backend.metadata.anilist import AniListClient

    # Comprovar cache primer
    cache_key = f"anilist:anime:{anilist_id}"
    cached = tmdb_cache.get(cache_key)
    if cached:
        return cached

    client = AniListClient()
    result = await client.get_anime_details(anilist_id)

    if not result:
        raise HTTPException(status_code=404, detail="Anime no trobat a AniList")

    # Guardar al cache (24h)
    tmdb_cache.set(cache_key, result)

    return result


@app.get("/api/anilist/anime/{anilist_id}/episodes")
async def get_anilist_episodes(anilist_id: int):
    """
    Obté informació dels episodis d'un anime.
    Nota: AniList no té descripcions d'episodis com TMDB.
    """
    from backend.metadata.anilist import AniListClient

    client = AniListClient()
    episodes = await client.get_episodes_info(anilist_id)

    return {
        "anilist_id": anilist_id,
        "episodes": episodes
    }


@app.post("/api/series/{series_id}/link-anilist")
async def link_series_to_anilist(series_id: int, request: Request):
    """
    Vincula una sèrie existent amb un ID d'AniList.
    Actualitza metadata amb dades d'AniList (millor per anime).
    """
    from backend.metadata.anilist import AniListClient

    body = await request.json()
    anilist_id = body.get("anilist_id")

    if not anilist_id:
        raise HTTPException(status_code=400, detail="Cal proporcionar anilist_id")

    # Obtenir metadata d'AniList
    client = AniListClient()
    anilist_data = await client.get_anime_details(anilist_id)

    if not anilist_data:
        raise HTTPException(status_code=404, detail="Anime no trobat a AniList")

    with get_db() as conn:
        cursor = conn.cursor()

        # Comprovar que la sèrie existeix
        cursor.execute("SELECT id, name, content_type FROM series WHERE id = ?", (series_id,))
        series = cursor.fetchone()
        if not series:
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        # Actualitzar amb dades d'AniList
        update_fields = {
            "anilist_id": anilist_id,
            "mal_id": anilist_data.get("mal_id"),
        }

        # Opcionalment actualitzar altres camps si no tenen dades
        cursor.execute("SELECT overview, rating FROM series WHERE id = ?", (series_id,))
        current = cursor.fetchone()

        # Si no hi ha overview o és molt curt, usar el d'AniList
        if not current["overview"] or len(current["overview"] or "") < 50:
            if anilist_data.get("overview"):
                update_fields["overview"] = anilist_data["overview"]

        # Actualitzar rating si no n'hi ha
        if not current["rating"] and anilist_data.get("rating"):
            update_fields["rating"] = anilist_data["rating"] / 10  # AniList usa 0-100

        # Si no és marcat com anime però ho és, actualitzar
        if series["content_type"] not in ["anime", "anime_movie"]:
            # Detectar si és anime
            if anilist_data.get("country") == "JP":
                content_type = "anime_movie" if anilist_data.get("format") == "MOVIE" else "anime"
                update_fields["content_type"] = content_type

        # Construir query d'actualització
        set_clause = ", ".join([f"{k} = ?" for k in update_fields.keys()])
        values = list(update_fields.values()) + [series_id]

        cursor.execute(f"UPDATE series SET {set_clause}, updated_date = CURRENT_TIMESTAMP WHERE id = ?", values)

    return {
        "status": "success",
        "series_id": series_id,
        "anilist_id": anilist_id,
        "mal_id": anilist_data.get("mal_id"),
        "title": anilist_data.get("title"),
        "updated_fields": list(update_fields.keys())
    }


@app.get("/api/series/{series_id}/anilist")
async def get_series_anilist_info(series_id: int):
    """
    Obté info d'AniList per una sèrie (si està linkada).
    """
    from backend.metadata.anilist import AniListClient

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT anilist_id, mal_id, name FROM series WHERE id = ?", (series_id,))
        series = cursor.fetchone()

    if not series:
        raise HTTPException(status_code=404, detail="Sèrie no trobada")

    if not series["anilist_id"]:
        # Intentar cercar automàticament
        client = AniListClient()
        result = await client.search_anime(series["name"], is_adult=False)
        if result:
            return {
                "linked": False,
                "suggested": result,
                "message": "Sèrie no linkada. Suggeriment basat en el nom."
            }
        return {
            "linked": False,
            "suggested": None,
            "message": "Sèrie no linkada a AniList"
        }

    # Obtenir info completa d'AniList
    client = AniListClient()
    anilist_data = await client.get_anime_details(series["anilist_id"])

    return {
        "linked": True,
        "anilist_id": series["anilist_id"],
        "mal_id": series["mal_id"],
        "data": anilist_data
    }


@app.post("/api/series/{series_id}/auto-link-anilist")
async def auto_link_anilist(series_id: int):
    """
    Intenta vincular automàticament una sèrie amb AniList.
    Útil per anime detectat per TMDB.
    """
    from backend.metadata.anilist import AniListClient

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, title, year, content_type, anilist_id
            FROM series WHERE id = ?
        """, (series_id,))
        series = cursor.fetchone()

    if not series:
        raise HTTPException(status_code=404, detail="Sèrie no trobada")

    if series["anilist_id"]:
        return {
            "status": "already_linked",
            "anilist_id": series["anilist_id"]
        }

    # Usar el títol o nom
    search_title = series["title"] or series["name"]

    client = AniListClient()
    result = await client.search_anime(search_title, year=series["year"], is_adult=False)

    if not result:
        return {
            "status": "not_found",
            "searched": search_title
        }

    # Actualitzar la sèrie amb l'ID trobat
    with get_db() as conn:
        conn.execute("""
            UPDATE series
            SET anilist_id = ?, mal_id = ?, updated_date = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (result["anilist_id"], result.get("mal_id"), series_id))

    return {
        "status": "linked",
        "anilist_id": result["anilist_id"],
        "mal_id": result.get("mal_id"),
        "matched_title": result["title"],
        "searched": search_title
    }


@app.post("/api/anime/refresh-metadata")
async def refresh_anime_metadata(background_tasks: BackgroundTasks):
    """
    Actualitza la metadata de tots els animes existents.
    - Vincula amb AniList si no ho està
    - Actualitza títols amb el títol en anglès/romanitzat d'AniList
    - Útil després d'integrar AniList per primera vegada
    """
    background_tasks.add_task(refresh_all_anime_metadata_task)
    return {
        "status": "started",
        "message": "Actualització de metadata d'anime iniciada en segon pla"
    }


async def refresh_all_anime_metadata_task():
    """Task en background per actualitzar tots els animes."""
    from backend.metadata.anilist import AniListClient
    from backend.metadata.tmdb import TMDBClient

    logger.info("Iniciant actualització de metadata d'anime...")

    # Obtenir totes les sèries que podrien ser anime
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, title, year, tmdb_id, content_type, anilist_id, genres
            FROM series
            WHERE content_type = 'anime'
               OR genres LIKE '%Animation%'
               OR origin_country = 'JP'
        """)
        series_list = cursor.fetchall()

    logger.info(f"Trobades {len(series_list)} sèries potencialment anime")

    anilist_client = AniListClient()
    updated_count = 0
    linked_count = 0

    for series in series_list:
        try:
            series_id = series["id"]
            anilist_id = series["anilist_id"]

            # Si no té AniList ID, intentar vincular
            if not anilist_id:
                search_title = series["title"] or series["name"]
                result = await anilist_client.search_anime(
                    search_title,
                    year=series["year"],
                    is_adult=False
                )

                if result:
                    anilist_id = result["anilist_id"]
                    with get_db() as conn:
                        conn.execute("""
                            UPDATE series
                            SET anilist_id = ?, mal_id = ?, content_type = 'anime'
                            WHERE id = ?
                        """, (anilist_id, result.get("mal_id"), series_id))
                    linked_count += 1
                    logger.info(f"Vinculat '{search_title}' amb AniList ID {anilist_id}")

            # Si ara tenim AniList ID, actualitzar metadata
            if anilist_id:
                details = await anilist_client.get_anime_details(anilist_id)

                if details:
                    # Preferència de títol: anglès > romaji > natiu
                    new_title = (
                        details.get("title_english") or
                        details.get("title_romaji") or
                        details.get("title_native") or
                        series["title"]
                    )

                    # Actualitzar a la DB
                    with get_db() as conn:
                        conn.execute("""
                            UPDATE series
                            SET title = ?,
                                content_type = 'anime',
                                updated_date = CURRENT_TIMESTAMP
                            WHERE id = ?
                        """, (new_title, series_id))

                    updated_count += 1
                    logger.info(f"Actualitzat '{series['name']}' -> '{new_title}'")

            # Petit delay per no saturar l'API
            await asyncio.sleep(0.5)

        except Exception as e:
            logger.warning(f"Error actualitzant sèrie {series['id']}: {e}")
            continue

    logger.info(f"Actualització completada: {linked_count} vinculats, {updated_count} actualitzats")


@app.post("/api/series/{series_id}/refresh-metadata")
async def refresh_single_series_metadata(series_id: int):
    """
    Actualitza la metadata d'una sèrie específica.
    Si és anime, usa AniList per obtenir el títol correcte.
    """
    from backend.metadata.anilist import AniListClient
    from backend.metadata.tmdb import TMDBClient

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, title, year, tmdb_id, content_type, anilist_id, genres
            FROM series WHERE id = ?
        """, (series_id,))
        series = cursor.fetchone()

    if not series:
        raise HTTPException(status_code=404, detail="Sèrie no trobada")

    result = {
        "series_id": series_id,
        "original_title": series["title"] or series["name"],
        "new_title": None,
        "source": None,
        "anilist_linked": False
    }

    # Detectar si és anime
    is_anime = (
        series["content_type"] == "anime" or
        (series["genres"] and "Animation" in series["genres"])
    )

    if is_anime:
        anilist_client = AniListClient()
        anilist_id = series["anilist_id"]

        # Si no té AniList ID, intentar vincular
        if not anilist_id:
            search_title = series["title"] or series["name"]
            search_result = await anilist_client.search_anime(
                search_title,
                year=series["year"],
                is_adult=False
            )

            if search_result:
                anilist_id = search_result["anilist_id"]
                with get_db() as conn:
                    conn.execute("""
                        UPDATE series
                        SET anilist_id = ?, mal_id = ?, content_type = 'anime'
                        WHERE id = ?
                    """, (anilist_id, search_result.get("mal_id"), series_id))
                result["anilist_linked"] = True

        # Obtenir detalls d'AniList
        if anilist_id:
            details = await anilist_client.get_anime_details(anilist_id)

            if details:
                new_title = (
                    details.get("title_english") or
                    details.get("title_romaji") or
                    details.get("title_native")
                )

                if new_title:
                    with get_db() as conn:
                        conn.execute("""
                            UPDATE series
                            SET title = ?, updated_date = CURRENT_TIMESTAMP
                            WHERE id = ?
                        """, (new_title, series_id))

                    result["new_title"] = new_title
                    result["source"] = "anilist"
                    result["anilist_id"] = anilist_id

    return result


# === FANART.TV / TVDB / ANIDB ENDPOINTS ===

@app.get("/api/artwork/fallback/{media_type}/{tmdb_id}")
async def get_fallback_artwork(media_type: str, tmdb_id: int):
    """
    Obté artwork alternatiu quan TMDB no té pòster/backdrop.
    Usa Fanart.tv com a font alternativa.
    """
    from backend.metadata.fanart import FanartTVClient

    is_movie = media_type == "movie"
    client = FanartTVClient()

    result = {
        "tmdb_id": tmdb_id,
        "media_type": media_type,
        "poster": None,
        "background": None,
        "logo": None,
        "banner": None,
        "clearart": None
    }

    try:
        if is_movie:
            images = await client.get_movie_images(tmdb_id)
        else:
            # Per sèries, necessitem TVDB ID (intentem convertir)
            # Primer buscar si tenim tvdb_id a la base de dades
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT tvdb_id FROM series WHERE tmdb_id = ?",
                    (tmdb_id,)
                )
                row = cursor.fetchone()
                tvdb_id = row["tvdb_id"] if row and row["tvdb_id"] else None

            if tvdb_id:
                images = await client.get_tv_images(tvdb_id)
            else:
                # Intentar buscar per IMDB ID via TMDB
                from backend.metadata.tmdb import TMDBClient
                tmdb_client = TMDBClient(settings.TMDB_API_KEY)
                try:
                    external_ids = await tmdb_client._request(f"/tv/{tmdb_id}/external_ids")
                    if external_ids:
                        tvdb_id = external_ids.get("tvdb_id")
                        if tvdb_id:
                            images = await client.get_tv_images(tvdb_id)
                        else:
                            images = None
                    else:
                        images = None
                finally:
                    await tmdb_client.close()

        if images:
            result["poster"] = client.get_best_image(images.get("posters", []))
            result["background"] = client.get_best_image(images.get("backgrounds", []))
            result["logo"] = client.get_best_image(images.get("logos", []))
            result["banner"] = client.get_best_image(images.get("banners", []))
            result["clearart"] = client.get_best_image(images.get("clearart", []))

    except Exception as e:
        logger.warning(f"Error getting fallback artwork: {e}")

    return result


@app.get("/api/artwork/logo/{media_type}/{tmdb_id}")
async def get_media_logo(media_type: str, tmdb_id: int):
    """
    Obté el logo d'una sèrie o pel·lícula.
    Útil per mostrar a sobre de backdrops estil Netflix.
    """
    result = await get_fallback_artwork(media_type, tmdb_id)
    return {"logo": result.get("logo")}


@app.get("/api/tvdb/search")
async def search_tvdb(q: str, year: int = None):
    """
    Cerca sèries a TheTVDB.
    Útil per sèries occidentals amb millor metadata.
    """
    from backend.metadata.tvdb import TVDBClient

    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Cal un terme de cerca")

    client = TVDBClient()
    results = await client.search_series(q, year=year)

    return {
        "query": q,
        "results": results
    }


@app.get("/api/tvdb/series/{tvdb_id}")
async def get_tvdb_series(tvdb_id: int):
    """
    Obté informació detallada d'una sèrie de TheTVDB.
    """
    from backend.metadata.tvdb import TVDBClient

    cache_key = f"tvdb:series:{tvdb_id}"
    cached = tmdb_cache.get(cache_key)
    if cached:
        return cached

    client = TVDBClient()
    result = await client.get_series(tvdb_id)

    if not result:
        raise HTTPException(status_code=404, detail="Sèrie no trobada a TheTVDB")

    tmdb_cache.set(cache_key, result)
    return result


@app.get("/api/tvdb/series/{tvdb_id}/episodes")
async def get_tvdb_episodes(tvdb_id: int, season: int = None):
    """
    Obté episodis d'una sèrie de TheTVDB.
    Pot tenir millors descripcions que TMDB per sèries occidentals.
    """
    from backend.metadata.tvdb import TVDBClient

    cache_key = f"tvdb:episodes:{tvdb_id}:{season}"
    cached = tmdb_cache.get(cache_key)
    if cached:
        return cached

    client = TVDBClient()
    episodes = await client.get_series_episodes(tvdb_id, season=season)

    result = {
        "tvdb_id": tvdb_id,
        "season": season,
        "episodes": episodes
    }

    tmdb_cache.set(cache_key, result)
    return result


@app.post("/api/series/{series_id}/link-tvdb")
async def link_series_to_tvdb(series_id: int, request: Request):
    """
    Vincula una sèrie amb un ID de TheTVDB.
    Útil per obtenir artwork de Fanart.tv.
    """
    body = await request.json()
    tvdb_id = body.get("tvdb_id")

    if not tvdb_id:
        raise HTTPException(status_code=400, detail="Cal proporcionar tvdb_id")

    with get_db() as conn:
        cursor = conn.cursor()

        # Comprovar que la sèrie existeix
        cursor.execute("SELECT id, name FROM series WHERE id = ?", (series_id,))
        series = cursor.fetchone()
        if not series:
            raise HTTPException(status_code=404, detail="Sèrie no trobada")

        # Assegurar que la columna tvdb_id existeix
        try:
            cursor.execute("SELECT tvdb_id FROM series LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE series ADD COLUMN tvdb_id INTEGER")

        # Actualitzar
        conn.execute("""
            UPDATE series
            SET tvdb_id = ?, updated_date = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (tvdb_id, series_id))

    return {
        "status": "linked",
        "series_id": series_id,
        "tvdb_id": tvdb_id
    }


@app.get("/api/anidb/search")
async def search_anidb(q: str, limit: int = 10):
    """
    Cerca anime a AniDB.
    Té títols en més idiomes (incloent català a vegades).
    """
    from backend.metadata.anidb import AniDBClient

    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Cal un terme de cerca")

    client = AniDBClient()
    results = await client.search_anime(q, limit=limit)

    return {
        "query": q,
        "results": results
    }


@app.get("/api/anidb/anime/{anidb_id}/titles")
async def get_anidb_titles(anidb_id: int):
    """
    Obté tots els títols d'un anime en diferents idiomes.
    Útil per trobar el títol en català si existeix.
    """
    from backend.metadata.anidb import AniDBClient

    client = AniDBClient()
    titles = await client.get_anime_titles(anidb_id)

    if not titles:
        raise HTTPException(status_code=404, detail="Anime no trobat a AniDB")

    return titles


@app.get("/api/anime/ids/convert")
async def convert_anime_ids(
    source: str = Query(..., description="Font: anilist, myanimelist, anidb, kitsu, thetvdb"),
    id: int = Query(..., description="ID a convertir")
):
    """
    Converteix IDs entre diferents bases de dades d'anime.
    Útil per trobar contingut a través de múltiples fonts.
    """
    from backend.metadata.anidb import AniDBMappingClient

    valid_sources = ["anilist", "myanimelist", "anidb", "kitsu", "thetvdb"]
    if source not in valid_sources:
        raise HTTPException(
            status_code=400,
            detail=f"Font no vàlida. Usa: {', '.join(valid_sources)}"
        )

    mapper = AniDBMappingClient()
    ids = await mapper.get_ids(source, id)

    if not ids:
        return {
            "source": source,
            "source_id": id,
            "status": "not_found",
            "ids": {}
        }

    return {
        "source": source,
        "source_id": id,
        "status": "found",
        "ids": ids
    }


# === LAZY LOADING METADATA ENDPOINTS ===
# Aquests endpoints obtenen metadata en temps real amb cache intel·ligent

@app.get("/api/metadata/series/{tmdb_id}")
async def get_series_metadata_lazy(
    tmdb_id: int,
    anilist_id: int = None,
    refresh: bool = False
):
    """
    Obté metadata d'una sèrie amb lazy loading.

    - Retorna dades del cache si disponibles (< 24h)
    - Fetch automàtic si no hi ha cache
    - Background refresh si cache > 12h
    - Per anime: prioritza AniList

    Args:
        tmdb_id: ID de TMDB
        anilist_id: ID d'AniList (opcional, auto-detectat per anime)
        refresh: Forçar refresh ignorant cache
    """
    from backend.metadata.service import metadata_service, ContentType

    # Forçar refresh si es demana
    if refresh:
        metadata_service.invalidate_cache(tmdb_id=tmdb_id)

    # Detectar si té anilist_id a la DB
    if not anilist_id:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT anilist_id, content_type FROM series WHERE tmdb_id = ?",
                (tmdb_id,)
            )
            row = cursor.fetchone()
            if row:
                anilist_id = row["anilist_id"]
                content_type = ContentType.ANIME if row["content_type"] == "anime" else ContentType.SERIES
            else:
                content_type = None
    else:
        content_type = ContentType.ANIME

    data = await metadata_service.get_series_metadata(
        tmdb_id=tmdb_id,
        anilist_id=anilist_id,
        content_type=content_type
    )

    if not data:
        raise HTTPException(status_code=404, detail="Sèrie no trobada")

    return data


@app.get("/api/metadata/movie/{tmdb_id}")
async def get_movie_metadata_lazy(tmdb_id: int, refresh: bool = False):
    """
    Obté metadata d'una pel·lícula amb lazy loading.
    """
    from backend.metadata.service import metadata_service

    if refresh:
        metadata_service.invalidate_cache(tmdb_id=tmdb_id)

    data = await metadata_service.get_movie_metadata(tmdb_id)

    if not data:
        raise HTTPException(status_code=404, detail="Pel·lícula no trobada")

    return data


@app.get("/api/metadata/series/{tmdb_id}/season/{season_number}")
async def get_episodes_metadata_lazy(
    tmdb_id: int,
    season_number: int,
    anilist_id: int = None,
    refresh: bool = False
):
    """
    Obté metadata dels episodis d'una temporada amb lazy loading.

    - Cache de 24h
    - Traducció automàtica al català
    - Per anime: combina TMDB + AniList
    """
    from backend.metadata.service import metadata_service, ContentType

    if refresh:
        metadata_service.invalidate_cache(tmdb_id=tmdb_id)

    # Detectar anilist_id si no s'ha proporcionat
    content_type = None
    if not anilist_id:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT anilist_id, content_type FROM series WHERE tmdb_id = ?",
                (tmdb_id,)
            )
            row = cursor.fetchone()
            if row:
                anilist_id = row["anilist_id"]
                content_type = ContentType.ANIME if row["content_type"] == "anime" else None

    data = await metadata_service.get_episodes_metadata(
        tmdb_id=tmdb_id,
        season_number=season_number,
        anilist_id=anilist_id,
        content_type=content_type
    )

    if not data:
        raise HTTPException(status_code=404, detail="Temporada no trobada")

    return data


@app.get("/api/metadata/cache/stats")
async def get_metadata_cache_stats():
    """Retorna estadístiques del cache de metadata."""
    from backend.metadata.service import metadata_service
    return metadata_service.get_cache_stats()


@app.post("/api/metadata/cache/clear")
async def clear_metadata_cache():
    """Neteja tot el cache de metadata."""
    from backend.metadata.service import metadata_service
    metadata_service.clear_cache()
    return {"status": "cleared"}


@app.post("/api/metadata/cache/invalidate/{tmdb_id}")
async def invalidate_metadata_cache(tmdb_id: int):
    """Invalida el cache d'un contingut específic."""
    from backend.metadata.service import metadata_service
    metadata_service.invalidate_cache(tmdb_id=tmdb_id)
    return {"status": "invalidated", "tmdb_id": tmdb_id}


@app.get("/api/embed-sources/{media_type}/{tmdb_id}")
async def get_embed_sources(media_type: str, tmdb_id: int, season: int = None, episode: int = None):
    """
    Retorna URLs d'embed per veure contingut basat en TMDB ID.
    Fonts ordenades per fiabilitat: 2embed primer, després VidSrc, SuperEmbed, etc.
    """
    sources = []

    # 2embed com a font principal, després les altres com a fallback
    if media_type == 'movie':
        sources.append({
            "name": "2embed",
            "url": f"https://www.2embed.cc/embed/{tmdb_id}",
            "type": "iframe"
        })
        sources.append({
            "name": "VidSrc",
            "url": f"https://vidsrc.to/embed/movie/{tmdb_id}",
            "type": "iframe"
        })
        sources.append({
            "name": "VidSrc.me",
            "url": f"https://vidsrc.me/embed/movie?tmdb={tmdb_id}",
            "type": "iframe"
        })
        sources.append({
            "name": "SuperEmbed",
            "url": f"https://multiembed.mov/?video_id={tmdb_id}&tmdb=1",
            "type": "iframe"
        })
        sources.append({
            "name": "NontonGo",
            "url": f"https://www.NontonGo.win/embed/movie/{tmdb_id}",
            "type": "iframe"
        })
    elif media_type == 'series' and season is not None and episode is not None:
        sources.append({
            "name": "2embed",
            "url": f"https://www.2embed.cc/embedtv/{tmdb_id}&s={season}&e={episode}",
            "type": "iframe"
        })
        sources.append({
            "name": "VidSrc",
            "url": f"https://vidsrc.to/embed/tv/{tmdb_id}/{season}/{episode}",
            "type": "iframe"
        })
        sources.append({
            "name": "VidSrc.me",
            "url": f"https://vidsrc.me/embed/tv?tmdb={tmdb_id}&season={season}&episode={episode}",
            "type": "iframe"
        })
        sources.append({
            "name": "SuperEmbed",
            "url": f"https://multiembed.mov/?video_id={tmdb_id}&tmdb=1&s={season}&e={episode}",
            "type": "iframe"
        })
        sources.append({
            "name": "NontonGo",
            "url": f"https://www.NontonGo.win/embed/tv/{tmdb_id}/{season}/{episode}",
            "type": "iframe"
        })
    elif media_type == 'series':
        # Sense temporada/episodi, donem la primera temporada/episodi per defecte
        sources.append({
            "name": "2embed",
            "url": f"https://www.2embed.cc/embedtv/{tmdb_id}&s=1&e=1",
            "type": "iframe"
        })
        sources.append({
            "name": "VidSrc",
            "url": f"https://vidsrc.to/embed/tv/{tmdb_id}/1/1",
            "type": "iframe"
        })
        sources.append({
            "name": "VidSrc.me",
            "url": f"https://vidsrc.me/embed/tv?tmdb={tmdb_id}&season=1&episode=1",
            "type": "iframe"
        })
        sources.append({
            "name": "SuperEmbed",
            "url": f"https://multiembed.mov/?video_id={tmdb_id}&tmdb=1&s=1&e=1",
            "type": "iframe"
        })

    return {
        "tmdb_id": tmdb_id,
        "media_type": media_type,
        "season": season,
        "episode": episode,
        "sources": sources
    }


@app.get("/api/extract-stream/{media_type}/{tmdb_id}")
async def extract_stream_url(media_type: str, tmdb_id: int, season: int = None, episode: int = None, source: str = "vidsrc"):
    """
    Intenta extreure la URL directa del stream (HLS/MP4) d'un servei d'embed.
    Això permet reproduir el vídeo amb el reproductor natiu.
    """
    import httpx
    import re
    import base64

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    async def extract_vidsrc_xyz():
        """Extreu stream de vidsrc.xyz - té API pública"""
        try:
            if media_type == 'movie':
                api_url = f"https://vidsrc.xyz/embed/movie/{tmdb_id}"
            else:
                s = season or 1
                e = episode or 1
                api_url = f"https://vidsrc.xyz/embed/tv/{tmdb_id}/{s}/{e}"

            async with httpx.AsyncClient(follow_redirects=True, timeout=20.0, verify=False) as client:
                resp = await client.get(api_url, headers=headers)
                if resp.status_code != 200:
                    return None
                html = resp.text

                # Buscar URLs HLS/M3U8 directament
                patterns = [
                    r'source:\s*["\']([^"\']+\.m3u8[^"\']*)["\']',
                    r'file:\s*["\']([^"\']+\.m3u8[^"\']*)["\']',
                    r'src:\s*["\']([^"\']+\.m3u8[^"\']*)["\']',
                    r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)',
                    r'playbackURL["\']?\s*[:=]\s*["\']([^"\']+)["\']',
                ]

                for pattern in patterns:
                    match = re.search(pattern, html, re.IGNORECASE)
                    if match:
                        url = match.group(1)
                        if url.startswith('//'):
                            url = 'https:' + url
                        return {
                            "url": url,
                            "type": "hls",
                            "source": "VidSrc.xyz"
                        }

                return None
        except Exception as e:
            logging.error(f"Error extracting vidsrc.xyz: {e}")
            return None

    async def extract_2embed():
        """Extreu stream de 2embed.cc"""
        try:
            if media_type == 'movie':
                api_url = f"https://www.2embed.cc/embed/{tmdb_id}"
            else:
                s = season or 1
                e = episode or 1
                api_url = f"https://www.2embed.cc/embedtv/{tmdb_id}&s={s}&e={e}"

            async with httpx.AsyncClient(follow_redirects=True, timeout=20.0, verify=False) as client:
                resp = await client.get(api_url, headers=headers)
                if resp.status_code != 200:
                    return None
                html = resp.text

                # Buscar iframes amb fonts de vídeo
                iframe_match = re.search(r'<iframe[^>]+src=["\']([^"\']+)["\']', html, re.IGNORECASE)
                if iframe_match:
                    iframe_url = iframe_match.group(1)
                    if iframe_url.startswith('//'):
                        iframe_url = 'https:' + iframe_url

                    # Seguir l'iframe per trobar el stream
                    resp2 = await client.get(iframe_url, headers={**headers, "Referer": api_url})
                    if resp2.status_code == 200:
                        html2 = resp2.text

                        patterns = [
                            r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)',
                            r'file:\s*["\']([^"\']+)["\']',
                            r'source:\s*["\']([^"\']+)["\']',
                        ]

                        for pattern in patterns:
                            match = re.search(pattern, html2, re.IGNORECASE)
                            if match:
                                url = match.group(1)
                                if '.m3u8' in url or 'stream' in url.lower():
                                    return {
                                        "url": url,
                                        "type": "hls",
                                        "source": "2Embed"
                                    }

                return None
        except Exception as e:
            logging.error(f"Error extracting 2embed: {e}")
            return None

    async def extract_embedsu():
        """Extreu stream de embed.su"""
        try:
            if media_type == 'movie':
                api_url = f"https://embed.su/embed/movie/{tmdb_id}"
            else:
                s = season or 1
                e = episode or 1
                api_url = f"https://embed.su/embed/tv/{tmdb_id}/{s}/{e}"

            async with httpx.AsyncClient(follow_redirects=True, timeout=20.0, verify=False) as client:
                resp = await client.get(api_url, headers=headers)
                if resp.status_code != 200:
                    return None
                html = resp.text

                # Buscar configuració del player
                patterns = [
                    r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)',
                    r'file:\s*["\']([^"\']+)["\']',
                    r'source:\s*["\']([^"\']+)["\']',
                    r'src:\s*["\']([^"\']+\.m3u8[^"\']*)["\']',
                ]

                for pattern in patterns:
                    match = re.search(pattern, html, re.IGNORECASE)
                    if match:
                        url = match.group(1)
                        if '.m3u8' in url:
                            return {
                                "url": url,
                                "type": "hls",
                                "source": "Embed.su"
                            }

                return None
        except Exception as e:
            logging.error(f"Error extracting embed.su: {e}")
            return None

    async def extract_autoembed():
        """Extreu stream de autoembed.cc"""
        try:
            if media_type == 'movie':
                api_url = f"https://autoembed.cc/embed/movie/{tmdb_id}"
            else:
                s = season or 1
                e = episode or 1
                api_url = f"https://autoembed.cc/embed/tv/{tmdb_id}/{s}/{e}"

            async with httpx.AsyncClient(follow_redirects=True, timeout=20.0, verify=False) as client:
                resp = await client.get(api_url, headers=headers)
                if resp.status_code != 200:
                    return None
                html = resp.text

                patterns = [
                    r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)',
                    r'file:\s*["\']([^"\']+)["\']',
                    r'sources:\s*\[\s*\{\s*file:\s*["\']([^"\']+)["\']',
                ]

                for pattern in patterns:
                    match = re.search(pattern, html, re.IGNORECASE)
                    if match:
                        url = match.group(1)
                        if '.m3u8' in url or 'stream' in url.lower():
                            return {
                                "url": url,
                                "type": "hls",
                                "source": "AutoEmbed"
                            }

                return None
        except Exception as e:
            logging.error(f"Error extracting autoembed: {e}")
            return None

    async def extract_superembed():
        """Extreu stream de SuperEmbed/MultiEmbed"""
        try:
            if media_type == 'movie':
                api_url = f"https://multiembed.mov/?video_id={tmdb_id}&tmdb=1"
            else:
                s = season or 1
                e = episode or 1
                api_url = f"https://multiembed.mov/?video_id={tmdb_id}&tmdb=1&s={s}&e={e}"

            async with httpx.AsyncClient(follow_redirects=True, timeout=20.0, verify=False) as client:
                resp = await client.get(api_url, headers=headers)
                if resp.status_code != 200:
                    return None
                html = resp.text

                patterns = [
                    r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)',
                    r'file:\s*["\']([^"\']+)["\']',
                    r'source:\s*["\']([^"\']+)["\']',
                ]

                for pattern in patterns:
                    match = re.search(pattern, html, re.IGNORECASE)
                    if match:
                        url = match.group(1)
                        if '.m3u8' in url or 'stream' in url.lower():
                            return {
                                "url": url,
                                "type": "hls",
                                "source": "SuperEmbed"
                            }

                return None
        except Exception as e:
            logging.error(f"Error extracting SuperEmbed: {e}")
            return None

    # Intentar extreure de cada font
    extractors = {
        "vidsrc": extract_vidsrc_xyz,
        "2embed": extract_2embed,
        "embedsu": extract_embedsu,
        "autoembed": extract_autoembed,
        "superembed": extract_superembed,
    }

    # Si s'especifica una font, provar només aquesta
    if source in extractors:
        result = await extractors[source]()
        if result:
            return result

    # Si no, provar totes les fonts en ordre
    for name, extractor in extractors.items():
        logging.info(f"Provant extractor: {name}")
        result = await extractor()
        if result:
            logging.info(f"Extracció exitosa amb {name}: {result['url'][:50]}...")
            return result

    # Si cap funciona, retornar error
    raise HTTPException(
        status_code=404,
        detail="No s'ha pogut extreure la URL del stream. Prova amb un altre servidor."
    )


# === FFMPEG STATUS ===
@app.get("/api/stream/ffmpeg-status")
async def check_ffmpeg_status():
    """Comprova si FFmpeg està disponible"""
    from backend.streaming.hls_engine import FFMPEG_AVAILABLE, check_ffmpeg_available

    # Recomprovar per si s'ha instal·lat durant l'execució
    current_status = check_ffmpeg_available()

    return {
        "ffmpeg_available": current_status,
        "message": "FFmpeg disponible" if current_status else "FFmpeg no instal·lat. Executa: apt install ffmpeg"
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
            "backdrop": episode["backdrop"],
            "has_file": episode["file_path"] is not None
        }


# === ENDPOINTS DE STREAMING LOCAL - Episodis i Pel·lícules ===
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
            ORDER BY a.name COLLATE NOACCENT
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
            ORDER BY a.name COLLATE NOACCENT
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
                                        tmdb_seasons = ?,
                                        tmdb_episodes = ?,
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
                                    metadata.get("seasons"),
                                    metadata.get("episodes"),
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
                            tmdb_seasons = ?,
                            tmdb_episodes = ?,
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
                        result.get("seasons"),
                        result.get("episodes"),
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
                                tmdb_seasons = ?,
                                tmdb_episodes = ?,
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
                            result.get("seasons"),
                            result.get("episodes"),
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

class ExternalImportRequest(BaseModel):
    username: str
    platform: str  # 'letterboxd', 'myanimelist', 'goodreads'


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
        cursor.execute("SELECT id, name, release_date, popularity FROM series WHERE tmdb_id = ? OR path = ?", (data.tmdb_id, virtual_path))
        existing = cursor.fetchone()
        if existing:
            # Si ja existeix però no té release_date o popularity, actualitzar-lo
            if not existing['release_date'] or not existing['popularity']:
                # Obtenir dades de TMDB
                if data.media_type == 'movie':
                    metadata = await fetch_movie_by_tmdb_id(api_key, data.tmdb_id)
                else:
                    metadata = await fetch_tv_by_tmdb_id(api_key, data.tmdb_id)

                updates = []
                params = []
                if metadata.get("release_date") and not existing['release_date']:
                    updates.append("release_date = ?")
                    params.append(metadata.get("release_date"))
                if metadata.get("popularity"):
                    updates.append("popularity = ?")
                    params.append(metadata.get("popularity"))
                if metadata.get("vote_count"):
                    updates.append("vote_count = ?")
                    params.append(metadata.get("vote_count"))

                if updates:
                    params.append(existing['id'])
                    cursor.execute(
                        f"UPDATE series SET {', '.join(updates)} WHERE id = ?",
                        params
                    )
                    conn.commit()

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
                    content_type, origin_country, original_language,
                    tmdb_seasons, tmdb_episodes, release_date, popularity, vote_count,
                    title_english, original_title
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'tmdb', ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                metadata.get("original_language"),
                metadata.get("seasons"),
                metadata.get("episodes"),
                metadata.get("release_date"),
                metadata.get("popularity"),
                metadata.get("vote_count"),
                metadata.get("title_english"),  # Títol anglès per contingut no-llatí
                metadata.get("original_title")  # Títol original (japonès, coreà, etc.)
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


# ============================================================
# IMPORTACIÓ EXTERNA (Letterboxd, MyAnimeList, Goodreads)
# ============================================================

async def scrape_letterboxd_watchlist(username: str) -> List[Dict]:
    """
    Fa scraping de la watchlist pública de Letterboxd.
    Retorna una llista de pel·lícules amb títol i any.
    """
    import httpx
    from bs4 import BeautifulSoup

    movies = []
    page = 1
    max_pages = 10  # Limit per seguretat

    # Capçaleres completes per simular un navegador real
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://letterboxd.com/',
        'DNT': '1',
    }

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        while page <= max_pages:
            # Primera pàgina sense /page/1/
            if page == 1:
                url = f"https://letterboxd.com/{username}/watchlist/"
            else:
                url = f"https://letterboxd.com/{username}/watchlist/page/{page}/"

            try:
                response = await client.get(url, headers=headers)

                logger.info(f"Letterboxd response status: {response.status_code} for {url}")

                if response.status_code == 404:
                    if page == 1:
                        raise HTTPException(status_code=404, detail=f"Usuari '{username}' no trobat a Letterboxd")
                    break

                if response.status_code != 200:
                    logger.warning(f"Letterboxd returned status {response.status_code}")
                    if page == 1:
                        raise HTTPException(status_code=response.status_code, detail=f"Error accedint a Letterboxd: {response.status_code}")
                    break

                soup = BeautifulSoup(response.text, 'lxml')

                # Debug: guardar fragment HTML si no trobem res
                html_sample = response.text[:2000] if len(response.text) > 2000 else response.text

                # Mètode 1: Buscar posters amb data-film-slug (selector més fiable)
                posters = soup.select('[data-film-slug]')

                if not posters:
                    # Mètode 2: Buscar li.poster-container
                    posters = soup.select('li.poster-container')

                if not posters:
                    # Mètode 3: Buscar divs amb classe que conté 'poster'
                    posters = soup.select('div.film-poster, div.poster')

                if not posters:
                    # Mètode 4: Buscar qualsevol element amb data-target-link que contingui /film/
                    posters = soup.select('[data-target-link*="/film/"]')

                logger.info(f"Letterboxd page {page}: found {len(posters)} poster elements")

                if not posters:
                    # Comprovar si és una pàgina buida o hi ha error
                    if 'watchlist' not in response.text.lower():
                        logger.warning(f"Letterboxd: No watchlist content found. HTML start: {html_sample[:500]}")
                    break

                page_movies = 0
                for poster in posters:
                    # Extreure dades de l'element o els seus fills
                    film_slug = (
                        poster.get('data-film-slug') or
                        poster.get('data-target-link', '').replace('/film/', '').rstrip('/') or
                        ''
                    )

                    # Buscar div.poster dins l'element si no és ja el poster
                    inner_poster = poster.select_one('div[data-film-slug]') if not poster.get('data-film-slug') else poster
                    if inner_poster:
                        film_slug = film_slug or inner_poster.get('data-film-slug', '')

                    # Buscar títol - pot estar en diversos llocs
                    title = ''

                    # 1. data-film-name
                    title = poster.get('data-film-name', '')

                    # 2. Buscar en elements fills
                    if not title and inner_poster:
                        title = inner_poster.get('data-film-name', '')

                    # 3. Alt de la imatge
                    if not title:
                        img = poster.select_one('img')
                        if img:
                            title = img.get('alt', '')

                    # 4. Títol del frame-title o similar
                    if not title:
                        title_elem = poster.select_one('.frame-title, .headline-3, span.title')
                        if title_elem:
                            title = title_elem.get_text(strip=True)

                    # Any
                    year_str = poster.get('data-film-release-year', '')
                    if not year_str and inner_poster:
                        year_str = inner_poster.get('data-film-release-year', '')

                    year = int(year_str) if year_str and year_str.isdigit() else None

                    if title or film_slug:
                        # Si no tenim títol, usar el slug com a fallback
                        if not title and film_slug:
                            title = film_slug.replace('-', ' ').title()

                        movies.append({
                            'title': title,
                            'year': year,
                            'slug': film_slug,
                            'source': 'letterboxd'
                        })
                        page_movies += 1

                logger.info(f"Letterboxd page {page}: extracted {page_movies} movies")

                if page_movies == 0:
                    break

                # Comprovar si hi ha més pàgines
                pagination = soup.select_one('.paginate-nextprev a.next, .pagination a.next')
                if not pagination:
                    break

                page += 1

            except httpx.RequestError as e:
                logger.error(f"Error fent scraping de Letterboxd: {e}")
                if page == 1:
                    raise HTTPException(status_code=500, detail=f"Error de connexió amb Letterboxd: {str(e)}")
                break

    logger.info(f"Letterboxd scraping complete: {len(movies)} movies found for {username}")
    return movies


async def scrape_myanimelist_watching(username: str) -> List[Dict]:
    """
    Fa scraping de la llista 'currently watching' de MyAnimeList.
    Retorna una llista d'animes amb títol.
    """
    import httpx
    from bs4 import BeautifulSoup

    animes = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        # status=1 és "Currently Watching"
        url = f"https://myanimelist.net/animelist/{username}?status=1"

        try:
            response = await client.get(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })

            if response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Usuari '{username}' no trobat a MyAnimeList")

            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Error accedint a MyAnimeList")

            soup = BeautifulSoup(response.text, 'lxml')

            # MAL guarda les dades en un JSON dins de la pàgina
            import re
            data_script = soup.find('table', {'class': 'list-table'})
            if data_script and data_script.get('data-items'):
                try:
                    items_json = json.loads(data_script.get('data-items'))
                    for item in items_json:
                        title = item.get('anime_title', '')
                        mal_id = item.get('anime_id')

                        if title:
                            animes.append({
                                'title': title,
                                'mal_id': mal_id,
                                'source': 'myanimelist'
                            })
                except json.JSONDecodeError:
                    logger.error("Error parsejant JSON de MyAnimeList")

            # Fallback: buscar a la taula HTML
            if not animes:
                rows = soup.select('tr.list-table-data')
                for row in rows:
                    title_cell = row.select_one('td.title a.link')
                    if title_cell:
                        title = title_cell.get_text(strip=True)
                        if title:
                            animes.append({
                                'title': title,
                                'source': 'myanimelist'
                            })

        except httpx.RequestError as e:
            logger.error(f"Error fent scraping de MyAnimeList: {e}")
            raise HTTPException(status_code=500, detail="Error de connexió amb MyAnimeList")

    return animes


async def scrape_goodreads_to_read(username: str) -> List[Dict]:
    """
    Fa scraping de la shelf 'to-read' de Goodreads.
    Retorna una llista de llibres amb títol i autor.
    """
    import httpx
    from bs4 import BeautifulSoup

    books = []
    page = 1
    max_pages = 5

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        while page <= max_pages:
            url = f"https://www.goodreads.com/review/list/{username}?shelf=to-read&page={page}"

            try:
                response = await client.get(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                })

                if response.status_code == 404:
                    if page == 1:
                        raise HTTPException(status_code=404, detail=f"Usuari '{username}' no trobat a Goodreads")
                    break

                if response.status_code != 200:
                    break

                soup = BeautifulSoup(response.text, 'lxml')

                # Buscar files de llibres
                book_rows = soup.select('tr.bookalike')

                if not book_rows:
                    break

                for row in book_rows:
                    title_cell = row.select_one('td.title a')
                    author_cell = row.select_one('td.author a')

                    if title_cell:
                        title = title_cell.get_text(strip=True)
                        # Netejar el títol (pot tenir salts de línia i espais)
                        title = ' '.join(title.split())

                        author = author_cell.get_text(strip=True) if author_cell else None
                        if author:
                            # Format: "Cognom, Nom" -> "Nom Cognom"
                            parts = author.split(', ')
                            if len(parts) == 2:
                                author = f"{parts[1]} {parts[0]}"

                        if title:
                            books.append({
                                'title': title,
                                'author': author,
                                'source': 'goodreads'
                            })

                page += 1

            except httpx.RequestError as e:
                logger.error(f"Error fent scraping de Goodreads: {e}")
                break

    return books


@app.post("/api/import/external")
async def import_from_external_platform(
    data: ExternalImportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Importa contingut des d'una plataforma externa (Letterboxd, MyAnimeList, Goodreads).
    Cerca cada element a TMDB/OpenLibrary i l'afegeix a la watchlist de l'usuari.
    Processa en paral·lel per ser més ràpid.
    """
    user_id = current_user["id"]
    results = {
        "found": [],
        "not_found": [],
        "already_in_watchlist": [],
        "errors": []
    }

    platform = data.platform.lower()

    # Obtenir llista d'elements segons la plataforma
    if platform == 'letterboxd':
        items = await scrape_letterboxd_watchlist(data.username)
        media_type = 'movie'
    elif platform == 'myanimelist':
        items = await scrape_myanimelist_watching(data.username)
        media_type = 'series'
    elif platform == 'goodreads':
        items = await scrape_goodreads_to_read(data.username)
        media_type = 'book'
    else:
        raise HTTPException(status_code=400, detail=f"Plataforma '{platform}' no suportada")

    if not items:
        return {
            "status": "warning",
            "message": f"No s'han trobat elements a la llista de {data.username}",
            "results": results
        }

    # Processar elements
    api_key = get_tmdb_api_key() if media_type in ['movie', 'series'] else None

    if media_type in ['movie', 'series'] and not api_key:
        raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB per importar pel·lícules i sèries")

    logger.info(f"Processing {len(items)} items from {platform}")

    if media_type in ['movie', 'series']:
        # Processar pel·lícules/sèries amb TMDB en paral·lel
        from backend.metadata.tmdb import TMDBClient

        async def search_tmdb(item, client):
            """Cerca una pel·lícula/sèrie a TMDB."""
            try:
                if media_type == 'movie':
                    params = {"query": item['title'], "language": "ca-ES"}
                    if item.get('year'):
                        params["year"] = item['year']
                    response = await client._request("/search/movie", params)
                else:
                    params = {"query": item['title'], "language": "ca-ES"}
                    response = await client._request("/search/tv", params)

                if response and response.get("results"):
                    match = response["results"][0]
                    return {"item": item, "match": match, "found": True}
                else:
                    return {"item": item, "match": None, "found": False}
            except Exception as e:
                logger.error(f"Error cercant '{item.get('title')}': {e}")
                return {"item": item, "match": None, "found": False, "error": str(e)}

        # Utilitzar un sol client TMDB i processar en batches
        client = TMDBClient(api_key)
        try:
            # Processar en batches de 10 per no sobrecarregar TMDB
            batch_size = 10
            all_search_results = []

            for i in range(0, len(items), batch_size):
                batch = items[i:i + batch_size]
                batch_results = await asyncio.gather(
                    *[search_tmdb(item, client) for item in batch],
                    return_exceptions=True
                )
                all_search_results.extend(batch_results)
                logger.info(f"Processed batch {i//batch_size + 1}/{(len(items) + batch_size - 1)//batch_size}")

        finally:
            await client.close()

        # Ara processar els resultats i inserir a la BD
        with get_db() as conn:
            cursor = conn.cursor()

            for result in all_search_results:
                if isinstance(result, Exception):
                    continue

                item = result.get("item", {})

                if result.get("error"):
                    results["errors"].append({
                        "title": item.get('title'),
                        "error": result["error"]
                    })
                    continue

                if result.get("found") and result.get("match"):
                    match = result["match"]
                    tmdb_id = match.get("id")

                    # Verificar si ja està a la watchlist
                    cursor.execute(
                        "SELECT id FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?",
                        (user_id, tmdb_id, media_type)
                    )
                    existing = cursor.fetchone()

                    if existing:
                        results["already_in_watchlist"].append({
                            "title": match.get("title") or match.get("name"),
                            "tmdb_id": tmdb_id,
                            "type": media_type
                        })
                    else:
                        # Afegir a la watchlist
                        release_date = match.get("release_date") or match.get("first_air_date", "")
                        year = int(release_date[:4]) if release_date and len(release_date) >= 4 else None

                        try:
                            cursor.execute("""
                                INSERT INTO watchlist (
                                    user_id, tmdb_id, media_type, title, poster_path, year, rating
                                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, (
                                user_id,
                                tmdb_id,
                                media_type,
                                match.get("title") or match.get("name"),
                                match.get("poster_path"),
                                year,
                                match.get("vote_average")
                            ))

                            results["found"].append({
                                "title": match.get("title") or match.get("name"),
                                "year": year,
                                "tmdb_id": tmdb_id,
                                "poster": f"https://image.tmdb.org/t/p/w342{match['poster_path']}" if match.get('poster_path') else None,
                                "type": media_type
                            })
                        except Exception as e:
                            # Probablement ja existeix (UNIQUE constraint)
                            if "UNIQUE" in str(e):
                                results["already_in_watchlist"].append({
                                    "title": match.get("title") or match.get("name"),
                                    "tmdb_id": tmdb_id,
                                    "type": media_type
                                })
                else:
                    results["not_found"].append({
                        "title": item.get('title'),
                        "year": item.get('year'),
                        "type": media_type
                    })

            conn.commit()

    else:
        # Processar llibres (OpenLibrary)
        from backend.metadata.openlibrary import OpenLibraryClient

        with get_db() as conn:
            cursor = conn.cursor()
            client = OpenLibraryClient()

            try:
                for item in items:
                    try:
                        search_result = await client.search_book(item['title'], item.get('author'))

                        if search_result:
                            olid = search_result.get("key", "").replace("/works/", "")
                            cursor.execute("SELECT id FROM books WHERE olid = ? OR title = ?", (olid, item['title']))
                            existing = cursor.fetchone()

                            if existing:
                                results["already_in_watchlist"].append({
                                    "title": item['title'],
                                    "author": item.get('author'),
                                    "type": "book"
                                })
                            else:
                                results["found"].append({
                                    "title": search_result.get("title", item['title']),
                                    "author": search_result.get("author_name", [item.get('author')])[0] if search_result.get("author_name") else item.get('author'),
                                    "year": search_result.get("first_publish_year"),
                                    "olid": olid,
                                    "type": "book"
                                })
                        else:
                            results["not_found"].append({
                                "title": item['title'],
                                "author": item.get('author'),
                                "type": "book"
                            })
                    except Exception as e:
                        logger.error(f"Error processant llibre '{item.get('title')}': {e}")
                        results["errors"].append({
                            "title": item.get('title'),
                            "error": str(e)
                        })
            finally:
                await client.close()

            conn.commit()

    # Resum
    total_found = len(results["found"])
    total_not_found = len(results["not_found"])
    total_existing = len(results["already_in_watchlist"])

    logger.info(f"Import complete: {total_found} added, {total_existing} existing, {total_not_found} not found")

    return {
        "status": "success",
        "message": f"Importació completada: {total_found} afegits, {total_existing} ja existien, {total_not_found} no trobats",
        "platform": platform,
        "username": data.username,
        "total_items": len(items),
        "results": results
    }


@app.post("/api/import/external/preview")
async def preview_external_import(
    data: ExternalImportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Previsualitza el contingut a importar sense afegir-lo a la watchlist.
    Útil per mostrar a l'usuari què es trobarà abans d'importar.
    """
    platform = data.platform.lower()

    if platform == 'letterboxd':
        items = await scrape_letterboxd_watchlist(data.username)
    elif platform == 'myanimelist':
        items = await scrape_myanimelist_watching(data.username)
    elif platform == 'goodreads':
        items = await scrape_goodreads_to_read(data.username)
    else:
        raise HTTPException(status_code=400, detail=f"Plataforma '{platform}' no suportada")

    return {
        "platform": platform,
        "username": data.username,
        "items": items,
        "count": len(items)
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


# === ANIME SCRAPING ===
from backend.anime.scraper import anime_manager


@app.get("/api/anime/search")
async def search_anime(q: str, source: str = None):
    """
    Cerca anime a les fonts disponibles.

    Fonts:
    - animeflv: AnimeFLV (espanyol subtitulat)
    - henaojara: HenaoJara (espanyol latino)
    - fansubscat: Fansubs.cat (català)

    Si no s'especifica source, cerca a totes les fonts.
    """
    try:
        if source:
            results = await anime_manager.search(q, source)
        else:
            all_results = await anime_manager.search_all(q)
            # Organitzar per font
            return {
                "query": q,
                "results": all_results
            }

        return {
            "query": q,
            "source": source,
            "results": results
        }
    except Exception as e:
        logger.error(f"Error cercant anime: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/anime/sources")
async def get_anime_sources():
    """
    Retorna les fonts d'anime disponibles amb informació sobre l'idioma.
    """
    return {
        "sources": [
            {
                "id": "animeflv",
                "name": "AnimeFLV",
                "language": "es-sub",
                "language_name": "Espanyol (subtítols)",
                "description": "Anime amb subtítols en espanyol"
            },
            {
                "id": "henaojara",
                "name": "HenaoJara",
                "language": "es-lat",
                "language_name": "Espanyol Latino",
                "description": "Anime doblat a espanyol latino"
            },
            {
                "id": "fansubscat",
                "name": "Fansubs.cat",
                "language": "ca",
                "language_name": "Català",
                "description": "Anime amb subtítols en català"
            }
        ]
    }


@app.get("/api/anime/{source}/{anime_id}")
async def get_anime_info(source: str, anime_id: str):
    """
    Obté la informació detallada d'un anime incloent la llista d'episodis.
    """
    try:
        info = await anime_manager.get_anime_info(source, anime_id)
        if not info:
            raise HTTPException(status_code=404, detail="Anime no trobat")
        return info
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obtenint info d'anime: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/anime/{source}/{anime_id}/episode/{episode}")
async def get_anime_episode_sources(source: str, anime_id: str, episode: int):
    """
    Obté els servidors/fonts disponibles per reproduir un episodi específic.

    Retorna una llista d'URLs d'embed que es poden utilitzar directament en un iframe.
    """
    try:
        sources = await anime_manager.get_episode_sources(source, anime_id, episode)
        if not sources:
            raise HTTPException(status_code=404, detail="No s'han trobat fonts per aquest episodi")

        return {
            "source": source,
            "anime_id": anime_id,
            "episode": episode,
            "servers": sources
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obtenint fonts d'episodi: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# === SINCRONITZACIÓ AUTOMÀTICA ===

async def sync_tmdb_category(media_type: str, category: str, max_pages: int = 50):
    """
    Sincronitza una categoria de TMDB important tot el contingut.
    max_pages: màxim de pàgines a importar (20 items/pàgina, 50 pàgines = 1000 items)
    """
    from backend.metadata.tmdb import TMDBClient, fetch_movie_by_tmdb_id, fetch_tv_by_tmdb_id

    api_key = get_tmdb_api_key()
    if not api_key:
        logger.warning("Sync TMDB: No hi ha clau API configurada")
        return 0

    client = TMDBClient(api_key)
    imported_count = 0

    try:
        # Mapeig d'endpoints
        if media_type == "movie":
            endpoint_map = {
                "popular": "/movie/popular",
                "top_rated": "/movie/top_rated",
                "now_playing": "/movie/now_playing",
                "upcoming": "/movie/upcoming"
            }
        else:
            endpoint_map = {
                "popular": "/tv/popular",
                "top_rated": "/tv/top_rated",
                "on_the_air": "/tv/on_the_air",
                "airing_today": "/tv/airing_today"
            }

        endpoint = endpoint_map.get(category)
        if not endpoint:
            logger.warning(f"Sync TMDB: Categoria desconeguda {category}")
            return 0

        # Obtenir IDs existents
        with get_db() as conn:
            cursor = conn.cursor()
            media_type_db = 'movie' if media_type == 'movie' else 'series'
            cursor.execute("SELECT tmdb_id FROM series WHERE media_type = ? AND tmdb_id IS NOT NULL", (media_type_db,))
            existing_ids = {row[0] for row in cursor.fetchall()}

        # Recórrer totes les pàgines
        for page in range(1, max_pages + 1):
            response = await client._request(endpoint, {"language": "ca-ES", "page": page, "region": "ES"})

            if not response or not response.get("results"):
                break

            for item in response["results"]:
                tmdb_id = item.get("id")
                if tmdb_id in existing_ids:
                    continue

                try:
                    # Importar el contingut
                    if media_type == "movie":
                        metadata = await fetch_movie_by_tmdb_id(api_key, tmdb_id)
                    else:
                        metadata = await fetch_tv_by_tmdb_id(api_key, tmdb_id)

                    if not metadata.get("found"):
                        continue

                    # Inserir a la BD
                    virtual_path = f"imported/{media_type}/{tmdb_id}"

                    with get_db() as conn:
                        cursor = conn.cursor()

                        # Verificar de nou per evitar duplicats
                        cursor.execute("SELECT id FROM series WHERE tmdb_id = ?", (tmdb_id,))
                        if cursor.fetchone():
                            existing_ids.add(tmdb_id)
                            continue

                        cursor.execute("""
                            INSERT INTO series (
                                name, path, media_type, tmdb_id, title, year, overview, rating, genres, runtime,
                                poster, backdrop, director, creators, cast_members,
                                is_imported, source_type, external_url, added_date,
                                content_type, origin_country, original_language,
                                tmdb_seasons, tmdb_episodes, release_date, popularity, vote_count
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'tmdb', ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            metadata.get("title") or metadata.get("original_title"),
                            virtual_path,
                            'movie' if media_type == 'movie' else 'series',
                            tmdb_id,
                            metadata.get("title"),
                            metadata.get("year"),
                            metadata.get("overview"),
                            metadata.get("rating"),
                            json.dumps(metadata.get("genres", [])),
                            metadata.get("runtime"),
                            f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}" if item.get("poster_path") else None,
                            f"https://image.tmdb.org/t/p/w1280{item.get('backdrop_path')}" if item.get("backdrop_path") else None,
                            metadata.get("director"),
                            json.dumps(metadata.get("creators", [])) if metadata.get("creators") else None,
                            json.dumps(metadata.get("cast", [])),
                            None,
                            metadata.get("content_type"),
                            json.dumps(metadata.get("origin_country", [])),
                            metadata.get("original_language"),
                            metadata.get("seasons"),
                            metadata.get("episodes"),
                            metadata.get("release_date"),
                            metadata.get("popularity"),
                            metadata.get("vote_count")
                        ))
                        conn.commit()
                        existing_ids.add(tmdb_id)
                        imported_count += 1

                except Exception as e:
                    logger.error(f"Error important {media_type} {tmdb_id}: {e}")
                    continue

            # Si no hi ha més pàgines, sortir
            if page >= response.get("total_pages", 1):
                break

            # Petit delay per no saturar l'API
            await asyncio.sleep(0.1)

        logger.info(f"Sync TMDB {media_type}/{category}: {imported_count} nous items importats")
        return imported_count

    finally:
        await client.close()


async def sync_books_from_openlibrary(max_items: int = 500):
    """
    Sincronitza llibres populars des d'Open Library.
    """
    import urllib.request
    import urllib.parse

    imported_count = 0

    try:
        # Categories de llibres populars
        subjects = ["fiction", "fantasy", "science_fiction", "mystery", "romance", "thriller", "horror", "biography"]

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT openlibrary_id FROM books WHERE openlibrary_id IS NOT NULL")
            existing_ids = {row[0] for row in cursor.fetchall()}

        for subject in subjects:
            if imported_count >= max_items:
                break

            try:
                # API d'Open Library per subjects
                url = f"https://openlibrary.org/subjects/{subject}.json?limit=100"
                req = urllib.request.Request(url)
                req.add_header('User-Agent', 'Hermes Media Server/1.0')

                with urllib.request.urlopen(req, timeout=30) as response:
                    data = json.loads(response.read().decode('utf-8'))

                for work in data.get("works", []):
                    if imported_count >= max_items:
                        break

                    ol_id = work.get("key", "").replace("/works/", "")
                    if not ol_id or ol_id in existing_ids:
                        continue

                    try:
                        # Obtenir detalls del llibre
                        title = work.get("title")
                        authors = [a.get("name") for a in work.get("authors", [])]
                        cover_id = work.get("cover_id")

                        with get_db() as conn:
                            cursor = conn.cursor()
                            cursor.execute("""
                                INSERT INTO books (
                                    title, author, openlibrary_id, cover_url,
                                    is_imported, source_type, added_date
                                ) VALUES (?, ?, ?, ?, 1, 'openlibrary', datetime('now'))
                            """, (
                                title,
                                ", ".join(authors) if authors else None,
                                ol_id,
                                f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else None
                            ))
                            conn.commit()
                            existing_ids.add(ol_id)
                            imported_count += 1

                    except Exception as e:
                        logger.error(f"Error important llibre {ol_id}: {e}")
                        continue

                await asyncio.sleep(1)  # Respectar rate limits

            except Exception as e:
                logger.error(f"Error sincronitzant subject {subject}: {e}")
                continue

        logger.info(f"Sync Books: {imported_count} nous llibres importats")
        return imported_count

    except Exception as e:
        logger.error(f"Error general sincronitzant llibres: {e}")
        return imported_count


async def fix_non_latin_titles_background() -> int:
    """
    Versió background (sense streaming) per corregir títols no-llatins.
    S'utilitza en la sincronització diària automatitzada.
    Retorna el nombre de títols corregits.
    """
    from backend.metadata.tmdb import TMDBClient, contains_non_latin_characters
    from backend.metadata.anilist import AniListClient

    api_key = get_tmdb_api_key()
    if not api_key:
        logger.warning("fix_non_latin_titles_background: No hi ha clau TMDB configurada")
        return 0

    updated_count = 0
    error_count = 0

    with get_db() as conn:
        cursor = conn.cursor()

        # Assegurar que les columnes necessàries existeixen
        for column, col_type in [
            ("title_english", "TEXT"),
            ("title_romaji", "TEXT"),
            ("title_native", "TEXT"),
            ("anilist_id", "INTEGER"),
            ("mal_id", "INTEGER"),
            ("original_title", "TEXT")
        ]:
            try:
                cursor.execute(f"ALTER TABLE series ADD COLUMN {column} {col_type}")
                conn.commit()
            except Exception:
                pass

        # Trobar contingut que necessita actualització
        cursor.execute("""
            SELECT id, name, title, title_english, tmdb_id, media_type, content_type, genres, origin_country, original_language
            FROM series
            WHERE tmdb_id IS NOT NULL
        """)

        series_to_update = []
        for row in cursor.fetchall():
            name = row["name"] or ""
            title = row["title"] or ""
            title_english = row["title_english"] or ""
            needs_update = (
                contains_non_latin_characters(name) or
                contains_non_latin_characters(title) or
                not title_english
            )
            if needs_update:
                series_to_update.append(dict(row))

        total = len(series_to_update)
        if total == 0:
            logger.info("fix_non_latin_titles_background: No hi ha títols per actualitzar")
            return 0

        logger.info(f"fix_non_latin_titles_background: {total} títols per processar")

        tmdb_client = TMDBClient(api_key)
        anilist_client = AniListClient()

        try:
            for idx, item in enumerate(series_to_update):
                try:
                    tmdb_id = item["tmdb_id"]
                    media_type = item["media_type"]
                    best_title = None
                    has_non_latin = contains_non_latin_characters(item["name"] or "") or contains_non_latin_characters(item["title"] or "")

                    # Detectar si és anime
                    is_anime = False
                    content_type = item.get("content_type", "")
                    genres_str = item.get("genres", "") or ""
                    origin_country = item.get("origin_country", "") or ""
                    original_language = item.get("original_language", "") or ""

                    if content_type == "anime":
                        is_anime = True
                    elif "Animation" in genres_str or "Animació" in genres_str:
                        if original_language == "ja" or "JP" in origin_country:
                            is_anime = True

                    # Provar idiomes en ordre de preferència: Català → Anglès
                    languages_to_try = [
                        ("ca-ES", "TMDB (català)"),
                        ("en-US", "TMDB (anglès)")
                    ]

                    # Determinar endpoints a provar
                    if media_type == "movie":
                        endpoints = [("/movie/", "title"), ("/tv/", "name")]
                    else:
                        endpoints = [("/tv/", "name"), ("/movie/", "title")]

                    # Intentar per ID directe primer
                    for lang_code, lang_source in languages_to_try:
                        for endpoint, title_key in endpoints:
                            data = await tmdb_client._request(f"{endpoint}{tmdb_id}", {"language": lang_code})
                            if data:
                                tmdb_title = data.get(title_key)
                                if tmdb_title and not contains_non_latin_characters(tmdb_title):
                                    best_title = tmdb_title
                                    break
                        if best_title:
                            break

                    # Fallback: cercar per nom si l'ID no funciona
                    if not best_title:
                        search_name = item["name"] or item["title"]
                        if search_name:
                            for lang_code, lang_source in languages_to_try:
                                # Cercar com a TV
                                data = await tmdb_client._request("/search/tv", {"query": search_name, "language": lang_code})
                                if data and data.get("results"):
                                    first_result = data["results"][0]
                                    tmdb_title = first_result.get("name")
                                    if tmdb_title and not contains_non_latin_characters(tmdb_title):
                                        best_title = tmdb_title
                                        new_tmdb_id = first_result.get("id")
                                        if new_tmdb_id:
                                            cursor.execute("UPDATE series SET tmdb_id = ? WHERE id = ?", (new_tmdb_id, item["id"]))
                                        break

                                # Cercar com a movie
                                if not best_title:
                                    data = await tmdb_client._request("/search/movie", {"query": search_name, "language": lang_code})
                                    if data and data.get("results"):
                                        first_result = data["results"][0]
                                        tmdb_title = first_result.get("title")
                                        if tmdb_title and not contains_non_latin_characters(tmdb_title):
                                            best_title = tmdb_title
                                            new_tmdb_id = first_result.get("id")
                                            if new_tmdb_id:
                                                cursor.execute("UPDATE series SET tmdb_id = ? WHERE id = ?", (new_tmdb_id, item["id"]))
                                            break

                                if best_title:
                                    break

                    # Per anime, també obtenir AniList IDs
                    if is_anime and media_type == "series":
                        try:
                            search_title = best_title if best_title else item["name"]
                            anilist_result = await anilist_client.search_anime(search_title)
                            if anilist_result and anilist_result.get("anilist_id"):
                                cursor.execute("""
                                    UPDATE series SET anilist_id = ?, mal_id = ?, content_type = 'anime'
                                    WHERE id = ?
                                """, (
                                    anilist_result.get("anilist_id"),
                                    anilist_result.get("mal_id"),
                                    item["id"]
                                ))
                        except Exception as e:
                            logger.debug(f"Error consultant AniList per {item['name']}: {e}")

                    if best_title and not contains_non_latin_characters(best_title):
                        if has_non_latin:
                            cursor.execute("""
                                UPDATE series
                                SET name = ?, title = ?, title_english = ?, original_title = COALESCE(original_title, ?)
                                WHERE id = ?
                            """, (best_title, best_title, best_title, item["name"], item["id"]))
                        else:
                            cursor.execute("""
                                UPDATE series SET title_english = ? WHERE id = ?
                            """, (best_title, item["id"]))

                        conn.commit()
                        updated_count += 1
                    else:
                        error_count += 1

                except Exception as e:
                    error_count += 1
                    logger.debug(f"Error processant títol {item.get('name', 'desconegut')}: {e}")

                # Log progrés cada 50 ítems
                if (idx + 1) % 50 == 0:
                    logger.info(f"fix_non_latin_titles_background: {idx + 1}/{total} processats ({updated_count} actualitzats)")

        finally:
            await tmdb_client.close()

    logger.info(f"fix_non_latin_titles_background: Completat - {updated_count} actualitzats, {error_count} errors de {total} total")
    return updated_count


async def precache_episodes_background() -> int:
    """
    Pre-cacheja metadades d'episodis en background (per la sincronització diària).
    Retorna el nombre de temporades cachejades.
    """
    from backend.metadata.service import MetadataService

    cached_count = 0
    error_count = 0

    with get_db() as conn:
        cursor = conn.cursor()

        # Obtenir sèries amb tmdb_id
        cursor.execute("""
            SELECT id, name, tmdb_id, anilist_id, content_type, tmdb_seasons
            FROM series
            WHERE tmdb_id IS NOT NULL AND media_type = 'series'
        """)
        series_list = [dict(row) for row in cursor.fetchall()]

    if not series_list:
        logger.info("precache_episodes_background: No hi ha sèries per processar")
        return 0

    logger.info(f"precache_episodes_background: {len(series_list)} sèries a processar")

    metadata_service = MetadataService()

    for idx, series in enumerate(series_list):
        try:
            tmdb_id = series["tmdb_id"]
            # NO passar anilist_id per evitar rate limiting d'AniList durant precache
            # Només necessitem dades de TMDB per episodis
            tmdb_seasons = series.get("tmdb_seasons") or 5  # Default 5 temporades
            max_seasons = min(tmdb_seasons, 15)  # Límit raonable

            series_cached = 0
            for season_num in range(1, max_seasons + 1):
                try:
                    # Passar anilist_id=None per forçar només TMDB
                    data = await metadata_service.get_episodes_metadata(
                        tmdb_id=tmdb_id,
                        season_number=season_num,
                        anilist_id=None,  # Evitar AniList rate limiting
                        content_type=None
                    )
                    if data and data.get("episodes"):
                        series_cached += 1
                        cached_count += 1
                    elif season_num > 2 and series_cached == 0:
                        break  # Si les primeres temporades no existeixen, parar

                except Exception as e:
                    logger.debug(f"precache S{season_num} error: {e}")
                    if season_num > 2 and series_cached == 0:
                        break

            # Petita pausa per no sobrecarregar TMDB (0.1s entre sèries)
            await asyncio.sleep(0.1)

        except Exception as e:
            error_count += 1
            logger.debug(f"precache error {series.get('name', 'unknown')}: {e}")

        # Log progrés cada 20 sèries
        if (idx + 1) % 20 == 0:
            logger.info(f"precache_episodes_background: {idx + 1}/{len(series_list)} sèries ({cached_count} temporades)")

    logger.info(f"precache_episodes_background: Completat - {cached_count} temporades cachejades, {error_count} errors")
    return cached_count


async def sync_bbc_catalog_background():
    """
    Sincronitza el catàleg de BBC iPlayer amb TMDB.
    S'executa com a part de la sincronització diària.
    """
    results = {
        "status": "success",
        "imported_films": 0,
        "imported_series": 0,
        "imported_episodes": 0,
        "errors": []
    }

    try:
        # Verificar TMDB API key
        tmdb_key = get_tmdb_api_key()

        if not tmdb_key:
            logger.warning("sync_bbc_catalog_background: TMDB key no configurada, saltant sincronització BBC")
            results["status"] = "skipped"
            results["reason"] = "TMDB key not configured"
            return results

        from backend.debrid.bbc_catalog import BBCCatalogScanner, BBCTMDBMatcher, BBCProgram
        from backend.debrid.bbc_mapping import (
            import_bbc_episodes_with_metadata,
            set_bbc_mapping_for_content,
            save_bbc_mapping
        )
        from backend.debrid import BBCiPlayerClient

        logger.info("sync_bbc_catalog_background: Iniciant escaneig de BBC iPlayer...")

        # Pas 1: Escanejar catàleg
        scanner = BBCCatalogScanner()
        catalog = await scanner.scan_full_catalog()

        all_programs = []
        for film in catalog.get("films", []):
            all_programs.append(BBCProgram(
                programme_id=film["programme_id"],
                title=film["title"],
                url=film["url"],
                is_film=True,
                is_series=False,
                synopsis=film.get("synopsis"),
                thumbnail=film.get("thumbnail")
            ))
        for series in catalog.get("series", []):
            all_programs.append(BBCProgram(
                programme_id=series["programme_id"],
                title=series["title"],
                url=series["url"],
                is_film=False,
                is_series=True,
                synopsis=series.get("synopsis"),
                thumbnail=series.get("thumbnail"),
                episodes_url=series.get("episodes_url") or series["url"]
            ))

        logger.info(f"sync_bbc_catalog_background: Trobats {len(all_programs)} programes")

        if not all_programs:
            logger.warning("sync_bbc_catalog_background: No s'han trobat programes a BBC iPlayer")
            return results

        # Pas 2: Matching amb TMDB
        matcher = BBCTMDBMatcher(tmdb_key)
        match_result = await matcher.match_all_programs(all_programs, min_confidence=60.0)
        matched = match_result.get("matched", [])

        logger.info(f"sync_bbc_catalog_background: Matched {len(matched)} programes amb TMDB")

        # Pas 3: Importar al mapping
        bbc_client = BBCiPlayerClient()

        for item in matched:
            try:
                tmdb_id = item["tmdb_id"]
                bbc_url = item["bbc_url"]
                bbc_title = item["bbc_title"]

                if item["is_film"]:
                    set_bbc_mapping_for_content(
                        tmdb_id=tmdb_id,
                        content_type="movie",
                        bbc_series_id=item["bbc_programme_id"],
                        title=bbc_title,
                        episodes={1: item["bbc_programme_id"]}
                    )
                    results["imported_films"] += 1
                else:
                    episodes_url = bbc_url.replace("/episode/", "/episodes/") if "/episode/" in bbc_url else bbc_url

                    try:
                        episodes = await bbc_client.get_all_episodes_from_series(episodes_url)
                        if episodes:
                            count = import_bbc_episodes_with_metadata(
                                tmdb_id=tmdb_id,
                                content_type="tv",
                                episodes=episodes,
                                bbc_series_id=item["bbc_programme_id"],
                                title=bbc_title
                            )
                            results["imported_series"] += 1
                            results["imported_episodes"] += count
                        else:
                            set_bbc_mapping_for_content(
                                tmdb_id=tmdb_id,
                                content_type="tv",
                                bbc_series_id=item["bbc_programme_id"],
                                title=bbc_title
                            )
                            results["imported_series"] += 1
                    except Exception as ep_err:
                        logger.debug(f"Error episodis {bbc_title}: {ep_err}")

                await asyncio.sleep(0.2)  # Rate limiting

            except Exception as e:
                results["errors"].append(str(e))

        save_bbc_mapping()
        logger.info(f"sync_bbc_catalog_background: Completat - {results['imported_films']} films, {results['imported_series']} series, {results['imported_episodes']} episodes")

    except Exception as e:
        logger.error(f"sync_bbc_catalog_background: Error - {e}")
        results["status"] = "error"
        results["error"] = str(e)

    return results


async def daily_sync_job():
    """
    Tasca de sincronització diària que s'executa a les 2:30 AM.
    Sincronitza tot el contingut de TMDB, llibres i corregeix títols no-llatins.
    """
    logger.info("=== INICI SINCRONITZACIÓ DIÀRIA ===")
    start_time = datetime.now()

    total_imported = 0

    try:
        # Sincronitzar pel·lícules
        for category in ["popular", "top_rated", "now_playing", "upcoming"]:
            count = await sync_tmdb_category("movie", category, max_pages=25)
            total_imported += count

        # Sincronitzar sèries
        for category in ["popular", "top_rated", "on_the_air"]:
            count = await sync_tmdb_category("series", category, max_pages=25)
            total_imported += count

        # Sincronitzar llibres (per audiobooks també)
        books_count = await sync_books_from_openlibrary(max_items=500)
        total_imported += books_count

        # Corregir títols no-llatins (japonès, xinès, coreà, etc.) → Català/Anglès
        titles_fixed = await fix_non_latin_titles_background()
        logger.info(f"Títols corregits: {titles_fixed}")

        # Pre-cachejar metadades d'episodis per càrrega ràpida
        seasons_cached = await precache_episodes_background()
        logger.info(f"Temporades cachejades: {seasons_cached}")

        # Sincronitzar catàleg de BBC iPlayer (si tenim TMDB key)
        bbc_result = await sync_bbc_catalog_background()
        bbc_films = bbc_result.get('imported_films', 0)
        bbc_series = bbc_result.get('imported_series', 0)
        bbc_episodes = bbc_result.get('imported_episodes', 0)
        logger.info(f"BBC: {bbc_films} pel·lícules, {bbc_series} sèries, {bbc_episodes} episodis")

        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"=== FI SINCRONITZACIÓ DIÀRIA: {total_imported} items, {titles_fixed} títols corregits, {seasons_cached} temporades cachejades, BBC: {bbc_films}+{bbc_series} en {elapsed:.1f}s ===")

        # Guardar última sincronització
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO settings (key, value)
                VALUES ('last_sync', ?)
            """, (datetime.now().isoformat(),))
            conn.commit()

    except Exception as e:
        logger.error(f"Error en sincronització diària: {e}")


@app.get("/api/sync/status")
async def get_sync_status():
    """Retorna l'estat de la sincronització i pròxima execució."""
    job = scheduler.get_job("daily_sync")
    next_run = job.next_run_time if job else None

    # Obtenir última sincronització
    last_sync = None
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = 'last_sync'")
        row = cursor.fetchone()
        if row:
            last_sync = row[0]

    return {
        "scheduler_running": scheduler.running,
        "next_sync": next_run.isoformat() if next_run else None,
        "last_sync": last_sync,
        "sync_time": "02:30"
    }


@app.post("/api/sync/run")
async def run_sync_now(background_tasks: BackgroundTasks):
    """Executa la sincronització manualment (en segon pla)."""
    background_tasks.add_task(daily_sync_job)
    return {"status": "started", "message": "Sincronització iniciada en segon pla"}


@app.post("/api/sync/bbc")
async def run_bbc_sync_now(request: Request, background_tasks: BackgroundTasks):
    """
    Executa NOMÉS la sincronització de BBC iPlayer (en segon pla).
    Més ràpid que la sincronització completa.
    """
    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")
    background_tasks.add_task(sync_bbc_catalog_background)
    return {"status": "started", "message": "Sincronització BBC iniciada en segon pla"}


# =============================================================================
# REAL-DEBRID & TORRENT STREAMING
# =============================================================================

def get_rd_api_key():
    """Obtenir API key de Real-Debrid des de settings o DB"""
    # Primer, mirar a settings (variable d'entorn)
    if settings.REAL_DEBRID_API_KEY:
        return settings.REAL_DEBRID_API_KEY

    # Si no, mirar a la base de dades
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'realdebrid_api_key'")
            row = cursor.fetchone()
            if row and row[0]:
                return row[0]
    except Exception:
        pass
    return None


@app.get("/api/debrid/status")
async def get_debrid_status():
    """Comprovar estat de Real-Debrid (si està configurat i vàlid)"""
    api_key = get_rd_api_key()
    if not api_key:
        return {
            "configured": False,
            "valid": False,
            "message": "Real-Debrid no configurat"
        }

    from backend.debrid import RealDebridClient

    client = RealDebridClient(api_key)
    try:
        user = await client.get_user()
        return {
            "configured": True,
            "valid": True,
            "username": user.get("username"),
            "email": user.get("email"),
            "premium": user.get("premium", 0) > 0,
            "expiration": user.get("expiration")
        }
    except Exception as e:
        return {
            "configured": True,
            "valid": False,
            "message": str(e)
        }


@app.post("/api/debrid/configure")
async def configure_debrid(api_key: str = Query(..., description="Real-Debrid API Key")):
    """Configurar/guardar API key de Real-Debrid"""
    from backend.debrid import RealDebridClient

    # Validar API key
    client = RealDebridClient(api_key)
    try:
        user = await client.get_user()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"API key invàlida: {str(e)}")

    # Guardar a la base de dades
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO settings (key, value)
            VALUES ('realdebrid_api_key', ?)
        """, (api_key,))
        conn.commit()

    return {
        "status": "success",
        "message": "Real-Debrid configurat correctament",
        "username": user.get("username"),
        "premium": user.get("premium", 0) > 0
    }


def _normalize_quality(quality: str) -> str:
    """Normalitza la qualitat a una de les 4 principals."""
    if not quality:
        return "SD"
    q = quality.upper()
    if "2160" in q or "4K" in q or "UHD" in q:
        return "4K"
    elif "1080" in q:
        return "1080p"
    elif "720" in q:
        return "720p"
    else:
        return "SD"

def _filter_and_prioritize_streams(streams: list, cached_hashes: set, max_per_quality: int = 2) -> list:
    """
    Filtra i prioritza streams:
    - Només 4 qualitats principals (4K, 1080p, 720p, SD)
    - Màxim N torrents per qualitat
    - Prioritza els que estan en cache (Real-Debrid)
    """
    # Agrupar per qualitat normalitzada
    quality_groups = {"4K": [], "1080p": [], "720p": [], "SD": []}

    for s in streams:
        norm_quality = _normalize_quality(s.quality if hasattr(s, 'quality') else s.get('quality', ''))
        is_cached = (s.info_hash.lower() in cached_hashes) if (hasattr(s, 'info_hash') and s.info_hash) else False

        if norm_quality in quality_groups:
            quality_groups[norm_quality].append((s, is_cached))

    # Ordenar cada grup: cached primer, després per seeders
    result = []
    for quality in ["4K", "1080p", "720p", "SD"]:
        group = quality_groups[quality]
        # Ordenar: cached primer, després per seeders (descendent)
        group.sort(key=lambda x: (
            -1 if x[1] else 0,  # Cached primer
            -(x[0].seeders if hasattr(x[0], 'seeders') and x[0].seeders else 0)  # Més seeders
        ))
        # Agafar només els primers N
        for s, is_cached in group[:max_per_quality]:
            result.append((s, is_cached))

    return result


@app.get("/api/debrid/torrents/{media_type}/{tmdb_id}")
async def search_torrents(
    media_type: str,
    tmdb_id: int,
    season: Optional[int] = None,
    episode: Optional[int] = None
):
    """
    Buscar torrents per un contingut (optimitzat)

    - media_type: 'movie' o 'tv'
    - tmdb_id: ID de TMDB
    - season/episode: només per series

    Optimitzacions:
    - Cache de resultats (30 min)
    - Filtra a 4 qualitats: 4K, 1080p, 720p, SD
    - Màxim 2 torrents per qualitat
    - Prioritza torrents en cache de Real-Debrid
    """
    # Comprovar cache de torrents primer
    cache_key = f"torrents:{media_type}:{tmdb_id}:{season}:{episode}"
    cached_result = torrents_cache.get(cache_key)
    if cached_result:
        logger.debug(f"Cache hit per torrents {cache_key}")
        return cached_result

    # Obtenir IMDB ID des de TMDB (amb cache)
    imdb_cache_key = f"imdb:{media_type}:{tmdb_id}"
    imdb_id = tmdb_cache.get(imdb_cache_key)

    if not imdb_id:
        api_key = get_tmdb_api_key()
        if not api_key:
            raise HTTPException(status_code=400, detail="Cal configurar la clau TMDB")

        from backend.metadata.tmdb import TMDBClient

        client = TMDBClient(api_key)
        try:
            endpoint = f"/{media_type}/{tmdb_id}/external_ids"
            external_ids = await client._request(endpoint)
            if not external_ids or not external_ids.get("imdb_id"):
                raise HTTPException(status_code=404, detail="No s'ha trobat IMDB ID per aquest contingut")
            imdb_id = external_ids["imdb_id"]
            # Guardar IMDB ID al cache (no caduca)
            tmdb_cache.set(imdb_cache_key, imdb_id)
        finally:
            await client.close()

    # Buscar torrents via Torrentio
    from backend.debrid import TorrentioClient

    torrentio = TorrentioClient(settings.TORRENTIO_URL)

    if media_type == "movie":
        streams = await torrentio.search_movie(imdb_id)
    else:
        if season is None or episode is None:
            raise HTTPException(status_code=400, detail="Season i episode són requerits per series")
        streams = await torrentio.search_series(imdb_id, season, episode)

    # Comprovar disponibilitat instantània a Real-Debrid
    # NOTA: L'endpoint instantAvailability de RD està desactivat (error 403, code 37)
    # Així que no comprovem cache - tots els torrents es tracten com no-cached
    # Això millora el rendiment significativament (evita peticions fallides)
    cached_hashes = set()

    # Desactivat temporalment - l'endpoint instantAvailability no funciona
    # Si Real-Debrid el reactiva, es pot descomentar aquest bloc
    # rd_api_key = get_rd_api_key()
    # if rd_api_key and streams:
    #     from backend.debrid import RealDebridClient
    #     rd_client = RealDebridClient(rd_api_key)
    #     try:
    #         # IMPORTANT: Eliminar duplicats i limitar a 100 hashes màxim
    #         unique_hashes = list(set(s.info_hash for s in streams if s.info_hash))[:100]
    #         if unique_hashes:
    #             availability = await rd_client.check_instant_availability(unique_hashes)
    #             cached_hashes = set(availability.keys()) if availability else set()
    #     except Exception as e:
    #         logger.warning(f"Error comprovant cache RD: {e}")

    # Filtrar i prioritzar streams (màxim 4 per qualitat, cached primer)
    filtered_streams = _filter_and_prioritize_streams(streams, cached_hashes, max_per_quality=4)

    # Preparar resposta
    result_streams = [
        {
            **s.to_dict(),
            "cached": is_cached,
            "quality_group": _normalize_quality(s.quality if hasattr(s, 'quality') else '')
        }
        for s, is_cached in filtered_streams
    ]

    result = {
        "imdb_id": imdb_id,
        "tmdb_id": tmdb_id,
        "media_type": media_type,
        "season": season,
        "episode": episode,
        "streams": result_streams,
        "total": len(result_streams),
        "cached_count": len([s for s in result_streams if s.get("cached")])
    }

    # Guardar al cache (30 min)
    torrents_cache.set(cache_key, result)

    return result


@app.post("/api/debrid/stream")
async def get_debrid_stream(
    info_hash: str = Query(..., description="Hash del torrent"),
    magnet: str = Query(..., description="Magnet link complet"),
    file_idx: Optional[int] = Query(None, description="Índex del fitxer (per season packs)"),
    season: Optional[int] = Query(None, description="Número de temporada (per sèries)"),
    episode: Optional[int] = Query(None, description="Número d'episodi (per sèries)")
):
    """
    Obtenir URL de streaming directa de Real-Debrid

    Retorna una URL directa que es pot usar en un <video> HTML5.
    Les URLs es guarden en cache durant 4 hores per evitar crides repetides.
    """
    # Crear clau de cache única (hash + season + episode per assegurar correcte)
    cache_key = f"stream_{info_hash}_s{season}_e{episode}" if season and episode else f"stream_{info_hash}_{file_idx if file_idx is not None else 'auto'}"

    # Comprovar cache primer (instantani!)
    cached_result = stream_url_cache.get(cache_key)
    if cached_result:
        logger.info(f"[StreamCache] Hit per {info_hash[:8]}... (instantani)")
        return cached_result

    rd_api_key = get_rd_api_key()
    if not rd_api_key:
        raise HTTPException(status_code=400, detail="Real-Debrid no configurat")

    from backend.debrid import RealDebridClient
    from backend.debrid.realdebrid import RealDebridError

    client = RealDebridClient(rd_api_key)

    try:
        result = await client.get_streaming_url(magnet, file_idx=file_idx, season=season, episode=episode)
        if not result:
            raise HTTPException(status_code=500, detail="No s'ha pogut obtenir URL de streaming")

        # Crear URL proxiejada per evitar CORS
        from urllib.parse import quote
        original_url = result["url"]
        proxied_url = f"/api/video/proxy?url={quote(original_url, safe='')}"

        response = {
            "status": "success",
            "url": proxied_url,
            "original_url": original_url,  # Per debug
            "filename": result.get("filename"),
            "filesize": result.get("filesize"),
            "mimetype": result.get("mimetype")
        }

        # Guardar al cache per futures peticions
        stream_url_cache.set(cache_key, response)
        logger.info(f"[StreamCache] Cached URL per {info_hash[:8]}...")

        return response
    except RealDebridError as e:
        # Errors específics de Real-Debrid amb missatges descriptius
        logger.warning(f"Error de Real-Debrid: {e.message}")
        raise HTTPException(status_code=500, detail=e.message)
    except HTTPException:
        # Re-llançar HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Error inesperat obtenint stream de RD: {e}")
        raise HTTPException(status_code=500, detail="Error inesperat del servidor")


@app.get("/api/debrid/stream/cached")
async def get_cached_stream(
    info_hash: str = Query(..., description="Hash del torrent"),
    magnet: str = Query(..., description="Magnet link complet")
):
    """
    Obtenir URL de streaming només si el torrent està en cache (instantani)
    """
    rd_api_key = get_rd_api_key()
    if not rd_api_key:
        raise HTTPException(status_code=400, detail="Real-Debrid no configurat")

    from backend.debrid import RealDebridClient

    client = RealDebridClient(rd_api_key)

    try:
        result = await client.get_cached_streaming_url(info_hash, magnet)
        if not result:
            return {
                "status": "not_cached",
                "cached": False,
                "message": "El torrent no està en cache"
            }

        # Crear URL proxiejada per evitar CORS
        from urllib.parse import quote
        original_url = result["url"]
        proxied_url = f"/api/video/proxy?url={quote(original_url, safe='')}"

        return {
            "status": "success",
            "cached": True,
            "url": proxied_url,
            "original_url": original_url,
            "filename": result.get("filename"),
            "filesize": result.get("filesize"),
            "mimetype": result.get("mimetype")
        }
    except Exception as e:
        logger.error(f"Error obtenint stream cached: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Video Proxy Endpoint (per evitar CORS) ---

@app.get("/api/video/proxy")
async def proxy_video_stream(
    request: Request,
    url: str = Query(..., description="URL del vídeo a proxy-ar")
):
    """
    Proxy per streaming de vídeo (Real-Debrid, etc.)

    Això permet reproduir vídeos de Real-Debrid evitant problemes de CORS.
    Suporta range requests per a seeking.
    """
    import httpx
    from starlette.responses import StreamingResponse
    from starlette.background import BackgroundTask

    # Validar que la URL sigui de Real-Debrid (seguretat)
    allowed_domains = [
        "download.real-debrid.com",
        "real-debrid.com",
        "rd.download"
    ]

    from urllib.parse import urlparse
    parsed = urlparse(url)
    if not any(domain in parsed.netloc for domain in allowed_domains):
        raise HTTPException(status_code=400, detail="URL no permesa - només Real-Debrid")

    # Obtenir headers de range del client (per seeking)
    range_header = request.headers.get("range")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }

    if range_header:
        headers["Range"] = range_header

    try:
        # Crear client SENSE context manager per mantenir-lo obert durant streaming
        client = httpx.AsyncClient(timeout=None, follow_redirects=True)
        response = await client.send(
            client.build_request("GET", url, headers=headers),
            stream=True
        )

        # Headers de resposta
        response_headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range",
            "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
            "Accept-Ranges": "bytes",
        }

        # Copiar headers rellevants de Real-Debrid
        if "content-type" in response.headers:
            response_headers["Content-Type"] = response.headers["content-type"]
        if "content-length" in response.headers:
            response_headers["Content-Length"] = response.headers["content-length"]
        if "content-range" in response.headers:
            response_headers["Content-Range"] = response.headers["content-range"]

        # Funció generadora per streaming
        async def stream_content():
            try:
                async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):  # 1MB chunks
                    yield chunk
            finally:
                await response.aclose()
                await client.aclose()

        return StreamingResponse(
            stream_content(),
            status_code=response.status_code,
            headers=response_headers,
            media_type=response_headers.get("Content-Type", "video/mp4")
        )

    except httpx.RequestError as e:
        logger.error(f"Error proxy vídeo: {e}")
        raise HTTPException(status_code=502, detail="Error connectant amb el servidor de vídeo")
    except Exception as e:
        logger.error(f"Error inesperat proxy vídeo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.options("/api/video/proxy")
async def proxy_video_options():
    """Handle CORS preflight for video proxy"""
    from starlette.responses import Response
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range",
            "Access-Control-Max-Age": "86400",
        }
    )


# ==================== BBC IPLAYER API ====================

# --- BBC Admin Endpoints (només admins) ---

@app.get("/api/bbc/status")
async def get_bbc_status(request: Request):
    """
    Obtenir l'estat de la configuració de BBC iPlayer

    Accessible per tots els usuaris autenticats.
    """
    require_auth(request)

    from backend.debrid import has_bbc_cookies, ENCRYPTION_AVAILABLE

    return {
        "configured": has_bbc_cookies(),
        "encryption_available": ENCRYPTION_AVAILABLE,
        "note": "Les cookies de BBC es guarden encriptades" if ENCRYPTION_AVAILABLE else "Encriptació no disponible (instal·la cryptography)"
    }


@app.post("/api/bbc/cookies")
async def set_bbc_cookies(request: Request):
    """
    Configurar les cookies de BBC iPlayer (només admins)

    Les cookies s'han d'exportar del navegador en format Netscape.
    Extensions recomanades:
    - Chrome: "Get cookies.txt LOCALLY"
    - Firefox: "cookies.txt"

    Cos de la petició:
    {
        "cookies": "# Netscape HTTP Cookie File\\n.bbc.co.uk\\tTRUE\\t/..."
    }
    """
    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Només els administradors poden configurar les cookies de BBC")

    from backend.debrid import save_bbc_cookies, validate_cookies_format

    try:
        body = await request.json()
        cookies_data = body.get("cookies", "")

        if not cookies_data:
            raise HTTPException(status_code=400, detail="No s'han proporcionat cookies")

        # Validar format
        valid, message = validate_cookies_format(cookies_data)
        if not valid:
            raise HTTPException(status_code=400, detail=message)

        # Guardar cookies (encriptades)
        if save_bbc_cookies(cookies_data):
            return {
                "status": "success",
                "message": "Cookies de BBC configurades correctament",
                "validation": message
            }
        else:
            raise HTTPException(status_code=500, detail="Error guardant les cookies")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error configurant cookies BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/bbc/cookies")
async def delete_bbc_cookies_endpoint(request: Request):
    """
    Eliminar les cookies de BBC iPlayer (només admins)
    """
    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Només els administradors poden eliminar les cookies de BBC")

    from backend.debrid import delete_bbc_cookies

    if delete_bbc_cookies():
        return {"status": "success", "message": "Cookies de BBC eliminades"}
    else:
        raise HTTPException(status_code=500, detail="Error eliminant les cookies")


# --- BBC Streaming Endpoints (usuaris autenticats) ---

@app.get("/api/bbc/stream")
async def get_bbc_stream(
    request: Request,
    url: str = Query(..., description="URL de BBC iPlayer o programme_id"),
    quality: str = Query("best", description="Qualitat: best, 1080, 720, 480, worst")
):
    """
    Obtenir URL de streaming d'un programa de BBC iPlayer

    Requereix:
    - Usuari autenticat a Hermes
    - Cookies de BBC configurades per l'admin
    - Servidor amb IP del Regne Unit
    """
    require_auth(request)  # Usuaris autenticats només

    from backend.debrid import BBCiPlayerClient, BBCiPlayerError

    client = BBCiPlayerClient()

    try:
        stream = await client.get_stream_info(url, quality)

        if not stream:
            raise HTTPException(
                status_code=404,
                detail="No s'ha pogut obtenir informació del programa"
            )

        if not stream.url:
            raise HTTPException(
                status_code=404,
                detail="No s'ha pogut obtenir l'URL de streaming"
            )

        return {
            "status": "success",
            "provider": "bbc_iplayer",
            "programme_id": stream.programme_id,
            "title": stream.title,
            "description": stream.description,
            "thumbnail": stream.thumbnail,
            "duration": stream.duration,
            "url": stream.url,
            "subtitles": stream.subtitles,
            "season": stream.season,
            "episode": stream.episode,
            "quality": stream.quality
        }

    except BBCiPlayerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obtenint stream BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- BBC HLS Proxy Endpoints ---
# Proxy per evitar problemes de CORS i geoblocking

@app.get("/api/bbc/proxy/manifest")
async def proxy_bbc_manifest(
    request: Request,
    url: str = Query(..., description="URL del manifest HLS (.m3u8)")
):
    """
    Proxy per al manifest HLS de BBC iPlayer.
    Modifica les URLs dels segments per apuntar al nostre proxy.
    Nota: No requereix autenticació perquè HLS.js fa peticions directes.
    """
    import httpx
    import re
    from urllib.parse import urljoin, quote

    try:
        # Obtenir les cookies de BBC per autenticació
        from backend.debrid.bbc_cookies import get_bbc_cookies_dict
        cookies = get_bbc_cookies_dict()

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-GB,en;q=0.9",
            "Origin": "https://www.bbc.co.uk",
            "Referer": "https://www.bbc.co.uk/iplayer",
        }

        async with httpx.AsyncClient(timeout=30.0, cookies=cookies) as client:
            response = await client.get(url, headers=headers, follow_redirects=True)
            response.raise_for_status()
            content = response.text

        # Determinar la URL base per URLs relatives
        base_url = url.rsplit('/', 1)[0] + '/'

        # Processar el manifest
        lines = content.split('\n')
        modified_lines = []

        for line in lines:
            line = line.strip()
            if not line:
                modified_lines.append(line)
                continue

            # Si és una URL (no comença amb #)
            if not line.startswith('#'):
                # Convertir URLs relatives a absolutes
                if not line.startswith('http'):
                    absolute_url = urljoin(base_url, line)
                else:
                    absolute_url = line

                # Si és un altre manifest (.m3u8), proxy-lo
                if '.m3u8' in line:
                    proxy_url = f"/api/bbc/proxy/manifest?url={quote(absolute_url, safe='')}"
                else:
                    # És un segment, proxy-lo
                    proxy_url = f"/api/bbc/proxy/segment?url={quote(absolute_url, safe='')}"

                modified_lines.append(proxy_url)
            else:
                # Si és un tag amb URI=
                if 'URI="' in line:
                    # Extreure i modificar la URI
                    match = re.search(r'URI="([^"]+)"', line)
                    if match:
                        original_uri = match.group(1)
                        if not original_uri.startswith('http'):
                            absolute_uri = urljoin(base_url, original_uri)
                        else:
                            absolute_uri = original_uri

                        # Determinar si és manifest o segment
                        if '.m3u8' in original_uri:
                            proxy_uri = f"/api/bbc/proxy/manifest?url={quote(absolute_uri, safe='')}"
                        elif '.vtt' in original_uri or 'subtitle' in original_uri.lower():
                            proxy_uri = f"/api/bbc/subtitles?url={quote(absolute_uri, safe='')}"
                        else:
                            proxy_uri = f"/api/bbc/proxy/segment?url={quote(absolute_uri, safe='')}"

                        line = line.replace(f'URI="{original_uri}"', f'URI="{proxy_uri}"')

                modified_lines.append(line)

        modified_content = '\n'.join(modified_lines)

        from fastapi.responses import Response
        return Response(
            content=modified_content,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache"
            }
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"Error HTTP al proxy manifest BBC: {e.response.status_code}")
        raise HTTPException(status_code=e.response.status_code, detail=f"BBC returned {e.response.status_code}")
    except Exception as e:
        logger.error(f"Error al proxy manifest BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bbc/proxy/segment")
async def proxy_bbc_segment(
    request: Request,
    url: str = Query(..., description="URL del segment de vídeo")
):
    """
    Proxy per als segments de vídeo de BBC iPlayer.
    Simplement reenvia el contingut binari.
    Inclou retry amb backoff exponencial i límit de connexions concurrents.
    """
    import httpx
    import asyncio

    MAX_RETRIES = 3
    BASE_DELAY = 0.5  # 500ms inicial

    # Limitar connexions concurrents per evitar sobrecàrrega
    semaphore = get_bbc_segment_semaphore()

    async with semaphore:
        # Obtenir les cookies de BBC per autenticació
        from backend.debrid.bbc_cookies import get_bbc_cookies_dict
        cookies = get_bbc_cookies_dict()

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-GB,en;q=0.9",
            "Origin": "https://www.bbc.co.uk",
            "Referer": "https://www.bbc.co.uk/iplayer",
        }

        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=30.0, cookies=cookies) as client:
                    response = await client.get(url, headers=headers, follow_redirects=True)
                    response.raise_for_status()
                    content = response.content

                # Determinar el content-type
                content_type = response.headers.get("content-type", "video/mp2t")

                from fastapi.responses import Response
                return Response(
                    content=content,
                    media_type=content_type,
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "max-age=86400"  # 24h per segments (són immutables)
                    }
                )

            except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as e:
                last_error = e
                if attempt < MAX_RETRIES - 1:
                    delay = BASE_DELAY * (2 ** attempt)  # Exponential backoff
                    logger.warning(f"Retry {attempt + 1}/{MAX_RETRIES} segment BBC després de {delay}s: {type(e).__name__}")
                    await asyncio.sleep(delay)
                continue
            except httpx.HTTPStatusError as e:
                # No retry per errors HTTP (404, 403, etc.)
                logger.error(f"Error HTTP al proxy segment BBC: {e.response.status_code}")
                raise HTTPException(status_code=e.response.status_code, detail=f"BBC returned {e.response.status_code}")
            except Exception as e:
                logger.error(f"Error al proxy segment BBC: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        # Si arribem aquí, tots els retries han fallat
        logger.error(f"Segment BBC fallat després de {MAX_RETRIES} intents: {last_error}")
        raise HTTPException(status_code=504, detail="Timeout obtenint segment de BBC")


@app.get("/api/bbc/info")
async def get_bbc_info(
    request: Request,
    url: str = Query(..., description="URL de BBC iPlayer o programme_id")
):
    """
    Obtenir informació d'un programa de BBC iPlayer sense URL de streaming
    (més ràpid que /api/bbc/stream)
    """
    require_auth(request)

    from backend.debrid import BBCiPlayerClient, BBCiPlayerError

    client = BBCiPlayerClient()

    try:
        stream = await client.get_stream_info(url, quality="worst")

        if not stream:
            raise HTTPException(
                status_code=404,
                detail="No s'ha pogut obtenir informació del programa"
            )

        return {
            "status": "success",
            "provider": "bbc_iplayer",
            "programme_id": stream.programme_id,
            "title": stream.title,
            "description": stream.description,
            "thumbnail": stream.thumbnail,
            "duration": stream.duration,
            "season": stream.season,
            "episode": stream.episode,
            "formats_available": len(stream.formats) if stream.formats else 0
        }

    except BBCiPlayerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obtenint info BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bbc/formats")
async def get_bbc_formats(
    request: Request,
    url: str = Query(..., description="URL de BBC iPlayer o programme_id")
):
    """
    Obtenir tots els formats disponibles d'un programa
    """
    require_auth(request)

    from backend.debrid import BBCiPlayerClient, BBCiPlayerError

    client = BBCiPlayerClient()

    try:
        formats = await client.get_formats(url)

        return {
            "status": "success",
            "formats": formats,
            "count": len(formats)
        }

    except BBCiPlayerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error obtenint formats BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bbc/series")
async def get_bbc_series(
    request: Request,
    url: str = Query(..., description="URL de la sèrie de BBC iPlayer")
):
    """
    Obtenir tots els episodis d'una sèrie de BBC iPlayer
    """
    require_auth(request)

    from backend.debrid import BBCiPlayerClient, BBCiPlayerError

    client = BBCiPlayerClient()

    try:
        episodes = await client.search_series(url)

        return {
            "status": "success",
            "episodes": episodes,
            "count": len(episodes)
        }

    except BBCiPlayerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error obtenint sèrie BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ONE PIECE BBC INTEGRATION ====================

@app.get("/api/bbc/onepiece/arcs")
async def get_onepiece_arcs(request: Request):
    """
    Obtenir tots els arcs de One Piece amb informació de disponibilitat a BBC
    """
    require_auth(request)

    from backend.debrid.bbc_onepiece import get_all_arcs

    arcs = get_all_arcs()
    return {
        "status": "success",
        "arcs": arcs,
        "count": len(arcs)
    }


@app.get("/api/bbc/onepiece/episode/{episode}")
async def get_onepiece_bbc_stream(
    request: Request,
    episode: int,
    quality: str = Query("best", description="Qualitat: best, 1080, 720")
):
    """
    Obtenir stream de BBC iPlayer per un episodi de One Piece

    Args:
        episode: Número d'episodi TMDB (absolut)
        quality: Qualitat desitjada
    """
    require_auth(request)

    from backend.debrid import BBCiPlayerClient, BBCiPlayerError
    from backend.debrid.bbc_onepiece import (
        get_arc_for_episode,
        get_bbc_programme_id
    )

    # Buscar el programme_id directe de l'episodi
    programme_id = get_bbc_programme_id(episode)

    if not programme_id:
        # Fallback: comprovar si l'arc té bbc_series_id (mètode antic)
        arc = get_arc_for_episode(episode)
        if not arc:
            raise HTTPException(
                status_code=404,
                detail=f"No s'ha trobat cap arc per l'episodi {episode}"
            )
        raise HTTPException(
            status_code=404,
            detail=f"L'episodi {episode} no està mapejat a BBC. Importa els episodis primer."
        )

    # Obtenir stream directament amb el programme_id
    try:
        bbc_client = BBCiPlayerClient()
        stream = await bbc_client.get_stream_info(programme_id, quality)

        if not stream or not stream.url:
            raise HTTPException(
                status_code=404,
                detail=f"No s'ha pogut obtenir l'stream per l'episodi {episode}"
            )

        arc = get_arc_for_episode(episode)

        return {
            "status": "success",
            "provider": "bbc_iplayer",
            "arc": arc.name if arc else "Unknown",
            "programme_id": programme_id,
            "title": stream.title,
            "url": stream.url,
            "quality": stream.quality,
            "subtitles": stream.subtitles,
            "duration": stream.duration
        }

    except BBCiPlayerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obtenint stream One Piece BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bbc/onepiece/check/{episode}")
async def check_onepiece_bbc_availability(
    request: Request,
    episode: int
):
    """
    Comprova si un episodi de One Piece està disponible a BBC iPlayer
    (sense obtenir l'stream, més ràpid)
    """
    require_auth(request)

    from backend.debrid.bbc_onepiece import get_arc_for_episode, get_bbc_programme_id

    arc = get_arc_for_episode(episode)

    if not arc:
        return {
            "available": False,
            "reason": "episode_not_found"
        }

    # Comprovar si tenim el programme_id mapejat
    programme_id = get_bbc_programme_id(episode)

    if programme_id:
        return {
            "available": True,
            "arc": arc.name,
            "arc_en": arc.name_en,
            "programme_id": programme_id
        }

    return {
        "available": False,
        "arc": arc.name,
        "reason": "episode_not_mapped"
    }


@app.post("/api/bbc/onepiece/configure")
async def configure_onepiece_arc(
    request: Request,
    arc_name: str = Query(..., description="Nom de l'arc"),
    bbc_series_id: str = Query(..., description="ID de la sèrie a BBC")
):
    """
    Configura el bbc_series_id d'un arc de One Piece
    (Administració)
    """
    require_auth(request)

    from backend.debrid.bbc_onepiece import update_arc_bbc_id

    success = update_arc_bbc_id(arc_name, bbc_series_id)

    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"No s'ha trobat l'arc '{arc_name}'"
        )

    return {
        "status": "success",
        "message": f"Arc '{arc_name}' configurat amb BBC ID: {bbc_series_id}"
    }


@app.post("/api/bbc/onepiece/import")
async def import_onepiece_bbc_episodes(
    request: Request,
    url: str = Query(..., description="URL de la sèrie/arc de BBC iPlayer")
):
    """
    Importa episodis de One Piece de BBC iPlayer automàticament.
    Obté tots els episodis de la URL donada i els mapeja als episodis absoluts.

    Args:
        url: URL de la sèrie de BBC (ex: https://www.bbc.co.uk/iplayer/episodes/p0j3hwjx)
    """
    require_auth(request)

    from backend.debrid import BBCiPlayerClient
    from backend.debrid.bbc_onepiece import (
        import_bbc_episodes_from_list,
        BBC_EPISODE_MAPPING
    )

    client = BBCiPlayerClient()

    try:
        # Obtenir tots els episodis de la sèrie
        episodes = await client.search_series(url)

        if not episodes:
            raise HTTPException(
                status_code=404,
                detail="No s'han trobat episodis a la URL proporcionada"
            )

        # Importar episodis
        imported = import_bbc_episodes_from_list(episodes)

        return {
            "status": "success",
            "message": f"Importats {imported} episodis de {len(episodes)} trobats",
            "total_found": len(episodes),
            "imported": imported,
            "total_mapped": len(BBC_EPISODE_MAPPING),
            "episodes_preview": [
                {"episode": k, "programme_id": v}
                for k, v in sorted(BBC_EPISODE_MAPPING.items())[:10]
            ]
        }

    except Exception as e:
        logger.error(f"Error important episodis BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/bbc/onepiece/import-all")
async def import_onepiece_all_arcs(request: Request):
    """
    Importa tots els episodis de One Piece de les 10 URLs predefinides de BBC.
    Processa cada arc seqüencialment.

    Arcs i episodis:
    - East Blue: 1-61 (61 episodis)
    - Alabasta: 62-135 (74 episodis)
    - Sky Island: 136-206 (71 episodis)
    - Water 7: 207-325 (119 episodis)
    - Thriller Bark: 326-384 (59 episodis)
    - Summit War: 385-516 (132 episodis)
    - Fish-Man Island: 517-574 (58 episodis)
    - Dressrosa: 575-746 (172 episodis)
    - Whole Cake Island: 747-891 (145 episodis)
    - Land of Wano: 892-1088 (197 episodis)
    Total: 1088 episodis
    """
    require_auth(request)

    from backend.debrid import BBCiPlayerClient
    from backend.debrid.bbc_onepiece import (
        import_bbc_episodes_from_list,
        BBC_EPISODE_MAPPING,
        ONE_PIECE_ARCS
    )

    # URLs dels 10 arcs de BBC One Piece
    BBC_ONEPIECE_URLS = [
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-1-m0021y5z",   # East Blue
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-2-m0021ydl",   # Alabasta
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-3-m0021ykk",   # Sky Island
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-4-m0021yr7",   # Water 7
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-5-m002217d",   # Thriller Bark
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-6-m00238l2",   # Summit War
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-7-m0023zjq",   # Fish-Man Island
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-8-m00246hj",   # Dressrosa
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-9-m0024yv1",   # Whole Cake Island
        "https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece?seriesId=m0021y5y-structural-10-m0025f1t",  # Land of Wano
    ]

    client = BBCiPlayerClient()
    results = []
    total_imported = 0
    total_found = 0
    total_expected = 0

    for arc_idx, url in enumerate(BBC_ONEPIECE_URLS):
        if arc_idx >= len(ONE_PIECE_ARCS):
            break

        arc = ONE_PIECE_ARCS[arc_idx]
        expected_count = arc.episode_count
        total_expected += expected_count

        try:
            logger.info(f"Processant {arc.name} (eps {arc.tmdb_start}-{arc.tmdb_end}, {expected_count} episodis)")
            episodes = await client.search_series(url)

            if episodes:
                total_found += len(episodes)
                imported = import_bbc_episodes_from_list(episodes, arc_start_episode=arc.tmdb_start)
                total_imported += imported
                results.append({
                    "arc": arc.name,
                    "episode_range": f"{arc.tmdb_start}-{arc.tmdb_end}",
                    "expected_episodes": expected_count,
                    "found": len(episodes),
                    "imported": imported,
                    "coverage": f"{round(imported/expected_count*100, 1)}%" if expected_count > 0 else "0%",
                    "status": "success"
                })
                logger.info(f"{arc.name}: Esperats {expected_count}, trobats {len(episodes)}, importats {imported}")
            else:
                results.append({
                    "arc": arc.name,
                    "episode_range": f"{arc.tmdb_start}-{arc.tmdb_end}",
                    "expected_episodes": expected_count,
                    "found": 0,
                    "imported": 0,
                    "coverage": "0%",
                    "status": "empty"
                })

        except Exception as e:
            logger.error(f"Error processant {arc.name}: {e}")
            results.append({
                "arc": arc.name,
                "episode_range": f"{arc.tmdb_start}-{arc.tmdb_end}",
                "expected_episodes": expected_count,
                "error": str(e),
                "status": "error"
            })

    return {
        "status": "success",
        "message": f"Importació completada: {total_imported}/{total_expected} episodis importats",
        "total_expected": total_expected,
        "total_found": total_found,
        "total_imported": total_imported,
        "total_mapped": len(BBC_EPISODE_MAPPING),
        "overall_coverage": f"{round(total_imported/total_expected*100, 1)}%" if total_expected > 0 else "0%",
        "arcs_processed": results
    }


@app.get("/api/bbc/onepiece/mapping")
async def get_onepiece_bbc_mapping(request: Request):
    """
    Obtenir el mappeig actual d'episodis de One Piece a BBC.
    """
    require_auth(request)

    from backend.debrid.bbc_onepiece import BBC_EPISODE_MAPPING, ONE_PIECE_ARCS

    # Agrupar per arcs
    arcs_status = []
    for arc in ONE_PIECE_ARCS:
        mapped_count = sum(
            1 for ep in range(arc.tmdb_start, arc.tmdb_end + 1)
            if ep in BBC_EPISODE_MAPPING
        )
        arcs_status.append({
            "name": arc.name,
            "tmdb_start": arc.tmdb_start,
            "tmdb_end": arc.tmdb_end,
            "total_episodes": arc.episode_count,
            "mapped_episodes": mapped_count,
            "coverage_percent": round(mapped_count / arc.episode_count * 100, 1) if arc.episode_count > 0 else 0
        })

    return {
        "status": "success",
        "total_mapped": len(BBC_EPISODE_MAPPING),
        "arcs": arcs_status,
        "mapping": {str(k): v for k, v in sorted(BBC_EPISODE_MAPPING.items())}
    }


@app.get("/api/bbc/onepiece/arc/{arc_index}/episodes")
async def get_onepiece_arc_episodes(
    request: Request,
    arc_index: int,
):
    """
    Obtenir els episodis d'un arc de One Piece des de TMDB.
    Retorna els episodis amb número absolut.

    Args:
        arc_index: Índex de l'arc (0-based)
    """
    require_auth(request)

    from backend.debrid.bbc_onepiece import (
        ONE_PIECE_ARCS,
        ONE_PIECE_TMDB_ID,
        get_seasons_for_arc_range,
        TMDB_SEASON_MAPPING
    )

    if arc_index < 0 or arc_index >= len(ONE_PIECE_ARCS):
        raise HTTPException(
            status_code=404,
            detail=f"Arc index {arc_index} not found"
        )

    arc = ONE_PIECE_ARCS[arc_index]
    start_ep = arc.tmdb_start
    end_ep = min(arc.tmdb_end, 2000)  # Cap per evitar problemes

    logger.info(f"[OnePiece] Loading arc {arc_index} ({arc.name}): episodes {start_ep}-{end_ep}")

    # Obtenir les temporades TMDB que cobreixen aquest arc
    seasons_needed = get_seasons_for_arc_range(start_ep, end_ep)
    logger.info(f"[OnePiece] Seasons needed for arc: {seasons_needed}")

    if not seasons_needed:
        return {
            "status": "success",
            "arc": arc.name,
            "episodes": [],
            "count": 0
        }

    # Obtenir API key i crear client TMDB
    api_key = get_tmdb_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="TMDB API key not configured")

    from backend.metadata.tmdb import TMDBClient
    tmdb_client = TMDBClient(api_key)

    # Obtenir episodis de TMDB per cada temporada
    all_episodes = []

    try:
        for season_num in seasons_needed:
            try:
                # Trobar el rang d'episodis absoluts per aquesta temporada
                season_info = next(
                    (s for s in TMDB_SEASON_MAPPING if s[0] == season_num),
                    None
                )
                if not season_info:
                    logger.warning(f"[OnePiece] Season {season_num} not found in TMDB_SEASON_MAPPING")
                    continue

                season_start = season_info[1]
                logger.info(f"[OnePiece] Fetching TMDB season {season_num} (absolute start: {season_start})")

                # Usar el mètode existent que ja funciona
                tmdb_response = await tmdb_client.get_tv_season_details(ONE_PIECE_TMDB_ID, season_num)

                if tmdb_response and "episodes" in tmdb_response:
                    episodes_in_season = len(tmdb_response["episodes"])
                    episodes_added = 0

                    # Detectar si TMDB usa numeració absoluta o relativa
                    # One Piece a TMDB usa numeració ABSOLUTA (ep 62, 63... no 1, 2...)
                    first_ep_num = tmdb_response["episodes"][0]["episode_number"] if tmdb_response["episodes"] else 1
                    uses_absolute = first_ep_num >= season_start

                    for ep in tmdb_response["episodes"]:
                        ep_num = ep["episode_number"]

                        if uses_absolute:
                            # Numeració absoluta (One Piece) - usar directament
                            absolute_ep = ep_num
                        else:
                            # Numeració relativa (1-based per temporada)
                            absolute_ep = season_start + ep_num - 1

                        # Filtrar només episodis dins l'arc
                        if start_ep <= absolute_ep <= end_ep:
                            all_episodes.append({
                                "episode_number": absolute_ep,
                                "episode_in_arc": absolute_ep - start_ep + 1,
                                "name": ep.get("name", f"Episode {absolute_ep}"),
                                "overview": ep.get("overview"),
                                "still_path": ep.get("still_path"),
                                "air_date": ep.get("air_date"),
                                "runtime": ep.get("runtime"),
                                "vote_average": ep.get("vote_average"),
                                "tmdb_season": season_num,
                                "tmdb_episode": ep["episode_number"]
                            })
                            episodes_added += 1
                    logger.info(f"[OnePiece] Season {season_num}: {episodes_in_season} episodes fetched, {episodes_added} added to arc")
                else:
                    logger.warning(f"[OnePiece] No episodes in TMDB response for season {season_num}")

            except Exception as e:
                logger.error(f"[OnePiece] Error fetching season {season_num}: {e}")
                import traceback
                logger.error(traceback.format_exc())
                continue
    finally:
        await tmdb_client.close()

    # Ordenar per número d'episodi absolut
    all_episodes.sort(key=lambda x: x["episode_number"])
    logger.info(f"[OnePiece] Total episodes for arc {arc.name}: {len(all_episodes)}")

    return {
        "status": "success",
        "arc": arc.name,
        "arc_index": arc_index,
        "tmdb_start": start_ep,
        "tmdb_end": end_ep,
        "bbc_available": arc.bbc_series_id is not None,
        "episodes": all_episodes,
        "count": len(all_episodes)
    }


# ============================================================================
# BBC Generic Import Endpoints
# Endpoints genèrics per importar qualsevol contingut de BBC
# ============================================================================

@app.post("/api/bbc/import")
async def import_bbc_content(
    request: Request,
    url: str = Query(..., description="URL de BBC iPlayer (sèrie o episodi)"),
    tmdb_id: int = Query(..., description="ID de TMDB del contingut"),
    content_type: str = Query("tv", description="Tipus: 'tv' o 'movie'"),
    title: str = Query(None, description="Títol del contingut (opcional)"),
    start_episode: int = Query(None, description="Episodi inicial per fallback (opcional)")
):
    """
    Importa contingut de BBC iPlayer i el mapeja a un ID de TMDB.

    Funciona amb qualsevol sèrie o pel·lícula de BBC.
    Obté automàticament tots els episodis de la URL i els guarda al mappeig.

    Exemples:
    - Sèrie: /api/bbc/import?url=https://www.bbc.co.uk/iplayer/episodes/m0021y5y/one-piece&tmdb_id=37854
    - Pel·lícula: /api/bbc/import?url=https://www.bbc.co.uk/iplayer/episode/m000xyz&tmdb_id=12345&content_type=movie
    """
    require_auth(request)

    from backend.debrid import BBCiPlayerClient
    from backend.debrid.bbc_mapping import import_bbc_episodes, get_bbc_mapping_for_content

    client = BBCiPlayerClient()

    try:
        # Obtenir tots els episodis de la URL
        logger.info(f"Important contingut BBC: {url} -> TMDB {tmdb_id}")
        episodes = await client.get_all_episodes_from_series(url)

        if not episodes:
            # Pot ser un episodi únic (pel·lícula)
            info = await client.get_episode_info(url)
            if info:
                episodes = [{
                    "programme_id": info.get("programme_id"),
                    "title": info.get("title"),
                    "episode_number": 1
                }]

        if not episodes:
            raise HTTPException(
                status_code=404,
                detail="No s'ha trobat contingut a la URL proporcionada"
            )

        # Extreure bbc_series_id de la URL
        import re
        series_match = re.search(r'/episodes/([a-z0-9]+)', url)
        bbc_series_id = series_match.group(1) if series_match else None

        # Importar
        imported = import_bbc_episodes(
            tmdb_id=tmdb_id,
            content_type=content_type,
            episodes=episodes,
            bbc_series_id=bbc_series_id,
            title=title or episodes[0].get("title", "").split(":")[0].strip(),
            start_episode=start_episode
        )

        # Obtenir estat actual
        mapping = get_bbc_mapping_for_content(tmdb_id, content_type)
        total_mapped = len(mapping.get("episodes", {})) if mapping else 0

        return {
            "status": "success",
            "message": f"Importats {imported} episodis",
            "tmdb_id": tmdb_id,
            "content_type": content_type,
            "bbc_series_id": bbc_series_id,
            "found": len(episodes),
            "imported": imported,
            "total_mapped": total_mapped,
            "preview": [
                {"title": ep.get("title"), "programme_id": ep.get("programme_id")}
                for ep in episodes[:5]
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error important contingut BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bbc/content/{tmdb_id}")
async def get_bbc_content_mapping(
    request: Request,
    tmdb_id: int,
    content_type: str = Query("tv", description="Tipus: 'tv' o 'movie'")
):
    """
    Obtenir el mappeig BBC per un contingut TMDB específic.
    """
    require_auth(request)

    from backend.debrid.bbc_mapping import get_bbc_mapping_for_content, get_bbc_seasons

    mapping = get_bbc_mapping_for_content(tmdb_id, content_type)

    if not mapping:
        raise HTTPException(
            status_code=404,
            detail=f"No hi ha mappeig BBC per TMDB {tmdb_id}"
        )

    seasons = get_bbc_seasons(tmdb_id, content_type)

    return {
        "status": "success",
        "tmdb_id": tmdb_id,
        "content_type": content_type,
        "title": mapping.get("title"),
        "bbc_series_id": mapping.get("bbc_series_id"),
        "episode_count": len(mapping.get("episodes", {})),
        "season_count": len(seasons),
        "seasons": seasons,
        "last_updated": mapping.get("last_updated"),
        "episodes": mapping.get("episodes", {})
    }


@app.get("/api/bbc/content/{tmdb_id}/seasons")
async def get_bbc_content_seasons(
    request: Request,
    tmdb_id: int,
    content_type: str = Query("tv", description="Tipus: 'tv' o 'movie'")
):
    """
    Obtenir les temporades/arcs BBC per un contingut.
    Retorna nom, rang d'episodis i recompte per cada temporada.
    """
    require_auth(request)

    from backend.debrid.bbc_mapping import get_bbc_seasons, get_bbc_mapping_for_content

    mapping = get_bbc_mapping_for_content(tmdb_id, content_type)
    if not mapping:
        raise HTTPException(status_code=404, detail=f"No hi ha mappeig BBC per TMDB {tmdb_id}")

    seasons = get_bbc_seasons(tmdb_id, content_type)

    return {
        "status": "success",
        "tmdb_id": tmdb_id,
        "title": mapping.get("title"),
        "seasons": seasons
    }


@app.get("/api/bbc/content/{tmdb_id}/seasons/{season_number}/episodes")
async def get_bbc_season_episodes(
    request: Request,
    tmdb_id: int,
    season_number: int,
    content_type: str = Query("tv", description="Tipus: 'tv' o 'movie'")
):
    """
    Obtenir tots els episodis d'una temporada BBC amb metadades completes.
    Retorna títol, descripció, thumbnail, duració per cada episodi.
    """
    require_auth(request)

    from backend.debrid.bbc_mapping import (
        get_bbc_episodes_for_season,
        get_bbc_seasons,
        get_bbc_mapping_for_content
    )

    mapping = get_bbc_mapping_for_content(tmdb_id, content_type)
    if not mapping:
        raise HTTPException(status_code=404, detail=f"No hi ha mappeig BBC per TMDB {tmdb_id}")

    seasons = get_bbc_seasons(tmdb_id, content_type)
    season_info = next((s for s in seasons if s["season_number"] == season_number), None)

    if not season_info:
        raise HTTPException(status_code=404, detail=f"Temporada {season_number} no trobada")

    episodes = get_bbc_episodes_for_season(tmdb_id, season_number, content_type)

    return {
        "status": "success",
        "tmdb_id": tmdb_id,
        "season_number": season_number,
        "season_name": season_info.get("name"),
        "start_episode": season_info.get("start_episode"),
        "end_episode": season_info.get("end_episode"),
        "total_episodes": season_info.get("total_episodes"),
        "available_episodes": len(episodes),
        "episodes": episodes
    }


@app.get("/api/bbc/content/{tmdb_id}/episode/{episode}")
async def get_bbc_episode_stream(
    request: Request,
    tmdb_id: int,
    episode: int,
    content_type: str = Query("tv", description="Tipus: 'tv' o 'movie'"),
    quality: str = Query("720p", description="Qualitat: 720p o 1080p")
):
    """
    Obtenir el stream HLS d'un episodi específic d'un contingut BBC.
    """
    require_auth(request)

    from backend.debrid import BBCiPlayerClient
    from backend.debrid.bbc_mapping import get_bbc_programme_id

    programme_id = get_bbc_programme_id(tmdb_id, episode, content_type)

    if not programme_id:
        raise HTTPException(
            status_code=404,
            detail=f"Episodi {episode} no mapejat per TMDB {tmdb_id}"
        )

    client = BBCiPlayerClient()
    quality_param = "1080" if quality == "1080p" else "best"

    stream_info = await client.get_stream_info(programme_id, quality=quality_param)

    if not stream_info or not stream_info.url:
        raise HTTPException(
            status_code=503,
            detail="No s'ha pogut obtenir el stream de BBC"
        )

    return {
        "status": "success",
        "tmdb_id": tmdb_id,
        "episode": episode,
        "programme_id": programme_id,
        "quality": stream_info.quality or quality,
        "stream_url": stream_info.url
    }


@app.get("/api/bbc/content")
async def list_bbc_content(request: Request):
    """
    Llistar tot el contingut BBC mapejat.
    """
    require_auth(request)

    from backend.debrid.bbc_mapping import get_all_bbc_content

    content = get_all_bbc_content()

    return {
        "status": "success",
        "count": len(content),
        "content": content
    }


@app.get("/api/bbc/mapped-ids")
async def get_bbc_mapped_ids_endpoint(request: Request):
    """
    Obtenir llista d'IDs de TMDB que tenen mappeig BBC.
    Endpoint lleuger per saber ràpidament si un contingut té BBC.
    """
    require_auth(request)

    from backend.debrid.bbc_mapping import get_bbc_mapped_ids

    ids = get_bbc_mapped_ids()

    return {
        "status": "success",
        "tv": ids.get("tv", []),
        "movie": ids.get("movie", [])
    }


@app.delete("/api/bbc/content/{tmdb_id}")
async def delete_bbc_content_mapping(
    request: Request,
    tmdb_id: int,
    content_type: str = Query("tv", description="Tipus: 'tv' o 'movie'")
):
    """
    Eliminar el mappeig BBC per un contingut.
    """
    require_auth(request)

    from backend.debrid.bbc_mapping import delete_bbc_mapping

    if delete_bbc_mapping(tmdb_id, content_type):
        return {
            "status": "success",
            "message": f"Mappeig eliminat per TMDB {tmdb_id}"
        }
    else:
        raise HTTPException(
            status_code=404,
            detail=f"No hi ha mappeig BBC per TMDB {tmdb_id}"
        )


@app.post("/api/bbc/discover")
async def discover_bbc_series(
    request: Request,
    url: str = Query(..., description="URL de la sèrie a BBC iPlayer")
):
    """
    Descobrir informació d'una sèrie de BBC iPlayer.
    Retorna tots els episodis disponibles sense importar-los.

    Útil per veure què hi ha disponible abans d'importar.
    """
    require_auth(request)

    from backend.debrid import BBCiPlayerClient

    client = BBCiPlayerClient()

    try:
        episodes = await client.get_all_episodes_from_series(url)

        if not episodes:
            raise HTTPException(
                status_code=404,
                detail="No s'han trobat episodis a la URL"
            )

        # Agrupar per temporada si és possible
        by_season = {}
        for ep in episodes:
            season = ep.get("season_number") or "unknown"
            if season not in by_season:
                by_season[season] = []
            by_season[season].append(ep)

        return {
            "status": "success",
            "url": url,
            "total_episodes": len(episodes),
            "seasons": {
                str(k): {
                    "episode_count": len(v),
                    "episodes": v
                }
                for k, v in sorted(by_season.items(), key=lambda x: str(x[0]))
            },
            "all_episodes": episodes
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error descobrint sèrie BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bbc/subtitles")
async def proxy_bbc_subtitles(
    request: Request,
    url: str = Query(..., description="URL dels subtítols")
):
    """
    Proxy per subtítols de BBC iPlayer.
    Converteix TTML a VTT si és necessari.
    """
    require_auth(request)

    import re
    import httpx

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            content = response.text

        # Detectar format
        is_ttml = '<tt ' in content or '<tt>' in content or 'xmlns="http://www.w3.org/ns/ttml"' in content

        if is_ttml:
            # Convertir TTML a VTT
            vtt_content = convert_ttml_to_vtt(content)
        elif content.strip().startswith('WEBVTT'):
            # Ja és VTT
            vtt_content = content
        else:
            # Format desconegut, intentar retornar-lo com a VTT
            vtt_content = "WEBVTT\n\n" + content

        from fastapi.responses import Response
        return Response(
            content=vtt_content,
            media_type="text/vtt",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600"
            }
        )

    except httpx.HTTPError as e:
        logger.error(f"Error obtenint subtítols: {e}")
        raise HTTPException(status_code=502, detail="No s'han pogut obtenir els subtítols")
    except Exception as e:
        logger.error(f"Error processant subtítols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def convert_ttml_to_vtt(ttml_content: str) -> str:
    """
    Converteix TTML (Timed Text Markup Language) a WebVTT.
    BBC iPlayer utilitza TTML per als subtítols.
    """
    import re
    from xml.etree import ElementTree as ET

    try:
        # Parse TTML XML
        root = ET.fromstring(ttml_content)

        # Trobar el namespace
        ns = {'tt': 'http://www.w3.org/ns/ttml'}

        # Buscar tots els elements <p> (paràgrafs amb text)
        # El namespace pot variar, així que busquem amb i sense
        paragraphs = root.findall('.//{http://www.w3.org/ns/ttml}p')
        if not paragraphs:
            paragraphs = root.findall('.//p')

        vtt_lines = ["WEBVTT", ""]

        for i, p in enumerate(paragraphs, 1):
            begin = p.get('begin', '')
            end = p.get('end', '')

            # Convertir format de temps (pot ser "00:00:01.000" o "1s")
            begin_vtt = convert_ttml_time(begin)
            end_vtt = convert_ttml_time(end)

            if not begin_vtt or not end_vtt:
                continue

            # Obtenir text (pot tenir spans o altres elements)
            text = get_element_text(p)
            if not text.strip():
                continue

            vtt_lines.append(str(i))
            vtt_lines.append(f"{begin_vtt} --> {end_vtt}")
            vtt_lines.append(text)
            vtt_lines.append("")

        return "\n".join(vtt_lines)

    except ET.ParseError as e:
        logger.error(f"Error parsejant TTML: {e}")
        # Fallback: regex simple
        return convert_ttml_to_vtt_regex(ttml_content)


def convert_ttml_time(time_str: str) -> str:
    """Converteix format de temps TTML a VTT (HH:MM:SS.mmm)"""
    import re

    if not time_str:
        return ""

    # Format ja correcte (00:00:01.000)
    if re.match(r'\d{2}:\d{2}:\d{2}\.\d{3}', time_str):
        return time_str

    # Format HH:MM:SS (afegir mil·lisegons)
    if re.match(r'\d{2}:\d{2}:\d{2}$', time_str):
        return time_str + ".000"

    # Format amb ticks (10000000t = 1 segon)
    tick_match = re.match(r'(\d+)t', time_str)
    if tick_match:
        ticks = int(tick_match.group(1))
        seconds = ticks / 10000000
        return format_vtt_time(seconds)

    # Format amb segons (1.5s)
    sec_match = re.match(r'([\d.]+)s', time_str)
    if sec_match:
        seconds = float(sec_match.group(1))
        return format_vtt_time(seconds)

    return time_str


def format_vtt_time(seconds: float) -> str:
    """Formata segons a VTT (HH:MM:SS.mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def get_element_text(element) -> str:
    """Obtenir tot el text d'un element XML, incloent fills"""
    text = element.text or ""
    for child in element:
        # Si és un <br/>, afegir salt de línia
        if child.tag.endswith('br') or child.tag == 'br':
            text += "\n"
        else:
            text += get_element_text(child)
        if child.tail:
            text += child.tail
    return text


def convert_ttml_to_vtt_regex(ttml_content: str) -> str:
    """Fallback: convertir TTML a VTT usant regex"""
    import re

    vtt_lines = ["WEBVTT", ""]

    # Buscar patrons <p begin="..." end="...">text</p>
    pattern = r'<p[^>]*begin="([^"]*)"[^>]*end="([^"]*)"[^>]*>(.*?)</p>'
    matches = re.findall(pattern, ttml_content, re.DOTALL)

    for i, (begin, end, text) in enumerate(matches, 1):
        begin_vtt = convert_ttml_time(begin)
        end_vtt = convert_ttml_time(end)

        # Netejar HTML del text
        clean_text = re.sub(r'<[^>]+>', '', text)
        clean_text = clean_text.strip()

        if not clean_text:
            continue

        vtt_lines.append(str(i))
        vtt_lines.append(f"{begin_vtt} --> {end_vtt}")
        vtt_lines.append(clean_text)
        vtt_lines.append("")

    return "\n".join(vtt_lines)


# ==================== BBC CATALOG SCAN & IMPORT ====================

@app.post("/api/bbc/catalog/scan")
async def scan_bbc_catalog(request: Request):
    """
    Escaneja el catàleg complet de BBC iPlayer.
    Retorna totes les pel·lícules i sèries disponibles.

    ATENCIÓ: Aquesta operació pot trigar uns minuts.
    """
    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    from backend.debrid.bbc_catalog import BBCCatalogScanner

    scanner = BBCCatalogScanner()

    try:
        result = await scanner.scan_full_catalog()
        return result
    except Exception as e:
        logger.error(f"Error escanejant catàleg BBC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/bbc/catalog/match")
async def match_bbc_catalog_with_tmdb(
    request: Request,
    programs: List[Dict] = None
):
    """
    Fa matching del catàleg de BBC amb TMDB.

    Si no es proporciona 'programs', primer escaneja el catàleg.
    """
    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    from backend.debrid.bbc_catalog import BBCCatalogScanner, BBCTMDBMatcher, BBCProgram

    # Obtenir TMDB API key
    tmdb_key = get_tmdb_api_key()

    if not tmdb_key:
        raise HTTPException(
            status_code=400,
            detail="TMDB API key no configurada"
        )

    try:
        # Si no tenim programes, escanejar primer
        if not programs:
            scanner = BBCCatalogScanner()
            catalog = await scanner.scan_full_catalog()

            # Convertir a objectes BBCProgram
            all_programs = []
            for film in catalog.get("films", []):
                all_programs.append(BBCProgram(
                    programme_id=film["programme_id"],
                    title=film["title"],
                    url=film["url"],
                    is_film=True,
                    is_series=False,
                    synopsis=film.get("synopsis"),
                    thumbnail=film.get("thumbnail")
                ))
            for series in catalog.get("series", []):
                all_programs.append(BBCProgram(
                    programme_id=series["programme_id"],
                    title=series["title"],
                    url=series["url"],
                    is_film=False,
                    is_series=True,
                    synopsis=series.get("synopsis"),
                    thumbnail=series.get("thumbnail"),
                    episodes_url=series.get("episodes_url")
                ))
        else:
            all_programs = [
                BBCProgram(
                    programme_id=p["programme_id"],
                    title=p["title"],
                    url=p["url"],
                    is_film=p.get("is_film", False),
                    is_series=p.get("is_series", True)
                )
                for p in programs
            ]

        # Fer matching
        matcher = BBCTMDBMatcher(tmdb_key)
        result = await matcher.match_all_programs(all_programs)

        return result

    except Exception as e:
        logger.error(f"Error fent matching BBC-TMDB: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/bbc/catalog/import-all")
async def import_all_bbc_to_mapping(
    request: Request,
    scan_first: bool = Query(True, description="Escanejar catàleg primer"),
    min_confidence: float = Query(60.0, description="Confiança mínima per importar (0-100)")
):
    """
    Importa TOT el catàleg de BBC iPlayer al sistema de mapping.

    Procés:
    1. Escaneja el catàleg de BBC iPlayer (si scan_first=True)
    2. Fa matching amb TMDB per cada programa (si scan_first=True)
    3. Per sèries: obté tots els episodis i els mapa
    4. Guarda tot al sistema de mapping

    Si scan_first=False, espera rebre els programes ja matched al body.

    ATENCIÓ: Aquesta operació pot trigar bastant (10-30 minuts).
    """
    admin = require_auth(request)
    if not admin.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")

    from backend.debrid.bbc_catalog import BBCCatalogScanner, BBCTMDBMatcher, BBCProgram
    from backend.debrid.bbc_mapping import (
        import_bbc_episodes_with_metadata,
        set_bbc_mapping_for_content,
        get_content_key,
        load_bbc_mapping,
        save_bbc_mapping,
        _BBC_MAPPING_CACHE
    )
    from backend.debrid import BBCiPlayerClient

    # Obtenir TMDB API key
    tmdb_key = get_tmdb_api_key()

    if not tmdb_key:
        raise HTTPException(
            status_code=400,
            detail="TMDB API key no configurada"
        )

    results = {
        "status": "success",
        "scanned_programs": 0,
        "matched_programs": 0,
        "imported_films": 0,
        "imported_series": 0,
        "imported_episodes": 0,
        "failed": [],
        "skipped_low_confidence": []
    }

    try:
        matched = []

        if scan_first:
            # Pas 1: Escanejar catàleg
            logger.info("Pas 1: Escanejant catàleg de BBC iPlayer...")
            scanner = BBCCatalogScanner()
            catalog = await scanner.scan_full_catalog()

            all_programs = []
            for film in catalog.get("films", []):
                all_programs.append(BBCProgram(
                    programme_id=film["programme_id"],
                    title=film["title"],
                    url=film["url"],
                    is_film=True,
                    is_series=False,
                    synopsis=film.get("synopsis"),
                    thumbnail=film.get("thumbnail")
                ))
            for series in catalog.get("series", []):
                all_programs.append(BBCProgram(
                    programme_id=series["programme_id"],
                    title=series["title"],
                    url=series["url"],
                    is_film=False,
                    is_series=True,
                    synopsis=series.get("synopsis"),
                    thumbnail=series.get("thumbnail"),
                    episodes_url=series.get("episodes_url") or series["url"]
                ))

            results["scanned_programs"] = len(all_programs)
            logger.info(f"Trobats {len(all_programs)} programes")

            # Pas 2: Matching amb TMDB
            logger.info("Pas 2: Fent matching amb TMDB...")
            matcher = BBCTMDBMatcher(tmdb_key)
            match_result = await matcher.match_all_programs(all_programs, min_confidence=min_confidence)

            matched = match_result.get("matched", [])
            results["matched_programs"] = len(matched)
            results["skipped_low_confidence"] = [
                {"title": p["bbc_title"], "confidence": p.get("confidence", 0)}
                for p in match_result.get("low_confidence", [])
            ]

            logger.info(f"Matched {len(matched)} programes amb TMDB")
        else:
            # Programes ja matchejats enviats des del frontend
            try:
                body = await request.json()
                matched = body.get("programs", [])
                results["matched_programs"] = len(matched)
                logger.info(f"Rebuts {len(matched)} programes ja matchejats")
            except Exception as e:
                logger.error(f"Error llegint body: {e}")
                raise HTTPException(status_code=400, detail="Cal enviar programes al body amb scan_first=False")

        # Pas 3: Importar al mapping
        logger.info("Pas 3: Important al sistema de mapping...")
        bbc_client = BBCiPlayerClient()

        for item in matched:
            try:
                tmdb_id = item["tmdb_id"]
                content_type = item["content_type"]
                bbc_url = item["bbc_url"]
                bbc_title = item["bbc_title"]

                if item["is_film"]:
                    # Pel·lícula: importar directament
                    set_bbc_mapping_for_content(
                        tmdb_id=tmdb_id,
                        content_type="movie",
                        bbc_series_id=item["bbc_programme_id"],
                        title=bbc_title,
                        episodes={1: item["bbc_programme_id"]}  # Les pel·lícules són "episodi 1"
                    )
                    results["imported_films"] += 1
                    logger.debug(f"Importada pel·lícula: {bbc_title}")

                else:
                    # Sèrie: obtenir episodis i importar
                    episodes_url = bbc_url
                    if "/episode/" in episodes_url:
                        # Convertir URL d'episodi a URL de sèrie
                        episodes_url = episodes_url.replace("/episode/", "/episodes/")

                    try:
                        episodes = await bbc_client.get_all_episodes_from_series(episodes_url)

                        if episodes:
                            count = import_bbc_episodes_with_metadata(
                                tmdb_id=tmdb_id,
                                content_type="tv",
                                episodes=episodes,
                                bbc_series_id=item["bbc_programme_id"],
                                title=bbc_title
                            )
                            results["imported_series"] += 1
                            results["imported_episodes"] += count
                            logger.debug(f"Importada sèrie: {bbc_title} ({count} episodis)")
                        else:
                            # No hem pogut obtenir episodis, guardar com a sèrie sense episodis
                            set_bbc_mapping_for_content(
                                tmdb_id=tmdb_id,
                                content_type="tv",
                                bbc_series_id=item["bbc_programme_id"],
                                title=bbc_title
                            )
                            results["imported_series"] += 1

                    except Exception as ep_err:
                        logger.warning(f"Error obtenint episodis de {bbc_title}: {ep_err}")
                        results["failed"].append({
                            "title": bbc_title,
                            "error": f"Error episodis: {str(ep_err)}"
                        })

                # Rate limiting
                await asyncio.sleep(0.3)

            except Exception as imp_err:
                logger.error(f"Error importat {item.get('bbc_title', 'unknown')}: {imp_err}")
                results["failed"].append({
                    "title": item.get("bbc_title", "unknown"),
                    "error": str(imp_err)
                })

        # Guardar mapping
        save_bbc_mapping()

        logger.info(f"Importació completa: {results['imported_films']} pel·lícules, {results['imported_series']} sèries, {results['imported_episodes']} episodis")

        return results

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en importació massiva BBC: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bbc/catalog/status")
async def get_bbc_catalog_status(request: Request):
    """
    Mostra l'estat actual del mapping BBC.
    Quants programes estan importats, etc.
    """
    require_auth(request)

    from backend.debrid.bbc_mapping import load_bbc_mapping

    mapping = load_bbc_mapping()

    films = []
    series = []

    for key, data in mapping.items():
        tmdb_id, content_type = key.split(":")
        item = {
            "tmdb_id": int(tmdb_id),
            "title": data.get("title", "Unknown"),
            "bbc_series_id": data.get("bbc_series_id"),
            "episode_count": len(data.get("episodes", {})),
            "season_count": len(data.get("seasons", {}))
        }

        if content_type == "movie":
            films.append(item)
        else:
            series.append(item)

    return {
        "status": "success",
        "total_mapped": len(mapping),
        "films_count": len(films),
        "series_count": len(series),
        "total_episodes": sum(s["episode_count"] for s in series),
        "films": films,
        "series": series
    }


# ==================== SUBTITLES API ====================

# Client de subtítols compartit (cache)
_subtitle_client = None

def get_subtitle_client():
    """Obtenir el client de subtítols"""
    global _subtitle_client
    if _subtitle_client is None:
        from backend.debrid.opensubtitles import SubtitleClient
        _subtitle_client = SubtitleClient()
    return _subtitle_client


@app.get("/api/subtitles/status")
async def get_subtitles_status():
    """Comprovar si els subtítols estan configurats"""
    return {
        "configured": True,
        "service": "Subdl"
    }


@app.get("/api/subtitles/search/{media_type}/{tmdb_id}")
async def search_subtitles(
    media_type: str,
    tmdb_id: int,
    season: Optional[int] = Query(None),
    episode: Optional[int] = Query(None),
    languages: Optional[str] = Query("ca,es,en", description="Codis d'idioma separats per comes")
):
    """
    Cercar subtítols per una pel·lícula o episodi

    Args:
        media_type: "movie" o "tv"
        tmdb_id: ID de TMDB
        season: Número de temporada (per sèries)
        episode: Número d'episodi (per sèries)
        languages: Idiomes a buscar (per defecte: ca,es,en)
    """
    client = get_subtitle_client()

    # Obtenir l'IMDB ID des del TMDB
    imdb_id = None
    try:
        tmdb_api_key = os.getenv("TMDB_API_KEY", "")
        if tmdb_api_key:
            async with httpx.AsyncClient() as http_client:
                if media_type == "movie":
                    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}/external_ids"
                else:
                    url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/external_ids"

                response = await http_client.get(url, params={"api_key": tmdb_api_key})
                if response.status_code == 200:
                    data = response.json()
                    imdb_id = data.get("imdb_id")
    except Exception as e:
        logger.warning(f"No s'ha pogut obtenir IMDB ID: {e}")

    # Parsejar idiomes
    lang_list = [l.strip() for l in languages.split(",") if l.strip()]

    try:
        subtitles = await client.search_subtitles(
            imdb_id=imdb_id,
            tmdb_id=tmdb_id if not imdb_id else None,
            season=season if media_type == "tv" else None,
            episode=episode if media_type == "tv" else None,
            languages=lang_list
        )

        return {
            "subtitles": [s.to_dict() for s in subtitles[:20]],
            "total": len(subtitles)
        }

    except Exception as e:
        logger.error(f"Error cercant subtítols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/subtitles/download/{file_id}")
async def download_subtitle(file_id: str):
    """
    Descarregar un subtítol en format VTT

    Args:
        file_id: ID del subtítol (format: source_id, e.g., subdl_12345)

    Returns:
        Contingut del subtítol en format VTT
    """
    client = get_subtitle_client()

    try:
        content = await client.download_subtitle(file_id)
        if not content:
            raise HTTPException(status_code=404, detail="No s'ha pogut descarregar el subtítol")

        return Response(
            content=content,
            media_type="text/vtt",
            headers={
                "Content-Disposition": f'attachment; filename="subtitle_{file_id}.vtt"',
                "Access-Control-Allow-Origin": "*"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error descarregant subtítol: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True
    )
