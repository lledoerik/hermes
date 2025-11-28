#!/usr/bin/env python3
"""
Hermes Book Reader
Serveix contingut de llibres per al lector web
"""

import os
import sys
import sqlite3
import logging
import zipfile
import json
from pathlib import Path
from typing import Dict, Optional, List, Tuple

sys.path.append(str(Path(__file__).parent.parent.parent))
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BookReader:
    """Llegeix i serveix contingut de llibres"""

    def __init__(self):
        self.db_path = settings.DATABASE_PATH

    def get_book_info(self, book_id: int) -> Optional[Dict]:
        """Obté informació d'un llibre"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT b.*, a.name as author_name
            FROM books b
            LEFT JOIN authors a ON b.author_id = a.id
            WHERE b.id = ?
        """, (book_id,))

        book = cursor.fetchone()
        conn.close()

        if not book:
            return None

        return dict(book)

    def get_book_content_type(self, book_id: int) -> Tuple[str, str]:
        """
        Retorna el tipus de contingut i el path del fitxer a servir.
        Per MOBI/AZW, retorna el path convertit si existeix.
        """
        book = self.get_book_info(book_id)
        if not book:
            return None, None

        format_type = book['format'].lower()
        file_path = book['file_path']

        # Si és MOBI/AZW i tenim versió convertida
        if format_type in ['mobi', 'azw', 'azw3'] and book.get('converted_path'):
            if os.path.exists(book['converted_path']):
                return 'epub', book['converted_path']

        return format_type, file_path

    def get_epub_content(self, book_id: int) -> Optional[Dict]:
        """
        Processa un EPUB i retorna el contingut estructurat.
        """
        content_type, file_path = self.get_book_content_type(book_id)

        if content_type != 'epub' or not file_path:
            return None

        if not os.path.exists(file_path):
            return None

        try:
            return self._parse_epub(file_path)
        except Exception as e:
            logger.error(f"Error processant EPUB: {e}")
            return None

    def _parse_epub(self, epub_path: str) -> Dict:
        """Parseja un EPUB i retorna estructura"""
        try:
            import ebooklib
            from ebooklib import epub

            book = epub.read_epub(epub_path)

            # Metadades
            title = book.get_metadata('DC', 'title')
            author = book.get_metadata('DC', 'creator')

            result = {
                'title': title[0][0] if title else 'Sense títol',
                'author': author[0][0] if author else 'Autor desconegut',
                'chapters': [],
                'spine': []
            }

            # Obtenir ordre de lectura (spine)
            for item in book.spine:
                item_id = item[0]
                doc = book.get_item_with_id(item_id)
                if doc:
                    result['spine'].append({
                        'id': item_id,
                        'href': doc.get_name()
                    })

            # Processar capítols (TOC)
            toc = book.toc
            for item in toc:
                if isinstance(item, epub.Link):
                    result['chapters'].append({
                        'title': item.title,
                        'href': item.href
                    })
                elif isinstance(item, tuple):
                    # Secció amb subentrades
                    section_title = item[0].title if hasattr(item[0], 'title') else str(item[0])
                    result['chapters'].append({
                        'title': section_title,
                        'href': item[0].href if hasattr(item[0], 'href') else None,
                        'children': [
                            {'title': sub.title, 'href': sub.href}
                            for sub in item[1] if hasattr(sub, 'title')
                        ]
                    })

            return result

        except ImportError:
            logger.error("ebooklib no instal·lat")
            return None
        except Exception as e:
            logger.error(f"Error parsejant EPUB: {e}")
            return None

    def get_epub_resource(self, book_id: int, resource_path: str) -> Tuple[Optional[bytes], str]:
        """
        Obté un recurs (HTML, CSS, imatge) d'un EPUB.
        Retorna (contingut, mime_type)
        """
        content_type, file_path = self.get_book_content_type(book_id)

        if content_type != 'epub' or not file_path:
            return None, ''

        try:
            with zipfile.ZipFile(file_path, 'r') as zf:
                # Els EPUBs són ZIPs
                # El resource_path pot ser relatiu
                for name in zf.namelist():
                    if name.endswith(resource_path) or resource_path in name:
                        content = zf.read(name)
                        mime_type = self._get_mime_type(name)
                        return content, mime_type

            return None, ''

        except Exception as e:
            logger.error(f"Error obtenint recurs EPUB: {e}")
            return None, ''

    def _get_mime_type(self, filename: str) -> str:
        """Determina el MIME type d'un fitxer"""
        ext = os.path.splitext(filename)[1].lower()
        mime_types = {
            '.html': 'text/html',
            '.xhtml': 'application/xhtml+xml',
            '.htm': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.otf': 'font/otf',
            '.ncx': 'application/x-dtbncx+xml',
            '.opf': 'application/oebps-package+xml',
        }
        return mime_types.get(ext, 'application/octet-stream')

    def update_reading_progress(self, book_id: int, position: str,
                                 page: int = 0, total_pages: int = 0,
                                 user_id: int = 1) -> bool:
        """Actualitza el progrés de lectura"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        percentage = (page / total_pages * 100) if total_pages > 0 else 0

        cursor.execute("""
            INSERT INTO reading_progress (user_id, book_id, current_position, current_page, total_pages, percentage)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, book_id) DO UPDATE SET
                current_position = excluded.current_position,
                current_page = excluded.current_page,
                total_pages = excluded.total_pages,
                percentage = excluded.percentage,
                last_read = CURRENT_TIMESTAMP
        """, (user_id, book_id, position, page, total_pages, percentage))

        conn.commit()
        conn.close()
        return True

    def get_reading_progress(self, book_id: int, user_id: int = 1) -> Optional[Dict]:
        """Obté el progrés de lectura"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM reading_progress
            WHERE book_id = ? AND user_id = ?
        """, (book_id, user_id))

        progress = cursor.fetchone()
        conn.close()

        if progress:
            return dict(progress)
        return None
