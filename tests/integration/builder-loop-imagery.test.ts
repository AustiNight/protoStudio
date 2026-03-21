import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BuilderLoop } from '../../src/engine/builder/builder-loop';
import { buildPreviewSecurityHeaders } from '../../src/engine/guardrails/guardrails';
import { ContextManager } from '../../src/engine/llm/context';
import { LLMGateway } from '../../src/engine/llm/gateway';
import { VirtualFileSystem } from '../../src/engine/vfs/vfs';
import type { WorkItem } from '../../src/types/backlog';
import type { LLMProviderClient, RawLLMResponse } from '../../src/types/llm';
import type { BuildPatch } from '../../src/types/patch';
import type { HostId } from '../../src/types/guardrails';
import type { LLMConfig } from '../../src/types/session';
import type { VfsMetadata } from '../../src/types/vfs';

interface ScaffoldFixture {
  metadata: VfsMetadata;
  version: number;
  templateId?: string;
  files: Array<{ path: string; content: string }>;
}

class TestPreview {
  lastHtml: string | null = null;
  inject(html: string): void {
    this.lastHtml = html;
  }
  swap(): void {}
  getInactiveSlot(): 'blue' | 'green' {
    return 'green';
  }
}

class TestBacklog {
  constructor(public items: WorkItem[]) {}

  getOnDeck(): WorkItem | null {
    return this.items.find((item) => item.status === 'on_deck') ?? null;
  }

  updateItem(itemId: string, update: Partial<WorkItem>): void {
    this.items = this.items.map((item) =>
      item.id === itemId ? { ...item, ...update } : item,
    );
  }

  promoteNext(): WorkItem | null {
    const firstBacklog = this.items.find((item) => item.status === 'backlog');
    if (!firstBacklog) {
      return null;
    }
    this.items = this.items.map((item) => {
      if (item.id === firstBacklog.id) {
        return { ...item, status: 'on_deck' };
      }
      if (item.status === 'on_deck') {
        return { ...item, status: 'backlog' };
      }
      return item;
    });
    return this.items.find((item) => item.id === firstBacklog.id) ?? null;
  }

  moveToEnd(itemId: string): void {
    const maxOrder = this.items.reduce((max, item) => Math.max(max, item.order), 0);
    this.items = this.items.map((item) =>
      item.id === itemId ? { ...item, order: maxOrder + 1 } : item,
    );
  }
}

function readFixture(relativePath: string): string {
  return readFileSync(new URL(`../fixtures/${relativePath}`, import.meta.url), 'utf-8');
}

function readJsonFixture<T>(relativePath: string): T {
  return JSON.parse(readFixture(relativePath)) as T;
}

async function createVfsFromFixture(): Promise<VirtualFileSystem> {
  const fixture = readJsonFixture<ScaffoldFixture>('scaffolds/basic-scaffold.json');
  const vfs = new VirtualFileSystem({
    metadata: fixture.metadata,
    version: fixture.version,
    templateId: fixture.templateId,
  });

  for (const file of fixture.files) {
    await vfs.addFile(file.path, file.content);
  }

  return vfs;
}

function createGatewayWithResponse(content: string): LLMGateway {
  const provider: LLMProviderClient = {
    name: 'openai',
    async call(_apiKey, model) {
      const value: RawLLMResponse = {
        content,
        usage: { promptTokens: 120, completionTokens: 80 },
        model,
        latencyMs: 15,
      };
      return { ok: true, value };
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

function createGuardrailContext() {
  const headers = buildPreviewSecurityHeaders();
  const availableHosts: HostId[] = ['github_pages', 'cloudflare_pages', 'netlify'];
  return {
    deploy: {
      selectedHost: 'github_pages' as const,
      availableHosts,
    },
    preview: {
      cspHeader: headers.csp,
      sriEnabled: headers.sriRequired,
    },
  };
}

function buildWorkItem(id: string): WorkItem {
  return {
    id,
    sessionId: 'session-1',
    title: 'Add decorative visual assets',
    description: 'Add dobermans and palm trees to hero.',
    effort: 'S',
    status: 'on_deck',
    order: 1,
    dependencies: [],
    rationale: 'User requested branded visuals.',
    createdAt: 1,
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 20,
    expectedSectionDelta: 0,
    visibleChange: 'Hero shows decorative visual elements.',
  };
}

describe('BuilderLoop imagery integration', () => {
  it('resolves imagery placeholders before rendering preview', async () => {
    const vfs = await createVfsFromFixture();
    const patch: BuildPatch = {
      workItemId: 'WI-hero-imagery',
      targetVersion: 1,
      operations: [
        {
          op: 'section.replace',
          file: 'index.html',
          sectionId: 'hero',
          html: [
            '<section class="hero" data-pp-section="hero">',
            '<h1 class="hero__title">Visual Hero</h1>',
            '<img alt="dog" src="pp://public-domain/doberman%20dog">',
            '<img alt="palm" src="pp://generate-image/neon%20palm%20tree">',
            '</section>',
          ].join(''),
          ifVersion: 1,
        },
      ],
    };
    const gateway = createGatewayWithResponse(JSON.stringify(patch));
    const contextManager = new ContextManager({
      builder: { systemPrompt: 'Builder', patchFormat: 'Patch format' },
    });
    const backlog = new TestBacklog([buildWorkItem(patch.workItemId)]);
    const preview = new TestPreview();

    const loop = new BuilderLoop({ gateway, contextManager });
    const result = await loop.run({
      vfs,
      backlog,
      conversation: [],
      preview,
      guardrails: createGuardrailContext(),
      imagery: {
        resolvePublicDomain: async () => 'https://upload.wikimedia.org/doberman.jpg',
        resolveGenerated: async () =>
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2l6X0AAAAASUVORK5CYII=',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('success');

    const html = preview.lastHtml ?? '';
    expect(html).toContain('https://upload.wikimedia.org/doberman.jpg');
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toContain('pp://public-domain/');
    expect(html).not.toContain('pp://generate-image/');
  });

  it('applies deterministic imagery fallback when builder misses imagery intent', async () => {
    const vfs = await createVfsFromFixture();
    const patch: BuildPatch = {
      workItemId: 'WI-hero-imagery-missing',
      targetVersion: 1,
      operations: [
        {
          op: 'section.replace',
          file: 'index.html',
          sectionId: 'hero',
          html: [
            '<section class="hero" data-pp-section="hero">',
            '<h1 class="hero__title">Updated Headline Only</h1>',
            '</section>',
          ].join(''),
          ifVersion: 1,
        },
      ],
    };
    const gateway = createGatewayWithResponse(JSON.stringify(patch));
    const contextManager = new ContextManager({
      builder: { systemPrompt: 'Builder', patchFormat: 'Patch format' },
    });
    const backlog = new TestBacklog([
      {
        ...buildWorkItem(patch.workItemId),
        title: 'Add dobermans and palm trees to hero',
        description: 'Add decorative doberman and palm tree imagery to the hero section.',
        visibleChange: 'Hero includes visible doberman and palm tree images.',
      },
    ]);
    const preview = new TestPreview();

    const loop = new BuilderLoop({ gateway, contextManager, maxAttempts: 1 });
    const result = await loop.run({
      vfs,
      backlog,
      conversation: [],
      preview,
      guardrails: createGuardrailContext(),
      imagery: {
        resolvePublicDomain: async () => 'https://upload.wikimedia.org/doberman.jpg',
        resolveGenerated: async () =>
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2l6X0AAAAASUVORK5CYII=',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('success');
    const html = preview.lastHtml ?? '';
    expect(html).toContain('PP:IMAGERY-EXECUTOR');
    expect(html).toContain('https://upload.wikimedia.org/doberman.jpg');
    expect(html).toContain('data:image/png;base64,');
  });

  it('updates og:image to non-data asset, adds favicon, and schema fields for metadata-focused imagery tasks via executor', async () => {
    const vfs = await createVfsFromFixture();
    await vfs.updateFile(
      'index.html',
      [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '  <meta property="og:image" content="data:image/svg+xml;base64,OLD">',
        '  <link rel="icon" href="data:image/svg+xml;base64,OLDICON">',
        '  <script type="application/ld+json">{ "@context": "https://schema.org", "@type": "LocalBusiness", "name": "Old Biz" }</script>',
        '</head>',
        '<body>',
        '  <!-- PP:SECTION:hero -->',
        '  <section data-pp-section="hero"><h1>Hero</h1></section>',
        '  <!-- /PP:SECTION:hero -->',
        '</body>',
        '</html>',
      ].join('\n'),
    );
    const patch: BuildPatch = {
      workItemId: 'WI-og-schema',
      targetVersion: vfs.getVersion(),
      operations: [
        {
          op: 'section.replace',
          file: 'index.html',
          sectionId: 'hero',
          html: '<section class="hero" data-pp-section="hero"><h1>Hero Updated</h1></section>',
          ifVersion: vfs.getVersion(),
        },
      ],
    };
    const gateway = createGatewayWithResponse(JSON.stringify(patch));
    const contextManager = new ContextManager({
      builder: { systemPrompt: 'Builder', patchFormat: 'Patch format' },
    });
    const backlog = new TestBacklog([
      {
        ...buildWorkItem(patch.workItemId),
        title: 'Replace placeholder OG image with a branded thumbnail and add favicon',
        description:
          'Update og:image to a real asset (not inline data SVG), add favicon, and update schema contact fields with branded imagery metadata.',
        atomType: 'integration',
        visibleChange:
          'Open graph image is a real asset, favicon is present, and business contact schema is updated.',
      },
    ]);
    const preview = new TestPreview();

    const loop = new BuilderLoop({ gateway, contextManager, maxAttempts: 1 });
    const result = await loop.run({
      vfs,
      backlog,
      conversation: [],
      preview,
      guardrails: createGuardrailContext(),
      imagery: {
        resolvePublicDomain: async () => 'https://upload.wikimedia.org/branded-og.jpg',
        resolveGenerated: async () =>
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2l6X0AAAAASUVORK5CYII=',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('success');

    const html = preview.lastHtml ?? '';
    expect(html).toContain('property="og:image" content="https://upload.wikimedia.org/branded-og.jpg"');
    expect(html).toContain('rel="icon" href="https://upload.wikimedia.org/branded-og.jpg"');
    expect(html).toContain('"contactPoint"');
    expect(html).toContain('"image": "https://upload.wikimedia.org/branded-og.jpg"');
  });

  it('blocks metadata imagery task when og:image remains data URI and executor has no asset output', async () => {
    const vfs = await createVfsFromFixture();
    await vfs.updateFile(
      'index.html',
      [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '  <meta property="og:image" content="data:image/svg+xml;base64,OLD">',
        '</head>',
        '<body>',
        '  <!-- PP:SECTION:hero -->',
        '  <section data-pp-section="hero"><h1>Hero</h1></section>',
        '  <!-- /PP:SECTION:hero -->',
        '</body>',
        '</html>',
      ].join('\n'),
    );
    const patch: BuildPatch = {
      workItemId: 'WI-og-real-asset-required',
      targetVersion: vfs.getVersion(),
      operations: [
        {
          op: 'section.replace',
          file: 'index.html',
          sectionId: 'hero',
          html: '<section class="hero" data-pp-section="hero"><h1>Hero Updated</h1></section>',
          ifVersion: vfs.getVersion(),
        },
      ],
    };
    const gateway = createGatewayWithResponse(JSON.stringify(patch));
    const contextManager = new ContextManager({
      builder: { systemPrompt: 'Builder', patchFormat: 'Patch format' },
    });
    const backlog = new TestBacklog([
      {
        ...buildWorkItem(patch.workItemId),
        title: 'Ensure Open Graph image is a real asset (not inline data SVG) and add favicon',
        description: 'Replace data URI og:image and add favicon.',
        atomType: 'integration',
        visibleChange: 'OG image uses real asset URL and favicon is present.',
      },
    ]);
    const preview = new TestPreview();

    const loop = new BuilderLoop({ gateway, contextManager, maxAttempts: 1 });
    const result = await loop.run({
      vfs,
      backlog,
      conversation: [],
      preview,
      guardrails: createGuardrailContext(),
      imagery: {
        resolvePublicDomain: async () => null,
        resolveGenerated: async () => null,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('blocked');
    expect(result.value.blockedCode).toBe('imagery_intent_unmet');
  });
});
