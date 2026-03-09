import type { Deployment } from '../../../types/deploy';
import type { AppError, ErrorCategory, Result } from '../../../types/result';
import type { VirtualFile, VirtualFileSystem } from '../../../types/vfs';
import { resolveRuntimeFetch } from '../../../utils/fetch';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface GitHubPagesDeployOptions {
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

interface HeadersLike {
  get: (key: string) => string | null;
}

interface ApiResponse {
  status: number;
  ok: boolean;
  data: unknown | null;
  headers: HeadersLike;
}

const DEFAULT_API_BASE = 'https://api.github.com';
const DEFAULT_BRANCH = 'main';
const DEFAULT_COMMIT_MESSAGE = 'Deploy from ProtoStudio';
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLL_ATTEMPTS = 10;
const REQUIRED_SCOPES = ['public_repo', 'repo'];
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export async function deployToGitHubPages(
  options: GitHubPagesDeployOptions,
): Promise<Result<Deployment, AppError>> {
  const token = options.token.trim();
  if (!token) {
    return errResult(
      buildError('token_missing', 'GitHub token is required.', 'user_action'),
    );
  }

  const repoName = sanitizeRepoName(options.repoName);
  if (!repoName) {
    return errResult(
      buildError('repo_invalid', 'Repository name is invalid.', 'user_action'),
    );
  }

  const files = collectFiles(options.vfs);
  if (files.length === 0) {
    return errResult(
      buildError('files_missing', 'No files available to deploy.', 'user_action'),
    );
  }

  const fetchFn = resolveRuntimeFetch(options.fetchFn);
  if (!fetchFn) {
    return errResult(
      buildError(
        'fetch_missing',
        'GitHub fetch is not available in this environment.',
        'fatal',
      ),
    );
  }

  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE;
  const branch = options.branch ?? DEFAULT_BRANCH;
  const commitMessage = options.commitMessage ?? DEFAULT_COMMIT_MESSAGE;
  const now = options.now ?? (() => Date.now());
  const pollIntervalMs = options.poll?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = options.poll?.maxAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;

  const userResponse = await requestJson(fetchFn, `${apiBaseUrl}/user`, {
    method: 'GET',
    headers: buildHeaders(token, false),
  });

  if (!userResponse.ok) {
    return errResult(userResponse.error);
  }

  if (!userResponse.value.ok) {
    return errResult(
      buildHttpError(
        'github_auth',
        'GitHub authentication failed.',
        userResponse.value,
      ),
    );
  }

  const userData = userResponse.value.data;
  if (!isRecord(userData)) {
    return errResult(
      buildError(
        'github_invalid_user',
        'GitHub user response was invalid.',
        'fatal',
      ),
    );
  }

  const login = getString(userData, 'login');
  if (!login) {
    return errResult(
      buildError(
        'github_invalid_user',
        'GitHub user response was missing login.',
        'fatal',
      ),
    );
  }

  const scopes = parseScopes(userResponse.value.headers.get('X-OAuth-Scopes'));
  if (scopes.length > 0 && !hasRequiredScopes(scopes)) {
    return errResult(
      buildError(
        'github_scope_missing',
        'GitHub token is missing required scopes (public_repo or repo).',
        'user_action',
        { scopes },
      ),
    );
  }

  let owner = login;
  let resolvedRepoName = repoName;
  let repoUrl = `https://github.com/${owner}/${resolvedRepoName}`;

  const createRepoResponse = await requestJson(fetchFn, `${apiBaseUrl}/user/repos`, {
    method: 'POST',
    headers: buildHeaders(token, true),
    body: JSON.stringify({ name: resolvedRepoName, private: false }),
  });

  if (!createRepoResponse.ok) {
    return errResult(createRepoResponse.error);
  }

  if (createRepoResponse.value.ok) {
    const repoData = createRepoResponse.value.data;
    if (isRecord(repoData)) {
      const name = getString(repoData, 'name');
      if (name) {
        resolvedRepoName = name;
      }
      const htmlUrl = getString(repoData, 'html_url');
      if (htmlUrl) {
        repoUrl = htmlUrl;
      }
      const ownerRecord = getRecord(repoData, 'owner');
      const ownerLogin = ownerRecord ? getString(ownerRecord, 'login') : null;
      if (ownerLogin) {
        owner = ownerLogin;
      }
    }
  } else if (!isRepoAlreadyExists(createRepoResponse.value.data)) {
    return errResult(
      buildHttpError(
        'github_repo_create',
        'GitHub repository creation failed.',
        createRepoResponse.value,
      ),
    );
  }

  for (const file of files) {
    const upsertResult = await upsertFile({
      fetchFn,
      apiBaseUrl,
      owner,
      repo: resolvedRepoName,
      token,
      branch,
      commitMessage,
      file,
    });

    if (!upsertResult.ok) {
      return errResult(upsertResult.error);
    }
  }

  const enablePagesResponse = await requestJson(
    fetchFn,
    `${apiBaseUrl}/repos/${owner}/${resolvedRepoName}/pages`,
    {
      method: 'POST',
      headers: buildHeaders(token, true),
      body: JSON.stringify({
        source: {
          branch,
          path: '/',
        },
      }),
    },
  );

  if (!enablePagesResponse.ok) {
    return errResult(enablePagesResponse.error);
  }

  if (!enablePagesResponse.value.ok && !isPagesAlreadyEnabled(enablePagesResponse.value)) {
    return errResult(
      buildHttpError(
        'github_pages_enable',
        'GitHub Pages enablement failed.',
        enablePagesResponse.value,
      ),
    );
  }

  const pollResult = await pollPagesStatus({
    fetchFn,
    apiBaseUrl,
    owner,
    repo: resolvedRepoName,
    token,
    maxAttempts,
    intervalMs: pollIntervalMs,
  });

  if (!pollResult.ok) {
    return errResult(pollResult.error);
  }

  const pagesUrl =
    pollResult.value.htmlUrl ?? `https://${owner}.github.io/${resolvedRepoName}`;

  const { siteSize, fileCount } = calculateStats(files);

  const deployment: Deployment = {
    id: options.deploymentId ?? buildDeploymentId(),
    sessionId: options.sessionId,
    host: 'github_pages',
    url: pagesUrl,
    repoUrl,
    deployedAt: now(),
    siteSize,
    fileCount,
    status: 'live',
  };

  return okResult(deployment);
}

interface UpsertFileOptions {
  fetchFn: FetchFn;
  apiBaseUrl: string;
  owner: string;
  repo: string;
  token: string;
  branch: string;
  commitMessage: string;
  file: VirtualFile;
}

async function upsertFile(options: UpsertFileOptions): Promise<Result<void, AppError>> {
  const { fetchFn, apiBaseUrl, owner, repo, token, branch, commitMessage, file } =
    options;

  const normalizedPath = normalizePath(file.path);
  const url = `${apiBaseUrl}/repos/${owner}/${repo}/contents/${encodePath(
    normalizedPath,
  )}`;

  const payload = {
    message: commitMessage,
    content: encodeBase64(file.content),
    branch,
  };

  const createResponse = await requestJson(fetchFn, url, {
    method: 'PUT',
    headers: buildHeaders(token, true),
    body: JSON.stringify(payload),
  });

  if (!createResponse.ok) {
    return errResult(createResponse.error);
  }

  if (createResponse.value.ok) {
    return okResult(undefined);
  }

  if (createResponse.value.status === 422 && needsSha(createResponse.value.data)) {
    const shaResponse = await requestJson(fetchFn, `${url}?ref=${branch}`, {
      method: 'GET',
      headers: buildHeaders(token, false),
    });

    if (!shaResponse.ok) {
      return errResult(shaResponse.error);
    }

    if (!shaResponse.value.ok) {
      return errResult(
        buildHttpError(
          'github_file_lookup',
          'GitHub file lookup failed.',
          shaResponse.value,
        ),
      );
    }

    const sha = extractSha(shaResponse.value.data);
    if (!sha) {
      return errResult(
        buildError(
          'github_file_lookup',
          'GitHub file lookup response was invalid.',
          'fatal',
        ),
      );
    }

    const updateResponse = await requestJson(fetchFn, url, {
      method: 'PUT',
      headers: buildHeaders(token, true),
      body: JSON.stringify({ ...payload, sha }),
    });

    if (!updateResponse.ok) {
      return errResult(updateResponse.error);
    }

    if (!updateResponse.value.ok) {
      return errResult(
        buildHttpError(
          'github_file_update',
          'GitHub file update failed.',
          updateResponse.value,
        ),
      );
    }

    return okResult(undefined);
  }

  return errResult(
    buildHttpError(
      'github_file_create',
      'GitHub file creation failed.',
      createResponse.value,
    ),
  );
}

interface PollPagesOptions {
  fetchFn: FetchFn;
  apiBaseUrl: string;
  owner: string;
  repo: string;
  token: string;
  maxAttempts: number;
  intervalMs: number;
}

async function pollPagesStatus(
  options: PollPagesOptions,
): Promise<Result<{ htmlUrl: string | null }, AppError>> {
  const { fetchFn, apiBaseUrl, owner, repo, token, maxAttempts, intervalMs } =
    options;

  const url = `${apiBaseUrl}/repos/${owner}/${repo}/pages`;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await requestJson(fetchFn, url, {
      method: 'GET',
      headers: buildHeaders(token, false),
    });

    if (!response.ok) {
      return errResult(response.error);
    }

    if (response.value.ok) {
      const status = extractStatus(response.value.data);
      if (status === 'built') {
        return okResult({ htmlUrl: extractHtmlUrl(response.value.data) });
      }
      if (status === 'errored') {
        return errResult(
          buildError(
            'github_pages_error',
            'GitHub Pages build failed.',
            'user_action',
          ),
        );
      }
    } else if (response.value.status !== 404) {
      return errResult(
        buildHttpError(
          'github_pages_status',
          'GitHub Pages status check failed.',
          response.value,
        ),
      );
    }

    if (attempt < maxAttempts - 1 && intervalMs > 0) {
      await delay(intervalMs);
    }
  }

  return errResult(
    buildError(
      'github_pages_timeout',
      'GitHub Pages build did not complete in time.',
      'retryable',
    ),
  );
}

function collectFiles(vfs: VirtualFileSystem): VirtualFile[] {
  const files = Array.from(vfs.files.values());
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function calculateStats(files: VirtualFile[]): { siteSize: number; fileCount: number } {
  let siteSize = 0;
  for (const file of files) {
    siteSize += getByteLength(file.content);
  }
  return { siteSize, fileCount: files.length };
}

function getByteLength(content: string): number {
  const bytes = encodeUtf8(content);
  return bytes.length;
}

function buildHeaders(token: string, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function requestJson(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
): Promise<Result<ApiResponse, AppError>> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (error) {
    return errResult(
      buildError(
        'github_request_failed',
        'GitHub request failed before receiving a response.',
        'retryable',
        { cause: getErrorMessage(error) },
      ),
    );
  }

  let data: unknown | null = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return okResult({
    status: response.status,
    ok: response.ok,
    data,
    headers: response.headers,
  });
}

function buildHttpError(code: string, message: string, response: ApiResponse): AppError {
  return buildError(code, message, errorCategoryForStatus(response.status), {
    status: response.status,
    body: response.data,
  });
}

function errorCategoryForStatus(status: number): ErrorCategory {
  if (status === 429 || status >= 500) {
    return 'retryable';
  }
  return 'user_action';
}

function isRepoAlreadyExists(data: unknown | null): boolean {
  if (!isRecord(data)) {
    return false;
  }
  const message = getString(data, 'message');
  if (!message) {
    return false;
  }
  const normalized = message.toLowerCase();
  return normalized.includes('name already exists') || normalized.includes('already exists');
}

function isPagesAlreadyEnabled(response: ApiResponse): boolean {
  if (response.status !== 409 && response.status !== 422) {
    return false;
  }
  if (!isRecord(response.data)) {
    return false;
  }
  const message = getString(response.data, 'message');
  if (!message) {
    return false;
  }
  return message.toLowerCase().includes('already');
}

function needsSha(data: unknown | null): boolean {
  if (!isRecord(data)) {
    return false;
  }
  const message = getString(data, 'message');
  if (!message) {
    return false;
  }
  return message.toLowerCase().includes('sha') || message.toLowerCase().includes('already exists');
}

function extractSha(data: unknown | null): string | null {
  if (!isRecord(data)) {
    return null;
  }
  const sha = getString(data, 'sha');
  if (sha) {
    return sha;
  }
  const content = getRecord(data, 'content');
  if (content) {
    return getString(content, 'sha');
  }
  return null;
}

function extractStatus(data: unknown | null): string | null {
  if (!isRecord(data)) {
    return null;
  }
  const status = getString(data, 'status');
  return status;
}

function extractHtmlUrl(data: unknown | null): string | null {
  if (!isRecord(data)) {
    return null;
  }
  return getString(data, 'html_url');
}

function parseScopes(header: string | null): string[] {
  if (!header) {
    return [];
  }
  return header
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function hasRequiredScopes(scopes: string[]): boolean {
  return scopes.some((scope) => REQUIRED_SCOPES.includes(scope));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function sanitizeRepoName(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9._-]+/g, '-');
  return normalized.replace(/^-+/, '').replace(/-+$/, '');
}

function buildDeploymentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `deploy-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function encodeBase64(content: string): string {
  const bytes = encodeUtf8(content);
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i] ?? 0;
    const byte2 = bytes[i + 1] ?? 0;
    const byte3 = bytes[i + 2] ?? 0;
    const triplet = (byte1 << 16) | (byte2 << 8) | byte3;

    output += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
    output += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
    output += i + 1 < bytes.length ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '=';
    output += i + 2 < bytes.length ? BASE64_ALPHABET[triplet & 0x3f] : '=';
  }

  return output;
}

function encodeUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value);
  }
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function buildError(
  code: string,
  message: string,
  category: ErrorCategory,
  details?: Record<string, unknown>,
): AppError {
  return {
    category,
    code,
    message,
    details,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function getRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
