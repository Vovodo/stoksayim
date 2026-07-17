from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, require_role, session_repo
from app.core.security import create_access_token, verify_password
from app.models.domain import UserRole
from app.models.schemas import (
    AdminResetPasswordRequest,
    AdminResetPasswordResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserListItem,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    user = await session_repo.get_user(body.username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    return TokenResponse(
        access_token=token,
        role=user["role"],
        username=user["username"],
    )


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest):
    try:
        user = await session_repo.create_user(body.username, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    return TokenResponse(
        access_token=token,
        role=user["role"],
        username=user["username"],
    )


@router.get("/me", response_model=UserResponse)
async def me(user: dict = Depends(get_current_user)):
    return UserResponse(id=user["id"], username=user["username"], role=user["role"])


@router.get("/users", response_model=list[UserListItem])
async def list_users(user: dict = Depends(require_role(UserRole.ADMIN))):
    rows = await session_repo.list_users()
    return [
        UserListItem(
            id=r["id"],
            username=r["username"],
            role=r["role"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.patch("/users/{user_id}/password", response_model=AdminResetPasswordResponse)
async def admin_reset_password(
    user_id: int,
    body: AdminResetPasswordRequest,
    admin: dict = Depends(require_role(UserRole.ADMIN)),
):
    target = await session_repo.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    try:
        await session_repo.update_user_password(user_id, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session_repo.add_system_event(
        admin["id"],
        "user_password_reset",
        f"Şifre sıfırlandı: {target['username']}",
    )
    return AdminResetPasswordResponse(
        username=target["username"],
        password=body.password,
        message=f"{target['username']} için yeni şifre kaydedildi.",
    )


@router.delete("/users/{user_id}", status_code=204)
async def admin_delete_user(
    user_id: int,
    admin: dict = Depends(require_role(UserRole.ADMIN)),
):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz")
    try:
        removed = await session_repo.delete_user(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session_repo.add_system_event(
        admin["id"],
        "user_delete",
        f"Hesap silindi: {removed['username']}",
    )
