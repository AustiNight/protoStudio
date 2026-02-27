import type { ColorPalette, FontSelection } from '../../types/vfs';
import { VirtualFileSystem } from '../vfs/vfs';

export interface DocumentationPacketInput {
  vfs: VirtualFileSystem;
  deploymentUrl?: string;
  captureScreenshot?: ScreenshotCaptureFn;
  now?: () => number;
}

export interface DocumentationPacket {
  root: string;
  files: DocumentationPacketFile[];
  assets: DocumentationAsset[];
  screenshots: DocumentationScreenshot[];
  pdf: DocumentationPdfPayload;
  branding: DocumentationBranding;
  generatedAt: number;
}

export interface DocumentationPacketFile {
  path: string;
  content: string;
}

export interface DocumentationAsset {
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
  mediaType: string;
}

export interface DocumentationScreenshot {
  pagePath: string;
  assetPath: string;
  status: 'ready' | 'pending';
}

export interface DocumentationBranding {
  siteName: string;
  description: string;
  colors: ColorPalette;
  fonts: FontSelection;
  logoPath: string;
}

export interface DocumentationPdfPayload {
  fileName: string;
  html: string;
}

export interface ScreenshotCaptureInput {
  pagePath: string;
  html: string;
}

export interface ScreenshotCaptureResult {
  content: string;
  encoding: 'utf8' | 'base64';
  mediaType: string;
}

export type ScreenshotCaptureFn = (
  input: ScreenshotCaptureInput,
) => Promise<ScreenshotCaptureResult | null> | ScreenshotCaptureResult | null;

const DOC_SECTIONS = [
  { file: '01-site-overview.md', label: 'Site Overview' },
  { file: '02-pages-and-components.md', label: 'Pages and Components' },
  { file: '03-dependencies.md', label: 'Dependencies' },
  { file: '04-custom-domain-setup.md', label: 'Custom Domain Setup' },
  { file: '05-service-configuration.md', label: 'Service Configuration' },
  { file: '06-maintenance-guide.md', label: 'Maintenance Guide' },
  { file: '07-cost-summary.md', label: 'Cost Summary' },
];

const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6V5dW8AAAAASUVORK5CYII=';

const DEPENDENCY_NOTES: Record<string, string> = {
  'fonts.googleapis.com': 'Google Fonts stylesheet (free).',
  'fonts.gstatic.com': 'Google Fonts assets (free).',
  'images.unsplash.com': 'Unsplash images (free, subject to limits).',
  'source.unsplash.com': 'Unsplash source (free, subject to limits).',
  'cdnjs.cloudflare.com': 'cdnjs CDN (free).',
  'cdn.jsdelivr.net': 'JSDelivr CDN (free).',
  'unpkg.com': 'UNPKG CDN (free).',
  'use.fontawesome.com': 'Font Awesome CDN (free tier).',
  'kit.fontawesome.com': 'Font Awesome kit (free tier).',
  'code.jquery.com': 'jQuery CDN (free).',
  'ajax.googleapis.com': 'Google Hosted Libraries (free).',
};

const SECTION_REGEX = /<!--\s*(\/)?\s*PP:SECTION:([A-Za-z0-9_-]+)\s*-->/g;

export async function generateDocumentationPacket(
  input: DocumentationPacketInput,
): Promise<DocumentationPacket> {
  const now = input.now ?? Date.now;
  const metadata = input.vfs.metadata;
  const siteName = metadata.title?.trim() || 'Site';
  const description = metadata.description?.trim() || '';
  const root = `${slugify(siteName)}-docs`;
  const branding: DocumentationBranding = {
    siteName,
    description,
    colors: { ...metadata.colors },
    fonts: { ...metadata.fonts },
    logoPath: 'assets/logo.svg',
  };

  const pages = collectPages(input.vfs);
  const dependencies = collectDependencies(input.vfs);
  const assets: DocumentationAsset[] = [];
  const screenshots: DocumentationScreenshot[] = [];

  assets.push({
    path: branding.logoPath,
    content: buildLogoSvg(branding),
    encoding: 'utf8',
    mediaType: 'image/svg+xml',
  });

  await captureScreenshots({
    pages,
    vfs: input.vfs,
    captureScreenshot: input.captureScreenshot,
    assets,
    screenshots,
  });

  const files: DocumentationPacketFile[] = [
    {
      path: 'README.md',
      content: buildReadme({
        branding,
        generatedAt: now(),
        root,
        pages,
        screenshots,
      }),
    },
    {
      path: '01-site-overview.md',
      content: buildSiteOverview({
        branding,
        pages,
        deploymentUrl: input.deploymentUrl,
        templateId: input.vfs.templateId,
      }),
    },
    {
      path: '02-pages-and-components.md',
      content: buildPagesAndComponents({ pages }),
    },
    {
      path: '03-dependencies.md',
      content: buildDependencies({ dependencies }),
    },
    {
      path: '04-custom-domain-setup.md',
      content: buildCustomDomainSetup(),
    },
    {
      path: '05-service-configuration.md',
      content: buildServiceConfiguration(),
    },
    {
      path: '06-maintenance-guide.md',
      content: buildMaintenanceGuide({ vfs: input.vfs }),
    },
    {
      path: '07-cost-summary.md',
      content: buildCostSummary({ dependencies }),
    },
    {
      path: 'prontoproto-attribution.md',
      content: buildAttribution(),
    },
  ];

  const pdf: DocumentationPdfPayload = {
    fileName: `${root}.pdf`,
    html: buildPdfHtml({
      branding,
      sections: DOC_SECTIONS.map((section) => section.label),
    }),
  };

  return {
    root,
    files,
    assets,
    screenshots,
    pdf,
    branding,
    generatedAt: now(),
  };
}

interface PageSummary {
  path: string;
  sections: string[];
  content: string;
}

interface CaptureScreenshotsInput {
  pages: PageSummary[];
  vfs: VirtualFileSystem;
  captureScreenshot?: ScreenshotCaptureFn;
  assets: DocumentationAsset[];
  screenshots: DocumentationScreenshot[];
}

async function captureScreenshots(
  input: CaptureScreenshotsInput,
): Promise<void> {
  for (const page of input.pages) {
    const assetPath = buildScreenshotPath(page.path);
    let status: DocumentationScreenshot['status'] = 'pending';

    const capture = input.captureScreenshot;
    if (capture) {
      const html = inlineAssets(page.content, input.vfs);
      const result = await capture({ pagePath: page.path, html });
      if (result) {
        input.assets.push({
          path: assetPath,
          content: result.content,
          encoding: result.encoding,
          mediaType: result.mediaType,
        });
        status = 'ready';
      }
    }

    if (status === 'pending') {
      input.assets.push({
        path: assetPath,
        content: TRANSPARENT_PNG_BASE64,
        encoding: 'base64',
        mediaType: 'image/png',
      });
    }

    input.screenshots.push({ pagePath: page.path, assetPath, status });
  }
}

function collectPages(vfs: VirtualFileSystem): PageSummary[] {
  const pages: PageSummary[] = [];
  const files = Array.from(vfs.files.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  for (const file of files) {
    if (!file.path.toLowerCase().endsWith('.html')) {
      continue;
    }
    pages.push({
      path: file.path,
      sections: extractSectionNames(file.content),
      content: file.content,
    });
  }

  return pages;
}

interface DependencyEntry {
  url: string;
  host: string;
  note: string;
}

function collectDependencies(vfs: VirtualFileSystem): DependencyEntry[] {
  const urls = new Set<string>();

  for (const file of vfs.files.values()) {
    const path = file.path.toLowerCase();
    if (!path.endsWith('.html') && !path.endsWith('.css') && !path.endsWith('.js')) {
      continue;
    }
    extractUrls(file.content).forEach((url) => urls.add(url));
  }

  const entries: DependencyEntry[] = [];
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const host = parsed.host;
      entries.push({
        url,
        host,
        note: DEPENDENCY_NOTES[host] ?? 'Review provider limits.',
      });
    } catch {
      continue;
    }
  }

  return entries.sort((a, b) => a.host.localeCompare(b.host));
}

function buildReadme(input: {
  branding: DocumentationBranding;
  generatedAt: number;
  root: string;
  pages: PageSummary[];
  screenshots: DocumentationScreenshot[];
}): string {
  const { branding } = input;
  const formattedDate = new Date(input.generatedAt).toISOString();

  const toc = DOC_SECTIONS.map(
    (section) => `1. [${section.label}](${section.file})`,
  ).join('\n');

  const screenshotSection =
    input.screenshots.length > 0
      ? [
          '## Screenshots',
          '',
          ...input.screenshots.map((shot) =>
            `- ![${shot.pagePath}](${shot.assetPath})`,
          ),
          '',
        ].join('\n')
      : '';

  return [
    `# ${branding.siteName} Documentation Packet`,
    '',
    `![${branding.siteName} Logo](${branding.logoPath})`,
    '',
    branding.description ? `_${branding.description}_` : '',
    '',
    '## Branding',
    '',
    `- Primary color: \`${branding.colors.primary}\``,
    `- Accent color: \`${branding.colors.accent}\``,
    `- Heading font: \`${branding.fonts.headingFont}\``,
    `- Body font: \`${branding.fonts.bodyFont}\``,
    '',
    '## Contents',
    '',
    toc,
    '',
    screenshotSection,
    '## Packet Metadata',
    '',
    `- Folder: \`${input.root}\``,
    `- Generated: \`${formattedDate}\``,
    `- Pages: ${input.pages.length}`,
    '',
    '## Attribution',
    '',
    '- [prontoproto-attribution](prontoproto-attribution.md)',
    '',
  ]
    .filter((line, index, lines) => {
      if (line !== '') {
        return true;
      }
      return lines[index - 1] !== '';
    })
    .join('\n')
    .trimEnd();
}

function buildSiteOverview(input: {
  branding: DocumentationBranding;
  pages: PageSummary[];
  deploymentUrl?: string;
  templateId?: string;
}): string {
  const { branding, pages } = input;
  const templateLine = input.templateId
    ? `- Template: \`${input.templateId}\``
    : '- Template: Custom build';

  const pageLines =
    pages.length > 0
      ? pages.map(
          (page) =>
            `- \`${page.path}\` (${page.sections.length} sections)`,
        )
      : ['- No HTML pages detected.'];

  return [
    '# Site Overview',
    '',
    '## Summary',
    '',
    `- Site name: ${branding.siteName}`,
    branding.description ? `- Description: ${branding.description}` : '',
    input.deploymentUrl ? `- Live URL: ${input.deploymentUrl}` : '',
    templateLine,
    '',
    '## Brand System',
    '',
    `- Primary color: \`${branding.colors.primary}\``,
    `- Accent color: \`${branding.colors.accent}\``,
    `- Secondary color: \`${branding.colors.secondary}\``,
    `- Background color: \`${branding.colors.bg}\``,
    `- Text color: \`${branding.colors.text}\``,
    `- Heading font: \`${branding.fonts.headingFont}\``,
    `- Body font: \`${branding.fonts.bodyFont}\``,
    '',
    '## Pages',
    '',
    ...pageLines,
    '',
    '## Tech Stack',
    '',
    '- Static HTML, CSS, and vanilla JavaScript.',
    '- Zero-cost hosting compatible (GitHub Pages, Cloudflare Pages, Netlify).',
    '- No server-side dependencies required.',
    '',
  ]
    .filter((line, index, lines) => {
      if (line !== '') {
        return true;
      }
      return lines[index - 1] !== '';
    })
    .join('\n')
    .trimEnd();
}

function buildPagesAndComponents(input: { pages: PageSummary[] }): string {
  const sections =
    input.pages.length > 0
      ? input.pages
          .map((page) => {
            const lines = [
              `## ${page.path}`,
              '',
              page.sections.length > 0
                ? page.sections.map((section) => `- ${section}`).join('\n')
                : '- No section anchors detected.',
              '',
            ];
            return lines.join('\n');
          })
          .join('\n')
      : 'No HTML pages were found in the deploy bundle.';

  return ['# Pages and Components', '', sections]
    .filter((line, index, lines) => {
      if (line !== '') {
        return true;
      }
      return lines[index - 1] !== '';
    })
    .join('\n')
    .trimEnd();
}

function buildDependencies(input: { dependencies: DependencyEntry[] }): string {
  if (input.dependencies.length === 0) {
    return [
      '# Dependencies',
      '',
      'No third-party dependencies were detected in the generated site.',
      '',
    ].join('\n');
  }

  const rows = input.dependencies.map(
    (dep) => `| ${dep.host} | ${dep.url} | ${dep.note} |`,
  );

  return [
    '# Dependencies',
    '',
    'External services and CDNs referenced by the site:',
    '',
    '| Host | Example URL | Free-Tier Notes |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function buildCustomDomainSetup(): string {
  return [
    '# Custom Domain Setup',
    '',
    'Use these steps to connect a custom domain to your deployed site.',
    '',
    '## Step 1: Purchase a domain',
    '',
    '- Buy from any registrar (Namecheap, Google Domains, etc.).',
    '- Keep access to the DNS settings for the domain.',
    '',
    '## Step 2: Configure DNS',
    '',
    '- Add a `CNAME` record for `www` pointing at your deploy host.',
    '- Add `A` records for the root (`@`) if your host requires them.',
    '',
    '## Host-specific notes',
    '',
    '- GitHub Pages: Add a `CNAME` file to the repo and set the custom domain in Pages settings.',
    '- Cloudflare Pages: Add the domain in the Pages dashboard; Cloudflare will provide DNS records.',
    '- Netlify: Add the domain under Site Settings -> Domain management.',
    '',
    '## Step 3: Verify SSL',
    '',
    '- Wait for the host to issue a TLS certificate (usually automatic).',
    '- Confirm the site loads over `https://`.',
    '',
  ].join('\n');
}

function buildServiceConfiguration(): string {
  return [
    '# Service Configuration',
    '',
    'If your site uses any optional services, configure them using the guidance below.',
    '',
    '## Forms',
    '',
    '- Netlify: Enable form handling in the Netlify dashboard.',
    '- Cloudflare Pages: Use a lightweight form provider or Cloudflare Workers.',
    '',
    '## Serverless or Edge Functions',
    '',
    '- Cloudflare Pages + Workers: deploy under the same account for edge features.',
    '- Netlify Functions: ensure the `functions/` folder is deployed when needed.',
    '',
    '## Media and CDN Assets',
    '',
    '- Replace placeholder images with your own SVG or Unsplash sources.',
    '- Keep external dependencies within free-tier limits.',
    '',
  ].join('\n');
}

function buildMaintenanceGuide(input: { vfs: VirtualFileSystem }): string {
  const files = input.vfs
    .listFiles()
    .filter((path) => !path.toLowerCase().startsWith('node_modules'))
    .map((path) => `- \`${path}\``);

  return [
    '# Maintenance Guide',
    '',
    '## Key Files',
    '',
    ...files,
    '',
    '## Updating Content',
    '',
    '- Edit HTML content directly in the relevant page file.',
    '- Update styles in `styles.css` and scripts in `main.js`.',
    '- Keep section anchors (`PP:SECTION`) intact to preserve builder compatibility.',
    '',
    '## Redeploying',
    '',
    '- Re-run the deploy flow after making changes.',
    '- Validate that the live URL reflects your updates.',
    '',
  ].join('\n');
}

function buildCostSummary(input: { dependencies: DependencyEntry[] }): string {
  const dependencyNotes =
    input.dependencies.length > 0
      ? input.dependencies.map((dep) => `- ${dep.host}: ${dep.note}`)
      : ['- No external paid services detected.'];

  return [
    '# Cost Summary',
    '',
    '## Current Cost',
    '',
    '- $0.00 per month (assuming free-tier usage).',
    '',
    '## Potential Cost Triggers',
    '',
    '- Custom domain registration and renewal.',
    '- Exceeding bandwidth limits on free hosting tiers.',
    '- Paid upgrades for third-party services (forms, analytics, etc.).',
    '',
    '## External Services',
    '',
    ...dependencyNotes,
    '',
  ].join('\n');
}

function buildAttribution(): string {
  return [
    '# Attribution',
    '',
    'Built with prontoproto.studio.',
    '',
  ].join('\n');
}

function buildPdfHtml(input: {
  branding: DocumentationBranding;
  sections: string[];
}): string {
  const { branding, sections } = input;
  const sectionList = sections.map((section) => `<li>${escapeHtml(section)}</li>`);

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(branding.siteName)} Documentation</title>`,
    '<style>',
    'body { font-family: sans-serif; margin: 48px; color: #111827; }',
    'h1 { color: #111827; margin-bottom: 8px; }',
    'h2 { margin-top: 32px; }',
    '.brand { display: flex; gap: 16px; align-items: center; }',
    '.swatch { width: 24px; height: 24px; border-radius: 6px; display: inline-block; }',
    '.meta { font-size: 14px; color: #4b5563; }',
    '</style>',
    '</head>',
    '<body>',
    `<h1>${escapeHtml(branding.siteName)} Documentation Packet</h1>`,
    branding.description ? `<p class="meta">${escapeHtml(branding.description)}</p>` : '',
    '<div class="brand">',
    `<span class="swatch" style="background:${escapeHtml(
      branding.colors.primary,
    )}"></span>`,
    `<span class="swatch" style="background:${escapeHtml(
      branding.colors.accent,
    )}"></span>`,
    `<div class="meta">Fonts: ${escapeHtml(
      branding.fonts.headingFont,
    )} / ${escapeHtml(branding.fonts.bodyFont)}</div>`,
    '</div>',
    '<h2>Sections</h2>',
    '<ul>',
    ...sectionList,
    '</ul>',
    '<p class="meta">Built with prontoproto.studio.</p>',
    '</body>',
    '</html>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function buildLogoSvg(branding: DocumentationBranding): string {
  const title = escapeXml(branding.siteName);
  const primary = escapeXml(branding.colors.primary);
  const accent = escapeXml(branding.colors.accent);
  const textColor = escapeXml(branding.colors.bg);
  const font = escapeXml(branding.fonts.headingFont || 'sans-serif');

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200" viewBox="0 0 640 200" role="img" aria-label="Site logo">',
    `<rect width="640" height="200" fill="${primary}"/>`,
    `<rect x="32" y="32" width="136" height="136" rx="24" fill="${accent}"/>`,
    `<text x="200" y="110" fill="${textColor}" font-size="48" font-family="${font}, sans-serif" font-weight="700">${title}</text>`,
    `<text x="200" y="148" fill="${textColor}" font-size="20" font-family="${font}, sans-serif" opacity="0.85">Documentation Packet</text>`,
    '</svg>',
  ].join('');
}

function extractSectionNames(html: string): string[] {
  const sections: string[] = [];
  const seen = new Set<string>();
  SECTION_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SECTION_REGEX.exec(html)) !== null) {
    const isClosing = Boolean(match[1]);
    const name = match[2];
    if (isClosing || !name) {
      continue;
    }
    if (!seen.has(name)) {
      seen.add(name);
      sections.push(name);
    }
  }

  return sections;
}

function buildScreenshotPath(pagePath: string): string {
  const sanitized = pagePath
    .replace(/\\/g, '/')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const name = sanitized || 'page';
  return `assets/screenshot-${name}.png`;
}

function inlineAssets(html: string, vfs: VirtualFileSystem): string {
  const css = vfs.getFile('styles.css')?.content ?? '';
  const js = vfs.getFile('main.js')?.content ?? '';
  let output = html;

  if (css) {
    const linkRegex = /<link[^>]+href=["']styles\.css["'][^>]*>/i;
    const styleTag = `<style>\n${css}\n</style>`;
    if (linkRegex.test(output)) {
      output = output.replace(linkRegex, styleTag);
    } else if (output.includes('</head>')) {
      output = output.replace('</head>', `${styleTag}\n</head>`);
    } else {
      output = `${styleTag}\n${output}`;
    }
  }

  if (js) {
    const scriptRegex = /<script[^>]+src=["']main\.js["'][^>]*>\s*<\/script>/i;
    const scriptTag = `<script>\n${js}\n</script>`;
    if (scriptRegex.test(output)) {
      output = output.replace(scriptRegex, scriptTag);
    } else if (output.includes('</body>')) {
      output = output.replace('</body>', `${scriptTag}\n</body>`);
    } else {
      output = `${output}\n${scriptTag}`;
    }
  }

  return output;
}

function extractUrls(content: string): string[] {
  const urls: string[] = [];
  const regex = /https?:\/\/[^\s"'()<>]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const raw = match[0];
    const cleaned = raw.replace(/[),.;]+$/g, '');
    urls.push(cleaned);
  }
  return urls;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'site';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(value: string): string {
  return escapeXml(value);
}
