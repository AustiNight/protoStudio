import type {
  ClassificationCustomization,
  ClassificationResult,
} from '../../types/chat';
import type { AppError, Result } from '../../types/result';
import type { QuickCustomization, TemplateConfig } from '../../types/template';

import { TemplateAssembler } from '../vfs/assembler';
import { buildPreviewHtml, type PreviewPayload } from '../vfs/preview';
import { VirtualFileSystem } from '../vfs/vfs';
import type { LLMGateway } from '../llm/gateway';

import { ClassificationEngine } from './classifier';

export interface FirstMessageTiming {
  startedAt: number;
  completedAt: number;
  durationMs: number;
  slaMs: number;
  withinSla: boolean;
}

export interface FirstMessagePreviewResult {
  status: 'preview';
  classification: ClassificationResult;
  template: TemplateConfig;
  customization?: QuickCustomization;
  vfs: VirtualFileSystem;
  preview: PreviewPayload;
  timing: FirstMessageTiming;
}

export interface FirstMessageClarifyResult {
  status: 'clarify';
  classification: ClassificationResult;
  question: string;
  timing: FirstMessageTiming;
}

export interface FirstMessageScratchResult {
  status: 'scratch';
  classification: ClassificationResult;
  timing: FirstMessageTiming;
}

export type FirstMessageOutcome =
  | FirstMessagePreviewResult
  | FirstMessageClarifyResult
  | FirstMessageScratchResult;

export interface FirstMessagePathOptions {
  gateway: LLMGateway;
  templateCatalog: TemplateConfig[];
  previewSlaMs?: number;
  now?: () => number;
  classifier?: ClassificationEngine;
  assembler?: TemplateAssembler;
}

const DEFAULT_PREVIEW_SLA_MS = 30_000;

export class FirstMessagePath {
  private gateway: LLMGateway;
  private templateCatalog: TemplateConfig[];
  private previewSlaMs: number;
  private now: () => number;
  private classifier: ClassificationEngine;
  private assembler: TemplateAssembler;

  constructor(options: FirstMessagePathOptions) {
    this.gateway = options.gateway;
    this.templateCatalog = [...options.templateCatalog];
    this.previewSlaMs = options.previewSlaMs ?? DEFAULT_PREVIEW_SLA_MS;
    this.now = options.now ?? (() => Date.now());
    this.classifier = options.classifier ?? new ClassificationEngine();
    this.assembler = options.assembler ?? new TemplateAssembler();
  }

  async run(firstMessage: string): Promise<Result<FirstMessageOutcome, AppError>> {
    const startedAt = this.now();
    const request = this.classifier.buildClassificationPrompt(
      firstMessage,
      this.templateCatalog,
    );

    const response = await this.gateway.send(request);
    if (!response.ok) {
      return errResult(response.error);
    }

    const classification = this.classifier.parseClassificationResponse(
      response.value,
    );

    if (classification.question) {
      const timing = buildTiming(startedAt, this.now(), this.previewSlaMs);
      return okResult({
        status: 'clarify',
        classification,
        question: classification.question,
        timing,
      });
    }

    if (classification.path !== 'template' || !classification.templateId) {
      const timing = buildTiming(startedAt, this.now(), this.previewSlaMs);
      return okResult({
        status: 'scratch',
        classification,
        timing,
      });
    }

    const template = this.templateCatalog.find(
      (entry) => entry.id === classification.templateId,
    );
    if (!template) {
      return errResult({
        category: 'user_action',
        code: 'template_not_found',
        message: `Template "${classification.templateId}" not found in catalog.`,
      });
    }

    const customization = buildQuickCustomization(
      classification.suggestedCustomization,
    );
    const vfs = await this.assembler.assemble(template, customization);

    const preview = buildPreviewHtml(vfs, pickPreviewPage(template));
    if (!preview.ok) {
      return errResult(preview.error);
    }

    const timing = buildTiming(startedAt, this.now(), this.previewSlaMs);
    return okResult({
      status: 'preview',
      classification,
      template,
      customization,
      vfs,
      preview: preview.value,
      timing,
    });
  }
}

function buildTiming(
  startedAt: number,
  completedAt: number,
  slaMs: number,
): FirstMessageTiming {
  const durationMs = Math.max(0, completedAt - startedAt);
  return {
    startedAt,
    completedAt,
    durationMs,
    slaMs,
    withinSla: durationMs <= slaMs,
  };
}

function pickPreviewPage(template: TemplateConfig): string | undefined {
  if (template.pages['index.html']) {
    return 'index.html';
  }
  const paths = Object.keys(template.pages);
  return paths.length > 0 ? paths[0] : undefined;
}

function buildQuickCustomization(
  suggested: ClassificationCustomization | undefined,
): QuickCustomization | undefined {
  if (!suggested) {
    return undefined;
  }

  const customization: QuickCustomization = {};

  if (suggested.title) {
    customization.title = suggested.title;
  }

  if (suggested.slogan) {
    customization.slogan = suggested.slogan;
  }

  if (suggested.primaryColor) {
    customization.primaryColor = suggested.primaryColor;
  }

  if (suggested.industry) {
    customization.industry = suggested.industry;
  }

  const slotOverrides: Record<string, string> = {};

  if (suggested.title) {
    slotOverrides.logoText = suggested.title;
    slotOverrides.heading = suggested.title;
  }

  if (suggested.slogan) {
    slotOverrides.subheading = suggested.slogan;
  }

  if (Object.keys(slotOverrides).length > 0) {
    customization.slotOverrides = slotOverrides;
  }

  return hasCustomization(customization) ? customization : undefined;
}

function hasCustomization(customization: QuickCustomization): boolean {
  if (customization.title) {
    return true;
  }

  if (customization.slogan) {
    return true;
  }

  if (customization.primaryColor) {
    return true;
  }

  if (customization.industry) {
    return true;
  }

  if (customization.colors && Object.keys(customization.colors).length > 0) {
    return true;
  }

  if (
    customization.slotOverrides &&
    Object.keys(customization.slotOverrides).length > 0
  ) {
    return true;
  }

  return false;
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
