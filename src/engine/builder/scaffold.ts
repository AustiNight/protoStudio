import type { RepairResult, ScaffoldHealth, ScaffoldIssue } from '../../types/build';
import { VirtualFileSystem } from '../vfs/vfs';

interface AnchorToken {
  id: string;
  kind: 'open' | 'close';
  index: number;
  raw: string;
  canonical: boolean;
}

interface AnchorAudit {
  issues: ScaffoldIssue[];
  intact: number;
  total: number;
}

interface AnchorPair {
  id: string;
  open: AnchorToken;
  close: AnchorToken;
}

const HTML_LOOSE_REGEX = /<!--\s*(\/)?\s*PP\s*:\s*SECTION\s*:\s*([A-Za-z0-9_-]+)\s*-->/g;
const CSS_LOOSE_REGEX =
  /\/\*\s*===?\s*(\/)?\s*PP\s*:\s*BLOCK\s*:\s*([A-Za-z0-9_-]+)\s*===?\s*\*\//g;
const JS_LOOSE_REGEX =
  /\/\/\s*===?\s*(\/)?\s*PP\s*:\s*FUNC\s*:\s*([A-Za-z0-9_-]+)\s*===?/g;

const HTML_STRICT_OPEN = /^<!--\s*PP:SECTION:([A-Za-z0-9_-]+)\s*-->$/;
const HTML_STRICT_CLOSE = /^<!--\s*\/PP:SECTION:([A-Za-z0-9_-]+)\s*-->$/;
const CSS_STRICT_OPEN = /^\/\*\s*===\s*PP:BLOCK:([A-Za-z0-9_-]+)\s*===\s*\*\/$/;
const CSS_STRICT_CLOSE = /^\/\*\s*===\s*\/PP:BLOCK:([A-Za-z0-9_-]+)\s*===\s*\*\/$/;
const JS_STRICT_OPEN = /^\/\/\s*===\s*PP:FUNC:([A-Za-z0-9_-]+)\s*===$/;
const JS_STRICT_CLOSE = /^\/\/\s*===\s*\/PP:FUNC:([A-Za-z0-9_-]+)\s*===$/;

export class ScaffoldAuditor {
  audit(vfs: VirtualFileSystem): ScaffoldHealth {
    const issues: ScaffoldIssue[] = [];
    let sectionsIntact = 0;
    let sectionsTotal = 0;
    let cssBlocksIntact = 0;
    let cssBlocksTotal = 0;
    let jsFuncsIntact = 0;
    let jsFuncsTotal = 0;

    for (const [path, file] of vfs.files) {
      const lower = path.toLowerCase();
      if (lower.endsWith('.html')) {
        const result = auditHtmlAnchors(path, file.content);
        issues.push(...result.issues);
        sectionsIntact += result.intact;
        sectionsTotal += result.total;
      } else if (lower.endsWith('.css')) {
        const result = auditCssAnchors(path, file.content);
        issues.push(...result.issues);
        cssBlocksIntact += result.intact;
        cssBlocksTotal += result.total;
      } else if (lower.endsWith('.js')) {
        const result = auditJsAnchors(path, file.content);
        issues.push(...result.issues);
        jsFuncsIntact += result.intact;
        jsFuncsTotal += result.total;
      }
    }

    return {
      score: calculateHealthScore(issues),
      sectionsIntact,
      sectionsTotal,
      cssBlocksIntact,
      cssBlocksTotal,
      jsFuncsIntact,
      jsFuncsTotal,
      issues,
    };
  }

  async repair(vfs: VirtualFileSystem, issues: ScaffoldIssue[]): Promise<RepairResult> {
    const repairableIssues = issues.filter((issue) => issue.autoRepairable);
    const issuesByFile = new Map<string, ScaffoldIssue[]>();

    for (const issue of repairableIssues) {
      const list = issuesByFile.get(issue.file) ?? [];
      list.push(issue);
      issuesByFile.set(issue.file, list);
    }

    let repaired = 0;

    for (const [filePath, fileIssues] of issuesByFile) {
      const file = vfs.getFile(filePath);
      if (!file) {
        continue;
      }

      const lower = filePath.toLowerCase();
      const result = lower.endsWith('.html')
        ? repairHtmlFile(file.content, fileIssues)
        : lower.endsWith('.css')
          ? repairCssFile(file.content, fileIssues)
          : lower.endsWith('.js')
            ? repairJsFile(file.content, fileIssues)
            : null;

      if (!result) {
        continue;
      }

      if (result.content !== file.content) {
        await vfs.updateFile(filePath, result.content);
      }
      repaired += result.repaired;
    }

    return {
      repaired,
      unrepairable: Math.max(issues.length - repaired, 0),
    };
  }
}

function auditHtmlAnchors(file: string, content: string): AnchorAudit {
  const tokens = parseAnchors(content, HTML_LOOSE_REGEX, (raw, kind) =>
    isCanonicalHtmlAnchor(raw, kind),
  );
  const issues: ScaffoldIssue[] = [];
  const openIds = new Set<string>();
  const closeIds = new Set<string>();

  for (const token of tokens) {
    if (token.kind === 'open') {
      openIds.add(token.id);
    } else {
      closeIds.add(token.id);
    }

    if (!token.canonical) {
      issues.push(buildIssue('warning', file, token.id, 'malformed', true));
    }
  }

  const pairs: AnchorPair[] = [];
  const stack: AnchorToken[] = [];
  for (const token of tokens) {
    if (token.kind === 'open') {
      stack.push(token);
      continue;
    }

    if (!openIds.has(token.id)) {
      issues.push(buildIssue('error', file, token.id, 'missing_open', false));
      continue;
    }

    const top = stack[stack.length - 1];
    if (top && top.id === token.id) {
      stack.pop();
      pairs.push({ id: token.id, open: top, close: token });
    } else {
      issues.push(buildIssue('error', file, token.id, 'orphaned', false));
    }
  }

  for (const open of stack) {
    issues.push(buildIssue('error', file, open.id, 'missing_close', true));
  }

  const intactIds = new Set<string>();
  for (const pair of pairs) {
    const hasAttribute = hasMatchingSectionAttribute(
      content,
      pair.open,
      pair.close,
    );
    if (!hasAttribute) {
      issues.push(buildIssue('error', file, pair.id, 'mismatched', false));
      continue;
    }

    if (pair.open.canonical && pair.close.canonical) {
      intactIds.add(pair.id);
    }
  }

  const total = new Set<string>([...openIds, ...closeIds]).size;

  return {
    issues,
    intact: intactIds.size,
    total,
  };
}

function auditCssAnchors(file: string, content: string): AnchorAudit {
  return auditSimpleAnchors(
    file,
    content,
    CSS_LOOSE_REGEX,
    (raw, kind) => isCanonicalCssAnchor(raw, kind),
  );
}

function auditJsAnchors(file: string, content: string): AnchorAudit {
  return auditSimpleAnchors(
    file,
    content,
    JS_LOOSE_REGEX,
    (raw, kind) => isCanonicalJsAnchor(raw, kind),
  );
}

function auditSimpleAnchors(
  file: string,
  content: string,
  looseRegex: RegExp,
  canonicalCheck: (raw: string, kind: AnchorToken['kind']) => boolean,
): AnchorAudit {
  const tokens = parseAnchors(content, looseRegex, canonicalCheck);
  const issues: ScaffoldIssue[] = [];
  const openIds = new Set<string>();
  const closeIds = new Set<string>();

  for (const token of tokens) {
    if (token.kind === 'open') {
      openIds.add(token.id);
    } else {
      closeIds.add(token.id);
    }

    if (!token.canonical) {
      issues.push(buildIssue('warning', file, token.id, 'malformed', true));
    }
  }

  const stack: AnchorToken[] = [];
  const intactIds = new Set<string>();

  for (const token of tokens) {
    if (token.kind === 'open') {
      stack.push(token);
      continue;
    }

    if (!openIds.has(token.id)) {
      issues.push(buildIssue('error', file, token.id, 'missing_open', false));
      continue;
    }

    const top = stack[stack.length - 1];
    if (top && top.id === token.id) {
      stack.pop();
      if (top.canonical && token.canonical) {
        intactIds.add(token.id);
      }
    } else {
      issues.push(buildIssue('error', file, token.id, 'orphaned', false));
    }
  }

  for (const open of stack) {
    issues.push(buildIssue('error', file, open.id, 'missing_close', false));
  }

  const total = new Set<string>([...openIds, ...closeIds]).size;

  return {
    issues,
    intact: intactIds.size,
    total,
  };
}

function repairHtmlFile(
  content: string,
  issues: ScaffoldIssue[],
): { content: string; repaired: number } {
  let updated = content;
  let repaired = 0;

  if (issues.some((issue) => issue.problem === 'malformed')) {
    updated = normalizeHtmlAnchors(updated);
    repaired += issues.filter((issue) => issue.problem === 'malformed').length;
  }

  const missingCloseIssues = issues.filter((issue) => issue.problem === 'missing_close');
  if (missingCloseIssues.length > 0) {
    const missingIds = new Set(missingCloseIssues.map((issue) => issue.anchor));
    const result = insertMissingHtmlCloses(updated, missingIds);
    updated = result.content;
    repaired += result.repaired;
  }

  return { content: updated, repaired };
}

function repairCssFile(
  content: string,
  issues: ScaffoldIssue[],
): { content: string; repaired: number } {
  let updated = content;
  let repaired = 0;

  if (issues.some((issue) => issue.problem === 'malformed')) {
    updated = normalizeCssAnchors(updated);
    repaired += issues.filter((issue) => issue.problem === 'malformed').length;
  }

  return { content: updated, repaired };
}

function repairJsFile(
  content: string,
  issues: ScaffoldIssue[],
): { content: string; repaired: number } {
  let updated = content;
  let repaired = 0;

  if (issues.some((issue) => issue.problem === 'malformed')) {
    updated = normalizeJsAnchors(updated);
    repaired += issues.filter((issue) => issue.problem === 'malformed').length;
  }

  return { content: updated, repaired };
}

function insertMissingHtmlCloses(
  content: string,
  repairableIds: Set<string>,
): { content: string; repaired: number } {
  const tokens = parseAnchors(content, HTML_LOOSE_REGEX, (raw, kind) =>
    isCanonicalHtmlAnchor(raw, kind),
  ).sort((a, b) => a.index - b.index);

  const stack: AnchorToken[] = [];
  const missing: AnchorToken[] = [];

  for (const token of tokens) {
    if (token.kind === 'open') {
      stack.push(token);
      continue;
    }

    const top = stack[stack.length - 1];
    if (top && top.id === token.id) {
      stack.pop();
    }
  }

  for (const open of stack) {
    if (repairableIds.has(open.id)) {
      missing.push(open);
    }
  }

  const insertions: Array<{ index: number; text: string }> = [];

  for (const open of missing) {
    const nextOpen = tokens.find(
      (token) => token.kind === 'open' && token.index > open.index,
    );
    const insertIndex = nextOpen ? nextOpen.index : content.length;
    const indent = getLineIndent(content, open.index);
    const closeAnchor = `${indent}<!-- /PP:SECTION:${open.id} -->`;
    const prefix = insertIndex > 0 && content[insertIndex - 1] !== '\n' ? '\n' : '';
    const suffix = insertIndex < content.length && content[insertIndex] !== '\n' ? '\n' : '';
    insertions.push({
      index: insertIndex,
      text: `${prefix}${closeAnchor}${suffix}`,
    });
  }

  const sorted = insertions.sort((a, b) => b.index - a.index);
  let updated = content;
  for (const insertion of sorted) {
    updated =
      updated.slice(0, insertion.index) +
      insertion.text +
      updated.slice(insertion.index);
  }

  return { content: updated, repaired: insertions.length };
}

function parseAnchors(
  content: string,
  looseRegex: RegExp,
  canonicalCheck: (raw: string, kind: AnchorToken['kind']) => boolean,
): AnchorToken[] {
  const regex = new RegExp(looseRegex.source, 'g');
  const tokens: AnchorToken[] = [];

  for (const match of content.matchAll(regex)) {
    const raw = match[0];
    const slash = match[1];
    const id = match[2];
    const kind: AnchorToken['kind'] = slash ? 'close' : 'open';
    const index = match.index ?? 0;
    tokens.push({
      id,
      kind,
      index,
      raw,
      canonical: canonicalCheck(raw, kind),
    });
  }

  return tokens;
}

function hasMatchingSectionAttribute(
  content: string,
  open: AnchorToken,
  close: AnchorToken,
): boolean {
  const start = open.index + open.raw.length;
  const end = close.index;
  if (start >= end) {
    return false;
  }
  const slice = content.slice(start, end);
  const escaped = escapeRegExp(open.id);
  const regex = new RegExp(`data-pp-section\\s*=\\s*[\"']${escaped}[\"']`);
  return regex.test(slice);
}

function normalizeHtmlAnchors(content: string): string {
  const regex = new RegExp(HTML_LOOSE_REGEX.source, 'g');
  return content.replace(regex, (_, slash, id: string) => {
    if (slash) {
      return `<!-- /PP:SECTION:${id} -->`;
    }
    return `<!-- PP:SECTION:${id} -->`;
  });
}

function normalizeCssAnchors(content: string): string {
  const regex = new RegExp(CSS_LOOSE_REGEX.source, 'g');
  return content.replace(regex, (_, slash, id: string) => {
    if (slash) {
      return `/* === /PP:BLOCK:${id} === */`;
    }
    return `/* === PP:BLOCK:${id} === */`;
  });
}

function normalizeJsAnchors(content: string): string {
  const regex = new RegExp(JS_LOOSE_REGEX.source, 'g');
  return content.replace(regex, (_, slash, id: string) => {
    if (slash) {
      return `// === /PP:FUNC:${id} ===`;
    }
    return `// === PP:FUNC:${id} ===`;
  });
}

function isCanonicalHtmlAnchor(raw: string, kind: AnchorToken['kind']): boolean {
  const target = raw.trim();
  if (kind === 'open') {
    return HTML_STRICT_OPEN.test(target);
  }
  return HTML_STRICT_CLOSE.test(target);
}

function isCanonicalCssAnchor(raw: string, kind: AnchorToken['kind']): boolean {
  const target = raw.trim();
  if (kind === 'open') {
    return CSS_STRICT_OPEN.test(target);
  }
  return CSS_STRICT_CLOSE.test(target);
}

function isCanonicalJsAnchor(raw: string, kind: AnchorToken['kind']): boolean {
  const target = raw.trim();
  if (kind === 'open') {
    return JS_STRICT_OPEN.test(target);
  }
  return JS_STRICT_CLOSE.test(target);
}

function buildIssue(
  severity: ScaffoldIssue['severity'],
  file: string,
  anchor: string,
  problem: ScaffoldIssue['problem'],
  autoRepairable: boolean,
): ScaffoldIssue {
  return {
    severity,
    file,
    anchor,
    problem,
    autoRepairable,
  };
}

function calculateHealthScore(issues: ScaffoldIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    score -= issue.severity === 'warning' ? 5 : 15;
  }
  return Math.max(score, 0);
}

function getLineIndent(content: string, index: number): string {
  const lineStart = content.lastIndexOf('\n', index - 1) + 1;
  const line = content.slice(lineStart, index);
  const match = line.match(/^\s*/);
  return match ? match[0] : '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
