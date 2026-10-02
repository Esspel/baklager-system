#!/bin/bash
# Baklager-system — Full Setup & Management Script
# Runs everything from one menu. Works on 192.168.1.250 in Docker.
# PostgreSQL data persists in Docker volume 'baklager_db' on host machine
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

LOG() { echo -e "${GREEN}[✓]${NC} $1"; }
INFO() { echo -e "${YELLOW}[→]${NC} $1"; }
WARN() { echo -e "${YELLOW}[!]${NC} $1"; }
ERR() { echo -e "${RED}[✗]${NC} $1"; }

check_docker() {
  if ! command -v docker &>/dev/null; then
    ERR "Docker inte installerat"
    return 1
  fi
  if ! docker compose version &>/dev/null; then
    ERR "Docker Compose inte tillgängligt"
    return 1
  fi
  LOG "Docker OK"
}

build_start() {
  INFO "Bygger och startar containrar..."
  docker compose up --build -d
  LOG "Containrar startade"
}

init_db() {
  INFO "Initierar databas (körs en gång vid första setup)..."
  sleep 3
  docker compose exec -T backend node src/db/init.js || WARN "DB-init misslyckades (kan vara redan initierad)"
  LOG "Databas initierad"
}

check_connectivity() {
  INFO "Kontrollerar nätverk..."
  curl -sf http://192.168.1.250/ && echo "OK" || WARN "Kunde inte nå 192.168.1.250 (kan vara localhost istället)."
}

health_check() {
  INFO "Kör hälsokontroll..."
  local health_response=$(curl -sf http://localhost/api/health 2>/dev/null || echo "")
  if echo "$health_response" | grep -q '"status"'; then
    LOG "Backend OK ($health_response)"
  else
    WARN "Backend svarar inte på /api/health (fick: ${health_response:0:80})"
  fi
  curl -sf http://localhost/ > /dev/null 2>&1 && LOG "Frontend OK" || WARN "Frontend svarar inte"
}

check_updates() {
  INFO "Kontrollerar om det finns uppdateringar..."
  local CURRENT=""
  local REMOTE=""
  if git rev-parse HEAD >/dev/null 2>&1; then
    CURRENT=$(git rev-parse HEAD 2>/dev/null || echo "none")
    if git ls-remote --heads origin 2>/dev/null | grep -q main; then
      REMOTE=$(git ls-remote --heads origin 2>/dev/null | grep 'main' | awk '{print $1}')
    fi
    if [ -n "$REMOTE" ] && [ "$CURRENT" != "$REMOTE" ]; then
      LOG "Ny uppdatering hittad ($CURRENT → $REMOTE)"
      git stash >/dev/null 2>&1
      if ! git pull origin main; then
        ERR "Git pull misslyckades - kan inte fortsätta"
        return 1
      fi
      LOG "Koden uppdaterad"
    elif [ -n "$REMOTE" ] && [ "$CURRENT" = "$REMOTE" ]; then
      LOG "Senaste version redan installerad"
    else
      WARN "Kunde inte kontrollera remote (saknas nätverk?)"
    fi
  else
    WARN "Inte ett git-repo - kan inte kontrollera uppdateringar"
  fi
  return 0
}

full_setup() {
  LOG "Kör FULL SETUP..."
  check_updates || true
  build_start
  init_db
  health_check
  LOG "FULL SETUP KLAR! Öppna http://192.168.1.250"
}

self_update() {
  INFO "Uppdaterar systemet från GitHub..."

  # Stash lokala ändringar så git pull kan köras
  git stash >/dev/null 2>&1 || true
  INFO "Lokala ändringar stötade (om det fanns några)"

  # Hämta och ta emot senaste koden från GitHub
  INFO "Hämtar senaste koden från GitHub..."
  if ! git pull origin main; then
    ERR "Git pull misslyckades"
    git stash pop >/dev/null 2>&1
    return 1
  fi
  LOG "Koden uppdaterad"

  # Återställ de lokala ändringarna
  git stash pop >/dev/null 2>&1 || WARN "Kunde inte återställa lokala ändringar"

  # Bygg om containrar med ny kod (DB init körs INTE igen - datan är i volume)
  build_start
  health_check
  LOG "UPPdatering KLAR! Öppna http://192.168.1.250"
}

# --- Main ---
if [ -z "${BASH_SOURCE:-}" ] || [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if [ "${1:-}" = "update" ] || [ "${1:-}" = "uppdatera" ]; then
    self_update
  else
    full_setup
  fi
fi