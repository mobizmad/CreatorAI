from sqlalchemy import Column, String, Float, Integer, Boolean, Text, ForeignKey, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import secrets
from passlib.context import CryptContext

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    agents = relationship("Agent", back_populates="user", cascade="all, delete-orphan")


class Agent(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    system_prompt = Column(Text)
    llm_provider = Column(String, default="openai")  # 'openai', 'ollama', 'custom'
    llm_model = Column(String, default="gpt-4")
    ollama_endpoint = Column(String)
    api_key = Column(String)  # For custom API keys
    temperature = Column(Float, default=0.7)
    memory_enabled = Column(Boolean, default=True)   #  memory feature
    memory_window = Column(Integer, default=10)       #  how many past messages to remember
    output_template = Column(Text, nullable=True)     # Added for templates
    
    # ─────────────────────────────────────────
    # NEW: Tool & Multi-Agent Settings
    # ─────────────────────────────────────────
    web_search_enabled = Column(Boolean, default=False)
    search_provider = Column(String, default="duckduckgo")
    multi_agent_enabled = Column(Boolean, default=False)
    is_public = Column(Boolean, default=False)
    category = Column(String, default="General")
    tavily_api_key = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    is_training = Column(Boolean, default=False)

    user = relationship("User", back_populates="agents")
    knowledge_bases = relationship("KnowledgeBase", back_populates="agent", cascade="all, delete-orphan")
    corrections = relationship("Correction", back_populates="agent", cascade="all, delete-orphan")
    chat_logs = relationship("ChatLog", back_populates="agent", cascade="all, delete-orphan")
    sessions = relationship("ConversationSession", back_populates="agent", cascade="all, delete-orphan")
    tools = relationship("AgentTool", back_populates="agent", cascade="all, delete-orphan") # NEW


# ─────────────────────────────────────────
# NEW MODEL: Custom API Tools
# ─────────────────────────────────────────
class AgentTool(Base):
    """Custom API tools configured by users"""
    __tablename__ = "agent_tools"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"))
    
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    tool_type = Column(String, nullable=False)  # 'web_search', 'custom_api'
    
    # API configuration
    api_url = Column(String)
    method = Column(String, default="GET")
    headers = Column(JSON)
    auth_type = Column(String)
    auth_value = Column(String)  # The actual secret key
    request_body_template = Column(JSON)
    response_path = Column(String)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    agent = relationship("Agent", back_populates="tools")


class AgentTemplate(Base):
    """Pre-configured agent templates for quick setup"""
    __tablename__ = "agent_templates"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=False)  # 'support', 'hr', 'education', etc.
    icon = Column(String, default="🤖")
    system_prompt = Column(Text, nullable=False)
    output_template = Column(Text, nullable=True)
    temperature = Column(Float, default=0.7)
    llm_provider = Column(String, default="openai")
    llm_model = Column(String, default="gpt-4")
    sample_corrections = Column(JSON, default=list)  # Pre-loaded examples
    is_public = Column(Boolean, default=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    usage_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship (optional, if you want to track who created it)
    creator = relationship("User", foreign_keys=[created_by])

class KnowledgeFolder(Base):
    __tablename__ = "knowledge_folders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_folders.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    agent = relationship("Agent", backref="folders")
    subfolders = relationship("KnowledgeFolder", backref="parent", remote_side=[id])

class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_folders.id", ondelete="SET NULL"), nullable=True) # NEW
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    size = Column(Integer, nullable=False, default=0)
    chunk_count = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    agent = relationship("Agent", back_populates="knowledge_bases")
    folder = relationship("KnowledgeFolder", backref="files")


class Correction(Base):
    __tablename__ = "corrections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    user_query = Column(Text, nullable=False)
    incorrect_response = Column(Text, nullable=False)
    corrected_response = Column(Text, nullable=False)
    context = Column(Text)  # Optional RAG context
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    agent = relationship("Agent", back_populates="corrections")


class ConversationSession(Base):
    """Groups chat messages into sessions for memory"""
    __tablename__ = "conversation_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_message_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    message_count = Column(Integer, default=0)

    agent = relationship("Agent", back_populates="sessions")
    messages = relationship("ChatLog", back_populates="session", order_by="ChatLog.created_at")


class ChatLog(Base):
    __tablename__ = "chat_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("conversation_sessions.id"), nullable=True)  # NEW
    user_message = Column(Text, nullable=False)
    agent_response = Column(Text, nullable=False)
    sources = Column(JSON)  # Metadata about retrieved chunks
    created_at = Column(DateTime, default=datetime.utcnow)
    rating = Column(Integer, default=0)
    agent = relationship("Agent", back_populates="chat_logs")
    session = relationship("ConversationSession", back_populates="messages")  # NEW


class AgentAPIKey(Base):
    __tablename__ = "agent_api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    key_name = Column(String, nullable=False)
    key_hash = Column(String, nullable=False, unique=True)
    key_prefix = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    usage_count = Column(Integer, default=0)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    rate_limit_tier = Column(String, default="free")
    agent = relationship("Agent", backref="api_keys")

    @staticmethod
    def generate_key() -> str:
        """Generate a new API key"""
        return f"ab_{secrets.token_urlsafe(32)}"

    @staticmethod
    def hash_key(key: str) -> str:
        """Hash an API key for storage"""
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return pwd_context.hash(key)

    @staticmethod
    def verify_key(plain_key: str, hashed_key: str) -> bool:
        """Verify an API key against its hash"""
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return pwd_context.verify(plain_key, hashed_key)
    
class MarketplaceReview(Base):
    """User reviews for marketplace agents"""
    __tablename__ = "marketplace_reviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    agent = relationship("Agent", backref="marketplace_reviews")
    reviewer = relationship("User", backref="reviews_given")