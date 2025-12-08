"""
Debrid services integration (Real-Debrid, AllDebrid, etc.)
"""

from .realdebrid import RealDebridClient
from .torrentio import TorrentioClient
from .bbc_iplayer import BBCiPlayerClient, BBCiPlayerError
from .bbc_cookies import (
    save_bbc_cookies,
    get_bbc_cookies,
    delete_bbc_cookies,
    has_bbc_cookies,
    validate_cookies_format,
    ENCRYPTION_AVAILABLE
)

__all__ = [
    'RealDebridClient',
    'TorrentioClient',
    'BBCiPlayerClient',
    'BBCiPlayerError',
    'save_bbc_cookies',
    'get_bbc_cookies',
    'delete_bbc_cookies',
    'has_bbc_cookies',
    'validate_cookies_format',
    'ENCRYPTION_AVAILABLE'
]
