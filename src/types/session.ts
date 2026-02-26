import type { BuildState } from './build';
import type { ChatMessage } from './chat';
import type { Deployment } from './deploy';
import type { TelemetryEvent } from './telemetry';
import type { VirtualFileSystem } from './vfs';
import type { WorkItem } from './backlog';

/**
 * Supported LLM provider identifiers.
 */
export type LLMProviderName = 'openai' | 'anthropic' | 'google';

/**
 * Provider configuration for an LLM vendor.
 */
export interface LLMProvider {
  /**
   * Provider identifier.
   */
  name: LLMProviderName;
  /**
   * API key used to authenticate with the provider.
   */
  apiKey: string;
  /**
   * List of model ids available for selection.
   */
  models: string[];
}

/**
 * Model selection for a specific LLM role.
 */
export interface LLMModelSelection {
  /**
   * Provider configuration for this role.
   */
  provider: LLMProvider;
  /**
   * Model id chosen for this role.
   */
  model: string;
}

/**
 * LLM configuration for chat and builder roles.
 */
export interface LLMConfig {
  /**
   * Model selection used for chat responses.
   */
  chatModel: LLMModelSelection;
  /**
   * Model selection used for builder patch generation.
   */
  builderModel: LLMModelSelection;
}

/**
 * Session entry path indicating template or scratch flow.
 */
export type SessionPath = 'template' | 'scratch';

/**
 * Session lifecycle status.
 */
export type SessionStatus = 'active' | 'deployed' | 'archived';

/**
 * Represents a single active user session.
 */
export interface Session {
  /**
   * Unique session identifier.
   */
  id: string;
  /**
   * Unix timestamp (ms) when the session started.
   */
  createdAt: number;
  /**
   * Entry path for the session.
   */
  path: SessionPath;
  /**
   * Template id used for template-path sessions.
   */
  templateId?: string;
  /**
   * Current lifecycle status of the session.
   */
  status: SessionStatus;
  /**
   * LLM configuration used for this session.
   */
  llmConfig: LLMConfig;
  /**
   * Running total cost for the session.
   */
  totalCost: number;
}

/**
 * Aggregate studio state (single active session model).
 */
export interface StudioState {
  /**
   * Current session or null when no session exists.
   */
  session: Session | null;
  /**
   * Conversation history for the session.
   */
  conversation: ChatMessage[];
  /**
   * Ordered backlog items produced by the PO.
   */
  backlog: WorkItem[];
  /**
   * Virtual file system for the generated site.
   */
  vfs: VirtualFileSystem | null;
  /**
   * Current build state for the pipeline.
   */
  buildState: BuildState;
  /**
   * Deployments produced for this session.
   */
  deployments: Deployment[];
  /**
   * Telemetry events captured locally.
   */
  telemetry: TelemetryEvent[];
  /**
   * Active LLM configuration for the session.
   */
  llmConfig: LLMConfig;
}
