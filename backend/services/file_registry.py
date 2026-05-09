"""
JSON-based registry of indexed files.
Persisted at UPLOAD_DIR/registry.json so it survives restarts.
"""
import json
import os
from datetime import datetime
from typing import Optional

from config import settings

_REGISTRY_PATH = os.path.join(settings.UPLOAD_DIR, "registry.json")


def _load() -> dict:
    try:
        with open(_REGISTRY_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save(data: dict):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(_REGISTRY_PATH, "w") as f:
        json.dump(data, f, indent=2)


def register_file(
    file_id: str,
    filename: str,
    modality: str,
    file_path: str,
    chunks: int,
    entities: int,
    content_hash: str = "",
):
    data = _load()
    data[file_id] = {
        "file_id": file_id,
        "filename": filename,
        "modality": modality,
        "file_path": file_path,
        "chunks": chunks,
        "entities": entities,
        "content_hash": content_hash,
        "created_at": datetime.utcnow().isoformat(),
    }
    _save(data)


def get_all_files() -> list[dict]:
    return list(_load().values())


def get_file(file_id: str) -> Optional[dict]:
    return _load().get(file_id)


def remove_file(file_id: str):
    data = _load()
    data.pop(file_id, None)
    _save(data)
