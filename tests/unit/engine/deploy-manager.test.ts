import { describe, expect, it, vi } from 'vitest';

import {
  deploySite,
  selectDeployHost,
} from '../../../src/engine/deploy/deploy-manager';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { Deployment } from '../../../src/types/deploy';
import type { VfsMetadata } from '../../../src/types/vfs';

async function buildVfs(html: string): Promise<VirtualFileSystem> {
  const metadata: VfsMetadata = {
    title: 'Deploy Test',
    description: 'Test',
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
  await vfs.addFile('index.html', html);
  await vfs.addFile('styles.css', 'body { color: black; }');
  return vfs;
}

describe('deploy manager', () => {
  it('should select GitHub Pages when only GitHub token is configured', () => {
    const result = selectDeployHost({
      tokens: { github: 'ghp_token' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.selectedHost).toBe('github_pages');
      expect(result.value.availableHosts).toEqual(['github_pages']);
    }
  });

  it('should select Cloudflare Pages when site needs Workers', () => {
    const result = selectDeployHost({
      tokens: { github: 'ghp_token', cloudflare: 'cf_token' },
      features: { requiresEdgeWorkers: true },
      hostConfig: { cloudflare: { accountId: 'acc-123' } },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.selectedHost).toBe('cloudflare_pages');
      expect(result.value.availableHosts).toContain('cloudflare_pages');
    }
  });

  it('should complete deploy and return deployment record', async () => {
    const html = '<html><head><link rel="stylesheet" href="styles.css" /></head><body></body></html>';
    const vfs = await buildVfs(html);

    const deployment: Deployment = {
      id: 'deploy-1',
      sessionId: 'session-1',
      host: 'github_pages',
      url: 'https://example.com/site',
      deployedAt: 1234,
      siteSize: 100,
      fileCount: 2,
      status: 'live',
    };

    const deployer = vi.fn(async () => ({ ok: true as const, value: deployment }));

    const result = await deploySite({
      vfs,
      sessionId: 'session-1',
      tokens: { github: 'ghp_token' },
      deployers: { github_pages: deployer },
    });

    expect(deployer).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toBe('https://example.com/site');
    }
  });

  it('should block deploy when validation fails', async () => {
    const vfs = await buildVfs('<html><body></body></html>');
    await vfs.addFile('node_modules/react/index.js', 'export const React = {};');

    const deployer = vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 'deploy-2',
        sessionId: 'session-2',
        host: 'github_pages',
        url: 'https://example.com/site',
        deployedAt: 1234,
        siteSize: 100,
        fileCount: 2,
        status: 'live',
      } satisfies Deployment,
    }));

    const result = await deploySite({
      vfs,
      sessionId: 'session-2',
      tokens: { github: 'ghp_token' },
      deployers: { github_pages: deployer },
    });

    expect(result.ok).toBe(false);
    expect(deployer).not.toHaveBeenCalled();
    if (!result.ok) {
      expect(result.error.code).toBe('deploy_validation_failed');
    }
  });
});
