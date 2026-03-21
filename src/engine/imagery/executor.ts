import type { WorkItem } from '@/types/backlog';
import type { ImageryAssetRecord, ImageryTargetSlot } from '@/types/imagery';
import type { AppError, Result } from '@/types/result';
import { VirtualFileSystem } from '@/engine/vfs/vfs';

import type { ImageryResolver } from './placeholders';

export interface ImageryExecutorInput {
  atom: WorkItem;
  vfs: VirtualFileSystem;
  resolver: ImageryResolver;
  sessionId?: string;
}

export interface ImageryExecutorResult {
  applied: boolean;
  slots: ImageryTargetSlot[];
  assets: ImageryAssetRecord[];
}

export async function runImageryExecutor(
  input: ImageryExecutorInput,
): Promise<Result<ImageryExecutorResult, AppError>> {
  const slots = detectImageryTargetSlots(input.atom);
  const query = `${input.atom.title}. ${input.atom.description}. ${input.atom.visibleChange}`.trim();
  const publicDomain = input.resolver.resolvePublicDomainAsset
    ? await input.resolver.resolvePublicDomainAsset(query)
    : await fallbackPublicDomainAsset(input.resolver, query);
  const generated = input.resolver.resolveGeneratedAsset
    ? await input.resolver.resolveGeneratedAsset(query)
    : await fallbackGeneratedAsset(input.resolver, query);
  const assets = [publicDomain, generated]
    .filter((asset): asset is ImageryAssetRecord => Boolean(asset))
    .map((asset) => ({
      ...asset,
      sessionId: input.sessionId ?? asset.sessionId,
      workItemId: input.atom.id,
      targetSlots: (slots.length > 0 ? slots : ['general']) as ImageryTargetSlot[],
      provenance: asset.provenance === 'generated' || asset.provenance === 'public_domain'
        ? 'executor_fallback'
        : asset.provenance,
    }));
  if (assets.length === 0) {
    return errResult({
      category: 'retryable',
      code: 'imagery_executor_assets_missing',
      message: 'Imagery executor could not retrieve or generate assets.',
    });
  }

  const primaryHtmlPath =
    input.atom.filesTouch.find((path) => path.toLowerCase().endsWith('.html') && input.vfs.hasFile(path)) ??
    input.vfs.listFiles().find((path) => path.toLowerCase().endsWith('.html'));
  if (!primaryHtmlPath) {
    return errResult({
      category: 'retryable',
      code: 'imagery_executor_html_missing',
      message: 'Imagery executor could not locate a target HTML file.',
    });
  }

  let html = input.vfs.getFile(primaryHtmlPath)?.content ?? '';
  let applied = false;

  if (slots.includes('og:image')) {
    const ogSource = assets[0]?.source ?? '';
    if (ogSource) {
      const next = upsertOgImageMeta(html, ogSource);
      if (next !== html) {
        html = next;
        applied = true;
      }
    }
  }

  if (slots.includes('favicon')) {
    const faviconSource = assets[0]?.source ?? '';
    if (faviconSource) {
      const next = upsertFaviconLink(html, faviconSource);
      if (next !== html) {
        html = next;
        applied = true;
      }
    }
  }

  if (slots.includes('schema:image') || slots.includes('schema:contact')) {
    const schemaSource = assets[0]?.source ?? '';
    const next = upsertSchemaFields(html, {
      image: slots.includes('schema:image') ? schemaSource : undefined,
      ensureContact: slots.includes('schema:contact'),
    });
    if (next !== html) {
      html = next;
      applied = true;
    }
  }

  if (slots.includes('hero') || slots.includes('logo') || slots.includes('general')) {
    const next = injectGallery(html, input.atom.id, assets.map((asset) => asset.source));
    if (next !== html) {
      html = next;
      applied = true;
    }
  }

  if (applied) {
    await input.vfs.updateFile(primaryHtmlPath, html);
    const cssPath = input.vfs.hasFile('styles.css')
      ? 'styles.css'
      : input.vfs.listFiles().find((path) => path.toLowerCase().endsWith('.css'));
    if (cssPath) {
      const existing = input.vfs.getFile(cssPath)?.content ?? '';
      const blockId = `imagery-executor-${sanitizeForId(input.atom.id)}`;
      if (!existing.includes(`PP:BLOCK:${blockId}`)) {
        await input.vfs.updateFile(
          cssPath,
          `${existing.trim()}\n\n${buildExecutorCss(blockId)}\n`,
        );
      }
    }
  }

  return okResult({
    applied,
    slots,
    assets,
  });
}

export function detectImageryTargetSlots(atom: WorkItem): ImageryTargetSlot[] {
  const text = `${atom.title} ${atom.description} ${atom.visibleChange}`.toLowerCase();
  const slots: ImageryTargetSlot[] = [];
  if (/\bog:image\b|\bog image\b|\bopen graph\b/.test(text)) {
    slots.push('og:image');
  }
  if (/\bfavicon\b|\bsite icon\b/.test(text)) {
    slots.push('favicon');
  }
  if (/\bschema\b/.test(text) && /\bimage\b/.test(text)) {
    slots.push('schema:image');
  }
  if (/\bschema\b/.test(text) && /\bcontact\b/.test(text)) {
    slots.push('schema:contact');
  }
  if (/\bhero\b/.test(text)) {
    slots.push('hero');
  }
  if (/\blogo\b|\bbrand mark\b/.test(text)) {
    slots.push('logo');
  }
  if (slots.length === 0) {
    slots.push('general');
  }
  return Array.from(new Set(slots));
}

async function fallbackPublicDomainAsset(
  resolver: ImageryResolver,
  query: string,
): Promise<ImageryAssetRecord | null> {
  const source = await resolver.resolvePublicDomain(query);
  if (!source) {
    return null;
  }
  return {
    id: `asset-public-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    provenance: 'public_domain',
    query,
    targetSlots: ['general'],
    createdAt: Date.now(),
  };
}

async function fallbackGeneratedAsset(
  resolver: ImageryResolver,
  prompt: string,
): Promise<ImageryAssetRecord | null> {
  const source = await resolver.resolveGenerated(prompt);
  if (!source) {
    return null;
  }
  return {
    id: `asset-generated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    provenance: 'generated',
    prompt,
    targetSlots: ['general'],
    createdAt: Date.now(),
  };
}

function upsertOgImageMeta(html: string, source: string): string {
  const metaRegex = /<meta\s+property=["']og:image["']\s+content=["'][^"']*["']\s*\/?>/i;
  const nextTag = `<meta property="og:image" content="${escapeAttr(source)}">`;
  if (metaRegex.test(html)) {
    return html.replace(metaRegex, nextTag);
  }
  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${nextTag}\n</head>`);
  }
  return `${nextTag}\n${html}`;
}

function upsertFaviconLink(html: string, source: string): string {
  const linkRegex = /<link\b[^>]*\brel=["'][^"']*icon[^"']*["'][^>]*>/i;
  const nextTag = `<link rel="icon" href="${escapeAttr(source)}">`;
  if (linkRegex.test(html)) {
    return html.replace(linkRegex, nextTag);
  }
  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${nextTag}\n</head>`);
  }
  return `${nextTag}\n${html}`;
}

function upsertSchemaFields(
  html: string,
  input: { image?: string; ensureContact?: boolean },
): string {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;
  const match = html.match(scriptRegex);
  const fallbackSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
  } as Record<string, unknown>;

  const applyFields = (schema: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...schema };
    if (input.image) {
      next.image = input.image;
    }
    if (input.ensureContact) {
      next.telephone = next.telephone ?? '+1-000-000-0000';
      next.contactPoint =
        next.contactPoint ??
        [
          {
            '@type': 'ContactPoint',
            telephone: '+1-000-000-0000',
            contactType: 'customer service',
          },
        ];
    }
    return next;
  };

  if (!match) {
    const json = JSON.stringify(applyFields(fallbackSchema), null, 2);
    const tag = `<script type="application/ld+json">\n${json}\n</script>`;
    if (html.includes('</head>')) {
      return html.replace('</head>', `  ${tag}\n</head>`);
    }
    return `${tag}\n${html}`;
  }

  const raw = match[1]?.trim() ?? '';
  let parsed: unknown = fallbackSchema;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = fallbackSchema;
  }
  const normalized =
    Array.isArray(parsed)
      ? parsed.map((entry) =>
          typeof entry === 'object' && entry !== null
            ? applyFields(entry as Record<string, unknown>)
            : entry,
        )
      : typeof parsed === 'object' && parsed !== null
        ? applyFields(parsed as Record<string, unknown>)
        : applyFields(fallbackSchema);
  const replacement = `<script type="application/ld+json">\n${JSON.stringify(normalized, null, 2)}\n</script>`;
  return html.replace(scriptRegex, replacement);
}

function injectGallery(html: string, atomId: string, sources: string[]): string {
  const usable = sources.filter((source) => typeof source === 'string' && source.length > 0);
  if (usable.length === 0) {
    return html;
  }
  const marker = `PP:IMAGERY-EXECUTOR:${sanitizeForId(atomId)}`;
  if (html.includes(marker)) {
    return html;
  }
  const imgs = usable
    .map(
      (source, index) =>
        `<img class="pp-imagery-executor__img" src="${escapeAttr(source)}" alt="Imagery asset ${index + 1}">`,
    )
    .join('');
  const block = `<!-- ${marker} --><div class="pp-imagery-executor">${imgs}</div><!-- /${marker} -->`;
  const sectionRegex = /(<section\b[^>]*data-pp-section=["'][^"']+["'][^>]*>)/i;
  if (sectionRegex.test(html)) {
    return html.replace(sectionRegex, `$1${block}`);
  }
  if (html.includes('</main>')) {
    return html.replace('</main>', `${block}</main>`);
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${block}</body>`);
  }
  return `${html}\n${block}`;
}

function buildExecutorCss(blockId: string): string {
  return [
    `/* === PP:BLOCK:${blockId} === */`,
    '.pp-imagery-executor {',
    '  display: grid;',
    '  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));',
    '  gap: 12px;',
    '  margin-top: 16px;',
    '}',
    '.pp-imagery-executor__img {',
    '  width: 100%;',
    '  height: auto;',
    '  border-radius: 10px;',
    '  object-fit: cover;',
    '}',
    `/* === /PP:BLOCK:${blockId} === */`,
  ].join('\n');
}

function sanitizeForId(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return normalized.length > 0 ? normalized : 'item';
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
