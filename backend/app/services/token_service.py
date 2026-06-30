from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.models import CreditUsage, User

class TokenManager:
    COSTS = {
        "free_llm_min": 2,
        "paid_llm_min": 10,
        "local_image": 0,
        "image": 500,
        "video": 2000,
        "speech": 200,
    }
    PLAN_LIMITS = {
        "free": {
            "credits": 100000,
            "agents": 1,
            "channel_replies": 100,
            "paid_models": False,
        },
        "pro": {
            "credits": 1000000,
            "agents": 5,
            "channel_replies": 2000,
            "paid_models": True,
        },
        "business": {
            "credits": 5000000,
            "agents": 20,
            "channel_replies": 10000,
            "paid_models": True,
        },
        "agency": {
            "credits": 15000000,
            "agents": 100,
            "channel_replies": 50000,
            "paid_models": True,
        },
    }

    @staticmethod
    def estimate_text_tokens(*parts: str) -> int:
        """
        Approximate LLM tokens from text length. This keeps billing predictable
        without depending on provider-specific usage metadata.
        """
        text = " ".join(part or "" for part in parts)
        return max(1, len(text) // 4)

    @staticmethod
    def llm_cost(provider: str, *parts: str) -> int:
        estimated_tokens = TokenManager.estimate_text_tokens(*parts)
        if provider == "ollama":
            return max(TokenManager.COSTS["free_llm_min"], estimated_tokens // 100)
        return max(TokenManager.COSTS["paid_llm_min"], estimated_tokens // 10)

    @staticmethod
    def media_cost(media_type: str) -> int:
        return TokenManager.COSTS.get(media_type, TokenManager.COSTS["image"])

    @staticmethod
    def check_balance(user: User, cost: int):
        """
        Check if the user has enough tokens. Raises HTTP 402 if not.
        """
        if user.token_balance < cost:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Insufficient tokens. Required: {cost}, Available: {user.token_balance}"
            )

    @staticmethod
    def get_plan(user: User) -> dict:
        return TokenManager.PLAN_LIMITS.get((user.plan_name or "free").lower(), TokenManager.PLAN_LIMITS["free"])

    @staticmethod
    def check_paid_model_access(user: User, provider: str):
        if provider != "openai":
            return
        if TokenManager.get_plan(user)["paid_models"]:
            return
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="GPT-4o-mini is available on Pro, Business, and Agency plans. Upgrade to use paid models.",
        )

    @staticmethod
    def check_agent_limit(user: User, current_agent_count: int):
        max_agents = TokenManager.get_plan(user)["agents"]
        if current_agent_count < max_agents:
            return
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Your {user.plan_name or 'free'} plan allows {max_agents} agent(s). Upgrade to create more agents.",
        )

    @staticmethod
    def record_usage(
        user: User,
        db: Session,
        cost: int,
        action: str,
        provider: str | None = None,
        model: str | None = None,
        note: str | None = None,
    ):
        db.add(
            CreditUsage(
                user_id=user.id,
                amount=cost,
                action=action,
                provider=provider,
                model=model,
                note=note,
            )
        )

    @staticmethod
    def deduct_tokens(
        user: User,
        db: Session,
        cost: int,
        action: str = "AI usage",
        provider: str | None = None,
        model: str | None = None,
        note: str | None = None,
    ):
        """
        Deduct tokens from the user and commit the transaction.
        Raises HTTP 402 if insufficient.
        """
        TokenManager.check_balance(user, cost)
        user.token_balance -= cost
        TokenManager.record_usage(user, db, cost, action, provider, model, note)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.token_balance
