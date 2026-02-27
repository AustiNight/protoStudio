import type { SeoValidationIssue, SeoValidationResult } from '../../types/seo';
import type { VirtualFile } from '../../types/vfs';

export interface SeoValidationInput {
  files: Map<string, VirtualFile>;
}

const META_DESCRIPTION_REGEX = /<meta\b[^>]*\bname=["']description["'][^>]*>/i;
const OG_TITLE_REGEX = /<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/i;
const OG_DESCRIPTION_REGEX = /<meta\b[^>]*\bproperty=["']og:description["'][^>]*>/i;
const OG_IMAGE_REGEX = /<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/i;
const JSON_LD_REGEX = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>/i;

export function validateSeoArtifacts(input: SeoValidationInput): SeoValidationResult {
  const issues: SeoValidationIssue[] = [];
  const indexFile = input.files.get('index.html');
  const html = indexFile?.content ?? '';

  if (!indexFile) {
    issues.push({
      path: 'index.html',
      message: 'index.html is missing.',
    });
  }

  if (!META_DESCRIPTION_REGEX.test(html)) {
    issues.push({
      path: 'index.html',
      message: 'Meta description tag is missing.',
    });
  }

  if (!OG_TITLE_REGEX.test(html)) {
    issues.push({
      path: 'index.html',
      message: 'Open Graph title tag is missing.',
    });
  }

  if (!OG_DESCRIPTION_REGEX.test(html)) {
    issues.push({
      path: 'index.html',
      message: 'Open Graph description tag is missing.',
    });
  }

  if (!OG_IMAGE_REGEX.test(html)) {
    issues.push({
      path: 'index.html',
      message: 'Open Graph image tag is missing.',
    });
  }

  if (!JSON_LD_REGEX.test(html)) {
    issues.push({
      path: 'index.html',
      message: 'JSON-LD structured data is missing.',
    });
  }

  const sitemap = input.files.get('sitemap.xml');
  if (!sitemap || !sitemap.content.trim()) {
    issues.push({
      path: 'sitemap.xml',
      message: 'sitemap.xml is missing.',
    });
  }

  const robots = input.files.get('robots.txt');
  if (!robots || !robots.content.trim()) {
    issues.push({
      path: 'robots.txt',
      message: 'robots.txt is missing.',
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
