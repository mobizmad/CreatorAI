from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from uuid import UUID


# User Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


# Agent Schemas
class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    llm_provider: str = "openai"
    llm_model: str = "gpt-4"
    ollama_endpoint: Optional[str] = None
    api_key: Optional[str] = None
    temperature: float = 0.7


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    ollama_endpoint: Optional[str] = None
    api_key: Optional[str] = None
    temperature: Optional[float] = None


class AgentResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str]
    system_prompt: Optional[str]
    llm_provider: str
    llm_model: str
    ollama_endpoint: Optional[str]
    temperature: float
    is_training: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Knowledge Base Schemas
class KnowledgeBaseResponse(BaseModel):
    id: UUID
    agent_id: UUID
    filename: str
    file_type: str
    chunk_count: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


# Correction Schemas
class CorrectionCreate(BaseModel):
    user_query: str
    incorrect_response: str
    corrected_response: str
    context: Optional[str] = None


class CorrectionResponse(BaseModel):
    id: UUID
    agent_id: UUID
    user_query: str
    incorrect_response: str
    corrected_response: str
    context: Optional[str]
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


class ChatMessage(BaseModel):
    message: str
    session_id: Optional[UUID] = None
    model_override: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    sources: Optional[List[dict]] = None
    session_id: Optional[str] = None
    model_override: Optional[str] = None
    message_id: Optional[UUID] = None


class ChatLogResponse(BaseModel):
    id: UUID
    agent_id: UUID
    session_id: Optional[UUID]       
    user_message: str
    agent_response: str
    sources: Optional[dict]
    rating: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True

class ChatRatingRequest(BaseModel):
    rating: int  

class APIKeyCreate(BaseModel):
    key_name: str
    expires_in_days: Optional[int] = None

class APIKeyResponse(BaseModel):
    id: UUID
    agent_id: UUID
    key_name: str
    key_prefix: str
    is_active: bool
    usage_count: int
    last_used_at: Optional[datetime]
    created_at: datetime
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True

class APIKeyCreatedResponse(BaseModel):
    id: UUID
    key_name: str
    api_key: str
    key_prefix: str
    created_at: datetime
    expires_at: Optional[datetime]
    message: str = "Save this API key now. You won't be able to see it again!"

class PublicChatRequest(BaseModel):
    message: str
    session_id: Optional[UUID] = None
    stream: bool = False

class PublicChatResponse(BaseModel):
    response: str
    sources: Optional[list] = None
    agent_name: str
    session_id: Optional[str] = None         
    usage_remaining: Optional[int] = None

class SessionCreate(BaseModel):
    title: Optional[str] = None


class SessionResponse(BaseModel):
    id: UUID
    agent_id: UUID
    title: Optional[str]
    created_at: datetime
    last_message_at: datetime
    message_count: int
    is_active: bool

    class Config:
        from_attributes = True

class AgentModelUpdate(BaseModel):
    llm_model: str

class AnalyticsOverview(BaseModel):
    total_messages: int
    total_sessions: int
    average_rating: float
    messages_today: int
    messages_week: int
    messages_month: int
    total_api_usage: int
    thumbs_up: int
    thumbs_down: int


class AnalyticsTimeSeries(BaseModel):
    date: str  # YYYY-MM-DD format
    count: int


class TopQuestion(BaseModel):
    question: str
    count: int
    avg_rating: Optional[float]


class APIKeyUsage(BaseModel):
    key_name: str
    key_prefix: str
    usage_count: int
    last_used_at: Optional[datetime]
    is_active: bool