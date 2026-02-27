import type { Deployment } from '../../../types/deploy';
import type { AppError, ErrorCategory, Result } from '../../../types/result';
import type { VirtualFile, VirtualFileSystem } from '../../../types/vfs';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface NetlifyDeployOptions {
  token: string;
  siteName: string;
  vfs: VirtualFileSystem;
  sessionId: string;
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

interface DigestBundle {
  digests: Record<string, string>;
  fileMap: Map<string, VirtualFile>;
}

const DEFAULT_API_BASE = 'https://api.netlify.com/api/v1';

export async function deployToNetlify(
  options: NetlifyDeployOptions,
): Promise<Result<Deployment, AppError>> {
  const token = options.token.trim();
  if (!token) {
    return errResult(
      buildError('netlify_token_missing', 'Netlify token is required.', 'user_action'),
    );
  }

  const siteName = sanitizeSiteName(options.siteName);
  if (!siteName) {
    return errResult(
      buildError('netlify_site_invalid', 'Netlify site name is invalid.', 'user_action'),
    );
  }

  const files = collectFiles(options.vfs);
  if (files.length === 0) {
    return errResult(
      buildError('netlify_files_missing', 'No files available to deploy.', 'user_action'),
    );
  }

  const fetchFn = options.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchFn) {
    return errResult(
      buildError(
        'netlify_fetch_missing',
        'Netlify fetch is not available in this environment.',
        'fatal',
      ),
    );
  }

  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE;
  const now = options.now ?? (() => Date.now());

  const siteResponse = await requestJson(fetchFn, `${apiBaseUrl}/sites`, {
    method: 'POST',
    headers: buildHeaders(token, 'application/json'),
    body: JSON.stringify({ name: siteName }),
  });

  if (!siteResponse.ok) {
    return errResult(siteResponse.error);
  }

  if (!siteResponse.value.ok) {
    if (isUnauthorized(siteResponse.value.status)) {
      return errResult(
        buildHttpError(
          'netlify_auth',
          'Netlify authentication failed.',
          siteResponse.value,
        ),
      );
    }
    return errResult(
      buildHttpError(
        'netlify_site_create',
        'Netlify site creation failed.',
        siteResponse.value,
      ),
    );
  }

  const siteId = extractSiteId(siteResponse.value.data);
  if (!siteId) {
    return errResult(
      buildError(
        'netlify_site_invalid',
        'Netlify site response was invalid.',
        'fatal',
      ),
    );
  }

  const siteUrl = extractSiteUrl(siteResponse.value.data);

  const digestBundle = await buildFileDigests(files);

  const deployResponse = await requestJson(
    fetchFn,
    `${apiBaseUrl}/sites/${siteId}/deploys`,
    {
      method: 'POST',
      headers: buildHeaders(token, 'application/json'),
      body: JSON.stringify({ files: digestBundle.digests }),
    },
  );

  if (!deployResponse.ok) {
    return errResult(deployResponse.error);
  }

  if (!deployResponse.value.ok) {
    if (isUnauthorized(deployResponse.value.status)) {
      return errResult(
        buildHttpError(
          'netlify_auth',
          'Netlify authentication failed.',
          deployResponse.value,
        ),
      );
    }
    return errResult(
      buildHttpError(
        'netlify_deploy_create',
        'Netlify deploy creation failed.',
        deployResponse.value,
      ),
    );
  }

  const deployId = extractDeployId(deployResponse.value.data);
  if (!deployId) {
    return errResult(
      buildError(
        'netlify_deploy_invalid',
        'Netlify deploy response was invalid.',
        'fatal',
      ),
    );
  }

  const requiredFiles = extractRequiredFiles(deployResponse.value.data);

  for (const requiredPath of requiredFiles) {
    const normalized = normalizePath(requiredPath);
    const file = digestBundle.fileMap.get(normalized);
    if (!file) {
      return errResult(
        buildError(
          'netlify_file_missing',
          `Netlify required file was missing: ${normalized}`,
          'fatal',
        ),
      );
    }

    const uploadResponse = await requestJson(
      fetchFn,
      `${apiBaseUrl}/deploys/${deployId}/files/${encodePath(normalized)}`,
      {
        method: 'PUT',
        headers: buildHeaders(token, 'application/octet-stream'),
        body: file.content,
      },
    );

    if (!uploadResponse.ok) {
      return errResult(uploadResponse.error);
    }

    if (!uploadResponse.value.ok) {
      return errResult(
        buildHttpError(
          'netlify_upload',
          'Netlify file upload failed.',
          uploadResponse.value,
        ),
      );
    }
  }

  const url =
    extractDeployUrl(deployResponse.value.data) ??
    siteUrl ??
    `https://${siteName}.netlify.app`;

  const { siteSize, fileCount } = calculateStats(files);

  const deployment: Deployment = {
    id: options.deploymentId ?? buildDeploymentId(),
    sessionId: options.sessionId,
    host: 'netlify',
    url,
    deployedAt: now(),
    siteSize,
    fileCount,
    status: 'live',
  };

  return okResult(deployment);
}

function buildHeaders(token: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
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
        'netlify_request_failed',
        'Netlify request failed before receiving a response.',
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

  const errorMessage = extractNetlifyErrorMessage(response.data);
  if (errorMessage) {
    details.netlifyMessage = errorMessage;
  }

  return buildError(code, message, errorCategoryForStatus(response.status), details);
}

function errorCategoryForStatus(status: number): ErrorCategory {
  if (status === 429 || status >= 500) {
    return 'retryable';
  }
  return 'user_action';
}

function isUnauthorized(status: number): boolean {
  return status === 401 || status === 403;
}

function extractNetlifyErrorMessage(data: unknown | null): string | null {
  if (!isRecord(data)) {
    return null;
  }
  return getString(data, 'message');
}

function extractSiteId(data: unknown | null): string | null {
  if (!isRecord(data)) {
    return null;
  }
  return getString(data, 'id');
}

function extractSiteUrl(data: unknown | null): string | null {
  if (!isRecord(data)) {
    return null;
  }
  const sslUrl = getString(data, 'ssl_url');
  if (sslUrl) {
    return sslUrl;
  }
  return getString(data, 'url');
}

function extractDeployId(data: unknown | null): string | null {
  if (!isRecord(data)) {
    return null;
  }
  return getString(data, 'id');
}

function extractRequiredFiles(data: unknown | null): string[] {
  if (!isRecord(data)) {
    return [];
  }
  const required = data.required;
  if (!Array.isArray(required)) {
    return [];
  }
  return required.filter((value): value is string => typeof value === 'string');
}

function extractDeployUrl(data: unknown | null): string | null {
  if (!isRecord(data)) {
    return null;
  }
  const deploySslUrl = getString(data, 'deploy_ssl_url');
  if (deploySslUrl) {
    return deploySslUrl;
  }
  const sslUrl = getString(data, 'ssl_url');
  if (sslUrl) {
    return sslUrl;
  }
  const deployUrl = getString(data, 'deploy_url');
  if (deployUrl) {
    return deployUrl;
  }
  return getString(data, 'url');
}

async function buildFileDigests(files: VirtualFile[]): Promise<DigestBundle> {
  const digests: Record<string, string> = {};
  const fileMap = new Map<string, VirtualFile>();

  for (const file of files) {
    const normalized = normalizePath(file.path);
    const digest = await hashContent(file.content);
    digests[normalized] = digest;
    fileMap.set(normalized, file);
  }

  return { digests, fileMap };
}

async function hashContent(content: string): Promise<string> {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.subtle) {
    try {
      const data = encodeUtf8(content);
      const digest = await cryptoRef.subtle.digest('SHA-1', data);
      return bufferToHex(digest);
    } catch {
      // Fall back to a deterministic hash if SHA-1 is unavailable.
    }
  }

  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, '0');
  return (hex.repeat(5)).slice(0, 40);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
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

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function sanitizeSiteName(value: string): string {
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
