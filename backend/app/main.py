from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.widget import router as widget_router

from app.config import settings
from app.db.database import init_db
from app.api import auth, agents, knowledge, chat, corrections
from app.api import auth, agents, knowledge, chat, corrections, api_keys, public_api,templates, tools
from app.api.marketplace import router as marketplace_router
from app.api import analytics
from app.services.rate_limiter import init_rate_limiter

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    # Startup
    print("🚀 Starting AgentBuilder API...")
    init_db()
    print("✅ Database initialized")
    yield
    # Shutdown
    print("👋 Shutting down AgentBuilder API...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Build and train custom LLM agents with no code",
    lifespan=lifespan,
)

@app.on_event("startup")
async def startup_event():
    # Initialize rate limiter (without Redis for now)
    init_rate_limiter(redis_client=None)
    print("Rate limiter initialized (in-memory mode)")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(knowledge.router)
app.include_router(chat.router)
app.include_router(corrections.router)
app.include_router(api_keys.router) 
app.include_router(public_api.router) 
app.include_router(analytics.router)
app.include_router(templates.router)
app.include_router(tools.router)
app.include_router(widget_router)
app.include_router(marketplace_router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to AgentBuilder API",
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8001,
        reload=settings.DEBUG,
    )
