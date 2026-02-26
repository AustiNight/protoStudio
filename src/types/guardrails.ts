export type GuardrailSeverity = 'error' | 'warning';

export interface GuardrailViolation {
  id: string;
  message: string;
  severity: GuardrailSeverity;
}

export interface GuardrailReport {
  pass: boolean;
  violations: GuardrailViolation[];
}

export interface GuardrailDecision {
  allowSwap: boolean;
  action: 'proceed' | 'retry' | 'skip';
  poMessage: string;
}

export interface GuardrailInput {
  html: string;
  css: string;
  js: string;
  atom: AtomMetrics;
  deploy: DeploySelection;
  preview: PreviewSecurityInput;
}

export interface AtomMetrics {
  filesTouched: number;
  linesChanged: number;
  llmCalls: number;
  wallTimeMs: number;
  visibleChange: boolean;
}

export type HostId = 'github_pages' | 'cloudflare_pages' | 'netlify' | 'vercel';

export interface DeploySelection {
  selectedHost: HostId;
  availableHosts: HostId[];
}

export interface PreviewSecurityInput {
  cspHeader: string;
  sriEnabled: boolean;
}

export interface PreviewSecurityHeaders {
  csp: string;
  sriRequired: boolean;
}

export interface GuardrailDecisionInput {
  report: GuardrailReport;
  attempt: number;
  maxAttempts: number;
}
