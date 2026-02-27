import {
  AtomMetrics,
  DeploySelection,
  GuardrailDecision,
  GuardrailDecisionInput,
  GuardrailInput,
  GuardrailReport,
  GuardrailViolation,
  HostId,
  PreviewSecurityHeaders,
  PreviewSecurityInput,
} from '../../types/guardrails';
import { isAllowedImageSource } from '../content/imagery';

const HOST_PRIORITY: HostId[] = [
  'github_pages',
  'cloudflare_pages',
  'netlify',
  'vercel',
];

const MAX_FILES_TOUCHED = 5;
const MAX_LINES_CHANGED = 150;
const MAX_LLM_CALLS = 3;
const MAX_WALL_TIME_MS = 90_000;

const DEFAULT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
].join('; ');

const BLOCKED_TRACKER_PATTERNS = [
  'googletagmanager.com',
  'google-analytics.com',
  'gtag/js',
  'analytics.js',
  'segment.com/analytics',
  'cdn.segment.com',
  'mixpanel',
  'hotjar',
  'fullstory',
  'connect.facebook.net',
  'clarity.ms',
];

export function buildPreviewSecurityHeaders(): PreviewSecurityHeaders {
  return {
    csp: DEFAULT_CSP,
    sriRequired: true,
  };
}

export function runGuardrails(input: GuardrailInput): GuardrailReport {
  const violations: GuardrailViolation[] = [];

  violations.push(...checkAnchors(input.html, input.css, input.js));
  violations.push(...checkCssVarUsage(input.css));
  violations.push(...checkAccessibilityBasics(input.html));
  violations.push(...checkImageUploadUi(input.html));
  violations.push(...checkImageSources(input.html, input.css));
  violations.push(...checkHostPriority(input.deploy));
  violations.push(...checkAtomMetrics(input.atom));
  violations.push(...checkPreviewSecurity(input.preview));
  violations.push(...checkThirdPartyTrackers(input.html, input.js));
  violations.push(...checkNoEval(input.js));
  violations.push(...checkAutoplayAndModals(input.html));
  violations.push(...checkContrast(input.css));

  const pass = violations.every((violation) => violation.severity !== 'error');

  return { pass, violations };
}

export function decideGuardrailAction(
  input: GuardrailDecisionInput,
): GuardrailDecision {
  const { report, attempt, maxAttempts } = input;

  if (report.pass) {
    return {
      allowSwap: true,
      action: 'proceed',
      poMessage: 'Guardrails passed. Proceeding with swap.',
    };
  }

  const remaining = Math.max(0, maxAttempts - attempt);
  const action = remaining > 0 ? 'retry' : 'skip';
  const summary = report.violations
    .map((violation) => `- ${violation.message}`)
    .join('\n');
  const poMessage =
    action === 'retry'
      ? `Guardrail violations detected. Retrying.\n${summary}`
      : `Guardrail violations detected. Skipping this atom.\n${summary}`;

  return {
    allowSwap: false,
    action,
    poMessage,
  };
}

function checkAnchors(
  html: string,
  css: string,
  js: string,
): GuardrailViolation[] {
  return [
    ...checkHtmlAnchors(html),
    ...checkCssAnchors(css),
    ...checkJsAnchors(js),
  ];
}

function checkHtmlAnchors(html: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const sectionRegex = /<!--\s*(\/)?\s*PP:SECTION:([A-Za-z0-9_-]+)\s*-->/g;
  const tokens: {
    name: string;
    type: 'open' | 'close';
    index: number;
    raw: string;
  }[] = [];

  for (const match of html.matchAll(sectionRegex)) {
    const raw = match[0];
    const isClose = Boolean(match[1]);
    const name = match[2];
    const index = match.index === undefined ? 0 : match.index;
    const strict = raw === `<!-- ${isClose ? '/' : ''}PP:SECTION:${name} -->`;

    if (!strict) {
      violations.push({
        id: 'anchor_html_whitespace',
        message: `Malformed PP:SECTION anchor formatting for "${name}".`,
        severity: 'warning',
      });
    }

    tokens.push({
      name,
      type: isClose ? 'close' : 'open',
      index,
      raw,
    });
  }

  const stack: string[] = [];

  for (const token of tokens.sort((a, b) => a.index - b.index)) {
    if (token.type === 'open') {
      stack.push(token.name);
      if (!hasDataSectionAttribute(html, token.name)) {
        violations.push({
          id: 'anchor_html_data_attr',
          message: `Missing data-pp-section for "${token.name}".`,
          severity: 'error',
        });
      }
    } else {
      const last = stack.pop();
      if (!last) {
        violations.push({
          id: 'anchor_html_orphan_close',
          message: `Orphaned closing PP:SECTION anchor for "${token.name}".`,
          severity: 'error',
        });
      } else if (last !== token.name) {
        violations.push({
          id: 'anchor_html_mismatch',
          message: `Mismatched PP:SECTION closing anchor for "${token.name}".`,
          severity: 'error',
        });
      }
    }
  }

  for (const remaining of stack) {
    violations.push({
      id: 'anchor_html_missing_close',
      message: `Missing closing PP:SECTION anchor for "${remaining}".`,
      severity: 'error',
    });
  }

  return violations;
}

function hasDataSectionAttribute(html: string, name: string): boolean {
  const doubleQuoted = `data-pp-section="${name}"`;
  const singleQuoted = `data-pp-section='${name}'`;
  return html.includes(doubleQuoted) || html.includes(singleQuoted);
}

function checkCssAnchors(css: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const blockRegex =
    /\/\*\s*===\s*(\/)?PP:BLOCK:([A-Za-z0-9_-]+)\s*===\s*\*\//g;
  const opens: Record<string, number> = {};
  const closes: Record<string, number> = {};

  for (const match of css.matchAll(blockRegex)) {
    const raw = match[0];
    const isClose = Boolean(match[1]);
    const name = match[2];
    const strict =
      raw === `/* === ${isClose ? '/' : ''}PP:BLOCK:${name} === */`;

    if (!strict) {
      violations.push({
        id: 'anchor_css_whitespace',
        message: `Malformed PP:BLOCK anchor formatting for "${name}".`,
        severity: 'warning',
      });
    }

    if (isClose) {
      closes[name] = (closes[name] || 0) + 1;
    } else {
      opens[name] = (opens[name] || 0) + 1;
    }
  }

  const names = new Set([...Object.keys(opens), ...Object.keys(closes)]);

  for (const name of names) {
    const openCount = opens[name] || 0;
    const closeCount = closes[name] || 0;
    if (openCount === 0) {
      violations.push({
        id: 'anchor_css_missing_open',
        message: `Missing opening PP:BLOCK anchor for "${name}".`,
        severity: 'error',
      });
    }
    if (closeCount === 0) {
      violations.push({
        id: 'anchor_css_missing_close',
        message: `Missing closing PP:BLOCK anchor for "${name}".`,
        severity: 'error',
      });
    }
  }

  return violations;
}

function checkJsAnchors(js: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const openCounts: Record<string, number> = {};
  const closeCounts: Record<string, number> = {};
  const lines = js.split('\n');

  for (const line of lines) {
    if (!line.includes('PP:FUNC:')) {
      continue;
    }

    const trimmed = line.trim();
    const strictMatch = trimmed.match(
      /^\/\/ === (\/)?PP:FUNC:([A-Za-z0-9_-]+) ===$/,
    );

    if (!strictMatch) {
      const nameMatch = trimmed.match(/PP:FUNC:([A-Za-z0-9_-]+)/);
      const name = nameMatch ? nameMatch[1] : 'unknown';
      violations.push({
        id: 'anchor_js_whitespace',
        message: `Malformed PP:FUNC anchor formatting for "${name}".`,
        severity: 'warning',
      });
      continue;
    }

    const isClose = Boolean(strictMatch[1]);
    const name = strictMatch[2];

    if (isClose) {
      closeCounts[name] = (closeCounts[name] || 0) + 1;
    } else {
      openCounts[name] = (openCounts[name] || 0) + 1;
    }
  }

  const names = new Set([
    ...Object.keys(openCounts),
    ...Object.keys(closeCounts),
  ]);

  for (const name of names) {
    const openCount = openCounts[name] || 0;
    const closeCount = closeCounts[name] || 0;
    if (openCount === 0) {
      violations.push({
        id: 'anchor_js_missing_open',
        message: `Missing opening PP:FUNC anchor for "${name}".`,
        severity: 'error',
      });
    }
    if (closeCount === 0) {
      violations.push({
        id: 'anchor_js_missing_close',
        message: `Missing closing PP:FUNC anchor for "${name}".`,
        severity: 'error',
      });
    }
  }

  return violations;
}

function checkCssVarUsage(css: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const withoutRoot = stripRootBlocks(css);
  const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
  const colorFuncRegex = /\b(?:rgb|rgba|hsl|hsla)\s*\(/g;

  if (hexRegex.test(withoutRoot)) {
    violations.push({
      id: 'css_hardcoded_hex',
      message: 'Hardcoded hex colors detected outside :root. Use var(--*).',
      severity: 'error',
    });
  }

  if (colorFuncRegex.test(withoutRoot)) {
    violations.push({
      id: 'css_hardcoded_color_fn',
      message: 'Hardcoded rgb/hsl colors detected outside :root. Use var(--*).',
      severity: 'error',
    });
  }

  return violations;
}

function stripRootBlocks(css: string): string {
  return css.replace(/:root\s*{[\s\S]*?}/g, '');
}

function checkAccessibilityBasics(html: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const htmlTagMatch = html.match(/<html\b[^>]*>/i);

  if (!htmlTagMatch || !/\blang=/.test(htmlTagMatch[0])) {
    violations.push({
      id: 'a11y_html_lang',
      message: 'HTML tag must include lang attribute.',
      severity: 'error',
    });
  }

  const imgRegex = /<img\b[^>]*>/gi;
  const images = html.match(imgRegex) || [];
  for (const img of images) {
    if (!/\balt=/.test(img)) {
      violations.push({
        id: 'a11y_img_alt',
        message: 'All images must include alt text.',
        severity: 'error',
      });
      break;
    }
  }

  return violations;
}

function checkImageUploadUi(html: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const fileInputRegex = /<input\b[^>]*\btype\s*=\s*(["']?)file\1/i;
  const multipartFormRegex =
    /<form\b[^>]*\benctype\s*=\s*(["']?)multipart\/form-data\1/i;

  if (fileInputRegex.test(html) || multipartFormRegex.test(html)) {
    violations.push({
      id: 'content_image_upload',
      message: 'Image upload UI is not allowed in generated sites.',
      severity: 'error',
    });
  }

  return violations;
}

function checkImageSources(html: string, css: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const invalidSources: string[] = [];

  const imgRegex = /<img\b[^>]*>/gi;
  const imgTags = html.match(imgRegex) || [];
  for (const tag of imgTags) {
    const srcMatch =
      tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i) ||
      tag.match(/\bsrc\s*=\s*([^\\s>]+)/i);
    const src = srcMatch ? srcMatch[2] ?? srcMatch[1] : '';
    const trimmed = src?.trim();
    if (!trimmed) {
      continue;
    }
    if (!isAllowedImageSource(trimmed)) {
      invalidSources.push(trimmed);
    }
  }

  const urlRegex = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
  let match: RegExpExecArray | null = null;
  while ((match = urlRegex.exec(css)) !== null) {
    const value = match[2]?.trim() ?? '';
    if (!value) {
      continue;
    }
    if (value.startsWith('var(') || value.startsWith('#')) {
      continue;
    }
    if (!isAllowedImageSource(value)) {
      invalidSources.push(value);
    }
  }

  if (invalidSources.length > 0) {
    violations.push({
      id: 'content_image_source',
      message: `Disallowed image source detected (${invalidSources[0]}). Use SVG, gradients, or Unsplash.`,
      severity: 'error',
    });
  }

  return violations;
}

function checkHostPriority(deploy: DeploySelection): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const { selectedHost, availableHosts } = deploy;

  if (!availableHosts.includes(selectedHost)) {
    violations.push({
      id: 'deploy_host_missing',
      message: `Selected host "${selectedHost}" is not available.`,
      severity: 'error',
    });
    return violations;
  }

  const preferred = HOST_PRIORITY.find((host) =>
    availableHosts.includes(host),
  );

  if (preferred && preferred !== selectedHost) {
    violations.push({
      id: 'deploy_host_priority',
      message: `Selected host "${selectedHost}" is not the top zero-cost option.`,
      severity: 'error',
    });
  }

  return violations;
}

function checkAtomMetrics(atom: AtomMetrics): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  if (atom.filesTouched > MAX_FILES_TOUCHED) {
    violations.push({
      id: 'atom_files_touched',
      message: `Atom touches ${atom.filesTouched} files (max ${MAX_FILES_TOUCHED}).`,
      severity: 'error',
    });
  }

  if (atom.linesChanged > MAX_LINES_CHANGED) {
    violations.push({
      id: 'atom_lines_changed',
      message: `Atom changes ${atom.linesChanged} lines (max ${MAX_LINES_CHANGED}).`,
      severity: 'error',
    });
  }

  if (atom.llmCalls > MAX_LLM_CALLS) {
    violations.push({
      id: 'atom_llm_calls',
      message: `Atom uses ${atom.llmCalls} LLM calls (max ${MAX_LLM_CALLS}).`,
      severity: 'error',
    });
  }

  if (atom.wallTimeMs > MAX_WALL_TIME_MS) {
    violations.push({
      id: 'atom_wall_time',
      message: `Atom wall time ${atom.wallTimeMs}ms exceeds ${MAX_WALL_TIME_MS}ms.`,
      severity: 'error',
    });
  }

  if (!atom.visibleChange) {
    violations.push({
      id: 'atom_visible_change',
      message: 'Atom must produce a visible change.',
      severity: 'error',
    });
  }

  return violations;
}

function checkPreviewSecurity(preview: PreviewSecurityInput): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const csp = preview.cspHeader.trim();

  if (!csp) {
    violations.push({
      id: 'preview_csp_missing',
      message: 'Preview CSP header is missing.',
      severity: 'error',
    });
  } else if (csp.includes("'unsafe-eval'")) {
    violations.push({
      id: 'preview_csp_eval',
      message: 'Preview CSP must disallow unsafe-eval.',
      severity: 'error',
    });
  }

  if (!preview.sriEnabled) {
    violations.push({
      id: 'preview_sri_missing',
      message: 'Subresource Integrity is required for preview resources.',
      severity: 'error',
    });
  }

  return violations;
}

function checkThirdPartyTrackers(
  html: string,
  js: string,
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const haystack = `${html}\n${js}`.toLowerCase();

  for (const pattern of BLOCKED_TRACKER_PATTERNS) {
    if (haystack.includes(pattern)) {
      violations.push({
        id: 'privacy_third_party_tracker',
        message: `Third-party tracker detected (${pattern}).`,
        severity: 'error',
      });
      break;
    }
  }

  return violations;
}

function checkNoEval(js: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const evalRegex = /\beval\s*\(|new Function\s*\(/;

  if (evalRegex.test(js)) {
    violations.push({
      id: 'security_eval',
      message: 'eval or Function constructor usage is not allowed.',
      severity: 'error',
    });
  }

  return violations;
}

function checkAutoplayAndModals(html: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const autoplayRegex = /<(video|audio)\b[^>]*\bautoplay\b/i;
  const dialogOpenRegex = /<dialog\b[^>]*\bopen\b/i;
  const modalFlagRegex = /data-open-on-load|data-modal-open\s*=\s*["']?true/i;

  if (autoplayRegex.test(html)) {
    violations.push({
      id: 'ux_autoplay',
      message: 'Autoplaying media is not allowed.',
      severity: 'error',
    });
  }

  if (dialogOpenRegex.test(html) || modalFlagRegex.test(html)) {
    violations.push({
      id: 'ux_modal_on_load',
      message: 'Modal dialogs must not open on load.',
      severity: 'error',
    });
  }

  return violations;
}

function checkContrast(css: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const variables = extractRootVariables(css);
  const textColor =
    variables['color-text'] ||
    variables['text-color'] ||
    variables['color-foreground'];
  const backgroundColor =
    variables['color-bg'] ||
    variables['color-background'] ||
    variables['color-surface'];

  const textHex = textColor ? normalizeHex(textColor) : null;
  const bgHex = backgroundColor ? normalizeHex(backgroundColor) : null;

  if (textHex && bgHex) {
    const ratio = contrastRatio(textHex, bgHex);
    if (ratio < 4.5) {
      violations.push({
        id: 'a11y_contrast',
        message: 'Color contrast must meet WCAG AA (>= 4.5:1).',
        severity: 'error',
      });
    }
  }

  return violations;
}

function extractRootVariables(css: string): Record<string, string> {
  const variables: Record<string, string> = {};
  const rootRegex = /:root\s*{([\s\S]*?)}/g;

  for (const match of css.matchAll(rootRegex)) {
    const body = match[1];
    const varRegex = /--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;

    for (const varMatch of body.matchAll(varRegex)) {
      variables[varMatch[1]] = varMatch[2].trim();
    }
  }

  return variables;
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) {
    return null;
  }

  const hex = match[1];
  if (hex.length === 3) {
    return (
      '#' +
      hex
        .split('')
        .map((ch) => ch + ch)
        .join('')
        .toLowerCase()
    );
  }

  return `#${hex.toLowerCase()}`;
}

function contrastRatio(textHex: string, bgHex: string): number {
  const textRgb = hexToRgb(textHex);
  const bgRgb = hexToRgb(bgHex);

  if (!textRgb || !bgRgb) {
    return 0;
  }

  const textLum = relativeLuminance(textRgb);
  const bgLum = relativeLuminance(bgRgb);
  const lighter = Math.max(textLum, bgLum);
  const darker = Math.min(textLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return null;
  }

  const value = normalized.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return { r, g, b };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const toLinear = (channel: number): number => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };

  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
