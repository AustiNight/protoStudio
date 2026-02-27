import type { StudioState } from '../types/session';
import type { CheckpointData, CheckpointRecord, RecoveryState } from '../types/persistence';
import type { AppError, ErrorCategory, Result } from '../types/result';
import type { VirtualFile, VirtualFileSystem, VfsSnapshot } from '../types/vfs';
import { getStudioDb } from './db';

const CHECKPOINT_KEY = 'active';
const MAX_CONVERSATION_MESSAGES = 20;

export class SessionCheckpoint {
  async save(state: StudioState): Promise<Result<void, AppError>> {
    if (!state.session) {
      return err(
        'user_action',
        'No active session available for checkpointing.',
        'checkpoint_missing_session',
      );
    }
    if (!state.vfs) {
      return err(
        'user_action',
        'No VFS available for checkpointing.',
        'checkpoint_missing_vfs',
      );
    }

    const checkpoint: CheckpointRecord = {
      session: state.session,
      backlog: state.backlog,
      lastSavedAt: Date.now(),
    };
    const vfsSnapshot = serializeVfs(state.vfs);
    const conversation = state.conversation.slice(-MAX_CONVERSATION_MESSAGES);

    const dbResult = await getStudioDb();
    if (!dbResult.ok) {
      return dbResult;
    }

    try {
      const db = dbResult.value;
      const tx = db.transaction(['checkpoints', 'vfs', 'conversation'], 'readwrite');
      await tx.objectStore('checkpoints').put(checkpoint, CHECKPOINT_KEY);
      await tx.objectStore('vfs').put(vfsSnapshot, CHECKPOINT_KEY);
      await tx.objectStore('conversation').put(conversation, CHECKPOINT_KEY);
      await tx.done;
      return ok(undefined);
    } catch (error) {
      return err(
        'retryable',
        'Failed to write checkpoint to IndexedDB.',
        'checkpoint_write_failed',
        error,
      );
    }
  }

  async load(): Promise<Result<CheckpointData | null, AppError>> {
    const dbResult = await getStudioDb();
    if (!dbResult.ok) {
      return dbResult;
    }

    try {
      const db = dbResult.value;
      const tx = db.transaction(['checkpoints', 'vfs', 'conversation'], 'readonly');
      const record = await tx.objectStore('checkpoints').get(CHECKPOINT_KEY);
      const vfs = await tx.objectStore('vfs').get(CHECKPOINT_KEY);
      const conversation =
        (await tx.objectStore('conversation').get(CHECKPOINT_KEY)) ?? [];
      await tx.done;

      if (!record || !vfs) {
        return ok(null);
      }

      return ok({
        ...record,
        vfs,
        conversation,
      });
    } catch (error) {
      return err(
        'retryable',
        'Failed to load checkpoint from IndexedDB.',
        'checkpoint_load_failed',
        error,
      );
    }
  }

  async detectRecovery(): Promise<Result<RecoveryState | null, AppError>> {
    const loadResult = await this.load();
    if (!loadResult.ok) {
      return loadResult;
    }

    const checkpoint = loadResult.value;
    if (!checkpoint || !checkpoint.session) {
      return ok(null);
    }

    if (checkpoint.session.status === 'deployed') {
      return ok(null);
    }

    const backlogRemaining = checkpoint.backlog.filter(
      (item) => item.status === 'backlog',
    ).length;

    return ok({
      sessionId: checkpoint.session.id,
      lastSavedAt: checkpoint.lastSavedAt,
      vfsVersion: checkpoint.vfs.version,
      backlogRemaining,
    });
  }

  async clear(): Promise<Result<void, AppError>> {
    const dbResult = await getStudioDb();
    if (!dbResult.ok) {
      return dbResult;
    }

    try {
      const db = dbResult.value;
      const tx = db.transaction(['checkpoints', 'vfs', 'conversation'], 'readwrite');
      await tx.objectStore('checkpoints').delete(CHECKPOINT_KEY);
      await tx.objectStore('vfs').delete(CHECKPOINT_KEY);
      await tx.objectStore('conversation').delete(CHECKPOINT_KEY);
      await tx.done;
      return ok(undefined);
    } catch (error) {
      return err(
        'retryable',
        'Failed to clear checkpoint data.',
        'checkpoint_clear_failed',
        error,
      );
    }
  }
}

function serializeVfs(vfs: VirtualFileSystem): VfsSnapshot {
  const files = Array.from(vfs.files.values())
    .map((file) => cloneFile(file))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    version: vfs.version,
    templateId: vfs.templateId,
    metadata: {
      title: vfs.metadata.title,
      description: vfs.metadata.description,
      colors: { ...vfs.metadata.colors },
      fonts: { ...vfs.metadata.fonts },
    },
  };
}

function cloneFile(file: VirtualFile): VirtualFile {
  return {
    path: file.path,
    content: file.content,
    hash: file.hash,
    lastModified: file.lastModified,
  };
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
