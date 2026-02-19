import 'dotenv/config';
import { claimNextQueuedJob } from './lib/ingestion/queue';
import { processIngestionJob } from './lib/ingestion/processor';
import { getEnv } from './lib/env';

const pollIntervalMs = Number(getEnv('INGESTION_WORKER_POLL_MS', '2000'));
let isShuttingDown = false;
let isTickRunning = false;

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

void startWorker();
