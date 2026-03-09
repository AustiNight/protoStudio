import { create } from 'zustand';

import { runtimeConfig } from '../config/runtime-config';

export type StudioLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StudioLogEntry {
  id: string;
  timestamp: number;
  level: StudioLogLevel;
  source: string;
  message: string;
  details?: string;
  sessionId?: string;
}

interface AppendLogInput {
  level?: StudioLogLevel;
  source: string;
  message: string;
  details?: unknown;
  sessionId?: string;
  timestamp?: number;
}

export interface LogStoreState {
  entries: StudioLogEntry[];
  maxEntries: number;
  append: (input: AppendLogInput) => void;
  clear: () => void;
  setMaxEntries: (maxEntries: number) => void;
  resetStore: () => void;
}

let logCounter = 0;

const initialState: Pick<LogStoreState, 'entries' | 'maxEntries'> = {
  entries: [],
  maxEntries: runtimeConfig.logViewerMaxEntries,
};

export const createLogStore = () =>
  create<LogStoreState>((set) => ({
    ...initialState,
    append: (input) =>
      set((state) => {
        const message = sanitizeMessage(input.message);
        if (!message) {
          return state;
        }

        const source = sanitizeSource(input.source);
        const timestamp = Number.isFinite(input.timestamp) ? Number(input.timestamp) : Date.now();
        const entry: StudioLogEntry = {
          id: buildLogId(timestamp),
          timestamp,
          level: input.level ?? 'info',
          source,
          message,
          details: serializeDetails(input.details),
          sessionId: input.sessionId,
        };
        const nextEntries = [...state.entries, entry];
        const maxEntries = Math.max(1, state.maxEntries);
        const trimmed =
          nextEntries.length > maxEntries
            ? nextEntries.slice(nextEntries.length - maxEntries)
            : nextEntries;

        return {
          ...state,
          entries: trimmed,
        };
      }),
    clear: () =>
      set((state) => ({
        ...state,
        entries: [],
      })),
    setMaxEntries: (maxEntries) =>
      set((state) => {
        const nextMax = Math.max(1, Math.floor(maxEntries));
        const trimmed =
          state.entries.length > nextMax
            ? state.entries.slice(state.entries.length - nextMax)
            : state.entries;
        return {
          ...state,
          maxEntries: nextMax,
          entries: trimmed,
        };
      }),
    resetStore: () =>
      set(() => ({
        entries: [],
        maxEntries: runtimeConfig.logViewerMaxEntries,
      })),
  }));

export const useLogStore = createLogStore();

function buildLogId(timestamp: number): string {
  logCounter += 1;
  return `log-${timestamp}-${logCounter}`;
}

function sanitizeSource(source: string): string {
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

function sanitizeMessage(message: string): string {
  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function serializeDetails(details: unknown): string | undefined {
  if (details === undefined) {
    return undefined;
  }
  if (typeof details === 'string') {
    const trimmed = details.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  try {
    const serialized = JSON.stringify(details, null, 2);
    if (!serialized) {
      return undefined;
    }
    return serialized.length > 2000 ? `${serialized.slice(0, 2000)}...` : serialized;
  } catch {
    return String(details);
  }
}
