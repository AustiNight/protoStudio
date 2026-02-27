import type { VirtualFileSystem } from '../../types/vfs';

export type DeployValidationSeverity = 'error' | 'warning';

export interface DeployValidationIssue {
  id: string;
  message: string;
  severity: DeployValidationSeverity;
  path?: string;
}

export interface LighthouseStubResult {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  pwa?: number;
  isStub: true;
}

export interface DeployValidationResult {
  valid: boolean;
  issues: DeployValidationIssue[];
  lighthouse: LighthouseStubResult;
}

export interface DeployValidationInput {
  vfs: VirtualFileSystem;
  maxBytes?: number;
  dependencyAllowlist?: string[];
}

const MAX_SITE_BYTES = 100 * 1024 * 1024;
const STATIC_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.xml',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.txt',
  '.map',
  '.webmanifest',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pdf',
]);
const STATIC_EXTENSIONLESS = new Set(['CNAME', '.nojekyll']);
const DEFAULT_DEPENDENCY_ALLOWLIST = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'use.fontawesome.com',
  'kit.fontawesome.com',
  'code.jquery.com',
  'ajax.googleapis.com',
];

export function runDeployValidators(
  input: DeployValidationInput,
): DeployValidationResult {
  const issues: DeployValidationIssue[] = [];
  const maxBytes = input.maxBytes ?? MAX_SITE_BYTES;
  const allowlist =
    input.dependencyAllowlist ?? DEFAULT_DEPENDENCY_ALLOWLIST;

  issues.push(...checkNoNodeModules(input.vfs));
  issues.push(...checkStaticAssets(input.vfs));
  issues.push(...checkInternalLinks(input.vfs));
  issues.push(...checkTotalSize(input.vfs, maxBytes));
  issues.push(...checkDependencyAllowlist(input.vfs, allowlist));

  const lighthouse = runLighthouseStub();
  const valid = issues.every((issue) => issue.severity !== 'error');

  return { valid, issues, lighthouse };
}

function checkNoNodeModules(vfs: VirtualFileSystem): DeployValidationIssue[] {
  const issues: DeployValidationIssue[] = [];
  for (const path of vfs.files.keys()) {
    const segments = path.split('/');
    if (segments.includes('node_modules')) {
      issues.push({
        id: 'deploy_node_modules',
        message: 'node_modules must not be included in the deploy bundle.',
        severity: 'error',
        path,
      });
      break;
    }
  }
  return issues;
}

function checkStaticAssets(vfs: VirtualFileSystem): DeployValidationIssue[] {
  const issues: DeployValidationIssue[] = [];

  for (const path of vfs.files.keys()) {
    const extension = extractExtension(path);
    if (extension) {
      if (!STATIC_EXTENSIONS.has(extension)) {
        issues.push({
          id: 'deploy_static_assets',
          message: `Non-static file detected (${path}).`,
          severity: 'error',
          path,
        });
        break;
      }
      continue;
    }

    const baseName = extractBaseName(path);
    if (!STATIC_EXTENSIONLESS.has(baseName)) {
      issues.push({
        id: 'deploy_static_assets',
        message: `File without extension is not allowed (${path}).`,
        severity: 'error',
        path,
      });
      break;
    }
  }

  return issues;
}

function checkInternalLinks(vfs: VirtualFileSystem): DeployValidationIssue[] {
  const issues: DeployValidationIssue[] = [];
  const missing: string[] = [];
  const files = Array.from(vfs.files.values()).filter((file) =>
    file.path.toLowerCase().endsWith('.html'),
  );

  for (const file of files) {
    const targets = extractLinkTargets(file.content);
    for (const target of targets) {
      const normalized = normalizeInternalTarget(target);
      if (!normalized) {
        continue;
      }
      const resolved = resolveInternalPath(file.path, normalized);
      if (pathExists(vfs, resolved.path, resolved.directoryHint)) {
        continue;
      }
      const label = `${file.path} -> ${resolved.path}`;
      if (!missing.includes(label)) {
        missing.push(label);
      }
    }
  }

  if (missing.length > 0) {
    issues.push({
      id: 'deploy_link_missing',
      message: `Broken internal link(s): ${summarizeList(missing)}`,
      severity: 'error',
    });
  }

  return issues;
}

function checkTotalSize(
  vfs: VirtualFileSystem,
  maxBytes: number,
): DeployValidationIssue[] {
  let totalBytes = 0;
  for (const file of vfs.files.values()) {
    totalBytes += measureBytes(file.content);
  }

  if (totalBytes > maxBytes) {
    return [
      {
        id: 'deploy_size_limit',
        message: `Deploy bundle is too large (${formatBytes(
          totalBytes,
        )}). Max allowed is ${formatBytes(maxBytes)}.`,
        severity: 'error',
      },
    ];
  }

  return [];
}

function checkDependencyAllowlist(
  vfs: VirtualFileSystem,
  allowlist: string[],
): DeployValidationIssue[] {
  const issues: DeployValidationIssue[] = [];
  const disallowedHosts = new Set<string>();
  const insecureUrls = new Set<string>();

  for (const file of vfs.files.values()) {
    const path = file.path.toLowerCase();
    if (path.endsWith('.html')) {
      const urls = extractDependencyUrlsFromHtml(file.content);
      collectDependencyIssues(urls, allowlist, disallowedHosts, insecureUrls);
    } else if (path.endsWith('.css')) {
      const urls = extractDependencyUrlsFromCss(file.content);
      collectDependencyIssues(urls, allowlist, disallowedHosts, insecureUrls);
    }
  }

  if (insecureUrls.size > 0) {
    issues.push({
      id: 'deploy_dependency_insecure',
      message: `Insecure dependency URL(s) detected: ${summarizeList(
        Array.from(insecureUrls),
      )}`,
      severity: 'error',
    });
  }

  if (disallowedHosts.size > 0) {
    issues.push({
      id: 'deploy_dependency_allowlist',
      message: `Dependency host not allowlisted: ${summarizeList(
        Array.from(disallowedHosts),
      )}`,
      severity: 'error',
    });
  }

  return issues;
}

function runLighthouseStub(): LighthouseStubResult {
  return {
    performance: 0.92,
    accessibility: 0.96,
    bestPractices: 0.93,
    seo: 0.91,
    pwa: 0.6,
    isStub: true,
  };
}

function extractLinkTargets(html: string): string[] {
  const targets: string[] = [];
  const seen = new Set<string>();
  const quotedRegex = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi;
  let match: RegExpExecArray | null = null;
  while ((match = quotedRegex.exec(html)) !== null) {
    const value = match[2]?.trim() ?? '';
    if (value && !seen.has(value)) {
      seen.add(value);
      targets.push(value);
    }
  }

  const unquotedRegex = /\b(?:href|src)\s*=\s*([^\s"'<>]+)/gi;
  while ((match = unquotedRegex.exec(html)) !== null) {
    const value = match[1]?.trim() ?? '';
    if (value && !seen.has(value)) {
      seen.add(value);
      targets.push(value);
    }
  }

  return targets;
}

function normalizeInternalTarget(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('//') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('sms:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('#')
  ) {
    return null;
  }

  return stripQueryHash(trimmed);
}

function stripQueryHash(value: string): string {
  const hashIndex = value.indexOf('#');
  const queryIndex = value.indexOf('?');
  let endIndex = value.length;
  if (hashIndex >= 0) {
    endIndex = Math.min(endIndex, hashIndex);
  }
  if (queryIndex >= 0) {
    endIndex = Math.min(endIndex, queryIndex);
  }
  return value.slice(0, endIndex);
}

function resolveInternalPath(
  currentPath: string,
  target: string,
): { path: string; directoryHint: boolean } {
  const isRooted = target.startsWith('/');
  const hasTrailingSlash = target.endsWith('/');
  const normalizedTarget = isRooted ? target.slice(1) : target;
  const baseDir = isRooted
    ? ''
    : currentPath.includes('/')
      ? currentPath.slice(0, currentPath.lastIndexOf('/') + 1)
      : '';

  const combined = `${baseDir}${normalizedTarget}`;
  const normalized = normalizePath(combined, hasTrailingSlash);
  const hasExtension = Boolean(extractExtension(normalized));
  return {
    path: normalized || 'index.html',
    directoryHint: hasTrailingSlash || !hasExtension,
  };
}

function normalizePath(path: string, preserveTrailingSlash: boolean): string {
  const parts = path.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  const normalized = stack.join('/');
  if (preserveTrailingSlash && normalized) {
    return `${normalized}/`;
  }
  return normalized;
}

function pathExists(
  vfs: VirtualFileSystem,
  path: string,
  directoryHint: boolean,
): boolean {
  if (vfs.files.has(path)) {
    return true;
  }
  if (directoryHint) {
    const normalized = path.endsWith('/') ? path : `${path}/`;
    const candidate = `${normalized}index.html`;
    if (vfs.files.has(candidate)) {
      return true;
    }
  }
  return false;
}

function extractDependencyUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const scriptRegex = /<script[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;
  const linkRegex = /<link[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;
  let match: RegExpExecArray | null = null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const value = match[2]?.trim() ?? '';
    if (value && !seen.has(value)) {
      seen.add(value);
      urls.push(value);
    }
  }

  while ((match = linkRegex.exec(html)) !== null) {
    const value = match[2]?.trim() ?? '';
    if (value && !seen.has(value)) {
      seen.add(value);
      urls.push(value);
    }
  }

  return urls;
}

function extractDependencyUrlsFromCss(css: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const importRegex = /@import\s+(?:url\()?['"]?([^'"\)\s]+)['"]?\)?/gi;
  let match: RegExpExecArray | null = null;
  while ((match = importRegex.exec(css)) !== null) {
    const value = match[1]?.trim() ?? '';
    if (value && !seen.has(value)) {
      seen.add(value);
      urls.push(value);
    }
  }
  return urls;
}

function collectDependencyIssues(
  urls: string[],
  allowlist: string[],
  disallowedHosts: Set<string>,
  insecureUrls: Set<string>,
): void {
  for (const url of urls) {
    if (url.startsWith('http://')) {
      insecureUrls.add(url);
      continue;
    }
    if (!url.startsWith('https://') && !url.startsWith('//')) {
      continue;
    }
    const host = extractHost(url);
    if (!host) {
      continue;
    }
    if (!isHostAllowlisted(host, allowlist)) {
      disallowedHosts.add(host);
    }
  }
}

function extractHost(url: string): string | null {
  const match = url.match(/^https?:\/\/([^/]+)/i) ?? url.match(/^\/\/([^/]+)/);
  if (!match) {
    return null;
  }
  return match[1].toLowerCase();
}

function isHostAllowlisted(host: string, allowlist: string[]): boolean {
  for (const allowed of allowlist) {
    if (host === allowed) {
      return true;
    }
    if (host.endsWith(`.${allowed}`)) {
      return true;
    }
  }
  return false;
}

function extractExtension(path: string): string | null {
  const base = extractBaseName(path);
  const index = base.lastIndexOf('.');
  if (index <= 0) {
    return null;
  }
  return base.slice(index).toLowerCase();
}

function extractBaseName(path: string): string {
  const index = path.lastIndexOf('/');
  return index >= 0 ? path.slice(index + 1) : path;
}

function measureBytes(content: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(content).length;
  }
  return content.length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function summarizeList(values: string[], max = 3): string {
  if (values.length <= max) {
    return values.join(', ');
  }
  const shown = values.slice(0, max).join(', ');
  return `${shown} (+${values.length - max} more)`;
}
