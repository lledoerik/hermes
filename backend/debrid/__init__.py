"""
Debrid services integration (Real-Debrid, AllDebrid, etc.)
"""

from .realdebrid import RealDebridClient
from .torrentio import TorrentioClient
from .bbc_iplayer import BBCiPlayerClient, BBCiPlayerError

__all__ = ['RealDebridClient', 'TorrentioClient', 'BBCiPlayerClient', 'BBCiPlayerError']
