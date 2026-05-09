from groq import Groq
from config import settings

client = Groq(api_key=settings.GROQ_API_KEY)

_SYSTEM = """You are an intelligent Multi-Modal Graph RAG assistant.
You answer questions using retrieved document context, image metadata, and knowledge graph relationships.
Always cite sources with [Source N] notation. Be concise and accurate.

For images:
- Describe their content in detail using what is in the context (caption, dimensions, format, scene).
- The UI already displays images inline and shows clickable source links below your response — do NOT output raw URLs or markdown image syntax.
- If a user asks for a download link, tell them: "The file link is shown in the source citation below this message — click the source badge to open or download it."

For files in general:
- You have access to an indexed file inventory shown in context. Use it to answer questions about what files exist.
- Never say you "cannot provide links" — the UI handles that automatically via source citations.

If retrieved context lacks sufficient information to answer fully, say so and suggest the user upload more relevant files."""


def _build_context(retrieval: dict) -> str:
    parts = []

    file_summary = retrieval.get("file_summary", "")
    if file_summary:
        parts.append(f"=== Indexed File Inventory ===\n{file_summary}")

    if retrieval["text_results"]:
        parts.append("=== Retrieved Text / PDF / Audio Documents ===")
        for i, doc in enumerate(retrieval["text_results"], 1):
            mod = doc["metadata"].get("modality", "text").upper()
            score = doc["score"]
            parts.append(f"[Source {i} | {mod} | relevance={score:.2f}]\n{doc['text']}")

    image_results = retrieval.get("image_results", [])
    if image_results:
        offset = len(retrieval["text_results"])
        parts.append("=== Retrieved Images ===")
        for i, doc in enumerate(image_results, 1):
            src_num = offset + i
            score = doc["score"]
            parts.append(
                f"[Source {src_num} | IMAGE | relevance={score:.2f}]\n"
                f"{doc['text']}"
            )

    if retrieval["graph_context"]:
        parts.append("=== Knowledge Graph Context ===")
        parts.append(retrieval["graph_context"])

    return "\n\n".join(parts)


def _trim_history(history: list[dict], max_tokens: int = 3000) -> list[dict]:
    if not history:
        return []
    trimmed = []
    budget = max_tokens
    for msg in reversed(history):
        cost = len(msg.get("content", "")) // 4
        if budget - cost < 0 and trimmed:  # always include at least the last message
            break
        trimmed.insert(0, msg)
        budget -= cost
    return trimmed


_MAX_CONTEXT_CHARS = 12_000  # ~3k tokens — leaves room for history + answer


def generate_stream(query: str, retrieval: dict, history: list[dict]):
    context = _build_context(retrieval)
    if len(context) > _MAX_CONTEXT_CHARS:
        context = context[:_MAX_CONTEXT_CHARS] + "\n\n[context truncated]"
    messages = [{"role": "system", "content": _SYSTEM}]
    for msg in _trim_history(history):
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append(
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"}
    )
    return client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.7,
        max_tokens=2048,
        stream=True,
    )
