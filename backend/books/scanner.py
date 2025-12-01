#!/usr/bin/env python3
"""
Hermes Books Scanner
Escaneja biblioteques de llibres organitzades per autor
"""

import os
import sys
import sqlite3
import logging
import hashlib
import subprocess
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Tuple

sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BooksScanner:
    """Escaneja biblioteques de llibres"""

    SUPPORTED_FORMATS = ['.epub', '.pdf', '.mobi', '.azw', '.azw3', '.cbz', '.cbr']

    def __init__(self):
        self.db_path = settings.DATABASE_PATH
        self._init_database()
        self._check_ebook_convert()

    def _check_ebook_convert(self):
        """Comprova si ebook-convert (Calibre) està disponible"""
        self.ebook_convert_available = False
        try:
            result = subprocess.run(
                ['ebook-convert', '--version'],
                capture_output=True,
                timeout=10
            )
            if result.returncode == 0:
                self.ebook_convert_available = True
                logger.info("ebook-convert (Calibre) disponible per conversions")
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            logger.warning("ebook-convert no disponible. MOBI/AZW no es podran convertir automàticament.")

    def _init_database(self):
        """Inicialitza les taules per llibres"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Taula d'autors
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS authors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT UNIQUE NOT NULL,
                photo TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Taula de llibres
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_id INTEGER,
                title TEXT NOT NULL,
                file_path TEXT UNIQUE NOT NULL,
                file_hash TEXT,
                format TEXT NOT NULL,
                cover TEXT,
                language TEXT,
                publisher TEXT,
                description TEXT,
                pages INTEGER,
                file_size INTEGER,
                converted_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES authors(id)
            )
        """)

        # Taula de progrés de lectura
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reading_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT 1,
                book_id INTEGER NOT NULL,
                current_position TEXT,
                current_page INTEGER DEFAULT 0,
                total_pages INTEGER,
                percentage REAL DEFAULT 0,
                last_read TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (book_id) REFERENCES books(id),
                UNIQUE(user_id, book_id)
            )
        """)

        conn.commit()
        conn.close()
        logger.info("Base de dades de llibres inicialitzada")

    def scan_all_libraries(self) -> Dict:
        """Escaneja totes les biblioteques de llibres configurades"""
        results = {
            "status": "success",
            "libraries_scanned": 0,
            "authors_found": 0,
            "books_found": 0,
            "books_updated": 0,
            "errors": []
        }

        for library in settings.BOOKS_LIBRARIES:
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
            results["books_found"] += lib_result.get("books_found", 0)
            results["books_updated"] += lib_result.get("books_updated", 0)

        return results

    def scan_library(self, library_path: str) -> Dict:
        """Escaneja una biblioteca de llibres"""
        result = {
            "authors_found": 0,
            "books_found": 0,
            "books_updated": 0
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

            # Buscar llibres de l'autor
            for item in os.listdir(author_path):
                item_path = os.path.join(author_path, item)

                # Si és un fitxer directament
                if os.path.isfile(item_path):
                    ext = os.path.splitext(item)[1].lower()
                    if ext in self.SUPPORTED_FORMATS:
                        try:
                            if self._add_or_update_book(cursor, author_id, item_path):
                                result["books_found"] += 1
                            else:
                                result["books_updated"] += 1
                        except Exception as e:
                            logger.error(f"    Error afegint llibre {item}: {e}")

                # Si és una carpeta (potser conté múltiples formats del mateix llibre)
                elif os.path.isdir(item_path):
                    logger.info(f"    Carpeta: {item}")
                    book_files = os.listdir(item_path)
                    logger.info(f"    Contingut: {book_files}")
                    for book_file in book_files:
                        book_path = os.path.join(item_path, book_file)
                        if os.path.isfile(book_path):
                            ext = os.path.splitext(book_file)[1].lower()
                            if ext in self.SUPPORTED_FORMATS:
                                try:
                                    if self._add_or_update_book(cursor, author_id, book_path):
                                        result["books_found"] += 1
                                    else:
                                        result["books_updated"] += 1
                                except Exception as e:
                                    logger.error(f"    Error afegint llibre {book_file}: {e}")

            logger.info(f"  Autor: {author_name}")

        conn.commit()
        conn.close()

        return result

    def _get_or_create_author(self, cursor, name: str, path: str) -> int:
        """Obté o crea un autor"""
        cursor.execute("SELECT id FROM authors WHERE path = ?", (path,))
        existing = cursor.fetchone()

        if existing:
            return existing["id"]

        cursor.execute("""
            INSERT INTO authors (name, path)
            VALUES (?, ?)
        """, (name, path))

        return cursor.lastrowid

    def _add_or_update_book(self, cursor, author_id: int, file_path: str) -> bool:
        """Afegeix o actualitza un llibre. Retorna True si és nou."""
        # Calcular hash del fitxer
        file_hash = self._calculate_file_hash(file_path)

        # Comprovar si ja existeix
        cursor.execute("SELECT id, file_hash FROM books WHERE file_path = ?", (file_path,))
        existing = cursor.fetchone()

        # Extreure informació del fitxer
        file_name = os.path.basename(file_path)
        title = os.path.splitext(file_name)[0]
        format_ext = os.path.splitext(file_name)[1].lower().replace('.', '')
        file_size = os.path.getsize(file_path)

        # Intentar extreure metadades (per EPUB)
        metadata = self._extract_metadata(file_path)
        if metadata.get('title'):
            title = metadata['title']

        # Convertir MOBI/AZW a EPUB si cal
        converted_path = None
        if format_ext in ['mobi', 'azw', 'azw3'] and self.ebook_convert_available:
            converted_path = self._convert_to_epub(file_path)

        if existing:
            # Actualitzar si ha canviat
            if existing["file_hash"] != file_hash:
                cursor.execute("""
                    UPDATE books SET
                        author_id = ?, title = ?, file_hash = ?, format = ?,
                        cover = ?, language = ?, description = ?, pages = ?,
                        file_size = ?, converted_path = ?
                    WHERE id = ?
                """, (
                    author_id, title, file_hash, format_ext,
                    metadata.get('cover'), metadata.get('language'),
                    metadata.get('description'), metadata.get('pages'),
                    file_size, converted_path, existing["id"]
                ))
            return False
        else:
            # Inserir nou
            cursor.execute("""
                INSERT INTO books (
                    author_id, title, file_path, file_hash, format,
                    cover, language, description, pages, file_size, converted_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                author_id, title, file_path, file_hash, format_ext,
                metadata.get('cover'), metadata.get('language'),
                metadata.get('description'), metadata.get('pages'),
                file_size, converted_path
            ))
            logger.info(f"    + {title} ({format_ext})")
            return True

    def _calculate_file_hash(self, file_path: str) -> str:
        """Calcula el hash MD5 del fitxer"""
        hash_md5 = hashlib.md5()
        try:
            with open(file_path, "rb") as f:
                # Llegir només els primers 1MB per velocitat
                chunk = f.read(1024 * 1024)
                hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except Exception:
            return ""

    def _extract_metadata(self, file_path: str) -> Dict:
        """Extreu metadades d'un llibre"""
        metadata = {}
        ext = os.path.splitext(file_path)[1].lower()

        if ext == '.epub':
            metadata = self._extract_epub_metadata(file_path)
        elif ext == '.pdf':
            metadata = self._extract_pdf_metadata(file_path)

        return metadata

    def _extract_epub_metadata(self, file_path: str) -> Dict:
        """Extreu metadades d'un EPUB"""
        try:
            import ebooklib
            from ebooklib import epub

            book = epub.read_epub(file_path)
            metadata = {}

            # Títol
            title = book.get_metadata('DC', 'title')
            if title:
                metadata['title'] = title[0][0]

            # Idioma
            language = book.get_metadata('DC', 'language')
            if language:
                metadata['language'] = language[0][0]

            # Descripció
            description = book.get_metadata('DC', 'description')
            if description:
                metadata['description'] = description[0][0][:500]  # Limitar

            # Portada (guardar-la a cache)
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_COVER:
                    cover_path = self._save_cover(file_path, item.get_content())
                    if cover_path:
                        metadata['cover'] = cover_path
                    break

            return metadata

        except ImportError:
            logger.debug("ebooklib no instal·lat, no es poden extreure metadades EPUB")
            return {}
        except Exception as e:
            logger.debug(f"Error extraient metadades EPUB: {e}")
            return {}

    def _extract_pdf_metadata(self, file_path: str) -> Dict:
        """Extreu metadades d'un PDF"""
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(file_path)
            metadata = {
                'pages': len(doc)
            }

            # Metadades del document
            pdf_metadata = doc.metadata
            if pdf_metadata.get('title'):
                metadata['title'] = pdf_metadata['title']

            # Primera pàgina com a portada
            if len(doc) > 0:
                page = doc[0]
                pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
                cover_path = self._save_cover(file_path, pix.tobytes())
                if cover_path:
                    metadata['cover'] = cover_path

            doc.close()
            return metadata

        except ImportError:
            logger.debug("PyMuPDF no instal·lat, no es poden extreure metadades PDF")
            return {}
        except Exception as e:
            logger.debug(f"Error extraient metadades PDF: {e}")
            return {}

    def _save_cover(self, book_path: str, image_data: bytes) -> Optional[str]:
        """Guarda la portada d'un llibre"""
        try:
            # Crear directori de covers si no existeix
            covers_dir = settings.CACHE_DIR / "book_covers"
            covers_dir.mkdir(parents=True, exist_ok=True)

            # Nom del fitxer basat en hash
            book_hash = hashlib.md5(book_path.encode()).hexdigest()[:16]
            cover_filename = f"{book_hash}.jpg"
            cover_path = covers_dir / cover_filename

            # Guardar imatge
            with open(cover_path, 'wb') as f:
                f.write(image_data)

            return str(cover_path)

        except Exception as e:
            logger.debug(f"Error guardant portada: {e}")
            return None

    def _convert_to_epub(self, file_path: str) -> Optional[str]:
        """Converteix MOBI/AZW a EPUB usant ebook-convert"""
        try:
            # Directori per fitxers convertits
            converted_dir = settings.CACHE_DIR / "converted_books"
            converted_dir.mkdir(parents=True, exist_ok=True)

            # Nom del fitxer convertit
            base_name = os.path.splitext(os.path.basename(file_path))[0]
            output_path = converted_dir / f"{base_name}.epub"

            # Si ja existeix, no convertir
            if output_path.exists():
                return str(output_path)

            logger.info(f"    Convertint a EPUB: {base_name}")

            result = subprocess.run(
                ['ebook-convert', file_path, str(output_path)],
                capture_output=True,
                timeout=300  # 5 minuts màxim
            )

            if result.returncode == 0 and output_path.exists():
                return str(output_path)
            else:
                logger.warning(f"Error convertint {file_path}")
                return None

        except Exception as e:
            logger.error(f"Error en conversió: {e}")
            return None

    def cleanup_missing_books(self) -> Dict:
        """Elimina llibres i autors que ja no existeixen"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        stats = {
            "books_removed": 0,
            "authors_removed": 0
        }

        # Eliminar llibres que no existeixen
        cursor.execute("SELECT id, file_path FROM books")
        for book in cursor.fetchall():
            if not os.path.exists(book["file_path"]):
                cursor.execute("DELETE FROM reading_progress WHERE book_id = ?", (book["id"],))
                cursor.execute("DELETE FROM books WHERE id = ?", (book["id"],))
                stats["books_removed"] += 1
                logger.info(f"Eliminat llibre inexistent: {book['file_path']}")

        # Eliminar autors sense llibres
        cursor.execute("""
            DELETE FROM authors
            WHERE id NOT IN (SELECT DISTINCT author_id FROM books WHERE author_id IS NOT NULL)
        """)
        stats["authors_removed"] = cursor.rowcount

        conn.commit()
        conn.close()

        return stats


def scan_books():
    """Funció helper per escanejar llibres"""
    scanner = BooksScanner()
    return scanner.scan_all_libraries()


if __name__ == "__main__":
    import json
    result = scan_books()
    print(json.dumps(result, indent=2, ensure_ascii=False))
