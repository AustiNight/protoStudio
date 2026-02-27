import type { ChatMessage } from '@/types/chat';

export type GroupPosition = 'single' | 'start' | 'middle' | 'end';

export interface GroupedChatMessage {
  message: ChatMessage;
  position: GroupPosition;
  showHeader: boolean;
}

export interface ChatGroupingOptions {
  windowMs?: number;
}

const DEFAULT_WINDOW_MS = 2 * 60 * 1000;

function isGroupable(message: ChatMessage): boolean {
  return message.sender !== 'system';
}

function canGroup(previous: ChatMessage | undefined, current: ChatMessage, windowMs: number): boolean {
  if (!previous) return false;
  if (!isGroupable(previous) || !isGroupable(current)) return false;
  if (previous.sender !== current.sender) return false;
  const delta = Math.abs(current.timestamp - previous.timestamp);
  return delta <= windowMs;
}

export function groupChatMessages(
  messages: ChatMessage[],
  options: ChatGroupingOptions = {},
): GroupedChatMessage[] {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const sameAsPrevious = canGroup(previous, message, windowMs);
    const sameAsNext = next ? canGroup(message, next, windowMs) : false;

    let position: GroupPosition;
    if (!sameAsPrevious && !sameAsNext) {
      position = 'single';
    } else if (!sameAsPrevious && sameAsNext) {
      position = 'start';
    } else if (sameAsPrevious && sameAsNext) {
      position = 'middle';
    } else {
      position = 'end';
    }

    return {
      message,
      position,
      showHeader: !sameAsPrevious,
    };
  });
}
