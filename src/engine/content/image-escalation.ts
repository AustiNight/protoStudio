export type ImageryEscalationMode = 'balanced' | 'aggressive';

export interface ImageryEscalationDecision {
  hasVisualIntent: boolean;
  shouldEscalate: boolean;
  confidence: number;
  reasons: string[];
}

const VISUAL_KEYWORDS = [
  'logo',
  'icon',
  'iconography',
  'illustration',
  'artwork',
  'photo',
  'photography',
  'image',
  'imagery',
  'background image',
  'pattern',
  'texture',
  'hero image',
  'brand mark',
  'mascot',
  'poster',
];

const STRONG_ESCALATION_KEYWORDS = [
  'photorealistic',
  'realistic',
  'cinematic',
  'watercolor',
  'oil painting',
  '3d render',
  'high fidelity',
  'detailed illustration',
  'concept art',
  'brand logo',
  'logo exploration',
];

const SVG_FRIENDLY_KEYWORDS = ['simple icon', 'flat icon', 'basic logo', 'svg'];

export function assessImageryEscalation(
  request: string,
  mode: ImageryEscalationMode = 'balanced',
): ImageryEscalationDecision {
  const normalized = request.trim().toLowerCase();
  if (!normalized) {
    return {
      hasVisualIntent: false,
      shouldEscalate: false,
      confidence: 0,
      reasons: [],
    };
  }

  const reasons: string[] = [];
  const hasVisualIntent = VISUAL_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (hasVisualIntent) {
    reasons.push('visual_intent_detected');
  }

  const strongSignal = STRONG_ESCALATION_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
  if (strongSignal) {
    reasons.push('high_fidelity_visual_requested');
  }

  const svgFriendly = SVG_FRIENDLY_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
  if (svgFriendly) {
    reasons.push('svg_friendly_request');
  }

  const confidence = strongSignal ? 0.95 : hasVisualIntent ? 0.72 : 0.1;
  const shouldEscalate =
    mode === 'aggressive'
      ? hasVisualIntent && !svgFriendly
      : strongSignal || (hasVisualIntent && !svgFriendly && confidence >= 0.7);

  return {
    hasVisualIntent,
    shouldEscalate,
    confidence,
    reasons,
  };
}
