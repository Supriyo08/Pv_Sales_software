# Photovoltaic Sales Network

Sales-network management for a photovoltaic installer: leads, customers, contracts, installations, commissions, monthly bonuses, payments, and reporting.

- **Backend** — Node.js + Express + MongoDB + Redis (BullMQ workers), TypeScript, Zod, JWT auth
- **Frontend** — React 19 + Vite + TanStack Query + Tailwind CSS v4 + Radix UI
- **Infra** — Docker Compose for local Mongo + Redis

---

## Prerequisites

- **Node.js** ≥ 20 (the backend uses `tsx` watch mode; the frontend targets Vite 8)
- **npm** ≥ 10
- **Docker** + **Docker Compose** (for the Mongo + Redis stack)

You can run Mongo / Redis natively instead of via Docker — just point the env vars at your local instances.

---

## Repository layout

```
photovoltaic/
├── backend/              # Express API (TypeScript)
│   ├── src/
│   │   ├── config/       # env, db, redis bootstrap
│   │   ├── modules/      # auth, leads, customers, contracts, …
│   │   ├── routes/       # /v1 router
│   │   ├── middleware/   # error, requestId, auth
│   │   └── index.ts      # entry point
│   └── tests/            # vitest + mongodb-memory-server
├── frontend/             # React + Vite SPA
│   └── src/
│       ├── pages/        # routed pages
│       ├── components/   # AppLayout, ui/*, etc.
│       ├── lib/          # api client, helpers
│       └── store/        # Zustand stores
└── docker-compose.yml    # Mongo + Redis
```

---

## Quick start

```sh
# 1. Clone & install
git clone <repo-url> photovoltaic
cd photovoltaic

# 2. Start Mongo + Redis
docker compose up -d

# 3. Backend
cd backend
cp .env.example .env          # then edit secrets — see "Backend env" below
npm install
npm run dev                   # http://localhost:4000

# 4. Frontend (new terminal)
cd ../frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Open `http://localhost:5173/` and sign up — the first user can be promoted to `ADMIN` directly in the `users` collection if no seed flow is wired up yet.

---

## Backend env

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `4000` | API listen port |
| `MONGO_URI` | `mongodb://localhost:27017/photovoltaic` | MongoDB connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string (used by BullMQ) |
| `JWT_ACCESS_SECRET` | *(required, ≥16 chars)* | Signing secret for short-lived access tokens |
| `JWT_REFRESH_SECRET` | *(required, ≥16 chars)* | Signing secret for refresh tokens |
| `JWT_ACCESS_TTL` | `15m` | Access-token lifetime (vercel `ms` syntax) |
| `JWT_REFRESH_TTL` | `7d` | Refresh-token lifetime |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origin for the SPA |
| `LOG_LEVEL` | `info` | Pino log level (`trace`/`debug`/`info`/`warn`/`error`) |

> The backend boots through `src/config/env.ts`, which validates the schema with Zod and exits on misconfiguration. **Always replace the `change-me-*` secrets in development.**

---

## Frontend env

Copy `frontend/.env.example` to `frontend/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE` | `http://localhost:4000/v1` | Base URL the axios client (`src/lib/api.ts`) uses |

If you change the backend port or run it remotely, update this. Vite reads `.env` at startup, so restart `npm run dev` after editing.

---

## Scripts

### Backend

```sh
npm run dev          # tsx watch — auto-reload on file changes
npm run build        # tsc → dist/
npm start            # node dist/index.js (after build)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (uses mongodb-memory-server)
npm run test:watch
```

### Frontend

```sh
npm run dev          # Vite dev server on :5173
npm run build        # tsc -b && vite build → dist/
npm run preview      # preview the production build
npm run lint         # eslint .
```

---

## Background workers

The backend boots BullMQ workers in-process from `src/index.ts`:

- **commission handlers** — emit commissions on contract activation
- **notification handlers** — fan-out in-app notifications
- **bonus worker** — monthly bonus job; `scheduleMonthlyBonus()` registers a recurring job on Redis

Workers share the API process today. To run them separately, split `startBonusWorker()` / `register*Handlers()` into a dedicated entry and run two processes against the same Redis.

---

## Tests

Backend tests use `mongodb-memory-server`, so they don't need the dockerized Mongo:

```sh
cd backend
npm test
```

Test suites live in `backend/tests/` (`bonuses`, `commissions`, `payments`, `users`, plus shared `factories.ts` / `setup.ts`).

---

## Troubleshooting

**Vite shows "Failed to resolve import …" after installing new deps.**
Restart the dev server. Vite caches its dependency-optimization graph in `node_modules/.vite/deps`. If a stale cache persists, delete that folder and restart.

**Export CSV downloads HTML instead of CSV.**
This was a bug — the report download must go through the configured axios `api` client (which has the correct `baseURL`), not a relative `fetch`. Fixed in `frontend/src/pages/Reports.tsx`.

**Backend exits immediately with "Invalid environment configuration".**
Your `.env` is missing a required key or the JWT secrets are shorter than 16 characters. Compare against `backend/.env.example`.

**Mongo or Redis connection refused.**
`docker compose ps` to confirm both containers are running. The defaults assume `localhost:27017` and `localhost:6379`.

---

## API surface

All routes live under `/v1`. Health check at `GET /health` returns `{ status, mongo }`.

Modules (each under `backend/src/modules/<name>`): `auth`, `users`, `leads`, `customers`, `contracts`, `installations`, `documents`, `catalog` (solutions / bonus rules), `commissions`, `bonuses`, `payments`, `notifications`, `reports`, `territories`, `audit`.
