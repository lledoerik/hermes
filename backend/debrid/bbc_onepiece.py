"""
BBC iPlayer One Piece Arc Mapping

Mapeja els episodis de TMDB als arcs de BBC iPlayer.
BBC organitza One Piece per arcs narratius, no per número d'episodi absolut.

Per actualitzar els IDs de BBC:
1. Ves a BBC iPlayer i busca "One Piece"
2. Cada arc té una URL com: https://www.bbc.co.uk/iplayer/episodes/SERIES_ID
3. Actualitza el camp 'bbc_series_id' de cada arc
"""

from dataclasses import dataclass
from typing import Optional, List, Dict, Tuple
import logging
import sys
from pathlib import Path

# Afegir path per imports
sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logger = logging.getLogger(__name__)

# TMDB ID per One Piece (anime 1999)
ONE_PIECE_TMDB_ID = 37854

# Mappeig de temporades TMDB a episodis absoluts
# Format: (temporada, primer_episodi_absolut, últim_episodi_absolut)
TMDB_SEASON_MAPPING: List[Tuple[int, int, int]] = [
    (1, 1, 61),
    (2, 62, 77),
    (3, 78, 91),
    (4, 92, 130),
    (5, 131, 143),
    (6, 144, 195),
    (7, 196, 228),
    (8, 229, 263),
    (9, 264, 336),
    (10, 337, 381),
    (11, 382, 407),
    (12, 408, 421),
    (13, 422, 456),
    (14, 457, 516),
    (15, 517, 578),
    (16, 579, 628),
    (17, 629, 746),
    (18, 747, 782),
    (19, 783, 877),
    (20, 878, 1085),
    (21, 1086, 9999),  # En emissió
]


def get_tmdb_season_for_episode(absolute_episode: int) -> Optional[Tuple[int, int]]:
    """
    Retorna la temporada TMDB i el número d'episodi dins la temporada
    per a un episodi absolut.

    Returns:
        (season_number, episode_in_season) o None si no trobat
    """
    for season, start, end in TMDB_SEASON_MAPPING:
        if start <= absolute_episode <= end:
            episode_in_season = absolute_episode - start + 1
            return (season, episode_in_season)
    return None


def get_seasons_for_arc_range(start_ep: int, end_ep: int) -> List[int]:
    """
    Retorna les temporades TMDB que cobreixen un rang d'episodis.
    """
    seasons = set()
    for season, s_start, s_end in TMDB_SEASON_MAPPING:
        # Si hi ha overlap entre el rang i la temporada
        if s_start <= end_ep and s_end >= start_ep:
            seasons.add(season)
    return sorted(list(seasons))


@dataclass
class OnePieceArc:
    """Representa un arc de One Piece"""
    name: str                    # Nom de l'arc
    name_en: str                 # Nom en anglès (per BBC)
    tmdb_start: int              # Primer episodi TMDB
    tmdb_end: int                # Últim episodi TMDB
    bbc_series_id: Optional[str] # ID de la sèrie a BBC (p.ex. "m000q0w4")

    @property
    def episode_count(self) -> int:
        return self.tmdb_end - self.tmdb_start + 1

    def tmdb_to_bbc_episode(self, tmdb_episode: int) -> Optional[int]:
        """Converteix número d'episodi TMDB a número dins l'arc BBC (1-based)"""
        if self.tmdb_start <= tmdb_episode <= self.tmdb_end:
            return tmdb_episode - self.tmdb_start + 1
        return None

    def contains_episode(self, tmdb_episode: int) -> bool:
        return self.tmdb_start <= tmdb_episode <= self.tmdb_end


# Llista d'arcs de One Piece amb els rangs d'episodis TMDB
# Els bbc_series_id s'han de configurar manualment ja que BBC pot canviar-los
ONE_PIECE_ARCS: List[OnePieceArc] = [
    # East Blue Saga
    OnePieceArc(
        name="East Blue",
        name_en="East Blue",
        tmdb_start=1,
        tmdb_end=61,
        bbc_series_id=None  # Configurar quan estigui disponible
    ),

    # Alabasta Saga
    OnePieceArc(
        name="Alabasta",
        name_en="Alabasta",
        tmdb_start=62,
        tmdb_end=135,
        bbc_series_id=None
    ),

    # Sky Island Saga
    OnePieceArc(
        name="Sky Island",
        name_en="Sky Island",
        tmdb_start=136,
        tmdb_end=206,
        bbc_series_id=None
    ),

    # Water 7 Saga
    OnePieceArc(
        name="Water 7",
        name_en="Water 7",
        tmdb_start=207,
        tmdb_end=325,
        bbc_series_id=None
    ),

    # Thriller Bark Saga
    OnePieceArc(
        name="Thriller Bark",
        name_en="Thriller Bark",
        tmdb_start=326,
        tmdb_end=384,
        bbc_series_id=None
    ),

    # Summit War Saga (Sabaody + Impel Down + Marineford + Post-War)
    OnePieceArc(
        name="Summit War",
        name_en="Summit War",
        tmdb_start=385,
        tmdb_end=516,
        bbc_series_id=None
    ),

    # Fish-Man Island Saga
    OnePieceArc(
        name="Fish-Man Island",
        name_en="Fish-Man Island",
        tmdb_start=517,
        tmdb_end=574,
        bbc_series_id=None
    ),

    # Dressrosa Saga (Punk Hazard + Dressrosa)
    OnePieceArc(
        name="Dressrosa",
        name_en="Dressrosa",
        tmdb_start=575,
        tmdb_end=746,
        bbc_series_id=None
    ),

    # Whole Cake Island Saga (Zou + Whole Cake Island)
    OnePieceArc(
        name="Whole Cake Island",
        name_en="Whole Cake Island",
        tmdb_start=747,
        tmdb_end=891,
        bbc_series_id="p0j3hwjx"  # Exemple - verificar a BBC
    ),

    # Land of Wano Saga
    OnePieceArc(
        name="Land of Wano",
        name_en="Land of Wano",
        tmdb_start=892,
        tmdb_end=1088,
        bbc_series_id=None
    ),

    # Egghead Saga
    OnePieceArc(
        name="Egghead",
        name_en="Egghead",
        tmdb_start=1089,
        tmdb_end=9999,  # En emissió
        bbc_series_id=None
    ),
]


# Diccionari que mapeja episodi absolut → programme_id de BBC
# Format: { episode_number: programme_id }
# Això es pot guardar/carregar des d'un fitxer JSON
BBC_EPISODE_MAPPING: Dict[int, str] = {}

# Fitxer on guardar el mappeig persistent
BBC_MAPPING_FILE = str(settings.DATA_DIR / "bbc_onepiece_mapping.json")


def load_bbc_mapping():
    """Carrega el mappeig des del fitxer JSON"""
    global BBC_EPISODE_MAPPING
    import json
    import os

    if os.path.exists(BBC_MAPPING_FILE):
        try:
            with open(BBC_MAPPING_FILE, 'r') as f:
                data = json.load(f)
                # Convertir claus a int
                BBC_EPISODE_MAPPING = {int(k): v for k, v in data.items()}
                logger.info(f"Carregat mappeig BBC amb {len(BBC_EPISODE_MAPPING)} episodis")
        except Exception as e:
            logger.error(f"Error carregant mappeig BBC: {e}")


def save_bbc_mapping():
    """Guarda el mappeig al fitxer JSON"""
    import json
    import os

    # Crear directori si no existeix
    os.makedirs(os.path.dirname(BBC_MAPPING_FILE), exist_ok=True)

    try:
        with open(BBC_MAPPING_FILE, 'w') as f:
            json.dump(BBC_EPISODE_MAPPING, f, indent=2)
        logger.info(f"Guardat mappeig BBC amb {len(BBC_EPISODE_MAPPING)} episodis")
    except Exception as e:
        logger.error(f"Error guardant mappeig BBC: {e}")


def add_bbc_episode(absolute_episode: int, programme_id: str):
    """Afegeix un episodi al mappeig"""
    BBC_EPISODE_MAPPING[absolute_episode] = programme_id
    save_bbc_mapping()


def get_bbc_programme_id(absolute_episode: int) -> Optional[str]:
    """Obté el programme_id de BBC per un episodi absolut"""
    return BBC_EPISODE_MAPPING.get(absolute_episode)


def import_bbc_episodes_from_list(episodes: List[Dict], arc_start_episode: int = None) -> int:
    """
    Importa episodis de BBC a partir d'una llista obtinguda de yt-dlp.
    Intenta extreure el número d'episodi del títol o usar el camp episode_number.

    Args:
        episodes: Llista d'episodis de yt-dlp
        arc_start_episode: Primer episodi de l'arc (per fallback posicional)

    Returns:
        Nombre d'episodis importats
    """
    import re
    imported = 0

    # BBC retorna episodis en ordre invers (més nous primer)
    # Invertim la llista per tenir-los en ordre cronològic
    episodes_ordered = list(reversed(episodes))

    for idx, ep in enumerate(episodes_ordered):
        programme_id = ep.get("programme_id") or ep.get("id")
        title = ep.get("title", "")

        if not programme_id:
            continue

        episode_num = None

        # Primer intentar el camp episode_number de yt-dlp
        if ep.get("episode_number"):
            episode_num = int(ep.get("episode_number"))

        # Si no, intentar extreure del títol
        if not episode_num:
            # Patrons comuns per One Piece: "Episode 804", "804.", "Ep 804", "#804"
            patterns = [
                r'Episode\s*(\d+)',           # Episode 804
                r'Ep\.?\s*(\d+)',              # Ep 804, Ep. 804
                r'^(\d+)\.',                   # 804. Title
                r'#(\d+)',                     # #804
                r':\s*(\d{1,4})(?:\s|$)',     # One Piece: 804
                r'-\s*(\d{1,4})(?:\s|$)',     # One Piece - 804
                r'(?:^|\s)(\d{1,4})(?:$|\s)', # Número sol com a paraula
            ]

            for pattern in patterns:
                match = re.search(pattern, title, re.IGNORECASE)
                if match:
                    num = int(match.group(1))
                    # Validar que sigui un número d'episodi plausible (1-2000)
                    # i no un any (1990-2025)
                    if 1 <= num <= 2000 and not (1990 <= num <= 2025):
                        episode_num = num
                        break

        # Fallback: usar posició dins l'arc si coneixem l'episodi inicial
        if not episode_num and arc_start_episode:
            episode_num = arc_start_episode + idx
            logger.debug(f"Usant posició per episodi: {episode_num} (idx={idx})")

        if episode_num and 1 <= episode_num <= 2000:
            BBC_EPISODE_MAPPING[episode_num] = programme_id
            imported += 1
            logger.debug(f"Importat episodi {episode_num} -> {programme_id} (títol: {title})")

    if imported > 0:
        save_bbc_mapping()

    return imported


# Carregar mappeig al iniciar
load_bbc_mapping()


def get_arc_for_episode(tmdb_episode: int) -> Optional[OnePieceArc]:
    """Troba l'arc que conté un episodi TMDB"""
    for arc in ONE_PIECE_ARCS:
        if arc.contains_episode(tmdb_episode):
            return arc
    return None


def get_all_arcs() -> List[Dict]:
    """Retorna tots els arcs amb la seva informació"""
    return [
        {
            "name": arc.name,
            "name_en": arc.name_en,
            "tmdb_start": arc.tmdb_start,
            "tmdb_end": arc.tmdb_end,
            "episode_count": arc.episode_count,
            "bbc_available": arc.bbc_series_id is not None,
            "bbc_series_id": arc.bbc_series_id
        }
        for arc in ONE_PIECE_ARCS
    ]


def get_bbc_episode_url(tmdb_episode: int) -> Optional[str]:
    """
    Obté la URL de BBC iPlayer per un episodi TMDB

    Retorna None si l'arc no està disponible a BBC
    """
    arc = get_arc_for_episode(tmdb_episode)
    if not arc or not arc.bbc_series_id:
        return None

    # La URL de la sèrie BBC - els episodis individuals es troben dins
    return f"https://www.bbc.co.uk/iplayer/episodes/{arc.bbc_series_id}"


def is_one_piece(tmdb_id: int) -> bool:
    """Comprova si un TMDB ID és One Piece"""
    return tmdb_id == ONE_PIECE_TMDB_ID


class BBCOnePieceClient:
    """Client per obtenir episodis de One Piece de BBC iPlayer"""

    def __init__(self, bbc_client):
        """
        Args:
            bbc_client: Instància de BBCiPlayerClient
        """
        self.bbc_client = bbc_client
        self._episode_cache: Dict[str, List[Dict]] = {}  # Cache d'episodis per arc

    async def get_arc_episodes(self, arc: OnePieceArc) -> List[Dict]:
        """Obté tots els episodis d'un arc de BBC"""
        if not arc.bbc_series_id:
            return []

        # Comprovar cache
        if arc.bbc_series_id in self._episode_cache:
            return self._episode_cache[arc.bbc_series_id]

        try:
            url = f"https://www.bbc.co.uk/iplayer/episodes/{arc.bbc_series_id}"
            episodes = await self.bbc_client.search_series(url)
            self._episode_cache[arc.bbc_series_id] = episodes
            return episodes
        except Exception as e:
            logger.error(f"Error obtenint episodis de l'arc {arc.name}: {e}")
            return []

    async def get_episode_for_tmdb(
        self,
        tmdb_episode: int,
        quality: str = "best"
    ) -> Optional[Dict]:
        """
        Obté l'stream de BBC per un episodi TMDB

        Args:
            tmdb_episode: Número d'episodi TMDB
            quality: Qualitat desitjada

        Returns:
            Dict amb informació de l'stream o None si no disponible
        """
        arc = get_arc_for_episode(tmdb_episode)
        if not arc or not arc.bbc_series_id:
            logger.debug(f"Episodi {tmdb_episode} no disponible a BBC (arc: {arc.name if arc else 'no trobat'})")
            return None

        # Obtenir episodis de l'arc
        episodes = await self.get_arc_episodes(arc)
        if not episodes:
            return None

        # Calcular quin episodi dins l'arc és
        bbc_episode_num = arc.tmdb_to_bbc_episode(tmdb_episode)
        if not bbc_episode_num:
            return None

        # BBC pot tenir els episodis en ordre invers o diferent
        # Intentem trobar per índex (assumint ordre cronològic)
        episode_index = bbc_episode_num - 1

        if episode_index >= len(episodes):
            logger.warning(f"Episodi {tmdb_episode} (índex {episode_index}) no trobat a BBC (només {len(episodes)} episodis)")
            return None

        bbc_episode = episodes[episode_index]
        programme_id = bbc_episode.get("programme_id")

        if not programme_id:
            return None

        # Obtenir stream info
        try:
            stream = await self.bbc_client.get_stream_info(programme_id, quality)
            if stream and stream.url:
                return {
                    "provider": "bbc_iplayer",
                    "arc": arc.name,
                    "bbc_episode": bbc_episode_num,
                    "programme_id": stream.programme_id,
                    "title": stream.title,
                    "url": stream.url,
                    "quality": stream.quality,
                    "subtitles": stream.subtitles,
                    "duration": stream.duration
                }
        except Exception as e:
            logger.error(f"Error obtenint stream BBC per episodi {tmdb_episode}: {e}")

        return None


# Funció auxiliar per actualitzar IDs de BBC des de l'administració
def update_arc_bbc_id(arc_name: str, bbc_series_id: str) -> bool:
    """
    Actualitza el bbc_series_id d'un arc

    Nota: Això només actualitza la memòria, no persisteix.
    Per persistir, caldria guardar a la base de dades.
    """
    for arc in ONE_PIECE_ARCS:
        if arc.name.lower() == arc_name.lower() or arc.name_en.lower() == arc_name.lower():
            arc.bbc_series_id = bbc_series_id
            return True
    return False
