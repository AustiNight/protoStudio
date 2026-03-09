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

    let html = file.content;
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

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
