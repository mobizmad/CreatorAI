from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.db.database import get_db
from app.models.models import User, Agent, Correction
from app.schemas.schemas import CorrectionCreate, CorrectionResponse
from app.api.auth import get_current_user

router = APIRouter(prefix="/agents/{agent_id}/corrections", tags=["Corrections"])


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


@router.post("", response_model=CorrectionResponse, status_code=status.HTTP_201_CREATED)
async def create_correction(
    agent_id: UUID,
    correction_data: CorrectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a correction (few-shot example)"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    # Create correction
    correction = Correction(
        agent_id=agent_id,
        user_query=correction_data.user_query,
        incorrect_response=correction_data.incorrect_response,
        corrected_response=correction_data.corrected_response,
        context=correction_data.context,
    )

    db.add(correction)
    db.commit()
    db.refresh(correction)

    return correction


@router.get("", response_model=List[CorrectionResponse])
async def list_corrections(
    agent_id: UUID,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all corrections for an agent"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    query = db.query(Correction).filter(Correction.agent_id == agent_id)

    if not include_inactive:
        query = query.filter(Correction.is_active == True)

    corrections = query.order_by(Correction.created_at.desc()).all()

    return corrections


@router.get("/{correction_id}", response_model=CorrectionResponse)
async def get_correction(
    agent_id: UUID,
    correction_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific correction"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    correction = (
        db.query(Correction)
        .filter(Correction.id == correction_id, Correction.agent_id == agent_id)
        .first()
    )

    if not correction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Correction not found"
        )

    return correction


@router.patch("/{correction_id}/toggle", response_model=CorrectionResponse)
async def toggle_correction(
    agent_id: UUID,
    correction_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle correction active status"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    correction = (
        db.query(Correction)
        .filter(Correction.id == correction_id, Correction.agent_id == agent_id)
        .first()
    )

    if not correction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Correction not found"
        )

    correction.is_active = not correction.is_active
    db.commit()
    db.refresh(correction)

    return correction


@router.delete("/{correction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_correction(
    agent_id: UUID,
    correction_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a correction"""
    # Verify access
    verify_agent_access(agent_id, current_user.id, db)

    correction = (
        db.query(Correction)
        .filter(Correction.id == correction_id, Correction.agent_id == agent_id)
        .first()
    )

    if not correction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Correction not found"
        )

    db.delete(correction)
    db.commit()

    return None
