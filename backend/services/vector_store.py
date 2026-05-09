import asyncio
import chromadb
from config import settings
from typing import Optional

_client: Optional[chromadb.AsyncHttpClient] = None
_collections: dict = {}

# Minimum cosine similarity to return a result (filters irrelevant noise)
RELEVANCE_THRESHOLD = 0.25


async def init_chromadb():
    global _client
    for attempt in range(10):
        try:
            _client = await chromadb.AsyncHttpClient(
                host=settings.CHROMADB_HOST,
                port=settings.CHROMADB_PORT,
            )
            await _client.heartbeat()
            print("ChromaDB connected.")
            break
        except Exception as e:
            print(f"ChromaDB not ready (attempt {attempt + 1}/10): {e}")
            await asyncio.sleep(3)
    else:
        print("WARNING: ChromaDB failed to connect after 10 attempts.")
        return

    for name in ["text_collection", "image_collection"]:
        try:
            # Try cosine distance config — works on fresh collections
            col = await _client.get_or_create_collection(
                name=name,
                metadata={"hnsw:space": "cosine"},
            )
            _collections[name] = col
            print(f"Collection ready: {name}")
        except Exception:
            try:
                col = await _client.get_or_create_collection(name=name)
                _collections[name] = col
                print(f"Collection ready (L2 fallback): {name}")
            except Exception as e:
                print(f"Error creating collection {name}: {e}")


def _to_cosine_similarity(distance: float, space: str = "cosine") -> float:
    # ChromaDB cosine space: distance = 1 - cosine_sim
    sim = 1.0 - distance
    return round(max(-1.0, min(1.0, sim)), 4)


async def add_documents(collection_name: str, documents: list[dict]):
    if collection_name not in _collections or not documents:
        return
    col = _collections[collection_name]
    try:
        await col.upsert(
            ids=[doc["id"] for doc in documents],
            embeddings=[doc["embedding"] for doc in documents],
            documents=[doc["text"] for doc in documents],
            metadatas=[doc["metadata"] for doc in documents],
        )
    except Exception as e:
        print(f"add_documents error [{collection_name}]: {e}")
        raise


async def delete_by_file_id(file_id: str):
    for col in _collections.values():
        try:
            existing = await col.get(where={"file_id": file_id})
            ids = existing.get("ids", [])
            if ids:
                await col.delete(ids=ids)
                print(f"Deleted {len(ids)} chunks for file {file_id}")
        except Exception as e:
            print(f"ChromaDB delete error for {file_id}: {e}")


async def query_collection(
    collection_name: str,
    query_embedding: list[float],
    n_results: int = 5,
    threshold: float = RELEVANCE_THRESHOLD,
) -> list[dict]:
    if collection_name not in _collections:
        return []
    col = _collections[collection_name]
    try:
        # Clamp n_results to actual collection count to avoid ChromaDB error
        count_result = await col.count()
        if count_result == 0:
            return []
        safe_n = min(n_results, count_result)

        results = await col.query(
            query_embeddings=[query_embedding],
            n_results=safe_n,
            include=["documents", "metadatas", "distances"],
        )

        docs = []
        for i, doc in enumerate(results["documents"][0]):
            raw_dist = results["distances"][0][i]
            score = _to_cosine_similarity(raw_dist)
            if score < threshold:
                continue  # Skip irrelevant results
            docs.append({
                "text": doc,
                "metadata": results["metadatas"][0][i],
                "score": score,
            })

        # Sort best first
        docs.sort(key=lambda x: x["score"], reverse=True)
        return docs

    except Exception as e:
        print(f"Query error [{collection_name}]: {e}")
        return []
