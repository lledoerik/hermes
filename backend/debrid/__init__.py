"""
Debrid services integration (Real-Debrid, AllDebrid, etc.)
"""

from .realdebrid import RealDebridClient
from .torrentio import TorrentioClient

__all__ = ['RealDebridClient', 'TorrentioClient']
