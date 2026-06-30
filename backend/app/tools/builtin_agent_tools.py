import os
import re
import textwrap
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.api.ai_studio import STUDIO_MODELS, collect_media, get_model, run_fal_queue
from app.config import settings
from app.models.models import AIStudioGeneration, Agent, AgentTool
from app.services.local_image_generation import is_local_image_model, run_local_sdxl
from app.services.token_service import TokenManager


GENERATED_TOOL_DIR = os.path.join(settings.UPLOAD_DIR, "agent_tools")


BUILTIN_TOOL_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "ai_image_generation": {
        "name": "AI Image Generator",
        "description": "Generate images from natural language prompts using AI Studio.",
    },
    "pdf_generator": {
        "name": "PDF Generator",
        "description": "Create downloadable PDF files from text content.",
    },
    "web_search": {
        "name": "Web Search",
        "description": "Search the web for real-time information, news, and current events.",
    },
}


def _recent_image_suggestion_context(conversation_history: Optional[List[Dict]]) -> bool:
    if not conversation_history:
        return False

    recent_text = "\n".join(str(item.get("content", "")) for item in conversation_history[-6:]).lower()
    return any(
        phrase in recent_text
        for phrase in [
            "image prompt idea",
            "image prompt suggestion",
            "prompt ideas",
            "choose one",
            "generate any of these",
            "would like me to generate",
        ]
    )


def _looks_like_visual_prompt(text: str, conversation_history: Optional[List[Dict]]) -> bool:
    if text.endswith("?"):
        return False

    visual_terms = [
        "scene",
        "photo",
        "photography",
        "cinematic",
        "lighting",
        "sunlight",
        "background",
        "foreground",
        "composition",
        "portrait",
        "landscape",
        "illustration",
        "cartoon",
        "3d",
        "style",
        "colorful",
        "cozy",
        "rustic",
        "wooden",
        "vintage",
        "kitchen",
        "market",
        "stove",
        "shelves",
        "wall",
        "table",
        "shadows",
    ]
    term_count = sum(1 for term in visual_terms if term in text)
    if len(text) >= 70 and term_count >= 2:
        return True
    return _recent_image_suggestion_context(conversation_history) and term_count >= 1 and len(text) >= 12


def wants_image_generation(query: str, conversation_history: Optional[List[Dict]] = None) -> bool:
    text = query.lower()
    if any(phrase in text for phrase in ["don't generate", "do not generate", "without generating", "no image generation"]):
        return False
    if any(
        phrase in text
        for phrase in [
            "suggest",
            "suggestion",
            "recommend",
            "recommendation",
            "ideas",
            "idea",
            "brainstorm",
            "what should",
            "what can",
            "don't know",
            "do not know",
            "not sure",
            "help me choose",
        ]
    ):
        return False
    confirmation_patterns = [
        r"\b(generate|create|make|draw|render|produce)\s+(this one|that one|this|that|it|the prompt|this prompt|that prompt)\b",
        r"\b(use|do)\s+(this|that|it|this prompt|that prompt|the prompt)\b",
        r"\b(do|go)\s+with\s+(this|that|the)\s+prompt\b",
        r"\b(generate|create|make|draw|render|produce)\s+(the\s+)?(first|second|third|fourth|fifth)\s+(one|prompt|idea)\b",
    ]
    if any(re.search(pattern, text) for pattern in confirmation_patterns):
        return True

    image_words = r"(image|picture|photo|poster|banner|logo|illustration|artwork)"
    action_words = r"(create|generate|make|design|draw|render|produce)"
    direct_patterns = [
        rf"\b{action_words}\b[^.!?]{{0,60}}\b{image_words}\b",
        rf"\b{image_words}\b[^.!?]{{0,60}}\b{action_words}\b",
    ]
    return any(re.search(pattern, text) for pattern in direct_patterns) or _looks_like_visual_prompt(text, conversation_history)


def wants_pdf_generation(query: str) -> bool:
    text = query.lower()
    return "pdf" in text and any(word in text for word in ["create", "generate", "make", "export", "save"])


def wants_web_search(query: str) -> bool:
    text = query.lower()
    keywords = ["latest", "news", "current", "weather", "price", "today", "now", "recent", "who won", "update", "2024", "2025", "2026", "search", "find out"]
    return any(keyword in text for keyword in keywords)


def get_active_builtin_tool_types(db: Session, agent_id: str) -> List[str]:
    tools = (
        db.query(AgentTool)
        .filter(
            AgentTool.agent_id == agent_id,
            AgentTool.is_active == True,
            AgentTool.tool_type.in_(list(BUILTIN_TOOL_DEFINITIONS.keys())),
        )
        .all()
    )
    return [tool.tool_type for tool in tools]


def get_active_builtin_tools(db: Session, agent_id: str) -> List[AgentTool]:
    return (
        db.query(AgentTool)
        .filter(
            AgentTool.agent_id == agent_id,
            AgentTool.is_active == True,
            AgentTool.tool_type.in_(list(BUILTIN_TOOL_DEFINITIONS.keys())),
        )
        .all()
    )


def get_active_builtin_tool(db: Session, agent_id: str, tool_type: str) -> AgentTool | None:
    return (
        db.query(AgentTool)
        .filter(
            AgentTool.agent_id == agent_id,
            AgentTool.is_active == True,
            AgentTool.tool_type == tool_type,
        )
        .first()
    )


def image_generation_models() -> List[Dict[str, Any]]:
    return [
        model.model_dump()
        for model in STUDIO_MODELS
        if model.type == "image" and not model.requires_image
    ]


async def generate_agent_image(db: Session, agent: Agent, prompt: str) -> Dict[str, Any]:
    tool = get_active_builtin_tool(db, str(agent.id), "ai_image_generation")
    settings_data = tool.request_body_template if tool and isinstance(tool.request_body_template, dict) else {}
    model_id = settings_data.get("model_id") or "openai/gpt-image-2"
    model = get_model(model_id)
    if model.type != "image" or model.requires_image:
        raise ValueError("Selected agent image model must be a text-to-image model")

    cost = TokenManager.media_cost("local_image" if is_local_image_model(model_id) else "image")
    user = agent.user
    TokenManager.check_balance(user, cost)

    if is_local_image_model(model_id):
        fal_response = await run_local_sdxl(prompt=prompt, quality="medium")
    else:
        fal_response = await run_fal_queue(model_id, {"prompt": prompt, "quality": "medium", "num_images": 1})
    result = fal_response["result"]
    media = collect_media(result)
    image_media = [item for item in media if item.get("type") == "image" and item.get("url")]
    if len(image_media) > 1:
        media = image_media[:1] + [item for item in media if item.get("type") != "image"]

    generation = AIStudioGeneration(
        user_id=agent.user_id,
        model_id=model_id,
        generation_type="image",
        prompt=prompt.strip(),
        quality="medium",
        media=media,
        result=result,
        request_id=fal_response.get("request_id"),
        visibility="private",
    )
    db.add(generation)
    db.commit()
    db.refresh(generation)
    TokenManager.deduct_tokens(user, db, cost, action="Agent image tool", provider="fal/local", model=model_id)

    image_urls = [item["url"] for item in media if item.get("type") == "image" and item.get("url")]
    return {
        "generation_id": str(generation.id),
        "image_urls": image_urls,
        "media": media,
    }


def create_pdf(title: str, content: str) -> Dict[str, str]:
    os.makedirs(GENERATED_TOOL_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.pdf"
    file_path = os.path.join(GENERATED_TOOL_DIR, filename)
    pdf_bytes = _build_simple_pdf(title=title, content=content)

    with open(file_path, "wb") as file:
        file.write(pdf_bytes)

    return {
        "filename": filename,
        "url": f"/agent-tools/files/{filename}",
    }


def _build_simple_pdf(title: str, content: str) -> bytes:
    lines = _wrap_pdf_text(title.strip() or "Generated Document", 82)
    lines.append("")
    lines.extend(_wrap_pdf_text(content.strip() or "No content provided.", 92))

    y = 760
    commands = ["BT", "/F1 12 Tf", "72 760 Td", "16 TL"]
    first = True
    for line in lines[:46]:
        escaped = _escape_pdf_text(line)
        if first:
            commands.append(f"({escaped}) Tj")
            first = False
        else:
            commands.append(f"T* ({escaped}) Tj")
        y -= 16
        if y < 72:
            break
    commands.append("ET")
    stream = "\n".join(commands).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(pdf)


def _wrap_pdf_text(text: str, width: int) -> List[str]:
    normalized = re.sub(r"\s+", " ", text)
    return textwrap.wrap(normalized, width=width) or [""]


def _escape_pdf_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
