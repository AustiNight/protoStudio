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

/**
 * Classifier routing options for the first user message.
 */
export type ClassificationPath = 'template' | 'scratch';

/**
 * Suggested customization fields parsed from the first message.
 */
export interface ClassificationCustomization {
  /**
   * Suggested site title.
   */
  title?: string;
  /**
   * Suggested slogan or subtitle.
   */
  slogan?: string;
  /**
   * Suggested primary brand color.
   */
  primaryColor?: string;
  /**
   * Suggested industry label.
   */
  industry?: string;
}

/**
 * Classification result produced by the first-message classifier.
 */
export interface ClassificationResult {
  /**
   * Template or scratch routing decision.
   */
  path: ClassificationPath;
  /**
   * Selected template id when path is template.
   */
  templateId?: string;
  /**
   * Confidence score from 0.0 to 1.0.
   */
  confidence: number;
  /**
   * One-sentence rationale for the decision.
   */
  reasoning: string;
  /**
   * Optional clarifying question when confidence is low.
   */
  question?: string;
  /**
   * Optional suggested customization fields.
   */
  suggestedCustomization?: ClassificationCustomization;
}
