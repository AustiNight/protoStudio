/**
 * Supported error categories for Result-based error handling.
 */
export type ErrorCategory = 'retryable' | 'user_action' | 'fatal';

/**
 * Structured error object for engine and store operations.
 */
export interface AppError {
  /**
   * Error category used to decide whether to retry or surface to the user.
   */
  category: ErrorCategory;
  /**
   * Human-readable error message for logs or UI display.
   */
  message: string;
  /**
   * Optional machine-readable error code.
   */
  code?: string;
  /**
   * Optional structured details for debugging and telemetry.
   * Shape is intentionally open-ended to support varied error contexts.
   */
  details?: Record<string, unknown>;
}

/**
 * Success result shape for Result<T, E>.
 */
export interface OkResult<T> {
  /**
   * Discriminator indicating a successful result.
   */
  ok: true;
  /**
   * Successful value.
   */
  value: T;
}

/**
 * Error result shape for Result<T, E>.
 */
export interface ErrResult<E> {
  /**
   * Discriminator indicating a failed result.
   */
  ok: false;
  /**
   * Error payload describing the failure.
   */
  error: E;
}

/**
 * Result type used across engine boundaries instead of throwing.
 */
export type Result<T, E = AppError> = OkResult<T> | ErrResult<E>;
