import { describe, expect, it } from 'vitest';

import { runDeployValidators } from '../../../src/engine/deploy/validators';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
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

describe('deploy validators', () => {
  it('should reject VFS containing node_modules', async () => {
    const vfs = await buildVfs('<html><head></head><body></body></html>');
    await vfs.addFile('node_modules/react/index.js', 'export const React = {};');

    const result = runDeployValidators({ vfs });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.id === 'deploy_node_modules')).toBe(
      true,
    );
  });

  it('should detect broken internal links', async () => {
    const html = '<html><body><a href="missing.html">Missing</a></body></html>';
    const vfs = await buildVfs(html);

    const result = runDeployValidators({ vfs });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.id === 'deploy_link_missing')).toBe(
      true,
    );
  });

  it('should enforce dependency allowlist', async () => {
    const html =
      '<html><head><script src="https://evil.example.com/app.js"></script></head><body></body></html>';
    const vfs = await buildVfs(html);

    const result = runDeployValidators({ vfs });

    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.id === 'deploy_dependency_allowlist'),
    ).toBe(true);
  });

  it('should include Lighthouse stub results', async () => {
    const vfs = await buildVfs('<html><body></body></html>');

    const result = runDeployValidators({ vfs });

    expect(result.lighthouse.isStub).toBe(true);
    expect(result.lighthouse.performance).toBeGreaterThan(0);
    expect(result.lighthouse.performance).toBeLessThanOrEqual(1);
  });
});
