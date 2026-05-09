#!/bin/bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }

check_docker() {
  if ! docker info &>/dev/null; then
    error "Docker is not running. Start Docker Desktop first."
    exit 1
  fi
}

check_env() {
  if [ ! -f .env ]; then
    error ".env file not found. Copy .env.example and fill in GROQ_API_KEY."
    exit 1
  fi
  if ! grep -q "GROQ_API_KEY=gsk_" .env 2>/dev/null; then
    warn "GROQ_API_KEY may be missing or invalid in .env"
  fi
}

wait_healthy() {
  local service=$1
  local max_wait=${2:-90}
  local elapsed=0
  info "Waiting for ${service} to be healthy..."
  while [ $elapsed -lt $max_wait ]; do
    status=$(docker compose ps --format json 2>/dev/null | \
      python3 -c "import sys,json; data=sys.stdin.read()
lines=[l for l in data.strip().split('\n') if l]
for l in lines:
  try:
    s=json.loads(l)
    if s.get('Service')=='${service}':
      print(s.get('Health','') or s.get('Status',''))
  except: pass" 2>/dev/null || echo "")

    if [[ "$status" == *"healthy"* ]]; then
      success "${service} is healthy"
      return 0
    fi
    if [[ "$status" == *"Exit"* ]] || [[ "$status" == *"exited"* ]]; then
      error "${service} exited unexpectedly"
      docker compose logs --tail=30 "$service"
      return 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
    printf "."
  done
  echo ""
  warn "${service} did not become healthy within ${max_wait}s"
  docker compose logs --tail=20 "$service"
  return 1
}

wait_backend() {
  local max_wait=60
  local elapsed=0
  info "Waiting for backend API..."
  while [ $elapsed -lt $max_wait ]; do
    if curl -sf http://localhost:8000/health &>/dev/null; then
      success "Backend API ready"
      return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
    printf "."
  done
  echo ""
  error "Backend did not start within ${max_wait}s"
  docker compose logs --tail=40 backend
  return 1
}

# ── Main ──────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   MultiModal Graph RAG  •  Start     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

check_docker
check_env

# Pull latest images for db services (skip if --no-pull)
if [[ "${1:-}" != "--no-pull" ]]; then
  info "Pulling base images..."
  docker compose pull chromadb neo4j 2>/dev/null || true
fi

info "Building and starting all services..."
docker compose up --build -d

echo ""
wait_healthy "neo4j" 120
wait_healthy "chromadb" 60
wait_backend

echo ""
echo -e "${BOLD}${GREEN}All services running!${NC}"
echo ""
echo -e "  ${CYAN}Frontend   ${NC}→  http://localhost:3000"
echo -e "  ${CYAN}Backend    ${NC}→  http://localhost:8000"
echo -e "  ${CYAN}API Docs   ${NC}→  http://localhost:8000/docs"
echo -e "  ${CYAN}Neo4j UI   ${NC}→  http://localhost:7474  (neo4j / password123)"
echo -e "  ${CYAN}ChromaDB   ${NC}→  http://localhost:8001"
echo ""
echo -e "  ${YELLOW}Logs${NC}  →  docker compose logs -f"
echo -e "  ${YELLOW}Stop${NC}  →  ./kill.sh"
echo ""
