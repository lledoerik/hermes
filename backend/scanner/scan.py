#!/usr/bin/env python3
"""
Hermes Media Scanner - Versió Completa i Funcional
"""

import os
import re
import sys
import json
import sqlite3
import hashlib
import subprocess
import logging
from pathlib import Path
from typing import Dict, List, Optional

# Configurar path
sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class HermesScanner:
    """Scanner per detectar i catalogar media"""
    
    def __init__(self):
        self.db_path = settings.DATABASE_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_database()
        
    def _init_database(self):
        """Crea les taules necessàries"""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        cursor = conn.cursor()
        
        # Habilitar WAL
        cursor.execute("PRAGMA journal_mode=WAL")
        
        # Taula series/pel·lícules
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS series (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT UNIQUE NOT NULL,
                media_type TEXT DEFAULT 'series',
                poster TEXT,
                backdrop TEXT,
                banner TEXT,
                tvshow_nfo TEXT,
                added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Taula media_files
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS media_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_hash TEXT UNIQUE NOT NULL,
                series_id INTEGER,
                season_number INTEGER DEFAULT 1,
                episode_number INTEGER,
                title TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER,
                duration REAL,
                width INTEGER,
                height INTEGER,
                video_codec TEXT,
                audio_tracks TEXT,
                subtitle_tracks TEXT,
                container TEXT,
                media_type TEXT DEFAULT 'episode',
                added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (series_id) REFERENCES series(id)
            )
        ''')
        
        # Taula watch_progress
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS watch_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT 1,
                media_id INTEGER NOT NULL,
                progress_seconds REAL,
                total_seconds REAL,
                completed BOOLEAN DEFAULT 0,
                updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_files(id)
            )
        ''')

        # Taula media_segments per saltar intro/recap/outro
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS media_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER,
                series_id INTEGER,
                segment_type TEXT NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                source TEXT DEFAULT 'manual',
                confidence REAL DEFAULT 1.0,
                created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_files(id),
                FOREIGN KEY (series_id) REFERENCES series(id)
            )
        ''')

        # Index per cerques ràpides
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_segments_media
            ON media_segments(media_id)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_segments_series
            ON media_segments(series_id)
        ''')
        
        conn.commit()
        conn.close()
        
    def scan_directory(self, base_path: str, media_type: str = "series"):
        """Escaneja un directori"""
        base = Path(base_path)
        if not base.exists():
            logger.error(f"No existeix: {base_path}")
            return
            
        logger.info(f"Escanejant {base_path} ({media_type})...")
        
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        cursor = conn.cursor()
        
        if media_type == "movies":
            self._scan_movies(base, cursor, conn)
        else:
            self._scan_series(base, cursor, conn)
            
        conn.close()
        logger.info("Escaneig completat!")
        
    def _scan_movies(self, base: Path, cursor, conn):
        """Escaneja pel·lícules"""
        for item in base.iterdir():
            if item.is_file() and item.suffix.lower() in ['.mkv', '.mp4', '.avi']:
                self._add_movie(item, cursor, conn)
            elif item.is_dir():
                # Buscar pel·lícula dins carpeta
                for video_file in item.glob('*.mkv'):
                    self._add_movie(video_file, cursor, conn, item)
                for video_file in item.glob('*.mp4'):
                    self._add_movie(video_file, cursor, conn, item)
                    
    def _add_movie(self, file_path: Path, cursor, conn, movie_dir: Path = None):
        """Afegeix una pel·lícula"""
        file_hash = self._generate_hash(file_path)

        cursor.execute('SELECT id FROM media_files WHERE file_hash = ?', (file_hash,))
        if cursor.fetchone():
            return

        # Metadata
        # Si la pel·lícula està en una carpeta pròpia, usar la carpeta
        # Si està directament a la carpeta base, usar el path del fitxer
        if movie_dir:
            base_dir = movie_dir
            movie_path = str(movie_dir)
            movie_name = movie_dir.name
        else:
            base_dir = file_path.parent
            movie_path = str(file_path)  # Path únic per cada pel·lícula
            movie_name = file_path.stem

        poster = self._find_image(base_dir, ['folder.jpg', 'poster.jpg'])
        backdrop = self._find_image(base_dir, ['backdrop.jpg', 'fanart.jpg'])

        # Comprovar si ja existeix per evitar perdre referències
        cursor.execute('SELECT id FROM series WHERE path = ?', (movie_path,))
        existing = cursor.fetchone()

        if existing:
            series_id = existing[0]
            cursor.execute('''
                UPDATE series SET poster = ?, backdrop = ?, updated_date = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (str(poster) if poster else None, str(backdrop) if backdrop else None, series_id))
        else:
            cursor.execute('''
                INSERT INTO series (name, path, media_type, poster, backdrop)
                VALUES (?, ?, 'movie', ?, ?)
            ''', (movie_name, movie_path, str(poster) if poster else None,
                  str(backdrop) if backdrop else None))
            series_id = cursor.lastrowid
        
        # Obtenir info amb ffprobe
        metadata = self.probe_file(file_path)
        if metadata:
            cursor.execute('''
                INSERT INTO media_files (
                    file_hash, series_id, title, file_path, file_size,
                    duration, width, height, video_codec, audio_tracks,
                    subtitle_tracks, container, media_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'movie')
            ''', (
                file_hash, series_id, movie_name, str(file_path),
                metadata.get('size', 0), metadata.get('duration', 0),
                metadata.get('width'), metadata.get('height'),
                metadata.get('video_codec'),
                json.dumps(metadata.get('audio_streams', [])),
                json.dumps(metadata.get('subtitle_streams', [])),
                metadata.get('format_name')
            ))
            conn.commit()
            logger.info(f"  + Pel·lícula: {movie_name}")
            
    def _scan_series(self, base: Path, cursor, conn):
        """Escaneja sèries"""
        for series_dir in base.iterdir():
            if not series_dir.is_dir():
                continue

            logger.info(f"Processant: {series_dir.name}")

            # Metadata
            poster = self._find_image(series_dir, ['folder.jpg', 'poster.jpg'])
            backdrop = self._find_image(series_dir, ['backdrop.jpg', 'fanart.jpg'])

            # Comprovar si ja existeix per evitar perdre referències d'episodis
            cursor.execute('SELECT id FROM series WHERE path = ?', (str(series_dir),))
            existing = cursor.fetchone()

            if existing:
                series_id = existing[0]
                cursor.execute('''
                    UPDATE series SET poster = ?, backdrop = ?, updated_date = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (str(poster) if poster else None, str(backdrop) if backdrop else None, series_id))
            else:
                cursor.execute('''
                    INSERT INTO series (name, path, media_type, poster, backdrop)
                    VALUES (?, ?, 'series', ?, ?)
                ''', (series_dir.name, str(series_dir),
                      str(poster) if poster else None,
                      str(backdrop) if backdrop else None))
                series_id = cursor.lastrowid

            # Commit per assegurar que la sèrie existeix abans d'afegir episodis
            conn.commit()

            # Buscar temporades
            self._scan_seasons(series_dir, series_id, cursor, conn)

            # Detectar intros automàticament amb fingerprinting
            self._detect_intros(series_id)

    def _detect_intros(self, series_id: int):
        """Detecta intros automàticament per una sèrie"""
        try:
            from backend.segments.fingerprint import AudioFingerprinter
            fingerprinter = AudioFingerprinter()
            result = fingerprinter.detect_intro_for_series(series_id)
            if result.get("status") == "success":
                logger.info(f"  → Intro detectada: {result['intro_start']}s - {result['intro_end']}s")
            else:
                logger.debug(f"  → No s'ha pogut detectar intro: {result.get('message', '')}")
        except Exception as e:
            logger.debug(f"  → Error detectant intros: {e}")

    def _scan_seasons(self, series_dir: Path, series_id: int, cursor, conn):
        """Busca temporades o episodis directes"""
        season_patterns = [
            re.compile(r'^Season\s+(\d+)$', re.IGNORECASE),
            re.compile(r'^Temporada\s+(\d+)$', re.IGNORECASE),
            re.compile(r'^S(\d+)$', re.IGNORECASE),
        ]
        
        seasons_found = False
        
        for item in series_dir.iterdir():
            if item.is_dir():
                season_num = None
                
                for pattern in season_patterns:
                    match = pattern.match(item.name)
                    if match:
                        season_num = int(match.group(1))
                        break
                        
                if season_num is not None:
                    seasons_found = True
                    logger.info(f"  Temporada {season_num}")
                    self._scan_episodes(item, series_id, season_num, cursor, conn)
                    
        # Si no hi ha temporades, episodis a temporada 1
        if not seasons_found:
            self._scan_episodes(series_dir, series_id, 1, cursor, conn)
            
    def _scan_episodes(self, season_dir: Path, series_id: int,
                      season_number: int, cursor, conn):
        """Escaneja episodis"""
        new_episodes = 0
        updated_episodes = 0

        for ext in ['.mkv', '.mp4', '.avi']:
            for video_file in season_dir.glob(f'*{ext}'):
                file_hash = self._generate_hash(video_file)

                # Comprovar si ja existeix
                cursor.execute('SELECT id, series_id FROM media_files WHERE file_hash = ?',
                             (file_hash,))
                existing = cursor.fetchone()

                episode_num = self._extract_episode_number(video_file.name)
                if episode_num is None:
                    episode_num = new_episodes + updated_episodes + 1

                if existing:
                    # IMPORTANT: Actualitzar series_id si és diferent (fix per episodis orfes)
                    if existing[1] != series_id:
                        cursor.execute('''
                            UPDATE media_files
                            SET series_id = ?, season_number = ?, episode_number = ?
                            WHERE id = ?
                        ''', (series_id, season_number, episode_num, existing[0]))
                        updated_episodes += 1
                        logger.info(f"    ~ Actualitzat: {video_file.name} -> series_id={series_id}")
                    continue

                metadata = self.probe_file(video_file)
                if metadata:
                    cursor.execute('''
                        INSERT INTO media_files (
                            file_hash, series_id, season_number, episode_number,
                            title, file_path, file_size, duration, width, height,
                            video_codec, audio_tracks, subtitle_tracks, container,
                            media_type
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'episode')
                    ''', (
                        file_hash, series_id, season_number, episode_num,
                        video_file.stem, str(video_file),
                        metadata.get('size', 0), metadata.get('duration', 0),
                        metadata.get('width'), metadata.get('height'),
                        metadata.get('video_codec'),
                        json.dumps(metadata.get('audio_streams', [])),
                        json.dumps(metadata.get('subtitle_streams', [])),
                        metadata.get('format_name')
                    ))
                    new_episodes += 1

        # Fer commit després de processar cada temporada
        conn.commit()

        total = new_episodes + updated_episodes
        if total > 0:
            msg = f"    + {new_episodes} nous"
            if updated_episodes > 0:
                msg += f", {updated_episodes} actualitzats"
            logger.info(msg)
            
    def probe_file(self, file_path: Path) -> Optional[Dict]:
        """Obté metadata amb ffprobe"""
        try:
            cmd = [
                'ffprobe', '-v', 'quiet',
                '-print_format', 'json',
                '-show_format', '-show_streams',
                str(file_path)
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
                encoding="utf-8",
                errors="ignore"
            )

            if result.returncode != 0:
                return None
                
            data = json.loads(result.stdout)
            
            # Processar info
            video_info = {}
            audio_streams = []
            subtitle_streams = []
            
            for stream in data.get('streams', []):
                if stream.get('codec_type') == 'video' and not video_info:
                    video_info = {
                        'codec': stream.get('codec_name'),
                        'width': stream.get('width'),
                        'height': stream.get('height')
                    }
                elif stream.get('codec_type') == 'audio':
                    audio_streams.append({
                        'index': stream.get('index'),
                        'codec': stream.get('codec_name'),
                        'language': stream.get('tags', {}).get('language', 'und'),
                        'title': stream.get('tags', {}).get('title', '')
                    })
                elif stream.get('codec_type') == 'subtitle':
                    subtitle_streams.append({
                        'index': stream.get('index'),
                        'codec': stream.get('codec_name'),
                        'language': stream.get('tags', {}).get('language', 'und'),
                        'title': stream.get('tags', {}).get('title', '')
                    })
                    
            format_info = data.get('format', {})
            
            return {
                'duration': float(format_info.get('duration', 0)),
                'size': int(format_info.get('size', 0)),
                'format_name': format_info.get('format_name'),
                'video_codec': video_info.get('codec'),
                'width': video_info.get('width'),
                'height': video_info.get('height'),
                'audio_streams': audio_streams,
                'subtitle_streams': subtitle_streams
            }
        except:
            return None
            
    def _find_image(self, directory: Path, filenames: List[str]) -> Optional[Path]:
        """Busca imatges"""
        for filename in filenames:
            path = directory / filename
            if path.exists():
                return path
        return None
        
    def _generate_hash(self, file_path: Path) -> str:
        """Genera hash únic"""
        hash_str = f"{file_path.name}_{file_path.stat().st_size}"
        return hashlib.md5(hash_str.encode()).hexdigest()
        
    def _extract_episode_number(self, filename: str) -> Optional[int]:
        """Extreu número episodi"""
        patterns = [
            r'(\d+)x(\d+)',  # 01x01
            r'[Ss](\d+)[Ee](\d+)',  # S01E01
            r'[Ee](\d+)',  # E01
            r'^(\d+)[^\d]',  # 01
        ]
        
        for pattern in patterns:
            match = re.search(pattern, filename)
            if match:
                return int(match.groups()[-1])
        return None
        
    def get_stats(self) -> Dict:
        """Obtenir estadístiques"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        stats = {}
        
        cursor.execute("SELECT COUNT(*) FROM series WHERE media_type = 'series'")
        stats['series'] = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM series WHERE media_type = 'movie'")
        stats['movies'] = cursor.fetchone()[0]
        
        cursor.execute('SELECT COUNT(*) FROM media_files')
        stats['files'] = cursor.fetchone()[0]
        
        cursor.execute('SELECT SUM(duration) FROM media_files')
        total_duration = cursor.fetchone()[0] or 0
        stats['total_hours'] = round(total_duration / 3600, 1)
        
        conn.close()
        return stats


if __name__ == "__main__":
    scanner = HermesScanner()
    
    for library in settings.MEDIA_LIBRARIES:
        if Path(library["path"]).exists():
            print(f"\nEscanejant: {library['name']}")
            scanner.scan_directory(library["path"], library["type"])
    
    stats = scanner.get_stats()
    print(f"\n{'='*50}")
    print("ESTADÍSTIQUES")
    print('='*50)
    print(f"Sèries: {stats['series']}")
    print(f"Pel·lícules: {stats['movies']}")
    print(f"Arxius: {stats['files']}")
    print(f"Hores: {stats['total_hours']}")
