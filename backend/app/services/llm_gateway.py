from enum import Enum
from typing import Optional, List, Dict, AsyncGenerator
import json
import httpx
from openai import AsyncOpenAI
from app.config import settings


class LLMProvider(str, Enum):
    OPENAI = "openai"
    OLLAMA = "ollama"
    CUSTOM = "custom"


class LLMGateway:
    """
    Gateway service for interacting with different LLM providers
    Supports OpenAI, Ollama, and custom endpoints with streaming capabilities.
    """

    def __init__(
        self,
        provider: str,
        model: str,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        temperature: float = 0.7,
    ):
        self.provider = provider
        self.model = model
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.endpoint = endpoint or settings.OLLAMA_ENDPOINT
        self.temperature = temperature

    # ==========================================
    # NON-STREAMING METHODS (Original Code)
    # ==========================================

    async def generate(
        self, messages: List[Dict[str, str]], max_tokens: int = 2000
    ) -> str:
        """
        Generate a response from the LLM (Non-streaming)
        """
        if self.provider == LLMProvider.OPENAI:
            return await self._openai_generate(messages, max_tokens)
        elif self.provider == LLMProvider.OLLAMA:
            return await self._ollama_generate(messages)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    async def _openai_generate(
        self, messages: List[Dict[str, str]], max_tokens: int
    ) -> str:
        """Generate response using OpenAI API"""
        try:
            client = AsyncOpenAI(api_key=self.api_key)
            response = await client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content
        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

    async def _ollama_generate(self, messages: List[Dict[str, str]]) -> str:
        """Generate response using Ollama API"""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.endpoint}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": False,
                        "options": {"temperature": self.temperature},
                    },
                )
                response.raise_for_status()
                result = response.json()
                return result["message"]["content"]
        except httpx.HTTPError as e:
            raise Exception(f"Ollama API error: {str(e)}")
        except Exception as e:
            raise Exception(f"Ollama connection error: {str(e)}")

    # ==========================================
    # NEW STREAMING METHODS
    # ==========================================

    async def generate_streaming(
        self, messages: List[Dict[str, str]], max_tokens: int = 2000
    ) -> AsyncGenerator[str, None]:
        """
        Generate response with token-by-token streaming
        """
        if self.provider == LLMProvider.OPENAI:
            async for token in self._openai_stream(messages, max_tokens):
                yield token
        elif self.provider == LLMProvider.OLLAMA:
            async for token in self._ollama_stream(messages):
                yield token
        else:
            raise ValueError(f"Unsupported provider for streaming: {self.provider}")

    async def _openai_stream(
        self, messages: List[Dict[str, str]], max_tokens: int
    ) -> AsyncGenerator[str, None]:
        """Stream from OpenAI"""
        try:
            client = AsyncOpenAI(api_key=self.api_key)
            stream = await client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            raise Exception(f"OpenAI streaming error: {str(e)}")

    async def _ollama_stream(
        self, messages: List[Dict[str, str]]
    ) -> AsyncGenerator[str, None]:
        """Stream from Ollama"""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.endpoint}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": True,
                        "options": {"temperature": self.temperature},
                    }
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line:
                            data = json.loads(line)
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
        except Exception as e:
            raise Exception(f"Ollama streaming error: {str(e)}")

    # ==========================================
    # HELPERS
    # ==========================================

    @staticmethod
    def format_messages(
        system_prompt: str, user_message: str
    ) -> List[Dict[str, str]]:
        """Helper to format messages for LLM"""
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]