"""
BBC iPlayer Generic Mapping System

Sistema genèric per mapar contingut de BBC iPlayer a TMDB.
Permet importar i gestionar qualsevol sèrie de BBC, no només One Piece.

Estructura del mappeig:
{
    "tmdb_id:type": {
        "bbc_series_id": "m0021y5y",
        "title": "One Piece",
        "episodes": {
            "62": {
                "programme_id": "m00xxxxx",
                "title": "The First Line of Defense?...",
                "description": "The Straw Hat crew...",
                "duration": 1440,
                "thumbnail": "https://...",
            },
            ...
        },
        "seasons": {
            "1": {
                "name": "East Blue",
                "bbc_url": "...",
                "start_episode": 1,
                "end_episode": 61
            }
        },
        "last_updated": "2024-01-01T00:00:00Z"
    }
}
"""

import json
import os
import logging
import re
from typing import Dict, Optional, List, Any
from datetime import datetime

logger = logging.getLogger(__name__)

# Directori per guardar els mappings
BBC_MAPPING_DIR = "/home/user/hermes/data/bbc_mappings"
BBC_MAPPING_FILE = os.path.join(BBC_MAPPING_DIR, "bbc_content_mapping.json")

# Cache en memòria
_BBC_MAPPING_CACHE: Dict = {}


def _ensure_mapping_dir():
    """Crear directori de mappings si no existeix"""
    os.makedirs(BBC_MAPPING_DIR, exist_ok=True)


def load_bbc_mapping() -> Dict:
    """Carrega el mappeig global de BBC"""
    global _BBC_MAPPING_CACHE

    if _BBC_MAPPING_CACHE:
        return _BBC_MAPPING_CACHE

    _ensure_mapping_dir()

    if os.path.exists(BBC_MAPPING_FILE):
        try:
            with open(BBC_MAPPING_FILE, 'r') as f:
                _BBC_MAPPING_CACHE = json.load(f)
                logger.info(f"Carregat mappeig BBC amb {len(_BBC_MAPPING_CACHE)} sèries")
        except Exception as e:
            logger.error(f"Error carregant mappeig BBC: {e}")
            _BBC_MAPPING_CACHE = {}
    else:
        _BBC_MAPPING_CACHE = {}

    return _BBC_MAPPING_CACHE


def save_bbc_mapping():
    """Guarda el mappeig global de BBC"""
    global _BBC_MAPPING_CACHE

    _ensure_mapping_dir()

    try:
        with open(BBC_MAPPING_FILE, 'w') as f:
            json.dump(_BBC_MAPPING_CACHE, f, indent=2, ensure_ascii=False)
        logger.info(f"Guardat mappeig BBC amb {len(_BBC_MAPPING_CACHE)} sèries")
    except Exception as e:
        logger.error(f"Error guardant mappeig BBC: {e}")


def get_content_key(tmdb_id: int, content_type: str = "tv") -> str:
    """Genera la clau per un contingut (tmdb_id:type)"""
    return f"{tmdb_id}:{content_type}"


def get_bbc_mapping_for_content(tmdb_id: int, content_type: str = "tv") -> Optional[Dict]:
    """Obtenir el mappeig BBC per un contingut TMDB"""
    mapping = load_bbc_mapping()
    key = get_content_key(tmdb_id, content_type)
    return mapping.get(key)


def get_bbc_programme_id(tmdb_id: int, episode: int, content_type: str = "tv") -> Optional[str]:
    """
    Obtenir el programme_id de BBC per un episodi específic.
    """
    content = get_bbc_mapping_for_content(tmdb_id, content_type)
    if not content:
        return None

    episodes = content.get("episodes", {})
    ep_data = episodes.get(str(episode))

    # Suportar tant format antic (string) com nou (dict)
    if isinstance(ep_data, str):
        return ep_data
    elif isinstance(ep_data, dict):
        return ep_data.get("programme_id")
    return None


def get_bbc_episode_info(tmdb_id: int, episode: int, content_type: str = "tv") -> Optional[Dict]:
    """
    Obtenir informació completa d'un episodi BBC.

    Returns:
        Dict amb programme_id, title, description, duration, thumbnail
    """
    content = get_bbc_mapping_for_content(tmdb_id, content_type)
    if not content:
        return None

    episodes = content.get("episodes", {})
    ep_data = episodes.get(str(episode))

    if isinstance(ep_data, str):
        # Format antic - només programme_id
        return {"programme_id": ep_data, "episode_number": episode}
    elif isinstance(ep_data, dict):
        return {**ep_data, "episode_number": episode}
    return None


def get_bbc_episodes_for_season(
    tmdb_id: int,
    season_number: int,
    content_type: str = "tv"
) -> List[Dict]:
    """
    Obtenir tots els episodis d'una temporada/arc BBC.

    Args:
        tmdb_id: ID de TMDB
        season_number: Número de temporada/arc (1-based)
        content_type: 'tv' o 'movie'

    Returns:
        Llista d'episodis amb metadades completes
    """
    content = get_bbc_mapping_for_content(tmdb_id, content_type)
    if not content:
        return []

    seasons = content.get("seasons", {})
    season_data = seasons.get(str(season_number))

    if not season_data:
        return []

    start_ep = season_data.get("start_episode", 1)
    end_ep = season_data.get("end_episode", start_ep)

    episodes = content.get("episodes", {})
    result = []

    for ep_num in range(start_ep, end_ep + 1):
        ep_data = episodes.get(str(ep_num))
        if ep_data:
            if isinstance(ep_data, str):
                result.append({
                    "episode_number": ep_num,
                    "programme_id": ep_data
                })
            else:
                result.append({
                    "episode_number": ep_num,
                    **ep_data
                })

    return result


def get_bbc_seasons(tmdb_id: int, content_type: str = "tv") -> List[Dict]:
    """
    Obtenir llista de temporades/arcs BBC per un contingut.

    Returns:
        Llista de temporades amb nom, rang d'episodis i count
    """
    content = get_bbc_mapping_for_content(tmdb_id, content_type)
    if not content:
        return []

    seasons = content.get("seasons", {})
    episodes = content.get("episodes", {})

    result = []
    for season_num, season_data in sorted(seasons.items(), key=lambda x: int(x[0])):
        start_ep = season_data.get("start_episode", 1)
        end_ep = season_data.get("end_episode", start_ep)

        # Comptar episodis disponibles
        available_count = sum(
            1 for ep_num in range(start_ep, end_ep + 1)
            if str(ep_num) in episodes
        )

        result.append({
            "season_number": int(season_num),
            "name": season_data.get("name", f"Season {season_num}"),
            "start_episode": start_ep,
            "end_episode": end_ep,
            "total_episodes": end_ep - start_ep + 1,
            "available_episodes": available_count,
            "bbc_url": season_data.get("bbc_url")
        })

    return result


def set_bbc_season(
    tmdb_id: int,
    content_type: str,
    season_number: int,
    name: str,
    start_episode: int,
    end_episode: int,
    bbc_url: str = None
):
    """Configura una temporada/arc BBC"""
    global _BBC_MAPPING_CACHE

    mapping = load_bbc_mapping()
    key = get_content_key(tmdb_id, content_type)

    if key not in mapping:
        mapping[key] = {
            "bbc_series_id": None,
            "title": "",
            "episodes": {},
            "seasons": {},
            "last_updated": datetime.utcnow().isoformat()
        }

    mapping[key]["seasons"][str(season_number)] = {
        "name": name,
        "start_episode": start_episode,
        "end_episode": end_episode,
        "bbc_url": bbc_url
    }

    mapping[key]["last_updated"] = datetime.utcnow().isoformat()
    _BBC_MAPPING_CACHE = mapping
    save_bbc_mapping()


def import_bbc_episodes_with_metadata(
    tmdb_id: int,
    content_type: str,
    episodes: List[Dict],
    bbc_series_id: str = None,
    title: str = None,
    season_number: int = None,
    season_name: str = None,
    start_episode: int = None
) -> int:
    """
    Importa episodis de BBC amb metadades completes.

    Args:
        tmdb_id: ID de TMDB
        content_type: 'tv' o 'movie'
        episodes: Llista d'episodis de yt-dlp (amb title, description, thumbnail, duration)
        bbc_series_id: ID de la sèrie a BBC
        title: Títol del contingut
        season_number: Número de temporada/arc
        season_name: Nom de la temporada/arc
        start_episode: Episodi inicial per fallback posicional

    Returns:
        Nombre d'episodis importats
    """
    global _BBC_MAPPING_CACHE

    mapping = load_bbc_mapping()
    key = get_content_key(tmdb_id, content_type)

    if key not in mapping:
        mapping[key] = {
            "bbc_series_id": bbc_series_id,
            "title": title or "",
            "episodes": {},
            "seasons": {},
            "last_updated": datetime.utcnow().isoformat()
        }

    if bbc_series_id:
        mapping[key]["bbc_series_id"] = bbc_series_id
    if title:
        mapping[key]["title"] = title

    imported_count = 0
    min_episode = None
    max_episode = None

    for idx, ep in enumerate(episodes):
        programme_id = ep.get("programme_id") or ep.get("id")
        ep_title = ep.get("title", "")

        if not programme_id:
            continue

        episode_num = _extract_episode_number(ep, ep_title, start_episode, idx)

        if episode_num and episode_num > 0:
            # Guardar metadades completes
            mapping[key]["episodes"][str(episode_num)] = {
                "programme_id": programme_id,
                "title": ep_title,
                "description": ep.get("description", ""),
                "duration": ep.get("duration"),
                "thumbnail": ep.get("thumbnail") or ep.get("thumbnails", [{}])[0].get("url") if ep.get("thumbnails") else None,
            }
            imported_count += 1

            # Track min/max per season
            if min_episode is None or episode_num < min_episode:
                min_episode = episode_num
            if max_episode is None or episode_num > max_episode:
                max_episode = episode_num

            logger.debug(f"Importat episodi {episode_num}: {ep_title[:50]}...")

    # Actualitzar info de temporada si tenim season_number
    if season_number and min_episode and max_episode:
        mapping[key]["seasons"][str(season_number)] = {
            "name": season_name or f"Season {season_number}",
            "start_episode": min_episode,
            "end_episode": max_episode,
        }

    mapping[key]["last_updated"] = datetime.utcnow().isoformat()
    _BBC_MAPPING_CACHE = mapping

    if imported_count > 0:
        save_bbc_mapping()
        logger.info(f"Importats {imported_count} episodis per TMDB {tmdb_id}")

    return imported_count


def _extract_episode_number(ep: Dict, title: str, start_episode: int = None, idx: int = 0) -> Optional[int]:
    """
    Extreu el número d'episodi d'un episodi BBC.
    """
    # Primer intentar el camp episode_number de yt-dlp
    if ep.get("episode_number"):
        return int(ep.get("episode_number"))

    # Intentar extreure del títol
    patterns = [
        r'^(\d+)\.',                   # 62. Title
        r'Episode\s*(\d+)',            # Episode 62
        r'Ep\.?\s*(\d+)',              # Ep 62, Ep. 62
        r'#(\d+)',                     # #62
        r':\s*(\d{1,4})(?:\s|$)',      # Title: 62
        r'-\s*(\d{1,4})(?:\s|$)',      # Title - 62
    ]

    for pattern in patterns:
        match = re.search(pattern, title, re.IGNORECASE)
        if match:
            num = int(match.group(1))
            # Validar que sigui plausible
            if 1 <= num <= 9999 and not (1990 <= num <= 2030):
                return num

    # Fallback: usar posició
    if start_episode is not None:
        return start_episode + idx

    return None


# Funcions de compatibilitat amb codi antic

def import_bbc_episodes(
    tmdb_id: int,
    content_type: str,
    episodes: List[Dict],
    bbc_series_id: str = None,
    title: str = None,
    start_episode: int = None
) -> int:
    """Wrapper per compatibilitat - redirigeix a la nova funció"""
    return import_bbc_episodes_with_metadata(
        tmdb_id=tmdb_id,
        content_type=content_type,
        episodes=episodes,
        bbc_series_id=bbc_series_id,
        title=title,
        start_episode=start_episode
    )


def set_bbc_mapping_for_content(
    tmdb_id: int,
    content_type: str,
    bbc_series_id: str,
    title: str,
    episodes: Dict[int, str] = None,
    seasons: List[Dict] = None
):
    """Funció de compatibilitat per codi antic"""
    global _BBC_MAPPING_CACHE

    mapping = load_bbc_mapping()
    key = get_content_key(tmdb_id, content_type)

    if key not in mapping:
        mapping[key] = {
            "bbc_series_id": bbc_series_id,
            "title": title,
            "episodes": {},
            "seasons": {},
            "last_updated": datetime.utcnow().isoformat()
        }

    if bbc_series_id:
        mapping[key]["bbc_series_id"] = bbc_series_id
    if title:
        mapping[key]["title"] = title

    if episodes:
        for ep_num, prog_id in episodes.items():
            # Convertir format antic a nou
            if isinstance(prog_id, str):
                mapping[key]["episodes"][str(ep_num)] = {
                    "programme_id": prog_id
                }
            else:
                mapping[key]["episodes"][str(ep_num)] = prog_id

    if seasons:
        for season in seasons:
            season_num = str(season.get("number", len(mapping[key]["seasons"]) + 1))
            mapping[key]["seasons"][season_num] = season

    mapping[key]["last_updated"] = datetime.utcnow().isoformat()
    _BBC_MAPPING_CACHE = mapping
    save_bbc_mapping()


def get_all_bbc_content() -> List[Dict]:
    """Obtenir llista de tot el contingut BBC mapejat"""
    mapping = load_bbc_mapping()

    result = []
    for key, data in mapping.items():
        tmdb_id, content_type = key.split(":")
        result.append({
            "tmdb_id": int(tmdb_id),
            "type": content_type,
            "title": data.get("title", ""),
            "bbc_series_id": data.get("bbc_series_id"),
            "episode_count": len(data.get("episodes", {})),
            "season_count": len(data.get("seasons", {})),
            "last_updated": data.get("last_updated")
        })

    return result


def delete_bbc_mapping(tmdb_id: int, content_type: str = "tv") -> bool:
    """Elimina el mappeig BBC per un contingut"""
    global _BBC_MAPPING_CACHE

    mapping = load_bbc_mapping()
    key = get_content_key(tmdb_id, content_type)

    if key in mapping:
        del mapping[key]
        _BBC_MAPPING_CACHE = mapping
        save_bbc_mapping()
        return True

    return False


# Carregar mappeig al iniciar
load_bbc_mapping()
