import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const changeControlScript = resolve(process.cwd(), 'scripts/change-control.js');
const require = createRequire(import.meta.url);
const {
  collectChangeControlResult,
} = require(changeControlScript) as {
  collectChangeControlResult: (options: {
    baseRefRaw?: string;
    headRef?: string;
  }) => {
    errors: string[];
    warnings: string[];
  };
};

const tempDirs: string[] = [];

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runGit(cwd: string, args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createRepo() {
  const repoDir = makeTempDir('change-control-source-');
  runGit(repoDir, ['init', '-b', 'main']);
  runGit(repoDir, ['config', 'user.name', 'Test User']);
  runGit(repoDir, ['config', 'user.email', 'test@example.com']);
  mkdirSync(join(repoDir, 'docs'), { recursive: true });
  writeJson(join(repoDir, 'package.json'), {
    name: 'change-control-fixture',
    private: true,
  });
  writeFileSync(join(repoDir, 'docs/DECISIONS.md'), '# Decisions\n');
  runGit(repoDir, ['add', 'package.json', 'docs/DECISIONS.md']);
  runGit(repoDir, ['commit', '-m', 'feat(docs): seed repo']);
  return repoDir;
}

function cloneRepo(sourceDir: string, depth: number) {
  const parentDir = makeTempDir('change-control-clone-');
  const cloneDir = join(parentDir, 'repo');
  execFileSync(
    'git',
    ['clone', '--depth', String(depth), `file://${sourceDir}`, cloneDir],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  return cloneDir;
}

function runChangeControl(
  cwd: string,
  options: { baseRefRaw?: string; headRef?: string }
) {
  return collectChangeControlResult({ ...options, cwd });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('change-control', () => {
  it('should lint HEAD only when the configured base ref is unavailable', () => {
    const sourceDir = createRepo();
    const baseSha = runGit(sourceDir, ['rev-parse', 'HEAD']);

    writeFileSync(join(sourceDir, 'README.md'), 'carousel\n');
    runGit(sourceDir, ['add', 'README.md']);
    runGit(sourceDir, ['commit', '-m', 'feat(preview): add carousel docs']);
    const headSha = runGit(sourceDir, ['rev-parse', 'HEAD']);

    const cloneDir = cloneRepo(sourceDir, 1);
    const result = runChangeControl(cloneDir, {
      baseRefRaw: baseSha,
      headRef: headSha,
    });

    expect(result.errors).toEqual([]);
    expect(
      result.warnings.some((warning) => warning.includes('linting HEAD only'))
    ).toBe(true);
  });

  it('should fall back to HEAD parent for dependency checks when the base ref is unavailable', () => {
    const sourceDir = createRepo();
    const missingBaseSha = runGit(sourceDir, ['rev-parse', 'HEAD']);

    writeFileSync(join(sourceDir, 'README.md'), 'baseline\n');
    runGit(sourceDir, ['add', 'README.md']);
    runGit(sourceDir, ['commit', '-m', 'feat(docs): add baseline docs']);

    writeJson(join(sourceDir, 'package.json'), {
      name: 'change-control-fixture',
      private: true,
      dependencies: {
        lodash: '^4.17.21',
      },
    });
    runGit(sourceDir, ['add', 'package.json']);
    runGit(sourceDir, ['commit', '-m', 'feat(ci): add lodash dependency']);
    const headSha = runGit(sourceDir, ['rev-parse', 'HEAD']);

    const cloneDir = cloneRepo(sourceDir, 2);
    const result = runChangeControl(cloneDir, {
      baseRefRaw: missingBaseSha,
      headRef: headSha,
    });

    expect(
      result.warnings.some((warning) => warning.includes('falling back to'))
    ).toBe(true);
    expect(result.errors).toContain(
      'New dependencies detected (lodash) but docs/DECISIONS.md was not updated.'
    );
  });
});
