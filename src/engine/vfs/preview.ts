import type { AppError, Result } from '../../types/result';

import { VirtualFileSystem } from './vfs';

export interface PreviewPayload {
  pagePath: string;
  html: string;
  routes: Record<string, string>;
}

export function buildPreviewHtml(
  vfs: VirtualFileSystem,
  preferredPath?: string,
): Result<PreviewPayload, AppError> {
  const pagePath = resolvePreviewPath(vfs, preferredPath);
  if (!pagePath) {
    return errResult({
      category: 'fatal',
      code: 'preview_missing_page',
      message: 'No HTML pages available to render preview.',
    });
  }

  const page = vfs.getFile(pagePath);
  if (!page) {
    return errResult({
      category: 'fatal',
      code: 'preview_page_missing',
      message: `Preview page "${pagePath}" not found in VFS.`,
    });
  }

  let html = page.content;
  const css = vfs.getFile('styles.css')?.content ?? null;
  const js = vfs.getFile('main.js')?.content ?? null;

  html = inlineLocalImageAssets(html, vfs, pagePath);

  if (css) {
    html = inlineStylesheet(html, css);
  }

  if (js) {
    html = inlineScript(html, js);
  }

  const routes = buildRoutes(vfs, css, js);
  if (!(pagePath in routes)) {
    routes[pagePath] = html;
  }

  return okResult({ pagePath, html, routes });
}

function resolvePreviewPath(
  vfs: VirtualFileSystem,
  preferredPath?: string,
): string | null {
  const htmlFiles = vfs
    .listFiles()
    .filter((path) => path.toLowerCase().endsWith('.html'));

  if (htmlFiles.length === 0) {
    return null;
  }

  if (preferredPath && htmlFiles.includes(preferredPath)) {
    return preferredPath;
  }

  if (htmlFiles.includes('index.html')) {
    return 'index.html';
  }

  return htmlFiles[0] ?? null;
}

function inlineStylesheet(html: string, css: string): string {
  const linkRegex = /<link[^>]+href=["']styles\.css["'][^>]*>/i;
  const styleTag = `<style>\n${css}\n</style>`;

  if (linkRegex.test(html)) {
    return html.replace(linkRegex, styleTag);
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `${styleTag}\n</head>`);
  }

  return `${styleTag}\n${html}`;
}

function inlineScript(html: string, script: string): string {
  const scriptRegex = /<script[^>]+src=["']main\.js["'][^>]*>\s*<\/script>/i;
  const scriptTag = `<script>\n${script}\n</script>`;

  if (scriptRegex.test(html)) {
    return html.replace(scriptRegex, scriptTag);
  }

  if (html.includes('</body>')) {
    return html.replace('</body>', `${scriptTag}\n</body>`);
  }

  return `${html}\n${scriptTag}`;
}

function buildRoutes(
  vfs: VirtualFileSystem,
  css: string | null,
  js: string | null,
): Record<string, string> {
  const routes: Record<string, string> = {};
  const htmlFiles = vfs
    .listFiles()
    .filter((path) => path.toLowerCase().endsWith('.html'));

  for (const path of htmlFiles) {
    const file = vfs.getFile(path);
    if (!file) {
      continue;
    }

    let html = inlineLocalImageAssets(file.content, vfs, path);
    if (css) {
      html = inlineStylesheet(html, css);
    }
    if (js) {
      html = inlineScript(html, js);
    }
    routes[path] = html;
  }

  return routes;
}

function inlineLocalImageAssets(
  html: string,
  vfs: VirtualFileSystem,
  pagePath: string,
): string {
  const attributeRegex = /\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi;
  return html.replace(attributeRegex, (match, attrName: string, quote: string, value: string) => {
    const resolved = resolveLocalImageToDataUri(value, vfs, pagePath);
    if (!resolved) {
      return match;
    }
    return `${attrName}=${quote}${resolved}${quote}`;
  });
}

function resolveLocalImageToDataUri(
  value: string,
  vfs: VirtualFileSystem,
  pagePath: string,
): string | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('//') ||
    raw.startsWith('#') ||
    raw.startsWith('blob:') ||
    raw.startsWith('file:')
  ) {
    return null;
  }

  const sanitized = raw.split('#')[0]?.split('?')[0] ?? raw;
  if (!/\.(svg|png|jpe?g|webp|avif|gif)$/i.test(sanitized)) {
    return null;
  }

  const resolvedPath = resolveRelativePath(pagePath, sanitized);
  const file = vfs.getFile(resolvedPath);
  if (!file) {
    return null;
  }
  return toImageDataUri(resolvedPath, file.content);
}

function resolveRelativePath(pagePath: string, targetPath: string): string {
  if (targetPath.startsWith('/')) {
    return targetPath.replace(/^\/+/, '');
  }
  const pageSegments = pagePath.split('/').filter(Boolean);
  pageSegments.pop();
  const targetSegments = targetPath.split('/').filter(Boolean);
  const merged = [...pageSegments];
  for (const segment of targetSegments) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      merged.pop();
      continue;
    }
    merged.push(segment);
  }
  return merged.join('/');
}

function toImageDataUri(path: string, content: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'svg') {
    return `data:image/svg+xml;utf8,${encodeURIComponent(content)}`;
  }
  const mimeByExt: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    gif: 'image/gif',
  };
  const mime = mimeByExt[ext] ?? 'application/octet-stream';
  const normalized = content.trim().replace(/\s+/g, '');
  const base64 = isLikelyBase64(normalized)
    ? normalized
    : toBase64(content);
  return `data:${mime};base64,${base64}`;
}

function isLikelyBase64(value: string): boolean {
  if (!value || value.length < 16) {
    return false;
  }
  return /^[A-Za-z0-9+/=]+$/.test(value);
}

function toBase64(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(value)));
  }
  return Buffer.from(value, 'utf8').toString('base64');
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
