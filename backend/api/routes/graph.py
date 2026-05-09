from fastapi import APIRouter

from models.schemas import GraphEdge, GraphNode, GraphResponse
from services.graph_store import get_full_graph

router = APIRouter()


@router.get("/graph", response_model=GraphResponse)
async def get_graph():
    data = await get_full_graph()
    return GraphResponse(
        nodes=[
            GraphNode(id=n["id"], label=n["label"], type=n["type"])
            for n in data["nodes"]
        ],
        edges=[
            GraphEdge(source=e["source"], target=e["target"], relationship=e["relationship"])
            for e in data["edges"]
        ],
    )
