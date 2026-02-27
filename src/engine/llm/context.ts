import type { ContextBudget } from '../../types/build';
import type { ChatMessage } from '../../types/chat';
import type { WorkItem } from '../../types/backlog';
import type {
  BuildContext,
  ChatContext,
  ContextMode,
  ContextUtilization,
  SectionContext,
  SectionDetail,
} from '../../types/context';
import type {
  SiteManifest,
  SiteManifestPage,
  VirtualFileSystem,
} from '../../types/vfs';

interface ContextThresholds {
  moderate: number;
  tight: number;
  minimal: number;
}

interface RoleConfig {
  model: string;
  maxTokens: number;
  reservedForOutput: number;
  systemPrompt: string;
  patchFormat?: string;
}

export interface ContextManagerConfig {
  builder?: Partial<RoleConfig>;
  chat?: Partial<RoleConfig>;
  bufferTokens?: number;
  thresholds?: Partial<ContextThresholds>;
}

interface TrimResult {
  messages: ChatMessage[];
  tokens: number;
  trimmed: boolean;
}

interface SectionBlock {
  name: string;
  path: string;
  content: string;
  order: number;
}

const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_RESERVED_OUTPUT = 1024;
const DEFAULT_BUFFER_TOKENS = 100;
const DEFAULT_MODEL = 'unknown';
const DEFAULT_THRESHOLDS: ContextThresholds = {
  moderate: 0.6,
  tight: 0.4,
  minimal: 0.2,
};

const SECTION_OPEN_REGEX = /<!--\s*(?:PP:SECTION:)([A-Za-z0-9_-]+)\s*-->/g;
const SECTION_BLOCK_REGEX =
  /<!--\s*PP:SECTION:([A-Za-z0-9_-]+)\s*-->([\s\S]*?)<!--\s*\/PP:SECTION:\1\s*-->/g;
const BLOCK_REGEX =
  /\/\*\s*===\s*(?:PP:BLOCK:)([A-Za-z0-9_-]+)\s*===\s*\*\//g;
const FUNC_REGEX = /\/\/\s*===\s*(?:PP:FUNC:)([A-Za-z0-9_-]+)\s*===/g;
const CSS_VARIABLES_BLOCK_REGEX =
  /\/\*\s*===\s*PP:BLOCK:variables\s*===\s*\*\/[\s\S]*?\/\*\s*===\s*\/PP:BLOCK:variables\s*===\s*\*\//;

export class ContextManager {
  private builder: RoleConfig;
  private chat: RoleConfig;
  private bufferTokens: number;
  private thresholds: ContextThresholds;
  private lastUsage: ContextUtilization = { used: 0, available: 0, percent: 0 };

  constructor(config?: ContextManagerConfig) {
    const builderConfig = config?.builder ?? {};
    const chatConfig = config?.chat ?? {};

    this.builder = {
      model: builderConfig.model ?? DEFAULT_MODEL,
      maxTokens: sanitizeNumber(builderConfig.maxTokens, DEFAULT_MAX_TOKENS),
      reservedForOutput: sanitizeNumber(
        builderConfig.reservedForOutput,
        DEFAULT_RESERVED_OUTPUT,
      ),
      systemPrompt: builderConfig.systemPrompt ?? '',
      patchFormat: builderConfig.patchFormat ?? '',
    };

    this.chat = {
      model: chatConfig.model ?? DEFAULT_MODEL,
      maxTokens: sanitizeNumber(chatConfig.maxTokens, DEFAULT_MAX_TOKENS),
      reservedForOutput: sanitizeNumber(
        chatConfig.reservedForOutput,
        DEFAULT_RESERVED_OUTPUT,
      ),
      systemPrompt: chatConfig.systemPrompt ?? '',
    };

    this.bufferTokens = sanitizeNumber(
      config?.bufferTokens,
      DEFAULT_BUFFER_TOKENS,
    );

    this.thresholds = {
      moderate: sanitizeRatio(config?.thresholds?.moderate, DEFAULT_THRESHOLDS.moderate),
      tight: sanitizeRatio(config?.thresholds?.tight, DEFAULT_THRESHOLDS.tight),
      minimal: sanitizeRatio(config?.thresholds?.minimal, DEFAULT_THRESHOLDS.minimal),
    };
  }

  assembleBuildContext(
    atom: WorkItem,
    vfs: VirtualFileSystem,
    conversation: ChatMessage[],
  ): BuildContext {
    const manifest = buildManifest(vfs);
    const siteManifestJson = JSON.stringify(manifest);
    const workItemJson = JSON.stringify(atom);
    const cssVariables = extractCssVariables(vfs);

    const sectionBlocks = extractSectionBlocks(vfs);
    const affectedBlocks = selectAffectedBlocks(atom, manifest, sectionBlocks);
    const adjacentBlocks = selectAdjacentBlocks(affectedBlocks, manifest, sectionBlocks);

    const fixedTokens =
      this.estimateTokens(this.builder.systemPrompt) +
      this.estimateTokens(siteManifestJson) +
      this.estimateTokens(workItemJson) +
      this.estimateTokens(this.builder.patchFormat ?? '') +
      this.estimateTokens(cssVariables);

    let affectedSections = buildSectionContexts(
      affectedBlocks,
      'full',
      false,
      this.estimateTokens.bind(this),
    );
    let adjacentDetail: SectionDetail = 'full';
    let adjacentSections = buildSectionContexts(
      adjacentBlocks,
      adjacentDetail,
      true,
      this.estimateTokens.bind(this),
    );

    let sectionTokens = sumSectionTokens(affectedSections) + sumSectionTokens(adjacentSections);
    let available = calculateAvailable(this.builder.maxTokens, this.builder.reservedForOutput);
    let historyBudget = available - fixedTokens - sectionTokens;
    let ratio = calculateRatio(historyBudget, available);

    if (ratio < this.thresholds.tight) {
      adjacentDetail = 'signature';
      adjacentSections = buildSectionContexts(
        adjacentBlocks,
        adjacentDetail,
        true,
        this.estimateTokens.bind(this),
      );
      sectionTokens = sumSectionTokens(affectedSections) + sumSectionTokens(adjacentSections);
      historyBudget = available - fixedTokens - sectionTokens;
      ratio = calculateRatio(historyBudget, available);
    }

    const maxTail = getTailLimit(ratio, this.thresholds);
    const trimmedConversation = this.trimConversation(conversation, historyBudget, maxTail);

    let conversationMessages = trimmedConversation.messages;
    let conversationTokens = trimmedConversation.tokens;

    let mode: ContextMode = ratio < this.thresholds.minimal ? 'minimal' : 'normal';

    let budget = this.buildBudget({
      model: this.builder.model,
      maxTokens: this.builder.maxTokens,
      reservedForOutput: this.builder.reservedForOutput,
      systemPrompt: this.builder.systemPrompt,
      siteManifest: siteManifestJson,
      affectedSections,
      adjacentSections,
      workItem: workItemJson,
      patchFormat: this.builder.patchFormat ?? '',
      cssVariables,
      conversationTokens,
    });

    let used = sumBudgetTokens(budget);

    if (mode === 'minimal' || used > available) {
      const minimal = this.assembleMinimalBuildContext({
        atom,
        manifest,
        siteManifestJson,
        workItemJson,
        cssVariables,
        affectedBlocks,
        adjacentBlocks,
        conversation,
      });
      this.lastUsage = minimal.utilization;
      return minimal.context;
    }

    const buildContext: BuildContext = {
      mode,
      budget,
      systemPrompt: this.builder.systemPrompt,
      siteManifest: manifest,
      siteManifestJson,
      workItem: atom,
      workItemJson,
      patchFormat: this.builder.patchFormat ?? '',
      cssVariables,
      affectedSections,
      adjacentSections,
      conversation: conversationMessages,
    };

    this.lastUsage = buildUtilization(used, available);
    return buildContext;
  }

  assembleChatContext(
    conversation: ChatMessage[],
    backlog: WorkItem[],
  ): ChatContext {
    const backlogSummary = buildBacklogSummary(backlog);
    const fixedTokens =
      this.estimateTokens(this.chat.systemPrompt) +
      this.estimateTokens(backlogSummary);

    const available = calculateAvailable(this.chat.maxTokens, this.chat.reservedForOutput);
    let historyBudget = available - fixedTokens;
    let ratio = calculateRatio(historyBudget, available);

    const maxTail = getTailLimit(ratio, this.thresholds);
    const trimmedConversation = this.trimConversation(conversation, historyBudget, maxTail);

    let conversationMessages = trimmedConversation.messages;
    let conversationTokens = trimmedConversation.tokens;

    let mode: ContextMode = ratio < this.thresholds.minimal ? 'minimal' : 'normal';

    let budget = this.buildBudget({
      model: this.chat.model,
      maxTokens: this.chat.maxTokens,
      reservedForOutput: this.chat.reservedForOutput,
      systemPrompt: this.chat.systemPrompt,
      siteManifest: '',
      affectedSections: [],
      adjacentSections: [],
      workItem: '',
      patchFormat: '',
      cssVariables: '',
      conversationTokens,
    });

    let used = sumBudgetTokens(budget);

    if (mode === 'minimal' || used > available) {
      const minimal = this.assembleMinimalChatContext({
        backlogSummary,
        conversation,
      });
      this.lastUsage = minimal.utilization;
      return minimal.context;
    }

    const chatContext: ChatContext = {
      mode,
      budget,
      systemPrompt: this.chat.systemPrompt,
      backlogSummary,
      conversation: conversationMessages,
    };

    this.lastUsage = buildUtilization(used, available);
    return chatContext;
  }

  estimateTokens(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) {
      return 0;
    }
    return Math.max(1, Math.ceil(trimmed.length / 4));
  }

  getUtilization(): ContextUtilization {
    return { ...this.lastUsage };
  }

  private trimConversation(
    conversation: ChatMessage[],
    budget: number,
    maxTail: number | null,
  ): TrimResult {
    if (conversation.length === 0) {
      return { messages: [], tokens: 0, trimmed: false };
    }

    const first = conversation[0];
    const firstTokens = this.estimateTokens(first.content);
    const safeBudget = Math.max(0, budget - this.bufferTokens);

    const tail: ChatMessage[] = [];
    let tokens = firstTokens;
    let tailCount = 0;

    for (let i = conversation.length - 1; i >= 1; i -= 1) {
      if (maxTail !== null && tailCount >= maxTail) {
        break;
      }
      const msg = conversation[i];
      const msgTokens = this.estimateTokens(msg.content);
      if (tokens + msgTokens > safeBudget) {
        break;
      }
      tail.unshift(msg);
      tokens += msgTokens;
      tailCount += 1;
    }

    const kept = [first, ...tail];
    const trimmed = kept.length < conversation.length;
    if (trimmed) {
      const trimmedCount = conversation.length - kept.length;
      const summary = buildSummaryMessage(first, trimmedCount);
      kept.splice(1, 0, summary);
      tokens += this.estimateTokens(summary.content);
    }

    return { messages: kept, tokens, trimmed };
  }

  private buildBudget(input: {
    model: string;
    maxTokens: number;
    reservedForOutput: number;
    systemPrompt: string;
    siteManifest: string;
    affectedSections: SectionContext[];
    adjacentSections: SectionContext[];
    workItem: string;
    patchFormat: string;
    cssVariables: string;
    conversationTokens: number;
  }): ContextBudget {
    const available = calculateAvailable(input.maxTokens, input.reservedForOutput);
    return {
      model: input.model,
      maxTokens: input.maxTokens,
      reservedForOutput: input.reservedForOutput,
      available,
      systemPrompt: this.estimateTokens(input.systemPrompt),
      siteManifest: this.estimateTokens(input.siteManifest),
      affectedSections: sumSectionTokens(input.affectedSections),
      adjacentContext: sumSectionTokens(input.adjacentSections),
      workItem: this.estimateTokens(input.workItem),
      patchFormat: this.estimateTokens(input.patchFormat),
      cssVariables: this.estimateTokens(input.cssVariables),
      conversationHistory: input.conversationTokens,
    };
  }

  private assembleMinimalBuildContext(input: {
    atom: WorkItem;
    manifest: SiteManifest;
    siteManifestJson: string;
    workItemJson: string;
    cssVariables: string;
    affectedBlocks: SectionBlock[];
    adjacentBlocks: SectionBlock[];
    conversation: ChatMessage[];
  }): { context: BuildContext; utilization: ContextUtilization } {
    const available = calculateAvailable(
      this.builder.maxTokens,
      this.builder.reservedForOutput,
    );

    let affectedDetail: SectionDetail = 'full';
    let adjacentDetail: SectionDetail = 'signature';
    let conversationMessages = input.conversation.length > 0 ? [input.conversation[0]] : [];

    let affectedSections = buildSectionContexts(
      input.affectedBlocks,
      affectedDetail,
      false,
      this.estimateTokens.bind(this),
    );
    let adjacentSections = buildSectionContexts(
      input.adjacentBlocks,
      adjacentDetail,
      true,
      this.estimateTokens.bind(this),
    );

    let conversationTokens = sumConversationTokens(
      conversationMessages,
      this.estimateTokens.bind(this),
    );

    let budget = this.buildBudget({
      model: this.builder.model,
      maxTokens: this.builder.maxTokens,
      reservedForOutput: this.builder.reservedForOutput,
      systemPrompt: this.builder.systemPrompt,
      siteManifest: input.siteManifestJson,
      affectedSections,
      adjacentSections,
      workItem: input.workItemJson,
      patchFormat: this.builder.patchFormat ?? '',
      cssVariables: input.cssVariables,
      conversationTokens,
    });

    let used = sumBudgetTokens(budget);

    if (used > available) {
      affectedDetail = 'signature';
      affectedSections = buildSectionContexts(
        input.affectedBlocks,
        affectedDetail,
        false,
        this.estimateTokens.bind(this),
      );
      budget = this.buildBudget({
        model: this.builder.model,
        maxTokens: this.builder.maxTokens,
        reservedForOutput: this.builder.reservedForOutput,
        systemPrompt: this.builder.systemPrompt,
        siteManifest: input.siteManifestJson,
        affectedSections,
        adjacentSections,
        workItem: input.workItemJson,
        patchFormat: this.builder.patchFormat ?? '',
        cssVariables: input.cssVariables,
        conversationTokens,
      });
      used = sumBudgetTokens(budget);
    }

    if (used > available && conversationMessages.length > 0) {
      conversationMessages = [];
      conversationTokens = 0;
      budget = this.buildBudget({
        model: this.builder.model,
        maxTokens: this.builder.maxTokens,
        reservedForOutput: this.builder.reservedForOutput,
        systemPrompt: this.builder.systemPrompt,
        siteManifest: input.siteManifestJson,
        affectedSections,
        adjacentSections,
        workItem: input.workItemJson,
        patchFormat: this.builder.patchFormat ?? '',
        cssVariables: input.cssVariables,
        conversationTokens,
      });
      used = sumBudgetTokens(budget);
    }

    const context: BuildContext = {
      mode: 'minimal',
      budget,
      systemPrompt: this.builder.systemPrompt,
      siteManifest: input.manifest,
      siteManifestJson: input.siteManifestJson,
      workItem: input.atom,
      workItemJson: input.workItemJson,
      patchFormat: this.builder.patchFormat ?? '',
      cssVariables: input.cssVariables,
      affectedSections,
      adjacentSections,
      conversation: conversationMessages,
    };

    return {
      context,
      utilization: buildUtilization(used, available),
    };
  }

  private assembleMinimalChatContext(input: {
    backlogSummary: string;
    conversation: ChatMessage[];
  }): { context: ChatContext; utilization: ContextUtilization } {
    const available = calculateAvailable(this.chat.maxTokens, this.chat.reservedForOutput);
    let backlogSummary = input.backlogSummary;
    let conversationMessages = input.conversation.length > 0 ? [input.conversation[0]] : [];
    let conversationTokens = sumConversationTokens(
      conversationMessages,
      this.estimateTokens.bind(this),
    );

    let budget = this.buildBudget({
      model: this.chat.model,
      maxTokens: this.chat.maxTokens,
      reservedForOutput: this.chat.reservedForOutput,
      systemPrompt: this.chat.systemPrompt,
      siteManifest: '',
      affectedSections: [],
      adjacentSections: [],
      workItem: '',
      patchFormat: '',
      cssVariables: '',
      conversationTokens,
    });

    let used = sumBudgetTokens(budget) + this.estimateTokens(backlogSummary);

    if (used > available) {
      backlogSummary = '';
      used = sumBudgetTokens(budget);
    }

    const context: ChatContext = {
      mode: 'minimal',
      budget,
      systemPrompt: this.chat.systemPrompt,
      backlogSummary,
      conversation: conversationMessages,
    };

    return {
      context,
      utilization: buildUtilization(used, available),
    };
  }
}

function sanitizeNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function sanitizeRatio(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return fallback;
  }
  if (value >= 1) {
    return 0.99;
  }
  return value;
}

function calculateAvailable(maxTokens: number, reservedForOutput: number): number {
  const available = maxTokens - reservedForOutput;
  return available > 0 ? available : 0;
}

function calculateRatio(historyBudget: number, available: number): number {
  if (available <= 0) {
    return 0;
  }
  return Math.max(0, historyBudget) / available;
}

function getTailLimit(ratio: number, thresholds: ContextThresholds): number | null {
  if (ratio < thresholds.tight) {
    return 2;
  }
  if (ratio < thresholds.moderate) {
    return 5;
  }
  return null;
}

function sumSectionTokens(sections: SectionContext[]): number {
  return sections.reduce((total, section) => total + section.tokens, 0);
}

function sumConversationTokens(
  conversation: ChatMessage[],
  estimator: (text: string) => number,
): number {
  return conversation.reduce((total, message) => total + estimator(message.content), 0);
}

function sumBudgetTokens(budget: ContextBudget): number {
  return (
    budget.systemPrompt +
    budget.siteManifest +
    budget.affectedSections +
    budget.adjacentContext +
    budget.workItem +
    budget.patchFormat +
    budget.cssVariables +
    budget.conversationHistory
  );
}

function buildUtilization(used: number, available: number): ContextUtilization {
  const percent = available > 0 ? (used / available) * 100 : 0;
  return { used, available, percent };
}

function buildManifest(vfs: VirtualFileSystem): SiteManifest {
  const pages: SiteManifestPage[] = [];
  const cssBlocks: string[] = [];
  const jsFunctions: string[] = [];
  const blockSet = new Set<string>();
  const funcSet = new Set<string>();

  const files = Array.from(vfs.files.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  for (const file of files) {
    const lowerPath = file.path.toLowerCase();
    if (lowerPath.endsWith('.html')) {
      pages.push({
        path: file.path,
        sections: extractSectionNames(file.content),
      });
      continue;
    }

    if (lowerPath.endsWith('.css')) {
      for (const block of extractBlockNames(file.content)) {
        if (!blockSet.has(block)) {
          blockSet.add(block);
          cssBlocks.push(block);
        }
      }
      continue;
    }

    if (lowerPath.endsWith('.js')) {
      for (const func of extractFunctionNames(file.content)) {
        if (!funcSet.has(func)) {
          funcSet.add(func);
          jsFunctions.push(func);
        }
      }
    }
  }

  return {
    pages,
    cssBlocks,
    jsFunctions,
    theme: {
      colors: { ...vfs.metadata.colors },
      fonts: { ...vfs.metadata.fonts },
    },
  };
}

function extractSectionNames(html: string): string[] {
  const sections: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(SECTION_OPEN_REGEX)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      sections.push(name);
    }
  }
  return sections;
}

function extractBlockNames(css: string): string[] {
  const blocks: string[] = [];
  const seen = new Set<string>();
  for (const match of css.matchAll(BLOCK_REGEX)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      blocks.push(name);
    }
  }
  return blocks;
}

function extractFunctionNames(js: string): string[] {
  const funcs: string[] = [];
  const seen = new Set<string>();
  for (const match of js.matchAll(FUNC_REGEX)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      funcs.push(name);
    }
  }
  return funcs;
}

function extractSectionBlocks(vfs: VirtualFileSystem): SectionBlock[] {
  const blocks: SectionBlock[] = [];
  const files = Array.from(vfs.files.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  for (const file of files) {
    if (!file.path.toLowerCase().endsWith('.html')) {
      continue;
    }
    let index = 0;
    for (const match of file.content.matchAll(SECTION_BLOCK_REGEX)) {
      const name = match[1];
      const content = match[0];
      blocks.push({
        name,
        path: file.path,
        content,
        order: index,
      });
      index += 1;
    }
  }

  return blocks;
}

function selectAffectedBlocks(
  atom: WorkItem,
  manifest: SiteManifest,
  blocks: SectionBlock[],
): SectionBlock[] {
  const text = `${atom.title} ${atom.description}`.toLowerCase();
  const matchedNames = new Set<string>();

  for (const page of manifest.pages) {
    for (const section of page.sections) {
      if (textIncludesSection(text, section)) {
        matchedNames.add(section);
      }
    }
  }

  let affected = blocks.filter((block) => matchedNames.has(block.name));

  if (affected.length === 0) {
    const touchedHtml = new Set(
      atom.filesTouch
        .filter((path) => path.toLowerCase().endsWith('.html'))
        .map((path) => path),
    );
    if (touchedHtml.size > 0) {
      affected = blocks.filter((block) => touchedHtml.has(block.path));
    }
  }

  if (affected.length === 0 && blocks.length > 0) {
    affected = [blocks[0]];
  }

  return affected;
}

function selectAdjacentBlocks(
  affectedBlocks: SectionBlock[],
  manifest: SiteManifest,
  blocks: SectionBlock[],
): SectionBlock[] {
  const affectedNames = new Set(affectedBlocks.map((block) => block.name));
  const adjacentNames = new Set<string>();

  for (const page of manifest.pages) {
    for (let i = 0; i < page.sections.length; i += 1) {
      const name = page.sections[i];
      if (!affectedNames.has(name)) {
        continue;
      }
      const prev = page.sections[i - 1];
      const next = page.sections[i + 1];
      if (prev && !affectedNames.has(prev)) {
        adjacentNames.add(prev);
      }
      if (next && !affectedNames.has(next)) {
        adjacentNames.add(next);
      }
    }
  }

  return blocks.filter((block) => adjacentNames.has(block.name));
}

function buildSectionContexts(
  blocks: SectionBlock[],
  detail: SectionDetail,
  readonly: boolean,
  estimator: (text: string) => number,
): SectionContext[] {
  return blocks.map((block) => {
    const content = detail === 'full' ? block.content : buildSignature(block);
    return {
      name: block.name,
      path: block.path,
      content,
      readonly,
      detail,
      tokens: estimator(content),
    };
  });
}

function buildSignature(block: SectionBlock): string {
  const cleaned = block.content
    .replace(/<!--\s*\/?PP:SECTION:[^>]+-->/g, '')
    .trim();
  const firstLine = cleaned
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const snippet = firstLine ?? '';
  const summary = snippet ? `${block.name}: ${snippet}` : `${block.name} section`;
  return `[signature] ${summary}`;
}

function textIncludesSection(text: string, section: string): boolean {
  return text.includes(section.toLowerCase());
}

function extractCssVariables(vfs: VirtualFileSystem): string {
  const files = Array.from(vfs.files.values());
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith('.css')) {
      continue;
    }
    const match = file.content.match(CSS_VARIABLES_BLOCK_REGEX);
    if (match) {
      return match[0];
    }
  }
  return '';
}

function buildBacklogSummary(backlog: WorkItem[]): string {
  if (backlog.length === 0) {
    return '[]';
  }
  const summary = backlog.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    atomType: item.atomType,
    order: item.order,
    visibleChange: item.visibleChange,
  }));
  return JSON.stringify(summary);
}

function buildSummaryMessage(first: ChatMessage, trimmedCount: number): ChatMessage {
  return {
    id: `summary-${first.id}`,
    sessionId: first.sessionId,
    timestamp: first.timestamp + 1,
    sender: 'system',
    content: `[${trimmedCount} earlier messages summarized to preserve context.]`,
  };
}
