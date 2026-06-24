from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta

from app.db.database import get_db
from app.models.models import User, Agent, ChatLog, ConversationSession, AgentAPIKey, KnowledgeBase, AgentTool
from app.schemas.schemas import (
    AnalyticsOverview,
    AnalyticsTimeSeries,
    TopQuestion,
    APIKeyUsage,
    AgentImprovementResponse,
    ImprovementSuggestion,
    ImprovementSourceMessage,
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


def message_source(log: ChatLog) -> ImprovementSourceMessage:
    return ImprovementSourceMessage(
        id=log.id,
        user_message=log.user_message,
        agent_response=log.agent_response,
        rating=log.rating or 0,
        created_at=log.created_at,
    )


def current_info_terms(text: str) -> bool:
    lowered = (text or "").lower()
    terms = [
        "latest",
        "current",
        "today",
        "now",
        "recent",
        "news",
        "weather",
        "price",
        "stock",
        "2024",
        "2025",
        "2026",
    ]
    return any(term in lowered for term in terms)


def add_suggestion(
    suggestions: List[ImprovementSuggestion],
    *,
    suggestion_id: str,
    category: str,
    priority: str,
    title: str,
    detail: str,
    action: str,
    evidence: str | None = None,
    source_messages: List[ImprovementSourceMessage] | None = None,
) -> None:
    suggestions.append(
        ImprovementSuggestion(
            id=suggestion_id,
            category=category,
            priority=priority,
            title=title,
            detail=detail,
            action=action,
            evidence=evidence,
            source_messages=source_messages or [],
        )
    )


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
    
    import os
    # 1. Calculate Vector Storage Size (Disk Space Monitor)
    vector_store_path = "./vector_stores"
    total_storage_bytes = 0
    if os.path.exists(vector_store_path):
        for dirpath, dirnames, filenames in os.walk(vector_store_path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                total_storage_bytes += os.path.getsize(fp)
    storage_mb = round(total_storage_bytes / (1024 * 1024), 2)

    # 2. Estimate OpenAI Costs (Cost Monitor)
    # Total chunks across the whole agent
    total_chunks = db.query(func.sum(KnowledgeBase.chunk_count)).filter(
        KnowledgeBase.agent_id == agent_id
    ).scalar() or 0
    # Approx $0.10 per 1 million tokens (text-embedding-3-small)
    # We assume average chunk is 1000 chars (~250 tokens)
    estimated_cost = round((total_chunks * 250 / 1000000) * 0.10, 4)

    return {
        "total_messages": total_messages,
        "total_sessions": total_sessions,
        "average_rating": round(avg_rating, 2),
        "messages_today": messages_today,
        "messages_week": messages_week,
        "messages_month": messages_month,
        "total_api_usage": total_api_usage,
        "thumbs_up": thumbs_up,
        "thumbs_down": thumbs_down,
        "storage_used_mb": storage_mb,
        "estimated_embedding_cost": estimated_cost,
        "total_chunks": total_chunks
    }


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


@router.get("/improvements", response_model=AgentImprovementResponse)
async def get_agent_improvements(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate practical improvement suggestions from agent usage data.

    The first version is intentionally read-only. It turns existing ratings,
    repeated questions, knowledge coverage, prompt settings, and tool state into
    concrete next actions for the agent owner.
    """
    agent = verify_agent_access(agent_id, current_user.id, db)
    suggestions: List[ImprovementSuggestion] = []

    total_messages = db.query(func.count(ChatLog.id)).filter(ChatLog.agent_id == agent_id).scalar() or 0
    thumbs_up = db.query(func.count(ChatLog.id)).filter(ChatLog.agent_id == agent_id, ChatLog.rating == 1).scalar() or 0
    thumbs_down = db.query(func.count(ChatLog.id)).filter(ChatLog.agent_id == agent_id, ChatLog.rating == -1).scalar() or 0
    rated_messages = thumbs_up + thumbs_down

    knowledge_files = db.query(func.count(KnowledgeBase.id)).filter(KnowledgeBase.agent_id == agent_id).scalar() or 0
    total_chunks = db.query(func.sum(KnowledgeBase.chunk_count)).filter(KnowledgeBase.agent_id == agent_id).scalar() or 0

    active_tools = {
        tool.tool_type
        for tool in db.query(AgentTool)
        .filter(
            AgentTool.agent_id == agent_id,
            AgentTool.is_active == True,
        )
        .all()
    }

    poor_logs = (
        db.query(ChatLog)
        .filter(ChatLog.agent_id == agent_id, ChatLog.rating == -1)
        .order_by(desc(ChatLog.created_at))
        .limit(3)
        .all()
    )

    top_questions = (
        db.query(
            ChatLog.user_message,
            func.count(ChatLog.id).label("count"),
            func.avg(ChatLog.rating).label("avg_rating"),
        )
        .filter(ChatLog.agent_id == agent_id)
        .group_by(ChatLog.user_message)
        .order_by(desc("count"))
        .limit(5)
        .all()
    )

    if total_messages == 0:
        add_suggestion(
            suggestions,
            suggestion_id="run-test-conversation",
            category="Testing",
            priority="high",
            title="Run a short test conversation",
            detail="This agent has no chat history yet, so there is not enough evidence to judge answer quality.",
            action="Ask five real customer-style questions in the playground, then rate the answers.",
            evidence="0 total messages",
        )

    if knowledge_files == 0 or total_chunks == 0:
        add_suggestion(
            suggestions,
            suggestion_id="add-knowledge",
            category="Knowledge",
            priority="high",
            title="Add knowledge files for grounded answers",
            detail="The agent has little or no indexed knowledge, so it may answer from the base model instead of your business material.",
            action="Upload product docs, FAQs, policies, or examples in the Knowledge Base tab.",
            evidence=f"{knowledge_files} files, {total_chunks} indexed chunks",
        )

    if poor_logs:
        add_suggestion(
            suggestions,
            suggestion_id="review-low-rated-answers",
            category="Corrections",
            priority="high",
            title="Turn low-rated answers into corrections",
            detail="Recent thumbs-down responses are strong candidates for few-shot corrections.",
            action="Open the Corrections tab and add the preferred answer for each weak response.",
            evidence=f"{thumbs_down} thumbs-down message{'s' if thumbs_down != 1 else ''}",
            source_messages=[message_source(log) for log in poor_logs],
        )

    if rated_messages >= 5:
        satisfaction = thumbs_up / rated_messages if rated_messages else 0
        if satisfaction < 0.7:
            add_suggestion(
                suggestions,
                suggestion_id="tighten-prompt",
                category="Prompt",
                priority="medium",
                title="Tighten the system prompt",
                detail="The satisfaction rate is below 70 percent, which usually means the agent needs clearer boundaries, tone, or answer format.",
                action="Add stricter instructions for scope, escalation, and answer structure in the System Prompt.",
                evidence=f"{round(satisfaction * 100)}% satisfaction from {rated_messages} rated messages",
            )

    repeated_question = next((row for row in top_questions if row.count >= 3), None)
    if repeated_question:
        add_suggestion(
            suggestions,
            suggestion_id="cover-repeated-question",
            category="Knowledge",
            priority="medium",
            title="Cover the most repeated question",
            detail="A repeated question is a good sign that users need a stable answer in the knowledge base or output template.",
            action="Add an FAQ entry or correction for this repeated question.",
            evidence=f"Asked {repeated_question.count} times: {repeated_question.user_message[:120]}",
        )

    current_question = next((row for row in top_questions if current_info_terms(row.user_message)), None)
    if current_question and "web_search" not in active_tools:
        add_suggestion(
            suggestions,
            suggestion_id="enable-web-search",
            category="Tools",
            priority="medium",
            title="Enable Web Search for current information",
            detail="Users are asking time-sensitive questions, but this agent does not have the Web Search tool enabled.",
            action="Enable Web Search in Agent Tools for latest news, prices, weather, and other current data.",
            evidence=current_question.user_message[:160],
        )

    if not (agent.output_template or "").strip():
        add_suggestion(
            suggestions,
            suggestion_id="add-output-template",
            category="Formatting",
            priority="low",
            title="Add an output template",
            detail="A reusable response format makes answers easier to scan and keeps API/widget responses consistent.",
            action="Add a short output template with sections like Summary, Answer, and Next Steps.",
        )

    if not agent.memory_enabled:
        add_suggestion(
            suggestions,
            suggestion_id="enable-memory",
            category="Memory",
            priority="low",
            title="Enable conversation memory",
            detail="Memory lets the agent keep context inside a session, which helps follow-up questions feel continuous.",
            action="Enable memory for agents that handle multi-turn support, coaching, or planning.",
        )

    priority_order = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda item: priority_order.get(item.priority, 3))

    score = 100
    if total_messages == 0:
        score -= 15
    if knowledge_files == 0 or total_chunks == 0:
        score -= 25
    if rated_messages:
        score -= min(35, round((thumbs_down / rated_messages) * 35))
    if not (agent.output_template or "").strip():
        score -= 5
    if not agent.memory_enabled:
        score -= 5
    score = max(0, min(100, score))

    if not suggestions:
        summary = "No urgent improvement items found. Keep collecting ratings so future suggestions stay evidence-based."
    else:
        high_count = sum(1 for suggestion in suggestions if suggestion.priority == "high")
        summary = f"{len(suggestions)} improvement item{'s' if len(suggestions) != 1 else ''} found"
        if high_count:
            summary += f", including {high_count} high-priority item{'s' if high_count != 1 else ''}"
        summary += "."

    return AgentImprovementResponse(
        score=score,
        summary=summary,
        suggestions=suggestions,
    )


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
