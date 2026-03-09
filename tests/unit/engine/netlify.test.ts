import { describe, expect, it, vi } from 'vitest';
import { deployToNetlify } from '../../../src/engine/deploy/hosts/netlify';
import type { FetchFn } from '../../../src/engine/deploy/deploy-manager';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { VfsMetadata } from '../../../src/types/vfs';

type FetchArgs = [RequestInfo | URL, RequestInit?];

function createMockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => null,
    },
    json: async () => body,
    text: async () =>
      typeof body === 'string' ? body : JSON.stringify(body),
  } as unknown as Response;
}

async function buildVfs(): Promise<VirtualFileSystem> {
  const metadata: VfsMetadata = {
    title: 'Test Site',
    description: 'Test Description',
    colors: {
      primary: '#111111',
      secondary: '#222222',
      accent: '#333333',
      bg: '#ffffff',
      text: '#000000',
    },
    fonts: {
      headingFont: 'Fraunces',
      bodyFont: 'Inter',
    },
  };

  const vfs = new VirtualFileSystem({ metadata });
  await vfs.addFile('index.html', '<!doctype html><html></html>');
  await vfs.addFile('styles/main.css', 'body { color: black; }');
  return vfs;
}

function createFetchMock(
  apiBaseUrl: string,
  siteId: string,
  deployId: string,
  required: string[],
) {
  return vi.fn<FetchArgs, Promise<Response>>(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url === `${apiBaseUrl}/sites` && method === 'POST') {
      return createMockResponse(201, {
        id: siteId,
        name: 'proto-site',
        url: 'http://proto-site.netlify.app',
        ssl_url: 'https://proto-site.netlify.app',
      });
    }

    if (url === `${apiBaseUrl}/sites/${siteId}/deploys` && method === 'POST') {
      return createMockResponse(200, {
        id: deployId,
        required,
        deploy_ssl_url: 'https://proto-site.netlify.app',
      });
    }

    if (
      url === `${apiBaseUrl}/deploys/${deployId}/files/index.html` &&
      method === 'PUT'
    ) {
      return createMockResponse(200, {});
    }

    if (
      url === `${apiBaseUrl}/deploys/${deployId}/files/styles/main.css` &&
      method === 'PUT'
    ) {
      return createMockResponse(200, {});
    }

    return createMockResponse(404, { message: 'Not found' });
  });
}

describe('deployToNetlify', () => {
  it('should create a site, create a deploy, and upload required files', async () => {
    const apiBaseUrl = 'https://api.netlify.test/api/v1';
    const siteId = 'site-123';
    const deployId = 'deploy-456';
    const requiredFiles = ['index.html', 'styles/main.css'];
    const vfs = await buildVfs();
    const fetchFn = createFetchMock(apiBaseUrl, siteId, deployId, requiredFiles);

    const result = await deployToNetlify({
      token: 'netlify_token',
      siteName: 'Proto Site',
      vfs,
      sessionId: 'session-1',
      apiBaseUrl,
      fetchFn: fetchFn as unknown as FetchFn,
    });

    expect(result.ok).toBe(true);

    const siteCalls = fetchFn.mock.calls.filter(([url, init]) => {
      const method = init?.method ?? 'GET';
      return url === `${apiBaseUrl}/sites` && method === 'POST';
    });
    expect(siteCalls.length).toBe(1);

    const deployCall = fetchFn.mock.calls.find(([url, init]) => {
      const method = init?.method ?? 'GET';
      return url === `${apiBaseUrl}/sites/${siteId}/deploys` && method === 'POST';
    });

    expect(deployCall).toBeDefined();
    const payload = JSON.parse(String(deployCall?.[1]?.body ?? '{}')) as {
      files?: Record<string, string>;
    };
    expect(payload.files).toBeDefined();
    expect(payload.files?.['index.html']).toBeTruthy();
    expect(payload.files?.['styles/main.css']).toBeTruthy();

    const uploadCalls = fetchFn.mock.calls.filter(([url, init]) => {
      const method = init?.method ?? 'GET';
      return (
        method === 'PUT' &&
        (url === `${apiBaseUrl}/deploys/${deployId}/files/index.html` ||
          url === `${apiBaseUrl}/deploys/${deployId}/files/styles/main.css`)
      );
    });

    expect(uploadCalls.length).toBe(requiredFiles.length);
  });

  it('should return the live URL from the deploy response', async () => {
    const apiBaseUrl = 'https://api.netlify.test/api/v1';
    const siteId = 'site-999';
    const deployId = 'deploy-999';
    const vfs = await buildVfs();
    const fetchFn = createFetchMock(apiBaseUrl, siteId, deployId, []);

    const result = await deployToNetlify({
      token: 'netlify_token',
      siteName: 'Proto Site',
      vfs,
      sessionId: 'session-2',
      apiBaseUrl,
      fetchFn: fetchFn as unknown as FetchFn,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toBe('https://proto-site.netlify.app');
    }
  });

  it('should surface an auth error for invalid tokens', async () => {
    const apiBaseUrl = 'https://api.netlify.test/api/v1';
    const vfs = await buildVfs();

    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === `${apiBaseUrl}/sites` && method === 'POST') {
        return createMockResponse(401, { message: 'Unauthorized' });
      }
      return createMockResponse(404, { message: 'Not found' });
    });

    const result = await deployToNetlify({
      token: 'bad-token',
      siteName: 'Proto Site',
      vfs,
      sessionId: 'session-3',
      apiBaseUrl,
      fetchFn: fetchFn as unknown as FetchFn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('netlify_auth');
    }
  });
});
