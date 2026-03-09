import { runtimeConfig } from '../config/runtime-config';
import { useLogStore, type StudioLogLevel } from '../store/log-store';

interface StudioLogInput {
  level?: StudioLogLevel;
  source: string;
  message: string;
  details?: unknown;
  sessionId?: string;
  timestamp?: number;
}

const consoleMethods: Record<StudioLogLevel, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export function studioLog(input: StudioLogInput): void {
  const level = input.level ?? 'info';
  useLogStore.getState().append({
    ...input,
    level,
  });

  if (!shouldPrintToConsole(level)) {
    return;
  }

  const line = `[studio:${input.source}] ${input.message}`;
  if (input.details !== undefined) {
    consoleMethods[level](line, input.details);
    return;
  }
  consoleMethods[level](line);
}

function shouldPrintToConsole(level: StudioLogLevel): boolean {
  if (import.meta.env.MODE === 'test') {
    return false;
  }
  if (level === 'error' || level === 'warn') {
    return true;
  }
  return runtimeConfig.debugLogs;
}
