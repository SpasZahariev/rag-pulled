# Start Services (Single Source of Truth)

Use this guide for local development startup commands.

## What runs locally

- Backend API (`server/src/server.ts`)
- Ingestion worker (`server/src/worker.ts`)
- Frontend (Vite in `ui`)
- Firebase Auth emulator (when using local Firebase)
- Local Postgres process (when using local DB)

## Option A: Start everything with one command (single terminal)

From repo root:

```bash
pnpm run dev
```

This starts all services together and streams logs in one terminal with service prefixes.

## Option B: Start everything at once with separated logs (tmux windows)

If you want one command and separate logs per service terminal:

```bash
tmux new-session -d -s rag-dev -n database "cd /home/spas/dev/js-projects/rag-pulled/database-server && pnpm run dev -- --port 5502" \; \
new-window -n firebase "cd /home/spas/dev/js-projects/rag-pulled && pnpm run firebase:emulator" \; \
new-window -n api "cd /home/spas/dev/js-projects/rag-pulled/server && pnpm run dev -- --port 5500" \; \
new-window -n worker "cd /home/spas/dev/js-projects/rag-pulled/server && pnpm run worker:dev" \; \
new-window -n ui "cd /home/spas/dev/js-projects/rag-pulled/ui && pnpm run dev -- --port 5501 --api-url http://localhost:5500 --use-firebase-emulator true --firebase-auth-port 5503" \; \
select-window -t rag-dev:api \; attach -t rag-dev
```

Useful tmux controls:

- `Ctrl+b`, then `n` / `p` to move windows
- `Ctrl+b`, then `w` to list windows
- `Ctrl+b`, then `d` to detach (keep services running)
- `tmux kill-session -t rag-dev` to stop all services

## Option C: Start one-by-one in separate terminals

Open 5 terminals and run these commands in order.

### Terminal 1 - Database server

```bash
cd /home/spas/dev/js-projects/rag-pulled/database-server
pnpm run dev -- --port 5502
```

### Terminal 2 - Firebase Auth emulator

```bash
cd /home/spas/dev/js-projects/rag-pulled
pnpm run firebase:emulator
```

### Terminal 3 - Backend API

```bash
cd /home/spas/dev/js-projects/rag-pulled/server
pnpm run dev -- --port 5500
```

### Terminal 4 - Ingestion worker

```bash
cd /home/spas/dev/js-projects/rag-pulled/server
pnpm run worker:dev
```

### Terminal 5 - Frontend

```bash
cd /home/spas/dev/js-projects/rag-pulled/ui
pnpm run dev -- --port 5501 --api-url http://localhost:5500 --use-firebase-emulator true --firebase-auth-port 5503
```

## Manual mode required env values

When using Option B or Option C, ensure `server/.env` has local-dev values:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5502/postgres
FIREBASE_PROJECT_ID=demo-project
FIREBASE_AUTH_EMULATOR_HOST=localhost:5503
```

`pnpm run dev` (Option A) auto-manages dynamic ports. Manual mode uses fixed ports from this document.

## Connect with psql

If you are using manual mode (fixed port), connect with:

```bash
psql "postgresql://postgres:password@localhost:5502/postgres"
```

If you are using `pnpm run dev` (dynamic ports), connect using the current `DATABASE_URL`:

```bash
psql "$(rg '^DATABASE_URL=' /home/spas/dev/js-projects/rag-pulled/server/.env | sed 's/^DATABASE_URL=//')"
```
