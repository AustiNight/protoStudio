import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';

import { VirtualFileSystem } from '../../../src/engine/vfs/vfs';
import { SessionCheckpoint } from '../../../src/persistence/checkpoint';
import {
  resetStudioDbForTests,
  STUDIO_DB_NAME,
} from '../../../src/persistence/db';
import type { BuildState } from '../../../src/types/build';
import type { ChatMessage } from '../../../src/types/chat';
import type {
  LLMConfig,
  LLMModelSelection,
  LLMProvider,
  Session,
  StudioState,
} from '../../../src/types/session';
import type { VfsMetadata } from '../../../src/types/vfs';
import type { WorkItem } from '../../../src/types/backlog';

const baseMetadata: VfsMetadata = {
  title: 'Checkpoint Site',
  description: 'Testing persistence',
  colors: {
    primary: '#111111',
    secondary: '#222222',
    accent: '#333333',
    bg: '#ffffff',
    text: '#000000',
  },
  fonts: {
    headingFont: 'Inter',
    bodyFont: 'Inter',
  },
};

function buildMetadata(): VfsMetadata {
  return {
    title: baseMetadata.title,
    description: baseMetadata.description,
    colors: { ...baseMetadata.colors },
    fonts: { ...baseMetadata.fonts },
  };
}

function buildLLMConfig(): LLMConfig {
  const provider: LLMProvider = {
    name: 'openai',
    apiKey: 'sk-test-123',
    models: ['gpt-4o-mini'],
  };
  const selection: LLMModelSelection = {
    provider,
    model: 'gpt-4o-mini',
  };
  return {
    chatModel: selection,
    builderModel: selection,
  };
}

function buildSession(): Session {
  return {
    id: 'session-1',
    createdAt: Date.now(),
    path: 'template',
    templateId: 'marketing',
    status: 'active',
    llmConfig: buildLLMConfig(),
    totalCost: 0,
  };
}

function buildWorkItem(sessionId: string, status: WorkItem['status']): WorkItem {
  return {
    id: `item-${status}`,
    sessionId,
    title: 'Update hero copy',
    description: 'Adjust headline and subcopy.',
    effort: 'S',
    status,
    order: 1,
    dependencies: [],
    rationale: 'Improve clarity.',
    createdAt: Date.now(),
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 12,
    visibleChange: 'Hero headline updated',
  };
}

function buildConversation(sessionId: string, count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `msg-${index + 1}`,
    sessionId,
    timestamp: Date.now() + index,
    sender: 'user',
    content: `Message ${index + 1}`,
  }));
}

async function buildVfs(): Promise<VirtualFileSystem> {
  const vfs = new VirtualFileSystem({ metadata: buildMetadata(), version: 3 });
  await vfs.addFile('index.html', '<html></html>');
  return vfs;
}

function buildBuildState(): BuildState {
  return {
    phase: 'idle',
    currentAtom: null,
    startedAt: 0,
    phaseStartedAt: 0,
    retryCount: 0,
    lastError: null,
  };
}

async function buildStudioState(messageCount = 5): Promise<StudioState> {
  const session = buildSession();
  const conversation = buildConversation(session.id, messageCount);
  const backlog = [
    buildWorkItem(session.id, 'backlog'),
    buildWorkItem(session.id, 'done'),
  ];
  const vfs = await buildVfs();
  const llmConfig = session.llmConfig;

  return {
    session,
    conversation,
    backlog,
    vfs,
    buildState: buildBuildState(),
    deployments: [],
    telemetry: [],
    llmConfig,
  };
}

describe('SessionCheckpoint', () => {
  beforeEach(async () => {
    resetStudioDbForTests();
    await deleteDB(STUDIO_DB_NAME);
  });

  it('should save and load a checkpoint', async () => {
    const checkpoint = new SessionCheckpoint();
    const state = await buildStudioState(25);

    const saveResult = await checkpoint.save(state);
    expect(saveResult.ok).toBe(true);
    if (!saveResult.ok) {
      return;
    }

    const loadResult = await checkpoint.load();
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok || !loadResult.value) {
      return;
    }

    const loaded = loadResult.value;
    expect(loaded.session.id).toBe(state.session?.id);
    expect(loaded.vfs.version).toBe(state.vfs?.version);
    expect(loaded.backlog.length).toBe(state.backlog.length);
    expect(loaded.conversation.length).toBe(20);
    expect(loaded.conversation[0].id).toBe('msg-6');
    expect(loaded.conversation[19].id).toBe('msg-25');
  });

  it('should return null when no checkpoint exists', async () => {
    const checkpoint = new SessionCheckpoint();
    const loadResult = await checkpoint.load();

    expect(loadResult.ok).toBe(true);
    expect(loadResult.ok && loadResult.value).toBeNull();
  });

  it('should detect a recoverable session', async () => {
    const checkpoint = new SessionCheckpoint();
    const state = await buildStudioState(3);

    const saveResult = await checkpoint.save(state);
    expect(saveResult.ok).toBe(true);
    if (!saveResult.ok) {
      return;
    }

    const detectResult = await checkpoint.detectRecovery();
    expect(detectResult.ok).toBe(true);
    if (!detectResult.ok || !detectResult.value) {
      return;
    }

    expect(detectResult.value.sessionId).toBe(state.session?.id);
    expect(detectResult.value.vfsVersion).toBe(state.vfs?.version);
    expect(detectResult.value.backlogRemaining).toBe(1);
  });

  it('should clear checkpoint data', async () => {
    const checkpoint = new SessionCheckpoint();
    const state = await buildStudioState(10);

    const saveResult = await checkpoint.save(state);
    expect(saveResult.ok).toBe(true);
    if (!saveResult.ok) {
      return;
    }

    const clearResult = await checkpoint.clear();
    expect(clearResult.ok).toBe(true);
    if (!clearResult.ok) {
      return;
    }

    const loadResult = await checkpoint.load();
    expect(loadResult.ok).toBe(true);
    expect(loadResult.ok && loadResult.value).toBeNull();
  });
});
