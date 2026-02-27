import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { ChatMessage } from '../types/chat';
import type { CheckpointRecord } from '../types/persistence';
import type { AppError, ErrorCategory, Result } from '../types/result';
import type { TelemetryEvent } from '../types/telemetry';
import type { VfsSnapshot } from '../types/vfs';

export const STUDIO_DB_NAME = 'prontoproto-studio';
export const STUDIO_DB_VERSION = 1;

export interface StudioDB extends DBSchema {
  vfs: {
    key: string;
    value: VfsSnapshot;
  };
  conversation: {
    key: string;
    value: ChatMessage[];
  };
  checkpoints: {
    key: string;
    value: CheckpointRecord;
  };
  telemetry: {
    key: number;
    value: TelemetryEvent;
    indexes: { 'by-session': string };
  };
}

let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null;
let dbInstance: IDBPDatabase<StudioDB> | null = null;

export async function getStudioDb(): Promise<Result<IDBPDatabase<StudioDB>, AppError>> {
  if (!globalThis.indexedDB) {
    return err(
      'fatal',
      'IndexedDB is not available in this environment.',
      'indexeddb_unavailable',
    );
  }

  if (!dbPromise) {
    dbPromise = openDB<StudioDB>(STUDIO_DB_NAME, STUDIO_DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('vfs')) {
          database.createObjectStore('vfs');
        }
        if (!database.objectStoreNames.contains('conversation')) {
          database.createObjectStore('conversation');
        }
        if (!database.objectStoreNames.contains('checkpoints')) {
          database.createObjectStore('checkpoints');
        }
        if (!database.objectStoreNames.contains('telemetry')) {
          const telemetryStore = database.createObjectStore('telemetry', {
            autoIncrement: true,
          });
          telemetryStore.createIndex('by-session', 'sessionId');
        }
      },
    });
  }

  try {
    const db = await dbPromise;
    dbInstance = db;
    return ok(db);
  } catch (error) {
    dbPromise = null;
    dbInstance = null;
    return err(
      'retryable',
      'Failed to open IndexedDB.',
      'indexeddb_open_failed',
      error,
    );
  }
}

export function resetStudioDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  dbPromise = null;
}

function ok<T>(value: T): Result<T, AppError> {
  return { ok: true, value };
}

function err<T>(
  category: ErrorCategory,
  message: string,
  code: string,
  details?: unknown,
): Result<T, AppError> {
  return {
    ok: false,
    error: {
      category,
      message,
      code,
      details: details ? { reason: getErrorMessage(details) } : undefined,
    },
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}
