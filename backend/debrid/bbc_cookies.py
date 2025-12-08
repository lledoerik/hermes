"""
BBC iPlayer Cookie Manager
Gestiona les cookies de BBC de forma segura (encriptades)

Seguretat:
- Les cookies es guarden encriptades a la base de dades
- Utilitza Fernet (AES-128-CBC) per l'encriptació
- La clau deriva de HERMES_SECRET_KEY
- Només admins poden configurar les cookies
"""

import base64
import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Intentar importar cryptography per encriptació
try:
    from cryptography.fernet import Fernet
    ENCRYPTION_AVAILABLE = True
except ImportError:
    ENCRYPTION_AVAILABLE = False
    logger.warning(
        "cryptography no instal·lat. Les cookies es guardaran en base64 (menys segur). "
        "Instal·la amb: pip install cryptography"
    )


def _get_encryption_key() -> bytes:
    """
    Genera una clau d'encriptació derivada de HERMES_SECRET_KEY

    Utilitza PBKDF2 per derivar una clau de 32 bytes compatible amb Fernet
    """
    from config.settings import SECRET_KEY

    # Utilitzar un salt fix (podria ser configurable)
    salt = b"hermes_bbc_cookies_v1"

    # Derivar clau utilitzant PBKDF2
    key = hashlib.pbkdf2_hmac(
        'sha256',
        SECRET_KEY.encode(),
        salt,
        100000,  # iteracions
        dklen=32
    )

    # Fernet requereix una clau base64-encoded de 32 bytes
    return base64.urlsafe_b64encode(key)


def encrypt_cookies(cookies_data: str) -> str:
    """
    Encripta les cookies per guardar-les a la base de dades

    Args:
        cookies_data: String amb les cookies (format Netscape)

    Returns:
        String encriptat (base64) o base64 simple si cryptography no disponible
    """
    if ENCRYPTION_AVAILABLE:
        key = _get_encryption_key()
        f = Fernet(key)
        encrypted = f.encrypt(cookies_data.encode())
        return encrypted.decode()
    else:
        # Fallback: base64 simple (menys segur però funcional)
        return base64.b64encode(cookies_data.encode()).decode()


def decrypt_cookies(encrypted_data: str) -> Optional[str]:
    """
    Desencripta les cookies guardades

    Args:
        encrypted_data: String encriptat de la base de dades

    Returns:
        String amb les cookies desencriptades o None si error
    """
    try:
        if ENCRYPTION_AVAILABLE:
            key = _get_encryption_key()
            f = Fernet(key)
            decrypted = f.decrypt(encrypted_data.encode())
            return decrypted.decode()
        else:
            # Fallback: base64 simple
            return base64.b64decode(encrypted_data.encode()).decode()
    except Exception as e:
        logger.error(f"Error desencriptant cookies: {e}")
        return None


def save_bbc_cookies(cookies_data: str) -> bool:
    """
    Guarda les cookies de BBC a la base de dades (encriptades)

    Args:
        cookies_data: Cookies en format Netscape (exportat del navegador)

    Returns:
        True si s'han guardat correctament
    """
    from backend.main import get_db

    try:
        encrypted = encrypt_cookies(cookies_data)

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO settings (key, value)
                VALUES ('bbc_cookies', ?)
            """, (encrypted,))
            conn.commit()

        logger.info("Cookies de BBC guardades correctament")
        return True

    except Exception as e:
        logger.error(f"Error guardant cookies de BBC: {e}")
        return False


def get_bbc_cookies() -> Optional[str]:
    """
    Obté les cookies de BBC desencriptades

    Returns:
        String amb les cookies en format Netscape o None si no configurades
    """
    from backend.main import get_db

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'bbc_cookies'")
            row = cursor.fetchone()

            if not row or not row[0]:
                return None

            return decrypt_cookies(row[0])

    except Exception as e:
        logger.error(f"Error obtenint cookies de BBC: {e}")
        return None


def delete_bbc_cookies() -> bool:
    """
    Elimina les cookies de BBC de la base de dades

    Returns:
        True si s'han eliminat correctament
    """
    from backend.main import get_db

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM settings WHERE key = 'bbc_cookies'")
            conn.commit()

        logger.info("Cookies de BBC eliminades")
        return True

    except Exception as e:
        logger.error(f"Error eliminant cookies de BBC: {e}")
        return False


def has_bbc_cookies() -> bool:
    """
    Comprova si hi ha cookies de BBC configurades

    Returns:
        True si hi ha cookies guardades
    """
    from backend.main import get_db

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM settings WHERE key = 'bbc_cookies' AND value IS NOT NULL AND value != ''")
            return cursor.fetchone() is not None
    except Exception:
        return False


class BBCCookieFile:
    """
    Context manager per crear un fitxer temporal de cookies per yt-dlp

    Ús:
        with BBCCookieFile() as cookie_file:
            if cookie_file:
                subprocess.run(["yt-dlp", "--cookies", cookie_file, url])
    """

    def __init__(self):
        self.temp_file = None
        self.cookies = None

    def __enter__(self) -> Optional[str]:
        """Crea fitxer temporal amb les cookies"""
        self.cookies = get_bbc_cookies()

        if not self.cookies:
            return None

        try:
            # Crear fitxer temporal
            fd, path = tempfile.mkstemp(suffix='.txt', prefix='bbc_cookies_')
            self.temp_file = path

            # Escriure cookies
            with os.fdopen(fd, 'w') as f:
                f.write(self.cookies)

            return path

        except Exception as e:
            logger.error(f"Error creant fitxer de cookies: {e}")
            return None

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Elimina el fitxer temporal"""
        if self.temp_file and os.path.exists(self.temp_file):
            try:
                os.unlink(self.temp_file)
            except Exception as e:
                logger.warning(f"No s'ha pogut eliminar fitxer temporal: {e}")


def validate_cookies_format(cookies_data: str) -> tuple[bool, str]:
    """
    Valida que les cookies tinguin el format correcte (Netscape)

    Args:
        cookies_data: String amb les cookies

    Returns:
        (valid, message) - Si són vàlides i missatge d'error/confirmació
    """
    if not cookies_data or not cookies_data.strip():
        return False, "Les cookies estan buides"

    lines = cookies_data.strip().split('\n')

    # Buscar línies vàlides (no comentaris)
    valid_lines = 0
    has_bbc_domain = False

    for line in lines:
        line = line.strip()

        # Ignorar comentaris i línies buides
        if not line or line.startswith('#'):
            continue

        # Les cookies Netscape tenen format TAB-separated amb mínim 7 camps
        parts = line.split('\t')
        if len(parts) >= 7:
            valid_lines += 1
            domain = parts[0]
            if 'bbc.co.uk' in domain or 'bbc.com' in domain:
                has_bbc_domain = True

    if valid_lines == 0:
        return False, "No s'han trobat cookies vàlides. Assegura't d'exportar en format Netscape."

    if not has_bbc_domain:
        return False, f"S'han trobat {valid_lines} cookies però cap de bbc.co.uk. Exporta les cookies mentre estàs a BBC iPlayer."

    return True, f"Cookies vàlides: {valid_lines} cookies trobades (inclou cookies de BBC)"
