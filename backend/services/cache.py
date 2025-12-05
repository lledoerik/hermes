"""
Hermes Media Server - Cache Service
Simple in-memory cache with TTL
"""

import time
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class SimpleCache:
    """Simple in-memory cache with TTL."""

    def __init__(self, default_ttl: int = 86400):  # 24h default
        self._cache: Dict[str, tuple] = {}  # key -> (value, timestamp)
        self._ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired."""
        if key in self._cache:
            value, timestamp = self._cache[key]
            if time.time() - timestamp < self._ttl:
                return value
            else:
                del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: int = None) -> None:
        """Save value to cache."""
        self._cache[key] = (value, time.time())

    def delete(self, key: str) -> bool:
        """Delete key from cache."""
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    def clear(self) -> None:
        """Clear all cache."""
        self._cache.clear()

    def size(self) -> int:
        """Return number of items in cache."""
        return len(self._cache)

    def cleanup_expired(self) -> int:
        """Remove expired entries and return count of removed items."""
        current_time = time.time()
        expired_keys = [
            key for key, (_, timestamp) in self._cache.items()
            if current_time - timestamp >= self._ttl
        ]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)


# Global cache instances
tmdb_cache = SimpleCache(default_ttl=86400)  # 24h for episodes/details
torrents_cache = SimpleCache(default_ttl=1800)  # 30min for torrents
