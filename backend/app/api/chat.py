from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional, AsyncGenerator
from uuid import UUID
from datetime import datetime
import json
import asyncio

from app.db.database import get_db
from app.models.models import User, Agent, ChatLog, ConversationSession
from app.schemas.schemas import (
    ChatMessage,
    ChatResponse,
    ChatLogResponse,
    SessionCreate,
    SessionResponse,
    ChatRatingRequest,
)
from app.api.auth import get_current_user
from app.core.agent_graph import AgentExecutor
from app.services.vector_store import VectorStoreService

# ─────────────────────────────────────────
# NEW: Import Multi-Agent Executor
# ─────────────────────────────────────────
from app.core.multi_agent_graph import MultiAgentExecutor

router = APIRouter(prefix="/agents/{agent_id}/chat", tags=["Chat"])


def verify_agent_access(agent_id: UUID, user_id: UUID, db: Session) -> Agent:
    """Verify user has access to agent"""
    agent = (
        db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == user_id).first()
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found or access denied",
        )
    return agent


# ─────────────────────────────────────────
# Session Endpoints
# ─────────────────────────────────────────

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


# ─────────────────────────────────────────
# Chat Endpoint with Multi-Agent Support
# ─────────────────────────────────────────

async def stream_response(
    executor,  # Can be AgentExecutor or MultiAgentExecutor
    message: str,
    agent_id: UUID,
    session_id: UUID,
    db: Session
) -> AsyncGenerator[str, None]:
    """
    Stream agent response token by token
    """
    full_response = ""
    sources = []
    
    try:
        # Run agent with streaming enabled
        async for chunk in executor.run_streaming(message):
            if chunk["type"] == "token":
                token = chunk["content"]
                full_response += token
                
                # Send token to client
                yield f"data: {json.dumps({'token': token, 'sources': None})}\n\n"
                await asyncio.sleep(0)
                
            elif chunk["type"] == "sources":
                sources = chunk["content"]
        
        # Send final sources
        yield f"data: {json.dumps({'token': '', 'sources': sources})}\n\n"
        
        # Send done signal
        yield "data: [DONE]\n\n"
        
        # Save to database after streaming completes
        session = db.query(ConversationSession).filter(
            ConversationSession.id == session_id
        ).first()
        
        if session:
            chat_log = ChatLog(
                agent_id=agent_id,
                session_id=session_id,
                user_message=message,
                agent_response=full_response,
                sources={"sources": sources},
                rating=0,
            )
            db.add(chat_log)
            
            session.last_message_at = datetime.utcnow()
            session.message_count = (session.message_count or 0) + 1
            
            if session.message_count == 1:
                title = message[:60]
                session.title = title + "..." if len(message) > 60 else title
            
            db.commit()
            
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"


@router.post("", response_model=ChatResponse)
async def chat_with_agent(
    agent_id: UUID,
    message: ChatMessage,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send a message to an agent and get a response
    
    NEW: Automatically uses Multi-Agent Mode if enabled
    NEW: Automatically enables Web Search if enabled
    """
    agent = verify_agent_access(agent_id, current_user.id, db)

    # Resolve session
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
        
        # ─────────────────────────────────────────
        # NEW: Choose executor based on agent settings
        # ─────────────────────────────────────────
        if agent.multi_agent_enabled:
            # Use Multi-Agent Workforce
            print(f"✅ Using Multi-Agent Mode for agent {agent_id}")
            executor = MultiAgentExecutor(
                agent_id=str(agent_id),
                db=db,
                vector_store=vector_store,
            )
        else:
            # Use Single Agent (original behavior)
            print(f"ℹ️ Using Single Agent Mode for agent {agent_id}")
            executor = AgentExecutor(
                agent_id=str(agent_id),
                db=db,
                vector_store=vector_store,
                session_id=str(session_id),
                model_override=message.model_override
            )
        
        # ─────────────────────────────────────────
        # Handle Streaming vs Non-Streaming
        # ─────────────────────────────────────────
        if getattr(message, "stream", False):
            return StreamingResponse(
                stream_response(executor, message.message, agent_id, session_id, db),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                }
            )
        
        # Non-streaming (original behavior)
        result = await executor.run(message.message)

        chat_log = ChatLog(
            agent_id=agent_id,
            session_id=session_id,
            user_message=message.message,
            agent_response=result["response"],
            sources={"sources": result["sources"]},
            rating=0,
        )
        db.add(chat_log)

        session.last_message_at = datetime.utcnow()
        session.message_count = (session.message_count or 0) + 1

        if session.message_count == 1:
            title = message.message[:60]
            session.title = title + "..." if len(message.message) > 60 else title

        db.commit()
        db.refresh(chat_log)

        return ChatResponse(
            response=result["response"],
            sources=result.get("sources", []),
            session_id=str(session_id),
            message_id=chat_log.id,
        )

    except Exception as e:
        print(f"❌ Chat error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing chat: {str(e)}",
        )


# ─────────────────────────────────────────
# Existing Endpoints (History & Rating)
# ─────────────────────────────────────────

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


@router.post("/{message_id}/rate", response_model=ChatLogResponse)
async def rate_message(
    agent_id: UUID,
    message_id: UUID,
    rating_data: ChatRatingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rate a chat message (1 for helpful, -1 for unhelpful)"""
    verify_agent_access(agent_id, current_user.id, db)
    
    chat_log = db.query(ChatLog).filter(
        ChatLog.id == message_id,
        ChatLog.agent_id == agent_id
    ).first()
    
    if not chat_log:
        raise HTTPException(status_code=404, detail="Message not found")
        
    chat_log.rating = rating_data.rating
    db.commit()
    db.refresh(chat_log)
    
    return chat_log
