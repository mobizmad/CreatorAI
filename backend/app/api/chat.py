from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional, AsyncGenerator
from uuid import UUID
from datetime import datetime
import json
import asyncio
import httpx

from app.db.database import get_db
from app.models.models import User, Agent, ChatLog, ConversationSession
from app.config import settings
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
from app.tools.builtin_agent_tools import (
    get_active_builtin_tool_types,
    wants_image_generation,
    wants_pdf_generation,
)

# ─────────────────────────────────────────
# NEW: Import Multi-Agent Executor
# ─────────────────────────────────────────
from app.services.token_service import TokenManager
from app.core.multi_agent_graph import MultiAgentExecutor

router = APIRouter(prefix="/agents/{agent_id}/chat", tags=["Chat"])

DEFAULT_OLLAMA_AGENT_MODEL = "gemma4:latest"
OPENAI_ONLY_MODELS = {"gpt-4", "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"}


def repair_agent_llm_config(agent: Agent, db: Session) -> None:
    if agent.llm_provider == "ollama" and (
        not agent.llm_model or agent.llm_model in OPENAI_ONLY_MODELS or agent.llm_model.startswith("gpt-")
    ):
        agent.llm_model = DEFAULT_OLLAMA_AGENT_MODEL
        db.add(agent)
        db.commit()
        db.refresh(agent)


def friendly_chat_error(error: Exception | str) -> str:
    text = str(error)
    lowered = text.lower()
    if "ollama" in lowered and ("404" in lowered or "not found" in lowered):
        return "This agent was using a model that is not available. I switched it to gemma4. Please try again."
    if "host.docker.internal" in lowered or "connection" in lowered or "connect" in lowered:
        return "Ollama is not reachable. Please make sure Ollama is running, then try again."
    if "api key" in lowered:
        return "The API key for this model is missing or not valid."
    return "Something went wrong while answering. Please try again."


async def check_ollama_health(model_name: str) -> tuple[bool, bool]:
    endpoint = (settings.OLLAMA_ENDPOINT or "http://localhost:11434").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(f"{endpoint}/api/tags")
            response.raise_for_status()
            data = response.json()
            models = {item.get("name") for item in data.get("models", [])}
            model_ok = model_name in models
            if not model_ok and ":" not in model_name:
                model_ok = f"{model_name}:latest" in models
            return True, model_ok
    except Exception:
        return False, False


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


@router.get("/health")
async def agent_chat_health(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agent = verify_agent_access(agent_id, current_user.id, db)
    repair_agent_llm_config(agent, db)

    ollama_connected: bool | None = None
    model_ok = True
    if agent.llm_provider == "ollama":
        ollama_connected, model_ok = await check_ollama_health(agent.llm_model)
    elif agent.llm_provider == "openai":
        model_ok = bool(settings.OPENAI_API_KEY or agent.api_key)

    knowledge_count = len(agent.knowledge_bases or [])
    knowledge_files_ready = True
    if knowledge_count:
        knowledge_files_ready = all(getattr(kb, "processed", True) for kb in agent.knowledge_bases)

    if agent.llm_provider == "ollama" and not ollama_connected:
        message = "Ollama is not reachable. Please make sure Ollama is running."
    elif not model_ok:
        message = "This agent model is not available. I switched bad GPT model names to gemma4."
    elif knowledge_count:
        message = f"{knowledge_count} knowledge file(s) ready."
    else:
        message = "Ready to chat."

    return {
        "model_ok": model_ok,
        "ollama_connected": ollama_connected,
        "knowledge_files_ready": knowledge_files_ready,
        "knowledge_file_count": knowledge_count,
        "provider": agent.llm_provider,
        "model": agent.llm_model,
        "message": message,
    }


# ─────────────────────────────────────────
# Chat Endpoint with Multi-Agent Support
# ─────────────────────────────────────────

async def stream_response(
    executor,  # Can be AgentExecutor or MultiAgentExecutor
    message: str,
    agent_id: UUID,
    session_id: UUID,
    db: Session,
    user: User,
    minimum_cost: int
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
        
        message_id = None

        # Save to database after streaming completes, before the final client event
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
            db.refresh(chat_log)
            message_id = str(chat_log.id)
            
        TokenManager.deduct_tokens(
            user,
            db,
            TokenManager.llm_cost(executor.agent.llm_provider, message, full_response),
            action="Agent chat",
            provider=executor.agent.llm_provider,
            model=executor.agent.llm_model,
        )

        # Send final sources and session metadata
        yield f"data: {json.dumps({'token': '', 'sources': sources, 'session_id': str(session_id), 'message_id': message_id})}\n\n"

        # Send done signal
        yield "data: [DONE]\n\n"
            
    except HTTPException:
        raise
    except Exception as e:
        yield f"data: {json.dumps({'error': friendly_chat_error(e)})}\n\n"
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
    repair_agent_llm_config(agent, db)

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

    minimum_cost = TokenManager.llm_cost(agent.llm_provider, message.message)
    TokenManager.check_paid_model_access(current_user, agent.llm_provider)
    TokenManager.check_balance(current_user, minimum_cost)

    try:
        vector_store = VectorStoreService()
        
        # ─────────────────────────────────────────
        # NEW: Choose executor based on agent settings
        # ─────────────────────────────────────────
        active_builtin_tools = get_active_builtin_tool_types(db, str(agent_id))
        recent_history = []
        if session_id:
            recent_logs = (
                db.query(ChatLog)
                .filter(ChatLog.session_id == session_id)
                .order_by(ChatLog.created_at.desc())
                .limit(4)
                .all()
            )
            for log in reversed(recent_logs):
                recent_history.append({"role": "user", "content": log.user_message})
                recent_history.append({"role": "assistant", "content": log.agent_response})

        should_use_builtin_tool = (
            ("ai_image_generation" in active_builtin_tools and wants_image_generation(message.message, recent_history))
            or ("pdf_generator" in active_builtin_tools and wants_pdf_generation(message.message))
        )

        if agent.multi_agent_enabled and not should_use_builtin_tool:
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
                stream_response(executor, message.message, agent_id, session_id, db, current_user, minimum_cost),
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

        TokenManager.deduct_tokens(
            current_user,
            db,
            TokenManager.llm_cost(agent.llm_provider, message.message, result["response"]),
            action="Agent chat",
            provider=agent.llm_provider,
            model=agent.llm_model,
        )

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
            detail=friendly_chat_error(e),
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
