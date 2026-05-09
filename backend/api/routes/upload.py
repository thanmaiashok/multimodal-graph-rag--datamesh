import hashlib
import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, File, HTTPException, UploadFile

from config import settings
from models.schemas import UploadResponse
from services.file_processor import get_modality, process_file
from services.file_registry import get_all_files, register_file

router = APIRouter()

ALLOWED_EXTENSIONS = {
    ".pdf", ".txt", ".md",
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".mp3", ".wav", ".m4a", ".ogg", ".flac",
    ".mp4", ".avi", ".mov", ".mkv",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {len(content) // (1024*1024)}MB. Max 50MB.",
        )

    file_id = str(uuid.uuid4())
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{ext}")

    # Hash from memory — no second disk read needed
    content_hash = hashlib.sha256(content).hexdigest()
    for existing in get_all_files():
        if existing.get("content_hash") == content_hash:
            raise HTTPException(
                status_code=409,
                detail=f"File already indexed as '{existing['filename']}' (id: {existing['file_id']})",
            )

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    modality = get_modality(file.filename)

    # Process — clean up on failure so no orphaned files
    try:
        result = await process_file(file_path, file.filename, file_id)
    except Exception as e:
        try:
            os.remove(file_path)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

    register_file(
        file_id=file_id,
        filename=file.filename,
        modality=result.get("modality", modality),
        file_path=file_path,
        chunks=result.get("chunks", 0),
        entities=result.get("entities", 0),
        content_hash=content_hash,
    )

    return UploadResponse(
        file_id=file_id,
        filename=file.filename,
        modality=result.get("modality", modality),
        status="processed",
        entities_extracted=result.get("entities", 0),
        chunks_indexed=result.get("chunks", 0),
    )
