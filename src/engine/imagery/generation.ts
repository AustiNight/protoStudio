import type { AppError, Result } from '@/types/result';
import type { LLMProviderName } from '@/types/session';
import type { ImageryAssetRecord } from '@/types/imagery';

export type OpenAIImageSize = '1024x1024' | '1024x1536' | '1536x1024';
export type OpenAIImageQuality = 'low' | 'medium' | 'high';

export interface ImageGenerationRequest {
  provider: LLMProviderName;
  model: string;
  prompt: string;
  size?: OpenAIImageSize;
  quality?: OpenAIImageQuality;
  apiKey?: string;
  requestMode?: 'direct' | 'proxy';
  proxyBaseUrl?: string;
}

export interface ImageGenerationResult {
  dataUrl: string;
  model: string;
  provider: LLMProviderName;
  estimatedCostUsd: number;
  latencyMs: number;
  width: number;
  height: number;
}

type OpenAIImagePayload = {
  data?: Array<{ b64_json?: string; revised_prompt?: string }>;
};

const OPENAI_IMAGE_PRICING: Record<OpenAIImageQuality, Record<OpenAIImageSize, number>> = {
  low: {
    '1024x1024': 0.01,
    '1024x1536': 0.01,
    '1536x1024': 0.01,
  },
  medium: {
    '1024x1024': 0.03,
    '1024x1536': 0.05,
    '1536x1024': 0.05,
  },
  high: {
    '1024x1024': 0.13,
    '1024x1536': 0.2,
    '1536x1024': 0.2,
  },
};

export async function generateImageAsset(
  input: ImageGenerationRequest,
): Promise<Result<ImageGenerationResult, AppError>> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return errResult({
      category: 'user_action',
      code: 'image_prompt_missing',
      message: 'Image prompt is required.',
    });
  }

  if (input.provider !== 'openai') {
    return errResult({
      category: 'user_action',
      code: 'image_provider_unsupported',
      message: `Image generation provider "${input.provider}" is not configured yet.`,
    });
  }

  const requestMode = input.requestMode ?? 'proxy';
  const endpoint =
    requestMode === 'proxy'
      ? `${(input.proxyBaseUrl ?? '/api/openai').replace(/\/$/, '')}/v1/images/generations`
      : 'https://api.openai.com/v1/images/generations';
  if (requestMode === 'direct' && !input.apiKey?.trim()) {
    return errResult({
      category: 'user_action',
      code: 'image_auth_missing',
      message: 'OpenAI API key is required for direct image generation mode.',
    });
  }

  const size: OpenAIImageSize = input.size ?? '1024x1024';
  const quality: OpenAIImageQuality = input.quality ?? 'medium';
  const startedAt = Date.now();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (requestMode === 'direct') {
    headers.Authorization = `Bearer ${input.apiKey?.trim() ?? ''}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: input.model,
        prompt,
        size,
        quality,
      }),
    });
    if (!response.ok) {
      return errResult({
        category: 'retryable',
        code: 'image_generation_failed',
        message: `Image generation failed with status ${response.status}.`,
      });
    }
    const payload = (await response.json()) as OpenAIImagePayload;
    const b64 = payload.data?.[0]?.b64_json?.trim() ?? '';
    if (!b64) {
      return errResult({
        category: 'retryable',
        code: 'image_empty_response',
        message: 'Image generation returned no image payload.',
      });
    }
    return okResult({
      dataUrl: `data:image/png;base64,${b64}`,
      model: input.model,
      provider: 'openai',
      estimatedCostUsd: OPENAI_IMAGE_PRICING[quality][size],
      latencyMs: Math.max(0, Date.now() - startedAt),
      ...parseImageSize(size),
    });
  } catch {
    return errResult({
      category: 'retryable',
      code: 'image_generation_network',
      message: 'Image generation request failed before completion.',
    });
  }
}

export function toGeneratedImageryAssetRecord(
  input: ImageGenerationResult,
  prompt: string,
): ImageryAssetRecord {
  return {
    id: `asset-generated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: input.dataUrl,
    provenance: 'generated',
    provider: input.provider,
    model: input.model,
    prompt,
    width: input.width,
    height: input.height,
    targetSlots: ['general'],
    createdAt: Date.now(),
  };
}

function parseImageSize(size: OpenAIImageSize): { width: number; height: number } {
  const [width, height] = size.split('x').map((value) => Number.parseInt(value, 10));
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 1024,
  };
}

function okResult<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function errResult<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
