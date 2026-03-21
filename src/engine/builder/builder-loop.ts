import type { BuildPhase, BuildState, PhaseTimeouts } from '../../types/build';
import type { WorkItem } from '../../types/backlog';
import type { ChatMessage } from '../../types/chat';
import type { BuildPatch } from '../../types/patch';
import type { AppError, Result } from '../../types/result';
import type { DeploySelection, PreviewSecurityInput } from '../../types/guardrails';
import type { TelemetryBuildErrorCategory, TelemetryBuildStatus } from '../../types/telemetry';

import { runGuardrails, decideGuardrailAction } from '../guardrails/guardrails';
import { assessImageryEscalation } from '../content/image-escalation';
import { runImageryExecutor } from '../imagery/executor';
import { resolveImageryPlaceholdersInVfs, type ImageryResolver } from '../imagery/placeholders';
import { ContextManager } from '../llm/context';
import { LLMGateway } from '../llm/gateway';
import { buildPreviewHtml } from '../vfs/preview';
import { VirtualFileSystem } from '../vfs/vfs';
import type { ImageryAssetRecord } from '../../types/imagery';
import { CircuitBreakerTracker } from './circuit-breaker';
import { validateContinuity } from './continuity';
import { BuildHeartbeat } from './heartbeat';
import { PatchEngine } from './patch-engine';
import { ScaffoldAuditor } from './scaffold';
import { ScaffoldHealthManager } from './scaffold-health';

export type BuilderLoopStatus = 'idle' | 'paused' | 'success' | 'skipped' | 'blocked';

export interface BuilderLoopOutcome {
  status: BuilderLoopStatus;
  atom: WorkItem | null;
  attempts: number;
  previewHtml?: string;
  violations?: string[];
  skipReason?: string;
  imageryAssets?: ImageryAssetRecord[];
  blockedCode?: string;
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
  imagery?: ImageryResolver;
  isPaused?: () => boolean;
}

interface RetryContext {
  reason: string;
  violations?: string[];
}

interface AttemptPromptBaseline {
  manifestJson: string;
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
    let promptBaseline: AttemptPromptBaseline | null = null;

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
        promptBaseline,
      );
      promptBaseline = {
        manifestJson: context.siteManifestJson,
      };

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

      const imageryResolution = await resolveImageryPlaceholdersInVfs(
        sandbox,
        input.imagery,
      );
      if (!imageryResolution.ok) {
        const reason = imageryResolution.error.message;
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
        const reason = 'Intent validation failed: patch produced no visible changes.';
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

      const intentValidationError = validateIntentSatisfaction(atom, before, sandbox);
      if (intentValidationError) {
        const reason = `Intent validation failed: ${intentValidationError}`;
        const imageryIntent = assessImageryEscalation(
          `${atom.title} ${atom.description} ${atom.visibleChange}`,
          'aggressive',
        );
        const isFinalAttempt = attempt >= this.maxAttempts;
        if (!isFinalAttempt) {
          const decision = this.recordFailure(atom, reason, attempt);
          this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');
          if (decision.action === 'retry') {
            retryContext = { reason };
            continue;
          }
        }

        if (imageryIntent.hasVisualIntent && input.imagery) {
          const execResult = await runImageryExecutor({
            atom,
            vfs: sandbox,
            resolver: input.imagery,
          });
          if (execResult.ok && execResult.value.applied) {
            this.setPhase('rendering_preview');
            const recoveredPreview = buildPreviewHtml(sandbox);
            if (!recoveredPreview.ok) {
              const failReason = recoveredPreview.error.message;
              const decision = this.recordFailure(atom, failReason, attempt);
              this.recordBuildFailure(atom, attemptStartedAt, 'patch');
              if (decision.action === 'retry' && !isFinalAttempt) {
                retryContext = { reason: failReason };
                continue;
              }
              const outcome = this.blockAtom(
                atom,
                input.backlog,
                failReason,
                attempt,
                'imagery_executor_preview_failed',
                execResult.value.assets,
              );
              return okResult(outcome);
            }
            previewResult.value = recoveredPreview.value;
            const postError = validateIntentSatisfaction(atom, before, sandbox);
            if (!postError) {
              const beforePreviewAfterExec = buildPreviewHtml(before, previewResult.value.pagePath);
              if (
                beforePreviewAfterExec.ok &&
                !hasVisiblePreviewDelta(beforePreviewAfterExec.value.html, previewResult.value.html)
              ) {
                const failReason = 'Intent validation failed: no visible preview change detected.';
                const outcome = this.blockAtom(
                  atom,
                  input.backlog,
                  failReason,
                  attempt,
                  'imagery_executor_no_visible_delta',
                  execResult.value.assets,
                );
                this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');
                return okResult(outcome);
              }
              commitSandbox(input.vfs, sandbox);
              const nextVersion = input.vfs.getVersion();
              input.backlog.updateItem(atom.id, {
                status: 'done',
                buildVersion: nextVersion,
                completedAt: this.now(),
                blockedCode: undefined,
                blockedReason: undefined,
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
                imageryAssets: execResult.value.assets,
              });
            }
          }
          const blockReason = execResult.ok
            ? `Intent validation failed: ${validateIntentSatisfaction(atom, before, sandbox)}`
            : `Imagery executor failed: ${execResult.error.message}`;
          const outcome = this.blockAtom(
            atom,
            input.backlog,
            blockReason,
            attempt,
            'imagery_intent_unmet',
            execResult.ok ? execResult.value.assets : undefined,
          );
          this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');
          return okResult(outcome);
        }

        const decision = this.recordFailure(atom, reason, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');
        if (decision.action === 'retry' && !isFinalAttempt) {
          retryContext = { reason };
          continue;
        }
        const outcome = this.skipAtom(atom, input.backlog, reason, attempt);
        return okResult(outcome);
      }

      if (hasUnresolvedImageryPlaceholders(sandbox)) {
        const reason = 'Intent validation failed: imagery placeholders remain unresolved.';
        const imageryIntent = assessImageryEscalation(
          `${atom.title} ${atom.description} ${atom.visibleChange}`,
          'aggressive',
        );
        const decision = this.recordFailure(atom, reason, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');
        if (decision.action === 'retry') {
          retryContext = { reason };
          continue;
        }
        if (imageryIntent.hasVisualIntent) {
          const outcome = this.blockAtom(
            atom,
            input.backlog,
            reason,
            attempt,
            'imagery_placeholders_unresolved',
          );
          return okResult(outcome);
        }
        const outcome = this.skipAtom(atom, input.backlog, reason, attempt);
        return okResult(outcome);
      }

      const beforePreview = buildPreviewHtml(before, previewResult.value.pagePath);
      if (
        beforePreview.ok &&
        !hasVisiblePreviewDelta(beforePreview.value.html, previewResult.value.html)
      ) {
        const reason = 'Intent validation failed: no visible preview change detected.';
        const decision = this.recordFailure(atom, reason, attempt);
        this.recordBuildFailure(atom, attemptStartedAt, 'guardrail');
        if (decision.action === 'retry') {
          retryContext = { reason };
          continue;
        }
        const outcome = this.skipAtom(atom, input.backlog, reason, attempt);
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
    let next = backlog.promoteNext();
    if (next?.id === atom.id) {
      backlog.updateItem(atom.id, {
        status: 'blocked',
        blockedCode: 'terminal_skip',
        blockedReason: reason,
      });
      next = backlog.promoteNext();
    }

    this.setPhase('skipping');
    this.emit({ type: 'skip', atom, reason, next });
    this.resetBuildState();

    return {
      status: 'skipped',
      atom,
      attempts,
      violations,
      skipReason: reason,
    };
  }

  private blockAtom(
    atom: WorkItem,
    backlog: BacklogController,
    reason: string,
    attempts: number,
    blockedCode: string,
    imageryAssets?: ImageryAssetRecord[],
  ): BuilderLoopOutcome {
    backlog.updateItem(atom.id, {
      status: 'blocked',
      blockedCode,
      blockedReason: reason,
    });
    const next = backlog.promoteNext();
    this.setPhase('skipping');
    this.emit({ type: 'skip', atom, reason, next });
    this.resetBuildState();
    return {
      status: 'blocked',
      atom,
      attempts,
      skipReason: reason,
      blockedCode,
      imageryAssets,
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
}, retry: RetryContext | null, expectedSectionDelta = 0, baseline?: AttemptPromptBaseline | null): string {
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
  if (retry) {
    sections.push('Site manifest delta since prior attempt:');
    sections.push(summarizeManifestDelta(baseline?.manifestJson ?? null, context.siteManifestJson));
  } else {
    sections.push('Site manifest:');
    sections.push(context.siteManifestJson);
  }
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
  sections.push(
    '- For imagery tasks, use either inline SVG/data URIs, https URLs, or imagery placeholders: pp://public-domain/<url-encoded-query> and pp://generate-image/<url-encoded-prompt>.',
  );
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

function summarizeManifestDelta(
  previousManifestJson: string | null,
  currentManifestJson: string,
): string {
  if (!previousManifestJson) {
    return 'No prior attempt baseline available.';
  }
  if (previousManifestJson === currentManifestJson) {
    return 'No manifest changes since prior attempt.';
  }

  try {
    const previous = JSON.parse(previousManifestJson) as {
      pages?: Array<{ path?: string; sections?: string[] }>;
      cssBlocks?: string[];
      jsFunctions?: string[];
      theme?: { colors?: Record<string, string>; fonts?: Record<string, string> };
    };
    const current = JSON.parse(currentManifestJson) as typeof previous;

    const previousPages = new Set((previous.pages ?? []).map((page) => page.path ?? ''));
    const currentPages = new Set((current.pages ?? []).map((page) => page.path ?? ''));
    const previousCss = new Set(previous.cssBlocks ?? []);
    const currentCss = new Set(current.cssBlocks ?? []);
    const previousJs = new Set(previous.jsFunctions ?? []);
    const currentJs = new Set(current.jsFunctions ?? []);

    const addedPages = [...currentPages].filter((value) => value && !previousPages.has(value));
    const removedPages = [...previousPages].filter((value) => value && !currentPages.has(value));
    const addedCssBlocks = [...currentCss].filter((value) => !previousCss.has(value));
    const removedCssBlocks = [...previousCss].filter((value) => !currentCss.has(value));
    const addedJsFunctions = [...currentJs].filter((value) => !previousJs.has(value));
    const removedJsFunctions = [...previousJs].filter((value) => !currentJs.has(value));

    const colorChanged =
      JSON.stringify(previous.theme?.colors ?? {}) !== JSON.stringify(current.theme?.colors ?? {});
    const fontChanged =
      JSON.stringify(previous.theme?.fonts ?? {}) !== JSON.stringify(current.theme?.fonts ?? {});

    const lines: string[] = [];
    if (addedPages.length > 0) {
      lines.push(`Added pages: ${addedPages.join(', ')}`);
    }
    if (removedPages.length > 0) {
      lines.push(`Removed pages: ${removedPages.join(', ')}`);
    }
    if (addedCssBlocks.length > 0) {
      lines.push(`Added css blocks: ${addedCssBlocks.slice(0, 10).join(', ')}`);
    }
    if (removedCssBlocks.length > 0) {
      lines.push(`Removed css blocks: ${removedCssBlocks.slice(0, 10).join(', ')}`);
    }
    if (addedJsFunctions.length > 0) {
      lines.push(`Added js functions: ${addedJsFunctions.slice(0, 10).join(', ')}`);
    }
    if (removedJsFunctions.length > 0) {
      lines.push(`Removed js functions: ${removedJsFunctions.slice(0, 10).join(', ')}`);
    }
    if (colorChanged) {
      lines.push('Theme colors changed.');
    }
    if (fontChanged) {
      lines.push('Theme fonts changed.');
    }

    return lines.length > 0 ? lines.join('\n') : 'Manifest changed in minor/non-structural ways.';
  } catch {
    return 'Manifest changed since prior attempt.';
  }
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

function validateIntentSatisfaction(
  atom: WorkItem,
  before: VirtualFileSystem,
  after: VirtualFileSystem,
): string | null {
  const intentText = `${atom.title} ${atom.description} ${atom.visibleChange}`.toLowerCase();
  const imageryIntent = assessImageryEscalation(intentText, 'aggressive');
  const wantsOgImage = /\bog:image\b|\bog image\b|\bopen graph\b/.test(intentText);
  const wantsRealAsset = /\breal asset\b|\bnot inline\b|\bnot data svg\b|\bnot inline data svg\b/.test(
    intentText,
  );
  const wantsFavicon = /\bfavicon\b/.test(intentText) || /\bsite icon\b/.test(intentText);
  const wantsSchemaImage = /\bschema\b/.test(intentText) && /\bimage\b/.test(intentText);
  const wantsSchemaContact = /\bschema\b/.test(intentText) && /\bcontact\b/.test(intentText);
  const ogImageSatisfied = !wantsOgImage || hasOgImageDelta(before, after);
  const ogImageRealAssetSatisfied = !wantsRealAsset || hasOgImageRealAsset(after);
  const faviconSatisfied = !wantsFavicon || hasFaviconDelta(before, after);
  const schemaImageSatisfied = !wantsSchemaImage || hasSchemaImageDelta(before, after);
  const schemaContactSatisfied = !wantsSchemaContact || hasSchemaContactDelta(before, after);
  const hasSpecializedImageryIntent =
    wantsOgImage || wantsSchemaImage || wantsSchemaContact || wantsFavicon;
  const specializedImagerySatisfied =
    hasSpecializedImageryIntent &&
    ogImageSatisfied &&
    ogImageRealAssetSatisfied &&
    faviconSatisfied &&
    schemaImageSatisfied &&
    schemaContactSatisfied;
  if (imageryIntent.hasVisualIntent) {
    if (hasUnresolvedImageryPlaceholders(after)) {
      return 'imagery placeholders remain unresolved after patch application.';
    }
    const beforeImagery = collectImagerySignature(before);
    const afterImagery = collectImagerySignature(after);
    if (!hasImageryDelta(beforeImagery, afterImagery) && !specializedImagerySatisfied) {
      return 'imagery-focused task did not add or change image assets.';
    }
  }
  if (!ogImageSatisfied) {
    return 'og:image intent not satisfied; meta[property="og:image"] did not change.';
  }
  if (!ogImageRealAssetSatisfied) {
    return 'og:image intent not satisfied; og:image must resolve to a non-data asset URL.';
  }
  if (!faviconSatisfied) {
    return 'favicon intent not satisfied; favicon link did not change to a concrete asset.';
  }
  if (!schemaImageSatisfied) {
    return 'schema image intent not satisfied; application/ld+json image field did not change.';
  }
  if (!schemaContactSatisfied) {
    return 'schema contact intent not satisfied; application/ld+json contact fields did not change.';
  }

  const isStyleIntent =
    atom.atomType === 'style' ||
    /\b(color|theme|background|palette|contrast|dark|light|font|typography)\b/.test(intentText);
  if (!isStyleIntent) {
    return null;
  }

  const beforeCss = before.getFile('styles.css')?.content ?? '';
  const afterCss = after.getFile('styles.css')?.content ?? '';
  if (beforeCss === afterCss) {
    return 'styles.css did not change for a style-focused task.';
  }

  const requestsBackgroundChange = /\b(background|bg|dark|lighter|darker|black|white)\b/.test(
    intentText,
  );
  if (requestsBackgroundChange) {
    const beforeBg = extractRootVariable(beforeCss, '--color-bg');
    const afterBg = extractRootVariable(afterCss, '--color-bg');
    if (beforeBg === afterBg) {
      return 'Requested background color change was not reflected in --color-bg.';
    }
  }

  return null;
}

function hasOgImageDelta(before: VirtualFileSystem, after: VirtualFileSystem): boolean {
  const beforeValue = extractMetaTagContent(before, 'og:image');
  const afterValue = extractMetaTagContent(after, 'og:image');
  return beforeValue !== afterValue && Boolean(afterValue);
}

function hasSchemaImageDelta(before: VirtualFileSystem, after: VirtualFileSystem): boolean {
  const beforeImage = extractSchemaField(before, 'image');
  const afterImage = extractSchemaField(after, 'image');
  return beforeImage !== afterImage && Boolean(afterImage);
}

function hasSchemaContactDelta(before: VirtualFileSystem, after: VirtualFileSystem): boolean {
  const fields = ['telephone', 'contactPoint', 'email'];
  for (const field of fields) {
    const beforeValue = extractSchemaField(before, field);
    const afterValue = extractSchemaField(after, field);
    if (beforeValue !== afterValue && Boolean(afterValue)) {
      return true;
    }
  }
  return false;
}

function hasOgImageRealAsset(vfs: VirtualFileSystem): boolean {
  const value = extractMetaTagContent(vfs, 'og:image');
  return Boolean(value) && !isDataUri(value ?? '');
}

function hasFaviconDelta(before: VirtualFileSystem, after: VirtualFileSystem): boolean {
  const beforeValue = extractFaviconHref(before);
  const afterValue = extractFaviconHref(after);
  if (!afterValue || beforeValue === afterValue) {
    return false;
  }
  return !isDataUri(afterValue);
}

function extractMetaTagContent(vfs: VirtualFileSystem, propertyName: string): string | null {
  for (const path of vfs.listFiles()) {
    if (!path.toLowerCase().endsWith('.html')) {
      continue;
    }
    const content = vfs.getFile(path)?.content ?? '';
    const regex = new RegExp(
      `<meta\\s+property=["']${escapeRegex(propertyName)}["']\\s+content=["']([^"']*)["']\\s*\\/?>`,
      'i',
    );
    const match = content.match(regex);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function extractSchemaField(vfs: VirtualFileSystem, field: string): string | null {
  for (const path of vfs.listFiles()) {
    if (!path.toLowerCase().endsWith('.html')) {
      continue;
    }
    const content = vfs.getFile(path)?.content ?? '';
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(content)) !== null) {
      const raw = match[1]?.trim();
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as unknown;
        const value = extractSchemaFieldValue(parsed, field);
        if (value !== null) {
          return value;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

function extractFaviconHref(vfs: VirtualFileSystem): string | null {
  for (const path of vfs.listFiles()) {
    if (!path.toLowerCase().endsWith('.html')) {
      continue;
    }
    const content = vfs.getFile(path)?.content ?? '';
    const linkRegex = /<link\b[^>]*\brel=["'][^"']*icon[^"']*["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(content)) !== null) {
      const tag = match[0];
      const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
      const href = hrefMatch?.[1]?.trim();
      if (href) {
        return href;
      }
    }
  }
  return null;
}

function extractSchemaFieldValue(parsed: unknown, field: string): string | null {
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const value = extractSchemaFieldValue(entry, field);
      if (value !== null) {
        return value;
      }
    }
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const value = record[field];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractRootVariable(css: string, variableName: string): string | null {
  const rootMatch = css.match(/:root\s*{[\s\S]*?}/);
  if (!rootMatch) {
    return null;
  }
  const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedName}\\s*:\\s*([^;]+);`, 'i');
  const match = rootMatch[0].match(regex);
  return match?.[1]?.trim() ?? null;
}

function normalizePreviewForComparison(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
    .toLowerCase();
}

function hasVisiblePreviewDelta(beforeHtml: string, afterHtml: string): boolean {
  const normalizedBefore = normalizePreviewForComparison(beforeHtml);
  const normalizedAfter = normalizePreviewForComparison(afterHtml);
  return normalizedBefore !== normalizedAfter;
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

interface ImagerySignature {
  sources: Set<string>;
  imgLikeTagCount: number;
  inlineSvgCount: number;
  cssImageUrlCount: number;
}

function collectImagerySignature(vfs: VirtualFileSystem): ImagerySignature {
  const sources = new Set<string>();
  let imgLikeTagCount = 0;
  let inlineSvgCount = 0;
  let cssImageUrlCount = 0;

  for (const path of vfs.listFiles()) {
    const file = vfs.getFile(path);
    if (!file) {
      continue;
    }
    if (path.toLowerCase().endsWith('.html')) {
      const htmlSig = collectImageryFromHtml(file.content);
      htmlSig.sources.forEach((source) => sources.add(source));
      imgLikeTagCount += htmlSig.imgLikeTagCount;
      inlineSvgCount += htmlSig.inlineSvgCount;
      continue;
    }
    if (path.toLowerCase().endsWith('.css')) {
      const cssSig = collectImageryFromCss(file.content);
      cssSig.sources.forEach((source) => sources.add(source));
      cssImageUrlCount += cssSig.cssImageUrlCount;
    }
  }

  return { sources, imgLikeTagCount, inlineSvgCount, cssImageUrlCount };
}

function collectImageryFromHtml(content: string): {
  sources: Set<string>;
  imgLikeTagCount: number;
  inlineSvgCount: number;
} {
  const sources = new Set<string>();
  let imgLikeTagCount = 0;
  const tagRegex = /<(img|source|video|image|use|object)\b[^>]*>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(content)) !== null) {
    imgLikeTagCount += 1;
    const tag = tagMatch[0];
    const attrs = extractAttributeSources(tag);
    for (const attr of attrs) {
      sources.add(attr);
    }
  }

  const inlineSvgCount = (content.match(/<svg\b/gi) ?? []).length;
  return { sources, imgLikeTagCount, inlineSvgCount };
}

function collectImageryFromCss(content: string): {
  sources: Set<string>;
  cssImageUrlCount: number;
} {
  const sources = new Set<string>();
  const urlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(content)) !== null) {
    const value = match[2]?.trim();
    if (!value) {
      continue;
    }
    count += 1;
    sources.add(value);
  }
  return {
    sources,
    cssImageUrlCount: count,
  };
}

function extractAttributeSources(tag: string): string[] {
  const attrs: string[] = [];
  const attrRegex = /\b(src|poster|href|data)\s*=\s*(["'])(.*?)\2/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag)) !== null) {
    const value = match[3]?.trim();
    if (value) {
      attrs.push(value);
    }
  }
  return attrs;
}

function hasImageryDelta(before: ImagerySignature, after: ImagerySignature): boolean {
  if (before.imgLikeTagCount !== after.imgLikeTagCount) {
    return true;
  }
  if (before.inlineSvgCount !== after.inlineSvgCount) {
    return true;
  }
  if (before.cssImageUrlCount !== after.cssImageUrlCount) {
    return true;
  }
  return !setEquals(before.sources, after.sources);
}

function setEquals<T>(left: Set<T>, right: Set<T>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function isDataUri(value: string): boolean {
  return /^data:/i.test(value.trim());
}

function hasUnresolvedImageryPlaceholders(vfs: VirtualFileSystem): boolean {
  for (const path of vfs.listFiles()) {
    if (!/\.(html|css)$/i.test(path)) {
      continue;
    }
    const content = vfs.getFile(path)?.content ?? '';
    if (
      content.includes('pp://public-domain/') ||
      content.includes('pp://generate-image/')
    ) {
      return true;
    }
  }
  return false;
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
