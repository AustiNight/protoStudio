import { useEffect, useRef, useState } from 'react';

import { StatusBar } from './StatusBar';

type PreviewSlot = 'blue' | 'green';
type ValidationState = 'pending' | 'validating' | 'passed';
type ViewportMode = 'desktop' | 'tablet' | 'mobile';

type PreviewPanelProps = {
  kicker: string;
  label: string;
  description: string;
};

type ViewportOption = {
  id: ViewportMode;
  label: string;
  width: string;
};

const VIEWPORT_OPTIONS: ViewportOption[] = [
  { id: 'desktop', label: 'Desktop', width: '100%' },
  { id: 'tablet', label: 'Tablet', width: '860px' },
  { id: 'mobile', label: 'Mobile', width: '420px' },
];

const SWAP_DURATION_MS = 700;
const VALIDATION_DURATION_MS = 1200;

const PREVIEW_DOCS: Record<PreviewSlot, string> = {
  blue: buildPreviewDoc({
    accentHue: 24,
    headline: 'Juniper Clay Studio',
    subhead: 'Warm, sunlit pottery classes with kiln access and open studio nights.',
    badge: 'Spring sessions now open',
    ctaPrimary: 'Join the waitlist',
    ctaSecondary: 'View class calendar',
    detailTitle: 'Wheel intensives',
    detailBody: 'Three-week intensives for new throwers, with glaze prep included.',
    metric: '12 seats per cohort · Portland, OR',
  }),
  green: buildPreviewDoc({
    accentHue: 160,
    headline: 'Juniper Clay Studio',
    subhead: 'A calmer palette, new summer drop-ins, and more glazing time.',
    badge: 'Summer drop-ins added',
    ctaPrimary: 'Reserve a seat',
    ctaSecondary: 'Browse studio notes',
    detailTitle: 'Summer drop-ins',
    detailBody: 'Flexible weekday sessions with materials and firing included.',
    metric: '8 drop-in slots daily · Portland, OR',
  }),
};

function buildPreviewDoc(options: {
  accentHue: number;
  headline: string;
  subhead: string;
  badge: string;
  ctaPrimary: string;
  ctaSecondary: string;
  detailTitle: string;
  detailBody: string;
  metric: string;
}): string {
  const {
    accentHue,
    headline,
    subhead,
    badge,
    ctaPrimary,
    ctaSecondary,
    detailTitle,
    detailBody,
    metric,
  } = options;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${headline}</title>
    <style>
      :root {
        --bg: 32 45% 96%;
        --surface: 28 36% 92%;
        --ink: 222 22% 18%;
        --muted: 220 10% 42%;
        --accent: ${accentHue} 62% 46%;
        --accent-soft: ${accentHue} 70% 92%;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "Georgia", "Times New Roman", serif;
        color: hsl(var(--ink));
        background: linear-gradient(180deg, hsl(var(--bg)), hsl(var(--surface)));
      }
      .ceramics {
        min-height: 100vh;
        padding: 36px clamp(20px, 4vw, 48px) 48px;
        display: flex;
        flex-direction: column;
        gap: 40px;
      }
      .ceramics__nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        font-size: 14px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .ceramics__logo {
        font-weight: 700;
        font-size: 18px;
        letter-spacing: 0.2em;
      }
      .ceramics__links {
        display: flex;
        gap: 20px;
        color: hsl(var(--muted));
      }
      .ceramics__cta {
        padding: 10px 18px;
        border-radius: 999px;
        border: 1px solid hsl(var(--accent));
        background: transparent;
        color: hsl(var(--accent));
        font-weight: 600;
      }
      .ceramics-hero {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 32px;
        align-items: center;
      }
      .ceramics-hero__badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        background: hsl(var(--accent-soft));
        color: hsl(var(--accent));
      }
      .ceramics-hero__title {
        font-size: clamp(32px, 4vw, 48px);
        margin: 16px 0 12px;
      }
      .ceramics-hero__summary {
        font-size: 16px;
        line-height: 1.6;
        color: hsl(var(--muted));
      }
      .ceramics-hero__actions {
        margin-top: 24px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .ceramics-hero__button {
        padding: 12px 20px;
        border-radius: 999px;
        font-weight: 600;
        border: 1px solid transparent;
      }
      .ceramics-hero__button--primary {
        background: hsl(var(--accent));
        color: hsl(0 0% 100%);
      }
      .ceramics-hero__button--ghost {
        border-color: hsl(var(--accent));
        color: hsl(var(--accent));
        background: transparent;
      }
      .ceramics-hero__meta {
        margin-top: 18px;
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: hsl(var(--muted));
      }
      .ceramics-hero__visual {
        background: hsl(var(--accent-soft));
        border-radius: 28px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .ceramics-hero__card {
        background: hsl(0 0% 100%);
        border-radius: 20px;
        padding: 18px;
        box-shadow: 0 20px 40px hsl(var(--ink) / 0.08);
      }
      .ceramics-hero__card-title {
        font-weight: 700;
        font-size: 18px;
        margin: 0 0 8px;
      }
      .ceramics-hero__card-body {
        margin: 0;
        color: hsl(var(--muted));
        line-height: 1.5;
      }
      .ceramics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
      }
      .ceramics-grid__item {
        border-radius: 20px;
        padding: 18px;
        background: hsl(0 0% 100%);
        border: 1px solid hsl(var(--accent) / 0.2);
        box-shadow: 0 10px 20px hsl(var(--ink) / 0.05);
      }
      .ceramics-grid__eyebrow {
        font-size: 11px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: hsl(var(--accent));
        margin-bottom: 8px;
      }
      .ceramics-grid__title {
        margin: 0 0 6px;
        font-weight: 700;
      }
      .ceramics-grid__copy {
        margin: 0;
        color: hsl(var(--muted));
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="ceramics">
      <header class="ceramics__nav">
        <div class="ceramics__logo">JUNIPER</div>
        <nav class="ceramics__links" aria-label="Studio sections">
          <span>Classes</span>
          <span>Studio</span>
          <span>Journal</span>
        </nav>
        <button class="ceramics__cta" type="button">${ctaSecondary}</button>
      </header>

      <section class="ceramics-hero">
        <div class="ceramics-hero__copy">
          <span class="ceramics-hero__badge">${badge}</span>
          <h1 class="ceramics-hero__title">${headline}</h1>
          <p class="ceramics-hero__summary">${subhead}</p>
          <div class="ceramics-hero__actions">
            <button class="ceramics-hero__button ceramics-hero__button--primary" type="button">
              ${ctaPrimary}
            </button>
            <button class="ceramics-hero__button ceramics-hero__button--ghost" type="button">
              ${ctaSecondary}
            </button>
          </div>
          <div class="ceramics-hero__meta">${metric}</div>
        </div>
        <div class="ceramics-hero__visual" aria-hidden="true">
          <svg viewBox="0 0 220 140" width="100%" height="auto" role="img" aria-label="Clay studio motif">
            <defs>
              <linearGradient id="clay" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="hsl(var(--accent) / 0.7)" />
                <stop offset="100%" stop-color="hsl(var(--accent) / 0.3)" />
              </linearGradient>
            </defs>
            <path d="M40 110 C10 70 40 30 90 30 C120 30 140 50 150 70 C170 90 190 120 150 130 C120 135 70 130 40 110 Z" fill="url(#clay)" />
            <circle cx="160" cy="40" r="26" fill="hsl(var(--accent) / 0.4)" />
          </svg>
          <div class="ceramics-hero__card">
            <h3 class="ceramics-hero__card-title">${detailTitle}</h3>
            <p class="ceramics-hero__card-body">${detailBody}</p>
          </div>
        </div>
      </section>

      <section class="ceramics-grid">
        <article class="ceramics-grid__item">
          <div class="ceramics-grid__eyebrow">Open Studio</div>
          <h3 class="ceramics-grid__title">Kiln access included</h3>
          <p class="ceramics-grid__copy">Drop in on weekday evenings and glaze with studio guidance.</p>
        </article>
        <article class="ceramics-grid__item">
          <div class="ceramics-grid__eyebrow">Community</div>
          <h3 class="ceramics-grid__title">Small cohort sizes</h3>
          <p class="ceramics-grid__copy">We keep groups intimate so every piece gets attention.</p>
        </article>
        <article class="ceramics-grid__item">
          <div class="ceramics-grid__eyebrow">Materials</div>
          <h3 class="ceramics-grid__title">Clay + glaze library</h3>
          <p class="ceramics-grid__copy">Choose from curated clay bodies and test glazes.</p>
        </article>
      </section>
    </div>
  </body>
</html>`;
}


export function PreviewPanel({ kicker, label, description }: PreviewPanelProps) {
  const [activeSlot, setActiveSlot] = useState<PreviewSlot>('blue');
  const [validationState, setValidationState] = useState<ValidationState>('pending');
  const [isSwapping, setIsSwapping] = useState(false);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');

  const validationTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const swapTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const incomingSlot: PreviewSlot = activeSlot === 'blue' ? 'green' : 'blue';
  const canSwap = validationState === 'passed' && !isSwapping;

  useEffect(() => {
    return () => {
      if (validationTimer.current) {
        window.clearTimeout(validationTimer.current);
      }
      if (swapTimer.current) {
        window.clearTimeout(swapTimer.current);
      }
    };
  }, []);

  const handleValidate = () => {
    if (validationState === 'validating' || isSwapping) return;
    if (validationTimer.current) {
      window.clearTimeout(validationTimer.current);
    }
    setValidationState('validating');
    validationTimer.current = window.setTimeout(() => {
      setValidationState('passed');
    }, VALIDATION_DURATION_MS);
  };

  const handleSwap = () => {
    if (!canSwap) return;
    if (swapTimer.current) {
      window.clearTimeout(swapTimer.current);
    }
    setIsSwapping(true);
    swapTimer.current = window.setTimeout(() => {
      setActiveSlot((current) => (current === 'blue' ? 'green' : 'blue'));
      setIsSwapping(false);
      setValidationState('pending');
    }, SWAP_DURATION_MS);
  };

  const viewportWidth = VIEWPORT_OPTIONS.find((option) => option.id === viewport)?.width ?? '100%';
  const frameStyle = {
    width: viewportWidth,
    maxWidth: '100%',
    height: '100%',
  } as const;

  return (
    <>
      <header className="flex items-center justify-between">
        <div>
          <p className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.3em] text-slate-400">
            {kicker}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{label}</h2>
        </div>
        <span
          className={`rounded-full border px-3 py-1 font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] ${
            activeSlot === 'blue'
              ? 'border-sky-400/60 text-sky-200'
              : 'border-emerald-300/70 text-emerald-200'
          }`}
        >
          {activeSlot === 'blue' ? 'Blue Live' : 'Green Live'}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        <p className="text-sm text-slate-300">{description}</p>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBar />
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
              <span>Active {activeSlot}</span>
              <span>Next {incomingSlot}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full border border-slate-800/80 bg-slate-900/60 p-1">
            {VIEWPORT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setViewport(option.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                  viewport === option.id
                    ? 'bg-emerald-300/90 text-slate-950'
                    : 'text-slate-400 hover:text-emerald-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleValidate}
              disabled={validationState === 'validating' || isSwapping}
              className="rounded-full border border-slate-800/80 bg-slate-900/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {validationState === 'passed' ? 'Revalidate' : 'Validate'}
            </button>
            <button
              type="button"
              onClick={handleSwap}
              disabled={!canSwap}
              className="rounded-full bg-emerald-300/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSwapping ? 'Swapping' : 'Swap'}
            </button>
          </div>
        </div>

        <div className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/40 via-slate-900/30 to-slate-950/80 p-4">
          <div className="relative h-full w-full" style={frameStyle}>
            <div
              className={`absolute inset-0 h-full w-full transition-all duration-[700ms] ease-out ${
                isSwapping
                  ? activeSlot === 'blue'
                    ? 'opacity-0 scale-[0.98]'
                    : 'opacity-100 scale-100'
                  : activeSlot === 'blue'
                    ? 'opacity-100 scale-100'
                    : 'opacity-0 scale-[0.98]'
              } ${activeSlot === 'blue' || isSwapping ? 'z-20' : 'z-0'} ${
                activeSlot !== 'blue' && !isSwapping ? 'pointer-events-none' : ''
              }`}
              aria-hidden={activeSlot !== 'blue' && !isSwapping}
              style={{ visibility: activeSlot === 'blue' || isSwapping ? 'visible' : 'hidden' }}
            >
              <div className="absolute left-4 top-4 z-30 rounded-full bg-sky-400/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-950">
                Blue slot
              </div>
              <div className="h-full w-full overflow-hidden rounded-2xl border border-slate-800/70 bg-white shadow-[0_20px_40px_rgba(15,23,42,0.35)]">
                <iframe
                  title="Preview slot blue"
                  sandbox=""
                  srcDoc={PREVIEW_DOCS.blue}
                  className="h-full w-full"
                />
              </div>
            </div>

            <div
              className={`absolute inset-0 h-full w-full transition-all duration-[700ms] ease-out ${
                isSwapping
                  ? activeSlot === 'green'
                    ? 'opacity-0 scale-[0.98]'
                    : 'opacity-100 scale-100'
                  : activeSlot === 'green'
                    ? 'opacity-100 scale-100'
                    : 'opacity-0 scale-[0.98]'
              } ${activeSlot === 'green' || isSwapping ? 'z-20' : 'z-0'} ${
                activeSlot !== 'green' && !isSwapping ? 'pointer-events-none' : ''
              }`}
              aria-hidden={activeSlot !== 'green' && !isSwapping}
              style={{ visibility: activeSlot === 'green' || isSwapping ? 'visible' : 'hidden' }}
            >
              <div className="absolute left-4 top-4 z-30 rounded-full bg-emerald-300/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-950">
                Green slot
              </div>
              <div className="h-full w-full overflow-hidden rounded-2xl border border-slate-800/70 bg-white shadow-[0_20px_40px_rgba(15,23,42,0.35)]">
                <iframe
                  title="Preview slot green"
                  sandbox=""
                  srcDoc={PREVIEW_DOCS.green}
                  className="h-full w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
