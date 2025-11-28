"""
Configuració de Hermes Media Server
"""

import os
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

# === BIBLIOTECA DE LLIBRES ===
BOOKS_LIBRARIES = [
    {
        "name": "Llibres",
        "path": "D:\\Llibres\\Llibres",
        "type": "books"
    }
]

AUDIOBOOKS_LIBRARIES = [
    {
        "name": "Audiollibres",
        "path": "D:\\Llibres\\Audiollibres",
        "type": "audiobooks"
    }
]

# Formats de llibres suportats
BOOK_FORMATS = ['.epub', '.pdf', '.mobi', '.azw', '.azw3']
AUDIOBOOK_FORMATS = ['.mp3', '.m4a', '.m4b', '.ogg', '.flac']

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
# Clau secreta per JWT - USA VARIABLE D'ENTORN EN PRODUCCIÓ!
SECRET_KEY = os.environ.get("HERMES_SECRET_KEY", "dev-key-canvia-en-produccio")

# === ADMIN PER DEFECTE ===
# Aquestes credencials es creen automàticament si no existeix cap admin
# USA VARIABLES D'ENTORN EN PRODUCCIÓ!
DEFAULT_ADMIN_USERNAME = os.environ.get("HERMES_ADMIN_USER", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("HERMES_ADMIN_PASSWORD", "hermes2024")
DEFAULT_ADMIN_EMAIL = os.environ.get("HERMES_ADMIN_EMAIL", "admin@hermes.local")
