"""
Configuració de Hermes Media Server
"""

from pathlib import Path

# === PATHS ===
BASE_DIR = Path(__file__).parent.parent
DATABASE_PATH = BASE_DIR / "storage" / "hermes.db"
CACHE_DIR = BASE_DIR / "storage" / "cache"
METADATA_DIR = BASE_DIR / "storage" / "metadata"

# === BIBLIOTECA ===
# IMPORTANT: Modifica aquestes rutes amb les teves!
MEDIA_LIBRARIES = [
    {
        "name": "Anime",
        "path": "D:\\Anime",
        "type": "series"
    },
        {
        "name": "Anime",
        "path": "E:\\Anime",
        "type": "series"
    },
    {
        "name": "Anime Movies",
        "path": "D:\\Anime Movies", 
        "type": "movies"
    },
    {
        "name": "Pel·lícules",
        "path": "D:\\Pel·lícules",
        "type": "movies"
    },
    {
        "name": "Sèries",
        "path": "D:\\Sèries",
        "type": "series"
    },
    {
        "name": "Sèries Animades",
        "path": "E:\\Sèries Animades",
        "type": "series"
    }
]

# === API ===
API_HOST = "0.0.0.0"
API_PORT = 8000
API_PREFIX = "/api"

# === CORS ===
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8000",
    "https://hermes.cat",
    "http://hermes.cat",
    "*"  # Per desenvolupament
]

# === STREAMING ===
TRANSCODE_SETTINGS = {
    "default_video_codec": "h264",
    "default_audio_codec": "aac",
    "default_quality": "1080p",
    "hardware_acceleration": "auto",
    "max_concurrent_transcodes": 2
}

# === SEGURETAT ===
SECRET_KEY = "canvia-aixo-per-una-clau-segura"
