import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../../../src/types/chat';
import { groupChatMessages } from '../../../src/utils/chatGrouping';

const sessionId = 'session-1';

function buildMessage(
  id: string,
  timestamp: number,
  sender: ChatMessage['sender'],
  content: string,
): ChatMessage {
  return {
    id,
    sessionId,
    timestamp,
    sender,
    content,
  };
}

describe('groupChatMessages', () => {
  it('groups consecutive messages from the same sender inside the window', () => {
    const base = 1_000_000;
    const messages: ChatMessage[] = [
      buildMessage('m1', base, 'user', 'First'),
      buildMessage('m2', base + 30_000, 'user', 'Second'),
      buildMessage('m3', base + 70_000, 'chat_ai', 'Third'),
      buildMessage('m4', base + 110_000, 'chat_ai', 'Fourth'),
    ];

    const grouped = groupChatMessages(messages, { windowMs: 90_000 });

    expect(grouped.map((entry) => entry.position)).toEqual([
      'start',
      'end',
      'start',
      'end',
    ]);
    expect(grouped.map((entry) => entry.showHeader)).toEqual([true, false, true, false]);
  });

  it('breaks groups across time gaps and system notices', () => {
    const base = 2_000_000;
    const messages: ChatMessage[] = [
      buildMessage('m1', base, 'user', 'Hello'),
      buildMessage('m2', base + 200_000, 'user', 'Later message'),
      buildMessage('m3', base + 230_000, 'system', 'System update'),
      buildMessage('m4', base + 240_000, 'user', 'After system'),
      buildMessage('m5', base + 245_000, 'system', 'Another notice'),
    ];

    const grouped = groupChatMessages(messages, { windowMs: 120_000 });

    expect(grouped.map((entry) => entry.position)).toEqual([
      'single',
      'single',
      'single',
      'single',
      'single',
    ]);
    expect(grouped.map((entry) => entry.showHeader)).toEqual([true, true, true, true, true]);
  });
});
