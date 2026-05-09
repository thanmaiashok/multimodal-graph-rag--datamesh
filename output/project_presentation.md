# MultiModal Graph RAG System
### A Document Intelligence Platform — Chat, Upload, Visualize

---

## Slide 1 — Title
**Talk time: ~30 sec**

# MultiModal Graph RAG

> "Ask questions across all your files — PDFs, images, audio, videos — and get intelligent, sourced answers in real time."

**Tech:** FastAPI · ChromaDB · Neo4j · Groq AI · React · Docker

This is a fully working, production-grade system. Runs in Docker with a single command.

![Chat Interface](screenshots/chat_interface_premium.png)

---

## Slide 2 — The Problem
**Talk time: ~45 sec**

# Why Existing Tools Fall Short

Most AI assistants only understand text. Real-world knowledge lives in many formats.

| File Type | Traditional Tools | This System |
|---|---|---|
| PDFs & documents | Can read | Can read |
| Images & photos | Ignored | AI vision understands and captions |
| Audio files | Ignored | Transcribed and searchable |
| Videos | Ignored | Audio extracted, transcribed, indexed |
| Cross-file connections | No memory | Knowledge graph connects everything |

**The gap:** Old tools answer from one file at a time. This system answers from all your files — connected together.

![File Manager](screenshots/filemanager_premium.png)

---

## Slide 3 — What We Built
**Talk time: ~60 sec**

# Feature Overview

### File Intelligence
- Upload PDF, TXT, MD, JPG, PNG, MP3, WAV, MP4, MOV — all formats supported
- AI vision (Groq LLaMA 4 Scout) captions every image automatically
- Whisper AI transcribes every audio and video file
- SHA-256 deduplication — same file is never indexed twice
- 50 MB file size limit with clear error feedback

### Smart Chat
- Ask in plain English — typos handled automatically with fuzzy matching
- Streaming responses — tokens appear word by word, like ChatGPT
- Clickable source badges under every answer — open images, play audio, view PDFs
- Context-aware follow-ups — say "tell me more about it" and the system knows which file

### Knowledge Graph
- Extracts entities (people, places, concepts, technologies) from every file
- Maps relationships between entities across different documents
- Auto-heals when a file is deleted — reconnects broken graph links using LLM judgment

### Engineering
- Fully Dockerized — 4 services, one command to start
- Parallel uploads — 10 files indexed simultaneously
- Interactive D3.js graph visualization in the browser

| Chat Interface | File Manager | Knowledge Graph |
|:---:|:---:|:---:|
| ![Chat](screenshots/chat_interface_premium.png) | ![Files](screenshots/filemanager_premium.png) | ![Graph](screenshots/graph_premium.png) |

---

## Slide 4 — System Architecture
**Talk time: ~60 sec**

# How It All Fits Together

```
┌─────────────────────────────────────────┐
│              Browser (React)            │
│       Chat  ·  Upload  ·  Graph         │
└──────────────┬──────────────────────────┘
               │  HTTP + Server-Sent Events (streaming)
               ▼
┌─────────────────────────────────────────┐
│            FastAPI Backend              │
│         Python 3.11 — core logic        │
│   Upload → Process → Index → Search     │
└───────┬─────────────────────┬───────────┘
        │                     │
        ▼                     ▼
┌───────────────┐    ┌────────────────────┐
│   ChromaDB    │    │       Neo4j        │
│  Vector Store │    │  Knowledge Graph   │
│               │    │                   │
│ Stores meaning│    │ Stores connections │
│ as embeddings │    │ between concepts   │
└───────────────┘    └────────────────────┘
```

- **ChromaDB** finds *relevant content* — "what chunks are about this topic?"
- **Neo4j** finds *connected knowledge* — "what else in the system relates to this?"
- Together they produce richer, more accurate answers than either alone.

---

## Slide 5 — File Processing Pipeline
**Talk time: ~60 sec**

# From Upload to Searchable

```
User uploads a file
        │
        ▼
┌──────────────────────────────────────────┐
│  Safety Check                            │
│  · Reject duplicates (SHA-256 hash)      │
│  · Reject files over 50 MB               │
└──────────────┬───────────────────────────┘
               │
     ┌─────────┴──────────┐
     ▼                    ▼
TEXT / PDF             IMAGE
· Extract text         · CLIP embedding (visual search)
· Split into chunks    · Groq Vision AI caption
· MiniLM embedding     · Stored in image collection
· Store in ChromaDB
     │              AUDIO / VIDEO
     │              · FFmpeg extracts audio track
     │              · Whisper transcribes speech
     │              · Transcript treated as text →
     ▼
┌──────────────────────────────────────────┐
│  Knowledge Graph Extraction              │
│  · LLaMA 3.3 extracts entities +         │
│    relationships from content            │
│  · Stored in Neo4j as nodes and edges    │
└──────────────────────────────────────────┘
```

Every file — regardless of type — becomes searchable text and graph knowledge within seconds.

---

## Slide 6 — The Chat System
**Talk time: ~60 sec**

# How the AI Answers a Question

```
User types: "Explain the attention mechanism"
                        │
           ┌────────────┴────────────┐
           ▼                         ▼
  Text embedding                CLIP embedding
  (MiniLM model)                (image model)
           │                         │
           ▼                         ▼
  Search ChromaDB text       Search ChromaDB images
  → Relevant PDF chunks      → Relevant images
           │                         │
           └────────────┬────────────┘
                        │
                        ▼
             Extract keywords → Query Neo4j
             Pull related graph entities
                        │
                        ▼
             Combine into context window
             (capped at 12,000 characters)
                        │
                        ▼
             Send to LLaMA 3.3 70B on Groq
             Stream answer token by token
```

The user sees a streaming answer with **[Source 1] [Source 2]** badges — click any to open the original file.

![Chat Interface — Live](screenshots/chat_interface_premium.png)

---

## Slide 7 — Smart Retrieval
**Talk time: ~60 sec**

# What Makes Retrieval Intelligent

Real users don't type perfect queries. The system is built to handle messy, natural input.

### 1. Modality Detection with Typo Forgiveness

| What the user types | What the system understands | Result |
|---|---|---|
| "show me images" | image modality | Images only |
| "show me vdios" | video (fuzzy match) | Videos only |
| "giv me aduio" | audio (fuzzy match) | Audio only |
| "what pdfs do I have" | pdf format filter | PDFs only |

Uses `difflib.get_close_matches` with a 0.65 similarity cutoff — tolerates typos without false positives.

### 2. Context-Aware Follow-ups

| Previous question | Follow-up | What happens |
|---|---|---|
| "show me city.jpg" | "tell me about it" | Retrieves city.jpg |
| "give me sample_audio.mp3" | "play it" | Returns that audio file |
| "show me the video" | "what's in this?" | Returns that video |

System scans the last 4 conversation turns to resolve what "it" or "this" refers to.

### 3. Filename-Specific Search
Mention any filename — full or partial — and the system returns exactly that file. "city" matches "city.jpg".

---

## Slide 8 — Knowledge Graph
**Talk time: ~45 sec**

# Connecting Knowledge Across Files

Every uploaded document adds nodes and edges to the Neo4j graph.

**Example — upload `bitcoin_whitepaper.pdf` and `ai_overview.txt`:**

```
[Satoshi Nakamoto] ── CREATED ──→ [Bitcoin]
        [Bitcoin] ── IS_A ──────→ [Cryptocurrency]
     [Blockchain] ── ENABLES ──→ [Bitcoin]
    [Transformer] ── USED_IN ──→ [LLaMA 3.3]
[Attention Paper] ── INTRODUCED → [Transformer]
```

### Auto-Heal on Delete

When a file is deleted:
1. Its vector chunks and graph entities are removed
2. Disconnected neighbors are identified
3. LLaMA evaluates whether a direct relationship makes sense
4. If yes, the link is created automatically — the graph stays intact

![Knowledge Graph — Live](screenshots/graph_premium.png)

---

## Slide 9 — Tech Stack & Deployment
**Talk time: ~45 sec**

# Technology Used — All Free and Open Source

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind CSS | Chat, file manager, graph UI |
| Backend | FastAPI (Python 3.11) | API, processing, orchestration |
| Vector DB | ChromaDB | Semantic similarity search |
| Graph DB | Neo4j 5.15 | Entity relationship storage |
| LLM | Groq — LLaMA 3.3 70B | Chat responses, entity extraction |
| Vision AI | Groq — LLaMA 4 Scout 17B | Image captioning and understanding |
| Speech AI | Groq — Whisper Large v3 | Audio and video transcription |
| Embeddings | sentence-transformers MiniLM | Text to vector conversion |
| Image Search | CLIP ViT-B/32 | Image to vector, cross-modal search |
| Containers | Docker + Docker Compose | One-command deployment |

### Running the System

```bash
cp .env.example .env   # add your free Groq API key
./start.sh             # starts all 4 Docker containers
# Open: http://localhost:3000
```

---

## Slide 10 — Results & Takeaways
**Talk time: ~45 sec**

# What Was Built and What Was Learned

### Working Features (all live, all demonstrated)

- 4 file modalities indexed and searchable — text, image, audio, video
- Streaming AI chat with clickable source citations, responses under 2 seconds
- Typo-tolerant query handling using fuzzy matching
- Context memory — follow-up questions resolve naturally across turns
- Knowledge graph with auto-heal on file deletion
- Parallel file uploads — multiple files indexed simultaneously
- One-command Docker deployment on any machine

### Scale

- Hundreds of files across all modalities
- ChromaDB cosine similarity search across thousands of vector chunks
- Neo4j graph with thousands of entity nodes and relationship edges

### Key Takeaway

> This is not just a chatbot. It is a complete document intelligence system — built from scratch — that understands every file type, connects knowledge across documents, and runs entirely on free APIs.

---

*Slides: 10 · Estimated talk time: 7 minutes*
