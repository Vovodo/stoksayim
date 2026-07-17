from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_token
from app.models.domain import UserRole
from app.repositories.excel_repository import ExcelInventoryCache
from app.repositories.sqlite_repository import SQLiteSessionRepository
from app.services.count_service import CountService
from app.services.report_service import ReportService

security = HTTPBearer(auto_error=False)

stock_repo = ExcelInventoryCache()
session_repo = SQLiteSessionRepository()
count_service = CountService(stock_repo, session_repo)
report_service = ReportService(count_service)

ws_connections: list = []


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Giriş gerekli")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Geçersiz token")
    user = await session_repo.get_user(payload.get("sub", ""))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Kullanıcı bulunamadı")
    return user


def require_role(*roles: UserRole):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in [r.value for r in roles]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Yetki yok")
        return user

    return checker
