import mimetypes
import os

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from services.embeddings import caption_image, get_image_embedding
from services.file_registry import get_all_files, get_file, register_file, remove_file
from services.graph_store import delete_file_entities, reconnect_graph
from services.vector_store import add_documents, delete_by_file_id

router = APIRouter()


@router.get("/files")
async def list_files():
    return {"files": get_all_files()}


@router.post("/files/{file_id}/reindex")
async def reindex_file(file_id: str, background_tasks: BackgroundTasks):
    """Re-run vision captioning for an image that was indexed before captions were added."""
    entry = get_file(file_id)
    if not entry:
        raise HTTPException(status_code=404, detail="File not found")
    if entry.get("modality") != "image":
        raise HTTPException(status_code=400, detail="Only image files support reindex")
    file_path = entry["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    async def _reindex():
        import asyncio
        from pathlib import Path
        filename = entry.get("filename", os.path.basename(file_path))
        embedding = await asyncio.to_thread(get_image_embedding, file_path)
        vision_caption = await caption_image(file_path)
        p = Path(file_path)
        size_kb = round(p.stat().st_size / 1024, 1)
        meta_desc = f"Image file: {filename} | Size: {size_kb}KB"
        description = f"{meta_desc}\n\nContent: {vision_caption}" if vision_caption else meta_desc
        await delete_by_file_id(file_id)
        await add_documents(
            "image_collection",
            [{
                "id": file_id,
                "text": description,
                "embedding": embedding,
                "metadata": {
                    "file_id": file_id,
                    "modality": "image",
                    "file_path": file_path,
                    "filename": filename,
                },
            }],
        )
        print(f"Reindexed {filename} with vision caption ({len(vision_caption)} chars)")

    background_tasks.add_task(_reindex)
    return {"status": "reindexing", "file_id": file_id, "filename": entry.get("filename")}


@router.get("/files/{file_id}/serve")
async def serve_file(file_id: str):
    entry = get_file(file_id)
    if not entry:
        raise HTTPException(status_code=404, detail="File not found")
    file_path = entry["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    filename = entry.get("filename") or os.path.basename(file_path)
    media_type, _ = mimetypes.guess_type(filename)

    # For previewable types, omit Content-Disposition entirely so the browser can render inline.
    # (Some clients treat any Content-Disposition as a download and show a blank/black tab.)
    previewable = False
    if media_type:
        previewable = (
            media_type.startswith("image/")
            or media_type.startswith("audio/")
            or media_type.startswith("video/")
            or media_type == "application/pdf"
            or media_type.startswith("text/")
        )

    if previewable:
        return FileResponse(file_path, media_type=media_type)

    return FileResponse(
        file_path,
        filename=filename,
        media_type=media_type,
        content_disposition_type="attachment",
    )


@router.delete("/files/{file_id}")
async def delete_file(file_id: str, background_tasks: BackgroundTasks):
    entry = get_file(file_id)
    if not entry:
        raise HTTPException(status_code=404, detail="File not found in registry")

    # 1. Remove from ChromaDB
    await delete_by_file_id(file_id)

    # 2. Remove entities from Neo4j and collect neighbor pairs for reconnection
    result = await delete_file_entities(file_id)

    # 3. Auto-reconnect graph in background (non-blocking)
    if result["neighbor_pairs"]:
        background_tasks.add_task(reconnect_graph, result["neighbor_pairs"])

    # 4. Delete physical file
    try:
        if os.path.exists(entry["file_path"]):
            os.remove(entry["file_path"])
    except Exception as e:
        print(f"Could not delete physical file: {e}")

    # 5. Remove from registry
    remove_file(file_id)

    return {
        "deleted": True,
        "file_id": file_id,
        "filename": entry["filename"],
        "chunks_removed": entry["chunks"],
        "entities_removed": result["deleted"],
        "reconnect_candidates": len(result["neighbor_pairs"]),
    }
