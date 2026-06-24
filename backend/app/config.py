from pydantic_settings import BaseSettings
from typing import Optional, List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "AgentBuilder"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/agentbuilder"

    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # OpenAI (Required for embeddings and GPT models)
    OPENAI_API_KEY: Optional[str] = None
    FAL_KEY: Optional[str] = None
    LOCAL_IMAGE_MODEL_ID: str = "stabilityai/stable-diffusion-3.5-medium"
    LOCAL_IMAGE_SERVICE_URL: str = "http://localhost:8002"
    LOCAL_IMAGE_SERVICE_TIMEOUT: float = 600.0
    LOCAL_IMAGE_DEVICE: str = "auto"
    LOCAL_IMAGE_TORCH_DTYPE: str = "auto"

    # Ollama (Optional - for local LLM)
    OLLAMA_ENDPOINT: str = "http://localhost:11434"

    # File Upload
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    PUBLIC_API_BASE_URL: str = "http://localhost:8001"

    # CORS - stored as comma-separated string, parsed when used
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS string into a list"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
