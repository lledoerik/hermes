#!/usr/bin/env python3
"""
Hermes Authentication System
Sistema d'autenticació amb JWT
"""

import os
import sys
import sqlite3
import hashlib
import secrets
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict

sys.path.append(str(Path(__file__).parent.parent))
from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# JWT simple sense dependències externes
class SimpleJWT:
    """Implementació simple de JWT sense dependències"""

    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    def _base64_encode(self, data: bytes) -> str:
        import base64
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

    def _base64_decode(self, data: str) -> bytes:
        import base64
        padding = 4 - len(data) % 4
        if padding != 4:
            data += '=' * padding
        return base64.urlsafe_b64decode(data)

    def _sign(self, message: str) -> str:
        import hmac
        signature = hmac.new(
            self.secret_key.encode(),
            message.encode(),
            hashlib.sha256
        ).digest()
        return self._base64_encode(signature)

    def encode(self, payload: Dict, expires_hours: int = 24 * 7) -> str:
        """Crea un token JWT"""
        import json

        header = {"alg": "HS256", "typ": "JWT"}

        # Afegir expiració
        payload = payload.copy()
        payload['exp'] = (datetime.utcnow() + timedelta(hours=expires_hours)).isoformat()
        payload['iat'] = datetime.utcnow().isoformat()

        header_b64 = self._base64_encode(json.dumps(header).encode())
        payload_b64 = self._base64_encode(json.dumps(payload).encode())

        message = f"{header_b64}.{payload_b64}"
        signature = self._sign(message)

        return f"{message}.{signature}"

    def decode(self, token: str) -> Optional[Dict]:
        """Decodifica i valida un token JWT"""
        import json

        try:
            parts = token.split('.')
            if len(parts) != 3:
                return None

            header_b64, payload_b64, signature = parts

            # Verificar signatura
            message = f"{header_b64}.{payload_b64}"
            expected_signature = self._sign(message)

            if signature != expected_signature:
                return None

            # Decodificar payload
            payload = json.loads(self._base64_decode(payload_b64))

            # Verificar expiració
            if 'exp' in payload:
                exp = datetime.fromisoformat(payload['exp'])
                if datetime.utcnow() > exp:
                    return None

            return payload

        except Exception as e:
            logger.error(f"Error decodificant JWT: {e}")
            return None


class AuthManager:
    """Gestor d'autenticació"""

    def __init__(self):
        self.db_path = settings.DATABASE_PATH
        self.jwt = SimpleJWT(settings.SECRET_KEY)
        self._init_database()

    def _init_database(self):
        """Inicialitza les taules d'usuaris"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                display_name TEXT,
                avatar TEXT,
                is_admin BOOLEAN DEFAULT FALSE,
                is_premium BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        """)

        # Taula de sessions (opcional, per tracking)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL,
                device_info TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        # Taula d'invitacions
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS invitations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                created_by INTEGER NOT NULL,
                used_by INTEGER,
                max_uses INTEGER DEFAULT 1,
                uses INTEGER DEFAULT 0,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (used_by) REFERENCES users(id)
            )
        """)

        # Afegir camp 'is_active' a users si no existeix
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'is_active' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE")

        # Afegir camp 'is_premium' a users si no existeix
        if 'is_premium' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN is_premium BOOLEAN DEFAULT FALSE")

        conn.commit()
        conn.close()
        logger.info("Taules d'autenticació inicialitzades")

        # Crear admin per defecte si no existeix
        self._create_default_admin()

    def _create_default_admin(self):
        """Crea l'usuari admin per defecte si no existeix cap admin"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Comprovar si ja existeix algun admin
        cursor.execute("SELECT id FROM users WHERE is_admin = TRUE")
        if cursor.fetchone():
            conn.close()
            return

        # Comprovar si l'usuari admin ja existeix (però no és admin)
        cursor.execute("SELECT id FROM users WHERE username = ?",
                      (settings.DEFAULT_ADMIN_USERNAME,))
        existing = cursor.fetchone()

        if existing:
            # Promoure a admin
            cursor.execute("UPDATE users SET is_admin = TRUE WHERE id = ?",
                          (existing[0],))
            logger.info(f"Usuari '{settings.DEFAULT_ADMIN_USERNAME}' promogut a admin")
        else:
            # Crear nou usuari admin
            password_hash = self._hash_password(settings.DEFAULT_ADMIN_PASSWORD)
            cursor.execute("""
                INSERT INTO users (username, email, password_hash, display_name, is_admin)
                VALUES (?, ?, ?, ?, TRUE)
            """, (
                settings.DEFAULT_ADMIN_USERNAME,
                settings.DEFAULT_ADMIN_EMAIL,
                password_hash,
                "Administrador",
            ))
            logger.info(f"Usuari admin creat: {settings.DEFAULT_ADMIN_USERNAME}")

        conn.commit()
        conn.close()

    def _hash_password(self, password: str) -> str:
        """Crea un hash segur de la contrasenya"""
        salt = secrets.token_hex(16)
        hash_obj = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode(),
            salt.encode(),
            100000
        )
        return f"{salt}:{hash_obj.hex()}"

    def _verify_password(self, password: str, password_hash: str) -> bool:
        """Verifica una contrasenya"""
        try:
            salt, stored_hash = password_hash.split(':')
            hash_obj = hashlib.pbkdf2_hmac(
                'sha256',
                password.encode(),
                salt.encode(),
                100000
            )
            return hash_obj.hex() == stored_hash
        except Exception:
            return False

    def register(self, username: str, password: str, email: str = None,
                 display_name: str = None) -> Dict:
        """Registra un nou usuari"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        try:
            # Comprovar si ja existeix
            cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
            if cursor.fetchone():
                conn.close()
                return {"status": "error", "message": "L'usuari ja existeix"}

            if email:
                cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
                if cursor.fetchone():
                    conn.close()
                    return {"status": "error", "message": "L'email ja està registrat"}

            # Crear usuari
            password_hash = self._hash_password(password)
            display_name = display_name or username

            cursor.execute("""
                INSERT INTO users (username, email, password_hash, display_name)
                VALUES (?, ?, ?, ?)
            """, (username, email, password_hash, display_name))

            user_id = cursor.lastrowid
            conn.commit()
        except sqlite3.IntegrityError as e:
            conn.close()
            if 'email' in str(e):
                return {"status": "error", "message": "L'email ja està registrat"}
            elif 'username' in str(e):
                return {"status": "error", "message": "L'usuari ja existeix"}
            return {"status": "error", "message": "Error de registre"}
        except Exception as e:
            conn.close()
            logger.error(f"Error en registre: {e}")
            return {"status": "error", "message": "Error en el registre"}
        finally:
            try:
                conn.close()
            except:
                pass

        # Generar token
        token = self.jwt.encode({
            "user_id": user_id,
            "username": username
        })

        return {
            "status": "success",
            "message": "Usuari creat correctament",
            "user": {
                "id": user_id,
                "username": username,
                "display_name": display_name,
                "email": email
            },
            "token": token
        }

    def login(self, username: str, password: str) -> Dict:
        """Inicia sessió"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Buscar usuari (per username o email)
        cursor.execute("""
            SELECT * FROM users
            WHERE username = ? OR email = ?
        """, (username, username))

        user = cursor.fetchone()

        if not user:
            conn.close()
            return {"status": "error", "message": "Usuari o contrasenya incorrectes"}

        if not self._verify_password(password, user["password_hash"]):
            conn.close()
            return {"status": "error", "message": "Usuari o contrasenya incorrectes"}

        # Actualitzar last_login
        cursor.execute("""
            UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
        """, (user["id"],))

        conn.commit()
        conn.close()

        # Generar token
        token = self.jwt.encode({
            "user_id": user["id"],
            "username": user["username"]
        })

        return {
            "status": "success",
            "message": "Sessió iniciada",
            "user": {
                "id": user["id"],
                "username": user["username"],
                "display_name": user["display_name"],
                "email": user["email"],
                "avatar": user["avatar"],
                "is_admin": bool(user["is_admin"])
            },
            "token": token
        }

    def verify_token(self, token: str) -> Optional[Dict]:
        """Verifica un token i retorna les dades de l'usuari"""
        payload = self.jwt.decode(token)

        if not payload:
            return None

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, username, display_name, email, avatar, is_admin, is_premium
            FROM users WHERE id = ?
        """, (payload.get("user_id"),))

        user = cursor.fetchone()
        conn.close()

        if not user:
            return None

        return {
            "id": user["id"],
            "username": user["username"],
            "display_name": user["display_name"],
            "email": user["email"],
            "avatar": user["avatar"],
            "is_admin": bool(user["is_admin"]),
            "is_premium": bool(user["is_premium"]) if user["is_premium"] is not None else False
        }

    def get_user(self, user_id: int) -> Optional[Dict]:
        """Obté les dades d'un usuari"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, username, display_name, email, avatar, is_admin, is_premium, created_at
            FROM users WHERE id = ?
        """, (user_id,))

        user = cursor.fetchone()
        conn.close()

        if user:
            return dict(user)
        return None

    def update_profile(self, user_id: int, display_name: str = None,
                       email: str = None, avatar: str = None) -> Dict:
        """Actualitza el perfil d'un usuari"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        updates = []
        values = []

        if display_name:
            updates.append("display_name = ?")
            values.append(display_name)
        if email:
            updates.append("email = ?")
            values.append(email)
        if avatar:
            updates.append("avatar = ?")
            values.append(avatar)

        if not updates:
            conn.close()
            return {"status": "error", "message": "Cap camp per actualitzar"}

        values.append(user_id)
        cursor.execute(f"""
            UPDATE users SET {', '.join(updates)} WHERE id = ?
        """, values)

        conn.commit()
        conn.close()

        return {"status": "success", "message": "Perfil actualitzat"}

    def change_password(self, user_id: int, old_password: str,
                        new_password: str) -> Dict:
        """Canvia la contrasenya"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()

        if not user or not self._verify_password(old_password, user["password_hash"]):
            conn.close()
            return {"status": "error", "message": "Contrasenya actual incorrecta"}

        new_hash = self._hash_password(new_password)
        cursor.execute("""
            UPDATE users SET password_hash = ? WHERE id = ?
        """, (new_hash, user_id))

        conn.commit()
        conn.close()

        return {"status": "success", "message": "Contrasenya canviada"}

    # ============================================================
    # GESTIÓ D'INVITACIONS
    # ============================================================

    def create_invitation(self, created_by: int, max_uses: int = 1,
                          expires_days: int = 7) -> Dict:
        """Crea un codi d'invitació"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Generar codi únic
        code = secrets.token_urlsafe(16)

        # Calcular expiració
        expires_at = (datetime.utcnow() + timedelta(days=expires_days)).isoformat()

        cursor.execute("""
            INSERT INTO invitations (code, created_by, max_uses, expires_at)
            VALUES (?, ?, ?, ?)
        """, (code, created_by, max_uses, expires_at))

        invitation_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return {
            "status": "success",
            "invitation": {
                "id": invitation_id,
                "code": code,
                "max_uses": max_uses,
                "expires_at": expires_at
            }
        }

    def validate_invitation(self, code: str) -> Dict:
        """Valida un codi d'invitació"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM invitations WHERE code = ?
        """, (code,))

        invitation = cursor.fetchone()
        conn.close()

        if not invitation:
            return {"valid": False, "message": "Codi d'invitació no vàlid"}

        # Comprovar expiració
        if invitation["expires_at"]:
            expires_at = datetime.fromisoformat(invitation["expires_at"])
            if datetime.utcnow() > expires_at:
                return {"valid": False, "message": "Codi d'invitació caducat"}

        # Comprovar usos
        if invitation["uses"] >= invitation["max_uses"]:
            return {"valid": False, "message": "Codi d'invitació ja utilitzat"}

        return {"valid": True, "invitation_id": invitation["id"]}

    def use_invitation(self, code: str, user_id: int) -> bool:
        """Marca una invitació com a utilitzada"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE invitations
            SET uses = uses + 1, used_by = ?
            WHERE code = ?
        """, (user_id, code))

        conn.commit()
        conn.close()
        return True

    def get_invitations(self, created_by: int = None) -> list:
        """Obté llista d'invitacions"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        if created_by:
            cursor.execute("""
                SELECT i.*, u.username as created_by_username
                FROM invitations i
                JOIN users u ON i.created_by = u.id
                WHERE i.created_by = ?
                ORDER BY i.created_at DESC
            """, (created_by,))
        else:
            cursor.execute("""
                SELECT i.*, u.username as created_by_username
                FROM invitations i
                JOIN users u ON i.created_by = u.id
                ORDER BY i.created_at DESC
            """)

        invitations = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return invitations

    def delete_invitation(self, invitation_id: int) -> bool:
        """Elimina una invitació"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM invitations WHERE id = ?", (invitation_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return deleted

    # ============================================================
    # GESTIÓ D'USUARIS (ADMIN)
    # ============================================================

    def get_all_users(self) -> list:
        """Obté tots els usuaris (per admin)"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, username, display_name, email, is_admin,
                   COALESCE(is_premium, 0) as is_premium,
                   COALESCE(is_active, 1) as is_active, created_at, last_login
            FROM users
            ORDER BY created_at DESC
        """)

        users = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return users

    def toggle_user_active(self, user_id: int, active: bool) -> Dict:
        """Activa o desactiva un usuari"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # No permetre desactivar l'últim admin
        if not active:
            cursor.execute("""
                SELECT COUNT(*) FROM users
                WHERE is_admin = TRUE AND COALESCE(is_active, 1) = 1 AND id != ?
            """, (user_id,))
            active_admins = cursor.fetchone()[0]
            if active_admins == 0:
                cursor.execute("SELECT is_admin FROM users WHERE id = ?", (user_id,))
                user = cursor.fetchone()
                if user and user[0]:
                    conn.close()
                    return {"status": "error", "message": "No es pot desactivar l'últim administrador"}

        cursor.execute("""
            UPDATE users SET is_active = ? WHERE id = ?
        """, (active, user_id))

        conn.commit()
        conn.close()

        return {"status": "success", "message": f"Usuari {'activat' if active else 'desactivat'}"}

    def delete_user(self, user_id: int, requesting_user_id: int) -> Dict:
        """Elimina un usuari"""
        if user_id == requesting_user_id:
            return {"status": "error", "message": "No et pots eliminar a tu mateix"}

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # No permetre eliminar l'últim admin
        cursor.execute("""
            SELECT is_admin FROM users WHERE id = ?
        """, (user_id,))
        user = cursor.fetchone()

        if user and user[0]:
            cursor.execute("SELECT COUNT(*) FROM users WHERE is_admin = TRUE")
            admin_count = cursor.fetchone()[0]
            if admin_count <= 1:
                conn.close()
                return {"status": "error", "message": "No es pot eliminar l'últim administrador"}

        # Eliminar dades relacionades
        cursor.execute("DELETE FROM watch_progress WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM book_progress WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM audiobook_progress WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM invitations WHERE created_by = ?", (user_id,))

        # Eliminar usuari
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))

        conn.commit()
        conn.close()

        return {"status": "success", "message": "Usuari eliminat"}

    def toggle_admin(self, user_id: int, is_admin: bool) -> Dict:
        """Canvia l'estat d'administrador d'un usuari"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # No permetre treure admin a l'últim admin
        if not is_admin:
            cursor.execute("SELECT COUNT(*) FROM users WHERE is_admin = TRUE")
            admin_count = cursor.fetchone()[0]
            if admin_count <= 1:
                conn.close()
                return {"status": "error", "message": "Cal almenys un administrador"}

        cursor.execute("""
            UPDATE users SET is_admin = ? WHERE id = ?
        """, (is_admin, user_id))

        conn.commit()
        conn.close()

        return {"status": "success", "message": f"Usuari {'promogut a' if is_admin else 'tret de'} admin"}

    def toggle_premium(self, user_id: int, is_premium: bool) -> Dict:
        """Canvia l'estat de premium d'un usuari"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE users SET is_premium = ? WHERE id = ?
        """, (is_premium, user_id))

        conn.commit()
        conn.close()

        return {"status": "success", "message": f"Usuari {'ara és' if is_premium else 'ja no és'} premium"}

    def register_with_invitation(self, username: str, password: str,
                                 invitation_code: str, email: str = None,
                                 display_name: str = None) -> Dict:
        """Registra un nou usuari amb codi d'invitació"""
        # Validar invitació
        validation = self.validate_invitation(invitation_code)
        if not validation["valid"]:
            return {"status": "error", "message": validation["message"]}

        # Registrar usuari normalment
        result = self.register(username, password, email, display_name)

        if result["status"] == "success":
            # Marcar invitació com a utilitzada
            self.use_invitation(invitation_code, result["user"]["id"])

        return result


# Singleton
_auth_manager = None

def get_auth_manager() -> AuthManager:
    global _auth_manager
    if _auth_manager is None:
        _auth_manager = AuthManager()
    return _auth_manager
