import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getMilestoneChatMessage } from '@/engine/chat/narration';
import { deploySite, type Deployers } from '@/engine/deploy/deploy-manager';
import {
  generateDocumentationPacket,
  type DocumentationPacket,
} from '@/engine/deploy/doc-generator';
import { VirtualFileSystem } from '@/engine/vfs/vfs';
import { useChatStore } from '@/store/chat-store';
import { useSettingsStore } from '@/store/settings-store';
import type { ChatMessage } from '@/types/chat';
import type { DeployHost, Deployment } from '@/types/deploy';
import type { VfsMetadata } from '@/types/vfs';

import { DeployButton } from './DeployButton';
import { StatusBar } from './StatusBar';

type PreviewSlot = 'blue' | 'green';
type ValidationState = 'pending' | 'validating' | 'passed';
type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type DeployState = 'idle' | 'deploying' | 'success' | 'error';

type DeploySummary = {
  deployment: Deployment;
  docsUrl: string | null;
  docsFileName: string | null;
};

type PreviewPanelProps = {
  kicker: string;
  label: string;
  description: string;
  sessionId: string;
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

const HOST_LABELS: Record<DeployHost, string> = {
  github_pages: 'GitHub Pages',
  cloudflare_pages: 'Cloudflare Pages',
  netlify: 'Netlify',
  vercel: 'Vercel',
};

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

const DEMO_METADATA = {
  title: 'Juniper Clay Studio',
  description: 'Warm, sunlit pottery classes with kiln access and open studio nights.',
  colors: {
    primary: '#E57C4B',
    secondary: '#F4E7DB',
    accent: '#4AA089',
    bg: '#FBF7F2',
    text: '#1F2937',
  },
  fonts: {
    headingFont: 'Georgia, serif',
    bodyFont: 'Georgia, serif',
  },
} satisfies VfsMetadata;

function buildChatMessage(
  sessionId: string,
  sender: ChatMessage['sender'],
  content: string,
): ChatMessage {
  const timestamp = Date.now();
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `msg-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    sessionId,
    timestamp,
    sender,
    content,
  };
}

async function buildDemoVfs(html: string): Promise<VirtualFileSystem> {
  const vfs = new VirtualFileSystem({
    metadata: DEMO_METADATA,
    templateId: 'demo',
  });
  await vfs.addFile('index.html', html);
  return vfs;
}

function estimateVfsSize(vfs: VirtualFileSystem): number {
  let total = 0;
  for (const file of vfs.files.values()) {
    total += measureBytes(file.content);
  }
  return total;
}

function measureBytes(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

function buildDocsDownload(
  packet: DocumentationPacket,
): { url: string; filename: string } | null {
  if (typeof URL?.createObjectURL !== 'function') {
    return null;
  }
  const payload = JSON.stringify(
    {
      root: packet.root,
      branding: packet.branding,
      files: packet.files,
      assets: packet.assets,
      screenshots: packet.screenshots,
      pdf: packet.pdf,
      generatedAt: packet.generatedAt,
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: 'application/json' });
  return {
    url: URL.createObjectURL(blob),
    filename: `${packet.root}.json`,
  };
}

function buildDeploymentId(): string {
  return `deploy-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function buildMockDeployment(input: {
  host: DeployHost;
  url: string;
  vfs: VirtualFileSystem;
  sessionId: string;
  repoUrl?: string;
}): Deployment {
  return {
    id: buildDeploymentId(),
    sessionId: input.sessionId,
    host: input.host,
    url: input.url,
    repoUrl: input.repoUrl,
    deployedAt: Date.now(),
    siteSize: estimateVfsSize(input.vfs),
    fileCount: input.vfs.files.size,
    status: 'live',
  };
}

function buildMockDeployers(): Partial<Deployers> {
  return {
    github_pages: async (options) => ({
      ok: true,
      value: buildMockDeployment({
        host: 'github_pages',
        url: `https://${options.repoName}.github.io/${options.repoName}`,
        repoUrl: `https://github.com/${options.repoName}`,
        vfs: options.vfs,
        sessionId: options.sessionId,
      }),
    }),
    cloudflare_pages: async (options) => ({
      ok: true,
      value: buildMockDeployment({
        host: 'cloudflare_pages',
        url: `https://${options.projectName}.pages.dev`,
        vfs: options.vfs,
        sessionId: options.sessionId,
      }),
    }),
    netlify: async (options) => ({
      ok: true,
      value: buildMockDeployment({
        host: 'netlify',
        url: `https://${options.siteName}.netlify.app`,
        vfs: options.vfs,
        sessionId: options.sessionId,
      }),
    }),
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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


export function PreviewPanel({
  kicker,
  label,
  description,
  sessionId,
}: PreviewPanelProps) {
  const [activeSlot, setActiveSlot] = useState<PreviewSlot>('blue');
  const [validationState, setValidationState] = useState<ValidationState>('pending');
  const [isSwapping, setIsSwapping] = useState(false);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [deployState, setDeployState] = useState<DeployState>('idle');
  const [deploySummary, setDeploySummary] = useState<DeploySummary | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const addMessage = useChatStore((state) => state.addMessage);
  const deployTokens = useSettingsStore((state) => state.settings.deployTokens);

  const validationTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const swapTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const hasDeployTokens = useMemo(
    () => Object.values(deployTokens).some((token) => token.trim().length > 0),
    [deployTokens],
  );
  const canDeploy = hasDeployTokens && deployState !== 'deploying';
  const deployHostConfig = useMemo(() => {
    if (deployTokens.cloudflare?.trim()) {
      return { cloudflare: { accountId: 'demo-account' } };
    }
    return undefined;
  }, [deployTokens.cloudflare]);
  const deployDisabledReason = hasDeployTokens
    ? 'Deploy to the best zero-cost host.'
    : 'Configure a deploy token in Settings to enable deployment.';
  const deployStateLabel =
    deployState === 'deploying'
      ? 'Deploying'
      : deployState === 'success'
        ? 'Deployed'
        : deployState === 'error'
          ? 'Deploy failed'
          : 'Ready';

  useEffect(() => {
    return () => {
      if (deploySummary?.docsUrl) {
        URL.revokeObjectURL(deploySummary.docsUrl);
      }
    };
  }, [deploySummary?.docsUrl]);

  const emitSystemMessage = useCallback(
    (content: string) => {
      addMessage(buildChatMessage(sessionId, 'system', content));
    },
    [addMessage, sessionId],
  );

  const emitStudioMessage = useCallback(
    (content: string) => {
      addMessage(buildChatMessage(sessionId, 'chat_ai', content));
    },
    [addMessage, sessionId],
  );

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

  const handleDeploy = useCallback(async () => {
    if (!canDeploy) return;
    setDeployState('deploying');
    setDeployError(null);
    setDeploySummary((prev) => {
      if (prev?.docsUrl) {
        URL.revokeObjectURL(prev.docsUrl);
      }
      return null;
    });

    emitSystemMessage('Deploy started. Running pre-deploy checks...');

    try {
      const vfs = await buildDemoVfs(PREVIEW_DOCS[activeSlot]);
      await delay(400);
      emitSystemMessage('Validating deploy bundle...');

      const deployResult = await deploySite({
        vfs,
        sessionId,
        tokens: {
          github: deployTokens.github,
          cloudflare: deployTokens.cloudflare,
          netlify: deployTokens.netlify,
          vercel: deployTokens.vercel,
        },
        hostConfig: deployHostConfig,
        deployers: buildMockDeployers(),
      });

      if (!deployResult.ok) {
        const message = deployResult.error.message ?? 'Deploy failed.';
        emitSystemMessage(`Deploy failed: ${message}`);
        setDeployState('error');
        setDeployError(message);
        return;
      }

      const deployment = deployResult.value;
      emitSystemMessage(
        `Deploy complete on ${HOST_LABELS[deployment.host]}. Generating documentation packet...`,
      );
      const packet = await generateDocumentationPacket({
        vfs,
        deploymentUrl: deployment.url,
      });
      const download = buildDocsDownload(packet);
      setDeploySummary({
        deployment,
        docsUrl: download?.url ?? null,
        docsFileName: download?.filename ?? null,
      });
      emitStudioMessage(getMilestoneChatMessage('deployed', { url: deployment.url }));
      setDeployState('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deploy failed.';
      emitSystemMessage(`Deploy failed: ${message}`);
      setDeployState('error');
      setDeployError(message);
    }
  }, [
    activeSlot,
    canDeploy,
    deployHostConfig,
    deployTokens.cloudflare,
    deployTokens.github,
    deployTokens.netlify,
    deployTokens.vercel,
    emitStudioMessage,
    emitSystemMessage,
    sessionId,
  ]);

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

          <div className="flex flex-wrap items-center gap-2">
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
            <DeployButton
              disabled={!hasDeployTokens}
              isDeploying={deployState === 'deploying'}
              hasDeployed={deployState === 'success'}
              hasError={deployState === 'error'}
              onClick={handleDeploy}
              disabledReason={deployDisabledReason}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
            <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Deploy Status
            </div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-slate-300">
              {deployStateLabel}
            </div>
          </div>
          {deployState === 'idle' && (
            <p className="mt-2 text-sm text-slate-300">
              Deploy when ready to publish the latest preview to a zero-cost host.
            </p>
          )}
          {deployState === 'deploying' && (
            <p className="mt-2 text-sm text-slate-200">
              Deploying your site. Watch the chat for progress updates.
            </p>
          )}
          {deployState === 'error' && (
            <p className="mt-2 text-sm text-rose-200">
              {deployError ?? 'Deploy failed. Check settings and try again.'}
            </p>
          )}
          {deployState === 'success' && deploySummary && (
            <div className="mt-2 flex flex-col gap-2 text-sm text-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-400">Live URL</span>
                <a
                  href={deploySummary.deployment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] text-emerald-200 hover:text-emerald-100"
                >
                  {deploySummary.deployment.url}
                </a>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-400">Documentation packet</span>
                {deploySummary.docsUrl ? (
                  <a
                    href={deploySummary.docsUrl}
                    download={deploySummary.docsFileName ?? 'documentation.json'}
                    className="rounded-full border border-slate-700/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200 transition hover:border-emerald-300/70 hover:text-emerald-200"
                  >
                    Download Docs
                  </a>
                ) : (
                  <span className="text-xs text-slate-500">
                    Documentation not available.
                  </span>
                )}
              </div>
            </div>
          )}
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
