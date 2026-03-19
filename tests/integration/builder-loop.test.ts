import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BuilderLoop } from '../../src/engine/builder/builder-loop';
import { buildPreviewSecurityHeaders } from '../../src/engine/guardrails/guardrails';
import { ContextManager } from '../../src/engine/llm/context';
import { LLMGateway } from '../../src/engine/llm/gateway';
import { VirtualFileSystem } from '../../src/engine/vfs/vfs';
import type { WorkItem } from '../../src/types/backlog';
import type { ChatMessage } from '../../src/types/chat';
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

interface GatewayHarness {
  gateway: LLMGateway;
  getCallCount: () => number;
}

class TestPreview {
  lastHtml: string | null = null;
  swapCount = 0;
  private inactiveSlot: 'blue' | 'green' = 'green';

  inject(html: string): void {
    this.lastHtml = html;
  }

  swap(): void {
    this.swapCount += 1;
    this.inactiveSlot = this.inactiveSlot === 'green' ? 'blue' : 'green';
  }

  getInactiveSlot(): 'blue' | 'green' {
    return this.inactiveSlot;
  }
}

class TestBacklog {
  items: WorkItem[];

  constructor(items: WorkItem[]) {
    this.items = normalizeOrder(items);
  }

  getOnDeck(): WorkItem | null {
    return this.items.find((item) => item.status === 'on_deck') ?? null;
  }

  updateItem(itemId: string, update: Partial<WorkItem>): void {
    this.items = this.items.map((item) =>
      item.id === itemId ? { ...item, ...update } : item,
    );
  }

  promoteNext(): WorkItem | null {
    const backlogItems = this.items.filter((item) => item.status === 'backlog');
    const sorted = sortByOrder(backlogItems);
    const next = sorted[0];
    if (!next) {
      return null;
    }

    this.items = this.items.map((item) => {
      if (item.id === next.id) {
        return { ...item, status: 'on_deck' };
      }
      if (item.status === 'on_deck') {
        return { ...item, status: 'backlog' };
      }
      return item;
    });

    return this.items.find((item) => item.id === next.id) ?? null;
  }

  moveToEnd(itemId: string): void {
    const maxOrder = this.items.reduce((max, item) => Math.max(max, item.order), 0);
    this.items = this.items.map((item) =>
      item.id === itemId ? { ...item, order: maxOrder + 1 } : item,
    );
    this.items = normalizeOrder(this.items);
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

function createGatewayWithResponses(responses: string[]): GatewayHarness {
  let callCount = 0;
  const provider: LLMProviderClient = {
    name: 'openai',
    async call(_apiKey, model) {
      const content = responses[Math.min(callCount, responses.length - 1)] ?? '';
      callCount += 1;
      const value: RawLLMResponse = {
        content,
        usage: { promptTokens: 120, completionTokens: 80 },
        model,
        latencyMs: 12,
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

  return {
    gateway: new LLMGateway(config, { providers: { openai: provider } }),
    getCallCount: () => callCount,
  };
}

function buildWorkItem(partial: Partial<WorkItem>): WorkItem {
  return {
    id: partial.id ?? 'WI-test',
    sessionId: partial.sessionId ?? 'session-1',
    title: partial.title ?? 'Update hero copy',
    description: partial.description ?? 'Adjust hero headline.',
    effort: partial.effort ?? 'S',
    status: partial.status ?? 'backlog',
    order: partial.order ?? 1,
    dependencies: partial.dependencies ?? [],
    rationale: partial.rationale ?? 'Requested change.',
    createdAt: partial.createdAt ?? 1,
    atomType: partial.atomType ?? 'content',
    filesTouch: partial.filesTouch ?? ['index.html'],
    estimatedLines: partial.estimatedLines ?? 40,
    expectedSectionDelta: partial.expectedSectionDelta ?? 0,
    visibleChange: partial.visibleChange ?? 'Hero headline updated',
    completedAt: partial.completedAt,
    buildVersion: partial.buildVersion,
  };
}

function normalizeOrder(items: WorkItem[]): WorkItem[] {
  return sortByOrder(items).map((item, index) => ({
    ...item,
    order: index + 1,
  }));
}

function sortByOrder(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => a.order - b.order);
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

describe('BuilderLoop', () => {
  it('should complete a successful build cycle from On Deck to swap', async () => {
    const vfs = await createVfsFromFixture();
    const patch = readJsonFixture<BuildPatch>('patches/valid-section-replace.json');
    const { gateway } = createGatewayWithResponses([JSON.stringify(patch)]);
    const contextManager = new ContextManager({
      builder: { systemPrompt: 'Builder', patchFormat: 'Patch format' },
    });

    const backlog = new TestBacklog([
      buildWorkItem({
        id: patch.workItemId,
        status: 'on_deck',
        order: 1,
        filesTouch: ['index.html'],
      }),
      buildWorkItem({
        id: 'WI-next',
        title: 'Add testimonials',
        status: 'backlog',
        order: 2,
        filesTouch: ['index.html', 'styles.css'],
      }),
    ]);
    const preview = new TestPreview();

    const loop = new BuilderLoop({ gateway, contextManager });
    const result = await loop.run({
      vfs,
      backlog,
      conversation: [] as ChatMessage[],
      preview,
      guardrails: createGuardrailContext(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe('success');
    expect(preview.swapCount).toBe(1);
    expect(preview.lastHtml).toContain('Updated Hero');

    const first = backlog.items.find((item) => item.id === patch.workItemId);
    const next = backlog.items.find((item) => item.id === 'WI-next');
    expect(first?.status).toBe('done');
    expect(next?.status).toBe('on_deck');
    expect(vfs.getVersion()).toBe(2);
  });

  it('should retry once on bad patch then succeed', async () => {
    const vfs = await createVfsFromFixture();
    const validPatch = readJsonFixture<BuildPatch>('patches/valid-section-replace.json');
    const invalidPatch: BuildPatch = {
      workItemId: validPatch.workItemId,
      targetVersion: validPatch.targetVersion,
      operations: [],
    };
    const { gateway, getCallCount } = createGatewayWithResponses([
      JSON.stringify(invalidPatch),
      JSON.stringify(validPatch),
    ]);
    const contextManager = new ContextManager({
      builder: { systemPrompt: 'Builder', patchFormat: 'Patch format' },
    });

    const backlog = new TestBacklog([
      buildWorkItem({
        id: validPatch.workItemId,
        status: 'on_deck',
        order: 1,
      }),
    ]);
    const preview = new TestPreview();
    const loop = new BuilderLoop({ gateway, contextManager });

    const result = await loop.run({
      vfs,
      backlog,
      conversation: [],
      preview,
      guardrails: createGuardrailContext(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('success');
    expect(result.value.attempts).toBe(2);
    expect(getCallCount()).toBe(2);
    expect(preview.swapCount).toBe(1);
  });

  it('should normalize stale targetVersion from builder output and still succeed', async () => {
    const vfs = await createVfsFromFixture();
    const validPatch = readJsonFixture<BuildPatch>('patches/valid-section-replace.json');
    const staleVersionPatch: BuildPatch = {
      workItemId: validPatch.workItemId,
      targetVersion: 99,
      operations: validPatch.operations.map((op) => ({
        ...((op as unknown) as Record<string, unknown>),
        ifVersion: 99,
      })) as BuildPatch['operations'],
    };
    const { gateway, getCallCount } = createGatewayWithResponses([
      JSON.stringify(staleVersionPatch),
    ]);
    const contextManager = new ContextManager({
      builder: { systemPrompt: 'Builder', patchFormat: 'Patch format' },
    });

    const backlog = new TestBacklog([
      buildWorkItem({
        id: validPatch.workItemId,
        status: 'on_deck',
        order: 1,
      }),
    ]);
    const preview = new TestPreview();
    const loop = new BuilderLoop({ gateway, contextManager });

    const result = await loop.run({
      vfs,
      backlog,
      conversation: [],
      preview,
      guardrails: createGuardrailContext(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('success');
    expect(result.value.attempts).toBe(1);
    expect(getCallCount()).toBe(1);
    expect(preview.swapCount).toBe(1);
    expect(vfs.getVersion()).toBe(2);
  });

  it('should skip atom after 3 failures and move to next', async () => {
    const vfs = await createVfsFromFixture();
    const validPatch = readJsonFixture<BuildPatch>('patches/valid-section-replace.json');
    const invalidPatch: BuildPatch = {
      workItemId: validPatch.workItemId,
      targetVersion: validPatch.targetVersion,
      operations: [],
    };
    const { gateway, getCallCount } = createGatewayWithResponses([
      JSON.stringify(invalidPatch),
      JSON.stringify(invalidPatch),
      JSON.stringify(invalidPatch),
    ]);
    const contextManager = new ContextManager({
      builder: { systemPrompt: 'Builder', patchFormat: 'Patch format' },
    });

    const backlog = new TestBacklog([
      buildWorkItem({
        id: validPatch.workItemId,
        status: 'on_deck',
        order: 1,
      }),
      buildWorkItem({
        id: 'WI-followup',
        title: 'Add footer links',
        status: 'backlog',
        order: 2,
      }),
    ]);
    const preview = new TestPreview();
    const loop = new BuilderLoop({ gateway, contextManager, maxAttempts: 3 });

    const result = await loop.run({
      vfs,
      backlog,
      conversation: [],
      preview,
      guardrails: createGuardrailContext(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('skipped');
    expect(result.value.attempts).toBe(3);
    expect(getCallCount()).toBe(3);
    expect(preview.swapCount).toBe(0);

    const skipped = backlog.items.find((item) => item.id === validPatch.workItemId);
    const next = backlog.items.find((item) => item.id === 'WI-followup');
    expect(skipped?.status).toBe('backlog');
    expect(next?.status).toBe('on_deck');
  });

  it('should block terminally failing final item instead of re-promoting it', async () => {
    const vfs = await createVfsFromFixture();
    const validPatch = readJsonFixture<BuildPatch>('patches/valid-section-replace.json');
    const invalidPatch: BuildPatch = {
      workItemId: validPatch.workItemId,
      targetVersion: validPatch.targetVersion,
      operations: [],
    };
    const { gateway } = createGatewayWithResponses([
      JSON.stringify(invalidPatch),
      JSON.stringify(invalidPatch),
      JSON.stringify(invalidPatch),
    ]);
    const contextManager = new ContextManager({
      builder: { systemPrompt: 'Builder', patchFormat: 'Patch format' },
    });

    const backlog = new TestBacklog([
      buildWorkItem({
        id: validPatch.workItemId,
        status: 'on_deck',
        order: 1,
      }),
    ]);
    const preview = new TestPreview();
    const loop = new BuilderLoop({ gateway, contextManager, maxAttempts: 3 });

    const result = await loop.run({
      vfs,
      backlog,
      conversation: [],
      preview,
      guardrails: createGuardrailContext(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('skipped');
    expect(preview.swapCount).toBe(0);
    const skipped = backlog.items.find((item) => item.id === validPatch.workItemId);
    expect(skipped?.status).toBe('blocked');
    expect(skipped?.blockedCode).toBe('terminal_skip');
    expect(backlog.getOnDeck()).toBeNull();
  });
});
