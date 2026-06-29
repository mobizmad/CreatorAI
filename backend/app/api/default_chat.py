from typing import AsyncGenerator, List, Literal, Optional
import asyncio
import json
import os
import re
import shutil
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.auth import get_current_user
from app.config import settings
from app.db.database import get_db
from app.models.models import User
from app.services.document_processor import DocumentProcessor
from app.services.llm_gateway import LLMGateway
from app.services.token_service import TokenManager
from sqlalchemy.orm import Session


router = APIRouter(prefix="/default-chat", tags=["Default Chat"])


class DefaultChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class DefaultChatRequest(BaseModel):
    message: str
    history: List[DefaultChatHistoryMessage] = []
    stream: bool = False
    provider: Literal["openai", "ollama"] = "openai"
    model: Optional[str] = None
    web_search: bool = False
    images: List[str] = []


class DefaultChatResponse(BaseModel):
    response: str


class DefaultChatAttachmentResponse(BaseModel):
    filename: str
    text: str
    chunk_count: int


DEFAULT_SYSTEM_PROMPT = """You are AgentBuilder's default AI assistant.
Answer naturally, briefly, and directly.
For greetings, reply with a simple friendly greeting and ask how you can help.
For simple arithmetic, answer only the calculation unless the user asks for explanation.
Do not apologize or say you made a mistake when the previous answer was already correct.
Ignore failed placeholder messages like "Something went wrong while answering."
If the user asks about creating or managing agents, explain how to use the Create Agent area without pretending to take actions outside this chat."""

DEFAULT_OLLAMA_MODEL = "llama3.2:3b"
DEFAULT_OLLAMA_VISION_MODEL = "llava:latest"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
MAX_ATTACHMENT_CONTEXT_CHARS = 12000
SUPPORTED_ATTACHMENT_TYPES = {"pdf", "docx", "xlsx", "xls", "txt", "text", "csv", "md", "png", "jpg", "jpeg", "webp"}


document_processor = DocumentProcessor()


def is_simple_prompt(message: str) -> bool:
    text = message.strip().lower()
    if re.fullmatch(r"(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|yes|no)[!.?\\s]*", text):
        return True
    if re.fullmatch(r"[\d\s+*/().=xX?-]+", text) and re.search(r"\d", text):
        return True
    return False


def should_use_search(payload: DefaultChatRequest) -> bool:
    if not payload.web_search or payload.images:
        return False
    if "--- ATTACHED FILE:" in payload.message:
        return False
    return not is_simple_prompt(payload.message)


@router.post("/attachments", response_model=DefaultChatAttachmentResponse)
async def extract_default_chat_attachment(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    filename = file.filename or "attachment"
    file_extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if file_extension not in SUPPORTED_ATTACHMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Please attach a PDF, Word, Excel, TXT, CSV, Markdown, PNG, JPG, or WEBP file.",
        )

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_filename = os.path.basename(filename)
    temp_path = os.path.join(settings.UPLOAD_DIR, f"default_chat_{current_user.id}_{uuid4()}_{safe_filename}")

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        chunks = await document_processor.process_document(temp_path, file_extension)
        text = document_processor.extract_text_from_chunks(chunks).strip()
        if not text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="I could not read text from this file.",
            )

        if len(text) > MAX_ATTACHMENT_CONTEXT_CHARS:
            text = text[:MAX_ATTACHMENT_CONTEXT_CHARS] + "\n\n[Attachment text was shortened because the file is large.]"

        return DefaultChatAttachmentResponse(
            filename=filename,
            text=text,
            chunk_count=len(chunks),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not process attachment: {str(exc)}",
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def build_messages(payload: DefaultChatRequest, search_context: Optional[str] = None) -> List[dict]:
    clean_history = [
        item for item in payload.history[-20:]
        if item.content.strip()
        and item.content.strip() != "Something went wrong while answering."
        and not item.content.startswith("🔍 Searching through web")
    ]
    history = clean_history[-8:] if not is_simple_prompt(payload.message) else []
    
    messages = [{"role": "system", "content": DEFAULT_SYSTEM_PROMPT}]
    if payload.images or "--- ATTACHED FILE:" in payload.message:
        messages.append({
            "role": "system",
            "content": "The user attached a file or image for this turn. Treat the attachment as the primary source. Do not blend details from older files, older chat messages, or web search unless the user explicitly asks to compare them.",
        })
    messages.extend({"role": item.role, "content": item.content} for item in history)
    
    user_content = payload.message
    if search_context:
        user_content += f"\n\n[System Note: A real-time web search was just performed for this query. Use the following search results to answer the user accurately. Do NOT say you don't have access to real-time data.]\n\n{search_context}"
        
    user_message = {"role": "user", "content": user_content}
    if payload.images:
        user_message["images"] = payload.images

    messages.append(user_message)
    return messages


async def stream_default_response(payload: DefaultChatRequest, user: User, db: Session, search_context: Optional[str] = None) -> AsyncGenerator[str, None]:
    
    # Show a user-friendly indicator only when web search is active
    if search_context:
        searching_msg = "🔍 Searching through web...\n\n"
        yield f"data: {json.dumps({'token': searching_msg})}\n\n"

    if search_context and search_context.startswith("SEARCH FAILED"):
        error_msg = "⚠️ **Web Search Failed**\nI tried to search the web, but the search engine (DuckDuckGo) blocked the request or failed to return any results. Please try again later."
        yield f"data: {json.dumps({'token': error_msg})}\n\n"
        yield "data: [DONE]\n\n"
        return

    gateway = LLMGateway(
        provider=payload.provider,
        model=payload.model or (DEFAULT_OLLAMA_VISION_MODEL if payload.images else DEFAULT_OLLAMA_MODEL if payload.provider == "ollama" else DEFAULT_OPENAI_MODEL),
        temperature=0.7,
    )

    try:
        full_response = ""
        async for token in gateway.generate_streaming(build_messages(payload, search_context)):
            full_response += token
            yield f"data: {json.dumps({'token': token})}\n\n"
            await asyncio.sleep(0)
        TokenManager.deduct_tokens(user, db, TokenManager.llm_cost(payload.provider, payload.message, full_response))
        yield "data: [DONE]\n\n"
    except Exception as exc:
        yield f"data: {json.dumps({'error': friendly_default_chat_error(exc)})}\n\n"
        yield "data: [DONE]\n\n"


def friendly_default_chat_error(exc: Exception) -> str:
    text = str(exc)
    if "404" in text and "Ollama" in text:
        return "This local model is not available in Ollama. Please choose another free model."
    if "Ollama" in text:
        return "Ollama could not answer right now. Please try again or choose another free model."
    return text


@router.post("", response_model=DefaultChatResponse)
async def default_chat(
    payload: DefaultChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    print("====== PAYLOAD RECEIVED ======")
    print(payload.model_dump())
    print("==============================")

    if not payload.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message is required",
        )

    TokenManager.check_balance(current_user, TokenManager.llm_cost(payload.provider, payload.message))

    search_context = None
    if should_use_search(payload):
        from app.tools.web_search import WebSearchTool
        tool = WebSearchTool(provider="duckduckgo")
        try:
            results = await tool.search(payload.message, max_results=3)
            search_context = tool.format_results_for_llm(results)
        except Exception as e:
            print(f"Web search failed: {e}")

    if payload.stream:
        return StreamingResponse(
            stream_default_response(payload, current_user, db, search_context),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    gateway = LLMGateway(
        provider=payload.provider,
        model=payload.model or (DEFAULT_OLLAMA_VISION_MODEL if payload.images else DEFAULT_OLLAMA_MODEL if payload.provider == "ollama" else DEFAULT_OPENAI_MODEL),
        temperature=0.7,
    )

    try:
        response = await gateway.generate(build_messages(payload, search_context))
        TokenManager.deduct_tokens(current_user, db, TokenManager.llm_cost(payload.provider, payload.message, response))
        return DefaultChatResponse(response=response)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing default chat: {str(exc)}",
        )
