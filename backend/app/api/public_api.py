from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.db.database import get_db
from app.models.models import Agent, AgentAPIKey
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
    
    **Authentication:**
    - Header: `X-API-Key: ab_your_api_key_here`
    
    **Request:**
    ```json
    {
        "message": "Your question here",
        "stream": false
    }
    ```
    
    **Response:**
    ```json
    {
        "response": "Agent's response",
        "sources": [...],
        "agent_name": "Your Agent Name"
    }
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

    try:
        # Initialize vector store
        vector_store = VectorStoreService()

        # Create agent executor
        executor = AgentExecutor(
            agent_id=str(agent_id), db=db, vector_store=vector_store
        )

        # Run the agent
        result = await executor.run(request.message)

        return PublicChatResponse(
            response=result["response"],
            sources=result.get("sources", []),
            agent_name=agent.name,
        )

    except Exception as e:
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
