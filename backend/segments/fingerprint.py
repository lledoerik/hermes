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

    # Configuració per defecte
    SAMPLE_RATE = 8000  # Hz (baixa qualitat per processar més ràpid)
    CHUNK_SECONDS = 2   # Segons per chunk d'anàlisi
    MAX_INTRO_DURATION = 180  # Màxim 3 minuts d'intro
    MIN_INTRO_DURATION = 30   # Mínim 30 segons
    SIMILARITY_THRESHOLD = 0.75  # 75% similitud per considerar match
    SCAN_START = 0      # On començar a buscar l'intro (segons)
    SCAN_END = 240      # On acabar de buscar (4 minuts)

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
        intro_times = self._find_common_segment(fingerprints)

        if intro_times:
            intro_start, intro_end = intro_times
            logger.info(f"Intro detectada: {intro_start}s - {intro_end}s")

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
                    "fingerprint"
                )
                updated += 1

            conn.commit()
            conn.close()

            return {
                "status": "success",
                "intro_start": intro_start,
                "intro_end": intro_end,
                "episodes_updated": updated
            }
        else:
            conn.close()
            return {
                "status": "not_found",
                "message": "No s'ha pogut detectar una intro consistent"
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

    def _find_common_segment(self, fingerprints: List[Dict]) -> Optional[Tuple[float, float]]:
        """
        Troba el segment comú entre múltiples fingerprints

        Busca el patró que es repeteix en tots els episodis
        """
        if len(fingerprints) < 2:
            return None

        # Usar el primer episodi com a referència
        ref = fingerprints[0]["fingerprint"]
        if not ref:
            return None

        # Per cada posició possible d'inici d'intro
        best_match = None
        best_score = 0

        # Buscar segments de diferents longituds
        for duration_chunks in range(
            self.MIN_INTRO_DURATION // self.CHUNK_SECONDS,
            self.MAX_INTRO_DURATION // self.CHUNK_SECONDS + 1
        ):
            for start_chunk in range(len(ref) - duration_chunks):
                segment = ref[start_chunk:start_chunk + duration_chunks]

                # Comprovar si aquest segment apareix en altres episodis
                matches = 0
                for fp_data in fingerprints[1:]:
                    fp = fp_data["fingerprint"]
                    if self._segment_exists_in(segment, fp):
                        matches += 1

                # Calcular score (preferim segments més llargs)
                match_ratio = matches / (len(fingerprints) - 1)
                if match_ratio >= self.SIMILARITY_THRESHOLD:
                    score = match_ratio * duration_chunks  # Bonus per duració
                    if score > best_score:
                        best_score = score
                        start_time = start_chunk * self.CHUNK_SECONDS
                        end_time = (start_chunk + duration_chunks) * self.CHUNK_SECONDS
                        best_match = (start_time, end_time)

        return best_match

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
