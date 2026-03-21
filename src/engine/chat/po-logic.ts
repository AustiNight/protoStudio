import type { ClassificationCustomization, ClassificationResult } from '../../types/chat';
import type { LLMRequest, RawLLMResponse } from '../../types/llm';
import type { ValidationIssue, ValidationResult } from '../../types/template';
import type {
  AtomType,
  Effort,
  ReorderDecision,
  WorkItem,
  WorkItemSource,
} from '../../types/backlog';
import type { TemplateConfig } from '../../types/template';

const MAX_FILES_TOUCHED = 5;
const MAX_LINES_CHANGED = 150;
const DEFAULT_MAX_TOKENS = 2200;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_SESSION_ID = 'session-unknown';

interface BacklogParseOptions {
  sessionId?: string;
  now?: () => number;
}

export interface BacklogPreviewContext {
  pagePath?: string;
  visibleSections?: string[];
  htmlSnippet?: string;
}

export function buildBacklogPrompt(
  classification: ClassificationResult,
  templateConfig: TemplateConfig,
  userRequest?: string,
  previewContext?: BacklogPreviewContext,
): LLMRequest {
  const templateSummary = buildTemplateSummary(templateConfig);
  const customizationSummary = buildCustomizationSummary(
    classification.suggestedCustomization,
  );
  const requestSummary = normalizeSentence(userRequest ?? '');
  const gapHints = inferTemplateGapHints(userRequest ?? '', templateConfig);
  const previewSections =
    previewContext?.visibleSections && previewContext.visibleSections.length > 0
      ? previewContext.visibleSections.join(', ')
      : '';
  const previewSnippet = previewContext?.htmlSnippet?.trim() ?? '';
  const systemPrompt = [
    'You are the Product Owner (PO) for prontoproto.studio.',
    '',
    'Primary goals:',
    '- Translate user intent into a prioritized backlog of Builder Atoms.',
    '- Enforce guardrails and pushback rules.',
    '- Keep scope small and visible.',
    '',
    'Rules:',
    '- Decompose into Builder Atoms only.',
    '- One visible change per atom.',
    '- <= 5 files touched, <= 150 lines changed.',
    '- No paid services unless the user explicitly consents.',
    '- No user image upload; use SVG, approved HTTPS assets, generated safe raster, or Unsplash.',
    '- No autoplay media, modal-on-load, or dark patterns.',
    '- All generated site CSS uses var(--*) tokens and BEM class naming.',
    '- When a request violates guardrails: push back twice, then comply with a clear caveat.',
    '',
    'Tone guidance:',
    '- Helpful and collaborative, not condescending.',
    '- Explain why the request is risky and suggest a better alternative.',
    '- After two pushbacks, comply with a brief inline caveat.',
    '',
    'Atom decomposition rules:',
    '1. STRUCTURAL FIRST: If a feature needs a new page or section, start with a structure atom using placeholders.',
    '2. ONE CONCERN PER ATOM: structure, content, style, behavior, or integration only.',
    '3. VISIBLE DELTA: every atom produces a clear, visible change.',
    '4. DEPENDENCY CHAIN: order atoms so dependencies come first.',
    '5. MAX NESTING DEPTH = 1: split any oversized atom into two.',
    '6. SIZE CHECK: if an atom exceeds limits, split and re-check.',
    '',
    'Backlog item sizing self-audit:',
    '- Touches <= 5 files',
    '- Changes <= 150 lines',
    '- Adds at most 1 new section or component',
    '- Produces exactly 1 user-visible change',
    '- Can be described in a single sentence',
    '- No mixed concerns (structure + style = 2 atoms)',
    '',
    'Initial queue quality rules:',
    '- Produce 8-20 items.',
    '- First 3-5 items must be high-visibility, user-intent-specific improvements (not generic hygiene).',
    '- Generic SEO/performance tasks belong only in lower-priority slots and only when clearly relevant.',
    '- Do not repeat boilerplate tasks that appear on every site unless the request explicitly asks for them.',
    '- Treat the current preview as the baseline. Do not create scaffold/foundation tasks for pages or sections already present.',
    '- Focus on the missing deltas between user intent and the current preview.',
    '- Include dependencies so implementation order preserves visible momentum.',
    '',
    'Output format:',
    '- Produce a JSON object with an "items" array of backlog items.',
    '- Root shape: { "items": [ ... ] }',
    '- Each item:',
    '  {',
    '    "title": "...",',
    '    "description": "...",',
    '    "atomType": "structure | content | style | behavior | integration",',
    '    "filesTouch": ["..."],',
    '    "estimatedLines": 40,',
    '    "visibleChange": "...",',
    '    "dependencies": []',
    '  }',
    '- No extra prose.',
  ].join('\n');

  const messages = [
    {
      role: 'user' as const,
      content: [
        requestSummary ? `Raw first user request: ${requestSummary}` : '',
        `User intent summary: ${classification.reasoning}`,
        `Template: ${templateSummary}`,
        customizationSummary ? `Customization hints: ${customizationSummary}` : '',
        `Template sections:\n${formatPageSections(templateConfig)}`,
        previewContext?.pagePath ? `Current preview page: ${previewContext.pagePath}` : '',
        previewSections ? `Current preview sections: ${previewSections}` : '',
        previewSnippet ? `Current preview HTML snapshot (trimmed):\n${previewSnippet}` : '',
        gapHints.length > 0
          ? `Likely template-to-request gaps:\n${gapHints.map((entry) => `- ${entry}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  return {
    role: 'chat',
    systemPrompt,
    messages,
    responseFormat: 'json',
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    reasoningEffort: 'minimal',
  };
}

export function parseBacklogResponse(
  response: Pick<RawLLMResponse, 'content'>,
  options?: BacklogParseOptions,
): WorkItem[] {
  return parseWorkItemsResponse(response, options);
}

export function parseWorkItemsResponse(
  response: Pick<RawLLMResponse, 'content'>,
  options?: BacklogParseOptions,
): WorkItem[] {
  const now = options?.now ?? (() => Date.now());
  const sessionId = options?.sessionId ?? DEFAULT_SESSION_ID;
  const parsed = parseJsonArray(response.content);
  const rawItems = Array.isArray(parsed) ? parsed : [];
  return normalizeWorkItems(rawItems, sessionId, now);
}

export function validateAtomSizing(items: WorkItem[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  items.forEach((item, index) => {
    const prefix = `items[${index}]`;

    if (!item.title.trim()) {
      issues.push({ path: `${prefix}.title`, message: 'Title is required.' });
    }

    if (!item.description.trim()) {
      issues.push({ path: `${prefix}.description`, message: 'Description is required.' });
    }

    if (!item.visibleChange.trim()) {
      issues.push({
        path: `${prefix}.visibleChange`,
        message: 'Visible change must be described.',
      });
    }

    if (item.filesTouch.length === 0) {
      issues.push({
        path: `${prefix}.filesTouch`,
        message: 'filesTouch must include at least one file.',
      });
    }

    if (item.filesTouch.length > MAX_FILES_TOUCHED) {
      issues.push({
        path: `${prefix}.filesTouch`,
        message: `filesTouch exceeds ${MAX_FILES_TOUCHED} files.`,
      });
    }

    if (!Number.isFinite(item.estimatedLines) || item.estimatedLines <= 0) {
      issues.push({
        path: `${prefix}.estimatedLines`,
        message: 'estimatedLines must be a positive number.',
      });
    } else if (item.estimatedLines > MAX_LINES_CHANGED) {
      issues.push({
        path: `${prefix}.estimatedLines`,
        message: `estimatedLines exceeds ${MAX_LINES_CHANGED} lines.`,
      });
    }
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

export async function evaluateReorder(
  fromIndex: number,
  toIndex: number,
  backlog: WorkItem[],
): Promise<ReorderDecision> {
  if (fromIndex === toIndex) {
    return {
      approved: true,
      reason: 'No change in order requested.',
      backlog: normalizeOrder(backlog),
    };
  }

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= backlog.length ||
    toIndex >= backlog.length
  ) {
    return {
      approved: false,
      reason: 'Reorder indices are out of range.',
      backlog: normalizeOrder(backlog),
    };
  }

  const reordered = reorderItems(backlog, fromIndex, toIndex);
  const violation = findDependencyViolation(reordered);

  if (violation) {
    return {
      approved: false,
      reason: violation,
      backlog: normalizeOrder(backlog),
    };
  }

  return {
    approved: true,
    reason: 'Reorder approved.',
    backlog: normalizeOrder(reordered),
  };
}

function buildTemplateSummary(templateConfig: TemplateConfig): string {
  const description = normalizeSentence(templateConfig.description);
  return `${templateConfig.label} (${templateConfig.id}) — ${description}`;
}

function buildCustomizationSummary(
  customization?: ClassificationCustomization,
): string | null {
  if (!customization) {
    return null;
  }

  const entries: string[] = [];

  if (customization.title) {
    entries.push(`Title: ${customization.title}`);
  }
  if (customization.slogan) {
    entries.push(`Slogan: ${customization.slogan}`);
  }
  if (customization.primaryColor) {
    entries.push(`Primary color: ${customization.primaryColor}`);
  }
  if (customization.industry) {
    entries.push(`Industry: ${customization.industry}`);
  }

  return entries.length > 0 ? entries.join(' | ') : null;
}

function formatPageSections(templateConfig: TemplateConfig): string {
  const pages = Object.entries(templateConfig.pages);
  if (pages.length === 0) {
    return '- (no pages)';
  }

  return pages
    .map(([path, page]) => {
      const sections = page.sections.length > 0 ? page.sections.join(', ') : '(none)';
      return `- ${path}: ${sections}`;
    })
    .join('\n');
}

function normalizeWorkItems(
  rawItems: unknown[],
  sessionId: string,
  now: () => number,
): WorkItem[] {
  const createdAt = now();
  const existingIds = new Set<string>();
  const titleIdMap = new Map<string, string>();
  const dependencyKeys: string[][] = [];

  const items: WorkItem[] = rawItems.map((raw, index) => {
    const record = isRecord(raw) ? raw : {};
    const title = getString(record, 'title') ?? `Untitled item ${index + 1}`;
    const atomType = normalizeAtomType(
      getString(record, 'atomType') ?? getString(record, 'type'),
    );
    const filesTouch = normalizeStringArray(
      record['filesTouch'] ?? record['files'] ?? record['files_touch'],
    );
    const estimatedLines = normalizeNumber(
      record['estimatedLines'] ?? record['lines'] ?? record['estimated_lines'],
      defaultEstimatedLines(atomType),
    );
    const visibleChange =
      normalizeSentence(getString(record, 'visibleChange') ?? '') ||
      normalizeSentence(getString(record, 'visible_change') ?? '') ||
      title;
    const description =
      normalizeSentence(getString(record, 'description') ?? '') ||
      `Implement ${title}.`;
    const rationale =
      normalizeSentence(getString(record, 'rationale') ?? '') ||
      description;
    const rawDependencies = normalizeStringArray(
      record['dependencies'] ?? record['deps'],
    );
    const source = normalizeWorkItemSource(record['source']);

    const id = ensureUniqueId(buildWorkItemId(title, index), existingIds);
    existingIds.add(id);
    titleIdMap.set(normalizeKey(title), id);
    dependencyKeys.push(rawDependencies);

    return {
      id,
      sessionId,
      title,
      description,
      effort: computeEffort(estimatedLines),
      status: 'backlog',
      order: index + 1,
      dependencies: [],
      rationale,
      createdAt,
      atomType,
      filesTouch: filesTouch.length > 0 ? filesTouch : defaultFilesTouch(atomType),
      estimatedLines,
      visibleChange,
      expectedSectionDelta: normalizeOptionalNumber(record['expectedSectionDelta']),
      source,
    };
  });

  return items.map((item, index) => {
    const resolved = resolveDependencies(
      dependencyKeys[index] ?? [],
      titleIdMap,
      items,
    );
    return {
      ...item,
      dependencies: resolved,
    };
  });
}

function normalizeOrder(items: WorkItem[]): WorkItem[] {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

function inferTemplateGapHints(userRequest: string, templateConfig: TemplateConfig): string[] {
  const normalizedRequest = normalizeSentence(userRequest).toLowerCase();
  if (!normalizedRequest) {
    return [];
  }
  const sections = new Set(
    Object.values(templateConfig.pages).flatMap((page) =>
      page.sections.map((section) => normalizeKey(section)),
    ),
  );
  const hints: string[] = [];
  const registerHint = (regex: RegExp, sectionKeys: string[], hint: string) => {
    if (!regex.test(normalizedRequest)) {
      return;
    }
    const hasSection = sectionKeys.some((key) => sections.has(normalizeKey(key)));
    if (!hasSection) {
      hints.push(hint);
    }
  };

  registerHint(/\b(pricing|price|plans?)\b/, ['pricing'], 'Add clear pricing section/cards.');
  registerHint(/\b(testimonial|review|social proof)\b/, ['testimonials', 'reviews'], 'Add trust/social-proof section.');
  registerHint(/\b(contact|call|book|appointment)\b/, ['contact', 'cta', 'form'], 'Strengthen contact/booking conversion flow.');
  registerHint(/\b(gallery|portfolio|before and after|photos?)\b/, ['gallery', 'portfolio'], 'Add gallery/portfolio visuals.');
  registerHint(/\b(blog|article|news|resources?)\b/, ['blog', 'articles'], 'Add content hub/blog section.');
  registerHint(/\b(store|shop|checkout|cart|product)\b/, ['products', 'cart'], 'Add product/catalog + purchase flow.');
  registerHint(/\b(location|map|directions?)\b/, ['map', 'location'], 'Add location/map context.');
  registerHint(/\b(team|about|founder|story)\b/, ['about', 'team'], 'Add about/team credibility section.');

  return hints.slice(0, 6);
}

function reorderItems(items: WorkItem[], fromIndex: number, toIndex: number): WorkItem[] {
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  if (!moved) {
    return copy;
  }
  copy.splice(toIndex, 0, moved);
  return copy;
}

function findDependencyViolation(items: WorkItem[]): string | null {
  const indexById = new Map<string, number>();
  const titleById = new Map<string, string>();

  items.forEach((item, index) => {
    indexById.set(item.id, index);
    titleById.set(item.id, item.title);
  });

  for (const item of items) {
    const itemIndex = indexById.get(item.id) ?? 0;
    for (const dep of item.dependencies) {
      const depIndex = indexById.get(dep);
      if (depIndex === undefined) {
        continue;
      }
      if (depIndex > itemIndex) {
        const depTitle = titleById.get(dep) ?? dep;
        return `"${item.title}" must come after "${depTitle}".`;
      }
    }
  }

  return null;
}

function resolveDependencies(
  rawDependencies: string[],
  titleIdMap: Map<string, string>,
  items: WorkItem[],
): string[] {
  const ids = new Set<string>();
  const idSet = new Set(items.map((item) => item.id));

  rawDependencies.forEach((dependency) => {
    const trimmed = normalizeSentence(dependency);
    if (!trimmed) {
      return;
    }

    if (idSet.has(trimmed)) {
      ids.add(trimmed);
      return;
    }

    const resolved = titleIdMap.get(normalizeKey(trimmed));
    if (resolved) {
      ids.add(resolved);
    }
  });

  return [...ids];
}

function normalizeWorkItemSource(value: unknown): WorkItemSource | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'first_message_planner':
    case 'request_planner':
    case 'web_designer':
    case 'fallback':
    case 'system':
      return normalized;
    default:
      return undefined;
  }
}

function buildWorkItemId(title: string, index: number, prefix = 'atom'): string {
  const slug = slugify(title);
  if (!slug) {
    return `${prefix}-${index + 1}`;
  }
  return `${prefix}-${index + 1}-${slug}`;
}

function ensureUniqueId(id: string, existing: Set<string>): string {
  if (!existing.has(id)) {
    return id;
  }

  let counter = 2;
  let next = `${id}-${counter}`;
  while (existing.has(next)) {
    counter += 1;
    next = `${id}-${counter}`;
  }
  return next;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeAtomType(value: string | null): AtomType {
  switch (value) {
    case 'structure':
    case 'content':
    case 'style':
    case 'behavior':
    case 'integration':
      return value;
    default:
      return 'content';
  }
}

function defaultFilesTouch(atomType: AtomType): string[] {
  switch (atomType) {
    case 'style':
      return ['styles.css'];
    case 'behavior':
      return ['main.js'];
    case 'integration':
      return ['index.html', 'main.js'];
    default:
      return ['index.html'];
  }
}

function defaultEstimatedLines(atomType: AtomType): number {
  switch (atomType) {
    case 'structure':
      return 80;
    case 'style':
      return 60;
    case 'behavior':
      return 50;
    case 'integration':
      return 70;
    default:
      return 40;
  }
}

function computeEffort(estimatedLines: number): Effort {
  if (estimatedLines <= 40) {
    return 'S';
  }
  if (estimatedLines <= 90) {
    return 'M';
  }
  return 'L';
}

function normalizeSentence(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function normalizeNumber(value: unknown, fallback: number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback ?? 0;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseJsonArray(content: string): unknown[] | null {
  const structured = parseStructuredJsonValue(content);
  if (Array.isArray(structured)) {
    return structured;
  }
  if (isRecord(structured)) {
    const fromRecord = extractWorkArrayFromRecord(structured);
    if (fromRecord) {
      return fromRecord;
    }
  }
  return null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
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

function parseStructuredJsonValue(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const candidates: string[] = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    candidates.push(fenced);
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of candidates) {
    const parsed = safeJsonParse(candidate);
    const unwrapped = unwrapJsonString(parsed);
    if (unwrapped !== null) {
      return unwrapped;
    }
  }
  return null;
}

function unwrapJsonString(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'string') {
      return current;
    }
    const trimmed = current.trim();
    if (!trimmed) {
      return null;
    }
    const reparsed = safeJsonParse(trimmed);
    if (reparsed === null) {
      return null;
    }
    current = reparsed;
  }
  return current;
}

function extractWorkArrayFromRecord(record: Record<string, unknown>): unknown[] | null {
  const directCandidates = [
    record['items'],
    record['backlog'],
    record['workItems'],
    record['work_items'],
    record['tasks'],
    record['recommendations'],
    record['actionItems'],
  ];
  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  const nestedCandidates = [record['payload'], record['data'], record['result'], record['output']];
  for (const candidate of nestedCandidates) {
    if (!isRecord(candidate)) {
      continue;
    }
    const nested = extractWorkArrayFromRecord(candidate);
    if (nested) {
      return nested;
    }
  }
  return null;
}
