from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta

from app.db.database import get_db
from app.models.models import User, Agent, AgentAPIKey
from app.schemas.schemas import (
    APIKeyCreate,
    APIKeyResponse,
    APIKeyCreatedResponse,
)
from app.api.auth import get_current_user

router = APIRouter(prefix="/agents/{agent_id}/api-keys", tags=["API Keys"])


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


@router.post("", response_model=APIKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    agent_id: UUID,
    key_data: APIKeyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new API key for an agent.
    
    **Important**: The API key is only shown once. Save it securely!
    """
    # Verify access
    agent = verify_agent_access(agent_id, current_user.id, db)

    # Generate new API key
    api_key = AgentAPIKey.generate_key()
    key_hash = AgentAPIKey.hash_key(api_key)
    key_prefix = api_key[:12]  # Store first 12 chars for identification

    # Calculate expiration
    expires_at = None
    if key_data.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=key_data.expires_in_days)

    # Create database record
    new_key = AgentAPIKey(
        agent_id=agent_id,
        key_name=key_data.key_name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        expires_at=expires_at,
    )

    db.add(new_key)
    db.commit()
    db.refresh(new_key)

    return APIKeyCreatedResponse(
        id=new_key.id,
        key_name=new_key.key_name,
        api_key=api_key,  # Only returned here!
        key_prefix=new_key.key_prefix,
        created_at=new_key.created_at,
        expires_at=new_key.expires_at,
    )


@router.get("", response_model=List[APIKeyResponse])
async def list_api_keys(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all API keys for an agent"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    keys = (
        db.query(AgentAPIKey)
        .filter(AgentAPIKey.agent_id == agent_id)
        .order_by(AgentAPIKey.created_at.desc())
        .all()
    )

    return keys


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    agent_id: UUID,
    key_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke (delete) an API key"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    api_key = (
        db.query(AgentAPIKey)
        .filter(AgentAPIKey.id == key_id, AgentAPIKey.agent_id == agent_id)
        .first()
    )

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="API key not found"
        )

    db.delete(api_key)
    db.commit()

    return None


@router.patch("/{key_id}/toggle", response_model=APIKeyResponse)
async def toggle_api_key(
    agent_id: UUID,
    key_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle API key active status"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    api_key = (
        db.query(AgentAPIKey)
        .filter(AgentAPIKey.id == key_id, AgentAPIKey.agent_id == agent_id)
        .first()
    )

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="API key not found"
        )

    api_key.is_active = not api_key.is_active
    db.commit()
    db.refresh(api_key)

    return api_key


async def verify_api_key(
    agent_id: UUID,
    x_api_key: str = Header(..., description="API Key for authentication"),
    db: Session = Depends(get_db),
) -> AgentAPIKey:
    """
    Dependency to verify API key authentication.
    Used for public endpoints that don't require user authentication.
    """
    # Find all active keys for this agent
    api_keys = (
        db.query(AgentAPIKey)
        .filter(
            AgentAPIKey.agent_id == agent_id,
            AgentAPIKey.is_active == True,
        )
        .all()
    )

    # Try to find matching key
    for key_record in api_keys:
        if AgentAPIKey.verify_key(x_api_key, key_record.key_hash):
            # Check expiration
            if key_record.expires_at and key_record.expires_at < datetime.utcnow():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="API key has expired",
                )

            # Update usage stats
            key_record.usage_count += 1
            key_record.last_used_at = datetime.utcnow()
            db.commit()

            return key_record

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key",
        headers={"WWW-Authenticate": "Bearer"},
    )
