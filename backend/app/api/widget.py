# backend/app/api/widget.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
import json
import asyncio

from app.db.database import get_db
from app.models.models import Agent, ChatLog, ConversationSession
from app.schemas.schemas import PublicChatRequest, PublicChatResponse
from app.core.agent_graph import AgentExecutor
from app.core.multi_agent_graph import MultiAgentExecutor
from app.services.vector_store import VectorStoreService

router = APIRouter(prefix="/widget", tags=["Widget"])


@router.get("/{agent_id}/config")
async def get_widget_config(agent_id: UUID, db: Session = Depends(get_db)):
    """
    Returns ONLY safe, public-facing agent info.
    Never exposes system_prompt, api_key, or internal settings.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent or not agent.is_public:
        raise HTTPException(status_code=404, detail="Widget not found or not public")
    
    return {
        "name": agent.name,
        "description": agent.description,
        # Intentionally omitting: system_prompt, api_key, tools config, etc.
    }


@router.post("/{agent_id}/chat")
async def widget_chat(
    agent_id: UUID,
    message: PublicChatRequest,
    db: Session = Depends(get_db),
):
    """
    Public chat endpoint — no auth required.
    Only works if agent.is_public is True.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not agent.is_public:
        raise HTTPException(status_code=403, detail="This agent is not publicly accessible")

    # Resolve or create session
    session_id = message.session_id
    session = None

    if session_id:
        session = db.query(ConversationSession).filter(
            ConversationSession.id == session_id,
            ConversationSession.agent_id == agent_id,
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = ConversationSession(agent_id=agent_id, title="Widget Conversation")
        db.add(session)
        db.commit()
        db.refresh(session)
        session_id = session.id

    try:
        vector_store = VectorStoreService()

        if agent.multi_agent_enabled:
            executor = MultiAgentExecutor(
                agent_id=str(agent_id),
                db=db,
                vector_store=vector_store,
            )
        else:
            executor = AgentExecutor(
                agent_id=str(agent_id),
                db=db,
                vector_store=vector_store,
                session_id=str(session_id),
            )

        # Handle streaming
        if message.stream:
            async def stream_gen():
                full_response = ""
                sources = []
                async for chunk in executor.run_streaming(message.message):
                    if chunk["type"] == "token":
                        full_response += chunk["content"]
                        yield f"data: {json.dumps({'token': chunk['content']})}\n\n"
                        await asyncio.sleep(0)
                    elif chunk["type"] == "sources":
                        sources = chunk["content"]

                yield f"data: {json.dumps({'token': '', 'sources': sources})}\n\n"
                yield "data: [DONE]\n\n"
                _save_chat(db, agent_id, session_id, session, message.message, full_response, sources)

            return StreamingResponse(
                stream_gen(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
            )

        # Non-streaming
        result = await executor.run(message.message)
        _save_chat(db, agent_id, session_id, session, message.message, result["response"], result.get("sources", []))

        return PublicChatResponse(
            response=result["response"],
            sources=result.get("sources", []),
            agent_name=agent.name,
            session_id=str(session_id),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")


def _save_chat(db, agent_id, session_id, session, user_message, agent_response, sources):
    """Helper to save chat log and update session"""
    chat_log = ChatLog(
        agent_id=agent_id,
        session_id=session_id,
        user_message=user_message,
        agent_response=agent_response,
        sources={"sources": sources},
        rating=0,
    )
    db.add(chat_log)

    session.last_message_at = datetime.utcnow()
    session.message_count = (session.message_count or 0) + 1
    if session.message_count == 1:
        title = user_message[:60]
        session.title = title + "..." if len(user_message) > 60 else title

    db.commit()