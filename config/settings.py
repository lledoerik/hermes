"""
Configuració de Hermes Media Server
"""

import os
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# === PATHS ===
BASE_DIR = Path(__file__).parent.parent
DATABASE_PATH = BASE_DIR / "storage" / "hermes.db"
CACHE_DIR = BASE_DIR / "storage" / "cache"
METADATA_DIR = BASE_DIR / "storage" / "metadata"

# === ENTORN ===
# Detectar si estem en mode producció
PRODUCTION = os.environ.get("HERMES_PRODUCTION", "false").lower() in ("true", "1", "yes")

# === BIBLIOTECA ===
# Les biblioteques es poden configurar via variable d'entorn HERMES_MEDIA_LIBRARIES (JSON)
# o utilitzant els valors per defecte
def _load_libraries_from_env(env_var: str, default: list) -> list:
    """Carrega biblioteques des de variable d'entorn o usa valors per defecte"""
    env_value = os.environ.get(env_var)
    if env_value:
        try:
            return json.loads(env_value)
        except json.JSONDecodeError:
            logger.warning(f"Error parsing {env_var}, using defaults")
    return default

# Valors per defecte (modifica segons el teu sistema)
_DEFAULT_MEDIA_LIBRARIES = [
    {
        "name": "Anime",
        "path": "/media/anime",
        "type": "series"
    },
    {
        "name": "Pel·lícules",
        "path": "/media/movies",
        "type": "movies"
    },
    {
        "name": "Sèries",
        "path": "/media/series",
        "type": "series"
    }
]

_DEFAULT_BOOKS_LIBRARIES = [
    {
        "name": "Llibres",
        "path": "/media/books",
        "type": "books"
    }
]

_DEFAULT_AUDIOBOOKS_LIBRARIES = [
    {
        "name": "Audiollibres",
        "path": "/media/audiobooks",
        "type": "audiobooks"
    }
]

# Carregar biblioteques (amb suport per variable d'entorn)
MEDIA_LIBRARIES = _load_libraries_from_env("HERMES_MEDIA_LIBRARIES", _DEFAULT_MEDIA_LIBRARIES)
BOOKS_LIBRARIES = _load_libraries_from_env("HERMES_BOOKS_LIBRARIES", _DEFAULT_BOOKS_LIBRARIES)
AUDIOBOOKS_LIBRARIES = _load_libraries_from_env("HERMES_AUDIOBOOKS_LIBRARIES", _DEFAULT_AUDIOBOOKS_LIBRARIES)

# Formats de llibres suportats
BOOK_FORMATS = ['.epub', '.pdf', '.mobi', '.azw', '.azw3']
AUDIOBOOK_FORMATS = ['.mp3', '.m4a', '.m4b', '.ogg', '.flac']

# === API ===
API_HOST = os.environ.get("HERMES_API_HOST", "0.0.0.0")
API_PORT = int(os.environ.get("HERMES_API_PORT", "8000"))
API_PREFIX = "/api"

# === CORS ===
# En producció, NO s'inclou "*" - només orígens explícits
# Configura HERMES_CORS_ORIGINS amb una llista separada per comes
_default_cors = "http://localhost:3000,http://localhost:8000,https://hermes.cat,http://hermes.cat"
_cors_env = os.environ.get("HERMES_CORS_ORIGINS", _default_cors)
CORS_ORIGINS = [origin.strip() for origin in _cors_env.split(",") if origin.strip()]

# Afegir wildcard NOMÉS en mode desenvolupament (NO producció)
if not PRODUCTION and os.environ.get("HERMES_CORS_ALLOW_ALL", "false").lower() in ("true", "1", "yes"):
    CORS_ORIGINS.append("*")
    logger.warning("CORS wildcard (*) enabled - DO NOT use in production!")

# === STREAMING ===
TRANSCODE_SETTINGS = {
    "default_video_codec": "h264",
    "default_audio_codec": "aac",
    "default_quality": "1080p",
    "hardware_acceleration": "auto",
    "max_concurrent_transcodes": int(os.environ.get("HERMES_MAX_TRANSCODES", "2"))
}

# === SEGURETAT ===
# Clau secreta per JWT - OBLIGATORI en producció!
_DEFAULT_SECRET_KEY = "dev-key-canvia-en-produccio"
SECRET_KEY = os.environ.get("HERMES_SECRET_KEY", _DEFAULT_SECRET_KEY)

# Validar que la clau secreta no és la per defecte en producció
if PRODUCTION and SECRET_KEY == _DEFAULT_SECRET_KEY:
    raise ValueError(
        "ERROR DE SEGURETAT: Has de definir HERMES_SECRET_KEY en producció! "
        "Genera una clau segura amb: python -c \"import secrets; print(secrets.token_hex(32))\""
    )
elif SECRET_KEY == _DEFAULT_SECRET_KEY:
    logger.warning(
        "AVÍS: Utilitzant clau secreta per defecte. "
        "Defineix HERMES_SECRET_KEY per a producció!"
    )

# === ADMIN PER DEFECTE ===
# Aquestes credencials es creen automàticament si no existeix cap admin
# USA VARIABLES D'ENTORN EN PRODUCCIÓ!
DEFAULT_ADMIN_USERNAME = os.environ.get("HERMES_ADMIN_USER", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("HERMES_ADMIN_PASSWORD", "hermes2024")
DEFAULT_ADMIN_EMAIL = os.environ.get("HERMES_ADMIN_EMAIL", "admin@hermes.local")

# Avís si s'usa la contrasenya per defecte en producció
if PRODUCTION and DEFAULT_ADMIN_PASSWORD == "hermes2024":
    logger.warning(
        "AVÍS: Utilitzant contrasenya d'admin per defecte en producció. "
        "Defineix HERMES_ADMIN_PASSWORD!"
    )
