import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BuildPhase } from '@/types/build';

export type ChlorastroliteVariant = 'gem' | 'eye';
export type ChlorastroliteStage =
  | 'fresh'
  | 'customizing'
  | 'generating'
  | 'validating'
  | 'swapping';

export const CHLORASTROLITE_LABELS: Record<ChlorastroliteStage, string> = {
  fresh:
    "Forging the first preview -- we'll unveil the prototype the instant the gem crystallizes.",
  customizing:
    'Shaping your site from the template -- colors and content are being set...',
  generating: 'The gem is forming -- code is being written...',
  validating: 'Almost there -- polishing the final facets...',
  swapping: 'Crystallized! Unveiling now...',
};

const STAGE_FOR_PHASE: Partial<Record<BuildPhase, ChlorastroliteStage>> = {
  idle: 'fresh',
  assembling_context: 'customizing',
  awaiting_llm: 'generating',
  parsing_patch: 'generating',
  validating_patch: 'validating',
  applying_patch: 'validating',
  rendering_preview: 'validating',
  validating_preview: 'validating',
  swapping: 'swapping',
  retrying: 'generating',
  skipping: 'fresh',
  error: 'fresh',
};

const SESSION_EASTER_EGG_KEY = 'protoStudio.chlorastrolite.eye';
const CLICK_WINDOW_MS = 3000;
const REQUIRED_CLICKS = 7;
const SECRET_KEYWORD = 'margaret';

const fallbackStage: ChlorastroliteStage = 'fresh';

function resolveStage(
  stage: ChlorastroliteStage | undefined,
  phase: BuildPhase | undefined,
): ChlorastroliteStage {
  if (stage) return stage;
  if (phase && STAGE_FOR_PHASE[phase]) {
    return STAGE_FOR_PHASE[phase] ?? fallbackStage;
  }
  return fallbackStage;
}

function isChatInputTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.closest('[data-chat-input="true"]')) return true;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}

function readStoredVariant(): ChlorastroliteVariant | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.sessionStorage.getItem(SESSION_EASTER_EGG_KEY);
    return stored === 'eye' ? 'eye' : null;
  } catch {
    return null;
  }
}

function persistEyeVariant(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_EASTER_EGG_KEY, 'eye');
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

export const ChlorastroliteLoader: React.FC<{
  label?: string;
  variant?: ChlorastroliteVariant;
  stage?: ChlorastroliteStage;
  phase?: BuildPhase;
}> = ({ label, variant = 'gem', stage, phase }) => {
  const [revealedVariant, setRevealedVariant] = useState<ChlorastroliteVariant | null>(
    readStoredVariant,
  );
  const clickTimestamps = useRef<number[]>([]);
  const typedBuffer = useRef('');

  const isEye = (revealedVariant ?? variant) === 'eye';
  const resolvedStage = resolveStage(stage, phase);
  const displayLabel = label ?? CHLORASTROLITE_LABELS[resolvedStage];

  const revealEye = useCallback(() => {
    setRevealedVariant((current) => {
      if (current === 'eye') return current;
      persistEyeVariant();
      return 'eye';
    });
  }, []);

  const handleGemClick = useCallback(() => {
    if (isEye) return;
    const now = Date.now();
    const windowStart = now - CLICK_WINDOW_MS;
    const updated = clickTimestamps.current.filter((stamp) => stamp >= windowStart);
    updated.push(now);
    clickTimestamps.current = updated;
    if (updated.length >= REQUIRED_CLICKS) {
      revealEye();
    }
  }, [isEye, revealEye]);

  useEffect(() => {
    if (isEye) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (!isChatInputTarget(event.target)) return;
      if (event.key === 'Backspace') {
        typedBuffer.current = typedBuffer.current.slice(0, -1);
        return;
      }
      if (event.key.length !== 1) return;

      const key = event.key.toLowerCase();
      if (!/^[a-z]$/.test(key)) return;

      typedBuffer.current = (typedBuffer.current + key).slice(-SECRET_KEYWORD.length);
      if (typedBuffer.current === SECRET_KEYWORD) {
        revealEye();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isEye, revealEye]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center text-slate-400">
      <div className="relative h-60 w-60">
        {isEye ? (
          <svg
            viewBox="-120 -80 240 160"
            className="h-full w-full"
            role="img"
            aria-label="Margaret easter egg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="eyeShell" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="50%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
              <radialGradient id="irisGlow" cx="0.3" cy="0.3" r="0.8">
                <stop offset="0%" stopColor="#67e8f9" />
                <stop offset="45%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#0f766e" />
              </radialGradient>
            </defs>
            <g>
              <path
                d="M-100 0 Q0 -60 100 0 Q0 60 -100 0Z"
                fill="url(#eyeShell)"
                stroke="#2dd4bf"
                strokeWidth="2"
                opacity="0.85"
              />
              <ellipse cx="0" cy="0" rx="70" ry="38" fill="#0f172a" opacity="0.75" />
              <circle cx="0" cy="0" r="28" fill="url(#irisGlow)">
                <animate attributeName="r" values="26;30;26" dur="4.5s" repeatCount="indefinite" />
              </circle>
              <circle cx="0" cy="0" r="12" fill="#020617">
                <animate attributeName="r" values="10;14;10" dur="4.5s" repeatCount="indefinite" />
              </circle>
              <circle cx="8" cy="-8" r="6" fill="#e2e8f0" opacity="0.85" />
              <circle cx="-10" cy="10" r="4" fill="#94a3b8" opacity="0.7" />
            </g>
          </svg>
        ) : (
          <svg
            viewBox="-100 -100 200 200"
            className="pointer-events-auto h-full w-full"
            role="img"
            aria-label="Forging first live preview"
            preserveAspectRatio="xMidYMid meet"
            onClick={handleGemClick}
          >
            <defs>
              <radialGradient id="outerAura" cx="0" cy="0" r="1">
                <stop offset="0%" stopColor="#5eead4" stopOpacity="0.65" />
                <stop offset="55%" stopColor="#22d3ee" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="gemFacet" x1="-0.6" y1="-0.8" x2="0.8" y2="0.9">
                <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
                <stop offset="30%" stopColor="#86efac" stopOpacity="0.85" />
                <stop offset="70%" stopColor="#22d3ee" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#0f766e" stopOpacity="0.9" />
              </linearGradient>
              <radialGradient id="gemCore" cx="0" cy="0" r="1">
                <stop offset="0%" stopColor="#bbf7d0" stopOpacity="0.95" />
                <stop offset="40%" stopColor="#5eead4" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#0b3d3a" stopOpacity="0.9" />
              </radialGradient>
              <linearGradient id="gemHighlight" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                <stop offset="45%" stopColor="rgba(255,255,255,0.75)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
              <mask id="highlightSweep">
                <rect x="-120" y="-120" width="240" height="240" fill="black" />
                <rect x="-80" y="-80" width="160" height="160" fill="url(#gemHighlight)">
                  <animateTransform
                    attributeName="transform"
                    type="translate"
                    from="-80 0"
                    to="80 0"
                    dur="4s"
                    repeatCount="indefinite"
                  />
                </rect>
              </mask>
              <clipPath id="gemClip">
                <circle cx="0" cy="0" r="46" />
              </clipPath>
            </defs>
            <g>
              <circle cx="0" cy="0" r="72" fill="url(#outerAura)" opacity="0.45">
                <animate attributeName="opacity" values="0.25;0.6;0.25" dur="4.8s" repeatCount="indefinite" />
                <animateTransform
                  attributeName="transform"
                  type="scale"
                  values="1;1.08;1"
                  dur="4.8s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
            <g strokeLinecap="round" strokeWidth="4" fill="none">
              <g stroke="#4bf4f0" opacity="0.4">
                <circle r="52" strokeDasharray="48 180">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0"
                    to="360"
                    dur="9s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
              <g stroke="#2dd4bf" opacity="0.6">
                <circle r="44" strokeDasharray="32 140">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="360"
                    to="0"
                    dur="6.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
              <g stroke="#0ea5e9" opacity="0.5">
                <circle r="36" strokeDasharray="24 110">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0"
                    to="-360"
                    dur="4.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            </g>
            <g clipPath="url(#gemClip)">
              <circle cx="0" cy="0" r="46" fill="url(#gemCore)" opacity="0.94" />
              <g opacity="0.5">
                <polygon points="-32,-6 -8,-40 20,-28 30,-2 6,26 -22,18" fill="url(#gemFacet)" />
                <polygon points="-10,10 14,-10 34,8 18,32 -8,34 -28,18" fill="#22d3ee" opacity="0.45" />
                <polygon points="-26,-20 -6,-34 18,-26 8,-6 -14,-2 -30,-10" fill="#0f766e" opacity="0.35" />
              </g>
              <g opacity="0.22">
                <circle cx="-14" cy="-18" r="14" fill="white" />
                <circle cx="18" cy="-12" r="10" fill="#c4f1f9" />
                <circle cx="-2" cy="16" r="18" fill="#93e5d9" />
              </g>
              <g mask="url(#highlightSweep)">
                <rect x="-60" y="-60" width="120" height="120" fill="white" opacity="0.35" />
              </g>
            </g>
            <g>
              <circle cx="-20" cy="-30" r="6" fill="#e0f2fe" opacity="0.85">
                <animate attributeName="opacity" values="0.2;0.9;0.2" dur="3.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="24" cy="-16" r="4" fill="#bae6fd" opacity="0.6">
                <animate attributeName="opacity" values="0.1;0.7;0.1" dur="2.8s" repeatCount="indefinite" />
              </circle>
            </g>
          </svg>
        )}
      </div>
      <div className="max-w-xs text-sm text-slate-400">{displayLabel}</div>
    </div>
  );
};
