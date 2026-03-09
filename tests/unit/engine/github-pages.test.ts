import { describe, expect, it, vi } from 'vitest';
import { deployToGitHubPages } from '../../../src/engine/deploy/hosts/github-pages';
import type { FetchFn } from '../../../src/engine/deploy/deploy-manager';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { VfsMetadata } from '../../../src/types/vfs';

type FetchArgs = [RequestInfo | URL, RequestInit?];

function createMockResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => headers?.[key] ?? null,
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

function createFetchMock(apiBaseUrl: string, owner: string, repo: string) {
  return vi.fn<FetchArgs, Promise<Response>>(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url === `${apiBaseUrl}/user` && method === 'GET') {
      return createMockResponse(200, { login: owner }, { 'X-OAuth-Scopes': 'public_repo' });
    }

    if (url === `${apiBaseUrl}/user/repos` && method === 'POST') {
      return createMockResponse(201, {
        name: repo,
        owner: { login: owner },
        html_url: `https://github.com/${owner}/${repo}`,
      });
    }

    if (url.startsWith(`${apiBaseUrl}/repos/${owner}/${repo}/contents/`) && method === 'PUT') {
      return createMockResponse(201, { content: { path: url } });
    }

    if (url === `${apiBaseUrl}/repos/${owner}/${repo}/pages` && method === 'POST') {
      return createMockResponse(201, { html_url: `https://${owner}.github.io/${repo}` });
    }

    if (url === `${apiBaseUrl}/repos/${owner}/${repo}/pages` && method === 'GET') {
      return createMockResponse(200, {
        status: 'built',
        html_url: `https://${owner}.github.io/${repo}`,
      });
    }

    return createMockResponse(404, { message: 'Not found' });
  });
}

describe('deployToGitHubPages', () => {
  it('should create a repo and push all VFS files', async () => {
    const apiBaseUrl = 'https://api.github.test';
    const owner = 'octo-user';
    const repo = 'proto-site';
    const vfs = await buildVfs();
    const fetchFn = createFetchMock(apiBaseUrl, owner, repo);

    const result = await deployToGitHubPages({
      token: 'ghp_testtoken',
      repoName: repo,
      vfs,
      sessionId: 'session-1',
      apiBaseUrl,
      fetchFn: fetchFn as unknown as FetchFn,
      poll: { intervalMs: 0, maxAttempts: 1 },
    });

    expect(result.ok).toBe(true);

    const repoCalls = fetchFn.mock.calls.filter(([url, init]) => {
      const method = init?.method ?? 'GET';
      return url === `${apiBaseUrl}/user/repos` && method === 'POST';
    });
    expect(repoCalls.length).toBe(1);

    const putCalls = fetchFn.mock.calls.filter(([url, init]) => {
      const method = init?.method ?? 'GET';
      return typeof url === 'string' && url.includes('/contents/') && method === 'PUT';
    });

    expect(putCalls.length).toBe(2);
    expect(putCalls.some(([url]) => typeof url === 'string' && url.includes('/contents/index.html'))).toBe(
      true,
    );
    expect(
      putCalls.some(
        ([url]) =>
          typeof url === 'string' && url.includes('/contents/styles/main.css'),
      ),
    ).toBe(true);
  });

  it('should enable GitHub Pages on the repo', async () => {
    const apiBaseUrl = 'https://api.github.test';
    const owner = 'octo-user';
    const repo = 'proto-site';
    const vfs = await buildVfs();
    const fetchFn = createFetchMock(apiBaseUrl, owner, repo);

    await deployToGitHubPages({
      token: 'ghp_testtoken',
      repoName: repo,
      vfs,
      sessionId: 'session-2',
      apiBaseUrl,
      fetchFn: fetchFn as unknown as FetchFn,
      poll: { intervalMs: 0, maxAttempts: 1 },
    });

    const pagesCall = fetchFn.mock.calls.find(([url, init]) => {
      const method = init?.method ?? 'GET';
      return url === `${apiBaseUrl}/repos/${owner}/${repo}/pages` && method === 'POST';
    });

    expect(pagesCall).toBeDefined();
    const payload = JSON.parse(String(pagesCall?.[1]?.body ?? '{}')) as {
      source?: { branch?: string; path?: string };
    };
    expect(payload.source?.branch).toBe('main');
    expect(payload.source?.path).toBe('/');
  });

  it('should return the correct live URL', async () => {
    const apiBaseUrl = 'https://api.github.test';
    const owner = 'octo-user';
    const repo = 'proto-site';
    const vfs = await buildVfs();
    const fetchFn = createFetchMock(apiBaseUrl, owner, repo);

    const result = await deployToGitHubPages({
      token: 'ghp_testtoken',
      repoName: repo,
      vfs,
      sessionId: 'session-3',
      apiBaseUrl,
      fetchFn: fetchFn as unknown as FetchFn,
      poll: { intervalMs: 0, maxAttempts: 1 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toBe(`https://${owner}.github.io/${repo}`);
    }
  });
});
