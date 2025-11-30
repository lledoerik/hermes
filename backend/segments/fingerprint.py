#!/usr/bin/env python3
"""
Hermes Audio Fingerprinting v2
Detecta intros/outros comparant segments d'àudio entre episodis consecutius.

Algorisme:
1. Per cada parell d'episodis consecutius, compara segments d'àudio
2. Els segments iguals als primers 5 minuts = opening candidat
3. Verifica consistència entre múltiples episodis
4. Detecta canvis d'opening automàticament
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
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np

sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class IntroMatch:
    """Representa un match d'intro trobat"""
    episode_id: int
    start_time: float
    end_time: float
    confidence: float
    opening_group: int  # Grup d'opening (per detectar canvis)


@dataclass
class OpeningGroup:
    """Grup d'episodis amb el mateix opening"""
    group_id: int
    episodes: List[int]
    intro_start: float
    intro_end: float
    reference_fingerprint: List[float]


class AudioFingerprinterV2:
    """
    Detecta intros comparant àudio entre episodis consecutius.

    Funciona amb qualsevol sèrie, incloses les que tenen:
    - Cold opens (escenes abans de l'opening)
    - Canvis d'opening entre temporades/arcs
    - Intros de duració variable
    """

    # Configuració
    SAMPLE_RATE = 8000          # Hz (baixa qualitat per velocitat)
    CHUNK_SECONDS = 5           # Segons per chunk (més gran = més robust)
    CHUNK_OVERLAP = 2.5         # Overlap entre chunks (segons)
    MAX_SCAN_MINUTES = 5        # Buscar als primers 5 minuts
    MIN_INTRO_DURATION = 30     # Mínim 30 segons
    MAX_INTRO_DURATION = 150    # Màxim 2.5 minuts
    SIMILARITY_THRESHOLD = 0.75 # 75% similitud per considerar match
    MIN_CONSECUTIVE_MATCHES = 6 # Mínim 6 chunks consecutius (30s amb overlap)
    CHANGE_THRESHOLD = 0.40     # Si <40% coincideix, potser canvi d'opening

    def __init__(self):
        self.db_path = settings.DATABASE_PATH
        self._check_ffmpeg()

    def _check_ffmpeg(self):
        """Verifica que ffmpeg està disponible"""
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            raise RuntimeError("ffmpeg és necessari per la detecció d'intros")

    def detect_intros_for_series(self, series_id: int) -> Dict:
        """
        Detecta intros per una sèrie comparant episodis consecutius.

        Algorisme:
        1. Agrupa episodis per temporada
        2. Per cada parell consecutiu, troba segments iguals
        3. Verifica consistència i detecta canvis d'opening
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Obtenir episodis ordenats
        cursor.execute("""
            SELECT id, file_path, season_number, episode_number, duration
            FROM media_files
            WHERE series_id = ? AND media_type = 'episode'
            ORDER BY season_number, episode_number
        """, (series_id,))

        episodes = [dict(row) for row in cursor.fetchall()]

        if len(episodes) < 2:
            conn.close()
            return {"status": "error", "message": "Cal mínim 2 episodis"}

        logger.info(f"Analitzant {len(episodes)} episodis...")

        # Extreure fingerprints de tots els episodis
        logger.info("Extraient fingerprints...")
        fingerprints = {}
        for ep in episodes:
            fp = self._extract_fingerprint_chunks(ep["file_path"])
            if fp:
                fingerprints[ep["id"]] = {
                    "episode": ep,
                    "chunks": fp
                }
                logger.info(f"  T{ep['season_number']}E{ep['episode_number']}: {len(fp)} chunks")

        if len(fingerprints) < 2:
            conn.close()
            return {"status": "error", "message": "No s'han pogut extreure prou fingerprints"}

        # Comparar episodis consecutius per trobar segments comuns
        logger.info("Comparant episodis consecutius...")
        intro_matches = self._find_intros_by_comparison(episodes, fingerprints)

        if not intro_matches:
            conn.close()
            return {"status": "not_found", "message": "No s'han trobat intros consistents"}

        # Agrupar per opening (detectar canvis)
        opening_groups = self._group_by_opening(intro_matches, fingerprints)

        # Guardar resultats
        saved_count = 0
        for match in intro_matches:
            self._save_segment(
                cursor,
                match.episode_id,
                series_id,
                "intro",
                match.start_time,
                match.end_time,
                "fingerprint_v2",
                match.confidence
            )
            saved_count += 1

        conn.commit()
        conn.close()

        # Preparar resum
        result = {
            "status": "success",
            "episodes_processed": len(fingerprints),
            "episodes_with_intro": saved_count,
            "opening_groups": len(opening_groups),
            "details": []
        }

        for group_id, group in opening_groups.items():
            result["details"].append({
                "opening_group": group_id,
                "episodes": len(group["episodes"]),
                "intro_start": group["intro_start"],
                "intro_end": group["intro_end"],
                "duration": group["intro_end"] - group["intro_start"]
            })

        return result

    def _extract_fingerprint_chunks(self, file_path: str) -> Optional[List[Dict]]:
        """
        Extreu fingerprints dels primers minuts dividits en chunks amb overlap.

        Retorna llista de chunks amb:
        - start_time: inici del chunk
        - fingerprint: vector de característiques
        """
        if not os.path.exists(file_path):
            logger.warning(f"Fitxer no trobat: {file_path}")
            return None

        try:
            # Extreure àudio dels primers minuts
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                tmp_path = tmp.name

            duration = self.MAX_SCAN_MINUTES * 60
            cmd = [
                'ffmpeg', '-y',
                '-t', str(duration),
                '-i', file_path,
                '-vn', '-ac', '1',
                '-ar', str(self.SAMPLE_RATE),
                '-f', 'wav',
                tmp_path
            ]

            result = subprocess.run(cmd, capture_output=True, timeout=120)
            if result.returncode != 0:
                return None

            # Llegir àudio i crear chunks
            chunks = self._create_audio_chunks(tmp_path)
            os.unlink(tmp_path)
            return chunks

        except Exception as e:
            logger.error(f"Error processant {file_path}: {e}")
            return None

    def _create_audio_chunks(self, wav_path: str) -> List[Dict]:
        """Crea chunks amb overlap i calcula fingerprint per cada un"""
        try:
            with wave.open(wav_path, 'rb') as wav:
                sample_width = wav.getsampwidth()
                n_frames = wav.getnframes()
                raw_data = wav.readframes(n_frames)

            # Convertir a numpy array
            if sample_width == 2:
                samples = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32)
            else:
                samples = np.frombuffer(raw_data, dtype=np.uint8).astype(np.float32) - 128

            # Normalitzar
            max_val = np.max(np.abs(samples)) or 1
            samples = samples / max_val

            # Crear chunks amb overlap
            chunk_samples = int(self.CHUNK_SECONDS * self.SAMPLE_RATE)
            hop_samples = int((self.CHUNK_SECONDS - self.CHUNK_OVERLAP) * self.SAMPLE_RATE)

            chunks = []
            pos = 0

            while pos + chunk_samples <= len(samples):
                chunk_data = samples[pos:pos + chunk_samples]
                start_time = pos / self.SAMPLE_RATE

                # Calcular fingerprint del chunk
                fingerprint = self._compute_chunk_fingerprint(chunk_data)

                chunks.append({
                    "start_time": start_time,
                    "fingerprint": fingerprint
                })

                pos += hop_samples

            return chunks

        except Exception as e:
            logger.error(f"Error creant chunks: {e}")
            return []

    def _compute_chunk_fingerprint(self, samples: np.ndarray) -> np.ndarray:
        """
        Calcula un fingerprint robust per un chunk d'àudio.

        Usa múltiples característiques:
        - Energia per bandes de freqüència (pseudo-spectral)
        - Zero crossing rate
        - Estadístiques temporals
        """
        n_bands = 16  # Bandes de freqüència
        band_size = len(samples) // n_bands

        features = []

        # Energia per bandes temporals (simula bandes espectrals)
        for i in range(n_bands):
            band = samples[i * band_size:(i + 1) * band_size]
            energy = np.sqrt(np.mean(band ** 2))
            features.append(energy)

        # Zero crossing rate per segments
        n_segments = 8
        seg_size = len(samples) // n_segments
        for i in range(n_segments):
            seg = samples[i * seg_size:(i + 1) * seg_size]
            zcr = np.sum(np.abs(np.diff(np.signbit(seg)))) / len(seg)
            features.append(zcr)

        # Estadístiques globals
        features.append(np.std(samples))
        features.append(np.mean(np.abs(samples)))

        return np.array(features, dtype=np.float32)

    def _find_intros_by_comparison(self, episodes: List[Dict],
                                    fingerprints: Dict) -> List[IntroMatch]:
        """
        Troba intros comparant parells d'episodis consecutius.

        Algorisme:
        1. Per cada parell consecutiu, troba chunks que coincideixen
        2. Busca seqüències de chunks consecutius iguals
        3. La seqüència més llarga als primers minuts = intro
        """
        intro_matches = []
        episode_ids = [ep["id"] for ep in episodes if ep["id"] in fingerprints]

        if len(episode_ids) < 2:
            return []

        # Primera passada: comparar episodis consecutius
        pair_matches = []

        for i in range(len(episode_ids) - 1):
            ep1_id = episode_ids[i]
            ep2_id = episode_ids[i + 1]

            ep1 = fingerprints[ep1_id]
            ep2 = fingerprints[ep2_id]

            logger.info(f"  Comparant T{ep1['episode']['season_number']}E{ep1['episode']['episode_number']} "
                       f"amb T{ep2['episode']['season_number']}E{ep2['episode']['episode_number']}...")

            # Trobar chunks coincidents
            matches = self._find_matching_chunks(ep1["chunks"], ep2["chunks"])

            if matches:
                pair_matches.append({
                    "ep1_id": ep1_id,
                    "ep2_id": ep2_id,
                    "matches": matches
                })
                logger.info(f"    Trobats {len(matches)} segments coincidents")
            else:
                logger.info(f"    Cap coincidència trobada (possible canvi d'opening)")

        if not pair_matches:
            return []

        # Segona passada: consolidar intros
        # Usar el match més freqüent com a referència
        intro_times = self._consolidate_intro_times(pair_matches, fingerprints)

        # Crear IntroMatch per cada episodi
        opening_group = 0
        last_intro = None

        for ep_id in episode_ids:
            if ep_id in intro_times:
                intro_start, intro_end, confidence = intro_times[ep_id]

                # Detectar canvi d'opening (diferència gran en timing o sense match)
                if last_intro is not None:
                    time_diff = abs(intro_start - last_intro[0]) + abs(intro_end - last_intro[1])
                    if time_diff > 30:  # Més de 30s de diferència
                        opening_group += 1

                intro_matches.append(IntroMatch(
                    episode_id=ep_id,
                    start_time=intro_start,
                    end_time=intro_end,
                    confidence=confidence,
                    opening_group=opening_group
                ))
                last_intro = (intro_start, intro_end)

        return intro_matches

    def _find_matching_chunks(self, chunks1: List[Dict],
                               chunks2: List[Dict]) -> List[Dict]:
        """
        Troba chunks coincidents entre dos episodis.

        Retorna llista de matches amb posició a cada episodi.
        """
        matches = []

        for i, c1 in enumerate(chunks1):
            best_match = None
            best_similarity = 0

            for j, c2 in enumerate(chunks2):
                similarity = self._compute_similarity(c1["fingerprint"], c2["fingerprint"])

                if similarity > self.SIMILARITY_THRESHOLD and similarity > best_similarity:
                    best_similarity = similarity
                    best_match = {
                        "chunk1_idx": i,
                        "chunk2_idx": j,
                        "time1": c1["start_time"],
                        "time2": c2["start_time"],
                        "similarity": similarity
                    }

            if best_match:
                matches.append(best_match)

        # Filtrar per trobar seqüències consecutives (l'intro real)
        consecutive_matches = self._find_consecutive_sequences(matches)

        return consecutive_matches

    def _find_consecutive_sequences(self, matches: List[Dict]) -> List[Dict]:
        """
        Troba la seqüència més llarga de chunks consecutius.
        Això elimina coincidències espúries i troba l'intro real.
        """
        if not matches:
            return []

        # Ordenar per posició al primer episodi
        matches = sorted(matches, key=lambda x: x["chunk1_idx"])

        # Trobar seqüències consecutives
        sequences = []
        current_seq = [matches[0]]

        for i in range(1, len(matches)):
            prev = matches[i - 1]
            curr = matches[i]

            # Consecutiu si els índexs són adjacents (±1)
            if (abs(curr["chunk1_idx"] - prev["chunk1_idx"]) <= 2 and
                abs(curr["chunk2_idx"] - prev["chunk2_idx"]) <= 2):
                current_seq.append(curr)
            else:
                if len(current_seq) >= self.MIN_CONSECUTIVE_MATCHES:
                    sequences.append(current_seq)
                current_seq = [curr]

        if len(current_seq) >= self.MIN_CONSECUTIVE_MATCHES:
            sequences.append(current_seq)

        if not sequences:
            return []

        # Retornar la seqüència més llarga
        best_seq = max(sequences, key=len)
        return best_seq

    def _compute_similarity(self, fp1: np.ndarray, fp2: np.ndarray) -> float:
        """Calcula similitud entre dos fingerprints usant correlació"""
        if len(fp1) != len(fp2):
            return 0.0

        # Normalitzar
        fp1_norm = fp1 / (np.linalg.norm(fp1) + 1e-10)
        fp2_norm = fp2 / (np.linalg.norm(fp2) + 1e-10)

        # Correlació (producte escalar de vectors normalitzats)
        correlation = np.dot(fp1_norm, fp2_norm)

        # Convertir a rang [0, 1]
        similarity = (correlation + 1) / 2

        return float(similarity)

    def _consolidate_intro_times(self, pair_matches: List[Dict],
                                  fingerprints: Dict) -> Dict[int, Tuple[float, float, float]]:
        """
        Consolida els temps d'intro per tots els episodis.

        Retorna dict: episode_id -> (start, end, confidence)
        """
        intro_times = {}

        for pair in pair_matches:
            matches = pair["matches"]
            if not matches:
                continue

            ep1_id = pair["ep1_id"]
            ep2_id = pair["ep2_id"]

            # Calcular temps d'intro per cada episodi del parell
            # L'intro comença al primer chunk coincident i acaba a l'últim

            # Per episodi 1
            start1 = min(m["time1"] for m in matches)
            end1 = max(m["time1"] for m in matches) + self.CHUNK_SECONDS
            confidence1 = np.mean([m["similarity"] for m in matches])

            # Per episodi 2
            start2 = min(m["time2"] for m in matches)
            end2 = max(m["time2"] for m in matches) + self.CHUNK_SECONDS
            confidence2 = np.mean([m["similarity"] for m in matches])

            # Validar duració
            duration1 = end1 - start1
            duration2 = end2 - start2

            if self.MIN_INTRO_DURATION <= duration1 <= self.MAX_INTRO_DURATION:
                if ep1_id not in intro_times or confidence1 > intro_times[ep1_id][2]:
                    intro_times[ep1_id] = (start1, end1, float(confidence1))

            if self.MIN_INTRO_DURATION <= duration2 <= self.MAX_INTRO_DURATION:
                if ep2_id not in intro_times or confidence2 > intro_times[ep2_id][2]:
                    intro_times[ep2_id] = (start2, end2, float(confidence2))

        return intro_times

    def _group_by_opening(self, intro_matches: List[IntroMatch],
                          fingerprints: Dict) -> Dict[int, Dict]:
        """Agrupa episodis per opening (detecta canvis)"""
        groups = {}

        for match in intro_matches:
            group_id = match.opening_group

            if group_id not in groups:
                groups[group_id] = {
                    "episodes": [],
                    "intro_start": match.start_time,
                    "intro_end": match.end_time
                }

            groups[group_id]["episodes"].append(match.episode_id)
            # Actualitzar temps amb mitjana
            n = len(groups[group_id]["episodes"])
            groups[group_id]["intro_start"] = (
                (groups[group_id]["intro_start"] * (n-1) + match.start_time) / n
            )
            groups[group_id]["intro_end"] = (
                (groups[group_id]["intro_end"] * (n-1) + match.end_time) / n
            )

        return groups

    def _save_segment(self, cursor, media_id: int, series_id: int,
                      segment_type: str, start: float, end: float,
                      source: str, confidence: float = 1.0):
        """Guarda un segment a la base de dades"""
        cursor.execute("""
            SELECT id FROM media_segments
            WHERE media_id = ? AND segment_type = ?
        """, (media_id, segment_type))

        existing = cursor.fetchone()
        if existing:
            cursor.execute("""
                UPDATE media_segments
                SET start_time = ?, end_time = ?, source = ?, confidence = ?
                WHERE id = ?
            """, (start, end, source, confidence, existing["id"]))
        else:
            cursor.execute("""
                INSERT INTO media_segments
                (media_id, series_id, segment_type, start_time, end_time, source, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (media_id, series_id, segment_type, start, end, source, confidence))

    # ============================================================
    # PROPAGACIÓ MANUAL (manté compatibilitat amb l'antic sistema)
    # ============================================================

    def propagate_intro_to_episodes(self, reference_episode_id: int,
                                     intro_start: float, intro_end: float) -> Dict:
        """
        Propaga una intro marcada manualment a tots els episodis de la sèrie.
        Busca on apareix l'àudio de la intro de referència a cada episodi.
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, file_path, series_id, season_number, episode_number
            FROM media_files WHERE id = ?
        """, (reference_episode_id,))
        ref_ep = cursor.fetchone()

        if not ref_ep:
            conn.close()
            return {"status": "error", "message": "Episodi de referència no trobat"}

        cursor.execute("""
            SELECT id, file_path, season_number, episode_number
            FROM media_files
            WHERE series_id = ? AND media_type = 'episode' AND id != ?
            ORDER BY season_number, episode_number
        """, (ref_ep["series_id"], reference_episode_id))

        other_episodes = cursor.fetchall()

        if not other_episodes:
            conn.close()
            return {"status": "error", "message": "No hi ha altres episodis"}

        logger.info(f"Extraient fingerprint de la intro de referència...")

        # Extreure chunks de la intro de referència
        ref_chunks = self._extract_intro_fingerprint(
            ref_ep["file_path"], intro_start, intro_end
        )

        if not ref_chunks:
            conn.close()
            return {"status": "error", "message": "No s'ha pogut extreure l'àudio de referència"}

        results = {
            "status": "success",
            "reference_episode": reference_episode_id,
            "episodes_processed": 0,
            "episodes_found": 0,
            "episodes_not_found": 0,
            "details": []
        }

        intro_duration = intro_end - intro_start

        for ep in other_episodes:
            ep_dict = dict(ep)
            logger.info(f"Buscant intro a T{ep_dict['season_number']}E{ep_dict['episode_number']}...")

            # Extreure chunks dels primers minuts
            ep_chunks = self._extract_fingerprint_chunks(ep_dict["file_path"])

            if not ep_chunks:
                results["details"].append({
                    "episode_id": ep_dict["id"],
                    "status": "error",
                    "message": "No s'ha pogut extreure àudio"
                })
                continue

            results["episodes_processed"] += 1

            # Buscar on apareix la intro
            found_position = self._find_intro_position(ref_chunks, ep_chunks)

            if found_position is not None:
                found_start = found_position
                found_end = found_start + intro_duration

                self._save_segment(
                    cursor, ep_dict["id"], ref_ep["series_id"],
                    "intro", found_start, found_end, "propagated", 0.9
                )

                results["episodes_found"] += 1
                results["details"].append({
                    "episode_id": ep_dict["id"],
                    "status": "found",
                    "intro_start": found_start,
                    "intro_end": found_end
                })
                logger.info(f"  [OK] Intro trobada: {found_start:.1f}s - {found_end:.1f}s")
            else:
                results["episodes_not_found"] += 1
                results["details"].append({
                    "episode_id": ep_dict["id"],
                    "status": "not_found"
                })
                logger.info(f"  [--] Intro no trobada")

        conn.commit()
        conn.close()
        return results

    def _extract_intro_fingerprint(self, file_path: str,
                                    start: float, end: float) -> Optional[List[Dict]]:
        """Extreu fingerprint d'un segment específic (la intro)"""
        if not os.path.exists(file_path):
            return None

        try:
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                tmp_path = tmp.name

            duration = end - start
            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start),
                '-t', str(duration),
                '-i', file_path,
                '-vn', '-ac', '1',
                '-ar', str(self.SAMPLE_RATE),
                '-f', 'wav',
                tmp_path
            ]

            result = subprocess.run(cmd, capture_output=True, timeout=60)
            if result.returncode != 0:
                return None

            chunks = self._create_audio_chunks(tmp_path)
            os.unlink(tmp_path)
            return chunks

        except Exception as e:
            logger.error(f"Error: {e}")
            return None

    def _find_intro_position(self, ref_chunks: List[Dict],
                              ep_chunks: List[Dict]) -> Optional[float]:
        """Troba on apareix la intro de referència a l'episodi"""
        if not ref_chunks or not ep_chunks:
            return None

        best_position = None
        best_score = 0

        # Sliding window
        for start_idx in range(len(ep_chunks) - len(ref_chunks) + 1):
            score = 0
            for i, ref_chunk in enumerate(ref_chunks):
                ep_chunk = ep_chunks[start_idx + i]
                similarity = self._compute_similarity(
                    ref_chunk["fingerprint"],
                    ep_chunk["fingerprint"]
                )
                if similarity > self.SIMILARITY_THRESHOLD:
                    score += similarity

            if score > best_score:
                best_score = score
                best_position = ep_chunks[start_idx]["start_time"]

        # Requerim que almenys 50% dels chunks coincideixin
        min_score = len(ref_chunks) * 0.5 * self.SIMILARITY_THRESHOLD
        if best_score >= min_score:
            return best_position

        return None


# ============================================================
# FUNCIONS PER ESCANEJAR TOTA LA BIBLIOTECA
# ============================================================

def detect_intros_for_all_series(progress_callback=None) -> Dict:
    """
    Detecta intros per totes les sèries de la biblioteca.

    Args:
        progress_callback: Funció opcional per reportar progrés
                          callback(current, total, series_name, status)
    """
    conn = sqlite3.connect(settings.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Obtenir sèries amb almenys 2 episodis
    cursor.execute("""
        SELECT DISTINCT s.id, s.name,
               COUNT(mf.id) as episode_count
        FROM series s
        JOIN media_files mf ON mf.series_id = s.id
        WHERE mf.media_type = 'episode'
        GROUP BY s.id
        HAVING COUNT(mf.id) >= 2
        ORDER BY s.name
    """)

    series_list = [dict(row) for row in cursor.fetchall()]
    conn.close()

    if not series_list:
        return {
            "status": "error",
            "message": "No hi ha sèries amb prou episodis"
        }

    fingerprinter = AudioFingerprinterV2()
    results = {
        "status": "success",
        "total_series": len(series_list),
        "series_processed": 0,
        "series_with_intros": 0,
        "series_failed": 0,
        "total_episodes_with_intros": 0,
        "details": []
    }

    for i, series in enumerate(series_list):
        series_name = series["name"]
        series_id = series["id"]

        logger.info(f"\n{'='*60}")
        logger.info(f"[{i+1}/{len(series_list)}] Processant: {series_name}")
        logger.info(f"{'='*60}")

        if progress_callback:
            progress_callback(i, len(series_list), series_name, "processing")

        try:
            result = fingerprinter.detect_intros_for_series(series_id)
            result["series_name"] = series_name
            result["series_id"] = series_id
            results["details"].append(result)
            results["series_processed"] += 1

            if result["status"] == "success":
                results["series_with_intros"] += 1
                results["total_episodes_with_intros"] += result.get("episodes_with_intro", 0)
                logger.info(f"[OK] Intros trobades per {result.get('episodes_with_intro', 0)} episodis")

                # Mostrar grups d'opening si n'hi ha més d'un
                if result.get("opening_groups", 1) > 1:
                    logger.info(f"  Detectats {result['opening_groups']} openings diferents")
            else:
                results["series_failed"] += 1
                logger.info(f"[!!] {result.get('message', 'Error desconegut')}")

        except Exception as e:
            logger.error(f"Error processant {series_name}: {e}")
            results["series_failed"] += 1
            results["details"].append({
                "series_name": series_name,
                "series_id": series_id,
                "status": "error",
                "message": str(e)
            })

        if progress_callback:
            progress_callback(i + 1, len(series_list), series_name,
                            "success" if result.get("status") == "success" else "failed")

    return results


def get_scan_status() -> Dict:
    """Retorna l'estat actual de l'escaneig (per UI)"""
    # Això es podria expandir per suportar escaneig en background
    return {"status": "idle"}


# Manté compatibilitat amb el nom antic
AudioFingerprinter = AudioFingerprinterV2


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Detecta intros amb fingerprinting v2")
    parser.add_argument("--series", type=int, help="ID de la sèrie")
    parser.add_argument("--all", action="store_true", help="Totes les sèries")
    parser.add_argument("--verbose", "-v", action="store_true", help="Mode verbose")

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.series:
        fp = AudioFingerprinterV2()
        result = fp.detect_intros_for_series(args.series)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.all:
        results = detect_intros_for_all_series()
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        parser.print_help()
