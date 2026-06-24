from sqlalchemy import create_engine
from sqlalchemy import inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
    ensure_schema_updates()


def ensure_schema_updates():
    """Apply small additive schema updates for existing local deployments."""
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    with engine.begin() as conn:
        if "users" in table_names:
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            if "token_balance" not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN token_balance INTEGER NOT NULL DEFAULT 100000"))

        if "ai_studio_generations" in table_names:
            studio_columns = {column["name"] for column in inspector.get_columns("ai_studio_generations")}
            if "quality" not in studio_columns:
                conn.execute(text("ALTER TABLE ai_studio_generations ADD COLUMN quality VARCHAR"))
            if "source_image_url" not in studio_columns:
                conn.execute(text("ALTER TABLE ai_studio_generations ADD COLUMN source_image_url TEXT"))
