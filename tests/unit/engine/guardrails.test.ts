import { describe, expect, it } from 'vitest';
import {
  buildPreviewSecurityHeaders,
  decideGuardrailAction,
  runGuardrails,
} from '../../../src/engine/guardrails/guardrails';
import { GuardrailInput } from '../../../src/types/guardrails';

const baseHtml = `<!doctype html>
<html lang="en">
<head>
  <title>Test</title>
</head>
<body>
  <!-- PP:SECTION:hero -->
  <section class="hero" data-pp-section="hero">
    <img src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80" alt="Hero image" />
    <h1>Hero</h1>
  </section>
  <!-- /PP:SECTION:hero -->
</body>
</html>`;

const baseCss = `/* === PP:BLOCK:variables === */
:root {
  --color-text: #111111;
  --color-bg: #ffffff;
}
/* === /PP:BLOCK:variables === */

/* === PP:BLOCK:hero-styles === */
.hero {
  color: var(--color-text);
  background: var(--color-bg);
}
/* === /PP:BLOCK:hero-styles === */`;

const baseJs = `// === PP:FUNC:main ===
function main() {}
// === /PP:FUNC:main ===`;

function buildBaseInput(): GuardrailInput {
  const headers = buildPreviewSecurityHeaders();
  return {
    html: baseHtml,
    css: baseCss,
    js: baseJs,
    atom: {
      filesTouched: 2,
      linesChanged: 40,
      llmCalls: 2,
      wallTimeMs: 20_000,
      visibleChange: true,
    },
    deploy: {
      selectedHost: 'github_pages',
      availableHosts: ['github_pages', 'netlify'],
    },
    preview: {
      cspHeader: headers.csp,
      sriEnabled: headers.sriRequired,
    },
  };
}

describe('guardrails', () => {
  it('should pass when guardrails are satisfied', () => {
    const report = runGuardrails(buildBaseInput());
    expect(report.pass).toBe(true);
    expect(report.violations.length).toBe(0);
  });

  it('should fail when missing closing PP:SECTION anchor', () => {
    const input = buildBaseInput();
    input.html = input.html.replace('<!-- /PP:SECTION:hero -->', '');
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'anchor_html_missing_close')).toBe(true);
  });

  it('should fail when CSS contains hardcoded hex', () => {
    const input = buildBaseInput();
    input.css = `${input.css}\n.hero { color: #ff0000; }`;
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'css_hardcoded_hex')).toBe(true);
  });

  it('should fail when CSP header is missing', () => {
    const input = buildBaseInput();
    input.preview.cspHeader = '';
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'preview_csp_missing')).toBe(true);
  });

  it('should fail when CSP allows unsafe-eval', () => {
    const input = buildBaseInput();
    input.preview.cspHeader = "default-src 'self'; script-src 'self' 'unsafe-eval'";
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'preview_csp_eval')).toBe(true);
  });

  it('should reject autoplay media', () => {
    const input = buildBaseInput();
    input.html = `${input.html}\n<video autoplay></video>`;
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'ux_autoplay')).toBe(true);
  });

  it('should reject autoplay audio', () => {
    const input = buildBaseInput();
    input.html = `${input.html}\n<audio autoplay></audio>`;
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'ux_autoplay')).toBe(true);
  });

  it('should reject modal on load patterns', () => {
    const input = buildBaseInput();
    input.html = `${input.html}\n<dialog open></dialog>`;
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'ux_modal_on_load')).toBe(true);
  });

  it('should reject eval usage in scripts', () => {
    const input = buildBaseInput();
    input.js = `${input.js}\nconst x = eval('1 + 1');`;
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'security_eval')).toBe(true);
  });

  it('should enforce WCAG AA contrast from :root variables', () => {
    const input = buildBaseInput();
    input.css = input.css
      .replace('#111111', '#777777')
      .replace('#ffffff', '#888888');
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'a11y_contrast')).toBe(true);
  });

  it('should fail when CSS uses rgb/hsl outside :root', () => {
    const input = buildBaseInput();
    input.css = `${input.css}\n.hero { background: rgb(0, 0, 0); }`;
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'css_hardcoded_color_fn')).toBe(true);
  });

  it('should enforce zero-cost host priority', () => {
    const input = buildBaseInput();
    input.deploy.selectedHost = 'netlify';
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'deploy_host_priority')).toBe(true);
  });

  it('should require alt text on images', () => {
    const input = buildBaseInput();
    input.html = input.html.replace('alt=\"Hero image\"', '');
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'a11y_img_alt')).toBe(true);
  });

  it('should block image upload UI', () => {
    const input = buildBaseInput();
    input.html = `${input.html}\n<form enctype=\"multipart/form-data\"><input type=\"file\" accept=\"image/*\" /></form>`;
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'content_image_upload')).toBe(
      true,
    );
  });

  it('should reject non-Unsplash image sources', () => {
    const input = buildBaseInput();
    input.html = input.html.replace(
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80',
      'https://example.com/hero.jpg',
    );
    const report = runGuardrails(input);
    expect(report.pass).toBe(false);
    expect(report.violations.some((v) => v.id === 'content_image_source')).toBe(
      true,
    );
  });

  it('should block swap and recommend retry or skip', () => {
    const input = buildBaseInput();
    input.preview.cspHeader = '';
    const report = runGuardrails(input);

    const retryDecision = decideGuardrailAction({
      report,
      attempt: 1,
      maxAttempts: 3,
    });
    expect(retryDecision.allowSwap).toBe(false);
    expect(retryDecision.action).toBe('retry');

    const skipDecision = decideGuardrailAction({
      report,
      attempt: 3,
      maxAttempts: 3,
    });
    expect(skipDecision.allowSwap).toBe(false);
    expect(skipDecision.action).toBe('skip');
  });

  it('should build preview security headers without unsafe-eval', () => {
    const headers = buildPreviewSecurityHeaders();
    expect(headers.csp.length).toBeGreaterThan(0);
    expect(headers.csp.includes("'unsafe-eval'")).toBe(false);
    expect(headers.sriRequired).toBe(true);
  });
});
