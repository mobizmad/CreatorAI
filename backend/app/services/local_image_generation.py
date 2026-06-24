import os
import uuid
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, Request, status

from app.config import settings


LOCAL_IMAGE_MODEL_ID = settings.LOCAL_IMAGE_MODEL_ID
LOCAL_IMAGE_MODEL_ALIAS = "local/sd35-medium"
LEGACY_LOCAL_IMAGE_MODEL_IDS = {
    "local/sdxl-base-1.0",
    "stabilityai/stable-diffusion-xl-base-1.0",
}


def is_local_image_model(model_id: str) -> bool:
    return model_id in {LOCAL_IMAGE_MODEL_ID, LOCAL_IMAGE_MODEL_ALIAS, *LEGACY_LOCAL_IMAGE_MODEL_IDS}


def _image_upload_url(filename: str, request: Optional[Request] = None) -> str:
    if request:
        return str(request.url_for("get_studio_upload", filename=filename))
    return f"{settings.PUBLIC_API_BASE_URL.rstrip('/')}/ai-studio/uploads/{filename}"


def _filename_from_url(url: str) -> Optional[str]:
    if not url:
        return None
    path = urlparse(url).path
    filename = os.path.basename(path)
    return filename or None


def _normalize_service_result(result: Dict[str, Any], request: Optional[Request]) -> Dict[str, Any]:
    normalized = dict(result)
    images = []

    for image in result.get("images") or []:
        if not isinstance(image, dict):
            continue

        item = dict(image)
        filename = item.get("filename") or _filename_from_url(item.get("url", ""))
        if filename:
            item["filename"] = filename
            item["url"] = _image_upload_url(filename, request)
        images.append(item)

    normalized["images"] = images
    return normalized


def _parse_resolution(resolution: Optional[str]) -> int:
    if not resolution:
        return 768
    try:
        value = int(str(resolution).lower().replace("p", ""))
    except ValueError:
        return 768
    value = min(max(value, 512), 1080)
    return max(512, (value // 16) * 16)


def _dimensions_for(aspect_ratio: Optional[str], resolution: Optional[str]) -> Tuple[int, int]:
    longest_side = _parse_resolution(resolution)
    ratio_map = {
        "1:1": (1, 1),
        "16:9": (16, 9),
        "9:16": (9, 16),
        "4:3": (4, 3),
        "3:4": (3, 4),
        "3:2": (3, 2),
        "2:3": (2, 3),
    }
    ratio = ratio_map.get(aspect_ratio or "1:1", ratio_map["1:1"])
    ratio_width, ratio_height = ratio

    def rounded(value: float) -> int:
        return max(256, round(value / 16) * 16)

    if ratio_width >= ratio_height:
        width = longest_side
        height = longest_side if ratio_width == ratio_height else rounded(longest_side * ratio_height / ratio_width)
    else:
        height = longest_side
        width = rounded(longest_side * ratio_width / ratio_height)

    return width, height


def _guidance_for(prompt_adherence: Optional[str]) -> float:
    return {
        "relaxed": 2.8,
        "balanced": 3.5,
        "strict": 5.0,
    }.get(prompt_adherence or "balanced", 3.5)


def local_sdxl_options(
    quality: Optional[str] = None,
    aspect_ratio: Optional[str] = None,
    resolution: Optional[str] = None,
    prompt_adherence: Optional[str] = None,
) -> Dict[str, Any]:
    width, height = _dimensions_for(aspect_ratio, resolution)
    steps = {
        "low": 14,
        "medium": 20,
        "high": 28,
    }.get(quality or "medium", 20)
    return {
        "width": width,
        "height": height,
        "steps": steps,
        "guidance_scale": _guidance_for(prompt_adherence),
        "max_sequence_length": 512,
    }


async def run_local_sdxl(
    *,
    prompt: str,
    request: Optional[Request] = None,
    quality: Optional[str] = None,
    width: int = 768,
    height: int = 768,
    steps: int = 20,
    guidance_scale: float = 3.5,
    seed: Optional[int] = None,
    aspect_ratio: Optional[str] = None,
    resolution: Optional[str] = None,
    prompt_adherence: Optional[str] = None,
) -> Dict[str, Any]:
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    if quality or aspect_ratio or resolution or prompt_adherence:
        options = local_sdxl_options(quality, aspect_ratio, resolution, prompt_adherence)
        width = options["width"]
        height = options["height"]
        steps = options["steps"]
        guidance_scale = options["guidance_scale"]

    payload = {
        "prompt": prompt.strip(),
        "width": width,
        "height": height,
        "steps": steps,
        "guidance_scale": guidance_scale,
        "max_sequence_length": 512,
        "seed": seed,
        "quality": quality or "custom",
    }

    service_url = settings.LOCAL_IMAGE_SERVICE_URL.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=settings.LOCAL_IMAGE_SERVICE_TIMEOUT) as client:
            response = await client.post(f"{service_url}/generate", json=payload)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Local SD35 service is not reachable. Start sdxl_service/sd35_test.py "
                f"outside Docker and verify LOCAL_IMAGE_SERVICE_URL={settings.LOCAL_IMAGE_SERVICE_URL}."
            ),
        ) from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except Exception:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)

    service_response = response.json()
    result = service_response.get("result")
    if not isinstance(result, dict):
        raise HTTPException(status_code=502, detail="Local SD35 service returned an invalid generation response")

    return {
        "request_id": service_response.get("request_id") or f"local-sd35-{uuid.uuid4().hex}",
        "result": _normalize_service_result(result, request),
    }
