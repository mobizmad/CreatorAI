from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.database import get_db
from app.models.models import CreditUsage, User
from app.services.token_service import TokenManager


router = APIRouter(prefix="/billing", tags=["Billing"])


class PlanLimitsResponse(BaseModel):
    credits: int
    agents: int
    channel_replies: int
    paid_models: bool


class BillingSummaryResponse(BaseModel):
    plan_name: str
    subscription_status: str
    credit_balance: int
    monthly_credit_limit: int
    plan_expires_at: Optional[datetime]
    limits: PlanLimitsResponse
    used_last_30_days: int


class CreditUsageResponse(BaseModel):
    id: str
    amount: int
    action: str
    provider: Optional[str] = None
    model: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime


@router.get("/summary", response_model=BillingSummaryResponse)
async def billing_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    limits = TokenManager.get_plan(current_user)
    usages = db.query(CreditUsage).filter(CreditUsage.user_id == current_user.id).all()
    return BillingSummaryResponse(
        plan_name=current_user.plan_name or "free",
        subscription_status=current_user.subscription_status or "free",
        credit_balance=current_user.token_balance,
        monthly_credit_limit=current_user.monthly_credit_limit or limits["credits"],
        plan_expires_at=current_user.plan_expires_at,
        limits=PlanLimitsResponse(**limits),
        used_last_30_days=sum(item.amount for item in usages),
    )


@router.get("/usage", response_model=List[CreditUsageResponse])
async def credit_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(CreditUsage)
        .filter(CreditUsage.user_id == current_user.id)
        .order_by(CreditUsage.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        CreditUsageResponse(
            id=str(item.id),
            amount=item.amount,
            action=item.action,
            provider=item.provider,
            model=item.model,
            note=item.note,
            created_at=item.created_at,
        )
        for item in items
    ]
