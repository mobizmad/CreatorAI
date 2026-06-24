import os
import shutil
import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi import Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.ai_studio import (
    StudioGenerateRequest,
    build_fal_input,
    collect_media,
    get_model,
    run_fal_queue,
)
from app.api.auth import get_current_user
from app.config import settings
from app.db.database import get_db
from app.models.models import AIStudioGeneration, MediaEditorProject, User
from app.services.token_service import TokenManager


router = APIRouter(prefix="/media-editor", tags=["Media Editor"])

MEDIA_EDITOR_UPLOAD_DIR = os.path.join(settings.UPLOAD_DIR, "media_editor")


class MediaEditorProjectCreate(BaseModel):
    name: str


class MediaEditorProjectUpdate(BaseModel):
    name: Optional[str] = None
    assets: Optional[List[Dict[str, Any]]] = None
    tracks: Optional[List[Dict[str, Any]]] = None
    playhead: Optional[float] = None


class MediaEditorProjectResponse(BaseModel):
    id: UUID
    name: str
    assets: List[Dict[str, Any]]
    tracks: List[Dict[str, Any]]
    playhead: float
    created_at: datetime
    updated_at: datetime


class MediaEditorGenerateRequest(BaseModel):
    model_id: str
    prompt: str
    type: Literal["video", "audio"]
    image_url: Optional[str] = None
    quality: Optional[Literal["low", "medium", "high"]] = None
    aspect_ratio: Optional[str] = None
    resolution: Optional[str] = None
    duration: Optional[str] = None
    generate_audio: Optional[bool] = None
    voice: Optional[str] = None
    seed: Optional[int] = None


class MediaEditorAssetResponse(BaseModel):
    asset: Dict[str, Any]
    project: MediaEditorProjectResponse


def serialize_project(project: MediaEditorProject) -> MediaEditorProjectResponse:
    return MediaEditorProjectResponse(
        id=project.id,
        name=project.name,
        assets=project.assets or [],
        tracks=project.tracks or [],
        playhead=project.playhead or 0,
        created_at=project.created_at,
        updated_at=project.updated_at or project.created_at,
    )


def get_owned_project(project_id: UUID, db: Session, current_user: User) -> MediaEditorProject:
    project = (
        db.query(MediaEditorProject)
        .filter(MediaEditorProject.id == project_id, MediaEditorProject.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Media Editor project not found")
    return project


def infer_asset_name(file_url: str, fallback: str) -> str:
    filename = os.path.basename(file_url.split("?")[0])
    return filename or fallback


def media_to_asset(media: Dict[str, Any], prompt: str, asset_type: Literal["video", "audio"], file_url: Optional[str] = None) -> Dict[str, Any]:
    url = media.get("url")
    if not url:
        raise HTTPException(status_code=502, detail="Generated media did not include a URL")

    duration = 5
    if isinstance(media.get("duration"), (int, float)):
        duration = float(media["duration"])

    return {
        "id": f"lib_{uuid.uuid4().hex}",
        "name": prompt[:48] or infer_asset_name(url, "Generated media"),
        "type": asset_type,
        "duration": duration,
        "fileUrl": file_url or url,
        "thumbnail": media.get("thumbnail_url") or media.get("preview_url") or "",
        "source": "ai",
        "sourceUrl": url,
    }


def extension_for_media(asset_type: Literal["video", "audio"], content_type: Optional[str], url: str) -> str:
    extension = os.path.splitext(url.split("?")[0])[1].lower()
    if extension:
        return extension
    if content_type == "video/webm":
        return ".webm"
    if content_type == "audio/wav":
        return ".wav"
    if content_type == "audio/mpeg":
        return ".mp3"
    return ".mp4" if asset_type == "video" else ".mp3"


async def store_generated_media(
    media_url: str,
    asset_type: Literal["video", "audio"],
    request: Request,
    current_user: User,
    project: MediaEditorProject,
) -> str:
    os.makedirs(MEDIA_EDITOR_UPLOAD_DIR, exist_ok=True)

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        response = await client.get(media_url)
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail="Generated media could not be downloaded for project storage")

    extension = extension_for_media(asset_type, response.headers.get("content-type"), media_url)
    filename = f"{current_user.id}_{project.id}_{uuid.uuid4().hex}{extension}"
    file_path = os.path.join(MEDIA_EDITOR_UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        buffer.write(response.content)
    return str(request.url_for("get_media_editor_upload", filename=filename))


@router.get("/projects", response_model=List[MediaEditorProjectResponse])
async def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    projects = (
        db.query(MediaEditorProject)
        .filter(MediaEditorProject.user_id == current_user.id)
        .order_by(MediaEditorProject.updated_at.desc())
        .all()
    )
    return [serialize_project(project) for project in projects]


@router.post("/projects", response_model=MediaEditorProjectResponse)
async def create_project(
    payload: MediaEditorProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")

    project = MediaEditorProject(
        user_id=current_user.id,
        name=name,
        assets=[],
        tracks=[
            {"id": "t1", "type": "video", "name": "Video Track 1", "clips": []},
            {"id": "t2", "type": "audio", "name": "Voiceover", "clips": []},
        ],
        playhead=0,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.patch("/projects/{project_id}", response_model=MediaEditorProjectResponse)
async def update_project(
    project_id: UUID,
    payload: MediaEditorProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Project name is required")
        project.name = name
    if payload.assets is not None:
        project.assets = payload.assets
    if payload.tracks is not None:
        project.tracks = payload.tracks
    if payload.playhead is not None:
        project.playhead = payload.playhead
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)
    db.delete(project)
    db.commit()
    return Response(status_code=204)


@router.post("/projects/{project_id}/upload", response_model=MediaEditorAssetResponse)
async def upload_media(
    project_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)
    if not file.content_type or not (file.content_type.startswith("video/") or file.content_type.startswith("audio/")):
        raise HTTPException(status_code=400, detail="Only audio and video uploads are supported")

    extension = os.path.splitext(file.filename or "")[1].lower()
    if not extension:
        extension = ".mp4" if file.content_type.startswith("video/") else ".mp3"

    os.makedirs(MEDIA_EDITOR_UPLOAD_DIR, exist_ok=True)
    filename = f"{current_user.id}_{project.id}_{uuid.uuid4().hex}{extension}"
    file_path = os.path.join(MEDIA_EDITOR_UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to upload media: {str(exc)}")

    asset = {
        "id": f"lib_{uuid.uuid4().hex}",
        "name": file.filename or filename,
        "type": "audio" if file.content_type.startswith("audio/") else "video",
        "duration": 5,
        "fileUrl": str(request.url_for("get_media_editor_upload", filename=filename)),
        "thumbnail": "",
        "source": "upload",
    }
    project.assets = [*(project.assets or []), asset]
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return MediaEditorAssetResponse(asset=asset, project=serialize_project(project))


@router.get("/uploads/{filename}", name="get_media_editor_upload")
async def get_media_editor_upload(filename: str):
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(MEDIA_EDITOR_UPLOAD_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Upload not found")
    return FileResponse(file_path)


@router.post("/projects/{project_id}/generate", response_model=MediaEditorAssetResponse)
async def generate_media_for_project(
    project_id: UUID,
    payload: MediaEditorGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)
    model = get_model(payload.model_id)
    expected_type = "speech" if payload.type == "audio" else "video"
    if model.type != expected_type:
        raise HTTPException(status_code=400, detail=f"Selected model is not an AI {payload.type} model")
    cost = TokenManager.media_cost(model.type)
    TokenManager.check_balance(current_user, cost)

    studio_payload = StudioGenerateRequest(
        model_id=payload.model_id,
        prompt=payload.prompt,
        image_url=payload.image_url,
        quality=payload.quality,
        aspect_ratio=payload.aspect_ratio,
        resolution=payload.resolution,
        duration=payload.duration,
        generate_audio=payload.generate_audio,
        voice=payload.voice,
        seed=payload.seed,
    )
    arguments = build_fal_input(model, studio_payload, current_user)
    fal_response = await run_fal_queue(model.id, arguments)
    result = fal_response["result"]
    media = collect_media(result)
    generated_media = next((item for item in media if item.get("type") == payload.type), None)
    if not generated_media:
        raise HTTPException(status_code=502, detail=f"AI Studio did not return {payload.type} media")
    stored_url = await store_generated_media(generated_media["url"], payload.type, request, current_user, project)
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
    asset = media_to_asset(generated_media, payload.prompt.strip(), payload.type, stored_url)
    project.assets = [*(project.assets or []), asset]
    project.updated_at = datetime.utcnow()

    db.add(generation)
    db.commit()
    db.refresh(project)
    return MediaEditorAssetResponse(asset=asset, project=serialize_project(project))
