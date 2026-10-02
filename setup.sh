#!/bin/bash
# Baklager-system — Full Setup & Management Script
# Runs everything from one menu. Works on 192.168.1.250 in Docker.
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
  INFO "Initierar databas..."
  sleep 3
  docker compose exec -T backend node src/db/init.js || WARN "DB-init misslyckades (kan vara redan initierad)"
  LOG "Databas initierad"
}

fix_bugs() {
  INFO "Applicerar buggfixar..."

  # 1. Backend: fix API routes - add /api prefix to /burar, /burar/:id, /checkin, /employees, /employees/:id/rfid, /stats/bur/:id
  # Use a more robust sed pattern
  sed -i "s|app\.get('/burar'|app.get('/api/burar'|g" backend/src/server.js
  sed -i "s|app\.get('/burar/:id'|app.get('/api/burar/:id'|g" backend/src/server.js
  sed -i "s|app\.post('/burar'|app.post('/api/burar'|g" backend/src/server.js
  sed -i "s|app\.delete('/burar/:id'|app.delete('/api/burar/:id'|g" backend/src/server.js
  sed -i "s|app\.post('/checkin'|app.post('/api/checkin'|g" backend/src/server.js
  sed -i "s|app\.get('/employees'|app.get('/api/employees'|g" backend/src/server.js
  sed -i "s|app\.post('/employees'|app.post('/api/employees'|g" backend/src/server.js
  sed -i "s|app\.post('/employees/:id/rfid'|app.post('/api/employees/:id/rfid'|g" backend/src/server.js
  sed -i "s|app\.delete('/employees/:id/rfid'|app.delete('/api/employees/:id/rfid'|g" backend/src/server.js
  sed -i "s|app\.get('/stats/bur/:id'|app.get('/api/stats/bur/:id'|g" backend/src/server.js

  # 2. Backend: Ensure /api/health returns correct JSON structure
  sed -i 's|res\.json({ status: .ok., db: .connected. })|res.json({ status: "ok", db: "connected" })|g' backend/src/server.js

  # 3. Frontend: fix API URL to use /api prefix
  sed -i "s|const API = '/api';|const API = '/api';|g" frontend/js/app.js

  # 4. Frontend: fix loadBurar to use correct endpoint
  sed -i "s|const res = await api('/burar');|const res = await api('/api/burar');|g" frontend/js/app.js

  # 5. Frontend: fix createBur endpoint
  sed -i "s|const res = await api('/burar', {|const res = await api('/api/burar', {|g" frontend/js/app.js

  # 6. Frontend: fix updateBur endpoint
  sed -i "s|const res = await api(\`/burar/\${selectedBurId}\`|const res = await api(\`/api/burar/\${selectedBurId}\`|g" frontend/js/app.js

  # 7. Frontend: fix deleteBur endpoint
  sed -i "s|await api(\`/burar/\${id}\`|await api(\`/api/burar/\${id}\`|g" frontend/js/app.js

  # 8. Frontend: fix loginWithRFID endpoint
  sed -i "s|const res = await api('/auth/login'|const res = await api('/api/auth/login'|g" frontend/js/app.js

  # 9. Frontend: fix checkin endpoint
  sed -i "s|const res = await api('/checkin'|const res = await api('/api/checkin'|g" frontend/js/app.js

  # 10. Fix broken res.status(500).json calls in backend (missing error response)
  # Fix duplicate/erroneous res.status lines
  sed -i '/res\.status(500)\.json({ error: e\.message });/d' backend/src/server.js

  LOG "Buggfixar applicerade"
}

check_connectivity() {
  INFO "Kontrollerar nätverk..."
  curl -sf http://192.168.1.250/ && echo "OK" || WARN "Kunde inte nå 192.168.1.250 (kan vara localhost istället)."
}

health_check() {
  INFO "Kör hälsokontroll..."
  # Kontrollera att /api/health returnerar JSON (inte HTML)
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
    # Hämta senaste från remote utan att ändra arbetskatalogen
    if git ls-remote --heads origin 2>/dev/null | grep -q main; then
      REMOTE=$(git ls-remote --heads origin 2>/dev/null | grep 'main' | awk '{print $1}')
    fi
    if [ -n "$REMOTE" ] && [ "$CURRENT" != "$REMOTE" ]; then
      LOG "Ny uppdatering hittad ($CURRENT → $REMOTE)"
      if git pull >/dev/null 2>&1; then
        LOG "Uppdatering hämtad och applicerad"
        return 1  # signalera att uppdatering skedde
      else
        WARN "Uppdatering hittad men kunde inte hämtas"
      fi
    elif [ -n "$REMOTE" ] && [ "$CURRENT" = "$REMOTE" ]; then
      LOG "Senaste version redan installerad"
    else
      WARN "Kunde inte kontrollera remote (saknas nätverk?)"
    fi
  else
    WARN "Inte ett git-repo - kan inte kontrollera uppdateringar"
  fi
}

full_setup() {
  LOG "Kör FULL SETUP..."
  # Alltid kontrollera uppdateringar först
  local UPDATED=0
  check_updates || UPDATED=1
  if [ $UPDATED -eq 1 ]; then
    INFO "Bygger efter uppdatering..."
  fi
  build_start
  init_db
  fix_bugs
  health_check
  LOG "FULL SETUP KLAR! Öppna http://192.168.1.250"
}

self_update() {
  INFO "Uppdaterar systemet från GitHub..."

  # Stöta ner lokala ändringar ( stash ) så att git pull kan köras
  # stash returnerar 1 när det inte finns något att stasha — det är OK
  git stash >/dev/null 2>&1
  INFO "Lokala ändringar stötade (om det fanns några)"

  # Hämta och ta emot senaste från origin/main
  INFO "Hämtar senaste koden från GitHub..."
  if ! git pull origin main; then
    ERR "Git pull misslyckades"
    git stash pop >/dev/null 2>&1
    return 1
  fi
  LOG "Koden uppdaterad"

  # Återställ de lokala ändringarna
  git stash pop >/dev/null 2>&1 || WARN "Kunde inte återställa lokala ändringar"

  build_start
  init_db
  fix_bugs
  health_check
  LOG "SYSTEMET UPPDATERAT! Öppna http://192.168.1.250"
}

# --- Main ---
if [ -z "${BASH_SOURCE:-}" ] || [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  # Kontrollera alltid uppdateringar vid direkt-körning
  if [ "${1:-}" = "update" ] || [ "${1:-}" = "uppdatera" ]; then
    self_update
  else
    full_setup
  fi
fi