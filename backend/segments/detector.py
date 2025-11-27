#!/usr/bin/env python3
"""
Hermes Segment Detector
Detecta automàticament segments (intro, recap, outro) usant APIs externes
"""

import re
import sys
import json
import sqlite3
import logging
import hashlib
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.request import urlopen, Request
from urllib.parse import quote, urlencode
from urllib.error import URLError, HTTPError

sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SegmentDetector:
    """Detecta segments automàticament usant diverses fonts"""

    ANISKIP_API = "https://api.aniskip.com/v2"
    ANILIST_API = "https://graphql.anilist.co"

    # Durades típiques de segments (en segons)
    TYPICAL_INTRO_DURATION = (85, 95)  # 1:25 - 1:35
    TYPICAL_OUTRO_DURATION = (85, 95)
    TYPICAL_RECAP_DURATION = (30, 180)  # Variable

    def __init__(self):
        self.db_path = settings.DATABASE_PATH

    def detect_for_series(self, series_id: int) -> Dict:
        """Detecta segments per tots els episodis d'una sèrie"""
        results = {
            "series_id": series_id,
            "success": 0,
            "failed": 0,
            "episodes": []
        }

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Obtenir info de la sèrie i episodis
        cursor.execute("""
            SELECT s.name, s.path, mf.id as media_id, mf.season_number,
                   mf.episode_number, mf.duration, mf.title as episode_title
            FROM series s
            JOIN media_files mf ON mf.series_id = s.id
            WHERE s.id = ?
            ORDER BY mf.season_number, mf.episode_number
        """, (series_id,))

        episodes = cursor.fetchall()
        if not episodes:
            conn.close()
            return results

        series_name = episodes[0]["name"]
        logger.info(f"Buscant segments per: {series_name} ({len(episodes)} episodis)")

        # Intentar trobar l'anime a AniList/MAL
        anime_id = self._search_anime(series_name)

        for ep in episodes:
            ep_result = {
                "media_id": ep["media_id"],
                "season": ep["season_number"],
                "episode": ep["episode_number"],
                "segments_found": []
            }

            if anime_id:
                # Buscar a AniSkip
                segments = self._get_aniskip_segments(
                    anime_id,
                    ep["episode_number"],
                    ep["duration"]
                )

                if segments:
                    for seg in segments:
                        self._save_segment(
                            cursor,
                            ep["media_id"],
                            series_id,
                            seg["type"],
                            seg["start"],
                            seg["end"],
                            "aniskip"
                        )
                        ep_result["segments_found"].append(seg["type"])

                    results["success"] += 1
                else:
                    results["failed"] += 1
            else:
                results["failed"] += 1

            results["episodes"].append(ep_result)

        conn.commit()
        conn.close()

        logger.info(f"Completat: {results['success']} episodis amb segments")
        return results

    def detect_for_episode(self, media_id: int) -> List[Dict]:
        """Detecta segments per un episodi específic"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Obtenir info de l'episodi
        cursor.execute("""
            SELECT mf.*, s.name as series_name
            FROM media_files mf
            JOIN series s ON s.id = mf.series_id
            WHERE mf.id = ?
        """, (media_id,))

        episode = cursor.fetchone()
        if not episode:
            conn.close()
            return []

        series_name = episode["series_name"]
        episode_num = episode["episode_number"]
        duration = episode["duration"]
        series_id = episode["series_id"]

        logger.info(f"Buscant segments per: {series_name} E{episode_num}")

        # Buscar anime ID
        anime_id = self._search_anime(series_name)

        segments = []
        if anime_id:
            segments = self._get_aniskip_segments(anime_id, episode_num, duration)

            for seg in segments:
                self._save_segment(
                    cursor,
                    media_id,
                    series_id,
                    seg["type"],
                    seg["start"],
                    seg["end"],
                    "aniskip"
                )

        conn.commit()
        conn.close()

        return segments

    def _search_anime(self, title: str) -> Optional[int]:
        """Busca un anime a AniList i retorna el seu ID de MAL"""
        # Netejar títol
        clean_title = self._clean_title(title)

        query = """
        query ($search: String) {
            Media(search: $search, type: ANIME) {
                id
                idMal
                title {
                    romaji
                    english
                    native
                }
            }
        }
        """

        variables = {"search": clean_title}

        try:
            data = json.dumps({"query": query, "variables": variables}).encode('utf-8')
            req = Request(
                self.ANILIST_API,
                data=data,
                headers={"Content-Type": "application/json"}
            )

            with urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode('utf-8'))

            if result.get("data", {}).get("Media"):
                media = result["data"]["Media"]
                mal_id = media.get("idMal")
                title_found = media.get("title", {}).get("romaji", "")
                logger.info(f"Trobat a AniList: {title_found} (MAL ID: {mal_id})")
                return mal_id

        except (URLError, HTTPError, json.JSONDecodeError) as e:
            logger.warning(f"Error buscant a AniList: {e}")

        return None

    def _get_aniskip_segments(self, mal_id: int, episode: int, duration: float) -> List[Dict]:
        """Obté segments d'AniSkip per un episodi"""
        if not mal_id:
            return []

        segments = []

        # AniSkip usa IDs de MAL
        types = ["op", "ed", "recap", "mixed-op", "mixed-ed"]

        try:
            url = f"{self.ANISKIP_API}/skip-times/{mal_id}/{episode}"
            params = urlencode({"types": ",".join(types)})
            full_url = f"{url}?{params}"

            req = Request(full_url, headers={"User-Agent": "Hermes/1.0"})

            with urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode('utf-8'))

            if result.get("found") and result.get("results"):
                for item in result["results"]:
                    interval = item.get("interval", {})
                    skip_type = item.get("skipType", "").lower()

                    # Mapear tipus d'AniSkip als nostres
                    segment_type = self._map_skip_type(skip_type)
                    if not segment_type:
                        continue

                    start_time = interval.get("startTime", 0)
                    end_time = interval.get("endTime", 0)

                    # Validar que els temps tenen sentit
                    if end_time > start_time and start_time >= 0:
                        # Ajustar si passa de la duració
                        if duration and end_time > duration:
                            end_time = duration

                        segments.append({
                            "type": segment_type,
                            "start": start_time,
                            "end": end_time
                        })

                logger.info(f"AniSkip: Trobats {len(segments)} segments per E{episode}")

        except (URLError, HTTPError, json.JSONDecodeError) as e:
            logger.warning(f"Error amb AniSkip: {e}")

        return segments

    def _map_skip_type(self, aniskip_type: str) -> Optional[str]:
        """Mapeja tipus d'AniSkip als nostres tipus"""
        mapping = {
            "op": "intro",
            "ed": "outro",
            "recap": "recap",
            "mixed-op": "intro",
            "mixed-ed": "outro",
            "preview": "preview"
        }
        return mapping.get(aniskip_type.lower())

    def _clean_title(self, title: str) -> str:
        """Neteja el títol per millorar la cerca"""
        # Eliminar anys entre parèntesis
        title = re.sub(r'\s*\(\d{4}\)\s*', '', title)
        # Eliminar info de qualitat
        title = re.sub(r'\s*\[.*?\]\s*', '', title)
        # Eliminar "Season X" o "Temporada X"
        title = re.sub(r'\s*(Season|Temporada|Part)\s*\d+', '', title, flags=re.IGNORECASE)
        # Eliminar números de temporada al final
        title = re.sub(r'\s+\d+$', '', title)
        return title.strip()

    def _save_segment(self, cursor, media_id: int, series_id: int,
                      segment_type: str, start: float, end: float, source: str):
        """Guarda un segment a la base de dades"""
        # Comprovar si ja existeix
        cursor.execute("""
            SELECT id FROM media_segments
            WHERE media_id = ? AND segment_type = ?
        """, (media_id, segment_type))

        existing = cursor.fetchone()
        if existing:
            # Actualitzar
            cursor.execute("""
                UPDATE media_segments
                SET start_time = ?, end_time = ?, source = ?
                WHERE id = ?
            """, (start, end, source, existing["id"]))
        else:
            # Inserir nou
            cursor.execute("""
                INSERT INTO media_segments
                (media_id, series_id, segment_type, start_time, end_time, source)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (media_id, series_id, segment_type, start, end, source))

    def apply_template_to_series(self, series_id: int,
                                 intro_start: float = None, intro_end: float = None,
                                 outro_start: float = None, outro_end: float = None) -> int:
        """Aplica timestamps fixos a tots els episodis d'una sèrie

        Útil quan l'intro sempre comença al mateix temps i dura el mateix
        Args:
            series_id: ID de la sèrie
            intro_start: Inici de l'intro (segons)
            intro_end: Fi de l'intro (segons)
            outro_start: Inici de l'outro (pot ser negatiu per indicar des del final)
            outro_end: Fi de l'outro (pot ser negatiu)

        Returns:
            Nombre d'episodis actualitzats
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Obtenir episodis
        cursor.execute("""
            SELECT id, duration FROM media_files
            WHERE series_id = ? AND media_type = 'episode'
        """, (series_id,))

        episodes = cursor.fetchall()
        updated = 0

        for ep in episodes:
            ep_duration = ep["duration"] or 0

            if intro_start is not None and intro_end is not None:
                self._save_segment(
                    cursor, ep["id"], series_id,
                    "intro", intro_start, intro_end, "template"
                )

            if outro_start is not None and outro_end is not None:
                # Si és negatiu, calcular des del final
                actual_start = outro_start if outro_start >= 0 else ep_duration + outro_start
                actual_end = outro_end if outro_end >= 0 else ep_duration + outro_end

                if actual_start < actual_end and actual_start > 0:
                    self._save_segment(
                        cursor, ep["id"], series_id,
                        "outro", actual_start, actual_end, "template"
                    )

            updated += 1

        conn.commit()
        conn.close()

        logger.info(f"Template aplicat a {updated} episodis")
        return updated


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Detecta segments automàticament")
    parser.add_argument("--series", type=int, help="ID de la sèrie a processar")
    parser.add_argument("--episode", type=int, help="ID del media/episodi a processar")
    parser.add_argument("--all", action="store_true", help="Processar totes les sèries")

    args = parser.parse_args()

    detector = SegmentDetector()

    if args.series:
        result = detector.detect_for_series(args.series)
        print(json.dumps(result, indent=2))
    elif args.episode:
        segments = detector.detect_for_episode(args.episode)
        print(json.dumps(segments, indent=2))
    elif args.all:
        conn = sqlite3.connect(settings.DATABASE_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM series WHERE media_type = 'series'")
        series_list = cursor.fetchall()
        conn.close()

        for series_id, name in series_list:
            print(f"\n{'='*50}")
            print(f"Processant: {name}")
            result = detector.detect_for_series(series_id)
            print(f"Success: {result['success']}, Failed: {result['failed']}")
    else:
        parser.print_help()
