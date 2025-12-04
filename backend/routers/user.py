"""
Hermes Media Server - User Router
Handles user-related endpoints: watchlist, progress, continue watching
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Query

from backend.services.database import get_db
from backend.models.requests import (
    WatchProgressRequest,
    StreamingProgressRequest,
    WatchlistRequest,
)
from backend.routers.auth import get_current_user, require_auth

router = APIRouter(prefix="/api/user", tags=["User"])


@router.get("/continue-watching")
async def get_continue_watching(request: Request):
    """Get content the user is currently watching (to continue)"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    watching = []

    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Get local content in progress (not finished) - series and movies
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

            media_type = row["media_type"] if row["media_type"] else "series"
            item_type = "movie" if media_type == "movie" else "episode"

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

        # 2. Get streaming content in progress (not finished)
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

        seen_movies = set()
        seen_series = set()

        for row in cursor.fetchall():
            tmdb_id = row["tmdb_id"]
            media_type = row["media_type"]

            if media_type == "movie":
                if tmdb_id in seen_movies:
                    continue
                seen_movies.add(tmdb_id)
                item_type = "movie"
            else:
                if tmdb_id in seen_series:
                    continue
                seen_series.add(tmdb_id)
                item_type = "series"

            progress_secs = row["progress_seconds"]
            total_secs = row["total_seconds"]
            if progress_secs is None or total_secs is None:
                total_secs = 6000
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

        watching.sort(key=lambda x: x.get("last_watched", ""), reverse=True)
        return watching[:20]


@router.get("/recently-watched")
async def get_recently_watched(request: Request, limit: int = 10):
    """Get recently watched content"""
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

@router.get("/watchlist")
async def get_watchlist(request: Request):
    """Get user's watchlist"""
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


@router.post("/watchlist")
async def add_to_watchlist(data: WatchlistRequest, request: Request):
    """Add item to watchlist"""
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


@router.delete("/watchlist/{tmdb_id}")
async def remove_from_watchlist(tmdb_id: int, media_type: str, request: Request):
    """Remove item from watchlist"""
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


@router.get("/watchlist/check/{tmdb_id}")
async def check_in_watchlist(tmdb_id: int, media_type: str, request: Request):
    """Check if item is in watchlist"""
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


# === PROGRESS ENDPOINTS (media-related, but user-specific) ===

media_router = APIRouter(prefix="/api/media", tags=["Media Progress"])


@media_router.post("/{media_id}/progress")
async def save_watch_progress(media_id: int, data: WatchProgressRequest, request: Request):
    """Save watch progress for a video/episode"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM media_files WHERE id = ?", (media_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Media no trobat")

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


@media_router.get("/{media_id}/progress")
async def get_watch_progress(media_id: int, request: Request):
    """Get watch progress for a video/episode"""
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


# === STREAMING PROGRESS ===

streaming_router = APIRouter(prefix="/api/streaming", tags=["Streaming Progress"])


@streaming_router.post("/progress")
async def save_streaming_progress(data: StreamingProgressRequest, request: Request):
    """Save watch progress for external streaming (via TMDB ID)"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    with get_db() as conn:
        cursor = conn.cursor()

        season = data.season_number if data.media_type == "series" else 0
        episode = data.episode_number if data.media_type == "series" else 0

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


@streaming_router.get("/progress")
async def get_streaming_progress(
    request: Request,
    tmdb_id: int = Query(...),
    media_type: str = Query(...),
    season: Optional[int] = Query(None),
    episode: Optional[int] = Query(None)
):
    """Get watch progress for external streaming"""
    user = get_current_user(request)
    user_id = user["id"] if user else 1

    with get_db() as conn:
        cursor = conn.cursor()

        if media_type == "movie":
            season = None
            episode = None

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
