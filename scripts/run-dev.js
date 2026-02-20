#!/usr/bin/env node
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, mkdirSync, createWriteStream } from 'fs';
import {
  getAvailablePorts,
  createFirebaseConfig,
  updateServerEnvWithPorts,
  restoreEnvFile,
  cleanupFirebaseConfig,
  checkDatabaseConfiguration,
  getDatabaseUrl,
  readServerEnv,
  updateWranglerConfigWithPort,
  restoreWranglerConfig
} from './port-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const normalizedProjectRoot = projectRoot.replace(/\\/g, '/');
const logsDir = path.join(projectRoot, 'logs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripAnsi(input) {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

function createServiceLogWriters(serviceNames) {
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const writers = new Map();
  const startedAt = new Date().toISOString();
  for (const serviceName of serviceNames) {
    const filePath = path.join(logsDir, `${serviceName}.log`);
    const writer = createWriteStream(filePath, { flags: 'a' });
    writer.write(`\n--- dev session started ${startedAt} ---\n`);
    writers.set(serviceName, writer);
  }
  return writers;
}

function writePrefixedLinesToServiceLogs(chunk, streamType, lineBuffers, serviceLogWriters) {
  const bufferKey = streamType === 'stderr' ? 'stderr' : 'stdout';
  lineBuffers[bufferKey] += chunk;
  const segments = lineBuffers[bufferKey].split(/\r?\n/);
  lineBuffers[bufferKey] = segments.pop() ?? '';

  for (const segment of segments) {
    const line = stripAnsi(segment).replace(/\r/g, '');
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^\[([^\]]+)\]\s?(.*)$/);
    if (!match) {
      continue;
    }

    const [, serviceName, message] = match;
    const writer = serviceLogWriters.get(serviceName);
    if (!writer) {
      continue;
    }

    writer.write(`${new Date().toISOString()} ${message}\n`);
  }
}

function createNoisyLogAggregator() {
  return {
    firebaseExportLines: 0,
    backupSnapshotLines: 0,
  };
}

function shouldSuppressNoisyServiceLine(serviceName, message, noisyLogAggregator) {
  if (serviceName === 'firebase') {
    const isExportLine =
      message.includes('Received export request') || message.includes('Export complete.');
    if (isExportLine) {
      noisyLogAggregator.firebaseExportLines += 1;
      return true;
    }
  }

  if (serviceName === 'backup') {
    const isBackupLine = message.includes('Emulator data backed up');
    if (isBackupLine) {
      noisyLogAggregator.backupSnapshotLines += 1;
      return true;
    }
  }

  return false;
}

function flushNoisyLogSummary(noisyLogAggregator) {
  const firebaseExportLines = noisyLogAggregator.firebaseExportLines;
  const backupSnapshotLines = noisyLogAggregator.backupSnapshotLines;
  if (firebaseExportLines === 0 && backupSnapshotLines === 0) {
    return;
  }

  process.stdout.write(
    `[logs] Aggregated noisy logs in last minute: firebaseExportLines=${firebaseExportLines} backupSnapshots=${backupSnapshotLines} (full details in logs/firebase.log and logs/backup.log)\n`
  );
  noisyLogAggregator.firebaseExportLines = 0;
  noisyLogAggregator.backupSnapshotLines = 0;
}

function writeFilteredConsoleOutput(chunk, streamType, outputBuffers, noisyLogAggregator) {
  const bufferKey = streamType === 'stderr' ? 'stderr' : 'stdout';
  outputBuffers[bufferKey] += chunk;
  const segments = outputBuffers[bufferKey].split(/\r?\n/);
  outputBuffers[bufferKey] = segments.pop() ?? '';

  for (const segment of segments) {
    const normalizedLine = stripAnsi(segment).replace(/\r/g, '');
    if (!normalizedLine.trim()) {
      process.stdout.write('\n');
      continue;
    }

    const prefixedMatch = normalizedLine.match(/^\[([^\]]+)\]\s?(.*)$/);
    if (prefixedMatch) {
      const [, serviceName, message] = prefixedMatch;
      if (shouldSuppressNoisyServiceLine(serviceName, message, noisyLogAggregator)) {
        continue;
      }
    }

    const target = streamType === 'stderr' ? process.stderr : process.stdout;
    target.write(`${segment}\n`);
  }
}

function listProjectServicePids() {
  if (process.platform === 'win32') {
    return [];
  }

  let output = '';
  try {
    output = execSync('ps -eo pid=,args=', { encoding: 'utf8' });
  } catch {
    return [];
  }

  const lines = output.split('\n').map(line => line.trim()).filter(Boolean);
  const pids = [];

  for (const line of lines) {
    const firstSpace = line.indexOf(' ');
    if (firstSpace === -1) {
      continue;
    }

    const pid = Number(line.slice(0, firstSpace).trim());
    const cmd = line.slice(firstSpace + 1);

    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid || pid === process.ppid) {
      continue;
    }

    const inWorkspace = cmd.includes(normalizedProjectRoot);
    const isManagedServiceProcess =
      cmd.includes(`${normalizedProjectRoot}/scripts/run-dev.js`) ||
      cmd.includes(`${normalizedProjectRoot}/scripts/periodic-emulator-backup.js`) ||
      cmd.includes(`${normalizedProjectRoot}/server/node_modules/.bin/../tsx/dist/cli.mjs watch src/server.ts`) ||
      cmd.includes(`${normalizedProjectRoot}/server/node_modules/.bin/../tsx/dist/cli.mjs watch src/worker.ts`) ||
      cmd.includes(`${normalizedProjectRoot}/database-server/node_modules/.bin/../tsx/dist/cli.mjs watch src/index.ts`) ||
      cmd.includes(`${normalizedProjectRoot}/ui/node_modules/.bin/../vite/bin/vite.js`) ||
      cmd.includes(`${normalizedProjectRoot}/node_modules/.bin/../firebase-tools/lib/bin/firebase.js emulators:start`) ||
      (cmd.includes(`${normalizedProjectRoot}/data/postgres`) && cmd.includes('embedded-postgres')) ||
      cmd.includes(`${normalizedProjectRoot}/node_modules/.bin/../concurrently/dist/bin/concurrently.js`);

    if (inWorkspace && isManagedServiceProcess) {
      pids.push(pid);
    }
  }

  return [...new Set(pids)];
}

function sendSignalToPids(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // Ignore dead or inaccessible processes.
    }
  }
}

function filterAlivePids(pids) {
  return pids.filter(pid => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  });
}

async function cleanupPreviousServiceInstances() {
  const stalePids = listProjectServicePids();
  if (stalePids.length === 0) {
    return;
  }

  console.log(`🧹 Found ${stalePids.length} existing service process(es). Stopping...`);
  sendSignalToPids(stalePids, 'SIGTERM');
  await sleep(2000);

  const remaining = filterAlivePids(stalePids);
  if (remaining.length > 0) {
    console.log(`⚠️ ${remaining.length} process(es) still running. Forcing stop...`);
    sendSignalToPids(remaining, 'SIGKILL');
    await sleep(500);
  }
}

/**
 * Auto-detects if wrangler is being used by checking server's package.json
 * @returns {boolean} True if wrangler is detected in server dev script
 */
function detectWranglerUsage() {
  try {
    const serverPackageJsonPath = path.join(__dirname, '../server/package.json');
    if (!existsSync(serverPackageJsonPath)) {
      return false;
    }
    
    const packageJson = JSON.parse(readFileSync(serverPackageJsonPath, 'utf-8'));
    const devScript = packageJson.scripts?.dev;
    
    if (!devScript) {
      return false;
    }
    
    return devScript.includes('wrangler dev');
  } catch (error) {
    return false;
  }
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  return {
    useWrangler: args.includes('--wrangler') || args.includes('--cloudflare'),
    help: args.includes('--help') || args.includes('-h')
  };
}

/**
 * Detects if we're using production services or local emulators
 * @returns {Object} Configuration detection results
 */
function detectEnvironmentConfiguration() {
  const envData = readServerEnv();
  
  if (!envData) {
    return {
      useLocalFirebase: true,
      useLocalDatabase: true,
      isProduction: false
    };
  }

  try {
    const envContent = envData.content;
    
    // Check if we have a real Firebase project ID (not 'demo-project')
    const firebaseProjectMatch = envContent.match(/FIREBASE_PROJECT_ID=(.+)/);
    const firebaseProjectId = firebaseProjectMatch?.[1]?.trim();
    const useLocalFirebase = !firebaseProjectId || firebaseProjectId === 'demo-project';
    
    // Check if we have a remote database URL (not localhost)
    const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
    const databaseUrl = dbUrlMatch?.[1]?.trim();
    const useLocalDatabase = !databaseUrl || databaseUrl.includes('localhost');
    
    const isProduction = !useLocalFirebase || !useLocalDatabase;
    
    return {
      useLocalFirebase,
      useLocalDatabase,
      isProduction,
      firebaseProjectId,
      databaseUrl
    };
  } catch (error) {
    console.warn('⚠️  Could not detect environment configuration, defaulting to local mode');
    return {
      useLocalFirebase: true,
      useLocalDatabase: true,
      isProduction: false
    };
  }
}

function showHelp() {
  console.log(`
🌊 volo-app Development Server

Usage:
  npm run dev                    Start with Node.js server (default)
  npm run dev -- --wrangler     Start with Cloudflare Wrangler dev server
  npm run dev -- --help         Show this help

Features:
  ✅ Automatic port conflict detection and resolution
  ✅ Multiple instance support (run several volo-apps simultaneously)
  ✅ Smart production/local service detection
  ✅ Cloudflare Workers compatibility

Notes:
  • Automatically detects if you're using production or local services
  • When using --wrangler, embedded PostgreSQL is not available
  • For Cloudflare Workers, ensure DATABASE_URL points to a remote database
`);
}

function handleError(error, message = 'Failed to start services') {
  console.error(`❌ ${message}:`, error.message || error);
  process.exit(1);
}

function showServiceInfo(availablePorts, useWrangler, config) {
  console.log('🎉 Your app is ready at:');
  console.log(`   Frontend:  \x1b[32mhttp://localhost:${availablePorts.frontend}\x1b[0m`);
  console.log(`   Backend:   http://localhost:${availablePorts.backend}`);
  
  if (config.useLocalFirebase) {
    console.log(`   Firebase Emulator UI:  http://localhost:${availablePorts.firebaseUI}`);
  } else {
    console.log(`   Firebase: Production (${config.firebaseProjectId})`);
  }
  
  if (config.useLocalDatabase) {
    if (useWrangler) {
      console.log(`   Database:  ${getDatabaseUrl(availablePorts, useWrangler)}`);
    } else {
      console.log(`   Database:  postgresql://postgres:***@localhost:${availablePorts.postgres}/postgres`);
    }
  } else {
    console.log(`   Database: Production database`);
  }
  
  if (useWrangler) {
    console.log('\n⚡ Running in Cloudflare Workers mode');
  } else {
    console.log('\n🗄️  Using Node.js server');
  }
  
  if (config.isProduction) {
    console.log('\n🏭 Production services detected');
    if (!config.useLocalFirebase) {
      console.log(`   • Firebase: ${config.firebaseProjectId}`);
    }
    if (!config.useLocalDatabase) {
      console.log('   • Database: Remote PostgreSQL');
    }
  } else {
    console.log('\n🧪 Local development mode');
    if (config.useLocalDatabase && !useWrangler) {
      console.log('   • Using local PostgreSQL database server');
    }
    if (config.useLocalFirebase) {
      console.log('   • Using Firebase Auth emulator');
    }
  }
  
  console.log('\n📋 Live service logs:\n');
}

async function startServices() {
  const cliArgs = parseCliArgs();
  
  if (cliArgs.help) {
    showHelp();
    return;
  }

  console.log('🚀 Starting volo-app development server...\n');
  await cleanupPreviousServiceInstances();

  // Store cleanup state
  let envState = null;
  let wranglerConfigState = null;
  let firebaseConfigPath = null;

  try {
    // Auto-detect wrangler usage
    const autoDetectedWrangler = detectWranglerUsage();
    const useWrangler = cliArgs.useWrangler || autoDetectedWrangler;
    
    if (autoDetectedWrangler && !cliArgs.useWrangler) {
      console.log('⚡ Auto-detected Cloudflare Workers mode');
    }
    
    // Override CLI args with auto-detection result
    cliArgs.useWrangler = useWrangler;
    
    // Detect environment configuration
    const config = detectEnvironmentConfiguration();
    
    // Get available ports
    const availablePorts = await getAvailablePorts();
    
    // Check database configuration for Cloudflare Workers mode
    if (!checkDatabaseConfiguration(cliArgs.useWrangler)) {
      process.exit(1);
    }

    // Update .env files with dynamic ports (only for local services)
    if (config.useLocalDatabase || config.useLocalFirebase) {
      envState = updateServerEnvWithPorts(availablePorts, cliArgs.useWrangler);
    }

    // Update wrangler.toml with dynamic port (only for wrangler mode)
    if (cliArgs.useWrangler) {
      wranglerConfigState = updateWranglerConfigWithPort(availablePorts, config.useLocalFirebase);
    }

    // Create temporary firebase.json for emulator (only if using local Firebase)
    if (config.useLocalFirebase) {
      firebaseConfigPath = createFirebaseConfig(availablePorts);
    }

    // Build commands based on configuration
    const commands = [];
    
    // Add database server if using local database (and not Wrangler mode)
    if (config.useLocalDatabase && !cliArgs.useWrangler) {
      commands.push(`"cd database-server && pnpm run dev -- --port ${availablePorts.postgres}"`);
    }
    
    // Add Firebase emulator if using local Firebase
    if (config.useLocalFirebase) {
      commands.push(`"firebase emulators:start --only auth --project demo-project --export-on-exit=./data/firebase-emulator --import=./data/firebase-emulator"`);
      // Add periodic backup script to prevent data loss during crashes
      commands.push(`"node ./scripts/periodic-emulator-backup.js"`);
    }
    
    // Add backend server
    if (cliArgs.useWrangler) {
      // Port is set via wrangler.toml config update, not CLI argument
      commands.push(`"cd server && wrangler dev --local-protocol http"`);
    } else {
      commands.push(`"cd server && pnpm run dev -- --port ${availablePorts.backend}"`);
      commands.push(`"cd server && pnpm run worker:dev"`);
    }
    
    // Add frontend server
    const frontendArgs = [
      `--port ${availablePorts.frontend}`,
      '--strictPort',
      `--api-url http://localhost:${availablePorts.backend}`
    ];
    
    if (config.useLocalFirebase) {
      frontendArgs.push('--use-firebase-emulator true');
      frontendArgs.push(`--firebase-auth-port ${availablePorts.firebaseAuth}`);
    } else {
      frontendArgs.push('--use-firebase-emulator false');
    }
    
    const frontendCmd = `"cd ui && pnpm run dev -- ${frontendArgs.join(' ')}"`;
    commands.push(frontendCmd);

    // Start loading animation
    const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinnerIndex = 0;
    let dotCount = 0;
    
    const spinnerInterval = setInterval(() => {
      const dots = '.'.repeat((dotCount % 4));
      const spaces = ' '.repeat(3 - dots.length);
      
      process.stdout.write(`\r${spinnerChars[spinnerIndex]} Starting services${dots}${spaces}`);
      
      spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
      dotCount++;
    }, 150);

    // Determine service names and colors based on configuration
    const serviceNames = [];
    const serviceColors = [];
    
    // Add database server if using local database (and not Wrangler mode)
    if (config.useLocalDatabase && !cliArgs.useWrangler) {
      serviceNames.push('database');
      serviceColors.push('blue');
    }
    
    if (config.useLocalFirebase) {
      serviceNames.push('firebase');
      serviceColors.push('cyan');
      serviceNames.push('backup');
      serviceColors.push('yellow');
    }
    serviceNames.push('server');
    serviceColors.push('magenta');
    if (!cliArgs.useWrangler) {
      serviceNames.push('worker');
      serviceColors.push('white');
    }
    serviceNames.push('frontend');
    serviceColors.push('green');

    const serviceLogWriters = createServiceLogWriters(serviceNames);
    const lineBuffers = { stdout: '', stderr: '' };



    // Start services with clean output monitoring
    const child = spawn('npx', [
      'concurrently', 
      '-c', serviceColors.join(','),
      '-n', serviceNames.join(','),
      '--handle-input',
      '--success', 'first',
      ...commands
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],  // Capture stdout/stderr initially
      shell: true,
      cwd: path.join(__dirname, '..'),
      // Create a new process group on Unix systems for proper cleanup
      detached: process.platform !== 'win32'
    });

    let startupComplete = false;
    let startupTimeout;
    let servicesStarted = new Set();
    let capturedOutput = '';
    const noisyLogAggregator = createNoisyLogAggregator();
    const outputBuffers = { stdout: '', stderr: '' };
    const noisySummaryInterval = setInterval(() => {
      flushNoisyLogSummary(noisyLogAggregator);
    }, 60_000);

    // Set a timeout for startup detection
    const timeoutDuration = config.useLocalFirebase ? 15000 : 10000; // Shorter timeout if no Firebase emulator
    startupTimeout = setTimeout(() => {
      if (!startupComplete) {
        clearInterval(spinnerInterval);
        process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear spinner line
        
        // Show any captured output first
        if (capturedOutput) {
          process.stdout.write(capturedOutput);
        }
        console.log('✅ All services are starting up...\n');
        showServiceInfo(availablePorts, cliArgs.useWrangler, config);
        startupComplete = true;
      }
    }, timeoutDuration);

    // Monitor output for service startup indicators
    child.stdout.on('data', (data) => {
      const output = data.toString();
      writePrefixedLinesToServiceLogs(output, 'stdout', lineBuffers, serviceLogWriters);
      
      if (!startupComplete) {
        const hasDatabaseStartFailure =
          output.includes('Failed to start database server') ||
          output.includes('Failed to start embedded PostgreSQL') ||
          output.includes('lock file "postmaster.pid" already exists');
        if (hasDatabaseStartFailure) {
          clearTimeout(startupTimeout);
          clearInterval(spinnerInterval);
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          if (capturedOutput) {
            process.stdout.write(capturedOutput);
          }
          process.stdout.write(output);
          console.error('❌ Database startup failed. Resolve the database lock/process and retry.');
          process.exit(1);
        }

        // Capture output during startup
        capturedOutput += output;
        
        // Look for the key startup indicators
        if (config.useLocalDatabase && !cliArgs.useWrangler && (output.includes('Database server ready!') || output.includes('✅ Embedded PostgreSQL started'))) {
          servicesStarted.add('database');
        }
        if (config.useLocalFirebase && (output.includes('Auth Emulator') || output.includes('emulator started'))) {
          servicesStarted.add('firebase');
        }
        if (output.includes('VITE') && output.includes('ready')) {
          servicesStarted.add('frontend');
        }
        if (output.includes('🚀 Starting backend server') || output.includes('API available') || output.includes('Ready on')) {
          servicesStarted.add('server');
        }

        // Check for startup completion
        const databaseReady = !config.useLocalDatabase || cliArgs.useWrangler || servicesStarted.has('database');
        const firebaseReady = !config.useLocalFirebase || (output.includes('All emulators ready!') || output.includes('✔  All emulators ready!'));
        const basicServicesReady = servicesStarted.has('server') && servicesStarted.has('frontend');
        
        const completionCondition = databaseReady && (config.useLocalFirebase ? firebaseReady : basicServicesReady);
          
        if (completionCondition && !startupComplete) {
          clearTimeout(startupTimeout);
          startupComplete = true;
          
          // Clear spinner and show output immediately
          clearInterval(spinnerInterval);
          process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear spinner line
          
          // Show all the captured startup output first
          process.stdout.write(capturedOutput);
          
          console.log('✅ All services started successfully!\n');
          showServiceInfo(availablePorts, cliArgs.useWrangler, config);
        }
      } else {
        writeFilteredConsoleOutput(output, 'stdout', outputBuffers, noisyLogAggregator);
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      writePrefixedLinesToServiceLogs(output, 'stderr', lineBuffers, serviceLogWriters);
      
      if (!startupComplete) {
        // Check for startup errors
        if (output.includes('Error:') || output.includes('error') || output.includes('failed')) {
          clearTimeout(startupTimeout);
          console.error('❌ Error during startup:');
          console.error(output);
          process.exit(1);
        }
      } else {
        writeFilteredConsoleOutput(output, 'stderr', outputBuffers, noisyLogAggregator);
      }
    });

    // Cleanup function
    const cleanup = () => {
      for (const writer of serviceLogWriters.values()) {
        if (!writer.writableEnded) {
          writer.end();
        }
      }
      clearInterval(noisySummaryInterval);
      flushNoisyLogSummary(noisyLogAggregator);
      if (envState) {
        restoreEnvFile(envState);
      }
      if (wranglerConfigState) {
        restoreWranglerConfig(wranglerConfigState);
      }
      if (firebaseConfigPath) {
        cleanupFirebaseConfig(firebaseConfigPath);
      }
    };

    // Cleanup on exit
    const signals = process.platform === 'win32' 
      ? ['SIGINT', 'SIGTERM', 'SIGBREAK']
      : ['SIGINT', 'SIGTERM'];
    
    const killChildProcesses = () => {
      if (child && !child.killed) {
        if (process.platform === 'win32') {
          // On Windows, kill the child process directly
          child.kill('SIGKILL');
        } else {
          // On Unix systems, kill the entire process group
          try {
            // Kill the process group (negative PID)
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            // Fallback to killing just the child process
            child.kill('SIGKILL');
          }
        }
      }
    };
    
    signals.forEach(signal => {
      process.on(signal, () => {
        console.log(`\n🛑 Shutting down services...`);
        cleanup();
        killChildProcesses();
        setTimeout(() => process.exit(0), 1000);
      });
    });

    child.on('exit', (code, signal) => {
      cleanup();
      if (code !== 0 && signal !== 'SIGKILL' && signal !== 'SIGTERM') {
        console.log(`\n❌ Services stopped with error code ${code}`);
      } else if (signal) {
        console.log(`\n✅ Services stopped by signal ${signal}`);
      }
      process.exit(code || 0);
    });

    child.on('error', (error) => {
      handleError(error, 'Error starting services');
    });

  } catch (error) {
    handleError(error);
  }
}

startServices().catch((error) => {
  handleError(error);
});