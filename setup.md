# Project Setup

This guide covers local setup for the Go API, Next.js frontend, Postgres, and pgAdmin.

## Prerequisites

- Go 1.20+ (or your preferred Go version)
- Node.js 18+ and npm
- Docker Desktop (for Postgres + pgAdmin)

## 1) Start Postgres + pgAdmin (Docker)

From the repo root:

```powershell
cd c:\Users\Atul_Rathore\go-app
docker compose up -d
```

This uses [docker-compose.yaml](docker-compose.yaml) and exposes:

- Postgres: `localhost:5432`
- pgAdmin: `http://localhost:5050`

## 2) Configure pgAdmin in the Browser

1. Open `http://localhost:5050`
2. Login with:
   - Email: `admin@example.com`
   - Password: `admin`
3. Add a new server:
   - Name: `go-app`
   - Host name/address: `postgres`
   - Port: `5432`
   - Maintenance database: `interview`
   - Username: `admin`
   - Password: `SUPERatul`
4. Save

Note: `postgres` is the Docker service name in the compose file.

## 3) Configure App Settings

This project reads config based on `STAGE` and `SECRET`.

1. Copy the sample file and edit values:

```powershell
copy .develop.ini develop.ini
```

2. Update `develop.ini` with your API keys as needed.

3. Encrypt the config:

```powershell
$env:STAGE="develop"
$env:TAG="app"
$env:SECRET="local"
scale config -e develop -k "local"
```

This writes `develop.ini.enc` used by the app.

## 4) Run the Go API

```powershell
$env:STAGE="develop"
$env:TAG="app"
$env:SECRET="local"

go run . server -P 8113
```

The API will be available at `http://localhost:8113`.

## 5) Run the Frontend (Next.js)

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

If you need a custom API URL, create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8113/api/v1
```

## 6) Stop Docker Services

```powershell
docker compose down
```



<!-- $env:STAGE="develop"
$env:TAG="app"
$env:SECRET="local"

go run . server -P 8115 -d -g -G 8215 -->