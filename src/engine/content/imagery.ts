export interface ImageryPolicy {
  allowUnsplash: boolean;
}

export const DEFAULT_IMAGERY_POLICY: ImageryPolicy = {
  allowUnsplash: true,
};

const UNSPLASH_HOSTS = ['images.unsplash.com', 'source.unsplash.com'];
const UNSPLASH_PLACEHOLDER = 'images.unsplash.com/placeholder';
const IMAGE_FIELD_KEYS = new Set(['image', 'src', 'photo', 'avatar', 'logo', 'ogImage']);

const FALLBACK_SVG_DATA_URI = buildFallbackSvgDataUri();

export function isAllowedImageSource(
  source: string,
  policy: ImageryPolicy = DEFAULT_IMAGERY_POLICY,
): boolean {
  const trimmed = source.trim();
  if (!trimmed) {
    return true;
  }

  const normalized = trimmed.toLowerCase();

  if (normalized.startsWith('blob:') || normalized.startsWith('file:')) {
    return false;
  }

  if (normalized.startsWith('data:image/svg+xml')) {
    return true;
  }

  if (normalized.startsWith('data:image/')) {
    return false;
  }

  if (isSvgPath(normalized)) {
    return true;
  }

  if (normalized.includes(UNSPLASH_PLACEHOLDER)) {
    return false;
  }

  if (policy.allowUnsplash && isUnsplashUrl(normalized)) {
    return true;
  }

  return false;
}

export function sanitizeImageSource(
  source: string,
  policy: ImageryPolicy = DEFAULT_IMAGERY_POLICY,
): string {
  if (isAllowedImageSource(source, policy)) {
    return source;
  }

  return FALLBACK_SVG_DATA_URI;
}

export function sanitizeImageFields(
  record: Record<string, string>,
  policy: ImageryPolicy = DEFAULT_IMAGERY_POLICY,
): Record<string, string> {
  IMAGE_FIELD_KEYS.forEach((key) => {
    const value = record[key];
    if (value) {
      record[key] = sanitizeImageSource(value, policy);
    }
  });

  return record;
}

export function buildFallbackSvgDataUri(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="Pattern placeholder">' +
    '<defs>' +
    '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#dbeafe" />' +
    '<stop offset="100%" stop-color="#e2e8f0" />' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="640" height="360" fill="url(#g)" />' +
    '<path d="M0 0L640 360M640 0L0 360" stroke="#cbd5f5" stroke-width="1" opacity="0.35" />' +
    '</svg>';
  const encoded = encodeURIComponent(svg);
  return `data:image/svg+xml;utf8,${encoded}`;
}

function isUnsplashUrl(value: string): boolean {
  return UNSPLASH_HOSTS.some((host) => value.includes(host));
}

function isSvgPath(value: string): boolean {
  return /\.svg(\?|#|$)/i.test(value);
}
