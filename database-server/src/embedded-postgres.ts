import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import net from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let embeddedInstance: EmbeddedPostgres | null = null;
let connectionString: string | null = null;

const isDatabaseInitialized = (dataDir: string): boolean => {
  const pgVersionFile = path.join(dataDir, 'PG_VERSION');
  const postgresqlConfFile = path.join(dataDir, 'postgresql.conf');
  return existsSync(pgVersionFile) && existsSync(postgresqlConfFile);
};

const getPostmasterPidFilePath = (dataDir: string): string => path.join(dataDir, 'postmaster.pid');

const getPostmasterPid = async (dataDir: string): Promise<number | null> => {
  const pidFile = getPostmasterPidFilePath(dataDir);
  if (!existsSync(pidFile)) {
    return null;
  }

  try {
    const content = await readFile(pidFile, 'utf8');
    const firstLine = content.split(/\r?\n/)[0]?.trim();
    const parsed = Number(firstLine);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

const isPidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const getPidCommandLine = async (pid: number): Promise<string> => {
  try {
    const raw = await readFile(`/proc/${pid}/cmdline`, 'utf8');
    return raw.replace(/\u0000/g, ' ').trim();
  } catch {
    return '';
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPidExit = async (pid: number, timeoutMs = 5000): Promise<boolean> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!isPidAlive(pid)) {
      return true;
    }
    await sleep(100);
  }
  return !isPidAlive(pid);
};

const isPortOpen = async (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });

const handleExistingPostmasterLock = async (dataDir: string, port: number): Promise<'reuse' | 'start'> => {
  const pidFile = getPostmasterPidFilePath(dataDir);
  if (!existsSync(pidFile)) {
    return 'start';
  }

  const pid = await getPostmasterPid(dataDir);
  if (pid && isPidAlive(pid)) {
    const portReachable = await isPortOpen(port);
    if (portReachable) {
      connectionString = `postgresql://postgres:password@localhost:${port}/postgres`;
      console.log(`⚠️ Reusing existing PostgreSQL instance (pid=${pid}, port=${port})`);
      return 'reuse';
    }

    const cmdline = await getPidCommandLine(pid);
    if (cmdline.includes('embedded-postgres') && cmdline.includes(dataDir)) {
      console.log(`⚠️ Found existing embedded PostgreSQL process on another port (pid=${pid}), stopping it...`);
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // If kill races with process exit, we proceed to wait.
      }
      let exited = await waitForPidExit(pid, 5000);
      if (!exited) {
        console.log(`⚠️ PostgreSQL process ${pid} did not stop after SIGTERM, sending SIGKILL...`);
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Ignore and re-check liveness.
        }
        exited = await waitForPidExit(pid, 2000);
      }
      if (exited) {
        if (existsSync(pidFile)) {
          await unlink(pidFile).catch(() => undefined);
        }
        console.log('✅ Previous embedded PostgreSQL process stopped');
        return 'start';
      }
    }

    throw new Error(`PostgreSQL lock exists (pid=${pid}) but port ${port} is not reachable. Stop that process and retry.`);
  }

  await unlink(pidFile).catch(() => undefined);
  console.log('⚠️ Removed stale postmaster.pid lock file');
  return 'start';
};

export const startEmbeddedPostgres = async (port: number = 5502): Promise<string> => {
  if (embeddedInstance && connectionString) {
    return connectionString;
  }

  console.log('🗄️ Starting embedded PostgreSQL...');

  // Use data directory relative to the database-server package
  const dataDir = path.join(__dirname, '../../data/postgres');
  const isInitialized = isDatabaseInitialized(dataDir);
  const lockResolution = await handleExistingPostmasterLock(dataDir, port);
  if (lockResolution === 'reuse' && connectionString) {
    return connectionString;
  }

  embeddedInstance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'password',
    port: port,
    persistent: true,
    initdbFlags: process.platform === 'darwin' 
      ? ['--encoding=UTF8', '--lc-collate=en_US.UTF-8', '--lc-ctype=en_US.UTF-8']
      : ['--encoding=UTF8', '--lc-collate=C', '--lc-ctype=C']
  });

  try {
    if (!isInitialized) {
      console.log('📦 Initializing PostgreSQL cluster...');
      await embeddedInstance.initialise();
    }

    await embeddedInstance.start();
    connectionString = `postgresql://postgres:password@localhost:${port}/postgres`;
    
    console.log(`✅ Embedded PostgreSQL started on port ${port}`);
    return connectionString;
  } catch (error: any) {
    embeddedInstance = null;

    if (existsSync(getPostmasterPidFilePath(dataDir))) {
      const retryResolution = await handleExistingPostmasterLock(dataDir, port);
      if (retryResolution === 'reuse' && connectionString) {
        return connectionString;
      }
    }

    console.error('❌ Failed to start embedded PostgreSQL:', error?.message || error);
    throw error;
  }
};

export const stopEmbeddedPostgres = async (): Promise<void> => {
  if (!embeddedInstance) return;

  try {
    console.log('🛑 Stopping embedded PostgreSQL...');
    await embeddedInstance.stop();
    embeddedInstance = null;
    connectionString = null;
    console.log('✅ Embedded PostgreSQL stopped');
  } catch (error) {
    console.error('❌ Error stopping embedded PostgreSQL:', error);
    embeddedInstance = null;
    connectionString = null;
  }
};

export const getEmbeddedConnectionString = (): string | null => connectionString; 