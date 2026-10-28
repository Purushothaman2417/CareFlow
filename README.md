# CareFlow

CareFlow is a TanStack Start frontend backed by an Express API and MongoDB. The
repository root is not an npm project; run the frontend and backend from their
own directories in separate PowerShell terminals.

## Run locally on Windows

Prerequisites: Node.js/npm and a local MongoDB server listening on port `27017`.
Redis is optional in local development.

### 1. Configure and start the demo API

In the first terminal:

```powershell
cd backend\server
if (-not (Test-Path .env.demo)) { Copy-Item .env.demo.example .env.demo }
```

Edit `backend\server\.env.demo` and set a private local demo password and JWT
secret. Keep the demo MongoDB URI pointed at a local development database. Then
run:

```powershell
npm install
npm run dev:demo
```

The demo API uses only `.env.demo` and refuses non-local MongoDB hosts.

### 2. Start the frontend

In a second terminal from the repository root:

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open [http://localhost:8080](http://localhost:8080). Confirm the backend is
available at [http://localhost:8000/api/health](http://localhost:8000/api/health)
before using sign-in or authenticated pages. If the API is stopped, pages that
require an account or backend data cannot load.

In development, the sign-in page provides demo-account shortcuts. Seed demo data
from `backend\server` with `npm run seed:demo-data` if those accounts are not
present yet.
