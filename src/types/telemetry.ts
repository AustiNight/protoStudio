/**
 * Telemetry event captured locally for analytics and debugging.
 */
export interface TelemetryEvent {
  /**
   * Unix timestamp (ms) when the event occurred.
   */
  timestamp: number;
  /**
   * Session identifier associated with the event.
   */
  sessionId: string;
  /**
   * Event name or type identifier.
   */
  event: string;
  /**
   * Arbitrary event payload (schema varies by event type).
   * Values are intentionally flexible to support evolving telemetry needs.
   */
  data: Record<string, unknown>;
}
