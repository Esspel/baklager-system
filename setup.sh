#!/bin/bash
# Setup script för Baklager-system
# Körs med: curl -fsSL https://raw.githubusercontent.com/Esspel/baklager-system/main/setup.sh | bash
# Eller lokalt: bash setup.sh

set -euo pipefail

PROJECT_DIR="baklager-system"

echo "===== Baklager-system Setup ====="

# Kontrollera Docker
if ! command -v docker &> /dev/null; then
    echo "Docker hittades inte. Installera Docker först."
    exit 1
fi

# Kontrollera Docker-compose (plugin eller binary)
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Docker Compose hittades inte. Installera docker-compose."
    exit 1
fi

echo "[✓] Docker och Docker Compose hittades"

# Gå till projektkatalogen
if [ ! -f docker-compose.yml ]; then
    echo "[!] Kör setup från baklager-system-mappen eller klona repo först."
    echo "Användning: cd baklager-system && bash setup.sh"
    exit 1
fi

echo "[✓] Konfigurationsfil hittad"

# Bygg och starta containrar
if command -v docker-compose &> /dev/null; then
    echo "[→] Bygger och startar containrar med docker-compose..."
    docker-compose up --build -d
else
    echo "[→] Bygger och startar containrar med docker compose..."
    docker compose up --build -d
fi

# Vänta på att backend är redo
sleep 3
echo "[→] Väntar på att backend är redo..."
for i in {1..30}; do
    if curl -sf http://localhost/api/health > /dev/null 2>&1; then
        echo "[✓] Backend svarar på /api/health"
        break
    fi
    sleep 1
done

# Initiera databasen
if [ -f backend/src/db/init.js ]; then
    echo "[→] Initierar databasen..."
    docker compose exec -T backend node -e "
        import { Pool } from 'pg';
        const pool = new Pool({ host: 'db', port: 5432, database: 'baklager', user: 'baklager', password: 'changeme' });
        await pool.query(\"CREATE TABLE IF NOT EXISTS burar (id SERIAL PRIMARY KEY, name VARCHAR(50), x INTEGER DEFAULT 10, y INTEGER DEFAULT 10, color_status VARCHAR(10) DEFAULT 'gron', created_at TIMESTAMP DEFAULT NOW())\");
        await pool.query(\"CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, name VARCHAR(100), rfid_tag VARCHAR(50), created_at TIMESTAMP DEFAULT NOW())\");
        await pool.query(\"CREATE TABLE IF NOT EXISTS rfid_tags (id SERIAL PRIMARY KEY, tag_id VARCHAR(50) UNIQUE, employee_id INTEGER REFERENCES employees(id), created_at TIMESTAMP DEFAULT NOW())\");
        await pool.query(\"CREATE TABLE IF NOT EXISTS checkins (id SERIAL PRIMARY KEY, bur_id INTEGER REFERENCES burar(id), employee_id INTEGER REFERENCES employees(id), rfid_tag VARCHAR(50), status VARCHAR(20) DEFAULT 'kollad', checked_at TIMESTAMP DEFAULT NOW())\");
        console.log('DB initierad');
        await pool.end();
    " 2>/dev/null || echo "[!] Databasen initierades redan eller kunde inte initieras (kan köras manuellt)."
fi

echo "===== Setup klar! ====="
echo "Öppna webbläsaren på http://localhost"
echo "Använd dessa RFID-taggar för att logga in:"
echo "  RFID-001 (Anna Andersson)"
echo "  RFID-002 (Björn Lund)"
echo "  RFID-003 (Carina Nilsson)"
echo ""
echo "För att stoppa systemet: docker compose down"