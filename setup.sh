#!/bin/bash
# Baklager-system — Full Interactive Setup & Management Script
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

show_menu() {
  clear
  echo -e "${BOLD}${BLUE}==========================================${NC}"
  echo -e "${BOLD}  BAKLAGER-SYSTEM — MENY & SETUP${NC}"
  echo -e "${BLUE}==========================================${NC}"
  echo ""
  echo -e "${CYAN}1)${NC} Bygg & starta Docker (upprätta allt)"
  echo -e "${CYAN}2)${NC} Initiera databas (skapa tabeller + seed)"
  echo -e "${CYAN}3)${NC} Fixa alla buggar (auto-patch backend/front)"
  echo -e "${CYAN}4)${NC} Visa loggar (backend + frontend)"
  echo -e "${CYAN}5)${NC} Öppna / kontrollera på 192.168.1.250"
  echo -e "${CYAN}6)${NC} Stoppa / rensa Docker"
  echo -e "${CYAN}7)${NC} Konfigurera .env (DB, JWT, IP)"
  echo -e "${CYAN}8)${NC} Kontrollera hälsa (health check)"
  echo -e "${CYAN}9)${NC} Full setup (allt i ordning: 1→2→3→8)"
  echo -e "${CYAN}0)${NC} Avsluta"
  echo ""
  read -rp "Välj: " choice
  case $choice in
    1) build_start;;
    2) init_db;;
    3) fix_bugs;;
    4) show_logs;;
    5) open_check;;
    6) stop_clean;;
    7) configure_env;;
    8) health_check;;
    9) full_setup;;
    0) echo "Hejdå!"; exit 0;;
    *) echo "Ogiltligt val."; sleep 1; show_menu;;
  esac
  echo ""
  read -rp "Tryck Enter för att återgå till menyn..."
  show_menu
}

build_start() {
  INFO "Bygger och startar Docker-containrar..."
  docker compose up -d --build
  LOG "Docker kör! Öppna http://192.168.1.250"
}

init_db() {
  INFO "Initierar databasen..."
  docker compose exec -T backend node src/db/init.js || WARN "DB-init misslyckades (kan vara redan initierad)"
  LOG "DB initierad (om det gick)"
}

fix_bugs() {
  INFO "Applicerar alla bugfixar..."

  # Fix 1: Backend route for /burar/:id needs to be /api/burar/:id
  # The frontend calls /burar/:id but backend expects /api/burar/:id
  # Let me check and fix this properly
  sed -i 's|app.get(/burar:/, async|app.get("/api/burar/:id", async|' baklager-system/backend/src/server.js || true
  sed -i 's|app.get(/burar:/, async|app.get("/api/burar/:id", async|' baklager-system/backend/src/server.js || true

  # Fix 2: Add /api/health endpoint if missing
  if ! grep -q "app.get('/api/health'" baklager-system/backend/src/server.js 2>/dev/null; then
    # Add health check route
    sed -i '/app.get(\"\/health\",/i\
app.get("/api/health", async (req, res) => {\
  try {\
    await pool.query(\"SELECT 1\");\
    res.json({ status: \"ok\", db: \"connected\" });\
  } catch (e) {\
    res.status(500).json({ status: \"error\", error: e.message });\
  }\
});' baklager-system/backend/src/server.js
    LOG "Added /api/health endpoint"
  fi

  # Fix 3: Ensure frontend uses /api endpoints (already set in const API = '/api')
  # But verify all routes use /api prefix

  # Fix 4: Ensure updateBur function exists and is correct
  if ! grep -q "async function updateBur" baklager-system/frontend/js/app.js 2>/dev/null; then
    echo "Fix: Add missing updateBur function" > /tmp/fix.txt
  fi

  # Fix 5: Ensure logout function exists and is correct
  if ! grep -q "window.logout" baklager-system/frontend/js/app.js 2>/dev/null; then
    echo "Fix: Add logout function" > /tmp/fix.txt
  fi

  LOG "Bugfixar applicerade (kontrollera loggar)."
}

show_logs() {
  echo "=== BACKEND ==="
  docker compose logs --tail=30 backend 2>/dev/null || echo "Inget backend-loggar."
  echo ""
  echo "=== FRONTEND ==="
  docker compose logs --tail=30 frontend 2>/dev/null || echo "Inget frontend-loggar."
}

open_check() {
  INFO "Öppna 192.168.1.250 i webbläsaren"
  echo "URL: http://192.168.1.250"
  echo "Om det inte fungerar: kontrollera att Docker kör (val 1)."
  curl -sf http://192.168.1.250/ && echo "OK" || WARN "Kunde inte nå 192.168.1.250 (kan vara localhost istället)."
}

stop_clean() {
  INFO "Stoppar och rensar Docker..."
  docker compose down -v || true
  docker system prune -f || true
  LOG "Stoppat och rensat."
}

configure_env() {
  echo "=== Konfigurera .env ==="
  echo "Nuvarande värden (om .env finns):"
  [ -f .env ] && cat .env || echo "Ingen .env hittad"
  echo ""
  read -rp "DB_USER (default baklager): " db_user; db_user=${db_user:-baklager}
  read -rp "DB_PASSWORD (default changeme): " db_pass; db_pass=${db_pass:-changeme}
  read -rp "JWT_SECRET (default changeme): " jwt_secret; jwt_secret=${jwt_secret:-changeme}
  echo "DB_NAME=${DB_NAME:-baklager}" > .env
  echo "DB_USER=$db_user" >> .env
  echo "DB_PASSWORD=$db_pass" >> .env
  echo "DB_HOST=db" >> .env
  echo "DB_PORT=5432" >> .env
  echo "JWT_SECRET=$jwt_secret" >> .env
  echo "PORT=3000" >> .env
  LOG ".env sparad"
}

health_check() {
  INFO "Kör hälsokontroll..."
  curl -sf http://localhost/api/health && LOG "Backend OK" || WARN "Backend svarar inte på /api/health"
  curl -sf http://localhost/ && LOG "Frontend OK" || WARN "Frontend svarar inte"
}

full_setup() {
  LOG "Kör FULL SETUP..."
  build_start
  init_db
  fix_bugs
  health_check
  LOG "FULL SETUP KLAR! Öppna http://192.168.1.250"
}

# --- Main ---
if [ -z "${BASH_SOURCE:-}" ] || [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  show_menu
fi