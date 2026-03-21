import { describe, expect, it, vi } from 'vitest';

import { fetchPublicDomainImageUrl } from '../../../src/engine/imagery/public-domain';

describe('fetchPublicDomainImageUrl', () => {
  it('returns first https url from Wikimedia imageinfo payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: {
          pages: {
            a: { imageinfo: [{ url: 'https://upload.wikimedia.org/example-a.jpg' }] },
            b: { imageinfo: [{ url: 'https://upload.wikimedia.org/example-b.jpg' }] },
          },
        },
      }),
    });

    const result = await fetchPublicDomainImageUrl('doberman dog', fetchMock);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('https://upload.wikimedia.org/example-a.jpg');
  });

  it('returns user_action error when query is blank', async () => {
    const result = await fetchPublicDomainImageUrl('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('user_action');
    expect(result.error.code).toBe('public_domain_query_missing');
  });

  it('returns retryable error when upstream returns non-200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const result = await fetchPublicDomainImageUrl('palm tree', fetchMock);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('retryable');
    expect(result.error.code).toBe('public_domain_fetch_failed');
  });

  it('returns retryable no-match error when payload has no usable image URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: {
          pages: {
            a: { imageinfo: [{ url: 'http://insecure.example/image.jpg' }] },
            b: { imageinfo: [{}] },
          },
        },
      }),
    });

    const result = await fetchPublicDomainImageUrl('unknown visual', fetchMock);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('retryable');
    expect(result.error.code).toBe('public_domain_no_match');
  });
});
