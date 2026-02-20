from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta

from app.db.database import get_db
from app.models.models import User, Agent, ChatLog, ConversationSession, AgentAPIKey
from app.schemas.schemas import (
    AnalyticsOverview,
    AnalyticsTimeSeries,
    TopQuestion,
    APIKeyUsage,
)
from app.api.auth import get_current_user

router = APIRouter(prefix="/agents/{agent_id}/analytics", tags=["Analytics"])


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


@router.get("/overview", response_model=AnalyticsOverview)
async def get_analytics_overview(
    agent_id: UUID,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get high-level analytics overview for an agent
    
    Returns:
    - Total messages
    - Total sessions
    - Average rating
    - API usage count
    - Messages today/week/month
    """
    verify_agent_access(agent_id, current_user.id, db)
    
    now = datetime.utcnow()
    start_date = now - timedelta(days=days)
    
    # Total messages
    total_messages = db.query(func.count(ChatLog.id)).filter(
        ChatLog.agent_id == agent_id
    ).scalar() or 0
    
    # Total sessions
    total_sessions = db.query(func.count(ConversationSession.id)).filter(
        ConversationSession.agent_id == agent_id
    ).scalar() or 0
    
    # Average rating (thumbs up = 1, thumbs down = -1)
    avg_rating_result = db.query(func.avg(ChatLog.rating)).filter(
        ChatLog.agent_id == agent_id,
        ChatLog.rating.isnot(None)
    ).scalar()
    avg_rating = float(avg_rating_result) if avg_rating_result else 0.0
    
    # Messages in time periods
    messages_today = db.query(func.count(ChatLog.id)).filter(
        ChatLog.agent_id == agent_id,
        ChatLog.created_at >= now - timedelta(days=1)
    ).scalar() or 0
    
    messages_week = db.query(func.count(ChatLog.id)).filter(
        ChatLog.agent_id == agent_id,
        ChatLog.created_at >= now - timedelta(days=7)
    ).scalar() or 0
    
    messages_month = db.query(func.count(ChatLog.id)).filter(
        ChatLog.agent_id == agent_id,
        ChatLog.created_at >= now - timedelta(days=30)
    ).scalar() or 0
    
    # Total API usage across all keys
    total_api_usage = db.query(func.sum(AgentAPIKey.usage_count)).filter(
        AgentAPIKey.agent_id == agent_id
    ).scalar() or 0
    
    # Rating breakdown
    thumbs_up = db.query(func.count(ChatLog.id)).filter(
        ChatLog.agent_id == agent_id,
        ChatLog.rating == 1
    ).scalar() or 0
    
    thumbs_down = db.query(func.count(ChatLog.id)).filter(
        ChatLog.agent_id == agent_id,
        ChatLog.rating == -1
    ).scalar() or 0
    
    return AnalyticsOverview(
        total_messages=total_messages,
        total_sessions=total_sessions,
        average_rating=round(avg_rating, 2),
        messages_today=messages_today,
        messages_week=messages_week,
        messages_month=messages_month,
        total_api_usage=total_api_usage,
        thumbs_up=thumbs_up,
        thumbs_down=thumbs_down,
    )


@router.get("/timeseries", response_model=List[AnalyticsTimeSeries])
async def get_analytics_timeseries(
    agent_id: UUID,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get daily message counts for charting
    
    Returns array of {date, count} for the last N days
    """
    verify_agent_access(agent_id, current_user.id, db)
    
    now = datetime.utcnow()
    start_date = now - timedelta(days=days)
    
    # Query messages grouped by date
    results = (
        db.query(
            func.date(ChatLog.created_at).label('date'),
            func.count(ChatLog.id).label('count')
        )
        .filter(
            ChatLog.agent_id == agent_id,
            ChatLog.created_at >= start_date
        )
        .group_by(func.date(ChatLog.created_at))
        .order_by(desc('date'))
        .all()
    )
    
    return [
        AnalyticsTimeSeries(date=str(row.date), count=row.count)
        for row in results
    ]


@router.get("/top-questions", response_model=List[TopQuestion])
async def get_top_questions(
    agent_id: UUID,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get most frequently asked questions
    
    Groups similar user messages and shows top N by count
    """
    verify_agent_access(agent_id, current_user.id, db)
    
    # Get most common questions (exact match grouping)
    results = (
        db.query(
            ChatLog.user_message,
            func.count(ChatLog.id).label('count'),
            func.avg(ChatLog.rating).label('avg_rating')
        )
        .filter(ChatLog.agent_id == agent_id)
        .group_by(ChatLog.user_message)
        .order_by(desc('count'))
        .limit(limit)
        .all()
    )
    
    return [
        TopQuestion(
            question=row.user_message,
            count=row.count,
            avg_rating=float(row.avg_rating) if row.avg_rating else None
        )
        for row in results
    ]


@router.get("/api-usage", response_model=List[APIKeyUsage])
async def get_api_key_usage(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get usage breakdown by API key
    
    Shows which API keys are being used most
    """
    verify_agent_access(agent_id, current_user.id, db)
    
    keys = (
        db.query(AgentAPIKey)
        .filter(AgentAPIKey.agent_id == agent_id)
        .order_by(desc(AgentAPIKey.usage_count))
        .all()
    )
    
    return [
        APIKeyUsage(
            key_name=key.key_name,
            key_prefix=key.key_prefix,
            usage_count=key.usage_count,
            last_used_at=key.last_used_at,
            is_active=key.is_active,
        )
        for key in keys
    ]


@router.get("/poor-responses", response_model=List[dict])
async def get_poor_responses(
    agent_id: UUID,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get responses with thumbs down (candidates for correction)
    
    Returns messages that received negative ratings
    """
    verify_agent_access(agent_id, current_user.id, db)
    
    poor_responses = (
        db.query(ChatLog)
        .filter(
            ChatLog.agent_id == agent_id,
            ChatLog.rating == -1
        )
        .order_by(desc(ChatLog.created_at))
        .limit(limit)
        .all()
    )
    
    return [
        {
            "id": str(log.id),
            "user_message": log.user_message,
            "agent_response": log.agent_response,
            "created_at": log.created_at.isoformat(),
            "sources": log.sources,
        }
        for log in poor_responses
    ]
