import { readFileSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const projectRoot = fileURLToPath(new URL('./', import.meta.url));

const carouselBuildAssets = [
  {
    source: '.well-known/carousel.json',
    target: '.well-known/carousel.json',
  },
  {
    source: 'preview-carousel.png',
    target: 'preview-carousel.png',
  },
] as const;

function copyCarouselBuildAssets() {
  return {
    name: 'copy-carousel-build-assets',
    apply: 'build',
    async writeBundle() {
      await Promise.all(
        carouselBuildAssets.map(async ({ source, target }) => {
          const sourcePath = resolve(projectRoot, source);
          const targetPath = resolve(projectRoot, 'dist', target);

          await mkdir(dirname(targetPath), { recursive: true });
          await copyFile(sourcePath, targetPath);
        }),
      );
    },
  };
}

const OPENAI_API_BASE_URL = 'https://api.openai.com';
const OPENAI_PROXY_PREFIX = '/api/openai';
const OPENAI_ALLOWED_PATHS = new Set(['/v1/chat/completions', '/v1/models']);

function openAIDevProxy(
  env: Record<string, string>,
  mode: string,
  rootDir: string,
) {
  return {
    name: 'openai-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      const apiKey = resolveOpenAIApiKey(env, mode, rootDir);
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '';
        if (!rawUrl.startsWith(OPENAI_PROXY_PREFIX)) {
          next();
          return;
        }

        const method = req.method ?? 'GET';
        const incomingUrl = new URL(rawUrl, 'http://localhost');
        const openAIPath = normalizeOpenAIPath(incomingUrl.pathname);
        if (method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.end();
          return;
        }

        if (!apiKey) {
          sendProxyError(res, 500, 'OPENAI_API_KEY is not configured for local dev.', 'secret_missing');
          return;
        }

        if (!OPENAI_ALLOWED_PATHS.has(openAIPath)) {
          sendProxyError(res, 404, 'OpenAI proxy route not found.', 'route_not_found');
          return;
        }

        if (openAIPath === '/v1/models' && method !== 'GET') {
          sendProxyError(res, 405, 'Method not allowed.', 'method_not_allowed');
          return;
        }
        if (openAIPath === '/v1/chat/completions' && method !== 'POST') {
          sendProxyError(res, 405, 'Method not allowed.', 'method_not_allowed');
          return;
        }

        const targetUrl = new URL(`${OPENAI_API_BASE_URL}${openAIPath}`);
        targetUrl.search = incomingUrl.search;

        const headers = new Headers();
        headers.set('Authorization', `Bearer ${apiKey}`);
        headers.set(
          'Content-Type',
          typeof req.headers['content-type'] === 'string'
            ? req.headers['content-type']
            : 'application/json',
        );
        // Avoid forwarding compressed upstream bodies with stale encoding headers in dev proxy.
        headers.set('Accept-Encoding', 'identity');

        try {
          const response = await fetch(targetUrl, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(req),
          });
          const body = Buffer.from(await response.arrayBuffer());

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            const normalizedKey = key.toLowerCase();
            if (
              normalizedKey === 'set-cookie' ||
              normalizedKey === 'content-encoding' ||
              normalizedKey === 'transfer-encoding' ||
              normalizedKey === 'content-length' ||
              normalizedKey === 'connection'
            ) {
              return;
            }
            res.setHeader(key, value);
          });
          res.setHeader('Content-Length', String(body.length));
          res.end(body);
        } catch {
          sendProxyError(res, 502, 'OpenAI upstream is unreachable.', 'upstream_unreachable');
        }
      });
    },
  };
}

function resolveOpenAIApiKey(
  env: Record<string, string>,
  mode: string,
  rootDir: string,
): string {
  const fileKey = readOpenAIKeyFromEnvFiles(mode, rootDir);
  if (fileKey) {
    return fileKey;
  }
  const openAIKey = env.OPENAI_API_KEY?.trim();
  if (openAIKey) {
    return openAIKey;
  }
  return env.VITE_OPENAI_API_KEY?.trim() ?? '';
}

function readOpenAIKeyFromEnvFiles(mode: string, rootDir: string): string {
  const candidates = [
    `.env.${mode}.local`,
    '.env.local',
    `.env.${mode}`,
    '.env',
  ];
  for (const name of candidates) {
    const value = readEnvVarFromFileSync(resolve(rootDir, name), 'OPENAI_API_KEY');
    if (value) {
      return value;
    }
  }
  return '';
}

function readEnvVarFromFileSync(filePath: string, key: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      if (!trimmed.startsWith(`${key}=`)) {
        continue;
      }
      const raw = trimmed.slice(key.length + 1).trim();
      return stripWrappingQuotes(raw);
    }
  } catch {
    return '';
  }
  return '';
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function normalizeOpenAIPath(pathname: string): string {
  if (!pathname.startsWith(OPENAI_PROXY_PREFIX)) {
    return '';
  }
  const rawPath = pathname.slice(OPENAI_PROXY_PREFIX.length);
  if (!rawPath || rawPath === '/') {
    return '';
  }
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}

function sendProxyError(
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (chunk: string) => void;
  },
  status: number,
  message: string,
  code: string,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      error: {
        message,
        code,
      },
    }),
  );
}

async function readRequestBody(
  req: AsyncIterable<Buffer | string>,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  return {
    plugins: [react(), openAIDevProxy(env, mode, projectRoot), copyCarouselBuildAssets()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});
