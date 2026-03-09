import { describe, expect, it, vi } from 'vitest';
import { deployToCloudflarePages } from '../../../src/engine/deploy/hosts/cloudflare-pages';
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
  accountId: string,
  projectName: string,
) {
  return vi.fn<FetchArgs, Promise<Response>>(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url === `${apiBaseUrl}/user/tokens/verify` && method === 'GET') {
      return createMockResponse(200, { success: true, result: { status: 'active' } });
    }

    if (
      url === `${apiBaseUrl}/accounts/${accountId}/pages/projects` &&
      method === 'POST'
    ) {
      return createMockResponse(200, {
        success: true,
        result: { name: projectName, subdomain: `${projectName}.pages.dev` },
      });
    }

    if (
      url ===
        `${apiBaseUrl}/accounts/${accountId}/pages/projects/${projectName}/deployments` &&
      method === 'POST'
    ) {
      return createMockResponse(200, {
        success: true,
        result: { url: `https://${projectName}.pages.dev` },
      });
    }

    return createMockResponse(404, { success: false, errors: [{ message: 'Not found' }] });
  });
}

describe('deployToCloudflarePages', () => {
  it('should create a project and deploy all VFS files', async () => {
    const apiBaseUrl = 'https://api.cloudflare.test/client/v4';
    const accountId = 'acct-123';
    const projectName = 'proto-site';
    const vfs = await buildVfs();
    const fetchFn = createFetchMock(apiBaseUrl, accountId, projectName);

    const result = await deployToCloudflarePages({
      token: 'cf_testtoken',
      accountId,
      projectName,
      vfs,
      sessionId: 'session-1',
      apiBaseUrl,
      fetchFn: fetchFn as unknown as FetchFn,
    });

    expect(result.ok).toBe(true);

    const projectCalls = fetchFn.mock.calls.filter(([url, init]) => {
      const method = init?.method ?? 'GET';
      return url === `${apiBaseUrl}/accounts/${accountId}/pages/projects` && method === 'POST';
    });

    expect(projectCalls.length).toBe(1);

    const deployCall = fetchFn.mock.calls.find(([url, init]) => {
      const method = init?.method ?? 'GET';
      return (
        url ===
          `${apiBaseUrl}/accounts/${accountId}/pages/projects/${projectName}/deployments` &&
        method === 'POST'
      );
    });

    expect(deployCall).toBeDefined();
    const payload = JSON.parse(String(deployCall?.[1]?.body ?? '{}')) as {
      branch?: string;
      files?: Record<string, string>;
    };

    expect(payload.branch).toBe('main');
    expect(payload.files?.['index.html']).toContain('<!doctype html');
    expect(payload.files?.['styles/main.css']).toContain('body');
  });

  it('should return the live URL', async () => {
    const apiBaseUrl = 'https://api.cloudflare.test/client/v4';
    const accountId = 'acct-123';
    const projectName = 'proto-site';
    const vfs = await buildVfs();
    const fetchFn = createFetchMock(apiBaseUrl, accountId, projectName);

    const result = await deployToCloudflarePages({
      token: 'cf_testtoken',
      accountId,
      projectName,
      vfs,
      sessionId: 'session-2',
      apiBaseUrl,
      fetchFn: fetchFn as unknown as FetchFn,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toBe(`https://${projectName}.pages.dev`);
    }
  });

  it('should return an error when token is missing', async () => {
    const vfs = await buildVfs();

    const result = await deployToCloudflarePages({
      token: '   ',
      accountId: 'acct-123',
      projectName: 'proto-site',
      vfs,
      sessionId: 'session-3',
      apiBaseUrl: 'https://api.cloudflare.test/client/v4',
      fetchFn: vi.fn() as unknown as FetchFn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cloudflare_token_missing');
    }
  });

  it('should return an error when account ID is missing', async () => {
    const vfs = await buildVfs();

    const result = await deployToCloudflarePages({
      token: 'cf_testtoken',
      accountId: '  ',
      projectName: 'proto-site',
      vfs,
      sessionId: 'session-4',
      apiBaseUrl: 'https://api.cloudflare.test/client/v4',
      fetchFn: vi.fn() as unknown as FetchFn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cloudflare_account_missing');
    }
  });
});
