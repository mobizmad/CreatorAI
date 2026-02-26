from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from app.db.database import get_db
from app.models.models import Agent, User
from app.api.auth import get_current_user

router = APIRouter(prefix="/marketplace", tags=["Marketplace"])


# ─────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────

class MarketplaceAgentResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    llm_provider: str
    llm_model: str
    category: Optional[str]
    average_rating: float
    review_count: int
    created_at: datetime
    owner_email: str

    class Config:
        from_attributes = True


class ReviewCreate(BaseModel):
    rating: int  # 1–5
    comment: Optional[str] = None


class ReviewResponse(BaseModel):
    id: UUID
    agent_id: UUID
    reviewer_email: str
    rating: int
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class PublishRequest(BaseModel):
    category: Optional[str] = "General"


# ─────────────────────────────────────────
# Marketplace Endpoints
# ─────────────────────────────────────────

@router.get("", response_model=List[MarketplaceAgentResponse])
async def list_marketplace_agents(
    search: Optional[str] = None,
    category: Optional[str] = None,
    sort_by: str = "newest",
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List all public agents. No auth required."""
    from app.models.models import MarketplaceReview

    query = (
        db.query(Agent, User)
        .join(User, Agent.user_id == User.id)
        .filter(Agent.is_public == True)
    )

    if search:
        query = query.filter(
            Agent.name.ilike(f"%{search}%") |
            Agent.description.ilike(f"%{search}%")
        )

    if category and category != "All":
        query = query.filter(Agent.category == category)

    agents_with_users = query.all()

    results = []
    for agent, user in agents_with_users:
        reviews = db.query(MarketplaceReview).filter(
            MarketplaceReview.agent_id == agent.id
        ).all()

        avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else 0.0

        results.append(MarketplaceAgentResponse(
            id=agent.id,
            name=agent.name,
            description=agent.description,
            llm_provider=agent.llm_provider,
            llm_model=agent.llm_model,
            category=getattr(agent, 'category', 'General'),
            average_rating=avg_rating,
            review_count=len(reviews),
            created_at=agent.created_at,
            owner_email=user.email.split('@')[0] + "@···",
        ))

    if sort_by == "top_rated":
        results.sort(key=lambda x: x.average_rating, reverse=True)
    elif sort_by == "most_reviewed":
        results.sort(key=lambda x: x.review_count, reverse=True)
    else:
        results.sort(key=lambda x: x.created_at, reverse=True)

    return results[offset:offset + limit]


@router.get("/{agent_id}", response_model=MarketplaceAgentResponse)
async def get_marketplace_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
):
    from app.models.models import MarketplaceReview

    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.is_public == True).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found in marketplace")

    user = db.query(User).filter(User.id == agent.user_id).first()
    reviews = db.query(MarketplaceReview).filter(MarketplaceReview.agent_id == agent_id).all()
    avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else 0.0

    return MarketplaceAgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        llm_provider=agent.llm_provider,
        llm_model=agent.llm_model,
        category=getattr(agent, 'category', 'General'),
        average_rating=avg_rating,
        review_count=len(reviews),
        created_at=agent.created_at,
        owner_email=user.email.split('@')[0] + "@···" if user else "unknown@···",
    )


@router.get("/{agent_id}/reviews", response_model=List[ReviewResponse])
async def get_agent_reviews(
    agent_id: UUID,
    db: Session = Depends(get_db),
):
    from app.models.models import MarketplaceReview

    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.is_public == True).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    reviews = (
        db.query(MarketplaceReview)
        .filter(MarketplaceReview.agent_id == agent_id)
        .order_by(MarketplaceReview.created_at.desc())
        .all()
    )

    results = []
    for review in reviews:
        user = db.query(User).filter(User.id == review.user_id).first()
        results.append(ReviewResponse(
            id=review.id,
            agent_id=review.agent_id,
            reviewer_email=user.email.split('@')[0] + "@···" if user else "anon@···",
            rating=review.rating,
            comment=review.comment,
            created_at=review.created_at,
        ))
    return results


@router.post("/{agent_id}/reviews", response_model=ReviewResponse)
async def submit_review(
    agent_id: UUID,
    review_data: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.models import MarketplaceReview

    if not (1 <= review_data.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.is_public == True).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found in marketplace")

    if str(agent.user_id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="You cannot review your own agent")

    existing = db.query(MarketplaceReview).filter(
        MarketplaceReview.agent_id == agent_id,
        MarketplaceReview.user_id == current_user.id,
    ).first()

    if existing:
        existing.rating = review_data.rating
        existing.comment = review_data.comment
        db.commit()
        db.refresh(existing)
        review = existing
    else:
        review = MarketplaceReview(
            agent_id=agent_id,
            user_id=current_user.id,
            rating=review_data.rating,
            comment=review_data.comment,
        )
        db.add(review)
        db.commit()
        db.refresh(review)

    return ReviewResponse(
        id=review.id,
        agent_id=review.agent_id,
        reviewer_email=current_user.email.split('@')[0] + "@···",
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )


@router.patch("/{agent_id}/publish")
async def toggle_marketplace_listing(
    agent_id: UUID,
    publish_data: PublishRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.user_id == current_user.id
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.is_public = not agent.is_public
    if publish_data.category:
        agent.category = publish_data.category
    db.commit()

    return {
        "is_public": agent.is_public,
        "message": "Agent published to marketplace" if agent.is_public else "Agent removed from marketplace"
    }
