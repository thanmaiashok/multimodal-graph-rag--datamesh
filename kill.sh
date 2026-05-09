#!/bin/bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

usage() {
  echo -e "Usage: ${BOLD}./kill.sh${NC} [--volumes] [--hard]"
  echo ""
  echo "  (no flags)   Stop containers, keep volumes (data preserved)"
  echo "  --volumes    Stop containers AND delete all data volumes"
  echo "  --hard       Force remove containers, networks, orphans"
  echo ""
}

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  usage; exit 0
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   MultiModal Graph RAG  •  Stop      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

DELETE_VOLUMES=false
HARD=false

for arg in "$@"; do
  case $arg in
    --volumes) DELETE_VOLUMES=true ;;
    --hard)    HARD=true ;;
  esac
done

if $DELETE_VOLUMES; then
  echo -e "${RED}WARNING: This will permanently delete all ChromaDB and Neo4j data.${NC}"
  read -r -p "Are you sure? (yes/no): " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."; exit 0
  fi
fi

if $HARD; then
  echo -e "${YELLOW}Hard stop: removing containers, networks, orphans...${NC}"
  docker compose down --remove-orphans
elif $DELETE_VOLUMES; then
  echo -e "${YELLOW}Stopping and removing volumes...${NC}"
  docker compose down -v --remove-orphans
else
  echo -e "${CYAN}Stopping containers (data volumes preserved)...${NC}"
  docker compose down --remove-orphans
fi

echo ""
echo -e "${GREEN}Done.${NC}"
if ! $DELETE_VOLUMES; then
  echo -e "  Data preserved in Docker volumes."
  echo -e "  To delete all data: ${YELLOW}./kill.sh --volumes${NC}"
fi
echo ""
