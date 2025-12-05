"""
Hermes Media Server - Database Service
Centralizes database connection and operations
"""

import sqlite3
import logging
from contextlib import contextmanager
from typing import Dict, Any
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logger = logging.getLogger(__name__)


@contextmanager
def get_db():
    """Context manager for database connections"""
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
    """Initialize all required database tables"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Table: media_segments
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

        # Migration: add series_id column if not exists
        _safe_add_column(cursor, "media_segments", "series_id", "INTEGER")

        # Table: authors (books)
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
        _safe_add_column(cursor, "authors", "path", "TEXT")
        _safe_add_column(cursor, "authors", "photo", "TEXT")

        # Table: audiobook_authors
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
        _safe_add_column(cursor, "audiobook_authors", "path", "TEXT")
        _safe_add_column(cursor, "audiobook_authors", "photo", "TEXT")

        # Migrations for series table
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
        ]
        for col_name, col_type in series_columns:
            _safe_add_column(cursor, "series", col_name, col_type)

        # Table: books
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

        books_columns = [
            ("file_hash", "TEXT"),
            ("format", "TEXT"),
            ("cover", "TEXT"),
            ("file_size", "INTEGER"),
            ("converted_path", "TEXT"),
            ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
            ("is_imported", "INTEGER DEFAULT 0"),
            ("source_type", "TEXT"),
            ("external_url", "TEXT"),
            ("olid", "TEXT"),
            ("content_type", "TEXT DEFAULT 'book'"),
        ]
        for col_name, col_type in books_columns:
            _safe_add_column(cursor, "books", col_name, col_type)

        # Table: audiobooks
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

        audiobooks_columns = [
            ("cover", "TEXT"),
            ("total_duration", "INTEGER DEFAULT 0"),
            ("total_files", "INTEGER DEFAULT 0"),
            ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ]
        for col_name, col_type in audiobooks_columns:
            _safe_add_column(cursor, "audiobooks", col_name, col_type)

        # Table: audiobook_files
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

        # Table: reading_progress
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

        # Table: audiobook_progress
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

        # Table: streaming_progress
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

        _safe_add_column(cursor, "streaming_progress", "still_path", "TEXT")
        _safe_add_column(cursor, "streaming_progress", "progress_seconds", "INTEGER")
        _safe_add_column(cursor, "streaming_progress", "total_seconds", "INTEGER")

        # Clean up duplicate movie entries
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
            logger.debug(f"Migration cleanup duplicates: {e}")

        # Convert NULL to 0 for movies (for UNIQUE constraint)
        try:
            cursor.execute("""
                UPDATE streaming_progress
                SET season_number = 0, episode_number = 0
                WHERE media_type = 'movie'
                AND (season_number IS NULL OR episode_number IS NULL)
            """)
            conn.commit()
        except Exception as e:
            logger.debug(f"Migration NULL to 0: {e}")

        # Table: watchlist
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

        # Create index for watch_progress
        try:
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_progress_user_media
                ON watch_progress(user_id, media_id)
            """)
        except Exception:
            pass

        # Table: settings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        conn.commit()
        logger.info("All database tables initialized successfully")


def _safe_add_column(cursor, table: str, column: str, column_type: str):
    """Safely add a column to a table (ignores if already exists)"""
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
    except sqlite3.OperationalError as e:
        if "duplicate column" not in str(e).lower():
            logger.debug(f"Column {column} already exists in {table}")
