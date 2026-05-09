from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import chat, files, graph, upload
from services.graph_store import init_neo4j, close_neo4j
from services.vector_store import init_chromadb


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_chromadb()
    try:
        await init_neo4j()
    except Exception as e:
        print(f"WARNING: Neo4j failed to initialize: {e}")
    yield
    await close_neo4j()


app = FastAPI(title="MultiModal Graph RAG", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(files.router, prefix="/api", tags=["files"])
app.include_router(graph.router, prefix="/api", tags=["graph"])


@app.get("/health")
async def health():
    return {"status": "ok"}
