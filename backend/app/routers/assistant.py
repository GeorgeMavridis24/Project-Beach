from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from .. import assistant
from ..schemas import ChatIn
from ..security import get_current_user

router = APIRouter(prefix="/assistant", tags=["AI Βοηθός"])


@router.post("/chat")
async def chat(data: ChatIn, user: dict = Depends(get_current_user)):
    """Μία απάντηση του βοηθού. Επιστρέφει κείμενο και (προαιρετικά) προτάσεις
    κράτησης που ο χρήστης επιβεβαιώνει στην εφαρμογή."""
    messages = [{"role": m.role, "content": m.content} for m in data.messages]
    try:
        return await run_in_threadpool(assistant.chat, user, messages)
    except assistant.AssistantUnavailable as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
