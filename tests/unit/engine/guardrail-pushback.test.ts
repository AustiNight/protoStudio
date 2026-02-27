import { describe, expect, it } from 'vitest';

import { decideGuardrailPushback } from '../../../src/engine/chat/guardrail-pushback';
import type { ChatMessage, GuardrailChatMetadata } from '../../../src/types/chat';

function buildMessage(
  id: string,
  content: string,
  guardrail?: GuardrailChatMetadata,
): ChatMessage {
  return {
    id,
    sessionId: 'session-1',
    timestamp: 1_700_000_000_000,
    sender: 'chat_ai',
    content,
    metadata: guardrail ? { guardrail } : undefined,
  };
}

describe('guardrail pushback', () => {
  it('should push back twice and then comply with a caveat', () => {
    const input = {
      guardrailId: 'ux_autoplay',
      request: 'autoplay the hero video on load',
      reason: 'autoplay video can be intrusive and harms accessibility',
      alternative: 'Use a click-to-play hero video instead',
      caveat: 'autoplay is often blocked and can frustrate visitors',
    };

    const conversation: ChatMessage[] = [];

    const first = decideGuardrailPushback(input, conversation);
    expect(first.action).toBe('pushback');
    expect(first.guardrail.attempt).toBe(1);
    expect(first.message).toContain(input.reason);
    expect(first.message).toContain(input.alternative);

    conversation.push(buildMessage('msg-1', first.message, first.guardrail));

    const second = decideGuardrailPushback(input, conversation);
    expect(second.action).toBe('pushback');
    expect(second.guardrail.attempt).toBe(2);
    expect(second.message).toContain(input.alternative);

    conversation.push(buildMessage('msg-2', second.message, second.guardrail));

    const third = decideGuardrailPushback(input, conversation);
    expect(third.action).toBe('comply');
    expect(third.guardrail.attempt).toBe(3);
    expect(third.message).toContain('Built as requested');
    expect(third.message).toContain(input.caveat);
  });
});
