# Så här installerar du Baklager-systemet på din server (192.168.1.250)

## Alternativ 1: En enda rad (rekommenderat)

Kör det här direkt på servern (SSH krävs):

```bash
curl -fsSL https://raw.githubusercontent.com/Esspel/baklager-system/main/setup.sh | bash
```

## Alternativ 2: Steg för steg manuellt (om du vill installera för hand)

Hämta filerna till servern:

```bash
# SSH till servern (lösenord: testing1)
ssh root@192.168.1.250
```

När du är inloggad på servern:

```bash
# 1. Uppdatera paket
apt-get update
apt-get install -y curl ca-certificates gnupg

# 2. Installera Docker
# Lägg till Docker-repo
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs 2>/dev/null || echo 'stable')" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Uppdatera och installera
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Lägg användaren till docker-gruppen (kräve omstart/utloggning)
usermod -aG docker root

# 3. Installera Docker Compose (plugin)
docker compose version || (
  curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  ln -sf /usr/local/bin/docker-compose /usr/libexec/docker/cli-plugins/docker-compose 2>/dev/null || true
)

# 4. Klona eller ladda ner projektet
git clone https://github.com/Esspel/baklager-system.git /opt/baklager-system
# eller om du redan har filerna:
# cp /sökväg/till/dina/filer /opt/baklager-system

# 5. Gå till projektkatalogen
cd /opt/baklager-system

# 6. Starta allt med Docker Compose
docker compose up --build -d

# 7. Vänta att backend blir redo
for i in {1..30}; do
  if curl -sf http://localhost/api/health > /dev/null 2>&1; then
    echo "Backend är igång!"
    break
  fi
  sleep 1
done

# 8. Öppna webbläsaren
echo "Öppna http://localhost i webbläsaren"

# RFID-taggar att prova:
# RFID-001 (Anna Andersson)
# RFID-002 (Björn Lund)
# RFID-003 (Carina Nilsson)
```

## Hur det fungerar

- **Docker Compose** skapar tre containrar:
  - `db`: PostgreSQL-databas
  - `backend`: Node.js REST API med inloggning via RFID
  - `frontend`: Nginx-webbserver med karta över rullburar

- **Frontend**: Använder din Coop-färgpalett (Coop Grön 600, Coop Sans/Marker-fonts)

- **Inloggning**: Blippa RFID-taggarna för att logga in anställda. Statusfärger på rullburarna:
  - **Grön** = kollad idag/igår
  - **Gul** = 2-3 dagar sedan
  - **Röd** = länge sedan

## Stoppa systemet

```bash
docker compose down
```

## Uppdatera senare

```bash
cd /opt/baklager-system && git pull && docker compose up --build -d
```