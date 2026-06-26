import secrets
from datetime import datetime
from typing import List
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import Agent, AgentIntegration, ChannelConversation, ChannelMessage
from app.schemas.schemas import (
    ChannelConversationResponse,
    ChannelConversationUpdate,
    ChannelMessageCreate,
    ChannelMessageResponse,
    ChannelShareConfigResponse,
)

router = APIRouter(prefix="/channel-share", tags=["Channel Share"])


def verify_channel_share(agent_id: UUID, token: str, db: Session) -> Agent:
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    expected = agent.channel_share_token if agent else None
    if (
        not agent
        or not agent.channel_share_enabled
        or not expected
        or not secrets.compare_digest(expected, token or "")
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared channel inbox not found")
    return agent


async def push_line_message(access_token: str | None, to: str | None, text: str) -> None:
    if not access_token or not to:
        raise HTTPException(status_code=400, detail="LINE access token or customer ID is missing.")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.line.me/v2/bot/message/push",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"to": to, "messages": [{"type": "text", "text": text[:5000]}]},
        )
    if response.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"LINE did not accept the reply: {response.text[:300]}")


async def push_telegram_message(bot_token: str | None, chat_id: str | None, text: str) -> None:
    if not bot_token or not chat_id:
        raise HTTPException(status_code=400, detail="Telegram bot token or chat ID is missing.")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text[:4096]},
        )
    if response.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"Telegram did not accept the reply: {response.text[:300]}")


@router.get("/{agent_id}/config", response_model=ChannelShareConfigResponse)
async def get_channel_share_config(
    agent_id: UUID,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    agent = verify_channel_share(agent_id, token, db)
    return ChannelShareConfigResponse(
        agent_id=agent.id,
        agent_name=agent.name,
        agent_description=agent.description,
    )


@router.get("/{agent_id}/conversations", response_model=List[ChannelConversationResponse])
async def list_shared_channel_conversations(
    agent_id: UUID,
    token: str = Query(...),
    provider: str | None = None,
    db: Session = Depends(get_db),
):
    verify_channel_share(agent_id, token, db)
    query = db.query(ChannelConversation).filter(ChannelConversation.agent_id == agent_id)
    if provider and provider != "all":
        query = query.filter(ChannelConversation.provider == provider)
    return query.order_by(ChannelConversation.last_message_at.desc()).limit(100).all()


@router.patch("/{agent_id}/conversations/{conversation_id}", response_model=ChannelConversationResponse)
async def update_shared_channel_conversation(
    agent_id: UUID,
    conversation_id: UUID,
    payload: ChannelConversationUpdate,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    verify_channel_share(agent_id, token, db)
    conversation = (
        db.query(ChannelConversation)
        .filter(ChannelConversation.id == conversation_id, ChannelConversation.agent_id == agent_id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(conversation, field, value)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.post(
    "/{agent_id}/conversations/{conversation_id}/messages",
    response_model=ChannelMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_shared_channel_message(
    agent_id: UUID,
    conversation_id: UUID,
    payload: ChannelMessageCreate,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    verify_channel_share(agent_id, token, db)
    conversation = (
        db.query(ChannelConversation)
        .filter(ChannelConversation.id == conversation_id, ChannelConversation.agent_id == agent_id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    integration = (
        db.query(AgentIntegration)
        .filter(
            AgentIntegration.agent_id == agent_id,
            AgentIntegration.provider == conversation.provider,
            AgentIntegration.is_active == True,
        )
        .first()
    )
    if conversation.provider == "line":
        if not integration:
            raise HTTPException(status_code=404, detail="LINE integration is not active for this agent.")
        await push_line_message(
            integration.access_token,
            conversation.external_chat_id or conversation.external_user_id,
            payload.text,
        )
    elif conversation.provider == "telegram":
        if not integration:
            raise HTTPException(status_code=404, detail="Telegram integration is not active for this agent.")
        await push_telegram_message(
            integration.bot_token,
            conversation.external_chat_id or conversation.external_user_id,
            payload.text,
        )

    message = ChannelMessage(
        conversation_id=conversation.id,
        direction="outbound",
        sender_type="human",
        sender_display_name="Shared operator",
        text=payload.text,
    )
    conversation.human_takeover = True
    conversation.last_message_preview = payload.text[:180]
    conversation.last_message_at = datetime.utcnow()
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
