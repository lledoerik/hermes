"""
Hermes Media Server - Pydantic Request Models
All API request models in one place
"""

from typing import Optional, List
from pydantic import BaseModel


# === SCANNING ===

class ScanRequest(BaseModel):
    libraries: Optional[List[str]] = None
    force: bool = False


# === STREAMING ===

class StreamRequest(BaseModel):
    audio_index: Optional[int] = None
    subtitle_index: Optional[int] = None
    quality: str = "1080p"


# === AUTHENTICATION ===

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


# === INVITATIONS ===

class InvitationRequest(BaseModel):
    max_uses: int = 1
    expires_days: int = 7


class RegisterWithInviteRequest(BaseModel):
    username: str
    password: str
    invitation_code: str
    email: Optional[str] = None
    display_name: Optional[str] = None


# === SEGMENTS ===

class SegmentRequest(BaseModel):
    segment_type: str  # 'intro', 'recap', 'outro', 'credits', 'preview'
    start_time: float
    end_time: float
    source: str = "manual"


class SeriesSegmentRequest(BaseModel):
    """Apply segments to entire series"""
    segment_type: str
    start_time: float
    end_time: float


# === PROGRESS ===

class WatchProgressRequest(BaseModel):
    """Save video/episode watch progress"""
    progress_seconds: float
    total_seconds: float


class StreamingProgressRequest(BaseModel):
    """Save external streaming watch progress"""
    tmdb_id: int
    media_type: str  # 'movie' or 'series'
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    progress_percent: float = 50.0
    progress_seconds: Optional[int] = None
    total_seconds: Optional[int] = None
    completed: bool = False
    title: Optional[str] = None
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    still_path: Optional[str] = None


# === WATCHLIST ===

class WatchlistRequest(BaseModel):
    """Add/remove content from watchlist"""
    tmdb_id: int
    media_type: str  # 'movie' or 'series'
    title: Optional[str] = None
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    year: Optional[int] = None
    rating: Optional[float] = None


# === METADATA ===

class TmdbUpdateRequest(BaseModel):
    tmdb_id: int
    media_type: str = "series"


class ExternalUrlRequest(BaseModel):
    external_url: Optional[str] = None
    external_source: Optional[str] = None


# === BOOKS ===

class BookSearchRequest(BaseModel):
    title: str
    author: Optional[str] = None


class BookMetadataRequest(BaseModel):
    olid: Optional[str] = None
    isbn: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    description: Optional[str] = None


# === AUDIOBOOKS ===

class AudiobookSearchRequest(BaseModel):
    title: str
    author: Optional[str] = None


class AudiobookProgressRequest(BaseModel):
    file_id: int
    position: int  # seconds
    percentage: float = 0


# === SETTINGS ===

class SettingRequest(BaseModel):
    value: str


# === DEBRID ===

class DebridStreamRequest(BaseModel):
    magnet: str
    file_idx: Optional[int] = None


class SubtitleDownloadRequest(BaseModel):
    subtitle_id: str
