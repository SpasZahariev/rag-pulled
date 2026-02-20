import { getLogLevel, type LogLevel } from './env';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function getCurrentLogLevel(): LogLevel {
  return getLogLevel();
}

export function isLogLevelEnabled(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getCurrentLogLevel()];
}

function write(level: LogLevel, message: string, ...context: unknown[]): void {
  if (!isLogLevelEnabled(level)) {
    return;
  }

  if (level === 'debug' || level === 'info') {
    console.log(message, ...context);
    return;
  }

  if (level === 'warn') {
    console.warn(message, ...context);
    return;
  }

  console.error(message, ...context);
}

export const logger = {
  debug(message: string, ...context: unknown[]): void {
    write('debug', message, ...context);
  },
  info(message: string, ...context: unknown[]): void {
    write('info', message, ...context);
  },
  warn(message: string, ...context: unknown[]): void {
    write('warn', message, ...context);
  },
  error(message: string, ...context: unknown[]): void {
    write('error', message, ...context);
  },
};
