from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import AgentIntegration

router = APIRouter(prefix="/integrations", tags=["Integrations"])


def get_active_integration(db: Session, agent_id: UUID, provider: str) -> AgentIntegration:
    integration = (
        db.query(AgentIntegration)
        .filter(
            AgentIntegration.agent_id == agent_id,
            AgentIntegration.provider == provider,
            AgentIntegration.is_active == True,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Integration is not active for this agent.")
    return integration


@router.get("/facebook/webhook/{agent_id}")
async def verify_facebook_webhook(agent_id: UUID, request: Request, db: Session = Depends(get_db)):
    integration = get_active_integration(db, agent_id, "facebook")
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    if mode == "subscribe" and token and token == integration.verify_token and challenge:
        return PlainTextResponse(challenge)
    raise HTTPException(status_code=403, detail="Facebook webhook verification failed.")


@router.post("/facebook/webhook/{agent_id}")
async def receive_facebook_webhook(agent_id: UUID, request: Request, db: Session = Depends(get_db)):
    get_active_integration(db, agent_id, "facebook")
    payload = await request.json()
    return {"status": "received", "provider": "facebook", "agent_id": str(agent_id), "entries": len(payload.get("entry", []))}


@router.post("/line/webhook/{agent_id}")
async def receive_line_webhook(agent_id: UUID, request: Request, db: Session = Depends(get_db)):
    get_active_integration(db, agent_id, "line")
    payload = await request.json()
    return {"status": "received", "provider": "line", "agent_id": str(agent_id), "events": len(payload.get("events", []))}


@router.post("/telegram/webhook/{agent_id}")
async def receive_telegram_webhook(agent_id: UUID, request: Request, db: Session = Depends(get_db)):
    get_active_integration(db, agent_id, "telegram")
    payload = await request.json()
    return {"status": "received", "provider": "telegram", "agent_id": str(agent_id), "update_id": payload.get("update_id")}
