import type { ClassificationCustomization, ClassificationResult } from '../../types/chat';
import type { LLMRequest, LLMResponse } from '../../types/llm';
import type { TemplateConfig } from '../../types/template';

interface ClassificationEngineOptions {
  confidenceThreshold?: number;
  defaultClarifyingQuestion?: string;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_FALLBACK_CONFIDENCE = 0.2;
const DEFAULT_MAX_TOKENS = 400;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_CLARIFYING_QUESTION =
  'What kind of site are you looking to build (for example: marketing, portfolio, blog, store)?';

export class ClassificationEngine {
  private confidenceThreshold: number;
  private defaultClarifyingQuestion: string;

  constructor(options?: ClassificationEngineOptions) {
    this.confidenceThreshold = normalizeConfidenceThreshold(
      options?.confidenceThreshold,
    );
    this.defaultClarifyingQuestion =
      options?.defaultClarifyingQuestion ?? DEFAULT_CLARIFYING_QUESTION;
  }

  buildClassificationPrompt(
    userMessage: string,
    templateCatalog: TemplateConfig[],
  ): LLMRequest {
    const templateLines = templateCatalog.map((template) => {
      const description = normalizeSentence(template.description);
      return `- ${template.id}: ${template.label} — ${description}`;
    });

    const catalogBlock =
      templateLines.length > 0 ? templateLines.join('\n') : '- (no templates available)';

    const systemPrompt = [
      'You are the classifier for prontoproto.studio.',
      'Task:',
      '- Decide whether the first user message should start from a template or be built from scratch.',
      '- Use the template catalog to select the best match when appropriate.',
      'Output JSON only with the following schema:',
      '{"path":"template | scratch","templateId":"...","confidence":0.0,"reasoning":"...",' +
        '"suggestedCustomization":{"title":"...","slogan":"...","primaryColor":"...","industry":"..."},' +
        '"question":"..."}',
      'Rules:',
      '- Provide templateId only when path is "template".',
      `- If confidence < ${this.confidenceThreshold}, include a single clarifying question in "question".`,
      '- For clearly commercial/professional website requests, choose the closest business/marketing template instead of asking for category clarification.',
      '- Confidence must be between 0.0 and 1.0.',
      'Template catalog:',
      catalogBlock,
    ].join('\n');

    const trimmedMessage = userMessage.trim();

    return {
      role: 'chat',
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: trimmedMessage.length > 0 ? trimmedMessage : '(empty message)',
        },
      ],
      responseFormat: 'json',
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      reasoningEffort: 'minimal',
    };
  }

  parseClassificationResponse(response: LLMResponse): ClassificationResult {
    const parsed = parseJsonRecord(response.content);

    if (!parsed) {
      return buildFallbackResult(
        'Classifier response was not valid JSON.',
        this.confidenceThreshold,
        this.defaultClarifyingQuestion,
      );
    }

    const rawPath = getString(parsed, 'path') ?? getString(parsed, 'mode');
    const templateId =
      getString(parsed, 'templateId') ??
      getString(parsed, 'template_id') ??
      getString(parsed, 'template');
    const confidenceValue = getNumber(parsed, 'confidence');
    const reasoning =
      getString(parsed, 'reasoning') ??
      'Classifier did not provide reasoning.';
    const question =
      getString(parsed, 'question') ?? getString(parsed, 'clarifyingQuestion');

    let path: ClassificationResult['path'] = 'scratch';

    if (rawPath === 'template') {
      if (!templateId) {
        return buildFallbackResult(
          'Classifier response missing templateId.',
          this.confidenceThreshold,
          this.defaultClarifyingQuestion,
        );
      }
      path = 'template';
    } else if (rawPath === 'scratch' || rawPath === 'ambiguous') {
      path = 'scratch';
    } else if (templateId) {
      path = 'template';
    }

    let confidence = clampConfidence(
      confidenceValue ?? DEFAULT_FALLBACK_CONFIDENCE,
    );

    if (rawPath === 'ambiguous' && confidence >= this.confidenceThreshold) {
      confidence = Math.max(0, this.confidenceThreshold - 0.05);
    }

    const suggestedCustomization = parseCustomization(parsed);
    const needsClarification = confidence < this.confidenceThreshold;

    return {
      path,
      templateId: path === 'template' ? templateId ?? undefined : undefined,
      confidence,
      reasoning,
      question: needsClarification
        ? question ?? this.defaultClarifyingQuestion
        : undefined,
      suggestedCustomization,
    };
  }

  getTemplateConfidence(result: ClassificationResult): number {
    if (result.path !== 'template' || !result.templateId) {
      return 0;
    }

    return clampConfidence(result.confidence);
  }
}

function parseCustomization(
  record: Record<string, unknown>,
): ClassificationCustomization | undefined {
  const customization =
    record['suggestedCustomization'] ?? record['suggested_customization'];

  if (!isRecord(customization)) {
    return undefined;
  }

  const title = getString(customization, 'title');
  const slogan = getString(customization, 'slogan');
  const primaryColor =
    getString(customization, 'primaryColor') ??
    getString(customization, 'primary_color');
  const industry = getString(customization, 'industry');

  if (!title && !slogan && !primaryColor && !industry) {
    return undefined;
  }

  const result: ClassificationCustomization = {};

  if (title) {
    result.title = title;
  }

  if (slogan) {
    result.slogan = slogan;
  }

  if (primaryColor) {
    result.primaryColor = primaryColor;
  }

  if (industry) {
    result.industry = industry;
  }

  return result;
}

function normalizeConfidenceThreshold(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_CONFIDENCE_THRESHOLD;
  }

  return clampConfidence(value);
}

function normalizeSentence(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildFallbackResult(
  message: string,
  confidenceThreshold: number,
  question: string,
): ClassificationResult {
  return {
    path: 'scratch',
    confidence: DEFAULT_FALLBACK_CONFIDENCE,
    reasoning: message,
    question:
      DEFAULT_FALLBACK_CONFIDENCE < confidenceThreshold ? question : undefined,
  };
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_FALLBACK_CONFIDENCE;
  }

  return Math.min(1, Math.max(0, value));
}

function parseJsonRecord(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const direct = safeJsonParse(trimmed);
  if (direct) {
    return direct;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return safeJsonParse(trimmed.slice(start, end + 1));
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function getNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}
