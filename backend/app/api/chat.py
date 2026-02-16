from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.db.database import get_db
from app.models.models import User, Agent, ChatLog
from app.schemas.schemas import ChatMessage, ChatResponse, ChatLogResponse
from app.api.auth import get_current_user
from app.core.agent_graph import AgentExecutor
from app.services.vector_store import VectorStoreService

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


@router.post("", response_model=ChatResponse)
async def chat_with_agent(
    agent_id: UUID,
    message: ChatMessage,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message to an agent and get a response"""
    # Verify access
    agent = verify_agent_access(agent_id, current_user.id, db)

    try:
        # Initialize vector store
        vector_store = VectorStoreService()

        # Create agent executor
        executor = AgentExecutor(
            agent_id=str(agent_id), db=db, vector_store=vector_store
        )

        # Run the agent
        result = await executor.run(message.message)

        # Save to chat log
        chat_log = ChatLog(
            agent_id=agent_id,
            user_message=message.message,
            agent_response=result["response"],
            sources={"sources": result["sources"]},
        )

        db.add(chat_log)
        db.commit()

        return ChatResponse(
            response=result["response"], sources=result.get("sources", [])
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
    """Get chat history for an agent"""
    # Verify access
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
    """Clear chat history for an agent"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    db.query(ChatLog).filter(ChatLog.agent_id == agent_id).delete()
    db.commit()

    return None
