#!/usr/bin/env python3
"""
Hermes Audiobooks Scanner
Escaneja biblioteques d'audiollibres organitzades per autor/llibre
"""

import os
import sys
import sqlite3
import logging
import hashlib
import subprocess
import json
from pathlib import Path
from typing import List, Dict, Optional, Tuple

sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AudiobooksScanner:
    """Escaneja biblioteques d'audiollibres"""

    SUPPORTED_FORMATS = ['.mp3', '.m4a', '.m4b', '.ogg', '.flac', '.opus', '.aac']

    def __init__(self):
        self.db_path = settings.DATABASE_PATH
        self._init_database()
        self._check_ffprobe()

    def _check_ffprobe(self):
        """Comprova si ffprobe està disponible"""
        self.ffprobe_available = False
        try:
            result = subprocess.run(
                ['ffprobe', '-version'],
                capture_output=True,
                timeout=10
            )
            if result.returncode == 0:
                self.ffprobe_available = True
                logger.info("ffprobe disponible per extreure metadades")
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            logger.warning("ffprobe no disponible. Les metadades d'àudio seran limitades.")

    def _init_database(self):
        """Inicialitza les taules per audiollibres"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Taula de narradors/autors d'audiollibres
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audiobook_authors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT UNIQUE NOT NULL,
                photo TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Taula d'audiollibres (una carpeta = un audiollibres)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audiobooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_id INTEGER,
                title TEXT NOT NULL,
                folder_path TEXT UNIQUE NOT NULL,
                cover TEXT,
                narrator TEXT,
                description TEXT,
                total_duration INTEGER DEFAULT 0,
                total_files INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES audiobook_authors(id)
            )
        """)

        # Taula de fitxers d'àudio (capítols/tracks)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audiobook_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                audiobook_id INTEGER NOT NULL,
                file_path TEXT UNIQUE NOT NULL,
                file_name TEXT NOT NULL,
                title TEXT,
                track_number INTEGER DEFAULT 0,
                duration INTEGER DEFAULT 0,
                file_size INTEGER DEFAULT 0,
                format TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (audiobook_id) REFERENCES audiobooks(id)
            )
        """)

        # Taula de progrés d'escolta
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audiobook_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT 1,
                audiobook_id INTEGER NOT NULL,
                current_file_id INTEGER,
                current_position INTEGER DEFAULT 0,
                total_listened INTEGER DEFAULT 0,
                percentage REAL DEFAULT 0,
                last_listened TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (audiobook_id) REFERENCES audiobooks(id),
                FOREIGN KEY (current_file_id) REFERENCES audiobook_files(id),
                UNIQUE(user_id, audiobook_id)
            )
        """)

        conn.commit()
        conn.close()
        logger.info("Base de dades d'audiollibres inicialitzada")

    def scan_all_libraries(self) -> Dict:
        """Escaneja totes les biblioteques d'audiollibres configurades"""
        results = {
            "status": "success",
            "libraries_scanned": 0,
            "authors_found": 0,
            "audiobooks_found": 0,
            "audiobooks_updated": 0,
            "errors": []
        }

        for library in settings.AUDIOBOOKS_LIBRARIES:
            logger.info(f"\n{'='*50}")
            logger.info(f"Escanejant biblioteca: {library['name']}")
            logger.info(f"Path: {library['path']}")
            logger.info(f"{'='*50}")

            if not os.path.exists(library['path']):
                error = f"Path no existeix: {library['path']}"
                logger.error(error)
                results["errors"].append(error)
                continue

            lib_result = self.scan_library(library['path'])
            results["libraries_scanned"] += 1
            results["authors_found"] += lib_result.get("authors_found", 0)
            results["audiobooks_found"] += lib_result.get("audiobooks_found", 0)
            results["audiobooks_updated"] += lib_result.get("audiobooks_updated", 0)

        return results

    def scan_library(self, library_path: str) -> Dict:
        """
        Escaneja una biblioteca d'audiollibres
        Estructura esperada: Biblioteca/Autor/Audiollibres/fitxers.mp3
        """
        result = {
            "authors_found": 0,
            "audiobooks_found": 0,
            "audiobooks_updated": 0
        }

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Iterar per carpetes d'autors
        for author_name in os.listdir(library_path):
            author_path = os.path.join(library_path, author_name)

            if not os.path.isdir(author_path):
                continue

            # Crear o obtenir autor
            author_id = self._get_or_create_author(cursor, author_name, author_path)
            result["authors_found"] += 1

            # Buscar audiollibres de l'autor (subcarpetes)
            for audiobook_name in os.listdir(author_path):
                audiobook_path = os.path.join(author_path, audiobook_name)

                if not os.path.isdir(audiobook_path):
                    # Potser és un audiollibres d'un sol fitxer
                    if self._is_audio_file(audiobook_path):
                        # Crear un audiollibres virtual per l'autor
                        try:
                            if self._add_or_update_audiobook(cursor, author_id, author_path, author_name, single_file=audiobook_path):
                                result["audiobooks_found"] += 1
                            else:
                                result["audiobooks_updated"] += 1
                        except Exception as e:
                            logger.error(f"    Error afegint audiollibres {audiobook_name}: {e}")
                    continue

                # És una carpeta - buscar fitxers d'àudio
                logger.info(f"    Carpeta: {audiobook_name}")
                audio_files = self._find_audio_files(audiobook_path)
                logger.info(f"    Fitxers àudio trobats: {len(audio_files)}")
                if audio_files:
                    try:
                        if self._add_or_update_audiobook(cursor, author_id, audiobook_path, audiobook_name):
                            result["audiobooks_found"] += 1
                        else:
                            result["audiobooks_updated"] += 1
                    except Exception as e:
                        logger.error(f"    Error afegint audiollibres {audiobook_name}: {e}")

            logger.info(f"  Autor: {author_name}")

        conn.commit()
        conn.close()

        return result

    def _is_audio_file(self, file_path: str) -> bool:
        """Comprova si un fitxer és un format d'àudio suportat"""
        ext = os.path.splitext(file_path)[1].lower()
        return ext in self.SUPPORTED_FORMATS

    def _find_audio_files(self, folder_path: str) -> List[str]:
        """Troba tots els fitxers d'àudio en una carpeta"""
        audio_files = []
        for item in os.listdir(folder_path):
            item_path = os.path.join(folder_path, item)
            if os.path.isfile(item_path) and self._is_audio_file(item_path):
                audio_files.append(item_path)
        return sorted(audio_files)

    def _get_or_create_author(self, cursor, name: str, path: str) -> int:
        """Obté o crea un autor d'audiollibres"""
        cursor.execute("SELECT id FROM audiobook_authors WHERE path = ?", (path,))
        existing = cursor.fetchone()

        if existing:
            return existing["id"]

        cursor.execute("""
            INSERT INTO audiobook_authors (name, path)
            VALUES (?, ?)
        """, (name, path))

        return cursor.lastrowid

    def _add_or_update_audiobook(self, cursor, author_id: int, folder_path: str, title: str, single_file: str = None) -> bool:
        """Afegeix o actualitza un audiollibres. Retorna True si és nou."""
        # Comprovar si ja existeix
        cursor.execute("SELECT id FROM audiobooks WHERE folder_path = ?", (folder_path,))
        existing = cursor.fetchone()

        # Buscar fitxers d'àudio
        if single_file:
            audio_files = [single_file]
        else:
            audio_files = self._find_audio_files(folder_path)

        if not audio_files:
            return False

        # Buscar portada
        cover = self._find_cover(folder_path if not single_file else os.path.dirname(folder_path))

        # Calcular durada total
        total_duration = 0
        file_infos = []
        for i, audio_file in enumerate(audio_files):
            info = self._get_audio_info(audio_file)
            info['track_number'] = i + 1
            file_infos.append(info)
            total_duration += info.get('duration', 0)

        if existing:
            audiobook_id = existing["id"]
            # Actualitzar
            cursor.execute("""
                UPDATE audiobooks SET
                    author_id = ?, title = ?, cover = ?,
                    total_duration = ?, total_files = ?
                WHERE id = ?
            """, (
                author_id, title, cover,
                total_duration, len(audio_files), audiobook_id
            ))

            # Eliminar fitxers antics i afegir nous
            cursor.execute("DELETE FROM audiobook_files WHERE audiobook_id = ?", (audiobook_id,))

            for info in file_infos:
                self._add_audio_file(cursor, audiobook_id, info)

            return False
        else:
            # Inserir nou
            cursor.execute("""
                INSERT INTO audiobooks (
                    author_id, title, folder_path, cover,
                    total_duration, total_files
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (
                author_id, title, folder_path, cover,
                total_duration, len(audio_files)
            ))

            audiobook_id = cursor.lastrowid

            # Afegir fitxers
            for info in file_infos:
                self._add_audio_file(cursor, audiobook_id, info)

            logger.info(f"    + {title} ({len(audio_files)} fitxers, {self._format_duration(total_duration)})")
            return True

    def _add_audio_file(self, cursor, audiobook_id: int, info: Dict):
        """Afegeix un fitxer d'àudio a la base de dades"""
        cursor.execute("""
            INSERT INTO audiobook_files (
                audiobook_id, file_path, file_name, title,
                track_number, duration, file_size, format
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            audiobook_id,
            info['file_path'],
            info['file_name'],
            info.get('title', info['file_name']),
            info.get('track_number', 0),
            info.get('duration', 0),
            info.get('file_size', 0),
            info.get('format', '')
        ))

    def _find_cover(self, folder_path: str) -> Optional[str]:
        """Busca una imatge de portada en la carpeta"""
        cover_names = ['cover', 'folder', 'front', 'albumart', 'album']
        cover_extensions = ['.jpg', '.jpeg', '.png', '.webp']

        for item in os.listdir(folder_path):
            item_lower = item.lower()
            item_path = os.path.join(folder_path, item)

            if not os.path.isfile(item_path):
                continue

            name, ext = os.path.splitext(item_lower)
            if ext in cover_extensions:
                if name in cover_names or 'cover' in name:
                    return item_path

        # Si no trobem res específic, agafar la primera imatge
        for item in os.listdir(folder_path):
            item_path = os.path.join(folder_path, item)
            if os.path.isfile(item_path):
                ext = os.path.splitext(item.lower())[1]
                if ext in cover_extensions:
                    return item_path

        return None

    def _get_audio_info(self, file_path: str) -> Dict:
        """Obté informació d'un fitxer d'àudio"""
        info = {
            'file_path': file_path,
            'file_name': os.path.basename(file_path),
            'format': os.path.splitext(file_path)[1].lower().replace('.', ''),
            'file_size': os.path.getsize(file_path),
            'duration': 0,
            'title': os.path.splitext(os.path.basename(file_path))[0]
        }

        if self.ffprobe_available:
            try:
                result = subprocess.run([
                    'ffprobe',
                    '-v', 'quiet',
                    '-print_format', 'json',
                    '-show_format',
                    '-show_streams',
                    file_path
                ], capture_output=True, timeout=30)

                if result.returncode == 0:
                    data = json.loads(result.stdout)
                    fmt = data.get('format', {})

                    # Durada
                    if 'duration' in fmt:
                        info['duration'] = int(float(fmt['duration']))

                    # Títol dels tags
                    tags = fmt.get('tags', {})
                    if tags.get('title'):
                        info['title'] = tags['title']
                    elif tags.get('TITLE'):
                        info['title'] = tags['TITLE']

            except Exception as e:
                logger.debug(f"Error obtenint info de {file_path}: {e}")

        return info

    def _format_duration(self, seconds: int) -> str:
        """Formata segons a un string llegible"""
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        if hours > 0:
            return f"{hours}h {minutes}m"
        return f"{minutes}m"

    def cleanup_missing_audiobooks(self) -> Dict:
        """Elimina audiollibres que ja no existeixen"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        stats = {
            "audiobooks_removed": 0,
            "authors_removed": 0
        }

        # Eliminar audiollibres que no existeixen
        cursor.execute("SELECT id, folder_path FROM audiobooks")
        for audiobook in cursor.fetchall():
            if not os.path.exists(audiobook["folder_path"]):
                cursor.execute("DELETE FROM audiobook_progress WHERE audiobook_id = ?", (audiobook["id"],))
                cursor.execute("DELETE FROM audiobook_files WHERE audiobook_id = ?", (audiobook["id"],))
                cursor.execute("DELETE FROM audiobooks WHERE id = ?", (audiobook["id"],))
                stats["audiobooks_removed"] += 1
                logger.info(f"Eliminat audiollibres inexistent: {audiobook['folder_path']}")

        # Eliminar autors sense audiollibres
        cursor.execute("""
            DELETE FROM audiobook_authors
            WHERE id NOT IN (SELECT DISTINCT author_id FROM audiobooks WHERE author_id IS NOT NULL)
        """)
        stats["authors_removed"] = cursor.rowcount

        conn.commit()
        conn.close()

        return stats


def scan_audiobooks():
    """Funció helper per escanejar audiollibres"""
    scanner = AudiobooksScanner()
    return scanner.scan_all_libraries()


if __name__ == "__main__":
    result = scan_audiobooks()
    print(json.dumps(result, indent=2, ensure_ascii=False))
