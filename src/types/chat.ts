/**
 * Sender types for chat messages.
 */
export type MessageSender = 'user' | 'chat_ai' | 'system';

/**
 * Optional metadata attached to a chat message.
 */
export interface ChatMessageMetadata {
  /**
   * Total tokens used for the message's associated LLM call.
   */
  tokensUsed?: number;
  /**
   * Cost attributed to the message's associated LLM call.
   */
  cost?: number;
  /**
   * Related backlog item id, if any.
   */
  backlogItemId?: string;
}

/**
 * A single chat message in the conversation timeline.
 */
export interface ChatMessage {
  /**
   * Unique message identifier.
   */
  id: string;
  /**
   * Associated session identifier.
   */
  sessionId: string;
  /**
   * Unix timestamp (ms) when the message was created.
   */
  timestamp: number;
  /**
   * Sender of the message.
   */
  sender: MessageSender;
  /**
   * Message text content.
   */
  content: string;
  /**
   * Optional message metadata.
   */
  metadata?: ChatMessageMetadata;
}
