#!/usr/bin/env python3
"""
Hermes Audio Fingerprinting
Detecta intros/outros comparant l'àudio entre episodis d'una sèrie
"""

import os
import sys
import json
import wave
import struct
import sqlite3
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AudioFingerprinter:
    """Detecta intros/outros usant comparació d'àudio"""

    # Configuració més conservadora i realista
    SAMPLE_RATE = 8000  # Hz (baixa qualitat per processar més ràpid)
    CHUNK_SECONDS = 1   # Segons per chunk (més precís)
    MAX_INTRO_DURATION = 120  # Màxim 2 minuts d'intro (la majoria són 60-90s)
    MIN_INTRO_DURATION = 40   # Mínim 40 segons (intros curtes són ~45s)
    TYPICAL_INTRO_DURATION = 90  # Duració típica d'intro anime
    SIMILARITY_THRESHOLD = 0.80  # 80% similitud (més estricte)
    MIN_MATCH_RATIO = 0.85  # 85% dels episodis han de tenir match
    SCAN_START = 0      # On començar a buscar l'intro (segons)
    SCAN_END = 180      # On acabar de buscar (3 minuts - l'intro sempre és al principi)

    def __init__(self):
        self.db_path = settings.DATABASE_PATH
        self._check_ffmpeg()

    def _check_ffmpeg(self):
        """Verifica que ffmpeg està disponible"""
        try:
            subprocess.run(
                ['ffmpeg', '-version'],
                capture_output=True,
                check=True
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.warning("ffmpeg no trobat. La detecció d'intros no funcionarà.")
            raise RuntimeError("ffmpeg és necessari per la detecció d'intros")

    def propagate_intro_to_episodes(self, reference_episode_id: int, intro_start: float, intro_end: float) -> Dict:
        """
        Propaga una intro marcada manualment a tots els episodis de la sèrie.

        Busca on apareix l'àudio de la intro de referència a cada episodi individualment.
        Això gestiona cold opens, variacions de timing, etc.
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Obtenir info de l'episodi de referència
        cursor.execute("""
            SELECT id, file_path, series_id, season_number, episode_number
            FROM media_files WHERE id = ?
        """, (reference_episode_id,))
        ref_ep = cursor.fetchone()

        if not ref_ep:
            conn.close()
            return {"status": "error", "message": "Episodi de referència no trobat"}

        # Obtenir tots els episodis de la sèrie (mateixa temporada o totes)
        cursor.execute("""
            SELECT id, file_path, season_number, episode_number
            FROM media_files
            WHERE series_id = ? AND media_type = 'episode' AND id != ?
            ORDER BY season_number, episode_number
        """, (ref_ep["series_id"], reference_episode_id))

        other_episodes = cursor.fetchall()

        if not other_episodes:
            conn.close()
            return {"status": "error", "message": "No hi ha altres episodis a la sèrie"}

        logger.info(f"Extraient fingerprint de la intro de referència ({intro_start}s - {intro_end}s)...")

        # Extreure fingerprint de la intro de referència
        intro_duration = intro_end - intro_start
        ref_fingerprint = self._extract_fingerprint(
            ref_ep["file_path"],
            start=intro_start,
            duration=intro_duration
        )

        if not ref_fingerprint:
            conn.close()
            return {"status": "error", "message": "No s'ha pogut extreure l'àudio de la intro de referència"}

        results = {
            "status": "success",
            "reference_episode": reference_episode_id,
            "episodes_processed": 0,
            "episodes_found": 0,
            "episodes_not_found": 0,
            "details": []
        }

        # Buscar la intro a cada episodi
        for ep in other_episodes:
            logger.info(f"Buscant intro a T{ep['season_number']}E{ep['episode_number']}...")

            # Extreure fingerprint dels primers minuts de l'episodi
            ep_fingerprint = self._extract_fingerprint(
                ep["file_path"],
                start=0,
                duration=self.SCAN_END  # Buscar als primers 3 minuts
            )

            if not ep_fingerprint:
                results["details"].append({
                    "episode_id": ep["id"],
                    "season": ep["season_number"],
                    "episode": ep["episode_number"],
                    "status": "error",
                    "message": "No s'ha pogut extreure àudio"
                })
                continue

            results["episodes_processed"] += 1

            # Buscar on apareix la intro de referència
            found_position = self._find_intro_in_episode(ref_fingerprint, ep_fingerprint)

            if found_position is not None:
                # Convertir posició de chunks a segons
                found_start = found_position * self.CHUNK_SECONDS
                found_end = found_start + intro_duration

                # Guardar el segment per aquest episodi específic
                self._save_segment(
                    cursor,
                    ep["id"],
                    ref_ep["series_id"],
                    "intro",
                    found_start,
                    found_end,
                    "propagated",
                    confidence=0.9  # Alta confiança perquè ve de referència manual
                )

                results["episodes_found"] += 1
                results["details"].append({
                    "episode_id": ep["id"],
                    "season": ep["season_number"],
                    "episode": ep["episode_number"],
                    "status": "found",
                    "intro_start": found_start,
                    "intro_end": found_end
                })

                logger.info(f"  ✓ Intro trobada: {found_start}s - {found_end}s")
            else:
                results["episodes_not_found"] += 1
                results["details"].append({
                    "episode_id": ep["id"],
                    "season": ep["season_number"],
                    "episode": ep["episode_number"],
                    "status": "not_found",
                    "message": "No s'ha trobat la intro (potser no en té o és diferent)"
                })
                logger.info(f"  ✗ Intro no trobada")

        conn.commit()
        conn.close()

        return results

    def _find_intro_in_episode(self, ref_fingerprint: List[float], ep_fingerprint: List[float]) -> Optional[int]:
        """
        Busca on apareix el fingerprint de referència dins d'un episodi.
        Retorna la posició (chunk index) o None si no es troba.
        """
        ref_len = len(ref_fingerprint)
        if ref_len > len(ep_fingerprint):
            return None

        best_pos = None
        best_similarity = 0

        # Buscar amb finestra lliscant
        for i in range(len(ep_fingerprint) - ref_len + 1):
            segment = ep_fingerprint[i:i + ref_len]
            similarity = self._calculate_similarity(ref_fingerprint, segment)

            if similarity > best_similarity:
                best_similarity = similarity
                best_pos = i

        # Només retornar si la similitud és prou alta
        if best_similarity >= 0.70:  # 70% similitud mínim
            logger.debug(f"Millor match a posició {best_pos} amb similitud {best_similarity:.2f}")
            return best_pos

        return None

    def detect_intro_for_series(self, series_id: int, min_episodes: int = 2) -> Dict:
        """
        Detecta l'intro per tots els episodis d'una sèrie

        Compara l'àudio dels primers minuts de cada episodi per trobar
        segments que es repeteixen (l'intro)
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Obtenir episodis de la sèrie
        cursor.execute("""
            SELECT id, file_path, season_number, episode_number, duration
            FROM media_files
            WHERE series_id = ? AND media_type = 'episode'
            ORDER BY season_number, episode_number
        """, (series_id,))

        episodes = cursor.fetchall()

        if len(episodes) < min_episodes:
            conn.close()
            return {
                "status": "error",
                "message": f"Cal mínim {min_episodes} episodis per detectar intros"
            }

        logger.info(f"Analitzant {len(episodes)} episodis per detectar intro...")

        # Extreure fingerprints dels primers minuts de cada episodi
        fingerprints = []
        for ep in episodes[:10]:  # Analitzem màxim 10 episodis per eficiència
            fp = self._extract_fingerprint(
                ep["file_path"],
                start=self.SCAN_START,
                duration=self.SCAN_END
            )
            if fp:
                fingerprints.append({
                    "id": ep["id"],
                    "season": ep["season_number"],
                    "episode": ep["episode_number"],
                    "fingerprint": fp
                })

        if len(fingerprints) < min_episodes:
            conn.close()
            return {
                "status": "error",
                "message": "No s'ha pogut extreure l'àudio de prou episodis"
            }

        # Trobar el segment comú (l'intro)
        intro_result = self._find_common_segment(fingerprints)

        if intro_result:
            intro_start, intro_end, confidence = intro_result
            duration = intro_end - intro_start
            logger.info(f"Intro detectada: {intro_start}s - {intro_end}s (duració: {duration}s, confiança: {confidence:.2f})")

            # Validació extra: duració raonable
            if duration < self.MIN_INTRO_DURATION or duration > self.MAX_INTRO_DURATION:
                conn.close()
                return {
                    "status": "invalid",
                    "message": f"Duració detectada ({duration}s) fora de rang ({self.MIN_INTRO_DURATION}-{self.MAX_INTRO_DURATION}s)"
                }

            # Guardar per tots els episodis de la sèrie
            updated = 0
            for ep in episodes:
                self._save_segment(
                    cursor,
                    ep["id"],
                    series_id,
                    "intro",
                    intro_start,
                    intro_end,
                    "fingerprint",
                    confidence
                )
                updated += 1

            conn.commit()
            conn.close()

            return {
                "status": "success",
                "intro_start": intro_start,
                "intro_end": intro_end,
                "duration": duration,
                "confidence": confidence,
                "episodes_updated": updated
            }
        else:
            conn.close()
            return {
                "status": "not_found",
                "message": "No s'ha pogut detectar una intro consistent (confiança insuficient)"
            }

    def _extract_fingerprint(self, file_path: str, start: float, duration: float) -> Optional[List[float]]:
        """
        Extreu un fingerprint d'àudio d'un segment de vídeo

        Retorna una llista de valors que representen l'energia de l'àudio
        en diferents intervals de temps
        """
        if not os.path.exists(file_path):
            logger.warning(f"Fitxer no trobat: {file_path}")
            return None

        try:
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                tmp_path = tmp.name

            # Extreure àudio amb ffmpeg
            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start),
                '-t', str(duration),
                '-i', file_path,
                '-vn',  # No vídeo
                '-ac', '1',  # Mono
                '-ar', str(self.SAMPLE_RATE),
                '-f', 'wav',
                tmp_path
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=60
            )

            if result.returncode != 0:
                logger.warning(f"Error extraent àudio: {result.stderr.decode()[:200]}")
                return None

            # Llegir el WAV i calcular energia per chunks
            fingerprint = self._calculate_energy_fingerprint(tmp_path)

            # Netejar
            os.unlink(tmp_path)

            return fingerprint

        except Exception as e:
            logger.error(f"Error processant {file_path}: {e}")
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            return None

    def _calculate_energy_fingerprint(self, wav_path: str) -> List[float]:
        """
        Calcula un fingerprint basat en l'energia de l'àudio

        Divideix l'àudio en chunks i calcula l'energia (RMS) de cada chunk
        """
        try:
            with wave.open(wav_path, 'rb') as wav:
                n_channels = wav.getnchannels()
                sample_width = wav.getsampwidth()
                framerate = wav.getframerate()
                n_frames = wav.getnframes()

                # Llegir totes les mostres
                raw_data = wav.readframes(n_frames)

            # Convertir a valors numèrics
            if sample_width == 2:
                fmt = f"<{n_frames * n_channels}h"
                samples = list(struct.unpack(fmt, raw_data))
            else:
                # 8-bit
                samples = list(raw_data)
                samples = [s - 128 for s in samples]

            # Calcular energia per cada chunk
            chunk_size = int(self.SAMPLE_RATE * self.CHUNK_SECONDS)
            fingerprint = []

            for i in range(0, len(samples), chunk_size):
                chunk = samples[i:i + chunk_size]
                if len(chunk) < chunk_size // 2:
                    break

                # RMS (Root Mean Square) com a mesura d'energia
                rms = (sum(s * s for s in chunk) / len(chunk)) ** 0.5
                fingerprint.append(rms)

            # Normalitzar
            if fingerprint:
                max_val = max(fingerprint) or 1
                fingerprint = [v / max_val for v in fingerprint]

            return fingerprint

        except Exception as e:
            logger.error(f"Error llegint WAV: {e}")
            return []

    def _find_common_segment(self, fingerprints: List[Dict]) -> Optional[Tuple[float, float, float]]:
        """
        Troba el segment comú entre múltiples fingerprints

        Busca el patró que es repeteix en tots els episodis
        Retorna (start, end, confidence) o None
        """
        if len(fingerprints) < 2:
            return None

        # Usar el primer episodi com a referència
        ref = fingerprints[0]["fingerprint"]
        if not ref:
            return None

        best_match = None
        best_score = 0
        best_confidence = 0

        # Prioritzar duracions típiques d'intro (60-90 segons)
        typical_chunks = self.TYPICAL_INTRO_DURATION // self.CHUNK_SECONDS
        min_chunks = self.MIN_INTRO_DURATION // self.CHUNK_SECONDS
        max_chunks = self.MAX_INTRO_DURATION // self.CHUNK_SECONDS

        # Ordenar duracions per prioritzar les típiques
        duration_range = list(range(min_chunks, max_chunks + 1))
        duration_range.sort(key=lambda x: abs(x - typical_chunks))

        for duration_chunks in duration_range:
            # Només buscar als primers 60 segons (intro sempre comença aviat)
            max_start = min(60 // self.CHUNK_SECONDS, len(ref) - duration_chunks)

            for start_chunk in range(max_start):
                segment = ref[start_chunk:start_chunk + duration_chunks]

                # Comprovar si aquest segment apareix en altres episodis
                # i a una posició similar (l'intro hauria d'estar al mateix lloc)
                matches = 0
                position_matches = 0

                for fp_data in fingerprints[1:]:
                    fp = fp_data["fingerprint"]
                    match_pos = self._find_segment_position(segment, fp)
                    if match_pos is not None:
                        matches += 1
                        # L'intro hauria d'estar a una posició similar (±10 segons)
                        if abs(match_pos - start_chunk) <= 10:
                            position_matches += 1

                match_ratio = matches / (len(fingerprints) - 1)
                position_ratio = position_matches / (len(fingerprints) - 1)

                # Requerim alta coincidència i posició consistent
                if match_ratio >= self.MIN_MATCH_RATIO and position_ratio >= 0.7:
                    # Calcular score: preferim segments de duració típica
                    duration_score = 1.0 - (abs(duration_chunks - typical_chunks) / typical_chunks) * 0.3
                    score = match_ratio * position_ratio * duration_score

                    if score > best_score:
                        best_score = score
                        start_time = start_chunk * self.CHUNK_SECONDS
                        end_time = (start_chunk + duration_chunks) * self.CHUNK_SECONDS
                        # Confiança basada en match ratio i consistència de posició
                        confidence = (match_ratio + position_ratio) / 2
                        best_match = (start_time, end_time, confidence)
                        best_confidence = confidence

        # Només retornar si la confiança és prou alta
        if best_match and best_confidence >= 0.7:
            return best_match
        return None

    def _find_segment_position(self, segment: List[float], fingerprint: List[float]) -> Optional[int]:
        """
        Troba la posició on un segment apareix en un fingerprint
        Retorna la posició (chunk index) o None
        """
        if len(segment) > len(fingerprint):
            return None

        segment_len = len(segment)
        best_pos = None
        best_sim = 0

        for i in range(len(fingerprint) - segment_len + 1):
            similarity = self._calculate_similarity(
                segment,
                fingerprint[i:i + segment_len]
            )
            if similarity >= self.SIMILARITY_THRESHOLD and similarity > best_sim:
                best_sim = similarity
                best_pos = i

        return best_pos

    def _segment_exists_in(self, segment: List[float], fingerprint: List[float]) -> bool:
        """
        Comprova si un segment existeix dins d'un fingerprint

        Usa correlació simple per trobar coincidències
        """
        if len(segment) > len(fingerprint):
            return False

        segment_len = len(segment)

        # Buscar el segment en el fingerprint
        for i in range(len(fingerprint) - segment_len + 1):
            # Calcular similitud
            similarity = self._calculate_similarity(
                segment,
                fingerprint[i:i + segment_len]
            )
            if similarity >= self.SIMILARITY_THRESHOLD:
                return True

        return False

    def _calculate_similarity(self, a: List[float], b: List[float]) -> float:
        """
        Calcula la similitud entre dos vectors

        Usa correlació normalitzada
        """
        if len(a) != len(b) or not a:
            return 0.0

        # Diferència absoluta mitjana
        diff = sum(abs(x - y) for x, y in zip(a, b)) / len(a)

        # Convertir a similitud (0 = idèntic, 1 = molt diferent)
        similarity = 1.0 - min(diff, 1.0)

        return similarity

    def _save_segment(self, cursor, media_id: int, series_id: int,
                      segment_type: str, start: float, end: float, source: str,
                      confidence: float = 1.0):
        """Guarda un segment a la base de dades amb confiança"""
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
                SET start_time = ?, end_time = ?, source = ?, confidence = ?
                WHERE id = ?
            """, (start, end, source, confidence, existing["id"]))
        else:
            # Inserir nou
            cursor.execute("""
                INSERT INTO media_segments
                (media_id, series_id, segment_type, start_time, end_time, source, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (media_id, series_id, segment_type, start, end, source, confidence))


def detect_intros_for_all_series():
    """Detecta intros per totes les sèries de la biblioteca"""
    conn = sqlite3.connect(settings.DATABASE_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT DISTINCT s.id, s.name
        FROM series s
        JOIN media_files mf ON mf.series_id = s.id
        GROUP BY s.id
        HAVING COUNT(mf.id) >= 2
    """)

    series_list = cursor.fetchall()
    conn.close()

    fingerprinter = AudioFingerprinter()
    results = []

    for series_id, name in series_list:
        logger.info(f"\n{'='*50}")
        logger.info(f"Processant: {name}")

        result = fingerprinter.detect_intro_for_series(series_id)
        result["series_name"] = name
        results.append(result)

        if result["status"] == "success":
            logger.info(f"✓ Intro trobada: {result['intro_start']}s - {result['intro_end']}s")
        else:
            logger.info(f"✗ {result.get('message', 'No trobada')}")

    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Detecta intros usant audio fingerprinting")
    parser.add_argument("--series", type=int, help="ID de la sèrie a processar")
    parser.add_argument("--all", action="store_true", help="Processar totes les sèries")

    args = parser.parse_args()

    if args.series:
        fp = AudioFingerprinter()
        result = fp.detect_intro_for_series(args.series)
        print(json.dumps(result, indent=2))
    elif args.all:
        results = detect_intros_for_all_series()
        print(json.dumps(results, indent=2))
    else:
        parser.print_help()
