import 'dotenv/config';
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
let isShuttingDown = false;
let isTickRunning = false;

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
  } catch (error) {
    console.error('[worker] Tick failed:', error);
  } finally {
    isTickRunning = false;
  }
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
