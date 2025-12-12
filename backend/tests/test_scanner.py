"""
Tests per al mòdul scanner
"""
import pytest
from pathlib import Path
from backend.scanner import scan


class TestScannerPatterns:
    """Tests per detectar patrons de noms d'arxiu"""

    @pytest.mark.unit
    def test_detect_series_pattern_sxxexx(self):
        """Detecta patró S01E01"""
        filename = "Breaking Bad - S01E01 - Pilot.mkv"
        result = scan.detect_episode_info(filename)

        assert result is not None
        assert result['season'] == 1
        assert result['episode'] == 1

    @pytest.mark.unit
    def test_detect_series_pattern_1x01(self):
        """Detecta patró 1x01"""
        filename = "Breaking Bad - 1x01 - Pilot.mkv"
        result = scan.detect_episode_info(filename)

        assert result is not None
        assert result['season'] == 1
        assert result['episode'] == 1

    @pytest.mark.unit
    def test_detect_series_pattern_with_leading_zeros(self):
        """Detecta patrons amb zeros inicials"""
        filename = "Show - S03E09.mkv"
        result = scan.detect_episode_info(filename)

        assert result is not None
        assert result['season'] == 3
        assert result['episode'] == 9

    @pytest.mark.unit
    def test_detect_movie_year(self):
        """Detecta any en nom de pel·lícula"""
        filename = "The Matrix (1999).mkv"
        result = scan.detect_movie_year(filename)

        assert result == 1999

    @pytest.mark.unit
    def test_invalid_series_pattern(self):
        """No detecta patrons invàlids"""
        filename = "Random Video File.mkv"
        result = scan.detect_episode_info(filename)

        assert result is None


class TestScanSeries:
    """Tests per escanejar sèries"""

    @pytest.mark.integration
    def test_scan_series_structure(self, sample_series_structure):
        """Escaneja una estructura de sèrie correctament"""
        result = scan.scan_series(sample_series_structure)

        assert result is not None
        assert 'name' in result
        assert 'seasons' in result
        assert len(result['seasons']) == 2

    @pytest.mark.integration
    def test_scan_series_detects_episodes(self, sample_series_structure):
        """Detecta episodis correctament"""
        result = scan.scan_series(sample_series_structure)

        season1 = next(s for s in result['seasons'] if s['season_number'] == 1)
        assert season1['episode_count'] == 2

        season2 = next(s for s in result['seasons'] if s['season_number'] == 2)
        assert season2['episode_count'] == 2

    @pytest.mark.integration
    def test_scan_series_invalid_path(self):
        """Gestiona path invàlid correctament"""
        with pytest.raises((ValueError, FileNotFoundError)):
            scan.scan_series(Path("/path/invalid/series"))

    @pytest.mark.integration
    def test_scan_series_empty_directory(self, temp_dir):
        """Gestiona directori buit"""
        empty_dir = temp_dir / "Empty Series"
        empty_dir.mkdir()

        result = scan.scan_series(empty_dir)

        # Hauria de retornar estructura però sense episodis
        assert result is not None
        assert len(result.get('seasons', [])) == 0


class TestScanMovies:
    """Tests per escanejar pel·lícules"""

    @pytest.mark.integration
    def test_scan_movie_structure(self, sample_movie_structure):
        """Escaneja una estructura de pel·lícula correctament"""
        result = scan.scan_movie(sample_movie_structure)

        assert result is not None
        assert 'title' in result
        assert 'year' in result
        assert result['year'] == 1999

    @pytest.mark.integration
    def test_scan_movie_detects_video_file(self, sample_movie_structure):
        """Detecta fitxer de vídeo correctament"""
        result = scan.scan_movie(sample_movie_structure)

        assert 'file_path' in result
        assert result['file_path'].endswith('.mkv')

    @pytest.mark.integration
    def test_scan_movie_multiple_files(self, temp_dir):
        """Gestiona múltiples fitxers de vídeo"""
        movie_path = temp_dir / "Test Movie (2020)"
        movie_path.mkdir()
        (movie_path / "movie.mkv").touch()
        (movie_path / "movie-trailer.mkv").touch()

        result = scan.scan_movie(movie_path)

        # Hauria de seleccionar el fitxer principal (més gran o nom sense "trailer")
        assert result is not None
        assert 'trailer' not in result['file_path'].lower()


class TestFileValidation:
    """Tests per validació de fitxers"""

    @pytest.mark.unit
    def test_valid_video_extensions(self):
        """Valida extensions de vídeo vàlides"""
        valid_extensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv']

        for ext in valid_extensions:
            assert scan.is_valid_video_file(f"test{ext}") is True

    @pytest.mark.unit
    def test_invalid_video_extensions(self):
        """Rebutja extensions invàlides"""
        invalid_extensions = ['.txt', '.jpg', '.zip', '.exe']

        for ext in invalid_extensions:
            assert scan.is_valid_video_file(f"test{ext}") is False

    @pytest.mark.unit
    def test_case_insensitive_extensions(self):
        """Extensions insensibles a majúscules"""
        assert scan.is_valid_video_file("test.MKV") is True
        assert scan.is_valid_video_file("test.Mp4") is True


class TestScanPerformance:
    """Tests de rendiment del scanner"""

    @pytest.mark.slow
    def test_scan_large_library(self, temp_dir):
        """Escaneja biblioteca gran en temps raonable"""
        import time

        # Crear estructura gran
        for i in range(10):
            series = temp_dir / f"Series {i}"
            for season in range(1, 4):
                season_dir = series / f"Season {season:02d}"
                season_dir.mkdir(parents=True)
                for episode in range(1, 11):
                    (season_dir / f"S{season:02d}E{episode:02d}.mkv").touch()

        start_time = time.time()
        results = scan.scan_library(temp_dir)
        elapsed_time = time.time() - start_time

        # Hauria de trigar menys de 5 segons per 300 episodis
        assert elapsed_time < 5.0
        assert len(results) == 10
