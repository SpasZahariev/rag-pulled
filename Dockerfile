FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json server/
COPY ui/package.json ui/
COPY database-server/package.json database-server/

RUN pnpm install --frozen-lockfile

COPY server/ server/
COPY ui/ ui/
COPY database-server/ database-server/

# --- Backend API server ---
FROM base AS server
WORKDIR /app/server
EXPOSE 8787
CMD ["npx", "tsx", "src/server.ts"]

# --- Background ingestion worker ---
FROM base AS worker
WORKDIR /app/server
CMD ["npx", "tsx", "src/worker.ts"]

# --- Vite frontend dev server ---
FROM base AS ui
WORKDIR /app/ui
EXPOSE 5173
CMD ["pnpm", "run", "dev", "--", "--host"]
