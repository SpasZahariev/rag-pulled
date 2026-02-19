#!/usr/bin/env node

/**
 * Periodic Firebase Emulator Backup Script
 * 
 * This script runs alongside the Firebase emulator and automatically exports
 * data every 60 seconds to prevent data loss during crashes or forced shutdowns.
 * 
 * Uses the Firebase Emulator Hub REST API to trigger exports while running.
 */

import { setTimeout as sleep } from 'timers/promises';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_INTERVAL = 60000; // 60 seconds
const EMULATOR_HUB_PORT = 4400; // Default Firebase Emulator Hub port
const EXPORT_PATH = './data/firebase-emulator';
const FIREBASE_PROJECT_ID = 'demo-project';

let backupCount = 0;
let isBackupRunning = false;

/**
 * Export emulator data via Firebase CLI.
 *
 * Uses a supported command for current firebase-tools versions:
 *   firebase emulators:export <path> --only auth --force
 */
async function exportEmulatorData() {
  if (isBackupRunning) {
    console.log('⏳ Backup already in progress, skipping...');
    return;
  }

  try {
    isBackupRunning = true;
    backupCount++;
    
    const result = await runFirebaseExport();
    if (result.ok) {
      console.log(`💾 Emulator data backed up (#${backupCount}) - ${new Date().toISOString()}`);
    } else {
      console.warn(`⚠️  Backup failed: ${result.error}`);
    }
  } catch (error) {
    // Don't log connection errors during startup - emulator might not be ready yet
    if (backupCount > 2) {
      console.warn(`⚠️  Backup failed: ${error.message}`);
    }
  } finally {
    isBackupRunning = false;
  }
}

/**
 * Runs "firebase emulators:export" using npx.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function runFirebaseExport() {
  return new Promise((resolve, reject) => {
    const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = [
      'firebase',
      'emulators:export',
      EXPORT_PATH,
      '--only',
      'auth',
      '--force',
      '--project',
      FIREBASE_PROJECT_ID
    ];

    const child = spawn(npxBin, args, {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      const error = stderr.trim() || `export command exited with code ${code}`;
      resolve({ ok: false, error });
    });
  });
}

/**
 * Check if emulator hub is running
 */
async function isEmulatorRunning() {
  try {
    const response = await fetch(`http://localhost:${EMULATOR_HUB_PORT}/emulators`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Main backup loop
 */
async function startPeriodicBackup() {
  console.log('🔄 Starting periodic Firebase emulator backup (every 60s)...');
  
  // Wait for emulator to be ready
  console.log('⏳ Waiting for Firebase emulator to start...');
  while (!(await isEmulatorRunning())) {
    await sleep(2000); // Check every 2 seconds
  }
  
  console.log('✅ Firebase emulator detected, starting periodic backups');
  
  // Start periodic backups
  while (true) {
    await exportEmulatorData();
    await sleep(BACKUP_INTERVAL);
  }
}

/**
 * Handle graceful shutdown
 */
function setupShutdownHandlers() {
  const shutdown = () => {
    console.log('\n🛑 Stopping periodic backup...');
    process.exit(0);
  };

  const signals = process.platform === 'win32' 
    ? ['SIGINT', 'SIGTERM', 'SIGBREAK']
    : ['SIGINT', 'SIGTERM'];
  
  signals.forEach(signal => {
    process.on(signal, shutdown);
  });
}

// Start the backup process
if (import.meta.url === `file://${process.argv[1]}`) {
  setupShutdownHandlers();
  startPeriodicBackup().catch((error) => {
    console.error('❌ Periodic backup failed:', error);
    process.exit(1);
  });
} 