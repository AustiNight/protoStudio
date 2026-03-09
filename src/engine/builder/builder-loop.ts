import type { BuildPhase, BuildState, PhaseTimeouts } from '../../types/build';
import type { WorkItem } from '../../types/backlog';
import type { ChatMessage } from '../../types/chat';
import type { BuildPatch } from '../../types/patch';
import type { AppError, Result } from '../../types/result';
import type { DeploySelection, PreviewSecurityInput } from '../../types/guardrails';
import type { TelemetryBuildErrorCategory, TelemetryBuildStatus } from '../../types/telemetry';

import { runGuardrails, decideGuardrailAction } from '../guardrails/guardrails';
import { ContextManager } from '../llm/context';
import { LLMGateway } from '../llm/gateway';
import { buildPreviewHtml } from '../vfs/preview';
import { VirtualFileSystem } from '../vfs/vfs';
import { CircuitBreakerTracker } from './circuit-breaker';
import { validateContinuity } from './continuity';
import { BuildHeartbeat } from './heartbeat';
import { PatchEngine } from './patch-engine';
import { ScaffoldAuditor } from './scaffold';
import { ScaffoldHealthManager } from './scaffold-health';

export type BuilderLoopStatus = 'idle' | 'paused' | 'success' | 'skipped';

export interface BuilderLoopOutcome {
  status: BuilderLoopStatus;
  atom: WorkItem | null;
  attempts: number;
  previewHtml?: string;
  violations?: string[];
}

export type BuilderLoopResult = Result<BuilderLoopOutcome, AppError>;

export interface GuardrailContext {
  deploy: DeploySelection;
  preview: PreviewSecurityInput;
}

export interface PreviewAdapter {
  inject: (html: string) => void;
  swap: () => void;
  getInactiveSlot?: () => 'blue' | 'green';
}

export interface BacklogController {
  getOnDeck: () => WorkItem | null;
  updateItem: (itemId: string, update: Partial<WorkItem>) => void;
  promoteNext: () => WorkItem | null;
  moveToEnd: (itemId: string) => void;
}

export type BuilderLoopEvent =
  | { type: 'phase_changed'; phase: BuildPhase; state: BuildState }
  | { type: 'retry'; atom: WorkItem; attempt: number; reason: string }
  | { type: 'skip'; atom: WorkItem; reason: string; next: WorkItem | null }
  | { type: 'swap'; atom: WorkItem; slot?: 'blue' | 'green' }
  | { type: 'warning'; phase: BuildPhase; elapsed: number }
  | { type: 'timeout'; phase: BuildPhase; elapsed: number }
  | { type: 'error'; atom: WorkItem | null; message: string };

export interface BuilderLoopEvents {
  onEvent?: (event: BuilderLoopEvent) => void;
}

export interface BuilderLoopTelemetry {
  onBuildStart?: (input: { atom: WorkItem; attempt: number; timestamp: number }) => void;
  onBuildPreview?: (input: { atom: WorkItem; durationMs: number; timestamp: number }) => void;
  onBuildComplete?: (input: {
    atom: WorkItem;
    durationMs: number;
    status: TelemetryBuildStatus;
    errorCategory?: TelemetryBuildErrorCategory;
    timestamp: number;
  }) => void;
  onBuildSwap?: (input: { atom: WorkItem; slot?: 'blue' | 'green'; timestamp: number }) => void;
}

export interface BuilderLoopOptions {
  gateway: LLMGateway;
  contextManager: ContextManager;
  patchEngine?: PatchEngine;
  scaffoldAuditor?: ScaffoldAuditor;
  scaffoldHealth?: ScaffoldHealthManager;
  circuitBreaker?: CircuitBreakerTracker;
  heartbeat?: BuildHeartbeat;
  phaseTimeouts?: PhaseTimeouts;
  maxAttempts?: number;
  now?: () => number;
  events?: BuilderLoopEvents;
  telemetry?: BuilderLoopTelemetry;
}

export interface BuilderLoopInput {
  vfs: VirtualFileSystem;
  backlog: BacklogController;
  conversation: ChatMessage[];
  preview: PreviewAdapter;
  guardrails: GuardrailContext;
  isPaused?: () => boolean;
}

interface RetryContext {
  reason: string;
  violations?: string[];
}

const DEFAULT_MAX_ATTEMPTS = 3;

const DEFAULT_PHASE_TIMEOUTS: PhaseTimeouts = {
  idle: { warn: 0, timeout: 0 },
  assembling_context: { warn: 3000, timeout: 5000 },
  awaiting_llm: { warn: 45_000, timeout: 90_000 },
  parsing_patch: { warn: 2000, timeout: 5000 },
  validating_patch: { warn: 2000, timeout: 5000 },
  applying_patch: { warn: 2000, timeout: 5000 },
  rendering_preview: { warn: 10_000, timeout: 20_000 },
  validating_preview: { warn: 10_000, timeout: 20_000 },
  swapping: { warn: 2000, timeout: 2000 },
  retrying: { warn: 0, timeout: 0 },
  skipping: { warn: 0, timeout: 0 },
  error: { warn: 0, timeout: 0 },
};

const initialBuildState: BuildState = {
  phase: 'idle',
  currentAtom: null,
  startedAt: 0,
  phaseStartedAt: 0,
  retryCount: 0,
  lastError: null,
};

export class BuilderLoop {
  private gateway: LLMGateway;
  private contextManager: ContextManager;
  private patchEngine: PatchEngine;
  private scaffoldAuditor: ScaffoldAuditor;
  private scaffoldHealth: ScaffoldHealthManager;
  private circuitBreaker: CircuitBreakerTracker;
  private heartbeat: BuildHeartbeat;
  private now: () => number;
  private maxAttempts: number;
  private events?: BuilderLoopEvents;
  private telemetry?: BuilderLoopTelemetry;
  private buildState: BuildState = { ...initialBuildState };

  constructor(options: BuilderLoopOptions) {
    this.gateway = options.gateway;
    this.contextManager = options.contextManager;
    this.patchEngine = options.patchEngine ?? new PatchEngine();
    this.scaffoldAuditor = options.scaffoldAuditor ?? new ScaffoldAuditor();
    this.scaffoldHealth =
      options.scaffoldHealth ??
      new ScaffoldHealthManager({ auditor: this.scaffoldAuditor });
    this.circuitBreaker = options.circuitBreaker ?? new CircuitBreakerTracker();
    const phaseTimeouts = options.phaseTimeouts ?? DEFAULT_PHASE_TIMEOUTS;
    this.heartbeat = options.heartbeat ?? new BuildHeartbeat(phaseTimeouts);
    this.now = options.now ?? (() => Date.now());
    this.maxAttempts = sanitizeMaxAttempts(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
    this.events = options.events;
    this.telemetry = options.telemetry;
  }

  getState(): BuildState {
    return { ...this.buildState };
  }

  async run(input: BuilderLoopInput): Promise<BuilderLoopResult> {
    const atom = input.backlog.getOnDeck();
    if (!atom) {
      this.resetBuildState();
      return okResult({ status: 'idle', atom: null, attempts: 0 });
    }

    if (input.isPaused?.()) {
      this.resetBuildState();
      return okResult({ status: 'paused', atom, attempts: 0 });
    }

    if (!this.circuitBreaker.canAttempt(atom.id)) {
      const outcome = this.skipAtom(atom, input.backlog, 'Circuit breaker open.', 0);
      this.recordBuildFailure(atom, this.now(), 'unknown');
      return okResult(outcome);
    }

    this.startBuild(atom);
    this.heartbeat.start(this.buildState, {
      onWarning: (phase, elapsed) => {
        this.emit({ type: 'warning', phase, elapsed });
      },
      onTimeout: (phase, elapsed) => {
        this.emit({ type: 'timeout', phase, elapsed });
      },
    });

    let attempt = 0;
    let retryContext: RetryContext | null = null;

    while (attempt < this.maxAttempts) {
      attempt += 1;
      const attemptStartedAt = this.now();
      this.telemetry?.onBuildStart?.({
        atom,
        attempt,
        timestamp: attemptStartedAt,
      });

      input.backlog.updateItem(atom.id, { status: 'in_progress' });

      this.setPhase('assembling_context');
      const context = this.contextManager.assembleBuildContext(
        atom,
        input.vfs,
        input.conversation,
      );

      const builderPrompt = buildBuilderPrompt(
        context,
        retryContext,
        typeof atom.expectedSectionDelta === 'number' ? atom.expectedSectionDelta : 0,
      );

      this.setPhase('awaiting_llm');
      const llmResult = await this.gateway.send({
        role: 'builder',
        systemPrompt: context.systemPrompt,
        messages: [{ role: 'user', content: builderPrompt }],
        responseFormat: 'json',
      });

      if (!llmResult.ok) {
        if (llmResult.error.category === 'retryable') {
          const decision = this.recordFailure(atom, llmResult.error.message, attempt);
          this.recordBuildFailure(atom, attemptStartedAt, 'llm');
          if (decision.action === 'retry') {
            retryContext = { reason: llmResult.error.message };
            continue;
          }
          const outcome = this.skipAtom(atom, input.backlog, llmResult.error.message, attempt);
          return okResult(outcome);
        }

        const errorMessage = llmResult.error.message || 'Builder AI failed.';
        this.setPhase('error');
        this.buildState.lastError = errorMessage;
        this.emit({ type: 'error', atom, message: errorMessage });
        this.recordBuildFailure(atom, attemptStartedAt, 'llm');
        this.heartbeat.stop();
        return errResult({
          category: llmResult.error.category,
          message: errorMessage,
          code: llmResult.error.code,
          details: llmResult.error.details,
        });
      }

      this.setPhase('parsing_patch');
      const parsed = parsePatchResponse(llmResult.value.content);
      if (!parsed.ok) {
        const decision = this.recordFailure(atom, parsed.error.message, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'patch');
        if (decision.action === 'retry') {
          retryContext = { reason: parsed.error.message };
          continue;
        }
        const outcome = this.skipAtom(atom, input.backlog, parsed.error.message, attempt);
        return okResult(outcome);
      }

      const patch = normalizePatchForRuntime(parsed.value, input.vfs);
      this.setPhase('validating_patch');

      const patchValidationError = validatePatch(atom, input.vfs, patch);
      if (patchValidationError) {
        const decision = this.recordFailure(atom, patchValidationError, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'patch');
        if (decision.action === 'retry') {
          retryContext = { reason: patchValidationError };
          continue;
        }
        const outcome = this.skipAtom(atom, input.backlog, patchValidationError, attempt);
        return okResult(outcome);
      }

      this.setPhase('applying_patch');
      const before = input.vfs.clone();
      const sandbox = input.vfs.clone();
      const patchResult = await this.patchEngine.apply(sandbox, patch);
      if (!patchResult.success) {
        const failedOpDetail = patchResult.failedOp
          ? ` Failed op: ${JSON.stringify(patchResult.failedOp)}`
          : '';
        const reason = `${patchResult.error ?? 'Patch application failed.'}${failedOpDetail}`;
        const decision = this.recordFailure(atom, reason, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'patch');
        if (decision.action === 'retry') {
          retryContext = { reason };
          continue;
        }
        const outcome = this.skipAtom(atom, input.backlog, reason, attempt);
        return okResult(outcome);
      }

      this.setPhase('rendering_preview');
      const previewResult = buildPreviewHtml(sandbox);
      if (!previewResult.ok) {
        const reason = previewResult.error.message;
        const decision = this.recordFailure(atom, reason, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'patch');
        if (decision.action === 'retry') {
          retryContext = { reason };
          continue;
        }
        const outcome = this.skipAtom(atom, input.backlog, reason, attempt);
        return okResult(outcome);
      }

      this.telemetry?.onBuildPreview?.({
        atom,
        durationMs: Math.max(0, this.now() - attemptStartedAt),
        timestamp: this.now(),
      });

      this.setPhase('validating_preview');
      const continuity = validateContinuity(before, sandbox, atom);
      if (!continuity.pass) {
        const reason = `Continuity failed: ${continuity.violations.join(' | ')}`;
        const decision = this.recordFailure(atom, reason, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');
        if (decision.action === 'retry') {
          retryContext = { reason, violations: continuity.violations };
          continue;
        }
        const outcome = this.skipAtom(atom, input.backlog, reason, attempt, continuity.violations);
        return okResult(outcome);
      }

      const scaffold = this.scaffoldAuditor.audit(sandbox);
      const scaffoldErrors = scaffold.issues.filter((issue) => issue.severity === 'error');
      if (scaffoldErrors.length > 0) {
        const violations = scaffoldErrors.map(
          (issue) => `${issue.file}: ${issue.anchor} (${issue.problem})`,
        );
        const reason = `Scaffold audit failed: ${violations.join(' | ')}`;
        const decision = this.recordFailure(atom, reason, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');
        if (decision.action === 'retry') {
          retryContext = { reason, violations };
          continue;
        }
        const outcome = this.skipAtom(atom, input.backlog, reason, attempt, violations);
        return okResult(outcome);
      }

      const previewFiles = collectPreviewFiles(sandbox, previewResult.value.pagePath);
      const metrics = buildAtomMetrics(
        before,
        sandbox,
        attempt,
        attemptStartedAt,
        this.now,
      );
      if (!metrics.visibleChange) {
        const reason = 'Patch produced no visible changes.';
        const decision = this.recordFailure(atom, reason, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');
        if (decision.action === 'retry') {
          retryContext = { reason };
          continue;
        }
        const outcome = this.skipAtom(atom, input.backlog, reason, attempt);
        return okResult(outcome);
      }

      const guardrailReport = runGuardrails({
        html: previewFiles.html,
        css: previewFiles.css,
        js: previewFiles.js,
        atom: metrics,
        deploy: input.guardrails.deploy,
        preview: input.guardrails.preview,
      });

      if (!guardrailReport.pass) {
        const decision = decideGuardrailAction({
          report: guardrailReport,
          attempt,
          maxAttempts: this.maxAttempts,
        });
        const violationMessages = guardrailReport.violations.map(
          (violation) => violation.message,
        );
        const reason = decision.poMessage;
        const breakerDecision = this.recordFailure(atom, reason, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');

        if (decision.action === 'retry' && breakerDecision.action === 'retry') {
          retryContext = { reason, violations: violationMessages };
          continue;
        }

        const outcome = this.skipAtom(atom, input.backlog, reason, attempt, violationMessages);
        return okResult(outcome);
      }

      commitSandbox(input.vfs, sandbox);
      const nextVersion = input.vfs.getVersion();
      input.backlog.updateItem(atom.id, {
        status: 'done',
        buildVersion: nextVersion,
        completedAt: this.now(),
      });
      input.backlog.promoteNext();

      this.setPhase('swapping');
      input.preview.inject(previewResult.value.html);
      input.preview.swap();
      this.emit({
        type: 'swap',
        atom,
        slot: input.preview.getInactiveSlot?.(),
      });
      this.telemetry?.onBuildSwap?.({
        atom,
        slot: input.preview.getInactiveSlot?.(),
        timestamp: this.now(),
      });

      await this.scaffoldHealth.evaluate(input.vfs);

      this.circuitBreaker.recordSuccess(atom.id, this.maxAttempts);
      this.telemetry?.onBuildComplete?.({
        atom,
        durationMs: Math.max(0, this.now() - attemptStartedAt),
        status: 'success',
        timestamp: this.now(),
      });
      this.resetBuildState();

      return okResult({
        status: 'success',
        atom,
        attempts: attempt,
        previewHtml: previewResult.value.html,
        violations: undefined,
      });
    }

    const outcome = this.skipAtom(
      atom,
      input.backlog,
      `Exceeded ${this.maxAttempts} attempts.`,
      attempt,
    );
    this.recordBuildFailure(atom, this.buildState.startedAt || this.now(), 'unknown');
    return okResult(outcome);
  }

  private startBuild(atom: WorkItem): void {
    const now = this.now();
    this.buildState = {
      phase: 'assembling_context',
      currentAtom: atom,
      startedAt: now,
      phaseStartedAt: now,
      retryCount: 0,
      lastError: null,
    };
    this.emit({
      type: 'phase_changed',
      phase: this.buildState.phase,
      state: { ...this.buildState },
    });
  }

  private resetBuildState(): void {
    this.buildState = { ...initialBuildState };
    this.emit({
      type: 'phase_changed',
      phase: 'idle',
      state: { ...this.buildState },
    });
    this.heartbeat.stop();
  }

  private setPhase(phase: BuildPhase): void {
    this.buildState.phase = phase;
    this.buildState.phaseStartedAt = this.now();
    this.heartbeat.onPhaseChange(phase);
    this.emit({ type: 'phase_changed', phase, state: { ...this.buildState } });
  }

  private recordFailure(atom: WorkItem, reason: string, attempt: number) {
    this.buildState.lastError = reason;
    const decision = this.circuitBreaker.recordFailure(
      atom.id,
      reason,
      this.maxAttempts,
    );
    if (decision.action === 'retry') {
      this.buildState.retryCount = attempt;
      this.setPhase('retrying');
      this.emit({ type: 'retry', atom, attempt, reason });
    }
    return decision;
  }

  private recordBuildFailure(
    atom: WorkItem,
    startedAt: number,
    category: TelemetryBuildErrorCategory,
  ): void {
    this.telemetry?.onBuildComplete?.({
      atom,
      durationMs: Math.max(0, this.now() - startedAt),
      status: 'failed',
      errorCategory: category,
      timestamp: this.now(),
    });
  }

  private skipAtom(
    atom: WorkItem,
    backlog: BacklogController,
    reason: string,
    attempts: number,
    violations?: string[],
  ): BuilderLoopOutcome {
    backlog.updateItem(atom.id, { status: 'backlog' });
    backlog.moveToEnd(atom.id);
    const next = backlog.promoteNext();

    this.setPhase('skipping');
    this.emit({ type: 'skip', atom, reason, next });
    this.resetBuildState();

    return {
      status: 'skipped',
      atom,
      attempts,
      violations,
    };
  }

  private emit(event: BuilderLoopEvent): void {
    this.events?.onEvent?.(event);
  }
}

function buildBuilderPrompt(context: {
  siteManifestJson: string;
  workItemJson: string;
  cssVariables: string;
  affectedSections: unknown[];
  adjacentSections: unknown[];
  patchFormat: string;
  conversation: ChatMessage[];
}, retry: RetryContext | null, expectedSectionDelta = 0): string {
  const sections: string[] = [];

  if (retry) {
    sections.push('Previous attempt failed. Fix the issues and output only JSON patch ops.');
    sections.push(retry.reason);
    if (retry.violations && retry.violations.length > 0) {
      sections.push(`Violations:\n${formatViolations(retry.violations)}`);
    }
  }

  sections.push('Work item:');
  sections.push(context.workItemJson);
  sections.push('Site manifest:');
  sections.push(context.siteManifestJson);
  sections.push('CSS variables:');
  sections.push(context.cssVariables || '');
  sections.push('Affected sections:');
  sections.push(JSON.stringify(context.affectedSections, null, 2));
  sections.push('Adjacent sections (read-only):');
  sections.push(JSON.stringify(context.adjacentSections, null, 2));
  sections.push('Patch format:');
  sections.push(context.patchFormat || '');
  sections.push('Hard constraints:');
  sections.push('- Output exactly one JSON object (no markdown, no prose).');
  sections.push(
    '- Use only supported op values: section.replace, section.insert, section.delete, css.append, css.replace, js.append, js.replace, file.create, file.delete, meta.update.',
  );
  sections.push('- Do not emit alias op names such as asset.create or file.add.');
  sections.push('- Set targetVersion and each ifVersion to the current VFS version.');
  sections.push(`- Expected section delta: ${expectedSectionDelta}.`);
  if (expectedSectionDelta === 0) {
    sections.push('- Do not add or remove sections. Avoid section.insert and section.delete.');
  }
  if (
    retry?.violations?.some((violation) => violation.startsWith('section_count_delta'))
  ) {
    sections.push('- Previous retry changed section count. Keep section count unchanged.');
  }
  sections.push('Conversation:');
  sections.push(JSON.stringify(context.conversation, null, 2));

  return sections.filter((section) => section.trim().length > 0).join('\n\n');
}

function normalizePatchForRuntime(
  patch: BuildPatch,
  vfs: VirtualFileSystem,
): BuildPatch {
  const currentVersion = vfs.getVersion();
  if (patch.targetVersion === currentVersion) {
    return patch;
  }
  return {
    ...patch,
    targetVersion: currentVersion,
  };
}

function parsePatchResponse(raw: string): Result<BuildPatch, AppError> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return errResult({
      category: 'retryable',
      message: 'Builder response was empty.',
      code: 'patch_empty',
    });
  }

  const extracted = extractJsonPayload(trimmed);
  if (!extracted) {
    return errResult({
      category: 'retryable',
      message: 'Builder response did not include JSON patch data.',
      code: 'patch_missing',
    });
  }

  const parsed = safeJsonParse(extracted);
  if (!parsed.ok) {
    return errResult({
      category: 'retryable',
      message: 'Builder response contained invalid JSON.',
      code: 'patch_parse',
      details: { error: parsed.error.message },
    });
  }

  if (!isBuildPatch(parsed.value)) {
    return errResult({
      category: 'retryable',
      message: 'Builder response did not match BuildPatch schema.',
      code: 'patch_schema',
    });
  }

  return okResult(parsed.value);
}

function validatePatch(
  atom: WorkItem,
  vfs: VirtualFileSystem,
  patch: BuildPatch,
): string | null {
  if (patch.workItemId !== atom.id) {
    return `Patch workItemId "${patch.workItemId}" does not match On Deck item "${atom.id}".`;
  }
  if (patch.operations.length === 0) {
    return 'Patch contained no operations.';
  }
  if (patch.targetVersion !== vfs.getVersion()) {
    return `Patch target version ${patch.targetVersion} does not match VFS version ${vfs.getVersion()}.`;
  }
  return null;
}

function collectPreviewFiles(vfs: VirtualFileSystem, pagePath: string): {
  html: string;
  css: string;
  js: string;
} {
  const html = vfs.getFile(pagePath)?.content ?? '';
  const css = vfs.getFile('styles.css')?.content ?? '';
  const js = vfs.getFile('main.js')?.content ?? '';
  return { html, css, js };
}

function buildAtomMetrics(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
  llmCalls: number,
  startedAt: number,
  now: () => number,
) {
  const diff = diffFileChanges(before, after);
  const metadataChanged = hasMetadataChanged(before, after);
  const filesTouched = diff.changedFiles.length + (metadataChanged ? 1 : 0);
  const linesChanged = diff.linesChanged + (metadataChanged ? 1 : 0);
  const wallTimeMs = Math.max(0, now() - startedAt);
  const visibleChange = linesChanged > 0 || metadataChanged;

  return {
    filesTouched,
    linesChanged,
    llmCalls,
    wallTimeMs,
    visibleChange,
  };
}

function diffFileChanges(before: VirtualFileSystem, after: VirtualFileSystem): {
  changedFiles: string[];
  linesChanged: number;
} {
  const paths = new Set<string>();
  for (const path of before.files.keys()) {
    paths.add(path);
  }
  for (const path of after.files.keys()) {
    paths.add(path);
  }

  const changedFiles: string[] = [];
  let linesChanged = 0;

  for (const path of paths) {
    const beforeFile = before.files.get(path);
    const afterFile = after.files.get(path);
    const beforeContent = beforeFile ? beforeFile.content : '';
    const afterContent = afterFile ? afterFile.content : '';
    if (!beforeFile || !afterFile || beforeContent !== afterContent) {
      changedFiles.push(path);
    }
    if (beforeContent !== afterContent) {
      linesChanged += countLineChanges(beforeContent, afterContent);
    }
  }

  return { changedFiles, linesChanged };
}

function countLineChanges(before: string, after: string): number {
  if (before === after) {
    return 0;
  }
  const beforeCounts = countLineMap(before);
  const afterCounts = countLineMap(after);
  const keys = new Set<string>([...beforeCounts.keys(), ...afterCounts.keys()]);
  let changes = 0;
  for (const key of keys) {
    const beforeCount = beforeCounts.get(key) ?? 0;
    const afterCount = afterCounts.get(key) ?? 0;
    changes += Math.abs(afterCount - beforeCount);
  }
  return changes;
}

function countLineMap(content: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const count = map.get(line) ?? 0;
    map.set(line, count + 1);
  }
  return map;
}

function hasMetadataChanged(before: VirtualFileSystem, after: VirtualFileSystem): boolean {
  const beforeMeta = before.metadata;
  const afterMeta = after.metadata;
  if (beforeMeta.title !== afterMeta.title) return true;
  if (beforeMeta.description !== afterMeta.description) return true;
  if (!shallowEqual(beforeMeta.colors, afterMeta.colors)) return true;
  if (!shallowEqual(beforeMeta.fonts, afterMeta.fonts)) return true;
  return false;
}

function shallowEqual<T extends object, U extends object>(left: T, right: U): boolean {
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (leftRecord[key] !== rightRecord[key]) {
      return false;
    }
  }
  return true;
}

function extractJsonPayload(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return trimmed.slice(start, end + 1).trim();
}

function safeJsonParse(value: string): Result<unknown, Error> {
  try {
    return okResult(JSON.parse(value) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse error.';
    return errResult(new Error(message));
  }
}

function isBuildPatch(value: unknown): value is BuildPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.workItemId !== 'string') {
    return false;
  }
  if (typeof record.targetVersion !== 'number') {
    return false;
  }
  if (!Array.isArray(record.operations)) {
    return false;
  }
  return true;
}

function commitSandbox(target: VirtualFileSystem, source: VirtualFileSystem): void {
  target.files = source.files;
  target.version = source.version;
  target.templateId = source.templateId;
  target.metadata = source.metadata;
}

function formatViolations(violations: string[]): string {
  return violations.map((violation) => `- ${violation}`).join('\n');
}

function sanitizeMaxAttempts(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  return rounded >= 1 ? rounded : fallback;
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
