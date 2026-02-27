import type { WorkItem } from './backlog';
import type { ChatMessage } from './chat';
import type { Session } from './session';
import type { VfsSnapshot } from './vfs';

/**
 * Checkpoint metadata stored to recover an active session.
 */
export interface CheckpointRecord {
  /**
   * Session associated with the checkpoint.
   */
  session: Session;
  /**
   * Backlog items captured at checkpoint time.
   */
  backlog: WorkItem[];
  /**
   * Unix timestamp (ms) when the checkpoint was captured.
   */
  lastSavedAt: number;
}

/**
 * Full checkpoint payload used to restore studio state.
 */
export interface CheckpointData extends CheckpointRecord {
  /**
   * Persisted VFS snapshot for recovery.
   */
  vfs: VfsSnapshot;
  /**
   * Conversation messages captured at checkpoint time.
   */
  conversation: ChatMessage[];
}

/**
 * Lightweight recovery summary for UI prompts.
 */
export interface RecoveryState {
  /**
   * Session identifier associated with the recoverable checkpoint.
   */
  sessionId: string;
  /**
   * Unix timestamp (ms) when the checkpoint was captured.
   */
  lastSavedAt: number;
  /**
   * VFS version captured in the checkpoint.
   */
  vfsVersion: number;
  /**
   * Count of backlog items still remaining.
   */
  backlogRemaining: number;
}
