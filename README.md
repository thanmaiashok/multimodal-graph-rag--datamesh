<p align="center"><img src="docs/flow-3.svg" alt="Animated MultiModal Graph RAG pipeline: Upload → Detect → Embed → Store → Retrieve → Answer" width="100%"/></p>

<p align="center"><sub>10-second tour: Upload → Detect → Embed → Store → Retrieve → Answer</sub></p>

<p align="center"><img src="docs/px3/intro.svg" width="100%" alt="Production-style Retrieval Augmented Generation with a knowledge graph. Processes text, images, audio and video using Groq&#x27;s fast inference API."/></p>

<p align="center"><img src="docs/px3/features.svg" width="100%" alt="Key features"/></p>

<a id="architecture"></a>
<h2><img src="docs/px3/h2-architecture.svg" width="100%" alt="Architecture"/></h2>

<p align="center"><img src="docs/px3/bar-code.svg" width="100%" alt="code code"/></p>

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

<a id="tech-stack"></a>
<h2><img src="docs/px3/h2-tech-stack.svg" width="100%" alt="Tech Stack"/></h2>

<p align="center"><img src="docs/px3/t-01.svg" width="100%" alt="Layer | Tech Frontend | React + Vite + Tailwind CSS Backend | FastAPI + Python 3.11 Vector DB | ChromaDB Graph DB | Neo4j 5.15 LLM | Groq llama-3.1-8b-instant Audio | Groq whisper-large-v3 Text Embed | sentence-transformers/all-MiniLM-L6-v2 Image Embed | openai/clip-vit-base-patch32 Video | ffmpeg -&gt; audio extraction"/></p>

<a id="pipeline"></a>
<h2><img src="docs/px3/h2-pipeline.svg" width="100%" alt="Pipeline"/></h2>

<p align="center"><img src="docs/px3/t-02.svg" width="100%" alt="Upload -&gt; file type detected -&gt; modality-specific processing Text (PDF/TXT/MD) -&gt; PyMuPDF -&gt; chunked -&gt; MiniLM embeddings -&gt; ChromaDB Image -&gt; CLIP embeddings -&gt; ChromaDB image collection Audio -&gt; Groq Whisper -&gt; transcript -&gt; MiniLM embeddings -&gt; ChromaDB Video -&gt; ffmpeg -&gt; audio -&gt; Groq Whisper -&gt; same as audio Entity Extraction -&gt; Groq LLM -&gt; entities + relationships -&gt; Neo4j Query -&gt; embed -&gt; vector search + graph traversal -&gt; Groq LLM -&gt; streamed response"/></p>

<a id="quick-start"></a>
<h2><img src="docs/px3/h2-quick-start.svg" width="100%" alt="Quick Start"/></h2>

<a id="prerequisites"></a>
<h3><img src="docs/px3/h3-prerequisites.svg" width="100%" alt="Prerequisites"/></h3>

<p align="center"><img src="docs/px3/t-03.svg" width="100%" alt="Docker + Docker Compose Groq API key (free at console.groq.com)"/></p>

<p align="center"><a href="https://console.groq.com"><img src="docs/px3/link-01.svg" height="34" alt="console.groq.com"/></a></p>

<a id="setup"></a>
<h3><img src="docs/px3/h3-setup.svg" width="100%" alt="Setup"/></h3>

<p align="center"><img src="docs/px3/bar-bash.svg" width="100%" alt="bash code"/></p>

```bash
# Clone and enter project
git clone https://github.com/thanmaiashok/multimodal-graph-rag--datamesh.git
cd multimodal-graph-rag--datamesh

# Copy env and add your Groq key
cp .env.example .env
# Edit .env: set GROQ_API_KEY=gsk_...

# Build and start all services
docker compose up --build

# Services start order: chromadb → neo4j → backend → frontend
# Wait ~2 minutes for first build (downloads ML models)
```

<a id="access"></a>
<h3><img src="docs/px3/h3-access.svg" width="100%" alt="Access"/></h3>

<p align="center"><img src="docs/px3/t-04.svg" width="100%" alt="Service | URL Frontend | http://localhost:3000 Backend API | http://localhost:8000 API Docs | http://localhost:8000/docs Neo4j Browser | http://localhost:7474 ChromaDB | http://localhost:8001"/></p>

<a id="api-reference"></a>
<h2><img src="docs/px3/h2-api-reference.svg" width="100%" alt="API Reference"/></h2>

<a id="post-apiupload"></a>
<h3><img src="docs/px3/h3-post-api-upload.svg" width="100%" alt="POST /api/upload"/></h3>

<p align="center"><img src="docs/px3/t-05.svg" width="100%" alt="Upload a file for processing."/></p>

<p align="center"><img src="docs/px3/bar-bash.svg" width="100%" alt="bash code"/></p>

```bash
curl -X POST http://localhost:8000/api/upload \
  -F "file=@document.pdf"
```

<p align="center"><img src="docs/px3/t-06.svg" width="100%" alt="Response:"/></p>

<p align="center"><img src="docs/px3/bar-json.svg" width="100%" alt="json code"/></p>

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

<a id="post-apichat"></a>
<h3><img src="docs/px3/h3-post-api-chat.svg" width="100%" alt="POST /api/chat"/></h3>

<p align="center"><img src="docs/px3/t-07.svg" width="100%" alt="Send a query (SSE streaming response)."/></p>

<p align="center"><img src="docs/px3/bar-bash.svg" width="100%" alt="bash code"/></p>

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the key concepts?", "modality": "text", "history": []}'
```

<a id="get-apigraph"></a>
<h3><img src="docs/px3/h3-get-api-graph.svg" width="100%" alt="GET /api/graph"/></h3>

<p align="center"><img src="docs/px3/t-08.svg" width="100%" alt="Get knowledge graph nodes and edges."/></p>

<p align="center"><img src="docs/px3/bar-bash.svg" width="100%" alt="bash code"/></p>

```bash
curl http://localhost:8000/api/graph
```

<a id="local-development-without-docker"></a>
<h2><img src="docs/px3/h2-local-development-without-docker.svg" width="100%" alt="Local Development (without Docker)"/></h2>

<p align="center"><img src="docs/px3/bar-bash.svg" width="100%" alt="bash code"/></p>

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

<a id="environment-variables"></a>
<h2><img src="docs/px3/h2-environment-variables.svg" width="100%" alt="Environment Variables"/></h2>

<p align="center"><img src="docs/px3/t-09.svg" width="100%" alt="Variable | Default | Description GROQ_API_KEY | required | Groq API key NEO4J_URI | bolt://neo4j:7687 | Neo4j connection NEO4J_USER | neo4j | Neo4j username NEO4J_PASSWORD | password123 | Neo4j password CHROMADB_HOST | chromadb | ChromaDB host CHROMADB_PORT | 8000 | ChromaDB port"/></p>

<a id="features"></a>
<h2><img src="docs/px3/h2-features.svg" width="100%" alt="Features"/></h2>

<p align="center"><img src="docs/px3/t-10.svg" width="100%" alt="Multi-modal upload: PDF, TXT, MD, JPG, PNG, GIF, WEBP, MP3, WAV, M4A, MP4, MOV, AVI Streaming chat responses (SSE) Source citations with relevance scores Interactive knowledge graph visualization (force-directed) Hybrid retrieval: vector similarity + graph traversal Conversation history (last 6 turns) Cross-modal search (text query -&gt; image results)"/></p>

<p align="center"><a href="https://github.com/thanmaiashok"><img src="docs/px3/footer.svg" width="100%" alt="Built by Thanmai A, founder of FoxynAI"/></a></p>
