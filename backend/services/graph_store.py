import asyncio
import json
import re
from typing import Optional

from groq import Groq
from neo4j import AsyncGraphDatabase, AsyncDriver

from config import settings

_driver: Optional[AsyncDriver] = None
groq_client = Groq(api_key=settings.GROQ_API_KEY)


async def init_neo4j():
    global _driver
    _driver = AsyncGraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
    )
    async with _driver.session() as session:
        await session.run(
            "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE"
        )


async def close_neo4j():
    global _driver
    if _driver:
        await _driver.close()
        _driver = None


async def _extract_entities_llm(text: str) -> dict:
    prompt = f"""Extract entities and relationships from this text. Return valid JSON only, no explanation.

Text: {text[:2000]}

Required format:
{{
  "entities": [
    {{"id": "e1", "name": "entity name", "type": "PERSON|ORGANIZATION|CONCEPT|LOCATION|EVENT|TECHNOLOGY"}}
  ],
  "relationships": [
    {{"source": "e1", "target": "e2", "type": "RELATIONSHIP_TYPE"}}
  ]
}}"""

    response = await asyncio.to_thread(
        groq_client.chat.completions.create,
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=1200,
    )
    if not response.choices:
        return {"entities": [], "relationships": []}
    content = response.choices[0].message.content or ""
    json_match = re.search(r"\{[\s\S]*\}", content)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    return {"entities": [], "relationships": []}


def _split_text_for_extraction(text: str, chunk_size: int = 2000, overlap: int = 200) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


_groq_semaphore = asyncio.Semaphore(3)  # max 3 concurrent Groq calls


async def _extract_entities_llm_limited(text: str) -> dict:
    async with _groq_semaphore:
        return await _extract_entities_llm(text)


async def extract_and_store_entities(text: str, file_id: str) -> int:
    if not _driver:
        return 0
    try:
        chunks = _split_text_for_extraction(text)
        capped = chunks[:10]  # cap at 10 chunks ~20k chars

        results = await asyncio.gather(
            *[_extract_entities_llm_limited(chunk) for chunk in capped],
            return_exceptions=True,
        )

        all_entities: list[dict] = []
        all_relationships: list[dict] = []
        seen_names: set[str] = set()

        for i, data in enumerate(results):
            if isinstance(data, Exception):
                print(f"Entity extraction chunk {i} failed: {data}")
                continue
            for e in data.get("entities", []):
                name = e.get("name", "").strip().lower()
                if name and name not in seen_names:
                    seen_names.add(name)
                    e["id"] = f"c{i}_{e.get('id', 'e0')}"
                    all_entities.append(e)
            for r in data.get("relationships", []):
                r2 = dict(r)
                r2["source"] = f"c{i}_{r2.get('source', '')}"
                r2["target"] = f"c{i}_{r2.get('target', '')}"
                all_relationships.append(r2)

        entities = all_entities
        relationships = all_relationships

        async with _driver.session() as session:
            for entity in entities:
                eid = entity.get("id") or entity.get("name", "unknown")
                ename = entity.get("name", "")
                etype = entity.get("type", "CONCEPT")
                if not ename:
                    continue
                await session.run(
                    """
                    MERGE (e:Entity {id: $id})
                    SET e.name = $name, e.type = $type, e.file_id = $file_id
                    """,
                    id=f"{file_id}_{eid}",
                    name=ename,
                    type=etype,
                    file_id=file_id,
                )
            for rel in relationships:
                src = rel.get("source") or rel.get("from")
                tgt = rel.get("target") or rel.get("to")
                rtype = rel.get("type") or rel.get("relationship", "RELATED_TO")
                if not src or not tgt:
                    continue
                src_id = f"{file_id}_{src}"
                tgt_id = f"{file_id}_{tgt}"
                rel_type = re.sub(r"[^A-Z0-9_]", "_", rtype.upper())
                if rel_type and rel_type[0].isdigit():
                    rel_type = "R_" + rel_type
                try:
                    await session.run(
                        f"""
                        MATCH (a:Entity {{id: $src_id}})
                        MATCH (b:Entity {{id: $tgt_id}})
                        MERGE (a)-[r:{rel_type}]->(b)
                        """,
                        src_id=src_id,
                        tgt_id=tgt_id,
                    )
                except Exception:
                    pass

        return len(entities)
    except Exception as e:
        print(f"Entity extraction error: {e}")
        return 0


async def delete_file_entities(file_id: str) -> dict:
    """
    Delete all entities for file_id.
    Before deleting, collect the surviving neighbors of those entities
    so we can attempt graph reconnection.
    Returns {"deleted": int, "neighbor_pairs": list of (a_id, b_id, a_name, b_name)}
    """
    if not _driver:
        return {"deleted": 0, "neighbor_pairs": []}

    async with _driver.session() as session:
        # Find entities to delete and their cross-file neighbors
        result = await session.run(
            """
            MATCH (e:Entity {file_id: $file_id})
            OPTIONAL MATCH (e)-[r]-(neighbor:Entity)
            WHERE neighbor.file_id <> $file_id
            RETURN e.id AS eid,
                   collect(DISTINCT {id: neighbor.id, name: neighbor.name}) AS neighbors
            """,
            file_id=file_id,
        )
        records = await result.data()

        # Collect all surviving neighbor pairs that were bridged by the deleted entities
        neighbor_sets: list[list[dict]] = [r["neighbors"] for r in records if r["neighbors"]]
        neighbor_pairs: list[tuple] = []
        for neighbors in neighbor_sets:
            alive = [n for n in neighbors if n["id"] and n["name"]]
            for i in range(len(alive)):
                for j in range(i + 1, len(alive)):
                    neighbor_pairs.append(
                        (alive[i]["id"], alive[j]["id"], alive[i]["name"], alive[j]["name"])
                    )

        # Delete entities and all their relationships
        del_result = await session.run(
            "MATCH (e:Entity {file_id: $file_id}) DETACH DELETE e RETURN count(e) AS n",
            file_id=file_id,
        )
        del_data = await del_result.data()
        deleted = del_data[0]["n"] if del_data else 0

    return {"deleted": deleted, "neighbor_pairs": neighbor_pairs}


async def reconnect_graph(neighbor_pairs: list[tuple]) -> int:
    """
    For pairs of entities that were connected through a now-deleted middle entity,
    ask the LLM if a direct relationship makes sense and create it if yes.
    Returns number of new edges created.
    """
    if not _driver or not neighbor_pairs:
        return 0

    # Deduplicate pairs
    seen = set()
    unique_pairs = []
    for pair in neighbor_pairs:
        key = tuple(sorted([pair[0], pair[1]]))
        if key not in seen:
            seen.add(key)
            unique_pairs.append(pair)

    if not unique_pairs:
        return 0

    # Ask LLM to decide which pairs deserve a direct edge
    pair_text = "\n".join(
        [f"{i+1}. '{a_name}' <-> '{b_name}'" for i, (_, _, a_name, b_name) in enumerate(unique_pairs[:15])]
    )
    prompt = f"""These entity pairs were previously connected through a middle entity that was just removed.
For each pair, decide if a direct relationship exists between them.
Return JSON only.

Pairs:
{pair_text}

Return:
{{
  "connections": [
    {{"pair_index": 1, "should_connect": true, "relationship": "RELATED_TO"}}
  ]
}}

Only include pairs where should_connect is true."""

    try:
        response = await asyncio.to_thread(
            groq_client.chat.completions.create,
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=600,
        )
        if not response.choices:
            return 0
        content = response.choices[0].message.content or ""
        json_match = re.search(r"\{[\s\S]*\}", content)
        if not json_match:
            return 0
        try:
            decisions = json.loads(json_match.group()).get("connections", [])
        except json.JSONDecodeError:
            return 0
    except Exception as e:
        print(f"Reconnect LLM error: {e}")
        return 0

    created = 0
    async with _driver.session() as session:
        for dec in decisions:
            if not dec.get("should_connect"):
                continue
            idx = dec.get("pair_index", 0) - 1
            if idx < 0 or idx >= len(unique_pairs):
                continue
            a_id, b_id, _, _ = unique_pairs[idx]
            rel_type = re.sub(r"[^A-Z0-9_]", "_", dec.get("relationship", "RELATED_TO").upper())
            try:
                await session.run(
                    f"""
                    MATCH (a:Entity {{id: $a_id}})
                    MATCH (b:Entity {{id: $b_id}})
                    MERGE (a)-[r:{rel_type}]->(b)
                    SET r.auto_reconnected = true
                    """,
                    a_id=a_id,
                    b_id=b_id,
                )
                created += 1
            except Exception:
                pass

    print(f"Graph reconnect: created {created} new edges from {len(unique_pairs)} candidate pairs")
    return created


async def get_graph_context(query_keywords: list[str]) -> str:
    if not _driver or not query_keywords:
        return ""
    async with _driver.session() as session:
        result = await session.run(
            """
            MATCH (e:Entity)
            WHERE any(kw IN $keywords WHERE toLower(e.name) CONTAINS toLower(kw))
            OPTIONAL MATCH (e)-[r]-(related:Entity)
            RETURN e.name AS entity, e.type AS type,
                   collect(DISTINCT {rel: type(r), target: related.name}) AS connections
            LIMIT 20
            """,
            keywords=query_keywords,
        )
        records = await result.data()
        parts = []
        seen_entities: set[str] = set()
        for record in records:
            name = record["entity"]
            if name in seen_entities:
                continue
            seen_entities.add(name)
            connections = [
                f"{c['rel']} → {c['target']}"
                for c in record["connections"]
                if c["target"]
            ]
            if connections:
                parts.append(
                    f"{name} ({record['type']}): {', '.join(connections[:5])}"
                )
        return "\n".join(parts)


async def get_full_graph() -> dict:
    if not _driver:
        return {"nodes": [], "edges": []}
    async with _driver.session() as session:
        result = await session.run(
            """
            MATCH (e:Entity)
            OPTIONAL MATCH (e)-[r]->(related:Entity)
            RETURN e.id AS id, e.name AS name, e.type AS type,
                   collect(DISTINCT {source: e.id, target: related.id, rel: type(r)}) AS rels
            LIMIT 150
            """
        )
        records = await result.data()
        nodes, edges, seen = [], [], set()
        for record in records:
            nodes.append({"id": record["id"], "label": record["name"], "type": record["type"]})
            for rel in record["rels"]:
                if rel["target"] and rel["rel"]:
                    key = f"{rel['source']}-{rel['target']}"
                    if key not in seen:
                        edges.append(
                            {
                                "source": rel["source"],
                                "target": rel["target"],
                                "relationship": rel["rel"],
                            }
                        )
                        seen.add(key)
        return {"nodes": nodes, "edges": edges}
