import type { Deployment, DeployHost } from '../../types/deploy';
import type { AppError, ErrorCategory, Result } from '../../types/result';
import type { VirtualFileSystem } from '../../types/vfs';
import { deployToCloudflarePages } from './hosts/cloudflare-pages';
import { deployToGitHubPages } from './hosts/github-pages';
import { deployToNetlify } from './hosts/netlify';
import { runDeployValidators } from './validators';
import type { DeployValidationResult } from './validators';

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface DeployTokens {
  github?: string;
  cloudflare?: string;
  netlify?: string;
  vercel?: string;
}

export interface DeployFeatureRequirements {
  requiresEdgeWorkers?: boolean;
  requiresServerlessFunctions?: boolean;
}

export interface DeployHostConfig {
  github?: {
    repoName?: string;
    apiBaseUrl?: string;
    branch?: string;
    commitMessage?: string;
  };
  cloudflare?: {
    accountId: string;
    projectName?: string;
    apiBaseUrl?: string;
  };
  netlify?: {
    siteName?: string;
    apiBaseUrl?: string;
  };
}

export interface DeployManagerInput {
  vfs: VirtualFileSystem;
  sessionId: string;
  tokens: DeployTokens;
  features?: DeployFeatureRequirements;
  hostConfig?: DeployHostConfig;
  dependencyAllowlist?: string[];
  maxBundleBytes?: number;
  fetchFn?: FetchFn;
  now?: () => number;
  deployers?: Partial<Deployers>;
  validators?: {
    run?: (input: {
      vfs: VirtualFileSystem;
      maxBytes?: number;
      dependencyAllowlist?: string[];
    }) => DeployValidationResult;
  };
}

export interface DeploySelection {
  selectedHost: DeployHost;
  availableHosts: DeployHost[];
}

export interface Deployers {
  github_pages: (
    options: GitHubPagesDeployInput,
  ) => Promise<Result<Deployment, AppError>>;
  cloudflare_pages: (
    options: CloudflarePagesDeployInput,
  ) => Promise<Result<Deployment, AppError>>;
  netlify: (options: NetlifyDeployInput) => Promise<Result<Deployment, AppError>>;
}

export interface GitHubPagesDeployInput {
  token: string;
  repoName: string;
  vfs: VirtualFileSystem;
  sessionId: string;
  branch?: string;
  commitMessage?: string;
  apiBaseUrl?: string;
  fetchFn?: FetchFn;
  now?: () => number;
  poll?: {
    intervalMs?: number;
    maxAttempts?: number;
  };
  deploymentId?: string;
}

export interface CloudflarePagesDeployInput {
  token: string;
  accountId: string;
  projectName: string;
  vfs: VirtualFileSystem;
  sessionId: string;
  branch?: string;
  apiBaseUrl?: string;
  fetchFn?: FetchFn;
  now?: () => number;
  deploymentId?: string;
}

export interface NetlifyDeployInput {
  token: string;
  siteName: string;
  vfs: VirtualFileSystem;
  sessionId: string;
  apiBaseUrl?: string;
  fetchFn?: FetchFn;
  now?: () => number;
  deploymentId?: string;
}

const HOST_PRIORITY: DeployHost[] = [
  'github_pages',
  'cloudflare_pages',
  'netlify',
  'vercel',
];

const DEFAULT_DEPLOYERS: Deployers = {
  github_pages: deployToGitHubPages,
  cloudflare_pages: deployToCloudflarePages,
  netlify: deployToNetlify,
};

export function selectDeployHost(input: {
  tokens: DeployTokens;
  features?: DeployFeatureRequirements;
  hostConfig?: DeployHostConfig;
  deployers?: Partial<Deployers>;
}): Result<DeploySelection, AppError> {
  const deployers = { ...DEFAULT_DEPLOYERS, ...input.deployers };
  const availableHosts = collectAvailableHosts(
    input.tokens,
    input.hostConfig,
    deployers,
  );

  if (availableHosts.length === 0) {
    return errResult(
      buildError(
        'deploy_tokens_missing',
        'No supported deploy tokens are configured.',
        'user_action',
      ),
    );
  }

  const features = input.features;
  if (features?.requiresEdgeWorkers) {
    if (availableHosts.includes('cloudflare_pages')) {
      return okResult({
        selectedHost: 'cloudflare_pages',
        availableHosts,
      });
    }
    return errResult(
      buildError(
        'deploy_host_missing',
        'Cloudflare Pages is required for edge workers.',
        'user_action',
      ),
    );
  }

  if (features?.requiresServerlessFunctions) {
    if (availableHosts.includes('cloudflare_pages')) {
      return okResult({
        selectedHost: 'cloudflare_pages',
        availableHosts,
      });
    }
    if (availableHosts.includes('netlify')) {
      return okResult({ selectedHost: 'netlify', availableHosts });
    }
    return errResult(
      buildError(
        'deploy_host_missing',
        'A serverless-capable host is required for this site.',
        'user_action',
      ),
    );
  }

  const selectedHost = HOST_PRIORITY.find((host) =>
    availableHosts.includes(host),
  );

  if (!selectedHost) {
    return errResult(
      buildError(
        'deploy_host_missing',
        'No available deploy hosts match the priority stack.',
        'user_action',
      ),
    );
  }

  return okResult({ selectedHost, availableHosts });
}

export async function deploySite(
  input: DeployManagerInput,
): Promise<Result<Deployment, AppError>> {
  const validationRunner = input.validators?.run ?? runDeployValidators;
  const validation = validationRunner({
    vfs: input.vfs,
    maxBytes: input.maxBundleBytes,
    dependencyAllowlist: input.dependencyAllowlist,
  });

  if (!validation.valid) {
    return errResult(buildValidationError(validation));
  }

  const selectionResult = selectDeployHost({
    tokens: input.tokens,
    features: input.features,
    hostConfig: input.hostConfig,
    deployers: input.deployers,
  });

  if (!selectionResult.ok) {
    return selectionResult;
  }

  const deployers = { ...DEFAULT_DEPLOYERS, ...input.deployers };
  const { selectedHost } = selectionResult.value;
  const names = buildHostNames(input);

  if (selectedHost === 'github_pages') {
    const deployer = deployers.github_pages;
    if (!deployer) {
      return errResult(
        buildError(
          'deploy_host_unsupported',
          'GitHub Pages deployer is not available.',
          'fatal',
        ),
      );
    }
    return deployer({
      token: input.tokens.github?.trim() ?? '',
      repoName: names.repoName,
      vfs: input.vfs,
      sessionId: input.sessionId,
      branch: input.hostConfig?.github?.branch,
      commitMessage: input.hostConfig?.github?.commitMessage,
      apiBaseUrl: input.hostConfig?.github?.apiBaseUrl,
      fetchFn: input.fetchFn,
      now: input.now,
    });
  }

  if (selectedHost === 'cloudflare_pages') {
    const deployer = deployers.cloudflare_pages;
    if (!deployer) {
      return errResult(
        buildError(
          'deploy_host_unsupported',
          'Cloudflare Pages deployer is not available.',
          'fatal',
        ),
      );
    }
    const accountId = input.hostConfig?.cloudflare?.accountId?.trim() ?? '';
    return deployer({
      token: input.tokens.cloudflare?.trim() ?? '',
      accountId,
      projectName: names.projectName,
      vfs: input.vfs,
      sessionId: input.sessionId,
      apiBaseUrl: input.hostConfig?.cloudflare?.apiBaseUrl,
      fetchFn: input.fetchFn,
      now: input.now,
    });
  }

  if (selectedHost === 'netlify') {
    const deployer = deployers.netlify;
    if (!deployer) {
      return errResult(
        buildError(
          'deploy_host_unsupported',
          'Netlify deployer is not available.',
          'fatal',
        ),
      );
    }
    return deployer({
      token: input.tokens.netlify?.trim() ?? '',
      siteName: names.siteName,
      vfs: input.vfs,
      sessionId: input.sessionId,
      apiBaseUrl: input.hostConfig?.netlify?.apiBaseUrl,
      fetchFn: input.fetchFn,
      now: input.now,
    });
  }

  return errResult(
    buildError(
      'deploy_host_unsupported',
      `Deploy host "${selectedHost}" is not supported yet.`,
      'user_action',
    ),
  );
}

function collectAvailableHosts(
  tokens: DeployTokens,
  hostConfig: DeployHostConfig | undefined,
  deployers: Partial<Deployers>,
): DeployHost[] {
  const available: DeployHost[] = [];

  if (tokens.github?.trim() && deployers.github_pages) {
    available.push('github_pages');
  }

  if (
    tokens.cloudflare?.trim() &&
    hostConfig?.cloudflare?.accountId?.trim() &&
    deployers.cloudflare_pages
  ) {
    available.push('cloudflare_pages');
  }

  if (tokens.netlify?.trim() && deployers.netlify) {
    available.push('netlify');
  }

  if (tokens.vercel?.trim()) {
    available.push('vercel');
  }

  return HOST_PRIORITY.filter((host) => available.includes(host));
}

function buildHostNames(input: DeployManagerInput): {
  repoName: string;
  projectName: string;
  siteName: string;
} {
  const base =
    input.hostConfig?.github?.repoName ??
    input.hostConfig?.cloudflare?.projectName ??
    input.hostConfig?.netlify?.siteName ??
    input.vfs.metadata.title ??
    'proto-site';
  const slug = slugify(base) || `site-${input.sessionId}`;
  return {
    repoName: input.hostConfig?.github?.repoName ?? slug,
    projectName: input.hostConfig?.cloudflare?.projectName ?? slug,
    siteName: input.hostConfig?.netlify?.siteName ?? slug,
  };
}

function slugify(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  const collapsed = trimmed.replace(/[^a-z0-9]+/g, '-');
  return collapsed.replace(/^-+|-+$/g, '');
}

function buildValidationError(validation: DeployValidationResult): AppError {
  const summary = validation.issues
    .map((issue) => issue.message)
    .slice(0, 3)
    .join(' ');
  return {
    category: 'user_action',
    code: 'deploy_validation_failed',
    message: summary
      ? `Deployment validation failed. ${summary}`
      : 'Deployment validation failed.',
    details: {
      issues: validation.issues.map((issue) => ({
        id: issue.id,
        message: issue.message,
        severity: issue.severity,
        path: issue.path,
      })),
    },
  };
}

function buildError(
  code: string,
  message: string,
  category: ErrorCategory,
): AppError {
  return { code, message, category };
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
