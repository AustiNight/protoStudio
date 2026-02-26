/**
 * Severity levels for guardrail violations.
 */
export type GuardrailSeverity = 'error' | 'warning';

/**
 * Single guardrail violation entry.
 */
export interface GuardrailViolation {
  /**
   * Unique violation identifier.
   */
  id: string;
  /**
   * Human-readable violation message.
   */
  message: string;
  /**
   * Severity for the violation.
   */
  severity: GuardrailSeverity;
}

/**
 * Guardrail report produced after validation.
 */
export interface GuardrailReport {
  /**
   * Whether all error-level checks passed.
   */
  pass: boolean;
  /**
   * List of violations detected.
   */
  violations: GuardrailViolation[];
}

/**
 * Decision produced by guardrails for a build attempt.
 */
export interface GuardrailDecision {
  /**
   * Whether the swap to green is allowed.
   */
  allowSwap: boolean;
  /**
   * Action to take after guardrail evaluation.
   */
  action: 'proceed' | 'retry' | 'skip';
  /**
   * Message to send to the PO chat.
   */
  poMessage: string;
}

/**
 * Input payload for guardrail evaluation.
 */
export interface GuardrailInput {
  /**
   * HTML content to validate.
   */
  html: string;
  /**
   * CSS content to validate.
   */
  css: string;
  /**
   * JavaScript content to validate.
   */
  js: string;
  /**
   * Builder atom metrics for size constraints.
   */
  atom: AtomMetrics;
  /**
   * Deployment host selection for zero-cost checks.
   */
  deploy: DeploySelection;
  /**
   * Preview security inputs for CSP/SRI checks.
   */
  preview: PreviewSecurityInput;
}

/**
 * Metrics describing a builder atom's size and cost.
 */
export interface AtomMetrics {
  /**
   * Number of files touched by the atom.
   */
  filesTouched: number;
  /**
   * Total lines changed by the atom.
   */
  linesChanged: number;
  /**
   * Number of LLM calls used by the atom.
   */
  llmCalls: number;
  /**
   * Wall-clock time in milliseconds for the atom.
   */
  wallTimeMs: number;
  /**
   * Whether the atom resulted in a visible change.
   */
  visibleChange: boolean;
}

/**
 * Host identifiers used for deployment selection.
 */
export type HostId = 'github_pages' | 'cloudflare_pages' | 'netlify' | 'vercel';

/**
 * Deployment host selection inputs.
 */
export interface DeploySelection {
  /**
   * Host chosen for deployment.
   */
  selectedHost: HostId;
  /**
   * List of available hosts based on token availability.
   */
  availableHosts: HostId[];
}

/**
 * Inputs needed for preview security checks.
 */
export interface PreviewSecurityInput {
  /**
   * CSP header applied to the preview iframe.
   */
  cspHeader: string;
  /**
   * Whether SRI is enforced for external assets.
   */
  sriEnabled: boolean;
}

/**
 * Security headers used by the preview iframe.
 */
export interface PreviewSecurityHeaders {
  /**
   * Content Security Policy string.
   */
  csp: string;
  /**
   * Whether SRI is required for assets.
   */
  sriRequired: boolean;
}

/**
 * Input payload for guardrail decisioning.
 */
export interface GuardrailDecisionInput {
  /**
   * Guardrail report to evaluate.
   */
  report: GuardrailReport;
  /**
   * Current attempt number (1-based).
   */
  attempt: number;
  /**
   * Maximum allowed attempts.
   */
  maxAttempts: number;
}
