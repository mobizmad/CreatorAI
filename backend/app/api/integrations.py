from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from datetime import datetime
import httpx

from app.db.database import get_db
from app.models.models import AgentIntegration, ChannelConversation, ChannelMessage
from app.core.agent_graph import AgentExecutor
from app.services.vector_store import VectorStoreService

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


def record_channel_message(
    db: Session,
    agent_id: UUID,
    provider: str,
    external_user_id: str,
    text: str,
    external_chat_id: str | None = None,
    display_name: str | None = None,
    raw_payload: dict | None = None,
) -> ChannelConversation:
    conversation = (
        db.query(ChannelConversation)
        .filter(
            ChannelConversation.agent_id == agent_id,
            ChannelConversation.provider == provider,
            ChannelConversation.external_user_id == external_user_id,
        )
        .first()
    )
    if not conversation:
        conversation = ChannelConversation(
            agent_id=agent_id,
            provider=provider,
            external_user_id=external_user_id,
            external_chat_id=external_chat_id,
            display_name=display_name,
        )
        db.add(conversation)
        db.flush()

    conversation.external_chat_id = external_chat_id or conversation.external_chat_id
    conversation.display_name = display_name or conversation.display_name
    conversation.last_message_preview = text[:180]
    conversation.last_message_at = datetime.utcnow()
    db.add(
        ChannelMessage(
            conversation_id=conversation.id,
            direction="inbound",
            sender_type="user",
            text=text,
            raw_payload=raw_payload,
        )
    )
    db.commit()
    db.refresh(conversation)
    return conversation


def record_channel_reply(db: Session, conversation: ChannelConversation, text: str, sender_type: str = "agent") -> None:
    conversation.last_message_preview = text[:180]
    conversation.last_message_at = datetime.utcnow()
    db.add(
        ChannelMessage(
            conversation_id=conversation.id,
            direction="outbound",
            sender_type=sender_type,
            text=text,
        )
    )
    db.commit()


async def get_line_profile(access_token: str | None, user_id: str) -> str | None:
    if not access_token or not user_id.startswith("U"):
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                f"https://api.line.me/v2/bot/profile/{user_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if response.status_code != 200:
                return None
            data = response.json()
            return data.get("displayName")
    except Exception as exc:
        print(f"LINE profile lookup failed: {exc}")
        return None


async def reply_to_line(access_token: str | None, reply_token: str | None, text: str) -> bool:
    if not access_token or not reply_token:
        return False
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.line.me/v2/bot/message/reply",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "replyToken": reply_token,
                    "messages": [{"type": "text", "text": text[:5000]}],
                },
            )
            if response.status_code >= 300:
                print(f"LINE reply failed: {response.status_code} {response.text[:300]}")
                return False
            return True
    except Exception as exc:
        print(f"LINE reply request failed: {exc}")
        return False


async def generate_channel_agent_reply(
    db: Session,
    agent_id: UUID,
    integration: AgentIntegration,
    user_text: str,
) -> str:
    prompt = user_text
    if integration.channel_prompt:
        prompt = f"{integration.channel_prompt.strip()}\n\nCustomer message:\n{user_text}"
    executor = AgentExecutor(
        agent_id=str(agent_id),
        db=db,
        vector_store=VectorStoreService(),
    )
    result = await executor.run(prompt)
    reply = (result.get("response") or "").strip()
    if not reply:
        reply = integration.fallback_message or "Sorry, I could not generate a reply right now."
    return reply


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
    integration = get_active_integration(db, agent_id, "line")
    payload = await request.json()
    recorded = 0
    replied = 0
    for event in payload.get("events", []):
        message = event.get("message") or {}
        if event.get("type") != "message" or message.get("type") != "text":
            continue
        source = event.get("source") or {}
        user_id = source.get("userId") or source.get("groupId") or source.get("roomId") or "unknown"
        display_name = await get_line_profile(integration.access_token, user_id)
        conversation = record_channel_message(
            db,
            agent_id,
            "line",
            user_id,
            message.get("text") or "",
            external_chat_id=source.get("groupId") or source.get("roomId") or user_id,
            display_name=display_name,
            raw_payload=event,
        )
        recorded += 1
        if (
            integration.auto_reply_enabled
            and not integration.human_takeover_enabled
            and not conversation.human_takeover
        ):
            try:
                ai_reply = await generate_channel_agent_reply(
                    db,
                    agent_id,
                    integration,
                    message.get("text") or "",
                )
                if await reply_to_line(integration.access_token, event.get("replyToken"), ai_reply):
                    record_channel_reply(db, conversation, ai_reply, sender_type="agent")
                    replied += 1
                else:
                    record_channel_reply(db, conversation, ai_reply, sender_type="agent")
            except Exception as exc:
                print(f"LINE auto reply failed: {exc}")
                if integration.fallback_message:
                    await reply_to_line(integration.access_token, event.get("replyToken"), integration.fallback_message)
                    record_channel_reply(db, conversation, integration.fallback_message, sender_type="system")
    return {
        "status": "received",
        "provider": "line",
        "agent_id": str(agent_id),
        "events": len(payload.get("events", [])),
        "recorded": recorded,
        "replied": replied,
    }


@router.post("/telegram/webhook/{agent_id}")
async def receive_telegram_webhook(agent_id: UUID, request: Request, db: Session = Depends(get_db)):
    get_active_integration(db, agent_id, "telegram")
    payload = await request.json()
    message = payload.get("message") or payload.get("edited_message") or {}
    text = message.get("text")
    recorded = 0
    if text:
        chat = message.get("chat") or {}
        sender = message.get("from") or {}
        external_user_id = str(sender.get("id") or chat.get("id") or "unknown")
        display_name = " ".join(
            part for part in [sender.get("first_name"), sender.get("last_name")] if part
        ) or sender.get("username")
        record_channel_message(
            db,
            agent_id,
            "telegram",
            external_user_id,
            text,
            external_chat_id=str(chat.get("id") or external_user_id),
            display_name=display_name,
            raw_payload=payload,
        )
        recorded = 1
    return {"status": "received", "provider": "telegram", "agent_id": str(agent_id), "update_id": payload.get("update_id"), "recorded": recorded}
