"""
BBC iPlayer Generic Mapping System

Sistema genèric per mapar contingut de BBC iPlayer a TMDB.
Permet importar i gestionar qualsevol sèrie de BBC, no només One Piece.

Estructura del mappeig:
{
    "tmdb_id:type": {  # ex: "37854:tv" per One Piece
        "bbc_series_id": "m0021y5y",
        "title": "One Piece",
        "episodes": {
            "1": "programme_id_1",
            "2": "programme_id_2",
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
from typing import Dict, Optional, List
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
            json.dump(_BBC_MAPPING_CACHE, f, indent=2)
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

    Args:
        tmdb_id: ID de TMDB
        episode: Número d'episodi (absolut per sèries)
        content_type: 'tv' o 'movie'

    Returns:
        programme_id de BBC o None
    """
    content = get_bbc_mapping_for_content(tmdb_id, content_type)
    if not content:
        return None

    episodes = content.get("episodes", {})
    return episodes.get(str(episode))


def set_bbc_mapping_for_content(
    tmdb_id: int,
    content_type: str,
    bbc_series_id: str,
    title: str,
    episodes: Dict[int, str] = None,
    seasons: List[Dict] = None
):
    """
    Configura el mappeig BBC per un contingut TMDB.

    Args:
        tmdb_id: ID de TMDB
        content_type: 'tv' o 'movie'
        bbc_series_id: ID de la sèrie a BBC
        title: Títol del contingut
        episodes: Dict de { episode_num: programme_id }
        seasons: Llista de temporades amb info
    """
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
        # Merge episodes
        for ep_num, prog_id in episodes.items():
            mapping[key]["episodes"][str(ep_num)] = prog_id
    if seasons:
        for season in seasons:
            season_num = str(season.get("number", len(mapping[key]["seasons"]) + 1))
            mapping[key]["seasons"][season_num] = season

    mapping[key]["last_updated"] = datetime.utcnow().isoformat()

    _BBC_MAPPING_CACHE = mapping
    save_bbc_mapping()


def import_bbc_episodes(
    tmdb_id: int,
    content_type: str,
    episodes: List[Dict],
    bbc_series_id: str = None,
    title: str = None,
    start_episode: int = None
) -> int:
    """
    Importa episodis de BBC a partir d'una llista de yt-dlp.

    Args:
        tmdb_id: ID de TMDB
        content_type: 'tv' o 'movie'
        episodes: Llista d'episodis de yt-dlp
        bbc_series_id: ID de la sèrie a BBC
        title: Títol del contingut
        start_episode: Episodi inicial per fallback posicional

    Returns:
        Nombre d'episodis importats
    """
    import re

    imported_episodes = {}
    imported_count = 0

    for idx, ep in enumerate(episodes):
        programme_id = ep.get("programme_id") or ep.get("id")
        ep_title = ep.get("title", "")

        if not programme_id:
            continue

        episode_num = None

        # Primer intentar el camp episode_number de yt-dlp
        if ep.get("episode_number"):
            episode_num = int(ep.get("episode_number"))

        # Si no, intentar extreure del títol
        if not episode_num:
            patterns = [
                r'Episode\s*(\d+)',           # Episode 804
                r'Ep\.?\s*(\d+)',              # Ep 804, Ep. 804
                r'^(\d+)\.',                   # 804. Title
                r'#(\d+)',                     # #804
                r':\s*(\d{1,4})(?:\s|$)',     # Title: 804
                r'-\s*(\d{1,4})(?:\s|$)',     # Title - 804
                r'(?:^|\s)(\d{1,4})(?:$|\s)', # Número sol
            ]

            for pattern in patterns:
                match = re.search(pattern, ep_title, re.IGNORECASE)
                if match:
                    num = int(match.group(1))
                    # Validar que sigui un número d'episodi plausible
                    if 1 <= num <= 9999 and not (1990 <= num <= 2030):
                        episode_num = num
                        break

        # Fallback: usar posició
        if not episode_num and start_episode is not None:
            episode_num = start_episode + idx

        if episode_num and episode_num > 0:
            imported_episodes[episode_num] = programme_id
            imported_count += 1
            logger.debug(f"Importat episodi {episode_num} -> {programme_id}")

    if imported_count > 0:
        set_bbc_mapping_for_content(
            tmdb_id=tmdb_id,
            content_type=content_type,
            bbc_series_id=bbc_series_id,
            title=title,
            episodes=imported_episodes
        )
        logger.info(f"Importats {imported_count} episodis per TMDB {tmdb_id}")

    return imported_count


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
