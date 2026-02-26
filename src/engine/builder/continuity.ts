import type { WorkItem } from '../../types/backlog';
import type { ContinuityCheck, ContinuityResult } from '../../types/build';
import type { VirtualFile, VirtualFileSystem } from '../../types/vfs';

const SECTION_OPEN_REGEX = /<!--\s*PP:SECTION:([A-Za-z0-9_-]+)\s*-->/g;
const ROOT_BLOCK_REGEX = /:root\s*{[\s\S]*?}/g;
const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/;

const NAV_SECTION_ID = 'nav';

export function validateContinuity(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
  atom: WorkItem,
): { pass: boolean; violations: string[] } {
  const checks = buildContinuityChecks(atom);
  const violations: string[] = [];

  for (const check of checks) {
    const result = check.check(before, after);
    if (!result.pass) {
      const reason = result.reason ?? 'failed';
      violations.push(`${check.name}: ${reason}`);
    }
  }

  return { pass: violations.length === 0, violations };
}

function buildContinuityChecks(atom: WorkItem): ContinuityCheck[] {
  return [
    {
      name: 'scaffold_intact',
      check: (before, after) => scaffoldIntact(before, after, atom),
    },
    {
      name: 'theme_consistent',
      check: (before, after) => themeConsistent(before, after, atom),
    },
    {
      name: 'nav_consistent',
      check: (before, after) => navConsistent(before, after, atom),
    },
    {
      name: 'no_unrelated_changes',
      check: (before, after) => noUnrelatedChanges(before, after, atom),
    },
    {
      name: 'section_count_delta',
      check: (before, after) => sectionCountDelta(before, after, atom),
    },
    {
      name: 'css_variable_usage',
      check: (before, after) => cssVariableUsage(before, after),
    },
  ];
}

function scaffoldIntact(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
  atom: WorkItem,
): ContinuityResult {
  const beforeSections = collectSectionNames(before);
  const afterSections = collectSectionNames(after);
  const missing = Array.from(beforeSections).filter(
    (name) => !afterSections.has(name),
  );

  if (missing.length === 0) {
    return { pass: true };
  }

  const expectedDelta = getExpectedSectionDelta(atom);
  const allowedMissing = expectedDelta < 0 ? Math.abs(expectedDelta) : 0;
  if (missing.length <= allowedMissing) {
    return { pass: true };
  }

  return {
    pass: false,
    reason: `Missing section anchors: ${missing.join(', ')}`,
  };
}

function themeConsistent(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
  atom: WorkItem,
): ContinuityResult {
  if (atom.atomType === 'style') {
    return { pass: true };
  }

  const beforeRoot = collectRootBlocks(before);
  const afterRoot = collectRootBlocks(after);

  if (beforeRoot === afterRoot) {
    return { pass: true };
  }

  return {
    pass: false,
    reason: ':root CSS variables block changed for non-style atom.',
  };
}

function navConsistent(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
  atom: WorkItem,
): ContinuityResult {
  if (atomTargetsNav(atom)) {
    return { pass: true };
  }

  const beforeNav = collectSectionBlocksByFile(before, NAV_SECTION_ID);
  const afterNav = collectSectionBlocksByFile(after, NAV_SECTION_ID);

  if (mapsEqual(beforeNav, afterNav, arraysEqual)) {
    return { pass: true };
  }

  return {
    pass: false,
    reason: 'Navigation section content changed by a non-nav atom.',
  };
}

function noUnrelatedChanges(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
  atom: WorkItem,
): ContinuityResult {
  const changedFiles = collectChangedFiles(before, after);
  const allowed = new Set(atom.filesTouch);
  const unexpected = Array.from(changedFiles).filter(
    (path) => !allowed.has(path),
  );

  if (unexpected.length === 0) {
    return { pass: true };
  }

  return {
    pass: false,
    reason: `Unrelated files modified: ${unexpected.join(', ')}`,
  };
}

function sectionCountDelta(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
  atom: WorkItem,
): ContinuityResult {
  const expectedDelta = getExpectedSectionDelta(atom);
  const actualDelta = countSections(after) - countSections(before);

  if (actualDelta === expectedDelta) {
    return { pass: true };
  }

  return {
    pass: false,
    reason: `Section delta ${actualDelta} does not match expected ${expectedDelta}.`,
  };
}

function cssVariableUsage(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
): ContinuityResult {
  const changedFiles = collectChangedFiles(before, after);
  const cssFiles = Array.from(changedFiles).filter((path) =>
    path.toLowerCase().endsWith('.css'),
  );

  for (const path of cssFiles) {
    const beforeFile = before.files.get(path);
    const afterFile = after.files.get(path);
    if (!afterFile) {
      continue;
    }

    const addedLines = diffAddedLines(
      beforeFile ? beforeFile.content : '',
      afterFile.content,
    );
    const rootContent = normalizeWhitespace(collectRootBlocksFromCss(afterFile.content));

    for (const rawLine of addedLines) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }
      if (line.startsWith('/*') || line.startsWith('*') || line.startsWith('//')) {
        continue;
      }
      if (rootContent.length > 0 && rootContent.includes(normalizeWhitespace(line))) {
        continue;
      }
      if (HEX_COLOR_REGEX.test(line)) {
        return {
          pass: false,
          reason: `Hardcoded hex color in new CSS: "${line}" (${path}).`,
        };
      }
    }
  }

  return { pass: true };
}

function collectSectionNames(vfs: VirtualFileSystem): Set<string> {
  const sections = new Set<string>();

  for (const file of vfs.files.values()) {
    if (!file.path.toLowerCase().endsWith('.html')) {
      continue;
    }
    for (const match of file.content.matchAll(SECTION_OPEN_REGEX)) {
      sections.add(match[1]);
    }
  }

  return sections;
}

function collectRootBlocks(vfs: VirtualFileSystem): string {
  const blocks: string[] = [];
  const files = listFilesByExtension(vfs, '.css');

  for (const file of files) {
    const matches = file.content.match(ROOT_BLOCK_REGEX);
    if (!matches) {
      continue;
    }
    for (const match of matches) {
      blocks.push(match.trim());
    }
  }

  return blocks.join('\n');
}

function collectRootBlocksFromCss(css: string): string {
  const matches = css.match(ROOT_BLOCK_REGEX);
  if (!matches) {
    return '';
  }
  return matches.map((match) => match.trim()).join('\n');
}

function collectSectionBlocksByFile(
  vfs: VirtualFileSystem,
  sectionId: string,
): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  const files = listFilesByExtension(vfs, '.html');

  for (const file of files) {
    const extracted = extractSectionBlocks(file.content, sectionId).map(
      (block) => normalizeWhitespace(block),
    );
    if (extracted.length > 0) {
      blocks.set(file.path, extracted);
    }
  }

  return blocks;
}

function extractSectionBlocks(html: string, sectionId: string): string[] {
  const escaped = escapeRegExp(sectionId);
  const regex = new RegExp(
    `<!--\\s*PP:SECTION:${escaped}\\s*-->[\\s\\S]*?<!--\\s*\\/PP:SECTION:${escaped}\\s*-->`,
    'g',
  );
  return html.match(regex) ?? [];
}

function listFilesByExtension(
  vfs: VirtualFileSystem,
  ext: string,
): VirtualFile[] {
  const files: VirtualFile[] = [];
  const lowerExt = ext.toLowerCase();

  for (const file of vfs.files.values()) {
    if (file.path.toLowerCase().endsWith(lowerExt)) {
      files.push(file);
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function collectChangedFiles(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
): Set<string> {
  const paths = new Set<string>();

  for (const path of before.files.keys()) {
    paths.add(path);
  }
  for (const path of after.files.keys()) {
    paths.add(path);
  }

  const changed = new Set<string>();
  for (const path of paths) {
    const beforeFile = before.files.get(path);
    const afterFile = after.files.get(path);
    if (!beforeFile || !afterFile) {
      changed.add(path);
      continue;
    }
    if (beforeFile.content !== afterFile.content) {
      changed.add(path);
    }
  }

  return changed;
}

function diffAddedLines(before: string, after: string): string[] {
  const beforeCounts = new Map<string, number>();
  for (const line of before.split(/\r?\n/)) {
    const count = beforeCounts.get(line) ?? 0;
    beforeCounts.set(line, count + 1);
  }

  const added: string[] = [];
  for (const line of after.split(/\r?\n/)) {
    const count = beforeCounts.get(line) ?? 0;
    if (count > 0) {
      beforeCounts.set(line, count - 1);
    } else {
      added.push(line);
    }
  }

  return added;
}

function countSections(vfs: VirtualFileSystem): number {
  let count = 0;
  const files = listFilesByExtension(vfs, '.html');

  for (const file of files) {
    const matches = file.content.match(SECTION_OPEN_REGEX);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

function getExpectedSectionDelta(atom: WorkItem): number {
  if (typeof atom.expectedSectionDelta === 'number') {
    return Number.isNaN(atom.expectedSectionDelta) ? 0 : atom.expectedSectionDelta;
  }
  return 0;
}

function atomTargetsNav(atom: WorkItem): boolean {
  const text = `${atom.title} ${atom.description}`.toLowerCase();
  return (
    /\bnav\b/.test(text) ||
    /\bnavigation\b/.test(text) ||
    /\bmenu\b/.test(text)
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function mapsEqual<T>(
  left: Map<string, T>,
  right: Map<string, T>,
  valueEqual: (a: T, b: T) => boolean,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    const other = right.get(key);
    if (other === undefined || !valueEqual(value, other)) {
      return false;
    }
  }
  return true;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
