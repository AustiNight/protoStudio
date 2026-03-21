import { VirtualFileSystem } from '@/engine/vfs/vfs';
import type { ImageryAssetRecord } from '@/types/imagery';
import type { AppError, Result } from '@/types/result';

export interface ImageryResolver {
  resolvePublicDomain: (query: string) => Promise<string | null>;
  resolveGenerated: (prompt: string) => Promise<string | null>;
  resolvePublicDomainAsset?: (query: string) => Promise<ImageryAssetRecord | null>;
  resolveGeneratedAsset?: (prompt: string) => Promise<ImageryAssetRecord | null>;
}

export interface ImageryResolutionSummary {
  replacements: number;
}

const PUBLIC_DOMAIN_PREFIX = 'pp://public-domain/';
const GENERATED_PREFIX = 'pp://generate-image/';

export async function resolveImageryPlaceholdersInVfs(
  vfs: VirtualFileSystem,
  resolver?: ImageryResolver,
): Promise<Result<ImageryResolutionSummary, AppError>> {
  if (!resolver) {
    return okResult({ replacements: 0 });
  }
  const imageFiles = vfs
    .listFiles()
    .filter((path) => /\.(html|css)$/i.test(path));
  let replacements = 0;

  for (const path of imageFiles) {
    const file = vfs.getFile(path);
    if (!file) {
      continue;
    }
    const content = file.content;
    const tokens = extractPlaceholderTokens(content);
    if (tokens.length === 0) {
      continue;
    }
    let nextContent = content;
    for (const token of tokens) {
      let resolved: string | null = null;
      try {
        resolved = await resolveToken(token, resolver);
      } catch (error) {
        return errResult({
          category: 'retryable',
          code: 'imagery_resolution_failed',
          message: `Imagery placeholder resolution failed for ${token.type} token.`,
          details: {
            token: token.raw,
            error:
              error instanceof Error
                ? error.message
                : 'Unknown imagery resolution error.',
          },
        });
      }
      if (!resolved) {
        continue;
      }
      nextContent = nextContent.split(token.raw).join(resolved);
      replacements += 1;
    }
    if (nextContent !== content) {
      await vfs.updateFile(path, nextContent);
    }
  }

  return okResult({ replacements });
}

type PlaceholderToken = {
  raw: string;
  type: 'public-domain' | 'generated';
  value: string;
};

function extractPlaceholderTokens(content: string): PlaceholderToken[] {
  const matches = content.match(/pp:\/\/(?:public-domain|generate-image)\/[^\s"'()<>]+/g) ?? [];
  const unique = new Set(matches);
  const tokens: PlaceholderToken[] = [];
  for (const raw of unique) {
    if (raw.startsWith(PUBLIC_DOMAIN_PREFIX)) {
      tokens.push({
        raw,
        type: 'public-domain',
        value: decodeURIComponent(raw.slice(PUBLIC_DOMAIN_PREFIX.length)),
      });
    } else if (raw.startsWith(GENERATED_PREFIX)) {
      tokens.push({
        raw,
        type: 'generated',
        value: decodeURIComponent(raw.slice(GENERATED_PREFIX.length)),
      });
    }
  }
  return tokens;
}

async function resolveToken(
  token: PlaceholderToken,
  resolver: ImageryResolver,
): Promise<string | null> {
  if (token.type === 'public-domain') {
    return resolver.resolvePublicDomain(token.value);
  }
  return resolver.resolveGenerated(token.value);
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
