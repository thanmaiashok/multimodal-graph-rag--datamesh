#!/bin/bash
# Downloads sample files for ALL modalities to test datamesh GraphRAG

DIR="$(dirname "$0")/samples"
mkdir -p "$DIR"

OK="✓"; FAIL="✗"
pass=0; fail=0

dl() {
  local label="$1" url="$2" out="$3"
  printf "%-40s " "$label"
  if curl -L --silent --show-error --max-time 30 -o "$out" "$url" 2>/dev/null && [ -s "$out" ]; then
    size=$(du -h "$out" | cut -f1)
    echo "$OK  $size"
    ((pass++))
  else
    echo "$FAIL  unreachable"
    rm -f "$out"
    ((fail++))
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " datamesh GraphRAG — Sample File Downloader"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── TEXT (write locally, no download needed) ──────────────────────────────
echo ""
echo "[ TEXT — written locally ]"

cat > "$DIR/ai_overview.txt" << 'EOF'
Artificial Intelligence Overview
=================================
AI is the simulation of human intelligence in machines. Key domains:

MACHINE LEARNING
Supervised, Unsupervised, Reinforcement, Semi-supervised learning.
Key algorithms: Linear Regression, Decision Trees, SVM, Neural Networks.

DEEP LEARNING
Neural networks with multiple hidden layers. Used for:
- Image recognition (CNN)
- Language modeling (Transformers)
- Speech synthesis (WaveNet)

LARGE LANGUAGE MODELS (LLMs)
GPT-4, Claude, Llama 3, Mistral — transformer-based models trained on trillions of tokens.
Applications: code generation, question answering, summarization, translation.

RETRIEVAL AUGMENTED GENERATION (RAG)
Combines LLMs with vector search:
1. Index documents as embeddings in a vector database
2. Retrieve relevant chunks on query
3. Feed context to LLM to generate grounded answers
Reduces hallucinations, keeps knowledge current.

KNOWLEDGE GRAPHS
Entities and relationships stored as graph data.
Neo4j: MATCH (a:Person)-[:WORKS_AT]->(b:Company) RETURN a, b
Graph RAG augments vector retrieval with relationship traversal for richer context.

VECTOR DATABASES
ChromaDB, Pinecone, Qdrant, Weaviate, FAISS.
Store high-dimensional embeddings for approximate nearest neighbor search.

KEY COMPANIES
OpenAI (GPT-4, Whisper, DALL-E), Anthropic (Claude), Google DeepMind (Gemini),
Meta AI (Llama), Mistral AI, Groq (fast inference hardware).
EOF
echo "ai_overview.txt                          $OK  written"

cat > "$DIR/cybersecurity.txt" << 'EOF'
Cybersecurity Intelligence Reference
======================================
THREAT TYPES
Ransomware: encrypts data, demands payment. Groups: LockBit, ALPHV, Cl0p.
APT (Advanced Persistent Threat): nation-state actors with long dwell times.
Phishing: 36% of all breaches (Verizon DBIR 2023).
Supply Chain: SolarWinds 2020, Log4Shell 2021, MOVEit 2023.

ATTACK FRAMEWORKS
MITRE ATT&CK: Tactics, Techniques, Procedures (TTPs) knowledge base.
Cyber Kill Chain: Reconnaissance, Weaponization, Delivery, Exploitation, Installation, C2, Actions.

OWASP TOP 10 (2021)
1. Broken Access Control
2. Cryptographic Failures
3. Injection (SQL, NoSQL, OS)
4. Insecure Design
5. Security Misconfiguration
6. Vulnerable Components
7. Auth Failures
8. Data Integrity Failures
9. Logging & Monitoring Failures
10. SSRF

DEFENSE TOOLS
SIEM: Splunk, Microsoft Sentinel, IBM QRadar.
EDR: CrowdStrike, SentinelOne, Microsoft Defender.
Zero Trust: never trust, always verify, least privilege, micro-segmentation.

AI IN SECURITY
Anomaly detection, malware classification, UBA (User Behavior Analytics),
phishing URL detection, SOAR (Security Orchestration Automation Response).
EOF
echo "cybersecurity.txt                        $OK  written"

cat > "$DIR/graph_rag_research.md" << 'EOF'
# Graph RAG: Architecture & Research Notes

## What is Graph RAG?
Combines vector similarity search with knowledge graph traversal.
Traditional RAG misses relational context — Graph RAG fixes this.

## Pipeline
```
File → Parser → Chunker → Embedder → ChromaDB (vector store)
                        ↓
               Entity Extractor → Neo4j (knowledge graph)

Query → Embed → Vector Search + Graph Traversal → LLM → Response
```

## Multi-Modal Support
| Modality | Model | Process |
|----------|-------|---------|
| Text/PDF | all-MiniLM-L6-v2 | chunk → embed |
| Image | CLIP ViT-B/32 | pixel → 512-dim vector |
| Audio | Groq Whisper | speech → transcript → embed |
| Video | ffmpeg + Whisper | extract audio → transcribe |

## Entity Types in Graph
PERSON, ORGANIZATION, CONCEPT, LOCATION, EVENT, TECHNOLOGY

## Graph Reconnection
When a file is deleted, surviving neighbor entities are analyzed by LLM.
Direct relationships are auto-created to maintain graph connectivity.

## Performance vs Vanilla RAG
- Multi-hop reasoning: +34% accuracy
- Entity-centric queries: +28% relevance
- Cross-document synthesis: +41% F1

## Tech Stack
FastAPI · ChromaDB · Neo4j · Groq · React · Docker
EOF
echo "graph_rag_research.md                    $OK  written"

# ── PDF ───────────────────────────────────────────────────────────────────
echo ""
echo "[ PDF ]"
dl "sample_document.pdf" \
   "https://www.africau.edu/images/default/sample.pdf" \
   "$DIR/sample_document.pdf"

dl "attention_paper.pdf" \
   "https://arxiv.org/pdf/1706.03762" \
   "$DIR/attention_is_all_you_need.pdf"

dl "bitcoin_whitepaper.pdf" \
   "https://bitcoin.org/bitcoin.pdf" \
   "$DIR/bitcoin_whitepaper.pdf"

# ── IMAGES ────────────────────────────────────────────────────────────────
echo ""
echo "[ IMAGES ]"
dl "earth_from_space.jpg" \
   "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/600px-The_Earth_seen_from_Apollo_17.jpg" \
   "$DIR/earth_from_space.jpg"

dl "neural_network_diagram.png" \
   "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Colored_neural_network.svg/400px-Colored_neural_network.svg.png" \
   "$DIR/neural_network.png"

dl "world_map.jpg" \
   "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/World_map_-_low_resolution.svg/800px-World_map_-_low_resolution.svg.png" \
   "$DIR/world_map.png"

dl "golden_gate.jpg" \
   "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/GoldenGateBridge-001.jpg/640px-GoldenGateBridge-001.jpg" \
   "$DIR/golden_gate.jpg"

# ── AUDIO ─────────────────────────────────────────────────────────────────
echo ""
echo "[ AUDIO ]"
dl "soundhelix_song1.mp3" \
   "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" \
   "$DIR/soundhelix_song1.mp3"

dl "soundhelix_song2.mp3" \
   "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" \
   "$DIR/soundhelix_song2.mp3"

dl "gettysburg_address.mp3" \
   "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d9/Gettysburg_Address_-_Recorded_by_Glengarry_Nightcaps%2C_January_2_1898.ogg/Gettysburg_Address_-_Recorded_by_Glengarry_Nightcaps%2C_January_2_1898.ogg.mp3" \
   "$DIR/gettysburg_address.mp3"

# ── VIDEO ─────────────────────────────────────────────────────────────────
echo ""
echo "[ VIDEO ]"
dl "big_buck_bunny_clip.mp4" \
   "https://download.blender.org/demo/movies/BBB/bbb_sunflower_480p_30fps_normal.mp4" \
   "$DIR/big_buck_bunny.mp4"

dl "tears_of_steel_clip.mp4" \
   "https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mkv" \
   "$DIR/tears_of_steel.mkv"

# ── SUMMARY ───────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Results: $pass succeeded · $fail failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "All files in ./samples/:"
ls -lh "$DIR" | awk 'NR>1 {printf "  %-40s %s\n", $9, $5}'
echo ""
echo "→ Upload at http://localhost:3000 (Upload Files tab)"
echo "→ Then chat: 'What is attention mechanism?'"
echo "            'Explain zero trust security'"
echo "            'What is Graph RAG?'"
