from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime

from app.db.database import get_db
from app.models.models import Agent, AgentAPIKey, ConversationSession, ChatLog
from app.schemas.schemas import PublicChatRequest, PublicChatResponse
from app.core.agent_graph import AgentExecutor
from app.services.vector_store import VectorStoreService
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
    
    This endpoint requires API key authentication via the `X-API-Key` header.
    
    **Conversation Memory:**
    - Pass `session_id` to enable memory across messages
    - If omitted, a new session is created automatically
    - The `session_id` is returned in the response for subsequent requests
    
    **Authentication:**
    - Header: `X-API-Key: ab_your_api_key_here`
    
    **Request:**
    ```json
    {
        "message": "Your question here",
        "session_id": "optional-uuid-for-memory",
        "stream": false
    }
    ```
    
    **Response:**
    ```json
    {
        "response": "Agent's response",
        "sources": [...],
        "agent_name": "Your Agent Name",
        "session_id": "uuid-to-use-for-follow-ups"
    }
    ```
    
    **Example with Memory:**
    ```python
    # First message - no session_id
    response1 = requests.post(url, json={"message": "My name is Alice"})
    session_id = response1.json()["session_id"]
    
    # Follow-up - pass session_id for memory
    response2 = requests.post(url, json={
        "message": "What is my name?",
        "session_id": session_id
    })
    # Agent will respond: "Your name is Alice"
    ```
    
    **Rate Limiting:** Based on your plan (future feature)
    """
    # Load agent
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    # Resolve session - create one if not provided
    session_id = request.session_id
    session = None

    if session_id:
        # Verify session exists and belongs to this agent
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
        # Auto-create a session for this API conversation
        session = ConversationSession(
            agent_id=agent_id,
            title=f"API: {request.message[:50]}...",
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        session_id = session.id

    try:
        # Initialize vector store
        vector_store = VectorStoreService()

        # Create agent executor WITH session for memory
        executor = AgentExecutor(
            agent_id=str(agent_id),
            db=db,
            vector_store=vector_store,
            session_id=str(session_id) if agent.memory_enabled else None,
        )

        # Run the agent
        result = await executor.run(request.message)

        # Save message to chat log WITH session
        chat_log = ChatLog(
            agent_id=agent_id,
            session_id=session_id,
            user_message=request.message,
            agent_response=result["response"],
            sources={"sources": result["sources"]},
        )
        db.add(chat_log)

        # Update session metadata
        session.last_message_at = datetime.utcnow()
        session.message_count = (session.message_count or 0) + 1

        # Auto-generate session title from first message
        if session.message_count == 1:
            title_preview = request.message[:50]
            session.title = f"API: {title_preview}..." if len(request.message) > 50 else f"API: {title_preview}"

        db.commit()

        return PublicChatResponse(
            response=result["response"],
            sources=result.get("sources", []),
            agent_name=agent.name,
            session_id=str(session_id),
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
    """
    Get public information about an agent.
    
    **Authentication:** Requires API key in `X-API-Key` header
    """
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


@router.get("/health")
async def api_health():
    """Health check for public API"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "api": "AgentBuilder Public API",
    }