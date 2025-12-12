"""
Configuració de fixtures globals per tests de pytest
"""
import pytest
import tempfile
import shutil
from pathlib import Path


@pytest.fixture
def temp_dir():
    """Crea un directori temporal per tests"""
    temp_path = Path(tempfile.mkdtemp())
    yield temp_path
    # Neteja després del test
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def sample_series_structure(temp_dir):
    """Crea una estructura de directoris de sèrie de mostra"""
    series_path = temp_dir / "Breaking Bad"

    # Temporada 1
    season1 = series_path / "Season 01"
    season1.mkdir(parents=True)
    (season1 / "Breaking Bad - S01E01.mkv").touch()
    (season1 / "Breaking Bad - S01E02.mkv").touch()

    # Temporada 2
    season2 = series_path / "Season 02"
    season2.mkdir(parents=True)
    (season2 / "Breaking Bad - S02E01.mkv").touch()
    (season2 / "Breaking Bad - S02E02.mkv").touch()

    return series_path


@pytest.fixture
def sample_movie_structure(temp_dir):
    """Crea una estructura de directoris de pel·lícula de mostra"""
    movie_path = temp_dir / "The Matrix (1999)"
    movie_path.mkdir(parents=True)
    (movie_path / "The Matrix (1999).mkv").touch()

    return movie_path


@pytest.fixture
def mock_tmdb_response():
    """Mock de resposta TMDB"""
    return {
        "id": 1396,
        "name": "Breaking Bad",
        "overview": "A high school chemistry teacher...",
        "vote_average": 9.5,
        "first_air_date": "2008-01-20",
        "genres": [{"id": 18, "name": "Drama"}],
        "seasons": [
            {"season_number": 1, "episode_count": 7},
            {"season_number": 2, "episode_count": 13}
        ]
    }


@pytest.fixture
def mock_cache_file(temp_dir):
    """Crea un fitxer de cache de mostra"""
    cache_file = temp_dir / "cache.json"
    import json
    cache_data = {
        "series": {
            "1": {"name": "Breaking Bad", "rating": 9.5}
        },
        "timestamp": 1234567890
    }
    with open(cache_file, 'w') as f:
        json.dump(cache_data, f)
    return cache_file
