from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any  # NEW: Added Dict and Any for Tools
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
    output_template: Optional[str] = None  # Added for templates
    llm_provider: str = "openai"
    llm_model: str = "gpt-4"
    ollama_endpoint: Optional[str] = None
    api_key: Optional[str] = None
    temperature: float = 0.7


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    output_template: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    ollama_endpoint: Optional[str] = None
    api_key: Optional[str] = None
    temperature: Optional[float] = None
    is_public: Optional[bool] = None
    
    # ─────────────────────────────────────────
    # NEW: Tool & Multi-Agent Settings
    # ─────────────────────────────────────────
    web_search_enabled: Optional[bool] = None
    search_provider: Optional[str] = None
    multi_agent_enabled: Optional[bool] = None
    tavily_api_key: Optional[str] = None


class AgentResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str]
    system_prompt: Optional[str]
    output_template: Optional[str]
    llm_provider: str
    llm_model: str
    ollama_endpoint: Optional[str]
    temperature: float
    is_training: bool
    created_at: datetime
    is_public: bool
    
    # ─────────────────────────────────────────
    # NEW: Tool & Multi-Agent Settings
    # ─────────────────────────────────────────
    web_search_enabled: bool
    search_provider: str
    multi_agent_enabled: bool
    tavily_api_key: Optional[str]

    class Config:
        from_attributes = True

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[UUID] = None

class FolderUpdate(BaseModel):
    name: str

class FolderResponse(BaseModel):
    id: UUID
    name: str
    parent_id: Optional[UUID]
    created_at: datetime

    class Config:
        from_attributes = True

class FileMoveRequest(BaseModel):
    folder_id: Optional[UUID] = None

# Knowledge Base Schemas
class KnowledgeBaseResponse(BaseModel):
    id: UUID
    agent_id: UUID
    folder_id: Optional[UUID] = None  # NEW
    filename: str
    file_type: str
    chunk_count: int
    uploaded_at: datetime

    class Config:
        from_attributes = True

# Add a schema for the combined GET response
class KnowledgeCombinedResponse(BaseModel):
    files: List[KnowledgeBaseResponse]
    folders: List[FolderResponse]


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
    stream: bool = False

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

# Bulk Upload Schemas
class FileUploadStatus(BaseModel):
    """Status of a single file in bulk upload"""
    filename: str
    success: bool
    error: Optional[str] = None
    chunk_count: int
    knowledge_id: Optional[str] = None


class BulkUploadResponse(BaseModel):
    """Response for bulk file upload"""
    total: int
    successful: int
    failed: int
    files: List[FileUploadStatus]


# Template Schemas
class TemplateResponse(BaseModel):
    """Template displayed in gallery"""
    id: UUID
    name: str
    description: str
    category: str
    icon: str
    system_prompt: str
    output_template: Optional[str]
    temperature: float
    llm_provider: str
    llm_model: str
    usage_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class TemplateCreate(BaseModel):
    """Create a new template (admin only)"""
    name: str
    description: str
    category: str
    icon: str = "🤖"
    system_prompt: str
    output_template: Optional[str] = None
    temperature: float = 0.7
    llm_provider: str = "openai"
    llm_model: str = "gpt-4"
    sample_corrections: Optional[List[dict]] = []


class AgentFromTemplateRequest(BaseModel):
    """Create agent from template with customization"""
    template_id: UUID
    name: str  
    description: Optional[str] = None  
    system_prompt: Optional[str] = None  
    output_template: Optional[str] = None  
    llm_provider: Optional[str] = None  
    llm_model: Optional[str] = None  



class ToolCreate(BaseModel):
    name: str
    description: str
    tool_type: str  # 'web_search' or 'custom_api'
    api_url: Optional[str] = None
    method: str = "GET"
    headers: Optional[Dict] = {}
    auth_type: Optional[str] = None
    auth_value: Optional[str] = None
    request_body_template: Optional[Dict] = None
    response_path: Optional[str] = None


class ToolResponse(BaseModel):
    id: UUID
    agent_id: UUID
    name: str
    description: str
    tool_type: str
    api_url: Optional[str]
    method: Optional[str]
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class ToolTest(BaseModel):
    """Test a tool before saving"""
    parameters: Dict[str, Any]