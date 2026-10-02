# Baklager-system

Ett webbaserat system för att hantera rullburar på lagret. Minskar dubbelarbete och underlättar uppföljning av hur ofta varje rullbur kontrollerats.

## Funktioner

- **RFID-loggin**: Användare loggar in genom att blippa sin RFID-tagg
- **Lagerkarta**: Visar alla rullburar som flyttbara kvadrater där buren står
- **Statusfärger**: Grön = nyligen kollad, Gul = 2-3 dagar sedan, Röd = länge sedan
- **Kollningslogg**: Var, när och av vem varje bur är kontrollerad
- **Redigeringsläge**: Dra och släpp rullburar på kartan för att justera positioner

## Snabbstart

### 1. Klona/rekorderet

```bash
git clone https://github.com/Esspel/baklager-system.git
cd baklager-system
```

### 2. Kör setup-skriptet

Setup-skriptet kontrollerar att Docker och Docker Compose är installerade, bygger containrarna och startar systemet:

```bash
bash setup.sh
```

Eller hämta och kör direkt med curl:

```bash
curl -fsSL https://raw.githubusercontent.com/Esspel/baklager-system/main/setup.sh | bash
```

### 3. Öppna i webbläsaren

Skriv `http://localhost` i din webbläsare.

### 4. Logga in med RFID

Testa med dessa RFID-taggar:

| RFID-tag | Användare |
|----------|-----------|
| RFID-001 | Anna Andersson |
| RFID-002 | Björn Lund |
| RFID-003 | Carina Nilsson |

## Manual installation (steg-för-steg)

Om du hellre vill göra allt manuellt:

```bash
# 1. Kontrollera Docker
docker --version
docker compose version

# 2. Bygg och starta containrar
docker compose up --build -d

# 3. Initiera databasen
docker compose exec backend npm run db:init

# 4. Öppna webbläsaren
# http://localhost
```

För att stoppa systemet:

```bash
docker compose down
```

## Systemarkitektur

```
┌─────────────┐
│  Frontend   │  Nginx (statisk HTML/CSS/JS)
│  (port 80)  │  + drag-and-drop karta
└──────┬──────┘
       │ HTTP /api/*
┌──────▼──────┐
│   Backend   │  Node.js/Express REST API
│  (port 3000)│  + JWT-auth + RFID login
└──────┬──────┘
       │ PostgreSQL
┌──────▼──────┐
│     DB      │  PostgreSQL databas
│  (port 5432)│  + data-volym (persistent)
└─────────────┘
```

### Tjänster (containes)

| Tjänst | Bild | Port | Ansvar |
|--------|------|------|--------|
| `frontend` | `nginx:alpine` | 80 | Serverar HTML/CSS/JS, proxyar API-anrop till backend |
| `backend` | `node:20-alpine` (egenvbygd) | 3000 | REST API: burar, anställda, RFID-loggin, kollningsloggar, statistik |
| `db` | `postgres:16-alpine` | 5432 | Databas (data sparas persistent i volym) |

## API-endpunkter

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/health` | Hälsokontroll |
| POST | `/api/auth/login` | Logga in med RFID-tag (`{ "rfid_tag": "RFID-001" }`) |
| GET | `/api/burar` | Lista alla rullburar |
| GET | `/api/burar/:id` | Enskild rullbur |
| POST | `/api/burar` | Skapa ny rullbur (kräver auth) |
| PUT | `/api/burar/:id` | Uppdatera namn/position (kräver auth) |
| DELETE | `/api/burar/:id` | Ta bort rullbur (kräver auth) |
| POST | `/api/checkin` | Kollningslogg (kräver auth, `{ "bur_id": 1 }`) |
| GET | `/api/employees` | Lista anställda (kräver auth) |

## Miljövariabler

| Variabel | Standard | Beskrivning |
|----------|----------|-------------|
| `DB_NAME` | `baklager` | Databasnamn |
| `DB_USER` | `baklager` | Databasanvändare |
| `DB_PASSWORD` | `changeme` | Databas lösenord |
| `JWT_SECRET` | `changeme` | Nyckel för JWT-token |

**Ändra lösenorden innan du lägger ut systemet!**

## Struktur

```
baklager-system/
├── docker-compose.yml   # Definierar alla containrar
├── setup.sh             # Setup-skript
├── backend/             # Node.js API
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js    # Huvudserver med REST API
│       └── db/init.js   # Databas-initiering
└── frontend/            # HTML/CSS/JS (Coop-design)
    ├── Dockerfile
    ├── nginx.conf       # Nginx konfiguration
    ├── index.html
    ├── css/
    │   └── styles.css   # Coop färger & design
    └── js/
        └── app.js       # Frontend-logik (karta, RFID, CRUD)
```

## Design

Systemet använder Coops färgpalett (Coop Grön 600 som primärfärg) och CoopSans/CoopMarker typsnitt för att matcha butikens varumärke.

## Teknologier

- **Frontend**: HTML5, CSS3 (med CSS-custom-properties för färger), vanilla JavaScript
- **Backend**: Node.js, Express, JWT-auth
- **Databas**: PostgreSQL
- **Docker**: Containerisering med Docker Compose

## Utveckling

För lokal utveckling:

```bash
cd backend
npm install
npm run dev          # Hot-reload server
npm run db:init      # Initiera databasen

cd ../frontend        # Öppna frontend/ direkt i en webbläsare för snabb testning
```