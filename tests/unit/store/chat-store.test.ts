import { beforeEach, describe, expect, it } from 'vitest';

import { useChatStore } from '../../../src/store/chat-store';
import type { ChatMessage } from '../../../src/types/chat';

function buildMessage(id: string, timestamp: number): ChatMessage {
  return {
    id,
    sessionId: 'session-1',
    timestamp,
    sender: 'user',
    content: `Message ${id}`,
  };
}

describe('chat-store', () => {
  beforeEach(() => {
    useChatStore.getState().resetStore();
  });

  it('should add messages to chat store in order', () => {
    const first = buildMessage('msg-1', 1);
    const second = buildMessage('msg-2', 2);

    useChatStore.getState().addMessage(first);
    useChatStore.getState().addMessage(second);

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]?.id).toBe('msg-1');
    expect(messages[1]?.id).toBe('msg-2');
  });
});
