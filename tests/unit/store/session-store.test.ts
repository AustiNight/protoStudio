import { beforeEach, describe, expect, it } from 'vitest';

import { useBacklogStore } from '../../../src/store/backlog-store';
import { useBuildStore } from '../../../src/store/build-store';
import { useChatStore } from '../../../src/store/chat-store';
import { useSessionStore } from '../../../src/store/session-store';
import { useTelemetryStore } from '../../../src/store/telemetry-store';
import type { ChatMessage } from '../../../src/types/chat';
import type { WorkItem } from '../../../src/types/backlog';
import type { Session, LLMConfig, LLMProvider, LLMModelSelection } from '../../../src/types/session';
import type { TelemetryEvent } from '../../../src/types/telemetry';

function resetAllStores(): void {
  useChatStore.getState().resetStore();
  useBacklogStore.getState().resetStore();
  useBuildStore.getState().resetStore();
  useTelemetryStore.getState().resetStore();
  useSessionStore.getState().resetStore();
}

function buildLLMConfig(): LLMConfig {
  const provider: LLMProvider = {
    name: 'openai',
    apiKey: 'sk-test',
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

function buildMessage(): ChatMessage {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    timestamp: Date.now(),
    sender: 'user',
    content: 'Hello',
  };
}

function buildWorkItem(): WorkItem {
  return {
    id: 'item-1',
    sessionId: 'session-1',
    title: 'Update hero copy',
    description: 'Adjust headline',
    effort: 'S',
    status: 'backlog',
    order: 1,
    dependencies: [],
    rationale: 'Improve clarity',
    createdAt: Date.now(),
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 8,
    visibleChange: 'Hero headline updated',
  };
}

function buildTelemetryEvent(): TelemetryEvent {
  return {
    timestamp: Date.now(),
    sessionId: 'session-1',
    event: 'session.message',
    data: {
      role: 'user',
      charCount: 5,
    },
  };
}

describe('session-store', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('should create a session and set active', () => {
    const session = buildSession();

    useSessionStore.getState().createSession(session);

    const stored = useSessionStore.getState().session;
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(session.id);
    expect(stored?.status).toBe('active');
  });

  it('should reset session and clear related stores', () => {
    const session = buildSession();
    useSessionStore.getState().createSession(session);
    useChatStore.getState().addMessage(buildMessage());
    useBacklogStore.getState().addItem(buildWorkItem());
    useBuildStore.getState().setPhase('awaiting_llm');
    useBuildStore.getState().pauseBuild();
    useTelemetryStore.setState({
      sessionId: 'session-1',
      events: [buildTelemetryEvent()],
    });

    useSessionStore.getState().resetSession();

    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().archivedSessions).toHaveLength(0);
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useBacklogStore.getState().items).toHaveLength(0);
    expect(useBuildStore.getState().buildState.phase).toBe('idle');
    expect(useBuildStore.getState().isPaused).toBe(false);
    expect(useTelemetryStore.getState().events).toHaveLength(0);
  });

  it('should prevent opening a second active session', () => {
    const session = buildSession();
    const secondSession: Session = {
      ...session,
      id: 'session-2',
    };

    useSessionStore.getState().createSession(session);
    useSessionStore.getState().createSession(secondSession);

    const stored = useSessionStore.getState().session;
    expect(stored?.id).toBe(session.id);
    expect(useSessionStore.getState().archivedSessions).toHaveLength(0);
  });
});
