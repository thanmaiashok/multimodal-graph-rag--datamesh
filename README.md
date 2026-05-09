# MultiModal Graph RAG

Production-style Retrieval Augmented Generation system with Knowledge Graph support — processes text, images, audio, and video using Groq's fast inference API.

## Architecture

```
User → React Frontend → FastAPI Backend
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         ChromaDB          Neo4j          Groq API
       (vector store)   (graph store)  (LLM + Whisper)
              │               │
              └───────────────┘
                  Hybrid Retrieval
                       │
                   LLM Response
```

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | FastAPI + Python 3.11 |
| Vector DB | ChromaDB |
| Graph DB | Neo4j 5.15 |
| LLM | Groq `llama-3.1-8b-instant` |
| Audio | Groq `whisper-large-v3` |
| Text Embed | `sentence-transformers/all-MiniLM-L6-v2` |
| Image Embed | `openai/clip-vit-base-patch32` |
| Video | ffmpeg → audio extraction |

## Pipeline

1. **Upload** → file type detected → modality-specific processing
2. **Text** (PDF/TXT/MD) → PyMuPDF → chunked → MiniLM embeddings → ChromaDB
3. **Image** → CLIP embeddings → ChromaDB image collection
4. **Audio** → Groq Whisper → transcript → MiniLM embeddings → ChromaDB
5. **Video** → ffmpeg → audio → Groq Whisper → same as audio
6. **Entity Extraction** → Groq LLM → entities + relationships → Neo4j
7. **Query** → embed → vector search + graph traversal → Groq LLM → streamed response

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Groq API key (free at [console.groq.com](https://console.groq.com))

### Setup

```bash
# Clone and enter project
git clone <your-repo>
cd rag

# Copy env and add your Groq key
cp .env.example .env
# Edit .env: set GROQ_API_KEY=gsk_...

# Build and start all services
docker compose up --build

# Services start order: chromadb → neo4j → backend → frontend
# Wait ~2 minutes for first build (downloads ML models)
```

### Access

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Neo4j Browser | http://localhost:7474 |
| ChromaDB | http://localhost:8001 |

## API Reference

### POST /api/upload
Upload a file for processing.

```bash
curl -X POST http://localhost:8000/api/upload \
  -F "file=@document.pdf"
```

Response:
```json
{
  "file_id": "uuid",
  "filename": "document.pdf",
  "modality": "text",
  "status": "processed",
  "entities_extracted": 12,
  "chunks_indexed": 34
}
```

### POST /api/chat
Send a query (SSE streaming response).

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the key concepts?", "modality": "text", "history": []}'
```

### GET /api/graph
Get knowledge graph nodes and edges.

```bash
curl http://localhost:8000/api/graph
```

## Local Development (without Docker)

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Start ChromaDB and Neo4j separately, then:
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | required | Groq API key |
| `NEO4J_URI` | `bolt://neo4j:7687` | Neo4j connection |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `password123` | Neo4j password |
| `CHROMADB_HOST` | `chromadb` | ChromaDB host |
| `CHROMADB_PORT` | `8000` | ChromaDB port |

## Features

- Multi-modal upload: PDF, TXT, MD, JPG, PNG, GIF, WEBP, MP3, WAV, M4A, MP4, MOV, AVI
- Streaming chat responses (SSE)
- Source citations with relevance scores
- Interactive knowledge graph visualization (force-directed)
- Hybrid retrieval: vector similarity + graph traversal
- Conversation history (last 6 turns)
- Cross-modal search (text query → image results)
