interface Env {
  OPENAI_API_KEY?: string;
  OPENAI_PROXY_ALLOWED_ORIGINS?: string;
}

type ProxyErrorCode =
  | 'secret_missing'
  | 'origin_blocked'
  | 'route_not_found'
  | 'method_not_allowed'
  | 'upstream_unreachable';

const OPENAI_API_BASE_URL = 'https://api.openai.com';
const OPENAI_PROXY_PREFIX = '/api/openai';
const ALLOWED_PATHS = new Set(['/v1/chat/completions', '/v1/models']);

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const apiKey = env.OPENAI_API_KEY?.trim();
  const incomingUrl = new URL(request.url);
  const cors = resolveCors(request, incomingUrl, env.OPENAI_PROXY_ALLOWED_ORIGINS);

  if (!apiKey) {
    return jsonError(
      500,
      'OPENAI_API_KEY secret is not configured.',
      cors,
      'secret_missing',
    );
  }

  if (request.method === 'OPTIONS') {
    if (!cors.allowed) {
      return jsonError(403, 'Origin is not allowed.', cors, 'origin_blocked');
    }
    return new Response(null, {
      status: 204,
      headers: buildResponseHeaders(
        {
          Allow: 'GET, POST, OPTIONS',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
        cors,
      ),
    });
  }

  if (!cors.allowed) {
    return jsonError(403, 'Origin is not allowed.', cors, 'origin_blocked');
  }

  const openAIPath = normalizeOpenAIPath(incomingUrl.pathname);
  if (!ALLOWED_PATHS.has(openAIPath)) {
    return jsonError(404, 'OpenAI proxy route not found.', cors, 'route_not_found');
  }

  if (openAIPath === '/v1/models' && request.method !== 'GET') {
    return jsonError(405, 'Method not allowed.', cors, 'method_not_allowed');
  }
  if (openAIPath === '/v1/chat/completions' && request.method !== 'POST') {
    return jsonError(405, 'Method not allowed.', cors, 'method_not_allowed');
  }

  const targetUrl = new URL(`${OPENAI_API_BASE_URL}${openAIPath}`);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${apiKey}`);
  headers.set('Content-Type', request.headers.get('Content-Type') ?? 'application/json');

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
  } catch {
    return jsonError(
      502,
      'OpenAI upstream is unreachable.',
      cors,
      'upstream_unreachable',
    );
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('set-cookie');

  return new Response(response.body, {
    status: response.status,
    headers: buildResponseHeaders(responseHeaders, cors),
  });
};

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

interface ResolvedCors {
  allowed: boolean;
  allowOrigin: string | null;
}

function resolveCors(
  request: Request,
  incomingUrl: URL,
  allowedOriginsRaw: string | undefined,
): ResolvedCors {
  const origin = request.headers.get('Origin')?.trim() ?? '';
  if (!origin) {
    return { allowed: true, allowOrigin: null };
  }

  if (origin === incomingUrl.origin) {
    return { allowed: true, allowOrigin: origin };
  }

  const allowedOrigins = parseAllowedOrigins(allowedOriginsRaw);
  if (allowedOrigins.has(origin)) {
    return { allowed: true, allowOrigin: origin };
  }

  return { allowed: false, allowOrigin: null };
}

function parseAllowedOrigins(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

function buildResponseHeaders(
  headersInit: HeadersInit,
  cors: ResolvedCors,
): Headers {
  const headers = new Headers(headersInit);
  if (cors.allowOrigin) {
    headers.set('Access-Control-Allow-Origin', cors.allowOrigin);
    headers.append('Vary', 'Origin');
  }
  return headers;
}

function jsonError(
  status: number,
  message: string,
  cors: ResolvedCors,
  code?: ProxyErrorCode,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        message,
        ...(code ? { code } : {}),
      },
    }),
    {
      status,
      headers: buildResponseHeaders(
        {
          'Content-Type': 'application/json',
        },
        cors,
      ),
    },
  );
}
