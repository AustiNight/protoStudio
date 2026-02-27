import type { AppError, ErrorCategory, Result } from '../types/result';
import type { TelemetryEvent } from '../types/telemetry';
import { getStudioDb } from './db';

export class TelemetryLog {
  async append(event: TelemetryEvent): Promise<Result<void, AppError>> {
    const dbResult = await getStudioDb();
    if (!dbResult.ok) {
      return dbResult;
    }

    try {
      const db = dbResult.value;
      const tx = db.transaction('telemetry', 'readwrite');
      await tx.store.add(event);
      await tx.done;
      return ok(undefined);
    } catch (error) {
      return err(
        'retryable',
        'Failed to append telemetry event.',
        'telemetry_append_failed',
        error,
      );
    }
  }

  async getEvents(sessionId: string): Promise<Result<TelemetryEvent[], AppError>> {
    const dbResult = await getStudioDb();
    if (!dbResult.ok) {
      return dbResult;
    }

    try {
      const db = dbResult.value;
      const events = await db.getAllFromIndex('telemetry', 'by-session', sessionId);
      return ok(events);
    } catch (error) {
      return err(
        'retryable',
        'Failed to read telemetry events.',
        'telemetry_read_failed',
        error,
      );
    }
  }

  async exportAsJSON(sessionId: string): Promise<Result<string, AppError>> {
    const eventsResult = await this.getEvents(sessionId);
    if (!eventsResult.ok) {
      return eventsResult;
    }

    try {
      return ok(JSON.stringify(eventsResult.value));
    } catch (error) {
      return err(
        'fatal',
        'Failed to serialize telemetry events.',
        'telemetry_export_failed',
        error,
      );
    }
  }

  async clear(sessionId: string): Promise<Result<void, AppError>> {
    const dbResult = await getStudioDb();
    if (!dbResult.ok) {
      return dbResult;
    }

    try {
      const db = dbResult.value;
      const tx = db.transaction('telemetry', 'readwrite');
      const index = tx.store.index('by-session');
      let cursor = await index.openCursor(sessionId);
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
      return ok(undefined);
    } catch (error) {
      return err(
        'retryable',
        'Failed to clear telemetry events.',
        'telemetry_clear_failed',
        error,
      );
    }
  }
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
