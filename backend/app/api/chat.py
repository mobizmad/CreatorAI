from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from app.db.database import get_db
from app.models.models import User, Agent, ChatLog, ConversationSession
from app.schemas.schemas import (
    ChatMessage,
    ChatResponse,
    ChatLogResponse,
    SessionCreate,
    SessionResponse,
)
from app.api.auth import get_current_user
from app.core.agent_graph import AgentExecutor
from app.services.vector_store import VectorStoreService

router = APIRouter(prefix="/agents/{agent_id}/chat", tags=["Chat"])


def verify_agent_access(agent_id: UUID, user_id: UUID, db: Session) -> Agent:
    agent = (
        db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == user_id).first()
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found or access denied",
        )
    return agent


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    session = ConversationSession(agent_id=agent_id, title="New Conversation")
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(
    agent_id: UUID,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    sessions = (
        db.query(ConversationSession)
        .filter(
            ConversationSession.agent_id == agent_id,
            ConversationSession.is_active == True,
        )
        .order_by(ConversationSession.last_message_at.desc())
        .limit(limit)
        .all()
    )
    return sessions


@router.get("/sessions/{session_id}/messages", response_model=List[ChatLogResponse])
async def get_session_messages(
    agent_id: UUID,
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    messages = (
        db.query(ChatLog)
        .filter(
            ChatLog.agent_id == agent_id,
            ChatLog.session_id == session_id,
        )
        .order_by(ChatLog.created_at.asc())
        .all()
    )
    return messages


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    agent_id: UUID,
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    session = (
        db.query(ConversationSession)
        .filter(
            ConversationSession.id == session_id,
            ConversationSession.agent_id == agent_id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.query(ChatLog).filter(ChatLog.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return None


@router.post("", response_model=ChatResponse)
async def chat_with_agent(
    agent_id: UUID,
    message: ChatMessage,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agent = verify_agent_access(agent_id, current_user.id, db)

    session_id = message.session_id
    session = None

    if session_id:
        session = (
            db.query(ConversationSession)
            .filter(
                ConversationSession.id == session_id,
                ConversationSession.agent_id == agent_id,
            )
            .first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = ConversationSession(agent_id=agent_id, title="New Conversation")
        db.add(session)
        db.commit()
        db.refresh(session)
        session_id = session.id

    try:
        vector_store = VectorStoreService()
        executor = AgentExecutor(
            agent_id=str(agent_id),
            db=db,
            vector_store=vector_store,
            session_id=str(session_id),
        )
        result = await executor.run(message.message)

        chat_log = ChatLog(
            agent_id=agent_id,
            session_id=session_id,
            user_message=message.message,
            agent_response=result["response"],
            sources={"sources": result["sources"]},
        )
        db.add(chat_log)

        session.last_message_at = datetime.utcnow()
        session.message_count = (session.message_count or 0) + 1

        if session.message_count == 1:
            title = message.message[:60]
            session.title = title + "..." if len(message.message) > 60 else title

        db.commit()

        return ChatResponse(
            response=result["response"],
            sources=result.get("sources", []),
            session_id=str(session_id),
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing chat: {str(e)}",
        )


@router.get("/history", response_model=List[ChatLogResponse])
async def get_chat_history(
    agent_id: UUID,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    chat_logs = (
        db.query(ChatLog)
        .filter(ChatLog.agent_id == agent_id)
        .order_by(ChatLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return chat_logs


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_chat_history(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_agent_access(agent_id, current_user.id, db)
    db.query(ChatLog).filter(ChatLog.agent_id == agent_id).delete()
    db.query(ConversationSession).filter(ConversationSession.agent_id == agent_id).delete()
    db.commit()
    return None