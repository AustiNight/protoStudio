import type { WorkItem } from './backlog';
import type { VirtualFileSystem } from './vfs';

/**
 * Fine-grained phase within the build pipeline.
 */
export type BuildPhase =
  | 'idle'
  | 'assembling_context'
  | 'awaiting_llm'
  | 'parsing_patch'
  | 'validating_patch'
  | 'applying_patch'
  | 'rendering_preview'
  | 'validating_preview'
  | 'swapping'
  | 'retrying'
  | 'skipping'
  | 'error';

/**
 * Runtime state for the build pipeline.
 */
export interface BuildState {
  /**
   * Current build phase.
   */
  phase: BuildPhase;
  /**
   * Atom currently being built, if any.
   */
  currentAtom: WorkItem | null;
  /**
   * Unix timestamp (ms) when the build started.
   */
  startedAt: number;
  /**
   * Unix timestamp (ms) when the current phase started.
   */
  phaseStartedAt: number;
  /**
   * Current retry count for the active atom.
   */
  retryCount: number;
  /**
   * Last error encountered during the build, if any.
   */
  lastError: string | null;
}

/**
 * Circuit breaker state for a single atom.
 */
export interface CircuitBreaker {
  /**
   * Atom identifier being tracked.
   */
  atomId: string;
  /**
   * Number of failed attempts so far.
   */
  attempts: number;
  /**
   * Maximum number of attempts allowed before skipping.
   */
  maxAttempts: number;
  /**
   * Last recorded error message.
   */
  lastError: string;
  /**
   * Current breaker state.
   */
  state: 'closed' | 'open' | 'half-open';
}

/**
 * Result from an individual continuity check.
 */
export interface ContinuityResult {
  /**
   * Whether the check passed.
   */
  pass: boolean;
  /**
   * Reason for failure when the check does not pass.
   */
  reason?: string;
}

/**
 * Health score and anchor integrity metrics for the scaffold.
 */
export interface ScaffoldHealth {
  /**
   * Overall health score from 0 to 100.
   */
  score: number;
  /**
   * Count of intact HTML section anchors.
   */
  sectionsIntact: number;
  /**
   * Total expected HTML section anchors.
   */
  sectionsTotal: number;
  /**
   * Count of intact CSS block anchors.
   */
  cssBlocksIntact: number;
  /**
   * Total expected CSS block anchors.
   */
  cssBlocksTotal: number;
  /**
   * Count of intact JS function anchors.
   */
  jsFuncsIntact: number;
  /**
   * Total expected JS function anchors.
   */
  jsFuncsTotal: number;
  /**
   * List of detected scaffold issues.
   */
  issues: ScaffoldIssue[];
}

/**
 * Single scaffold integrity issue.
 */
export interface ScaffoldIssue {
  /**
   * Severity of the issue.
   */
  severity: 'warning' | 'error';
  /**
   * File path where the issue was detected.
   */
  file: string;
  /**
   * Anchor identifier related to the issue.
   */
  anchor: string;
  /**
   * Issue type detected for the anchor.
   */
  problem: 'missing_open' | 'missing_close' | 'malformed' | 'mismatched' | 'orphaned';
  /**
   * Whether the issue can be auto-repaired.
   */
  autoRepairable: boolean;
}

/**
 * Token budget allocation for context assembly.
 */
export interface ContextBudget {
  /**
   * Model name used for the budget.
   */
  model: string;
  /**
   * Maximum tokens allowed by the model.
   */
  maxTokens: number;
  /**
   * Tokens reserved for the model response.
   */
  reservedForOutput: number;
  /**
   * Tokens available for prompt context.
   */
  available: number;
  /**
   * Tokens allocated to the system prompt.
   */
  systemPrompt: number;
  /**
   * Tokens allocated to the site manifest.
   */
  siteManifest: number;
  /**
   * Tokens allocated to affected sections.
   */
  affectedSections: number;
  /**
   * Tokens allocated to adjacent sections.
   */
  adjacentContext: number;
  /**
   * Tokens allocated to the work item description.
   */
  workItem: number;
  /**
   * Tokens allocated to the patch format instructions.
   */
  patchFormat: number;
  /**
   * Tokens allocated to conversation history.
   */
  conversationHistory: number;
}

/**
 * Timeout configuration for a single build phase.
 */
export interface PhaseTimeout {
  /**
   * Warning threshold in milliseconds.
   */
  warn: number;
  /**
   * Hard timeout threshold in milliseconds.
   */
  timeout: number;
}

/**
 * Timeout configuration map keyed by build phase.
 */
export type PhaseTimeouts = Record<BuildPhase, PhaseTimeout>;

/**
 * Continuity check function signature.
 */
export interface ContinuityCheck {
  /**
   * Name of the continuity check.
   */
  name: string;
  /**
   * Check function comparing before and after VFS states.
   */
  check: (before: VirtualFileSystem, after: VirtualFileSystem) => ContinuityResult;
}
