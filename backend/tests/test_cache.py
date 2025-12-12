"""
Tests per al sistema de cache
"""
import pytest
import json
import time
from pathlib import Path


class TestCacheBasic:
    """Tests bàsics del sistema de cache"""

    @pytest.mark.unit
    def test_cache_set_and_get(self, mock_cache_file):
        """Pot guardar i recuperar dades del cache"""
        from backend.config.settings import cache

        cache.set('test_key', {'value': 123})
        result = cache.get('test_key')

        assert result is not None
        assert result['value'] == 123

    @pytest.mark.unit
    def test_cache_get_nonexistent_key(self):
        """Retorna None per claus inexistents"""
        from backend.config.settings import cache

        result = cache.get('nonexistent_key')
        assert result is None

    @pytest.mark.unit
    def test_cache_overwrite_key(self):
        """Pot sobreescriure claus existents"""
        from backend.config.settings import cache

        cache.set('key', {'value': 1})
        cache.set('key', {'value': 2})

        result = cache.get('key')
        assert result['value'] == 2

    @pytest.mark.unit
    def test_cache_delete(self):
        """Pot eliminar claus del cache"""
        from backend.config.settings import cache

        cache.set('key', {'value': 123})
        cache.delete('key')

        result = cache.get('key')
        assert result is None


class TestCacheTTL:
    """Tests de Time-To-Live del cache"""

    @pytest.mark.unit
    def test_cache_respects_ttl(self):
        """El cache expira després del TTL"""
        from backend.config.settings import cache

        # Guardar amb TTL de 1 segon
        cache.set('key', {'value': 123}, ttl=1)

        # Immediatament hauria d'estar disponible
        assert cache.get('key') is not None

        # Després de 2 segons hauria d'haver expirat
        time.sleep(2)
        assert cache.get('key') is None

    @pytest.mark.unit
    def test_cache_default_ttl(self):
        """Usa TTL per defecte si no s'especifica"""
        from backend.config.settings import cache

        cache.set('key', {'value': 123})  # TTL per defecte: 5 minuts

        # Hauria d'estar disponible immediatament
        assert cache.get('key') is not None

    @pytest.mark.unit
    def test_cache_infinite_ttl(self):
        """Cache sense TTL no expira"""
        from backend.config.settings import cache

        cache.set('key', {'value': 123}, ttl=None)

        time.sleep(1)
        assert cache.get('key') is not None


class TestCachePersistence:
    """Tests de persistència del cache"""

    @pytest.mark.integration
    def test_cache_persists_to_file(self, temp_dir):
        """El cache es guarda a disc"""
        from backend.config.settings import PersistentCache

        cache_file = temp_dir / "cache.json"
        cache = PersistentCache(cache_file)

        cache.set('key', {'value': 123})
        cache.save()

        # Verificar que el fitxer existeix i conté les dades
        assert cache_file.exists()

        with open(cache_file) as f:
            data = json.load(f)
            assert 'key' in data

    @pytest.mark.integration
    def test_cache_loads_from_file(self, temp_dir):
        """El cache carrega dades de disc"""
        from backend.config.settings import PersistentCache

        cache_file = temp_dir / "cache.json"

        # Crear cache i guardar dades
        cache1 = PersistentCache(cache_file)
        cache1.set('key', {'value': 123})
        cache1.save()

        # Crear nova instància del cache (simula reinici)
        cache2 = PersistentCache(cache_file)
        cache2.load()

        result = cache2.get('key')
        assert result is not None
        assert result['value'] == 123

    @pytest.mark.integration
    def test_cache_handles_corrupted_file(self, temp_dir):
        """Gestiona fitxers de cache corruptes"""
        from backend.config.settings import PersistentCache

        cache_file = temp_dir / "cache.json"

        # Crear fitxer corrupte
        with open(cache_file, 'w') as f:
            f.write("invalid json{{{")

        # Hauria de carregar sense errors
        cache = PersistentCache(cache_file)
        cache.load()

        # Hauria de començar amb cache buit
        assert cache.get('any_key') is None


class TestCachePerformance:
    """Tests de rendiment del cache"""

    @pytest.mark.slow
    def test_cache_fast_reads(self):
        """Les lectures del cache són ràpides"""
        from backend.config.settings import cache
        import time

        # Guardar 1000 entrades
        for i in range(1000):
            cache.set(f'key_{i}', {'value': i})

        # Mesurar temps de lectura
        start = time.time()
        for i in range(1000):
            cache.get(f'key_{i}')
        elapsed = time.time() - start

        # Hauria de llegir 1000 entrades en menys de 100ms
        assert elapsed < 0.1

    @pytest.mark.slow
    def test_cache_fast_writes(self):
        """Les escriptures del cache són ràpides"""
        from backend.config.settings import cache
        import time

        start = time.time()
        for i in range(1000):
            cache.set(f'key_{i}', {'value': i})
        elapsed = time.time() - start

        # Hauria d'escriure 1000 entrades en menys de 100ms
        assert elapsed < 0.1


class TestCacheThreadSafety:
    """Tests de seguretat amb threads"""

    @pytest.mark.integration
    def test_cache_concurrent_access(self):
        """El cache és segur amb accés concurrent"""
        from backend.config.settings import cache
        import threading

        results = []

        def worker(thread_id):
            for i in range(100):
                cache.set(f'key_{thread_id}_{i}', {'value': i})
                value = cache.get(f'key_{thread_id}_{i}')
                results.append(value is not None)

        # Crear 10 threads
        threads = []
        for i in range(10):
            t = threading.Thread(target=worker, args=(i,))
            threads.append(t)
            t.start()

        # Esperar que acabin
        for t in threads:
            t.join()

        # Tots els valors haurien de ser correctes
        assert all(results)


class TestCacheMemoryManagement:
    """Tests de gestió de memòria"""

    @pytest.mark.unit
    def test_cache_eviction_on_size_limit(self):
        """El cache elimina entrades antigues quan arriba al límit"""
        from backend.config.settings import LRUCache

        # Cache amb límit de 10 entrades
        cache = LRUCache(max_size=10)

        # Afegir 15 entrades
        for i in range(15):
            cache.set(f'key_{i}', {'value': i})

        # Les primeres 5 haurien de ser eliminades
        assert cache.get('key_0') is None
        assert cache.get('key_1') is None

        # Les últimes 10 haurien d'estar presents
        assert cache.get('key_5') is not None
        assert cache.get('key_14') is not None
