#!/bin/bash
# Setup script för Baklager-system — installerar Docker + Docker Compose + bygger och startar
# Körs på Linux (Ubuntu/Debian/Raspberry Pi) med ett kommando.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

LOG() { echo -e "${GREEN}[✓]${NC} $1"; }
INFO() { echo -e "${YELLOW}[→]${NC} $1"; }
ERR() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo "===== Baklager-system Auto-Setup ====="

# 0. Fix DNS (använd Cloudflare om localhost DNS misslyckas)
INFO "Kontrollerar DNS..."
if ! ping -c 1 -W 2 google.com &>/dev/null; then
    INFO "DNS fungerar inte — sätter 8.8.8.8 som nameserver..."
    echo "nameserver 8.8.8.8" > /etc/resolv.conf
    echo "nameserver 1.1.1.1" >> /etc/resolv.conf
fi

# Kontrollera att docker.io är nåbart
if ! ping -c 1 -W 2 docker.io &>/dev/null; then
    INFO "docker.io ej nåbart via DNS — försöker DNS-fix igen..."
    echo "nameserver 8.8.8.8" > /etc/resolv.conf
    echo "nameserver 1.1.1.1" >> /etc/resolv.conf
fi

# 1. Uppdatera paket och installera beroenden (root kör direkt, ingen sudo behövs)
INFO "Uppdaterar paketlista..."
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg 2>/dev/null || true

# 2. Installera Docker (om det saknas)
if command -v docker &>/dev/null; then
    LOG "Docker redan installerat ($(docker --version))"
else
    INFO "Installerar Docker..."
    # Metod för Debian/Ubuntu
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || \
    curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null 2>/dev/null || \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs 2>/dev/null || echo "stable") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || \
    sudo apt-get install -y -qq docker.io docker-compose 2>/dev/null || \
    { curl -fsSL https://get.docker.com | sudo sh; }
    LOG "Docker installerat ($(docker --version 2>/dev/null || echo 'ok'))"
fi

# 3. Installera Docker Compose (plugin eller standalone binary)
if docker compose version &>/dev/null; then
    LOG "Docker Compose (plugin) finns redan ($(docker compose version | head -n1))"
elif command -v docker-compose &>/dev/null; then
    LOG "Docker Compose (standalone) finns redan ($(docker-compose --version | head -n1))"
else
    INFO "Installerar Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose 2>/dev/null || \
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose 2>/dev/null || true
    # Om plugin saknas, skapa symlink från standalone
    if [ -f /usr/local/bin/docker-compose ]; then
        sudo ln -sf /usr/local/bin/docker-compose /usr/libexec/docker/cli-plugins/docker-compose 2>/dev/null || true
    fi
    LOG "Docker Compose installerat"
fi

# Lägg till användare till docker-gruppen (om möjligt) — kräver omstart eller newgrp
if ! groups $(whoami) 2>/dev/null | grep -q docker; then
    INFO "Lägger till $(whoami) i docker-gruppen..."
    sudo usermod -aG docker $(whoami) || true
    LOG "Användare tillagd i docker-grupp (logga ut/in eller kör 'newgrp docker' för att aktivera)"
fi

# 4. Kontrollera att vi är i projektkatalogen
if [ -f "docker-compose.yml" ]; then
    LOG "Projektfil hittad ($PWD)"
else
    # Försök hitta på vanliga platser
    if [ -f "$HOME/baklager-system/docker-compose.yml" ]; then
        INFO "Hittade projekt i $HOME/baklager-system — byter katalog..."
        cd "$HOME/baklager-system"
    elif [ -f "/opt/baklager-system/docker-compose.yml" ]; then
        INFO "Hittade projekt i /opt/baklager-system — byter katalog..."
        cd "/opt/baklager-system"
    else
        # Klona från GitHub om inget annat finns
        INFO "Klonar repo från GitHub..."
        apt-get install -y -qq git 2>/dev/null || true
        git clone https://github.com/Esspel/baklager-system.git "$HOME/baklager-system" 2>/dev/null || \
        { ERR "Kunde inte klona repo — kontrollera nätverk och DNS"; }
        cd "$HOME/baklager-system"
    fi
    LOG "Projekt laddat till $PWD"
fi

# 5. Ta bort 'version' från docker-compose.yml om det finns (gammal syntax)
if grep -q '^version:' docker-compose.yml; then
    INFO "Tar bort föråldrat 'version'-attribut från docker-compose.yml..."
    sed -i '/^version:/d' docker-compose.yml
fi

# 5. Starta containrar
INFO "Bygger och startar Docker-containers..."
if docker compose version &>/dev/null; then
    docker compose down 2>/dev/null || true
    docker compose up --build -d
else
    docker-compose down 2>/dev/null || true
    docker-compose up --build -d
fi

# 6. Vänta på backend
INFO "Väntar på att backend är redo..."
for i in $(seq 1 30); do
    if curl -sf http://localhost/api/health > /dev/null 2>&1; then
        LOG "Backend svarar på /api/health"
        break
    fi
    sleep 1
done

# 7. Initiera databasen om möjligt
INFO "Initierar databasen..."
docker compose exec -T backend sh -c "
  if [ -f src/db/init.js ]; then node src/db/init.js || true; fi
" 2>/dev/null || true

# 8. Visa status
echo ""
echo "========================================"
echo "    BAKLAGER-SYSTEM ÄR KLAR!"
echo "========================================"
echo "Öppna: http://localhost"
echo "RFID-taggar: RFID-001 (Anna), RFID-002 (Björn), RFID-003 (Carina)"
echo ""
echo "Stoppa: docker compose down"
echo "========================================"
