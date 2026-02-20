"""
Rate Limiting Service for API Keys

Implements token bucket algorithm with Redis backend for distributed rate limiting.
Falls back to in-memory storage if Redis is unavailable.
"""

import time
from typing import Optional, Tuple
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Token bucket rate limiter with multiple tier support
    
    Tiers:
    - free: 100 requests/day, 10 requests/minute
    - basic: 1000 requests/day, 50 requests/minute
    - pro: 10000 requests/day, 200 requests/minute
    - unlimited: No limits
    """
    
    # Rate limit tiers (requests per day, requests per minute)
    TIERS = {
        'free': {'day': 100, 'minute': 10},
        'basic': {'day': 1000, 'minute': 50},
        'pro': {'day': 10000, 'minute': 200},
        'unlimited': {'day': float('inf'), 'minute': float('inf')},
    }
    
    def __init__(self, redis_client=None):
        """
        Initialize rate limiter
        
        Args:
            redis_client: Optional Redis client for distributed limiting
        """
        self.redis = redis_client
        self.memory_store = {}  # Fallback in-memory store
        
    def _get_key(self, api_key_id: str, window: str) -> str:
        """Generate Redis/memory key for rate limit bucket"""
        return f"ratelimit:{api_key_id}:{window}"
    
    def _get_bucket(self, key: str) -> Tuple[int, float]:
        """
        Get current token count and last refill time
        
        Returns:
            (token_count, last_refill_timestamp)
        """
        if self.redis:
            try:
                data = self.redis.hgetall(key)
                if not data:
                    return (0, 0.0)
                return (int(data.get(b'tokens', 0)), float(data.get(b'last_refill', 0.0)))
            except Exception as e:
                logger.warning(f"Redis error, falling back to memory: {e}")
        
        # Fallback to memory
        return self.memory_store.get(key, (0, 0.0))
    
    def _set_bucket(self, key: str, tokens: int, last_refill: float, ttl: int):
        """Save bucket state"""
        if self.redis:
            try:
                self.redis.hset(key, mapping={
                    'tokens': tokens,
                    'last_refill': last_refill
                })
                self.redis.expire(key, ttl)
                return
            except Exception as e:
                logger.warning(f"Redis error, using memory: {e}")
        
        # Fallback to memory
        self.memory_store[key] = (tokens, last_refill)
    
    def check_rate_limit(
        self, 
        api_key_id: str, 
        tier: str = 'free'
    ) -> Tuple[bool, Optional[int], Optional[str]]:
        """
        Check if request is allowed under rate limits
        
        Args:
            api_key_id: Unique identifier for the API key
            tier: Rate limit tier (free, basic, pro, unlimited)
        
        Returns:
            (allowed, remaining, reset_time)
            - allowed: True if request is allowed
            - remaining: Requests remaining (None if unlimited)
            - reset_time: When limit resets (ISO format, None if allowed)
        """
        if tier not in self.TIERS:
            tier = 'free'
        
        limits = self.TIERS[tier]
        now = time.time()
        
        # Check minute limit
        minute_key = self._get_key(api_key_id, 'minute')
        minute_tokens, minute_last = self._get_bucket(minute_key)
        
        # Refill minute bucket (1 token per 60/limit seconds)
        minute_limit = limits['minute']
        if minute_limit != float('inf'):
            refill_rate = 60.0 / minute_limit  # seconds per token
            elapsed = now - minute_last
            new_tokens = min(minute_limit, minute_tokens + int(elapsed / refill_rate))
            
            if new_tokens < 1:
                # Rate limited by minute
                reset_in = int(refill_rate - (elapsed % refill_rate)) + 1
                reset_time = (datetime.utcnow() + timedelta(seconds=reset_in)).isoformat()
                return (False, 0, reset_time)
            
            # Consume 1 token
            self._set_bucket(minute_key, new_tokens - 1, now, 120)
        
        # Check daily limit
        day_key = self._get_key(api_key_id, 'day')
        day_tokens, day_last = self._get_bucket(day_key)
        
        # Refill daily bucket (resets at midnight UTC)
        day_limit = limits['day']
        if day_limit != float('inf'):
            # Check if we've crossed midnight
            day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            last_refill = datetime.fromtimestamp(day_last)
            
            if last_refill.date() < day_start.date():
                # New day, refill to max
                day_tokens = day_limit
            
            if day_tokens < 1:
                # Rate limited by day
                tomorrow = day_start + timedelta(days=1)
                reset_time = tomorrow.isoformat()
                return (False, 0, reset_time)
            
            # Consume 1 token
            self._set_bucket(day_key, day_tokens - 1, now, 86400 * 2)
            remaining = day_tokens - 1
        else:
            remaining = None  # Unlimited
        
        return (True, remaining, None)
    
    def get_usage_stats(self, api_key_id: str, tier: str = 'free') -> dict:
        """
        Get current usage statistics for an API key
        
        Returns:
            {
                'minute_remaining': int,
                'minute_limit': int,
                'day_remaining': int,
                'day_limit': int,
                'tier': str
            }
        """
        if tier not in self.TIERS:
            tier = 'free'
        
        limits = self.TIERS[tier]
        now = time.time()
        
        # Get minute usage
        minute_key = self._get_key(api_key_id, 'minute')
        minute_tokens, _ = self._get_bucket(minute_key)
        
        # Get daily usage
        day_key = self._get_key(api_key_id, 'day')
        day_tokens, day_last = self._get_bucket(day_key)
        
        # Check if day needs reset
        day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        last_refill = datetime.fromtimestamp(day_last) if day_last else day_start
        
        if last_refill.date() < day_start.date():
            day_tokens = limits['day']
        
        return {
            'minute_remaining': int(minute_tokens),
            'minute_limit': int(limits['minute']) if limits['minute'] != float('inf') else None,
            'day_remaining': int(day_tokens),
            'day_limit': int(limits['day']) if limits['day'] != float('inf') else None,
            'tier': tier,
        }


# Global rate limiter instance (initialized in main.py)
rate_limiter: Optional[RateLimiter] = None


def init_rate_limiter(redis_client=None):
    """Initialize global rate limiter"""
    global rate_limiter
    rate_limiter = RateLimiter(redis_client)
    return rate_limiter


def get_rate_limiter() -> RateLimiter:
    """Get global rate limiter instance"""
    global rate_limiter
    if rate_limiter is None:
        rate_limiter = RateLimiter()
    return rate_limiter
