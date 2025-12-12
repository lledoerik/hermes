"""
Hermes Media Server - Database Service
Connection pooling i gestió centralitzada de base de dades
"""

import sqlite3
import logging
import threading
import queue
import time
from contextlib import contextmanager
from typing import Dict, Any, Optional
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logger = logging.getLogger(__name__)


# === CONNECTION POOL PER SQLITE ===

class SQLiteConnectionPool:
    """
    Connection pool thread-safe per SQLite amb WAL mode.
    Soluciona problemes de concurrència i millora el rendiment.
    """

    def __init__(self, database_path: str, pool_size: int = 10, timeout: float = 30.0):
        self.database_path = database_path
        self.pool_size = pool_size
        self.timeout = timeout
        self._pool = queue.Queue(maxsize=pool_size)
        self._lock = threading.Lock()
        self._all_connections = []
        self._initialized = False

    def _create_connection(self) -> sqlite3.Connection:
        """Crea una nova connexió amb configuració optimitzada."""
        conn = sqlite3.connect(
            self.database_path,
            check_same_thread=False,
            timeout=self.timeout,
            isolation_level=None  # Autocommit mode per millor concurrència
        )
        conn.row_factory = sqlite3.Row

        # Configuració optimitzada per WAL mode
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")  # Més ràpid que FULL, segur amb WAL
        conn.execute("PRAGMA busy_timeout=30000")  # 30 segons
        conn.execute("PRAGMA cache_size=-64000")  # 64MB de cache
        conn.execute("PRAGMA temp_store=MEMORY")  # Temporals en memòria
        conn.execute("PRAGMA mmap_size=268435456")  # 256MB memory-mapped I/O

        return conn

    def initialize(self):
        """Inicialitza el pool de connexions."""
        with self._lock:
            if self._initialized:
                return

            logger.info(f"Inicialitzant connection pool SQLite (pool_size={self.pool_size})")

            for _ in range(self.pool_size):
                conn = self._create_connection()
                self._all_connections.append(conn)
                self._pool.put(conn)

            self._initialized = True
            logger.info(f"Connection pool SQLite inicialitzat correctament")

    def get_connection(self, timeout: Optional[float] = None) -> sqlite3.Connection:
        """Obté una connexió del pool."""
        if not self._initialized:
            self.initialize()

        try:
            timeout = timeout or self.timeout
            conn = self._pool.get(timeout=timeout)
            return conn
        except queue.Empty:
            raise TimeoutError(f"No s'ha pogut obtenir connexió del pool en {timeout}s")

    def return_connection(self, conn: sqlite3.Connection):
        """Retorna una connexió al pool."""
        if conn in self._all_connections:
            self._pool.put(conn)

    def close_all(self):
        """Tanca totes les connexions."""
        with self._lock:
            if not self._initialized:
                return

            logger.info("Tancant connection pool SQLite...")

            # Tancar totes les connexions
            for conn in self._all_connections:
                try:
                    conn.close()
                except Exception as e:
                    logger.warning(f"Error tancant connexió: {e}")

            self._all_connections.clear()

            # Buidar el pool
            while not self._pool.empty():
                try:
                    self._pool.get_nowait()
                except queue.Empty:
                    break

            self._initialized = False
            logger.info("Connection pool SQLite tancat")

    @contextmanager
    def connection(self):
        """Context manager per obtenir i retornar connexions automàticament."""
        conn = self.get_connection()
        try:
            yield conn
        finally:
            self.return_connection(conn)

    def execute_with_retry(self, query: str, params: tuple = None, max_retries: int = 3):
        """Executa una query amb retry automàtic en cas de database locked."""
        last_error = None

        for attempt in range(max_retries):
            with self.connection() as conn:
                try:
                    cursor = conn.cursor()
                    if params:
                        cursor.execute(query, params)
                    else:
                        cursor.execute(query)
                    conn.commit()
                    return cursor
                except sqlite3.OperationalError as e:
                    last_error = e
                    if "database is locked" in str(e):
                        wait_time = 0.1 * (2 ** attempt)  # Exponential backoff
                        logger.warning(f"Database locked, retry {attempt + 1}/{max_retries} en {wait_time}s")
                        time.sleep(wait_time)
                        continue
                    raise

        raise last_error


# Pool global singleton
_db_pool: Optional[SQLiteConnectionPool] = None
_pool_lock = threading.Lock()


def get_db_pool() -> SQLiteConnectionPool:
    """Obté el pool de connexions global (singleton)."""
    global _db_pool

    if _db_pool is None:
        with _pool_lock:
            if _db_pool is None:  # Double-checked locking
                _db_pool = SQLiteConnectionPool(
                    database_path=str(settings.DATABASE_PATH),
                    pool_size=10,
                    timeout=30.0
                )
                _db_pool.initialize()

    return _db_pool


def close_db_pool():
    """Tanca el pool de connexions global."""
    global _db_pool

    if _db_pool is not None:
        _db_pool.close_all()
        _db_pool = None


@contextmanager
def get_db():
    """
    Context manager per connexions a la BD amb connection pooling.

    Ús:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM series")
    """
    pool = get_db_pool()
    with pool.connection() as conn:
        yield conn


# === SISTEMA DE MIGRACIONS ===

class MigrationManager:
    """Gestiona migracions de base de dades amb control de versions."""

    def __init__(self):
        self.migrations = []
        self._current_version = 0

    def _get_db_version(self, conn: sqlite3.Connection) -> int:
        """Obté la versió actual de l'esquema de la BD."""
        cursor = conn.cursor()

        # Crear taula de versions si no existeix
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("SELECT MAX(version) FROM schema_version")
        result = cursor.fetchone()
        return result[0] if result[0] is not None else 0

    def _set_db_version(self, conn: sqlite3.Connection, version: int):
        """Actualitza la versió de l'esquema."""
        cursor = conn.cursor()
        cursor.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))
        conn.commit()

    def register_migration(self, version: int, migration_func):
        """Registra una migració."""
        self.migrations.append((version, migration_func))
        self.migrations.sort(key=lambda x: x[0])  # Ordenar per versió

    def apply_migrations(self):
        """Aplica totes les migracions pendents."""
        with get_db() as conn:
            current_version = self._get_db_version(conn)
            logger.info(f"Versió actual de l'esquema: {current_version}")

            # Aplicar migracions pendents
            for version, migration_func in self.migrations:
                if version > current_version:
                    logger.info(f"Aplicant migració v{version}...")
                    try:
                        migration_func(conn)
                        self._set_db_version(conn, version)
                        logger.info(f"Migració v{version} aplicada correctament")
                    except Exception as e:
                        logger.error(f"Error aplicant migració v{version}: {e}")
                        raise


# Instància global del migration manager
migration_manager = MigrationManager()


def _safe_add_column(cursor, table: str, column: str, column_type: str):
    """Afegeix una columna de forma segura (ignora si ja existeix)."""
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
    except sqlite3.OperationalError as e:
        error_msg = str(e).lower()
        if "duplicate column" not in error_msg and "already exists" not in error_msg:
            raise  # Re-llançar si és un error diferent


# === MIGRACIONS ===

def migration_v1_initial_schema(conn: sqlite3.Connection):
    """Migració v1: Esquema inicial."""
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

    # Índexs per media_segments
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_segments_media ON media_segments(media_id)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_segments_series ON media_segments(series_id)
    """)

    # Taula authors (llibres)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS authors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT UNIQUE,
            photo_path TEXT,
            photo TEXT,
            bio TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Taula audiobook_authors
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audiobook_authors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT UNIQUE,
            photo_path TEXT,
            photo TEXT,
            bio TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Taula books
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author_id INTEGER,
            isbn TEXT,
            description TEXT,
            cover_path TEXT,
            cover TEXT,
            file_path TEXT NOT NULL,
            file_format TEXT,
            format TEXT,
            file_hash TEXT,
            file_size INTEGER,
            pages INTEGER,
            language TEXT,
            publisher TEXT,
            published_date TEXT,
            added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            converted_path TEXT,
            is_imported INTEGER DEFAULT 0,
            source_type TEXT,
            external_url TEXT,
            olid TEXT,
            content_type TEXT DEFAULT 'book',
            FOREIGN KEY (author_id) REFERENCES authors(id)
        )
    """)

    # Taula audiobooks
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audiobooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author_id INTEGER,
            narrator TEXT,
            isbn TEXT,
            description TEXT,
            cover_path TEXT,
            cover TEXT,
            folder_path TEXT NOT NULL,
            duration INTEGER,
            total_duration INTEGER DEFAULT 0,
            total_files INTEGER DEFAULT 0,
            language TEXT,
            publisher TEXT,
            published_date TEXT,
            added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_id) REFERENCES audiobook_authors(id)
        )
    """)

    # Taula audiobook_files
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

    # Taula reading_progress
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

    # Taula audiobook_progress
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

    # Taula streaming_progress
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS streaming_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT 1,
            tmdb_id INTEGER NOT NULL,
            media_type TEXT NOT NULL,
            season_number INTEGER,
            episode_number INTEGER,
            progress_percent REAL DEFAULT 0,
            progress_seconds INTEGER,
            total_seconds INTEGER,
            completed INTEGER DEFAULT 0,
            title TEXT,
            poster_path TEXT,
            backdrop_path TEXT,
            still_path TEXT,
            updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, tmdb_id, media_type, season_number, episode_number)
        )
    """)

    # Taula watchlist
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

    # Taula settings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # Índex per watch_progress
    try:
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_progress_user_media
            ON watch_progress(user_id, media_id)
        """)
    except Exception:
        pass

    conn.commit()


def migration_v2_series_columns(conn: sqlite3.Connection):
    """Migració v2: Columnes addicionals per series."""
    cursor = conn.cursor()

    series_columns = [
        ("tmdb_id", "INTEGER"),
        ("title", "TEXT"),
        ("year", "INTEGER"),
        ("overview", "TEXT"),
        ("rating", "REAL"),
        ("genres", "TEXT"),
        ("runtime", "INTEGER"),
        ("is_imported", "INTEGER DEFAULT 0"),
        ("source_type", "TEXT"),
        ("external_url", "TEXT"),
        ("content_type", "TEXT"),
        ("origin_country", "TEXT"),
        ("original_language", "TEXT"),
        ("tmdb_seasons", "INTEGER"),
        ("tmdb_episodes", "INTEGER"),
        ("release_date", "TEXT"),
        ("popularity", "REAL"),
        ("vote_count", "INTEGER"),
        ("anilist_id", "INTEGER"),
        ("mal_id", "INTEGER"),
        ("tvdb_id", "INTEGER"),
    ]

    for col_name, col_type in series_columns:
        _safe_add_column(cursor, "series", col_name, col_type)

    conn.commit()


def migration_v3_cleanup_duplicates(conn: sqlite3.Connection):
    """Migració v3: Neteja de duplicats a streaming_progress."""
    cursor = conn.cursor()

    # Netejar duplicats de pel·lícules
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

        # Convertir NULL a 0 per pel·lícules
        cursor.execute("""
            UPDATE streaming_progress
            SET season_number = 0, episode_number = 0
            WHERE media_type = 'movie'
            AND (season_number IS NULL OR episode_number IS NULL)
        """)

        conn.commit()
    except Exception as e:
        logger.warning(f"Migració v3 cleanup: {e}")


def migration_v4_add_indexes(conn: sqlite3.Connection):
    """Migració v4: Afegir índexs per millor rendiment."""
    cursor = conn.cursor()

    # Índexs per series (consultes freqüents per tmdb_id, content_type, media_type)
    indexes = [
        ("idx_series_tmdb_id", "CREATE INDEX IF NOT EXISTS idx_series_tmdb_id ON series(tmdb_id)"),
        ("idx_series_content_type", "CREATE INDEX IF NOT EXISTS idx_series_content_type ON series(content_type)"),
        ("idx_series_media_type", "CREATE INDEX IF NOT EXISTS idx_series_media_type ON series(media_type)"),
        ("idx_series_anilist_id", "CREATE INDEX IF NOT EXISTS idx_series_anilist_id ON series(anilist_id)"),

        # Índexs per media_files (consultes freqüents per series_id, season_number)
        ("idx_media_files_series", "CREATE INDEX IF NOT EXISTS idx_media_files_series ON media_files(series_id)"),
        ("idx_media_files_season", "CREATE INDEX IF NOT EXISTS idx_media_files_season ON media_files(series_id, season_number)"),

        # Índexs per watch_progress (consultes freqüents per user_id)
        ("idx_watch_progress_user", "CREATE INDEX IF NOT EXISTS idx_watch_progress_user ON watch_progress(user_id)"),

        # Índexs per streaming_progress (consultes freqüents per user_id, tmdb_id)
        ("idx_streaming_progress_user", "CREATE INDEX IF NOT EXISTS idx_streaming_progress_user ON streaming_progress(user_id)"),
        ("idx_streaming_progress_tmdb", "CREATE INDEX IF NOT EXISTS idx_streaming_progress_tmdb ON streaming_progress(user_id, tmdb_id)"),

        # Índexs per watchlist (consultes freqüents per user_id)
        ("idx_watchlist_user", "CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id)"),

        # Índexs per metadata_cache (consultes freqüents per cache_key)
        ("idx_metadata_cache_key", "CREATE INDEX IF NOT EXISTS idx_metadata_cache_key ON metadata_cache(cache_key)"),
        ("idx_metadata_cache_expires", "CREATE INDEX IF NOT EXISTS idx_metadata_cache_expires ON metadata_cache(expires_date)"),

        # Índexs per media_segments (consultes freqüents per media_id, series_id)
        ("idx_segments_media_id", "CREATE INDEX IF NOT EXISTS idx_segments_media_id ON media_segments(media_id)"),
        ("idx_segments_series_id", "CREATE INDEX IF NOT EXISTS idx_segments_series_id ON media_segments(series_id)"),

        # Índexs per books/audiobooks (consultes freqüents per author_id)
        ("idx_books_author", "CREATE INDEX IF NOT EXISTS idx_books_author ON books(author_id)"),
        ("idx_audiobooks_author", "CREATE INDEX IF NOT EXISTS idx_audiobooks_author ON audiobooks(author_id)"),
    ]

    created_count = 0
    for idx_name, idx_sql in indexes:
        try:
            cursor.execute(idx_sql)
            created_count += 1
        except Exception as e:
            logger.warning(f"Error creant índex {idx_name}: {e}")

    conn.commit()
    logger.info(f"Migració v4: {created_count} índexs creats/verificats")


# Registrar migracions
migration_manager.register_migration(1, migration_v1_initial_schema)
migration_manager.register_migration(2, migration_v2_series_columns)
migration_manager.register_migration(3, migration_v3_cleanup_duplicates)
migration_manager.register_migration(4, migration_v4_add_indexes)


def init_all_tables():
    """
    Inicialitza totes les taules i aplica migracions.
    Crida això una vegada a l'inici de l'aplicació.
    """
    logger.info("Inicialitzant base de dades...")

    # Assegurar que el pool està inicialitzat
    get_db_pool()

    # Aplicar migracions
    migration_manager.apply_migrations()

    logger.info("Base de dades inicialitzada correctament")
