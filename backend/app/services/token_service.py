from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.models import User

class TokenManager:
    COSTS = {
        "free_llm_min": 2,
        "paid_llm_min": 10,
        "local_image": 0,
        "image": 500,
        "video": 2000,
        "speech": 200,
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
    def deduct_tokens(user: User, db: Session, cost: int):
        """
        Deduct tokens from the user and commit the transaction.
        Raises HTTP 402 if insufficient.
        """
        TokenManager.check_balance(user, cost)
        user.token_balance -= cost
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.token_balance
