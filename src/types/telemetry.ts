/**
 * Telemetry event captured locally for analytics and debugging.
 * No PII should be stored in telemetry events.
 */
export type TelemetrySessionPath = 'template' | 'scratch';
export type TelemetryMessageRole = 'user' | 'assistant';
export type TelemetryLLMRole = 'chat' | 'builder' | 'critic';
export type TelemetryProviderName = 'openai' | 'anthropic' | 'google';
export type TelemetryDeployHost = 'github_pages' | 'cloudflare_pages' | 'netlify' | 'vercel';
export type TelemetryBuildStatus = 'success' | 'failed';
export type TelemetryBuildErrorCategory =
  | 'guardrail'
  | 'llm'
  | 'patch'
  | 'timeout'
  | 'unknown';
export type TelemetryDeployStatus = 'live' | 'failed';
export type TelemetryDeployErrorReason =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'unknown';
export type TelemetryTemplateInvalidationReason =
  | 'user_change'
  | 'guardrail'
  | 'builder'
  | 'unknown';
export type TelemetryLLMErrorCode =
  | 'rate_limit'
  | 'auth'
  | 'timeout'
  | 'provider_error'
  | 'invalid_response';
export type TelemetrySwapSlot = 'blue' | 'green';

export interface TelemetryEventDataMap {
  'session.start': {
    path: TelemetrySessionPath;
    templateId?: string;
  };
  'session.end': {
    durationMs: number;
    messageCount: number;
    backlogCount: number;
    buildCount: number;
    deployCount: number;
  };
  'session.message': {
    role: TelemetryMessageRole;
    charCount: number;
  };
  'session.backlog': {
    itemCount: number;
  };
  'build.start': {
    workItemId?: string;
    attempt?: number;
  };
  'build.preview': {
    durationMs: number;
  };
  'build.complete': {
    durationMs: number;
    status: TelemetryBuildStatus;
    errorCategory?: TelemetryBuildErrorCategory;
  };
  'build.swap': {
    slot: TelemetrySwapSlot;
  };
  'llm.request': {
    role: TelemetryLLMRole;
    provider: TelemetryProviderName;
    model: string;
    maxTokens?: number;
    temperature?: number;
    reasoningEffort?: string;
    estimatedPromptTokens?: number;
    estimatedPromptChars?: number;
    estimatedMessageCount?: number;
  };
  'llm.response': {
    role: TelemetryLLMRole;
    provider: TelemetryProviderName;
    model: string;
    promptTokens: number;
    completionTokens: number;
    cost: number;
    latencyMs: number;
    unknownModel: boolean;
  };
  'llm.error': {
    role: TelemetryLLMRole;
    provider: TelemetryProviderName;
    code: TelemetryLLMErrorCode;
    status?: number;
    latencyMs?: number;
  };
  'deploy.start': {
    host: TelemetryDeployHost;
  };
  'deploy.complete': {
    host: TelemetryDeployHost;
    status: TelemetryDeployStatus;
    durationMs: number;
    siteSize: number;
    fileCount: number;
  };
  'deploy.error': {
    host: TelemetryDeployHost;
    reason: TelemetryDeployErrorReason;
  };
  'template.selected': {
    templateId: string;
    path: TelemetrySessionPath;
  };
  'template.invalidated': {
    templateId: string;
    reason: TelemetryTemplateInvalidationReason;
  };
}

export type TelemetryEventName = keyof TelemetryEventDataMap;

export interface TelemetryEventRecord<E extends TelemetryEventName = TelemetryEventName> {
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
  event: E;
  /**
   * Structured payload for the event.
   */
  data: TelemetryEventDataMap[E];
}

export type TelemetryEvent = {
  [E in TelemetryEventName]: TelemetryEventRecord<E>;
}[TelemetryEventName];

/**
 * Export bundle for telemetry downloads.
 */
export interface TelemetryExportBundle {
  /**
   * Session identifier associated with the export.
   */
  sessionId: string;
  /**
   * Unix timestamp (ms) when the bundle was generated.
   */
  exportedAt: number;
  /**
   * Total number of events in the bundle.
   */
  eventCount: number;
  /**
   * Telemetry events captured for the session.
   */
  events: TelemetryEvent[];
}

export type TelemetryValidationCode =
  | 'invalid_timestamp'
  | 'invalid_session_id'
  | 'invalid_event_data'
  | 'invalid_event_name'
  | 'contains_sensitive_data';

export interface TelemetryValidationError {
  code: TelemetryValidationCode;
  message: string;
}

const SESSION_PATHS = ['template', 'scratch'] as const;
const MESSAGE_ROLES = ['user', 'assistant'] as const;
const LLM_ROLES = ['chat', 'builder', 'critic'] as const;
const LLM_PROVIDERS = ['openai', 'anthropic', 'google'] as const;
const DEPLOY_HOSTS = ['github_pages', 'cloudflare_pages', 'netlify', 'vercel'] as const;
const BUILD_STATUSES = ['success', 'failed'] as const;
const BUILD_ERROR_CATEGORIES = ['guardrail', 'llm', 'patch', 'timeout', 'unknown'] as const;
const DEPLOY_STATUSES = ['live', 'failed'] as const;
const DEPLOY_ERROR_REASONS = ['auth', 'rate_limit', 'network', 'unknown'] as const;
const TEMPLATE_INVALIDATION_REASONS = ['user_change', 'guardrail', 'builder', 'unknown'] as const;
const LLM_ERROR_CODES = [
  'rate_limit',
  'auth',
  'timeout',
  'provider_error',
  'invalid_response',
] as const;

const SAFE_SESSION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const SAFE_MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const SENSITIVE_VALUE_PATTERNS = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i,
] as const;

export function validateTelemetryEvent(event: TelemetryEvent): TelemetryValidationError | null {
  if (!isNonNegativeNumber(event.timestamp)) {
    return invalid('invalid_timestamp', 'Telemetry timestamp must be a non-negative number.');
  }
  if (!isSafeSessionId(event.sessionId)) {
    return invalid('invalid_session_id', 'Telemetry sessionId must be a safe identifier.');
  }
  if (containsSensitiveData(event.data)) {
    return invalid(
      'contains_sensitive_data',
      'Telemetry event data must not include API keys, tokens, or secret values.',
    );
  }

  switch (event.event) {
    case 'session.start':
      return validateSessionStart(event.data);
    case 'session.end':
      return validateSessionEnd(event.data);
    case 'session.message':
      return validateSessionMessage(event.data);
    case 'session.backlog':
      return validateSessionBacklog(event.data);
    case 'build.start':
      return validateBuildStart(event.data);
    case 'build.preview':
      return validateBuildPreview(event.data);
    case 'build.complete':
      return validateBuildComplete(event.data);
    case 'build.swap':
      return validateBuildSwap(event.data);
    case 'llm.request':
      return validateLlmRequest(event.data);
    case 'llm.response':
      return validateLlmResponse(event.data);
    case 'llm.error':
      return validateLlmError(event.data);
    case 'deploy.start':
      return validateDeployStart(event.data);
    case 'deploy.complete':
      return validateDeployComplete(event.data);
    case 'deploy.error':
      return validateDeployError(event.data);
    case 'template.selected':
      return validateTemplateSelected(event.data);
    case 'template.invalidated':
      return validateTemplateInvalidated(event.data);
    default:
      return invalid('invalid_event_name', 'Telemetry event name is invalid.');
  }
}

function validateSessionStart(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('session.start');
  }
  if (!hasOnlyKeys(record, ['path', 'templateId'])) {
    return unexpectedKeys('session.start');
  }
  if (!hasRequiredKeys(record, ['path'])) {
    return missingKeys('session.start');
  }
  if (!isValueInList(record.path, SESSION_PATHS)) {
    return invalidField('session.start', 'path');
  }
  if (hasValue(record, 'templateId') && !isSafeId(record.templateId)) {
    return invalidField('session.start', 'templateId');
  }
  return null;
}

function validateSessionEnd(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('session.end');
  }
  if (!hasOnlyKeys(record, [
    'durationMs',
    'messageCount',
    'backlogCount',
    'buildCount',
    'deployCount',
  ])) {
    return unexpectedKeys('session.end');
  }
  if (!hasRequiredKeys(record, [
    'durationMs',
    'messageCount',
    'backlogCount',
    'buildCount',
    'deployCount',
  ])) {
    return missingKeys('session.end');
  }
  if (!isNonNegativeNumber(record.durationMs)) {
    return invalidField('session.end', 'durationMs');
  }
  if (!isNonNegativeInteger(record.messageCount)) {
    return invalidField('session.end', 'messageCount');
  }
  if (!isNonNegativeInteger(record.backlogCount)) {
    return invalidField('session.end', 'backlogCount');
  }
  if (!isNonNegativeInteger(record.buildCount)) {
    return invalidField('session.end', 'buildCount');
  }
  if (!isNonNegativeInteger(record.deployCount)) {
    return invalidField('session.end', 'deployCount');
  }
  return null;
}

function validateSessionMessage(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('session.message');
  }
  if (!hasOnlyKeys(record, ['role', 'charCount'])) {
    return unexpectedKeys('session.message');
  }
  if (!hasRequiredKeys(record, ['role', 'charCount'])) {
    return missingKeys('session.message');
  }
  if (!isValueInList(record.role, MESSAGE_ROLES)) {
    return invalidField('session.message', 'role');
  }
  if (!isNonNegativeInteger(record.charCount)) {
    return invalidField('session.message', 'charCount');
  }
  return null;
}

function validateSessionBacklog(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('session.backlog');
  }
  if (!hasOnlyKeys(record, ['itemCount'])) {
    return unexpectedKeys('session.backlog');
  }
  if (!hasRequiredKeys(record, ['itemCount'])) {
    return missingKeys('session.backlog');
  }
  if (!isNonNegativeInteger(record.itemCount)) {
    return invalidField('session.backlog', 'itemCount');
  }
  return null;
}

function validateBuildStart(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('build.start');
  }
  if (!hasOnlyKeys(record, ['workItemId', 'attempt'])) {
    return unexpectedKeys('build.start');
  }
  if (hasValue(record, 'workItemId') && !isSafeId(record.workItemId)) {
    return invalidField('build.start', 'workItemId');
  }
  if (hasValue(record, 'attempt') && !isNonNegativeInteger(record.attempt)) {
    return invalidField('build.start', 'attempt');
  }
  return null;
}

function validateBuildPreview(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('build.preview');
  }
  if (!hasOnlyKeys(record, ['durationMs'])) {
    return unexpectedKeys('build.preview');
  }
  if (!hasRequiredKeys(record, ['durationMs'])) {
    return missingKeys('build.preview');
  }
  if (!isNonNegativeNumber(record.durationMs)) {
    return invalidField('build.preview', 'durationMs');
  }
  return null;
}

function validateBuildComplete(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('build.complete');
  }
  if (!hasOnlyKeys(record, ['durationMs', 'status', 'errorCategory'])) {
    return unexpectedKeys('build.complete');
  }
  if (!hasRequiredKeys(record, ['durationMs', 'status'])) {
    return missingKeys('build.complete');
  }
  if (!isNonNegativeNumber(record.durationMs)) {
    return invalidField('build.complete', 'durationMs');
  }
  if (!isValueInList(record.status, BUILD_STATUSES)) {
    return invalidField('build.complete', 'status');
  }
  if (hasValue(record, 'errorCategory') &&
    !isValueInList(record.errorCategory, BUILD_ERROR_CATEGORIES)) {
    return invalidField('build.complete', 'errorCategory');
  }
  return null;
}

function validateBuildSwap(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('build.swap');
  }
  if (!hasOnlyKeys(record, ['slot'])) {
    return unexpectedKeys('build.swap');
  }
  if (!hasRequiredKeys(record, ['slot'])) {
    return missingKeys('build.swap');
  }
  if (!isValueInList(record.slot, ['blue', 'green'])) {
    return invalidField('build.swap', 'slot');
  }
  return null;
}

function validateLlmRequest(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('llm.request');
  }
  if (
    !hasOnlyKeys(record, [
      'role',
      'provider',
      'model',
      'maxTokens',
      'temperature',
      'reasoningEffort',
      'estimatedPromptTokens',
      'estimatedPromptChars',
      'estimatedMessageCount',
    ])
  ) {
    return unexpectedKeys('llm.request');
  }
  if (!hasRequiredKeys(record, ['role', 'provider', 'model'])) {
    return missingKeys('llm.request');
  }
  if (!isValueInList(record.role, LLM_ROLES)) {
    return invalidField('llm.request', 'role');
  }
  if (!isValueInList(record.provider, LLM_PROVIDERS)) {
    return invalidField('llm.request', 'provider');
  }
  if (!isSafeModel(record.model)) {
    return invalidField('llm.request', 'model');
  }
  if (hasValue(record, 'maxTokens') && !isNonNegativeInteger(record.maxTokens)) {
    return invalidField('llm.request', 'maxTokens');
  }
  if (hasValue(record, 'temperature') && !isNumberInRange(record.temperature, 0, 2)) {
    return invalidField('llm.request', 'temperature');
  }
  if (
    hasValue(record, 'reasoningEffort') &&
    !isValueInList(record.reasoningEffort, [
      'default',
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  ) {
    return invalidField('llm.request', 'reasoningEffort');
  }
  if (hasValue(record, 'estimatedPromptTokens') && !isNonNegativeInteger(record.estimatedPromptTokens)) {
    return invalidField('llm.request', 'estimatedPromptTokens');
  }
  if (hasValue(record, 'estimatedPromptChars') && !isNonNegativeInteger(record.estimatedPromptChars)) {
    return invalidField('llm.request', 'estimatedPromptChars');
  }
  if (hasValue(record, 'estimatedMessageCount') && !isNonNegativeInteger(record.estimatedMessageCount)) {
    return invalidField('llm.request', 'estimatedMessageCount');
  }
  return null;
}

function validateLlmResponse(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('llm.response');
  }
  if (!hasOnlyKeys(record, [
    'role',
    'provider',
    'model',
    'promptTokens',
    'completionTokens',
    'cost',
    'latencyMs',
    'unknownModel',
  ])) {
    return unexpectedKeys('llm.response');
  }
  if (!hasRequiredKeys(record, [
    'role',
    'provider',
    'model',
    'promptTokens',
    'completionTokens',
    'cost',
    'latencyMs',
    'unknownModel',
  ])) {
    return missingKeys('llm.response');
  }
  if (!isValueInList(record.role, LLM_ROLES)) {
    return invalidField('llm.response', 'role');
  }
  if (!isValueInList(record.provider, LLM_PROVIDERS)) {
    return invalidField('llm.response', 'provider');
  }
  if (!isSafeModel(record.model)) {
    return invalidField('llm.response', 'model');
  }
  if (!isNonNegativeInteger(record.promptTokens)) {
    return invalidField('llm.response', 'promptTokens');
  }
  if (!isNonNegativeInteger(record.completionTokens)) {
    return invalidField('llm.response', 'completionTokens');
  }
  if (!isNonNegativeNumber(record.cost)) {
    return invalidField('llm.response', 'cost');
  }
  if (!isNonNegativeNumber(record.latencyMs)) {
    return invalidField('llm.response', 'latencyMs');
  }
  if (typeof record.unknownModel !== 'boolean') {
    return invalidField('llm.response', 'unknownModel');
  }
  return null;
}

function validateLlmError(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('llm.error');
  }
  if (!hasOnlyKeys(record, ['role', 'provider', 'code', 'status', 'latencyMs'])) {
    return unexpectedKeys('llm.error');
  }
  if (!hasRequiredKeys(record, ['role', 'provider', 'code'])) {
    return missingKeys('llm.error');
  }
  if (!isValueInList(record.role, LLM_ROLES)) {
    return invalidField('llm.error', 'role');
  }
  if (!isValueInList(record.provider, LLM_PROVIDERS)) {
    return invalidField('llm.error', 'provider');
  }
  if (!isValueInList(record.code, LLM_ERROR_CODES)) {
    return invalidField('llm.error', 'code');
  }
  if (hasValue(record, 'status') && !isNonNegativeInteger(record.status)) {
    return invalidField('llm.error', 'status');
  }
  if (hasValue(record, 'latencyMs') && !isNonNegativeNumber(record.latencyMs)) {
    return invalidField('llm.error', 'latencyMs');
  }
  return null;
}

function validateDeployStart(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('deploy.start');
  }
  if (!hasOnlyKeys(record, ['host'])) {
    return unexpectedKeys('deploy.start');
  }
  if (!hasRequiredKeys(record, ['host'])) {
    return missingKeys('deploy.start');
  }
  if (!isValueInList(record.host, DEPLOY_HOSTS)) {
    return invalidField('deploy.start', 'host');
  }
  return null;
}

function validateDeployComplete(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('deploy.complete');
  }
  if (!hasOnlyKeys(record, ['host', 'status', 'durationMs', 'siteSize', 'fileCount'])) {
    return unexpectedKeys('deploy.complete');
  }
  if (!hasRequiredKeys(record, ['host', 'status', 'durationMs', 'siteSize', 'fileCount'])) {
    return missingKeys('deploy.complete');
  }
  if (!isValueInList(record.host, DEPLOY_HOSTS)) {
    return invalidField('deploy.complete', 'host');
  }
  if (!isValueInList(record.status, DEPLOY_STATUSES)) {
    return invalidField('deploy.complete', 'status');
  }
  if (!isNonNegativeNumber(record.durationMs)) {
    return invalidField('deploy.complete', 'durationMs');
  }
  if (!isNonNegativeNumber(record.siteSize)) {
    return invalidField('deploy.complete', 'siteSize');
  }
  if (!isNonNegativeInteger(record.fileCount)) {
    return invalidField('deploy.complete', 'fileCount');
  }
  return null;
}

function validateDeployError(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('deploy.error');
  }
  if (!hasOnlyKeys(record, ['host', 'reason'])) {
    return unexpectedKeys('deploy.error');
  }
  if (!hasRequiredKeys(record, ['host', 'reason'])) {
    return missingKeys('deploy.error');
  }
  if (!isValueInList(record.host, DEPLOY_HOSTS)) {
    return invalidField('deploy.error', 'host');
  }
  if (!isValueInList(record.reason, DEPLOY_ERROR_REASONS)) {
    return invalidField('deploy.error', 'reason');
  }
  return null;
}

function validateTemplateSelected(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('template.selected');
  }
  if (!hasOnlyKeys(record, ['templateId', 'path'])) {
    return unexpectedKeys('template.selected');
  }
  if (!hasRequiredKeys(record, ['templateId', 'path'])) {
    return missingKeys('template.selected');
  }
  if (!isSafeId(record.templateId)) {
    return invalidField('template.selected', 'templateId');
  }
  if (!isValueInList(record.path, SESSION_PATHS)) {
    return invalidField('template.selected', 'path');
  }
  return null;
}

function validateTemplateInvalidated(data: unknown): TelemetryValidationError | null {
  const record = asRecord(data);
  if (!record) {
    return recordError('template.invalidated');
  }
  if (!hasOnlyKeys(record, ['templateId', 'reason'])) {
    return unexpectedKeys('template.invalidated');
  }
  if (!hasRequiredKeys(record, ['templateId', 'reason'])) {
    return missingKeys('template.invalidated');
  }
  if (!isSafeId(record.templateId)) {
    return invalidField('template.invalidated', 'templateId');
  }
  if (!isValueInList(record.reason, TEMPLATE_INVALIDATION_REASONS)) {
    return invalidField('template.invalidated', 'reason');
  }
  return null;
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!isPlainObject(data)) {
    return null;
  }
  return data as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}

function hasRequiredKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function hasValue(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
}

function isValueInList<T extends string>(
  value: unknown,
  list: readonly T[],
): value is T {
  return typeof value === 'string' && list.includes(value as T);
}

function isSafeSessionId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_SESSION_ID_PATTERN.test(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID_PATTERN.test(value);
}

function isSafeModel(value: unknown): value is string {
  return typeof value === 'string' && SAFE_MODEL_PATTERN.test(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeNumber(value) && Number.isInteger(value);
}

function isNumberInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function containsSensitiveData(value: unknown): boolean {
  if (typeof value === 'string') {
    return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveData(item));
  }
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.values(value).some((item) => containsSensitiveData(item));
}

function invalid(code: TelemetryValidationCode, message: string): TelemetryValidationError {
  return { code, message };
}

function recordError(eventName: string): TelemetryValidationError {
  return invalid('invalid_event_data', `${eventName} data must be an object.`);
}

function unexpectedKeys(eventName: string): TelemetryValidationError {
  return invalid('invalid_event_data', `${eventName} data contains unexpected keys.`);
}

function missingKeys(eventName: string): TelemetryValidationError {
  return invalid('invalid_event_data', `${eventName} data is missing required keys.`);
}

function invalidField(eventName: string, field: string): TelemetryValidationError {
  return invalid('invalid_event_data', `${eventName} field ${field} is invalid.`);
}
