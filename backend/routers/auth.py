"""
Hermes Media Server - Authentication Router
Handles user authentication, registration, and profile management
"""

from typing import Optional, Dict
from fastapi import APIRouter, HTTPException, Request

from backend.models.requests import (
    LoginRequest,
    RegisterRequest,
    ProfileUpdateRequest,
    PasswordChangeRequest,
    InvitationRequest,
    RegisterWithInviteRequest,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def get_current_user(request: Request) -> Optional[Dict]:
    """Get current user from token"""
    from backend.auth import get_auth_manager

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.replace("Bearer ", "")
    auth = get_auth_manager()
    return auth.verify_token(token)


def require_auth(request: Request) -> Dict:
    """Require authentication"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticat")
    return user


def require_admin(request: Request) -> Dict:
    """Require admin role"""
    user = require_auth(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accés només per administradors")
    return user


# === AUTHENTICATION ===

@router.post("/register")
async def register(data: RegisterRequest):
    """Register a new user"""
    from backend.auth import get_auth_manager

    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="La contrasenya ha de tenir mínim 4 caràcters")

    auth = get_auth_manager()
    result = auth.register(
        username=data.username,
        password=data.password,
        email=data.email,
        display_name=data.display_name
    )

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@router.post("/login")
async def login(data: LoginRequest):
    """Login user"""
    from backend.auth import get_auth_manager

    auth = get_auth_manager()
    result = auth.login(data.username, data.password)

    if result["status"] == "error":
        raise HTTPException(status_code=401, detail=result["message"])

    return result


@router.get("/me")
async def get_current_user_info(request: Request):
    """Get current user information"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticat")
    return user


@router.put("/profile")
async def update_profile(request: Request, data: ProfileUpdateRequest):
    """Update user profile"""
    from backend.auth import get_auth_manager

    user = require_auth(request)
    auth = get_auth_manager()
    result = auth.update_profile(
        user_id=user["id"],
        display_name=data.display_name,
        email=data.email,
        avatar=data.avatar
    )

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@router.put("/password")
async def change_password(request: Request, data: PasswordChangeRequest):
    """Change user password"""
    from backend.auth import get_auth_manager

    user = require_auth(request)
    auth = get_auth_manager()
    result = auth.change_password(
        user_id=user["id"],
        old_password=data.old_password,
        new_password=data.new_password
    )

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@router.post("/register-with-invite")
async def register_with_invitation(data: RegisterWithInviteRequest):
    """Register a new user with invitation code"""
    from backend.auth import get_auth_manager

    auth = get_auth_manager()
    result = auth.register_with_invitation(
        username=data.username,
        password=data.password,
        invitation_code=data.invitation_code,
        email=data.email,
        display_name=data.display_name
    )

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


# === INVITATIONS ===

invitations_router = APIRouter(prefix="/api/invitations", tags=["Invitations"])


@invitations_router.post("")
async def create_invitation(request: Request, data: InvitationRequest):
    """Create invitation code (admin only)"""
    from backend.auth import get_auth_manager

    user = require_admin(request)
    auth = get_auth_manager()
    result = auth.create_invitation(
        created_by=user["id"],
        max_uses=data.max_uses,
        expires_days=data.expires_days
    )

    return result


@invitations_router.get("")
async def get_invitations(request: Request):
    """Get invitations (admin sees all, users see only their own)"""
    from backend.auth import get_auth_manager

    user = require_auth(request)
    auth = get_auth_manager()

    if user.get("is_admin"):
        invitations = auth.get_invitations()
    else:
        invitations = auth.get_invitations(created_by=user["id"])

    return {"invitations": invitations}


@invitations_router.delete("/{invitation_id}")
async def delete_invitation(request: Request, invitation_id: int):
    """Delete an invitation"""
    from backend.auth import get_auth_manager

    require_admin(request)
    auth = get_auth_manager()
    if auth.delete_invitation(invitation_id):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Invitació no trobada")


@invitations_router.get("/validate/{code}")
async def validate_invitation(code: str):
    """Validate an invitation code (public endpoint)"""
    from backend.auth import get_auth_manager

    auth = get_auth_manager()
    return auth.validate_invitation(code)


# === ADMIN USER MANAGEMENT ===

admin_router = APIRouter(prefix="/api/admin", tags=["Admin"])


@admin_router.get("/users")
async def get_all_users(request: Request):
    """Get all users (admin only)"""
    from backend.auth import get_auth_manager

    require_admin(request)
    auth = get_auth_manager()
    users = auth.get_all_users()
    return {"users": users}


@admin_router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(request: Request, user_id: int, active: bool = True):
    """Activate or deactivate a user"""
    from backend.auth import get_auth_manager

    require_admin(request)
    auth = get_auth_manager()
    result = auth.toggle_user_active(user_id, active)

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@admin_router.put("/users/{user_id}/toggle-admin")
async def toggle_admin(request: Request, user_id: int, is_admin: bool = True):
    """Toggle admin status for a user"""
    from backend.auth import get_auth_manager

    require_admin(request)
    auth = get_auth_manager()
    result = auth.toggle_admin(user_id, is_admin)

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@admin_router.put("/users/{user_id}/toggle-premium")
async def toggle_premium(request: Request, user_id: int, is_premium: bool = True):
    """Toggle premium status for a user"""
    from backend.auth import get_auth_manager

    require_admin(request)
    auth = get_auth_manager()
    result = auth.toggle_premium(user_id, is_premium)

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@admin_router.delete("/users/{user_id}")
async def delete_user(request: Request, user_id: int):
    """Delete a user"""
    from backend.auth import get_auth_manager

    admin = require_admin(request)
    auth = get_auth_manager()
    result = auth.delete_user(user_id, admin["id"])

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result
