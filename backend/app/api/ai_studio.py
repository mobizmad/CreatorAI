import asyncio
import os
import shutil
import uuid
from typing import Any, Dict, List, Literal, Optional, Union

import httpx
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.config import settings
from app.db.database import SessionLocal, get_db
from app.models.models import AIStudioGeneration, AIStudioLike, User
from app.services.local_image_generation import LOCAL_IMAGE_MODEL_ID, is_local_image_model, run_local_sdxl
from app.services.token_service import TokenManager


router = APIRouter(prefix="/ai-studio", tags=["AI Studio"])

GenerationType = Literal["image", "video", "speech"]
AI_STUDIO_UPLOAD_DIR = os.path.join(settings.UPLOAD_DIR, "ai_studio")

LOCAL_IMAGE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]
LOCAL_IMAGE_RESOLUTIONS = ["512", "768", "1024", "1080"]
GPT_IMAGE_SIZES = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9", "auto"]
GPT_EDIT_IMAGE_SIZES = ["auto", "square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"]
GPT_QUALITIES = ["auto", "low", "medium", "high"]
NANO_IMAGE_ASPECT_RATIOS = ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16", "4:1", "1:4", "8:1", "1:8"]
NANO_IMAGE_RESOLUTIONS = ["0.5K", "1K", "2K", "4K"]
SEEDANCE_ASPECT_RATIOS = ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]
SEEDANCE_RESOLUTIONS = ["480p", "720p", "1080p"]
SEEDANCE_DURATIONS = ["auto", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]
KLING_V3_DURATIONS = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]
KLING_V26_DURATIONS = ["5", "10"]
OPTION_DEFAULT_KEYS = {
    "image_sizes": "image_size",
    "aspect_ratios": "aspect_ratio",
    "resolutions": "resolution",
    "qualities": "quality",
    "durations": "duration",
}


class StudioModel(BaseModel):
    id: str
    label: str
    type: GenerationType
    mode: Literal["text-to-image", "image-edit", "text-to-video", "image-to-video", "text-to-speech", "local-text-to-image"]
    requires_image: bool = False
    price_label: Optional[str] = None
    price_note: Optional[str] = None
    options: Dict[str, List[str]] = Field(default_factory=dict)
    defaults: Dict[str, str] = Field(default_factory=dict)
    image_input_field: Optional[str] = None
    supports_prompt_adherence: bool = False
    supports_generate_audio: bool = False


class StudioGenerateRequest(BaseModel):
    model_id: str
    prompt: str
    image_url: Optional[str] = None
    quality: Optional[str] = None
    aspect_ratio: Optional[str] = None
    image_size: Optional[str] = None
    resolution: Optional[str] = None
    duration: Optional[str] = None
    voice: Optional[str] = None
    seed: Optional[int] = None
    prompt_adherence: Optional[Literal["relaxed", "balanced", "strict"]] = None
    generate_audio: Optional[bool] = None


class StudioGenerateResponse(BaseModel):
    id: UUID
    model_id: str
    type: GenerationType
    request_id: Optional[str] = None
    result: Dict[str, Any]
    media: List[Dict[str, Any]]
    visibility: str
    created_at: datetime


GenerationJobStatus = Literal["queued", "running", "completed", "failed"]


class StudioGenerationJobResponse(BaseModel):
    job_id: UUID
    status: GenerationJobStatus
    message: str


class StudioGenerationResponse(BaseModel):
    id: UUID
    model_id: str
    type: GenerationType
    prompt: str
    quality: Optional[str]
    source_image_url: Optional[str]
    media: List[Dict[str, Any]]
    result: Dict[str, Any]
    request_id: Optional[str]
    visibility: str
    creator_email: str
    created_at: datetime
    published_at: Optional[datetime]
    like_count: int
    liked_by_me: bool


class StudioGenerationJobStatusResponse(BaseModel):
    job_id: UUID
    status: GenerationJobStatus
    generation: Optional[StudioGenerationResponse] = None
    error: Optional[str] = None


class VisibilityUpdate(BaseModel):
    visibility: Literal["private", "public"]


class StudioUploadResponse(BaseModel):
    url: str
    filename: str


STUDIO_MODELS: List[StudioModel] = [
    StudioModel(
        id=LOCAL_IMAGE_MODEL_ID,
        label="Local Stable Diffusion 3.5 Medium",
        type="image",
        mode="local-text-to-image",
        price_label="local, no fal cost",
        options={"aspect_ratios": LOCAL_IMAGE_ASPECT_RATIOS, "resolutions": LOCAL_IMAGE_RESOLUTIONS, "qualities": ["low", "medium", "high"]},
        defaults={"aspect_ratio": "1:1", "resolution": "768", "quality": "medium"},
        supports_prompt_adherence=True,
    ),
    StudioModel(
        id="openai/gpt-image-2",
        label="GPT Image 2",
        type="image",
        mode="text-to-image",
        price_label="from $0.005/image",
        price_note="Default high 1024x768 is about $0.145/image; varies by size and quality.",
        options={"image_sizes": GPT_IMAGE_SIZES, "qualities": GPT_QUALITIES},
        defaults={"image_size": "landscape_4_3", "quality": "high"},
    ),
    StudioModel(
        id="openai/gpt-image-2/edit",
        label="GPT Image 2 Edit",
        type="image",
        mode="image-edit",
        requires_image=True,
        image_input_field="image_urls",
        price_label="from $0.011/image",
        price_note="Includes one input image; varies by size and quality.",
        options={"image_sizes": GPT_EDIT_IMAGE_SIZES, "qualities": GPT_QUALITIES},
        defaults={"image_size": "auto", "quality": "high"},
    ),
    StudioModel(
        id="fal-ai/nano-banana-2/edit",
        label="Nano Banana 2 Edit",
        type="image",
        mode="image-edit",
        requires_image=True,
        image_input_field="image_urls",
        price_label="$0.08/image",
        options={"aspect_ratios": NANO_IMAGE_ASPECT_RATIOS, "resolutions": NANO_IMAGE_RESOLUTIONS},
        defaults={"aspect_ratio": "auto", "resolution": "1K"},
    ),
    StudioModel(
        id="bytedance/seedance-2.0/text-to-video",
        label="Seedance 2.0 Text to Video",
        type="video",
        mode="text-to-video",
        price_label="about $0.303/sec @720p",
        price_note="Token-based billing: $0.014 per 1K video tokens; cost varies by resolution and aspect ratio.",
        options={"aspect_ratios": SEEDANCE_ASPECT_RATIOS, "resolutions": SEEDANCE_RESOLUTIONS, "durations": SEEDANCE_DURATIONS},
        defaults={"aspect_ratio": "auto", "resolution": "720p", "duration": "auto"},
        supports_generate_audio=True,
    ),
    StudioModel(
        id="bytedance/seedance-2.0/image-to-video",
        label="Seedance 2.0 Image to Video",
        type="video",
        mode="image-to-video",
        requires_image=True,
        image_input_field="image_url",
        price_label="about $0.303/sec @720p",
        price_note="Token-based billing: $0.014 per 1K video tokens; audio does not change the price.",
        options={"aspect_ratios": SEEDANCE_ASPECT_RATIOS, "resolutions": SEEDANCE_RESOLUTIONS, "durations": SEEDANCE_DURATIONS},
        defaults={"aspect_ratio": "auto", "resolution": "720p", "duration": "auto"},
        supports_generate_audio=True,
    ),
    StudioModel(
        id="fal-ai/kling-video/v3/pro/image-to-video",
        label="Kling Video v3 Pro Image to Video",
        type="video",
        mode="image-to-video",
        requires_image=True,
        image_input_field="start_image_url",
        price_label="$0.168/sec with audio",
        price_note="Fal lists $0.112/sec with audio off, $0.168/sec with audio on, $0.196/sec with voice control.",
        options={"durations": KLING_V3_DURATIONS},
        defaults={"duration": "5"},
        supports_generate_audio=True,
    ),
    StudioModel(
        id="fal-ai/kling-video/v2.6/pro/image-to-video",
        label="Kling Video v2.6 Pro Image to Video",
        type="video",
        mode="image-to-video",
        requires_image=True,
        image_input_field="start_image_url",
        price_label="$0.14/sec with audio",
        price_note="Fal lists $0.07/sec with audio off and $0.14/sec with audio on.",
        options={"durations": KLING_V26_DURATIONS},
        defaults={"duration": "5"},
        supports_generate_audio=True,
    ),
    StudioModel(id="fal-ai/minimax/speech-2.8-hd", label="MiniMax Speech 2.8 HD", type="speech", mode="text-to-speech", price_label="$0.10/1K chars"),
    StudioModel(id="fal-ai/gemini-3.1-flash-tts", label="Gemini 3.1 Flash TTS", type="speech", mode="text-to-speech", price_label="$0.15/1K chars"),
    StudioModel(id="fal-ai/qwen-3-tts/text-to-speech/1.7b", label="Qwen 3 TTS 1.7B", type="speech", mode="text-to-speech", price_label="$0.09/1K chars"),
]


def get_model(model_id: str) -> StudioModel:
    for model in STUDIO_MODELS:
        if model.id == model_id:
            return model
    if is_local_image_model(model_id):
        return STUDIO_MODELS[0]
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported AI Studio model")


def model_option(model: StudioModel, key: str, value: Optional[str]) -> Optional[str]:
    options = model.options.get(key) or []
    if not options:
        return None

    default = model.defaults.get(OPTION_DEFAULT_KEYS.get(key, key)) or model.defaults.get(key)
    candidate = str(value) if value not in (None, "") else default
    if candidate in options:
        return candidate
    if default in options:
        return default
    return None


def add_model_option(data: Dict[str, Any], model: StudioModel, option_key: str, payload_value: Optional[str], fal_key: str) -> None:
    value = model_option(model, option_key, payload_value)
    if value is not None:
        data[fal_key] = value


def build_fal_input(model: StudioModel, payload: StudioGenerateRequest, user: User) -> Dict[str, Any]:
    prompt = payload.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prompt is required")

    if model.requires_image and not payload.image_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image URL is required for this model")

    data: Dict[str, Any] = {"prompt": prompt}

    if model.mode == "image-edit":
        field_name = model.image_input_field or "image_urls"
        data[field_name] = [payload.image_url] if field_name.endswith("s") else payload.image_url
    elif model.mode == "image-to-video":
        data[model.image_input_field or "image_url"] = payload.image_url

    if model.type == "image":
        add_model_option(data, model, "image_sizes", payload.image_size, "image_size")
        add_model_option(data, model, "aspect_ratios", payload.aspect_ratio, "aspect_ratio")
        add_model_option(data, model, "resolutions", payload.resolution, "resolution")
        add_model_option(data, model, "qualities", payload.quality, "quality")
        data["num_images"] = 1
        data["output_format"] = "png"

    if model.type == "video":
        add_model_option(data, model, "aspect_ratios", payload.aspect_ratio, "aspect_ratio")
        add_model_option(data, model, "resolutions", payload.resolution, "resolution")
        add_model_option(data, model, "durations", payload.duration, "duration")
        if model.supports_generate_audio:
            data["generate_audio"] = True if payload.generate_audio is None else payload.generate_audio
        data["end_user_id"] = str(user.id)

    if model.type == "speech":
        data = {"text": prompt}
        if payload.voice:
            data["voice"] = payload.voice

    if payload.seed is not None:
        data["seed"] = payload.seed

    return data


def collect_media(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    media: List[Dict[str, Any]] = []

    for image in result.get("images") or []:
        if isinstance(image, dict) and image.get("url"):
            media.append({"type": "image", **image})

    video = result.get("video")
    if isinstance(video, dict) and video.get("url"):
        media.append({"type": "video", **video})
    elif isinstance(video, str):
        media.append({"type": "video", "url": video})

    audio = result.get("audio")
    if isinstance(audio, dict) and audio.get("url"):
        media.append({"type": "audio", **audio})
    elif isinstance(audio, str):
        media.append({"type": "audio", "url": audio})

    audio_url = result.get("audio_url")
    if isinstance(audio_url, str):
        media.append({"type": "audio", "url": audio_url})

    url = result.get("url")
    if isinstance(url, str):
        media.append({"type": "file", "url": url})

    return media


def serialize_generation(item: AIStudioGeneration, current_user: User) -> StudioGenerationResponse:
    like_count = len(item.likes or [])
    liked_by_me = any(like.user_id == current_user.id for like in item.likes or [])
    return StudioGenerationResponse(
        id=item.id,
        model_id=item.model_id,
        type=item.generation_type,
        prompt=item.prompt,
        quality=item.quality,
        source_image_url=item.source_image_url,
        media=item.media or [],
        result=item.result or {},
        request_id=item.request_id,
        visibility=item.visibility,
        creator_email=item.creator.email if item.creator else "Unknown",
        created_at=item.created_at,
        published_at=item.published_at,
        like_count=like_count,
        liked_by_me=liked_by_me,
    )


def generation_status(item: AIStudioGeneration) -> GenerationJobStatus:
    result = item.result or {}
    status_value = result.get("status")
    if status_value in {"queued", "running", "completed", "failed"}:
        return status_value
    return "completed" if item.media else "queued"


def generation_error(item: AIStudioGeneration) -> Optional[str]:
    result = item.result or {}
    error = result.get("error")
    return str(error) if error else None


async def run_fal_queue(model_id: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    if not settings.FAL_KEY:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="FAL_KEY is not configured on the backend")

    headers = {
        "Authorization": f"Key {settings.FAL_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        submit = await client.post(f"https://queue.fal.run/{model_id}", headers=headers, json=arguments)
        if submit.status_code >= 400:
            raise HTTPException(status_code=submit.status_code, detail=submit.text)

        queue_data = submit.json()
        status_url = queue_data.get("status_url")
        response_url = queue_data.get("response_url")
        request_id = queue_data.get("request_id")

        if not status_url or not response_url:
            raise HTTPException(status_code=502, detail="Fal queue response did not include status or response URLs")

        for _ in range(180):
            status_response = await client.get(f"{status_url}?logs=1", headers=headers)
            if status_response.status_code >= 400:
                raise HTTPException(status_code=status_response.status_code, detail=status_response.text)

            status_data = status_response.json()
            if status_data.get("status") == "COMPLETED":
                if status_data.get("error"):
                    raise HTTPException(status_code=502, detail=status_data.get("error"))
                result_response = await client.get(response_url, headers=headers)
                if result_response.status_code >= 400:
                    raise HTTPException(status_code=result_response.status_code, detail=result_response.text)
                result = result_response.json()
                return {"request_id": request_id, "result": result}

            await asyncio.sleep(2)

    raise HTTPException(status_code=504, detail="Generation timed out while waiting for Fal")


async def execute_studio_generation_job(generation_id: UUID, user_id: UUID, payload_data: Dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        generation = (
            db.query(AIStudioGeneration)
            .filter(AIStudioGeneration.id == generation_id, AIStudioGeneration.user_id == user_id)
            .first()
        )
        user = db.query(User).filter(User.id == user_id).first()
        if not generation or not user:
            return

        payload = StudioGenerateRequest(**payload_data)
        model = get_model(payload.model_id)
        cost = TokenManager.media_cost("local_image" if is_local_image_model(model.id) else model.type)

        generation.result = {"status": "running"}
        db.commit()

        if is_local_image_model(model.id):
            provider_response = await run_local_sdxl(
                prompt=payload.prompt,
                quality=payload.quality,
                seed=payload.seed,
                aspect_ratio=payload.aspect_ratio,
                resolution=payload.resolution,
                prompt_adherence=payload.prompt_adherence,
            )
        else:
            arguments = build_fal_input(model, payload, user)
            provider_response = await run_fal_queue(model.id, arguments)

        result = provider_response["result"]
        media = collect_media(result)
        TokenManager.deduct_tokens(user, db, cost)

        generation.media = media
        generation.result = {**result, "status": "completed"}
        generation.request_id = provider_response.get("request_id")
        db.add(generation)
        db.commit()
    except Exception as exc:
        generation = db.query(AIStudioGeneration).filter(AIStudioGeneration.id == generation_id).first()
        if generation:
            detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
            generation.result = {"status": "failed", "error": detail}
            db.add(generation)
            db.commit()
    finally:
        db.close()


@router.get("/models", response_model=List[StudioModel])
async def list_studio_models(current_user: User = Depends(get_current_user)):
    return STUDIO_MODELS


@router.post("/upload-image", response_model=StudioUploadResponse)
async def upload_source_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    extension = os.path.splitext(file.filename or "")[1].lower()
    if extension not in [".jpg", ".jpeg", ".png", ".webp"]:
        extension = ".png"

    os.makedirs(AI_STUDIO_UPLOAD_DIR, exist_ok=True)
    filename = f"{current_user.id}_{uuid.uuid4().hex}{extension}"
    file_path = os.path.join(AI_STUDIO_UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(exc)}")

    return StudioUploadResponse(
        url=str(request.url_for("get_studio_upload", filename=filename)),
        filename=filename,
    )


@router.get("/uploads/{filename}", name="get_studio_upload")
async def get_studio_upload(filename: str):
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(AI_STUDIO_UPLOAD_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Upload not found")
    return FileResponse(file_path)


@router.post("/generate", response_model=Union[StudioGenerationResponse, StudioGenerationJobResponse])
async def generate_studio_media(
    request: Request,
    payload: StudioGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    model = get_model(payload.model_id)
    cost = TokenManager.media_cost("local_image" if is_local_image_model(model.id) else model.type)
    TokenManager.check_balance(current_user, cost)

    if is_local_image_model(model.id):
        generation = AIStudioGeneration(
            user_id=current_user.id,
            model_id=model.id,
            generation_type=model.type,
            prompt=payload.prompt.strip(),
            quality=payload.quality,
            source_image_url=payload.image_url,
            media=[],
            result={"status": "queued"},
            request_id=f"studio-job-{uuid.uuid4().hex}",
            visibility="private",
        )
        db.add(generation)
        db.commit()
        db.refresh(generation)
        background_tasks.add_task(execute_studio_generation_job, generation.id, current_user.id, payload.model_dump())
        return StudioGenerationJobResponse(
            job_id=generation.id,
            status="queued",
            message="Generation queued. Poll the job status endpoint for the result.",
        )

    arguments = build_fal_input(model, payload, current_user)
    fal_response = await run_fal_queue(model.id, arguments)
    result = fal_response["result"]
    media = collect_media(result)

    TokenManager.deduct_tokens(current_user, db, cost)

    generation = AIStudioGeneration(
        user_id=current_user.id,
        model_id=model.id,
        generation_type=model.type,
        prompt=payload.prompt.strip(),
        quality=payload.quality,
        source_image_url=payload.image_url,
        media=media,
        result=result,
        request_id=fal_response.get("request_id"),
        visibility="private",
    )
    db.add(generation)
    db.commit()
    db.refresh(generation)
    return serialize_generation(generation, current_user)


@router.get("/generate-jobs/{job_id}", response_model=StudioGenerationJobStatusResponse)
async def get_generation_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = (
        db.query(AIStudioGeneration)
        .filter(AIStudioGeneration.id == job_id, AIStudioGeneration.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Generation job not found")

    status_value = generation_status(item)
    generation = serialize_generation(item, current_user) if status_value == "completed" else None
    return StudioGenerationJobStatusResponse(
        job_id=item.id,
        status=status_value,
        generation=generation,
        error=generation_error(item),
    )


@router.get("/history", response_model=List[StudioGenerationResponse])
async def list_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(AIStudioGeneration)
        .filter(AIStudioGeneration.user_id == current_user.id)
        .order_by(AIStudioGeneration.created_at.desc())
        .all()
    )
    return [serialize_generation(item, current_user) for item in items]


@router.get("/templates", response_model=List[StudioGenerationResponse])
async def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(AIStudioGeneration)
        .filter(AIStudioGeneration.visibility == "public")
        .all()
    )
    serialized = [serialize_generation(item, current_user) for item in items]
    return sorted(serialized, key=lambda item: (item.like_count, item.published_at or item.created_at), reverse=True)


@router.patch("/generations/{generation_id}/visibility", response_model=StudioGenerationResponse)
async def update_visibility(
    generation_id: UUID,
    payload: VisibilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = (
        db.query(AIStudioGeneration)
        .filter(AIStudioGeneration.id == generation_id, AIStudioGeneration.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Generation not found")

    item.visibility = payload.visibility
    item.published_at = datetime.utcnow() if payload.visibility == "public" and not item.published_at else item.published_at
    db.commit()
    db.refresh(item)
    return serialize_generation(item, current_user)


@router.post("/generations/{generation_id}/like", response_model=StudioGenerationResponse)
async def like_generation(
    generation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = (
        db.query(AIStudioGeneration)
        .filter(AIStudioGeneration.id == generation_id, AIStudioGeneration.visibility == "public")
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Published generation not found")

    existing = (
        db.query(AIStudioLike)
        .filter(AIStudioLike.generation_id == generation_id, AIStudioLike.user_id == current_user.id)
        .first()
    )
    if existing:
        db.delete(existing)
    else:
        db.add(AIStudioLike(generation_id=generation_id, user_id=current_user.id))

    db.commit()
    db.refresh(item)
    return serialize_generation(item, current_user)
