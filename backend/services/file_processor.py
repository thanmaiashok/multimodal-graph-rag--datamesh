import asyncio
import hashlib
import os
import subprocess
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image

from config import settings
from services.embeddings import caption_image, get_image_embedding, get_text_embedding, transcribe_audio
from services.graph_store import extract_and_store_entities
from services.vector_store import add_documents

SUPPORTED_IMAGE = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
SUPPORTED_AUDIO = {".mp3", ".wav", ".m4a", ".ogg", ".flac"}
SUPPORTED_VIDEO = {".mp4", ".avi", ".mov", ".mkv"}


def get_modality(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf" or ext in {".txt", ".md"}:
        return "text"
    if ext in SUPPORTED_IMAGE:
        return "image"
    if ext in SUPPORTED_AUDIO:
        return "audio"
    if ext in SUPPORTED_VIDEO:
        return "video"
    return "unknown"


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    # Split on sentence boundaries first, then group into chunks
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks, current_words, current_len = [], [], 0
    for sent in sentences:
        words = sent.split()
        if current_len + len(words) > chunk_size and current_words:
            chunks.append(" ".join(current_words))
            # Keep overlap sentences
            overlap_words = current_words[-overlap:]
            current_words = overlap_words + words
            current_len = len(current_words)
        else:
            current_words.extend(words)
            current_len += len(words)
    if current_words:
        chunks.append(" ".join(current_words))
    return [c for c in chunks if c.strip()]


def file_hash(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


async def _index_text_chunks(text: str, file_id: str, modality: str) -> dict:
    chunks = _chunk_text(text)
    if not chunks:
        return {"chunks": 0, "entities": 0}
    documents = []
    for i, chunk in enumerate(chunks):
        embedding = await asyncio.to_thread(get_text_embedding, chunk)
        documents.append(
            {
                "id": f"{file_id}_chunk_{i}",
                "text": chunk,
                "embedding": embedding,
                "metadata": {"file_id": file_id, "modality": modality, "chunk_index": i},
            }
        )
    await add_documents("text_collection", documents)
    entities = await extract_and_store_entities(text, file_id)
    return {"chunks": len(chunks), "entities": entities}


async def _process_pdf(file_path: str, file_id: str) -> dict:
    with fitz.open(file_path) as doc:
        text = "".join(page.get_text() for page in doc)
    return await _index_text_chunks(text, file_id, "text")


async def _process_text(file_path: str, file_id: str) -> dict:
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
    return await _index_text_chunks(text, file_id, "text")


async def _process_image(file_path: str, file_id: str, original_filename: str = "") -> dict:
    embedding = await asyncio.to_thread(get_image_embedding, file_path)
    p = Path(file_path)
    display_name = original_filename or p.name
    try:
        with Image.open(file_path) as img:
            w, h = img.size
            mode = img.mode
            fmt = img.format or Path(original_filename).suffix.lstrip(".").upper()
        size_kb = round(p.stat().st_size / 1024, 1)
        meta_desc = (
            f"Image file: {display_name} | Format: {fmt} | "
            f"Dimensions: {w}x{h}px | Mode: {mode} | Size: {size_kb}KB"
        )
    except Exception:
        meta_desc = f"Image file: {display_name}"

    # Rich vision caption via Groq LLM
    vision_caption = await caption_image(file_path)
    description = f"{meta_desc}\n\nContent: {vision_caption}" if vision_caption else meta_desc

    await add_documents(
        "image_collection",
        [
            {
                "id": file_id,
                "text": description,
                "embedding": embedding,
                "metadata": {
                    "file_id": file_id,
                    "modality": "image",
                    "file_path": file_path,
                    "filename": display_name,
                },
            }
        ],
    )
    return {"chunks": 1, "entities": 0}


async def _process_audio(file_path: str, file_id: str) -> dict:
    transcript = await transcribe_audio(file_path)
    return await _index_text_chunks(transcript, file_id, "audio")


async def _process_video(file_path: str, file_id: str) -> dict:
    audio_path = str(Path(file_path).with_suffix("")) + "_audio.wav"
    await asyncio.to_thread(
        subprocess.run,
        ["ffmpeg", "-i", file_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path, "-y", "-loglevel", "quiet"],
        check=False,
    )
    if os.path.exists(audio_path):
        result = await _process_audio(audio_path, file_id)
        os.remove(audio_path)
        return result
    return {"chunks": 0, "entities": 0}


async def process_file(file_path: str, filename: str, file_id: str) -> dict:
    ext = Path(filename).suffix.lower()
    modality = get_modality(filename)

    if ext == ".pdf":
        result = await _process_pdf(file_path, file_id)
    elif ext in {".txt", ".md"}:
        result = await _process_text(file_path, file_id)
    elif ext in SUPPORTED_IMAGE:
        result = await _process_image(file_path, file_id, original_filename=filename)
    elif ext in SUPPORTED_AUDIO:
        result = await _process_audio(file_path, file_id)
    elif ext in SUPPORTED_VIDEO:
        result = await _process_video(file_path, file_id)
    else:
        result = {"chunks": 0, "entities": 0}

    return {**result, "modality": modality}
