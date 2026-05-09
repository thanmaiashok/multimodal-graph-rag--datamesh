import asyncio
import difflib
import re
from collections import Counter

from services.embeddings import get_query_image_embedding, get_text_embedding
from services.graph_store import get_graph_context
from services.vector_store import query_collection
from services.file_registry import get_all_files

_STOPWORDS = {
    "with", "that", "this", "from", "they", "what", "which", "when",
    "where", "have", "about", "been", "will", "would", "could", "should",
    "their", "there", "these", "those", "then", "than", "also",
}


def _extract_keywords(text: str) -> list[str]:
    # Match: normal words (3+ chars), ALL-CAPS acronyms (2+ chars), alphanumeric tokens
    tokens = re.findall(r"\b[A-Z]{2,}\b|\b[A-Za-z0-9][A-Za-z0-9\-]{2,}\b", text)
    seen = set()
    result = []
    for t in tokens:
        lower = t.lower()
        if lower not in _STOPWORDS and lower not in seen:
            result.append(t)
            seen.add(lower)
    return result[:15]


def _build_file_summary() -> str:
    files = get_all_files()
    if not files:
        return "No files indexed yet."
    counts = Counter(f.get("modality", "unknown") for f in files)
    lines = [f"Total indexed: {len(files)} file(s)"]
    for mod, count in sorted(counts.items()):
        names = [f.get("filename", "unknown") for f in files if f.get("modality") == mod]
        lines.append(f"  {mod.upper()} ({count}): {', '.join(names)}")
    return "\n".join(lines)


def _wants_file_listing(query: str) -> bool:
    q = (query or "").lower()
    if any(p in q for p in [
        "link", "download", "dalod", "dload",
        "show all", "list all", "show me", "give me", "get me",
        "show images", "list images", "all images",
        "show files", "list files", "all files",
        "indexed", "uploaded files", "what files", "what images",
        "image inventory", "display all", "view all",
        "can i see", "can i view", "can i get", "how to see",
        "see image", "view image", "open image", "access",
        "show audio", "list audio", "all audio", "audio files",
        "show video", "list video", "all video", "video files",
        "show pdf", "list pdf", "all pdf", "show text", "list text",
        "what audio", "what video", "what images", "what pdfs", "what pdf",
        "do i have", "have i uploaded", "i have uploaded",
    ]):
        return True
    # "what are pdfs/images/audio/videos" — generic modality question → list that modality
    if "what are" in q and _detect_query_modality(q) != "all":
        return True
    # Short query (≤6 words) with clear modality = listing request
    # Handles typos like "gimme videos", "sho me pdfs", "lst audios"
    if len(q.split()) <= 6 and _detect_query_modality(q) != "all":
        return True
    return False


_MODALITY_KEYWORDS: dict[str, list[str]] = {
    "audio": ["audio", "mp3", "wav", "m4a", "ogg", "song", "music", "sound"],
    "video": ["video", "videos", "mp4", "mov", "avi", "clip", "footage"],
    "image": ["image", "images", "photo", "picture", "jpg", "jpeg", "png", "gif", "webp", "img"],
    "text":  ["pdf", "pdfs", "text", "document", "txt", "markdown", "md"],
}
_ALL_MODALITY_WORDS = [kw for kws in _MODALITY_KEYWORDS.values() for kw in kws]


_ACTION_WORDS = {"show", "list", "give", "get", "find", "display", "view", "open",
                 "play", "see", "tell", "what", "are", "have", "all", "me", "my"}


def _fuzzy_match_modality(word: str) -> str | None:
    """Return modality if word is close to any modality keyword (handles typos)."""
    # Skip short words and common action/filler words to avoid false matches (e.g. "giv"→"gif")
    if len(word) < 4 or word in _ACTION_WORDS:
        return None
    matches = difflib.get_close_matches(word, _ALL_MODALITY_WORDS, n=1, cutoff=0.65)
    if not matches:
        return None
    matched_kw = matches[0]
    for modality, keywords in _MODALITY_KEYWORDS.items():
        if matched_kw in keywords:
            return modality
    return None


def _detect_query_modality(query: str) -> str:
    """Detect modality from query text — exact match first, then fuzzy for typos."""
    q = (query or "").lower()
    # Exact substring match
    for modality, keywords in _MODALITY_KEYWORDS.items():
        if any(kw in q for kw in keywords):
            return modality
    # Fuzzy per-word match (handles "vdios", "imge", "aduio", etc.)
    for word in q.split():
        modality = _fuzzy_match_modality(word)
        if modality:
            return modality
    return "all"


def _find_file_by_name(query: str) -> list[dict]:
    """Return files whose filename appears (fuzzy) in the query."""
    files = get_all_files()
    q = (query or "").lower()
    matched = []
    for f in files:
        fname = f.get("filename", "").lower()
        # strip extension for matching
        stem = fname.rsplit(".", 1)[0] if "." in fname else fname
        if fname in q or stem in q:
            file_id = f.get("file_id", "")
            if file_id:
                matched.append({
                    "text": f.get("filename", "unknown"),
                    "metadata": {"file_id": file_id, "modality": f.get("modality", "unknown")},
                    "score": 1.0,
                })
    return matched


_EXT_FILTER = {
    "pdf":      {".pdf"},
    "txt":      {".txt"},
    "md":       {".md", ".markdown"},
    "mp3":      {".mp3"},
    "wav":      {".wav"},
    "m4a":      {".m4a"},
    "ogg":      {".ogg"},
    "mp4":      {".mp4"},
    "mov":      {".mov"},
    "avi":      {".avi"},
    "jpg":      {".jpg", ".jpeg"},
    "jpeg":     {".jpg", ".jpeg"},
    "png":      {".png"},
    "gif":      {".gif"},
    "webp":     {".webp"},
}


def _detect_ext_filter(query: str) -> set[str] | None:
    """Return set of extensions if query specifies a format, else None."""
    q = (query or "").lower()
    for key, exts in _EXT_FILTER.items():
        if key in q:
            return exts
    return None


def _all_files_as_sources(modality_filter: str = "all", ext_filter: set[str] | None = None) -> list[dict]:
    files = get_all_files()
    results = []
    for f in files:
        fmod = f.get("modality", "unknown")
        if modality_filter != "all" and fmod != modality_filter:
            continue
        if ext_filter:
            fname = f.get("filename", "")
            ext = ("." + fname.rsplit(".", 1)[-1]).lower() if "." in fname else ""
            if ext not in ext_filter:
                continue
        file_id = f.get("file_id", "")
        if not file_id:
            continue
        results.append({
            "text": f.get("filename", "unknown"),
            "metadata": {"file_id": file_id, "modality": fmod},
            "score": 1.0,
        })
    return results


def _is_followup_query(query: str, history_filenames: list[str]) -> bool:
    """
    True when query looks like a follow-up to a previously mentioned file.
    Strategy: short query + no known filename in it + history has a file = follow-up.
    Handles typos naturally — no pattern list needed.
    """
    if not history_filenames:
        return False
    q = (query or "").lower().strip()
    # If query already names a known file, it's a direct request — not a follow-up
    for fname in history_filenames:
        stem = fname.rsplit(".", 1)[0].lower() if "." in fname else fname.lower()
        if fname.lower() in q or stem in q:
            return False
    # Short query (≤8 words) with no filename = almost certainly a follow-up
    word_count = len(q.split())
    return word_count <= 8


def _extract_filenames_from_history(history: list[dict]) -> list[str]:
    """Scan recent messages (both roles) for known filenames, most recent first."""
    filenames = []
    all_files = get_all_files()
    known_names = {f.get("filename", "").lower(): f.get("filename", "") for f in all_files}

    for msg in reversed(history[-8:]):  # last 4 exchanges
        content = msg.get("content", "").lower()
        for lower_name, orig_name in known_names.items():
            stem = lower_name.rsplit(".", 1)[0] if "." in lower_name else lower_name
            if lower_name in content or stem in content:
                if orig_name not in filenames:
                    filenames.append(orig_name)
    return filenames


async def hybrid_retrieve(query: str, modality: str = "all", n_results: int = 5, history: list[dict] | None = None) -> dict:
    file_summary = _build_file_summary()
    history = history or []

    # Follow-up query → use filenames from recent history
    history_filenames = _extract_filenames_from_history(history) if history else []
    if _is_followup_query(query, history_filenames):
        if history_filenames:
            # Build a synthetic query combining follow-up + known filename
            combined_query = f"{query} {history_filenames[0]}"
            named_files = _find_file_by_name(combined_query)
            if named_files:
                image_results = [r for r in named_files if r["metadata"]["modality"] == "image"]
                text_results  = [r for r in named_files if r["metadata"]["modality"] != "image"]
                return {
                    "text_results": text_results,
                    "image_results": image_results,
                    "graph_context": "",
                    "keywords": [],
                    "file_summary": file_summary,
                }

    # Check if user asks for a specific file by name first
    named_files = _find_file_by_name(query)
    if named_files:
        image_results = [r for r in named_files if r["metadata"]["modality"] == "image"]
        text_results  = [r for r in named_files if r["metadata"]["modality"] != "image"]
        return {
            "text_results": text_results,
            "image_results": image_results,
            "graph_context": "",
            "keywords": [],
            "file_summary": file_summary,
        }

    # User wants to see/access/download files — return filtered indexed files as sources
    if _wants_file_listing(query):
        effective_modality = modality if modality != "all" else _detect_query_modality(query)
        ext_filter = _detect_ext_filter(query)
        all_files = _all_files_as_sources(effective_modality, ext_filter)
        image_results = [r for r in all_files if r["metadata"]["modality"] == "image"]
        text_results  = [r for r in all_files if r["metadata"]["modality"] != "image"]
        return {
            "text_results": text_results,
            "image_results": image_results,
            "graph_context": "",
            "keywords": [],
            "file_summary": file_summary,
        }

    query_modality = _detect_query_modality(query)

    text_embedding = await asyncio.to_thread(get_text_embedding, query)
    text_results = await query_collection("text_collection", text_embedding, n_results)

    image_results = []
    # Run image search only when query isn't explicitly about a non-image modality
    if modality in ("image", "all") and query_modality in ("image", "all"):
        image_embedding = await asyncio.to_thread(get_query_image_embedding, query)
        image_results = await query_collection("image_collection", image_embedding, n_results=5, threshold=0.05)
        # Fallback only when user explicitly asked for images (not for generic queries)
        if not image_results and query_modality == "image":
            image_results = _all_files_as_sources("image")

    keywords = _extract_keywords(query)
    graph_context = await get_graph_context(keywords)

    return {
        "text_results": text_results,
        "image_results": image_results,
        "graph_context": graph_context,
        "keywords": keywords,
        "file_summary": file_summary,
    }
