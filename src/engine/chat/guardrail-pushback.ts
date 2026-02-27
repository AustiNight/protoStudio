import type { ChatMessage, GuardrailChatAction, GuardrailChatMetadata } from '../../types/chat';

export interface GuardrailPushbackInput {
  guardrailId: string;
  request: string;
  reason?: string;
  alternative?: string;
  caveat?: string;
}

export interface GuardrailPushbackDecision {
  action: GuardrailChatAction;
  message: string;
  guardrail: GuardrailChatMetadata;
}

const MAX_PUSHBACKS = 2;
const FALLBACK_REASON = 'it conflicts with our quality and accessibility guardrails';
const FALLBACK_ALTERNATIVE = 'We can use a safer pattern that preserves the intent';
const FALLBACK_CAVEAT = 'This approach can hurt accessibility and performance';

export function decideGuardrailPushback(
  input: GuardrailPushbackInput,
  conversation: ChatMessage[],
): GuardrailPushbackDecision {
  const guardrailId = normalizeGuardrailId(input.guardrailId);
  const previousPushbacks = countPushbacks(conversation, guardrailId);
  const attempt = previousPushbacks + 1;

  if (previousPushbacks < MAX_PUSHBACKS) {
    const message =
      previousPushbacks === 0
        ? buildFirstPushbackMessage(input)
        : buildSecondPushbackMessage(input);

    return {
      action: 'pushback',
      message,
      guardrail: {
        id: guardrailId,
        action: 'pushback',
        attempt,
      },
    };
  }

  const message = buildComplianceMessage(input);

  return {
    action: 'comply',
    message,
    guardrail: {
      id: guardrailId,
      action: 'comply',
      attempt,
    },
  };
}

function countPushbacks(conversation: ChatMessage[], guardrailId: string): number {
  return conversation.filter((message) => {
    if (message.sender !== 'chat_ai') {
      return false;
    }
    const meta = message.metadata?.guardrail;
    if (!meta) {
      return false;
    }
    return meta.id === guardrailId && meta.action === 'pushback';
  }).length;
}

function buildFirstPushbackMessage(input: GuardrailPushbackInput): string {
  const request = formatRequest(input.request);
  const reason = formatReason(input.reason);
  const alternative = formatAlternative(input.alternative);
  const requestLine = request ? `Got it — you want ${request}. ` : 'Got it. ';

  return (
    `${requestLine}I wouldn't recommend that because ${reason}. ` +
    `A safer option is: ${alternative} Want me to do that instead?`
  );
}

function buildSecondPushbackMessage(input: GuardrailPushbackInput): string {
  const request = formatRequest(input.request);
  const reason = formatReason(input.reason);
  const alternative = formatAlternative(input.alternative);
  const requestLine = request ? `If you still want ${request}, ` : 'If you still want this, ';

  return (
    `Understood. Just to be clear, ${reason}. ` +
    `I'd still recommend: ${alternative} ` +
    `${requestLine}I can proceed.`
  );
}

function buildComplianceMessage(input: GuardrailPushbackInput): string {
  const caveat = formatCaveat(input.caveat, input.reason);
  return `Built as requested — here's what I'd watch out for: ${caveat}.`;
}

function formatRequest(value: string): string {
  return stripTrailingPunctuation(normalizeSentence(value));
}

function formatReason(value?: string): string {
  const normalized = normalizeSentence(value) || FALLBACK_REASON;
  return stripTrailingPunctuation(normalized);
}

function formatAlternative(value?: string): string {
  const normalized = normalizeSentence(value) || FALLBACK_ALTERNATIVE;
  return ensureSentence(normalized);
}

function formatCaveat(value?: string, fallbackReason?: string): string {
  const normalized =
    normalizeSentence(value) ||
    stripTrailingPunctuation(normalizeSentence(fallbackReason)) ||
    FALLBACK_CAVEAT;
  return stripTrailingPunctuation(normalized);
}

function normalizeGuardrailId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'guardrail_unknown';
}

function normalizeSentence(value?: string): string {
  if (!value) {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim();
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.!?]+$/, '');
}

function ensureSentence(value: string): string {
  const trimmed = stripTrailingPunctuation(value);
  if (!trimmed) {
    return `${FALLBACK_ALTERNATIVE}.`;
  }
  return `${trimmed}.`;
}
