import type { ClassificationCustomization, ClassificationResult } from '../../types/chat';
import type { LLMRequest, RawLLMResponse } from '../../types/llm';
import type { ValidationIssue, ValidationResult } from '../../types/template';
import type { AtomType, Effort, ReorderDecision, WorkItem } from '../../types/backlog';
import type { TemplateConfig } from '../../types/template';

const MAX_FILES_TOUCHED = 5;
const MAX_LINES_CHANGED = 150;
const DEFAULT_MAX_TOKENS = 900;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_SESSION_ID = 'session-unknown';

interface BacklogParseOptions {
  sessionId?: string;
  now?: () => number;
}

interface SeoItemSpec {
  title: string;
  description: string;
  atomType: AtomType;
  filesTouch: string[];
  estimatedLines: number;
  visibleChange: string;
}

const SEO_ITEM_SPECS: SeoItemSpec[] = [
  {
    title: 'Add meta descriptions to all pages',
    description:
      'Ensure each page has a concise meta description for search snippets.',
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 25,
    visibleChange: 'Meta description tags are present for search previews.',
  },
  {
    title: 'Add descriptive alt text to all images',
    description: 'Provide meaningful alt text to improve accessibility and SEO.',
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 35,
    visibleChange: 'Images now include descriptive alt text.',
  },
  {
    title: 'Add Open Graph meta tags',
    description: 'Configure Open Graph tags for richer social share previews.',
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 30,
    visibleChange: 'Social share previews are configured with Open Graph tags.',
  },
  {
    title: 'Add JSON-LD structured data',
    description: 'Embed structured data for richer search results.',
    atomType: 'integration',
    filesTouch: ['index.html'],
    estimatedLines: 45,
    visibleChange: 'Structured data is embedded for rich search results.',
  },
  {
    title: 'Generate sitemap.xml',
    description: 'Add a sitemap to improve crawlability and indexing.',
    atomType: 'integration',
    filesTouch: ['sitemap.xml'],
    estimatedLines: 40,
    visibleChange: 'A sitemap.xml file is available for search engines.',
  },
  {
    title: 'Add robots.txt',
    description: 'Provide crawl directives for search engines.',
    atomType: 'integration',
    filesTouch: ['robots.txt'],
    estimatedLines: 20,
    visibleChange: 'A robots.txt file is available with crawl directives.',
  },
  {
    title: 'Optimize images and defer non-critical assets',
    description: 'Defer non-critical CSS/JS and optimize images for faster load.',
    atomType: 'style',
    filesTouch: ['index.html', 'styles.css', 'main.js'],
    estimatedLines: 80,
    visibleChange: 'Images and assets load faster for a snappier experience.',
  },
  {
    title: 'Add canonical URL tags',
    description: 'Prevent duplicate content by adding canonical URLs.',
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 25,
    visibleChange: 'Canonical URL tags are present on each page.',
  },
  {
    title: 'Fix heading hierarchy',
    description: 'Ensure headings follow a logical H1 → H2 → H3 structure.',
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 40,
    visibleChange: 'Headings follow a clear hierarchy across the page.',
  },
];

export function buildBacklogPrompt(
  classification: ClassificationResult,
  templateConfig: TemplateConfig,
): LLMRequest {
  const templateSummary = buildTemplateSummary(templateConfig);
  const customizationSummary = buildCustomizationSummary(
    classification.suggestedCustomization,
  );
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
    '- No user image upload; use SVG, gradients, or Unsplash.',
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
    'Output format:',
    '- Produce a JSON array of backlog items.',
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
        `User intent summary: ${classification.reasoning}`,
        `Template: ${templateSummary}`,
        customizationSummary ? `Customization hints: ${customizationSummary}` : '',
        `Template sections:\n${formatPageSections(templateConfig)}`,
        'Remember to keep SEO items in the lower half of the backlog when possible.',
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
  const now = options?.now ?? (() => Date.now());
  const sessionId = options?.sessionId ?? DEFAULT_SESSION_ID;
  const parsed = parseJsonArray(response.content);
  const rawItems = Array.isArray(parsed) ? parsed : [];
  const baseItems = normalizeWorkItems(rawItems, sessionId, now);
  return appendSeoItems(baseItems, sessionId, now);
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

function appendSeoItems(
  items: WorkItem[],
  sessionId: string,
  now: () => number,
): WorkItem[] {
  const existingTitles = new Set(items.map((item) => normalizeKey(item.title)));
  const existingIds = new Set(items.map((item) => item.id));
  const createdAt = now();
  const output = [...items];

  SEO_ITEM_SPECS.forEach((spec, index) => {
    const key = normalizeKey(spec.title);
    if (existingTitles.has(key)) {
      return;
    }

    const id = ensureUniqueId(
      buildWorkItemId(spec.title, output.length + index, 'seo'),
      existingIds,
    );
    existingIds.add(id);
    existingTitles.add(key);

    output.push({
      id,
      sessionId,
      title: spec.title,
      description: spec.description,
      effort: 'M',
      status: 'backlog',
      order: output.length + 1,
      dependencies: [],
      rationale: 'SEO best practice improvement.',
      createdAt,
      atomType: spec.atomType,
      filesTouch: spec.filesTouch,
      estimatedLines: spec.estimatedLines,
      visibleChange: spec.visibleChange,
    });
  });

  return normalizeOrder(output);
}

function normalizeOrder(items: WorkItem[]): WorkItem[] {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
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
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const direct = safeJsonParse(trimmed);
  if (Array.isArray(direct)) {
    return direct;
  }
  if (isRecord(direct)) {
    const items = direct['items'] ?? direct['backlog'];
    if (Array.isArray(items)) {
      return items;
    }
  }

  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const slice = trimmed.slice(start, end + 1);
  const parsed = safeJsonParse(slice);
  return Array.isArray(parsed) ? parsed : null;
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
