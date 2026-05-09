import asyncio
import json
from queue import Queue
from threading import Thread

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.schemas import ChatRequest
from services.llm import generate_stream
from services.retriever import hybrid_retrieve

router = APIRouter()


@router.post("/chat")
async def chat(request: ChatRequest):
    history = [{"role": m.role, "content": m.content} for m in request.history]
    retrieval = await hybrid_retrieve(request.message, request.modality, history=history)

    all_docs = retrieval["text_results"] + retrieval.get("image_results", [])
    sources = []
    for i, doc in enumerate(all_docs, 1):
        modality = doc["metadata"].get("modality", "text")
        file_id = doc["metadata"].get("file_id", "")
        src = {
            "id": i,
            "text": doc["text"][:200] + ("..." if len(doc["text"]) > 200 else ""),
            "modality": modality,
            "score": round(doc["score"], 3),
        }
        if file_id:
            src["url"] = f"/api/files/{file_id}/serve"
        sources.append(src)

    async def event_stream():
        yield f"data: {json.dumps({'type': 'sources', 'data': sources})}\n\n"

        q: Queue = Queue()

        def _run_stream():
            try:
                stream = generate_stream(request.message, retrieval, history)
                for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        q.put(delta)
            finally:
                q.put(None)  # sentinel

        thread = Thread(target=_run_stream, daemon=True)
        thread.start()

        loop = asyncio.get_running_loop()
        while True:
            token = await loop.run_in_executor(None, q.get)
            if token is None:
                break
            yield f"data: {json.dumps({'type': 'token', 'data': token})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'data': ''})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
