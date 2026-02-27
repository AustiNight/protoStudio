import { describe, expect, it } from 'vitest';
import { ContextManager } from '../../../src/engine/llm/context';
import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import type { ChatMessage } from '../../../src/types/chat';
import type { WorkItem } from '../../../src/types/backlog';

const baseHtml = `<!doctype html>
<html lang="en">
<head><title>Test</title></head>
<body>
  <!-- PP:SECTION:hero -->
  <section class="hero" data-pp-section="hero">Hero content</section>
  <!-- /PP:SECTION:hero -->
  <!-- PP:SECTION:services -->
  <section class="services" data-pp-section="services">Services content</section>
  <!-- /PP:SECTION:services -->
  <!-- PP:SECTION:footer -->
  <footer class="footer" data-pp-section="footer">Footer content</footer>
  <!-- /PP:SECTION:footer -->
</body>
</html>`;

const baseCss = `/* === PP:BLOCK:variables === */
:root {\n  --color-text: #111;\n}\n/* === /PP:BLOCK:variables === */`;

function buildManager(overrides?: Parameters<typeof buildManagerConfig>[0]): ContextManager {
  return new ContextManager(buildManagerConfig(overrides));
}

function buildManagerConfig(overrides?: {
  builder?: Partial<{ model: string; maxTokens: number; reservedForOutput: number; systemPrompt: string; patchFormat: string }>;
  chat?: Partial<{ model: string; maxTokens: number; reservedForOutput: number; systemPrompt: string }>;
  bufferTokens?: number;
  thresholds?: Partial<{ moderate: number; tight: number; minimal: number }>;
}) {
  return {
    builder: {
      model: 'builder-model',
      maxTokens: 600,
      reservedForOutput: 50,
      systemPrompt: 'Builder system prompt',
      patchFormat: 'Patch format instructions',
      ...overrides?.builder,
    },
    chat: {
      model: 'chat-model',
      maxTokens: 600,
      reservedForOutput: 50,
      systemPrompt: 'Chat system prompt',
      ...overrides?.chat,
    },
    bufferTokens: overrides?.bufferTokens ?? 0,
    thresholds: overrides?.thresholds,
  };
}

async function buildVfs() {
  const vfs = new VirtualFileSystem({
    metadata: {
      title: 'Test Site',
      description: 'Test description',
      colors: {
        primary: '#000000',
        secondary: '#111111',
        accent: '#222222',
        bg: '#ffffff',
        text: '#111111',
      },
      fonts: {
        headingFont: 'Arial',
        bodyFont: 'Arial',
      },
    },
  });
  await vfs.addFile('index.html', baseHtml);
  await vfs.addFile('styles.css', baseCss);
  return vfs;
}

function buildWorkItem(overrides?: Partial<WorkItem>): WorkItem {
  return {
    id: 'atom-1',
    sessionId: 'session-1',
    title: 'Update services section',
    description: 'Refresh the services section copy.',
    effort: 'S',
    status: 'on_deck',
    order: 1,
    dependencies: [],
    rationale: 'User request',
    createdAt: 0,
    atomType: 'content',
    filesTouch: ['index.html', 'styles.css'],
    estimatedLines: 40,
    visibleChange: 'Services section shows updated copy.',
    ...overrides,
  };
}

function buildConversation(count: number): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < count; i += 1) {
    messages.push({
      id: `m-${i}`,
      sessionId: 'session-1',
      timestamp: i,
      sender: i % 2 === 0 ? 'user' : 'chat_ai',
      content: `Message ${i} ${'x'.repeat(80)}`,
    });
  }
  return messages;
}

describe('ContextManager', () => {
  it('should include all fixed-priority items within budget', async () => {
    const manager = buildManager({ builder: { maxTokens: 2000 } });
    const vfs = await buildVfs();
    const context = manager.assembleBuildContext(buildWorkItem(), vfs, []);

    expect(context.systemPrompt).toContain('Builder system');
    expect(context.siteManifestJson).toContain('pages');
    expect(context.workItemJson).toContain('services');
    expect(context.patchFormat).toContain('Patch format');
    expect(context.cssVariables).toContain(':root');
  });

  it('should include affected sections in builder context', async () => {
    const manager = buildManager();
    const vfs = await buildVfs();
    const context = manager.assembleBuildContext(buildWorkItem(), vfs, []);

    const affectedNames = context.affectedSections.map((section) => section.name);
    expect(affectedNames).toContain('services');
    expect(
      context.affectedSections.some((section) =>
        section.content.includes('data-pp-section="services"'),
      ),
    ).toBe(true);
  });

  it('should exclude unrelated sections from context', async () => {
    const manager = buildManager();
    const vfs = new VirtualFileSystem({
      metadata: {
        title: 'Test Site',
        description: 'Test description',
        colors: {
          primary: '#000000',
          secondary: '#111111',
          accent: '#222222',
          bg: '#ffffff',
          text: '#111111',
        },
        fonts: {
          headingFont: 'Arial',
          bodyFont: 'Arial',
        },
      },
    });
    const html = `<!doctype html>
<html lang="en">
<head><title>Test</title></head>
<body>
  <!-- PP:SECTION:hero -->
  <section class="hero" data-pp-section="hero">Hero content</section>
  <!-- /PP:SECTION:hero -->
  <!-- PP:SECTION:services -->
  <section class="services" data-pp-section="services">Services content</section>
  <!-- /PP:SECTION:services -->
  <!-- PP:SECTION:testimonials -->
  <section class="testimonials" data-pp-section="testimonials">Testimonials content</section>
  <!-- /PP:SECTION:testimonials -->
  <!-- PP:SECTION:footer -->
  <footer class="footer" data-pp-section="footer">Footer content</footer>
  <!-- /PP:SECTION:footer -->
</body>
</html>`;
    await vfs.addFile('index.html', html);
    await vfs.addFile('styles.css', baseCss);

    const context = manager.assembleBuildContext(buildWorkItem(), vfs, []);
    const affectedNames = context.affectedSections.map((section) => section.name);
    const adjacentNames = context.adjacentSections.map((section) => section.name);

    expect(affectedNames).toEqual(['services']);
    expect(adjacentNames).toContain('hero');
    expect(adjacentNames).toContain('testimonials');
    expect(adjacentNames).not.toContain('footer');
  });

  it('should trim conversation when budget is tight', async () => {
    const manager = buildManager({ builder: { maxTokens: 400 } });
    const vfs = await buildVfs();
    const conversation = buildConversation(8);
    const context = manager.assembleBuildContext(buildWorkItem(), vfs, conversation);

    expect(context.conversation.length).toBeLessThan(conversation.length);
  });

  it('should keep first message when trimming conversation', async () => {
    const manager = buildManager({ builder: { maxTokens: 400 } });
    const vfs = await buildVfs();
    const conversation = buildConversation(6);
    const context = manager.assembleBuildContext(buildWorkItem(), vfs, conversation);

    expect(context.conversation[0].id).toBe(conversation[0].id);
  });

  it('should insert summary placeholder for trimmed messages', async () => {
    const manager = buildManager({ builder: { maxTokens: 400 } });
    const vfs = await buildVfs();
    const conversation = buildConversation(7);
    const context = manager.assembleBuildContext(buildWorkItem(), vfs, conversation);

    const hasSummary = context.conversation.some(
      (message) =>
        message.sender === 'system' &&
        message.content.includes('earlier messages summarized'),
    );
    expect(hasSummary).toBe(true);
  });

  it('should fall back to signatures for adjacent sections when tight', async () => {
    const manager = buildManager({
      builder: { maxTokens: 500 },
      thresholds: { tight: 0.99 },
    });
    const vfs = await buildVfs();
    const context = manager.assembleBuildContext(buildWorkItem(), vfs, []);

    expect(context.adjacentSections.length).toBeGreaterThan(0);
    expect(context.adjacentSections.every((section) => section.detail === 'signature')).toBe(true);
  });

  it('should report correct utilization percentage', async () => {
    const manager = buildManager({ builder: { maxTokens: 1200 } });
    const vfs = await buildVfs();
    const context = manager.assembleBuildContext(buildWorkItem(), vfs, []);
    const utilization = manager.getUtilization();

    const expectedUsed =
      context.budget.systemPrompt +
      context.budget.siteManifest +
      context.budget.affectedSections +
      context.budget.adjacentContext +
      context.budget.workItem +
      context.budget.patchFormat +
      context.budget.cssVariables +
      context.budget.conversationHistory;

    expect(utilization.used).toBe(expectedUsed);
    expect(utilization.percent).toBeCloseTo(
      (expectedUsed / utilization.available) * 100,
      4,
    );
  });

  it('should handle empty conversation gracefully', async () => {
    const manager = buildManager();
    const vfs = await buildVfs();
    const context = manager.assembleBuildContext(buildWorkItem(), vfs, []);

    expect(context.conversation).toHaveLength(0);
  });

  it('should enter minimal context mode when constrained', async () => {
    const manager = buildManager({ builder: { maxTokens: 120, reservedForOutput: 80 } });
    const vfs = await buildVfs();
    const context = manager.assembleBuildContext(buildWorkItem(), vfs, buildConversation(3));

    expect(context.mode).toBe('minimal');
  });
});
