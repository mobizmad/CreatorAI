from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime

from app.db.database import get_db
from app.models.models import Agent, AgentAPIKey, ConversationSession, ChatLog
from app.schemas.schemas import PublicChatRequest, PublicChatResponse
from app.core.agent_graph import AgentExecutor
from app.services.vector_store import VectorStoreService
from app.services.rate_limiter import get_rate_limiter
from app.api.api_keys import verify_api_key

router = APIRouter(prefix="/v1", tags=["Public API"])


@router.post("/agents/{agent_id}/chat", response_model=PublicChatResponse)
async def public_chat(
    agent_id: UUID,
    request: PublicChatRequest,
    db: Session = Depends(get_db),
    api_key: AgentAPIKey = Depends(verify_api_key),
):
    """
    **Public Chat Endpoint** - Use this to integrate your agent into external systems.
    
    **Rate Limiting:**
    - Free tier: 100 requests/day, 10 requests/minute
    - Basic tier: 1000 requests/day, 50 requests/minute
    - Pro tier: 10000 requests/day, 200 requests/minute
    - Returns `429 Too Many Requests` when limit exceeded
    - Response includes `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers
    
    **Conversation Memory:**
    - Pass `session_id` to enable memory across messages
    - If omitted, a new session is created automatically
    - The `session_id` is returned in the response for subsequent requests
    
    **Authentication:**
    - Header: `X-API-Key: ab_your_api_key_here`
    """
    # Check rate limit
    rate_limiter = get_rate_limiter()
    tier = api_key.rate_limit_tier or 'free'
    
    allowed, remaining, reset_time = rate_limiter.check_rate_limit(
        api_key_id=str(api_key.id),
        tier=tier
    )
    
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate limit exceeded",
                "message": f"You have exceeded the rate limit for the {tier} tier",
                "reset_time": reset_time,
                "tier": tier,
            }
        )
    
    # Load agent
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    # Resolve session
    session_id = request.session_id
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
            raise HTTPException(
                status_code=404, 
                detail="Session not found or doesn't belong to this agent"
            )
    else:
        session = ConversationSession(
            agent_id=agent_id,
            title=f"API: {request.message[:50]}...",
        )
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
            session_id=str(session_id) if agent.memory_enabled else None,
        )

        result = await executor.run(request.message)

        # Save message
        chat_log = ChatLog(
            agent_id=agent_id,
            session_id=session_id,
            user_message=request.message,
            agent_response=result["response"],
            sources={"sources": result["sources"]},
        )
        db.add(chat_log)

        # Update session
        session.last_message_at = datetime.utcnow()
        session.message_count = (session.message_count or 0) + 1

        if session.message_count == 1:
            title_preview = request.message[:50]
            session.title = f"API: {title_preview}..." if len(request.message) > 50 else f"API: {title_preview}"

        # Update API key usage count
        api_key.usage_count = (api_key.usage_count or 0) + 1
        api_key.last_used_at = datetime.utcnow()

        db.commit()

        return PublicChatResponse(
            response=result["response"],
            sources=result.get("sources", []),
            agent_name=agent.name,
            session_id=str(session_id),
            usage_remaining=remaining,  # NEW: Show remaining requests
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing request: {str(e)}",
        )


@router.get("/agents/{agent_id}/info")
async def get_agent_info(
    agent_id: UUID,
    db: Session = Depends(get_db),
    api_key: AgentAPIKey = Depends(verify_api_key),
):
    """Get public information about an agent"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    return {
        "id": str(agent.id),
        "name": agent.name,
        "description": agent.description,
        "llm_provider": agent.llm_provider,
        "llm_model": agent.llm_model,
        "memory_enabled": agent.memory_enabled,
        "created_at": agent.created_at.isoformat(),
    }


@router.get("/usage")
async def get_api_usage(
    api_key: AgentAPIKey = Depends(verify_api_key),
):
    """
    Get current usage statistics for your API key
    
    Returns rate limit tier, remaining requests, and reset times
    """
    rate_limiter = get_rate_limiter()
    tier = api_key.rate_limit_tier or 'free'
    
    stats = rate_limiter.get_usage_stats(
        api_key_id=str(api_key.id),
        tier=tier
    )
    
    return {
        "api_key_name": api_key.key_name,
        "tier": stats['tier'],
        "total_usage": api_key.usage_count or 0,
        "last_used": api_key.last_used_at.isoformat() if api_key.last_used_at else None,
        "limits": {
            "minute": {
                "remaining": stats['minute_remaining'],
                "limit": stats['minute_limit'],
            },
            "day": {
                "remaining": stats['day_remaining'],
                "limit": stats['day_limit'],
            }
        }
    }


@router.get("/health")
async def api_health():
    """Health check for public API"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "api": "AgentBuilder Public API",
    }
