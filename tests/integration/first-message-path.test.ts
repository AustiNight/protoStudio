import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { FirstMessagePath } from '../../src/engine/chat/first-message';
import { LLMGateway } from '../../src/engine/llm/gateway';
import { TEMPLATE_CATALOG } from '../../src/engine/templates/catalog';
import type { RawLLMResponse, LLMProviderClient } from '../../src/types/llm';
import type { LLMConfig } from '../../src/types/session';

function loadClassificationFixture(name: string): RawLLMResponse {
  const url = new URL(
    `../fixtures/llm-responses/classification/${name}.json`,
    import.meta.url,
  );
  const raw = readFileSync(url, 'utf-8');
  const parsed = JSON.parse(raw) as {
    content: string;
    usage: { promptTokens: number; completionTokens: number };
    model: string;
    latencyMs: number;
  };

  return {
    content: parsed.content,
    usage: parsed.usage,
    model: parsed.model,
    latencyMs: parsed.latencyMs,
  };
}

function createGateway(response: RawLLMResponse): LLMGateway {
  const provider: LLMProviderClient = {
    name: 'openai',
    async call() {
      return { ok: true, value: response };
    },
  };

  const config: LLMConfig = {
    chatModel: {
      provider: { name: 'openai', apiKey: 'test', models: ['gpt-4o-mini'] },
      model: 'gpt-4o-mini',
    },
    builderModel: {
      provider: { name: 'openai', apiKey: 'test', models: ['gpt-4o-mini'] },
      model: 'gpt-4o-mini',
    },
  };

  return new LLMGateway(config, { providers: { openai: provider } });
}

describe('FirstMessagePath', () => {
  it('should assemble a preview within SLA using the classifier output', async () => {
    const fixture = loadClassificationFixture('template-match-marketing');
    const gateway = createGateway(fixture);

    let tick = 1000;
    const now = () => {
      tick += 12;
      return tick;
    };

    const path = new FirstMessagePath({
      gateway,
      templateCatalog: TEMPLATE_CATALOG,
      now,
      previewSlaMs: 30_000,
    });

    const result = await path.run('Build a landing page for my SaaS.');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe('preview');
    if (result.value.status !== 'preview') {
      return;
    }

    expect(result.value.template.id).toBe('marketing');
    expect(result.value.preview.pagePath).toBe('index.html');
    expect(result.value.preview.html).toContain('Skyline SaaS');
    expect(result.value.preview.html).toContain(
      'Launch faster with a unified platform',
    );
    expect(result.value.timing.withinSla).toBe(true);
    expect(result.value.timing.durationMs).toBeLessThanOrEqual(
      result.value.timing.slaMs,
    );

    const css = result.value.vfs.getFile('styles.css')?.content ?? '';
    expect(css).toContain('--color-primary: #2563eb;');
  });
});
