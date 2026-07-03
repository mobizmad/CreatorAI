from datetime import datetime
from typing import Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.config import settings
from app.db.database import get_db
from app.models.models import CreditUsage, User
from app.services.token_service import TokenManager


router = APIRouter(prefix="/billing", tags=["Billing"])

PLAN_CATALOG: Dict[str, Dict[str, int | str]] = {
    "pro": {"label": "Pro", "amount_cents": 1200, "credits": 1000000, "agents": 5},
    "business": {"label": "Business", "amount_cents": 3900, "credits": 5000000, "agents": 20},
    "agency": {"label": "Agency", "amount_cents": 7900, "credits": 15000000, "agents": 100},
}


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


class CheckoutSessionRequest(BaseModel):
    plan_name: str
    success_url: str
    cancel_url: str


class CheckoutSessionResponse(BaseModel):
    url: str
    session_id: str


class CheckoutConfirmResponse(BaseModel):
    status: str
    plan_name: str
    credits_added: int
    credit_balance: int


def normalize_plan(plan_name: str) -> str:
    key = plan_name.strip().lower()
    if key in {"premium", "go premium"}:
        return "pro"
    if key not in PLAN_CATALOG:
        raise HTTPException(status_code=400, detail="Unsupported plan")
    return key


def require_stripe_key() -> str:
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe test key is not configured. Add STRIPE_SECRET_KEY=sk_test_... to .env and restart the backend.",
        )
    return settings.STRIPE_SECRET_KEY


async def stripe_request(method: str, path: str, data: Optional[dict] = None) -> dict:
    secret_key = require_stripe_key()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method,
            f"https://api.stripe.com/v1{path}",
            auth=(secret_key, ""),
            data=data,
        )
    if response.status_code >= 400:
        try:
            detail = response.json().get("error", {}).get("message") or response.text
        except Exception:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)
    return response.json()


@router.get("/summary", response_model=BillingSummaryResponse)
async def billing_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    limits = TokenManager.get_plan(current_user)
    usages = db.query(CreditUsage).filter(CreditUsage.user_id == current_user.id).all()
    used_credits = sum(item.amount for item in usages if item.amount > 0)
    return BillingSummaryResponse(
        plan_name=current_user.plan_name or "free",
        subscription_status=current_user.subscription_status or "free",
        credit_balance=current_user.token_balance,
        monthly_credit_limit=current_user.monthly_credit_limit or limits["credits"],
        plan_expires_at=current_user.plan_expires_at,
        limits=PlanLimitsResponse(**limits),
        used_last_30_days=used_credits,
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


@router.post("/checkout/session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    payload: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
):
    plan_key = normalize_plan(payload.plan_name)
    plan = PLAN_CATALOG[plan_key]
    credits = int(plan["credits"])
    amount_cents = int(plan["amount_cents"])
    label = str(plan["label"])

    session = await stripe_request(
        "POST",
        "/checkout/sessions",
        {
            "mode": "payment",
            "client_reference_id": str(current_user.id),
            "customer_email": current_user.email,
            "success_url": payload.success_url,
            "cancel_url": payload.cancel_url,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": settings.STRIPE_CURRENCY,
            "line_items[0][price_data][unit_amount]": str(amount_cents),
            "line_items[0][price_data][product_data][name]": f"CreatorAI {label} credit package",
            "line_items[0][price_data][product_data][description]": f"{credits:,} AI credits",
            "metadata[user_id]": str(current_user.id),
            "metadata[plan_name]": plan_key,
            "metadata[credits]": str(credits),
        },
    )
    return CheckoutSessionResponse(url=session["url"], session_id=session["id"])


@router.post("/checkout/confirm", response_model=CheckoutConfirmResponse)
async def confirm_checkout_session(
    session_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await stripe_request("GET", f"/checkout/sessions/{session_id}")
    if session.get("client_reference_id") != str(current_user.id):
        raise HTTPException(status_code=403, detail="This Stripe session does not belong to the current user")
    if session.get("payment_status") != "paid":
        raise HTTPException(status_code=402, detail="Stripe payment is not completed yet")

    existing = (
        db.query(CreditUsage)
        .filter(CreditUsage.user_id == current_user.id, CreditUsage.note == f"stripe_session:{session_id}")
        .first()
    )
    if existing:
        return CheckoutConfirmResponse(
            status="already_confirmed",
            plan_name=current_user.plan_name or "free",
            credits_added=0,
            credit_balance=current_user.token_balance,
        )

    metadata = session.get("metadata") or {}
    plan_key = normalize_plan(metadata.get("plan_name") or "pro")
    plan = PLAN_CATALOG[plan_key]
    credits = int(metadata.get("credits") or plan["credits"])

    current_user.token_balance += credits
    current_user.plan_name = plan_key
    current_user.monthly_credit_limit = int(plan["credits"])
    current_user.subscription_status = "active"
    if session.get("customer"):
        current_user.stripe_customer_id = session["customer"]

    db.add(
        CreditUsage(
            user_id=current_user.id,
            amount=-credits,
            action="Stripe credit package",
            provider="stripe",
            model=plan_key,
            note=f"stripe_session:{session_id}",
        )
    )
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return CheckoutConfirmResponse(
        status="confirmed",
        plan_name=plan_key,
        credits_added=credits,
        credit_balance=current_user.token_balance,
    )
