import 'dotenv/config';
import net from 'node:net';
import { claimNextQueuedJob } from './lib/ingestion/queue';
import { processIngestionJob } from './lib/ingestion/processor';
import {
  getDocumentStructurerProvider,
  getEmbeddingProvider,
  getEnv,
  getOllamaEmbeddingModel,
  getOllamaStructurerModel,
  getOpenCodeZenStructurerModel,
  validateIngestionProviderEnv,
} from './lib/env';

const pollIntervalMs = Number(getEnv('INGESTION_WORKER_POLL_MS', '2000'));
const startupDbWaitTimeoutMs = Number(getEnv('INGESTION_WORKER_DB_WAIT_TIMEOUT_MS', '30000'));
const startupDbWaitPollMs = Number(getEnv('INGESTION_WORKER_DB_WAIT_POLL_MS', '500'));
let isShuttingDown = false;
let isTickRunning = false;
let didLogDbNotReady = false;

function logProviderConfiguration(): void {
  validateIngestionProviderEnv();

  const structurerProvider = getDocumentStructurerProvider();
  const embeddingProvider = getEmbeddingProvider();
  const structurerModel =
    structurerProvider === 'opencode-zen-structurer-v1'
      ? getOpenCodeZenStructurerModel()
      : getOllamaStructurerModel();
  const embeddingModel = getOllamaEmbeddingModel();
  const timestamp = new Date().toISOString();

  console.log(
    `[worker][startup] timestamp=${timestamp} structurerProvider=${structurerProvider} structurerModel="${structurerModel}" embeddingProvider=${embeddingProvider} embeddingModel="${embeddingModel}"`
  );
}

async function runTick(): Promise<void> {
  if (isShuttingDown || isTickRunning) {
    return;
  }

  isTickRunning = true;
  try {
    // Claim-then-process keeps one worker tick focused on one job.
    const claimedJob = await claimNextQueuedJob();
    if (!claimedJob) {
      return;
    }

    console.log(`[worker] Claimed ingestion job ${claimedJob.id}`);
    await processIngestionJob(claimedJob.id);
    didLogDbNotReady = false;
  } catch (error) {
    if (isTransientDatabaseNotReadyError(error)) {
      if (!didLogDbNotReady) {
        console.warn('[worker] Database is not fully ready yet; retrying on next tick.');
        didLogDbNotReady = true;
      }
      return;
    }
    console.error('[worker] Tick failed:', error);
  } finally {
    isTickRunning = false;
  }
}

function getDatabaseHostAndPort(): { host: string; port: number } {
  const databaseUrl = getEnv('DATABASE_URL', 'postgresql://postgres:password@localhost:5502/postgres')!;

  try {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? Number(parsed.port) : 5432,
    };
  } catch {
    return { host: 'localhost', port: 5502 };
  }
}

function tryConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };

    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1000, () => done(false));
  });
}

async function waitForDatabasePort(): Promise<boolean> {
  const { host, port } = getDatabaseHostAndPort();
  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + startupDbWaitTimeoutMs;

  while (!isShuttingDown && Date.now() < deadlineMs) {
    const connected = await tryConnect(host, port);
    if (connected) {
      const elapsedMs = Date.now() - startedAtMs;
      if (elapsedMs > 0) {
        console.log(`[worker] Database reachable at ${host}:${port} after ${elapsedMs}ms.`);
      }
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, startupDbWaitPollMs));
  }

  return false;
}

function isTransientDatabaseNotReadyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: string;
    message?: string;
    errors?: Array<{ code?: string }>;
  };

  // Postgres startup race: server socket accepts, but backend still initializing.
  if (candidate.code === '57P03') {
    return true;
  }

  if (typeof candidate.message === 'string' && candidate.message.includes('database system is starting up')) {
    return true;
  }

  if (candidate.code === 'ECONNREFUSED') {
    return true;
  }

  if (!Array.isArray(candidate.errors)) {
    return false;
  }

  return candidate.errors.some((entry) => entry?.code === 'ECONNREFUSED');
}

async function startWorker(): Promise<void> {
  console.log(`[worker] Starting ingestion worker (poll every ${pollIntervalMs}ms)`);
  try {
    logProviderConfiguration();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    console.error(`[worker] Startup configuration failed: ${message}`);
    process.exitCode = 1;
    return;
  }

  const dbReady = await waitForDatabasePort();
  if (!dbReady) {
    const { host, port } = getDatabaseHostAndPort();
    console.warn(
      `[worker] Timed out waiting ${startupDbWaitTimeoutMs}ms for database at ${host}:${port}. Continuing with retries.`
    );
  }

  setInterval(() => {
    void runTick();
  }, pollIntervalMs);

  await runTick();
}

function shutdown(signal: string): void {
  console.log(`[worker] Received ${signal}. Shutting down...`);
  isShuttingDown = true;
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

void startWorker().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  console.error(`[worker] Startup failed: ${message}`);
  process.exitCode = 1;
});
