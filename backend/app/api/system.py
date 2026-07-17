from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, session_repo
from app.models.schemas import SystemEventResponse

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/logs", response_model=list[SystemEventResponse])
async def system_logs(user: dict = Depends(get_current_user)):
    rows = await session_repo.get_system_events()
    return [
        SystemEventResponse(
            id=r["id"],
            username=r["username"],
            action=r["action"],
            filename=r.get("filename"),
            details=r["details"],
            created_at=r["created_at"],
        )
        for r in rows
    ]
