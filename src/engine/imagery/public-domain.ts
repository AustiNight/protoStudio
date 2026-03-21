import type { AppError, Result } from '@/types/result';
import type { ImageryAssetRecord } from '@/types/imagery';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface WikimediaImageInfo {
  imageinfo?: Array<{ url?: string; width?: number; height?: number }>;
}

interface WikimediaResponse {
  query?: {
    pages?: Record<string, WikimediaImageInfo>;
  };
}

export async function fetchPublicDomainImageUrl(
  query: string,
  fetchFn: FetchFn = fetch,
): Promise<Result<string, AppError>> {
  const assetResult = await fetchPublicDomainImageAsset(query, fetchFn);
  if (!assetResult.ok) {
    return assetResult;
  }
  return okResult(assetResult.value.source);
}

export async function fetchPublicDomainImageAsset(
  query: string,
  fetchFn: FetchFn = fetch,
): Promise<Result<ImageryAssetRecord, AppError>> {
  const normalized = query.trim();
  if (!normalized) {
    return errResult({
      category: 'user_action',
      code: 'public_domain_query_missing',
      message: 'Public-domain image query is required.',
    });
  }
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('generator', 'search');
  endpoint.searchParams.set('gsrsearch', normalized);
  endpoint.searchParams.set('gsrnamespace', '6');
  endpoint.searchParams.set('gsrlimit', '5');
  endpoint.searchParams.set('prop', 'imageinfo');
  endpoint.searchParams.set('iiprop', 'url|size');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('origin', '*');

  try {
    const response = await fetchFn(endpoint.toString(), { method: 'GET' });
    if (!response.ok) {
      return errResult({
        category: 'retryable',
        code: 'public_domain_fetch_failed',
        message: `Public-domain lookup failed with status ${response.status}.`,
      });
    }
    const payload = (await response.json()) as WikimediaResponse;
    const pages = payload.query?.pages
      ? Object.values(payload.query.pages)
      : [];
    for (const page of pages) {
      const url = page.imageinfo?.[0]?.url?.trim() ?? '';
      if (url.startsWith('https://')) {
        return okResult({
          id: `asset-public-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          source: url,
          provenance: 'public_domain',
          query: normalized,
          width: page.imageinfo?.[0]?.width,
          height: page.imageinfo?.[0]?.height,
          targetSlots: ['general'],
          createdAt: Date.now(),
        });
      }
    }
    return errResult({
      category: 'retryable',
      code: 'public_domain_no_match',
      message: 'No public-domain image match found.',
    });
  } catch {
    return errResult({
      category: 'retryable',
      code: 'public_domain_network',
      message: 'Public-domain lookup failed before completion.',
    });
  }
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
