import type { Deployment } from '../../../types/deploy';
import type { AppError, ErrorCategory, Result } from '../../../types/result';
import type { VirtualFile, VirtualFileSystem } from '../../../types/vfs';
import { resolveRuntimeFetch } from '../../../utils/fetch';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface CloudflarePagesDeployOptions {
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

interface HeadersLike {
  get: (key: string) => string | null;
}

interface ApiResponse {
  status: number;
  ok: boolean;
  data: unknown | null;
  headers: HeadersLike;
}

const DEFAULT_API_BASE = 'https://api.cloudflare.com/client/v4';
const DEFAULT_BRANCH = 'main';

export async function deployToCloudflarePages(
  options: CloudflarePagesDeployOptions,
): Promise<Result<Deployment, AppError>> {
  const token = options.token.trim();
  if (!token) {
    return errResult(
      buildError(
        'cloudflare_token_missing',
        'Cloudflare token is required.',
        'user_action',
      ),
    );
  }

  const accountId = options.accountId.trim();
  if (!accountId) {
    return errResult(
      buildError(
        'cloudflare_account_missing',
        'Cloudflare account ID is required.',
        'user_action',
      ),
    );
  }

  const projectName = sanitizeProjectName(options.projectName);
  if (!projectName) {
    return errResult(
      buildError(
        'cloudflare_project_invalid',
        'Project name is invalid.',
        'user_action',
      ),
    );
  }

  const files = collectFiles(options.vfs);
  if (files.length === 0) {
    return errResult(
      buildError(
        'cloudflare_files_missing',
        'No files available to deploy.',
        'user_action',
      ),
    );
  }

  const fetchFn = resolveRuntimeFetch(options.fetchFn);
  if (!fetchFn) {
    return errResult(
      buildError(
        'cloudflare_fetch_missing',
        'Cloudflare fetch is not available in this environment.',
        'fatal',
      ),
    );
  }

  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE;
  const branch = options.branch ?? DEFAULT_BRANCH;
  const now = options.now ?? (() => Date.now());

  const verifyResponse = await requestJson(
    fetchFn,
    `${apiBaseUrl}/user/tokens/verify`,
    {
      method: 'GET',
      headers: buildHeaders(token, false),
    },
  );

  if (!verifyResponse.ok) {
    return errResult(verifyResponse.error);
  }

  if (!verifyResponse.value.ok || !isCloudflareSuccess(verifyResponse.value.data)) {
    return errResult(
      buildHttpError(
        'cloudflare_auth',
        'Cloudflare authentication failed.',
        verifyResponse.value,
      ),
    );
  }

  const createResponse = await requestJson(
    fetchFn,
    `${apiBaseUrl}/accounts/${accountId}/pages/projects`,
    {
      method: 'POST',
      headers: buildHeaders(token, true),
      body: JSON.stringify({ name: projectName, production_branch: branch }),
    },
  );

  if (!createResponse.ok) {
    return errResult(createResponse.error);
  }

  if (!createResponse.value.ok || !isCloudflareSuccess(createResponse.value.data)) {
    if (!isProjectAlreadyExists(createResponse.value.data)) {
      return errResult(
        buildHttpError(
          'cloudflare_project_create',
          'Cloudflare Pages project creation failed.',
          createResponse.value,
        ),
      );
    }
  }

  const deployResponse = await requestJson(
    fetchFn,
    `${apiBaseUrl}/accounts/${accountId}/pages/projects/${projectName}/deployments`,
    {
      method: 'POST',
      headers: buildHeaders(token, true),
      body: JSON.stringify({
        branch,
        files: buildFilesPayload(files),
      }),
    },
  );

  if (!deployResponse.ok) {
    return errResult(deployResponse.error);
  }

  if (!deployResponse.value.ok || !isCloudflareSuccess(deployResponse.value.data)) {
    return errResult(
      buildHttpError(
        'cloudflare_deploy',
        'Cloudflare Pages deployment failed.',
        deployResponse.value,
      ),
    );
  }

  const deploymentResult = extractResult(deployResponse.value.data);
  const url =
    extractDeploymentUrl(deploymentResult) ??
    `https://${projectName}.pages.dev`;

  const { siteSize, fileCount } = calculateStats(files);

  const deployment: Deployment = {
    id: options.deploymentId ?? buildDeploymentId(),
    sessionId: options.sessionId,
    host: 'cloudflare_pages',
    url,
    deployedAt: now(),
    siteSize,
    fileCount,
    status: 'live',
  };

  return okResult(deployment);
}

function buildHeaders(token: string, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
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
        'cloudflare_request_failed',
        'Cloudflare request failed before receiving a response.',
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
  const details: Record<string, unknown> = {
    status: response.status,
    body: response.data,
  };

  const errorMessage = extractCloudflareErrorMessage(response.data);
  if (errorMessage) {
    details.cloudflareMessage = errorMessage;
  }

  return buildError(code, message, errorCategoryForStatus(response.status), details);
}

function errorCategoryForStatus(status: number): ErrorCategory {
  if (status === 429 || status >= 500) {
    return 'retryable';
  }
  return 'user_action';
}

function isCloudflareSuccess(data: unknown | null): boolean {
  if (!isRecord(data)) {
    return false;
  }
  return data.success === true;
}

function isProjectAlreadyExists(data: unknown | null): boolean {
  const message = extractCloudflareErrorMessage(data);
  if (!message) {
    return false;
  }
  return message.toLowerCase().includes('already exists');
}

function extractCloudflareErrorMessage(data: unknown | null): string | null {
  if (!isRecord(data)) {
    return null;
  }
  const errors = data.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (isRecord(first)) {
      const message = getString(first, 'message');
      if (message) {
        return message;
      }
    }
  }
  return getString(data, 'message');
}

function extractResult(data: unknown | null): Record<string, unknown> | null {
  if (!isRecord(data)) {
    return null;
  }
  const result = data.result;
  return isRecord(result) ? result : null;
}

function extractDeploymentUrl(result: Record<string, unknown> | null): string | null {
  if (!result) {
    return null;
  }
  const url = getString(result, 'url');
  if (url) {
    return url;
  }
  const deploymentUrl = getString(result, 'deployment_url');
  if (deploymentUrl) {
    return deploymentUrl;
  }
  const domains = result.domains;
  if (Array.isArray(domains)) {
    for (const domain of domains) {
      if (typeof domain === 'string' && domain.length > 0) {
        return `https://${domain}`;
      }
    }
  }
  return null;
}

function buildFilesPayload(files: VirtualFile[]): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const file of files) {
    payload[normalizePath(file.path)] = file.content;
  }
  return payload;
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function sanitizeProjectName(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9-]+/g, '-');
  return normalized.replace(/^-+/, '').replace(/-+$/, '');
}

function buildDeploymentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `deploy-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
