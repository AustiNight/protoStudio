import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';

import { runtimeConfig } from '@/config/runtime-config';
import { getMilestoneChatMessage } from '@/engine/chat/narration';
import {
  deploySite,
  selectDeployHost,
  type DeployHostConfig,
  type Deployers,
  type DeployTokens,
} from '@/engine/deploy/deploy-manager';
import {
  generateDocumentationPacket,
  type DocumentationPacket,
} from '@/engine/deploy/doc-generator';
import { VirtualFileSystem } from '@/engine/vfs/vfs';
import { useChatStore } from '@/store/chat-store';
import { useSettingsStore } from '@/store/settings-store';
import { useTelemetryStore } from '@/store/telemetry-store';
import type { ChatMessage } from '@/types/chat';
import type { DeployHost, Deployment } from '@/types/deploy';
import type { TelemetryDeployErrorReason } from '@/types/telemetry';
import type { AppError } from '@/types/result';
import type { VfsMetadata, VirtualFileSystem as VfsState } from '@/types/vfs';
import { studioLog } from '@/utils/studio-logger';

import { ChlorastroliteLoader } from './ChlorastroliteLoader';
import { DeployButton } from './DeployButton';
import { StatusBar } from './StatusBar';

type PreviewSlot = 'blue' | 'green';
type ValidationState = 'pending' | 'validating' | 'passed';
type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type DeployState = 'idle' | 'deploying' | 'success' | 'error';
type PreviewFrameLoadMetrics = {
  frameWidth: number;
  frameHeight: number;
  wrapperHeight: number;
  slotHeight: number;
};

type DeploySummary = {
  deployment: Deployment;
  docsUrl: string | null;
  docsFileName: string | null;
};

type PreviewPanelProps = {
  label: string;
  sessionId: string;
  automationPaused?: boolean;
  onToggleAutomationPause?: () => void;
};

type PreviewRouteMap = Record<string, string>;
type PreviewSwapDetail = {
  html?: unknown;
  slot?: unknown;
  pagePath?: unknown;
  routes?: unknown;
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

const SWAP_DURATION_MS = runtimeConfig.previewSwapDurationMs;
const VALIDATION_DURATION_MS = runtimeConfig.previewValidationDurationMs;
const PREVIEW_SWAP_EVENT = 'preview:swap';
const PREVIEW_ACTIVE_SLOT_EVENT = 'preview:active-slot';
const PREVIEW_STAGED_STATE_EVENT = 'preview:staged-state';
const PREVIEW_IFRAME_SANDBOX = runtimeConfig.previewIframeSandbox;
const SRC_DOC_PROTOCOLS = ['about:srcdoc', 'about:blank'];
const PREVIEW_BASE_ORIGIN = 'https://preview.local';

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

function normalizeRoutePath(path: string): string {
  let normalized = path.trim();
  if (!normalized) {
    return 'index.html';
  }

  normalized = normalized.split('#')[0]?.split('?')[0] ?? normalized;
  normalized = normalized.replace(/^\/+/, '');
  normalized = normalized.replace(/^\.\/+/, '');

  if (!normalized) {
    return 'index.html';
  }
  if (normalized.endsWith('/')) {
    return `${normalized}index.html`;
  }
  if (!normalized.toLowerCase().endsWith('.html')) {
    return `${normalized}.html`;
  }
  return normalized;
}

function coercePreviewRoutes(
  routes: unknown,
  pagePath: string,
  html: string,
): PreviewRouteMap {
  const map: PreviewRouteMap = {};
  if (routes && typeof routes === 'object') {
    for (const [key, value] of Object.entries(routes as Record<string, unknown>)) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        continue;
      }
      map[normalizeRoutePath(key)] = value;
    }
  }

  const normalizedPagePath = normalizeRoutePath(pagePath);
  if (!(normalizedPagePath in map)) {
    map[normalizedPagePath] = html;
  }

  if (!('index.html' in map) && normalizedPagePath === 'index.html') {
    map['index.html'] = html;
  }

  return map;
}

function resolveRouteFromHref(
  hrefValue: string,
  currentPath: string,
  routes: PreviewRouteMap,
): {
  kind: 'route' | 'hash' | 'external' | 'unknown';
  path?: string;
  hash?: string;
  html?: string;
} {
  if (hrefValue.startsWith('#')) {
    return { kind: 'hash', hash: hrefValue };
  }

  let resolved: URL;
  try {
    const base = new URL(`/${normalizeRoutePath(currentPath)}`, PREVIEW_BASE_ORIGIN);
    resolved = new URL(hrefValue, base);
  } catch {
    return { kind: 'unknown' };
  }

  if (resolved.origin !== PREVIEW_BASE_ORIGIN) {
    return { kind: 'external' };
  }

  const normalizedPath = normalizeRoutePath(resolved.pathname);
  const html = routes[normalizedPath];
  if (!html) {
    return { kind: 'unknown' };
  }

  if (normalizeRoutePath(currentPath) === normalizedPath && resolved.hash) {
    return { kind: 'hash', hash: resolved.hash };
  }

  return {
    kind: 'route',
    path: normalizedPath,
    hash: resolved.hash || undefined,
    html,
  };
}

function findHashTarget(doc: Document, id: string): Element | 'top' | null {
  const normalizedId = id.trim();
  if (!normalizedId) {
    return null;
  }

  const exact = doc.getElementById(normalizedId);
  if (exact) {
    return exact;
  }

  const namedAnchor = doc.getElementsByName(normalizedId).item(0);
  if (namedAnchor) {
    return namedAnchor;
  }

  const normalizedSectionId = normalizedId.toLowerCase();
  const sections = Array.from(doc.querySelectorAll<HTMLElement>('[data-pp-section]'));
  const sectionById = sections.find((section) => {
    const sectionId = section.dataset.ppSection?.toLowerCase();
    return sectionId === normalizedSectionId;
  });
  if (sectionById) {
    return sectionById;
  }

  // Handle common section aliases used by nav labels.
  if (normalizedSectionId === 'home') {
    const heroSection = sections.find((section) => section.dataset.ppSection?.toLowerCase() === 'hero');
    return heroSection ?? 'top';
  }

  const sectionByPrefix = sections.find((section) => {
    const sectionId = section.dataset.ppSection?.toLowerCase() ?? '';
    return sectionId.startsWith(`${normalizedSectionId}-`);
  });
  if (sectionByPrefix) {
    return sectionByPrefix;
  }

  return null;
}

function scrollToHashInFrame(frame: HTMLIFrameElement, hash: string): void {
  const id = decodeURIComponent(hash.replace(/^#/, '').trim());
  if (!id) {
    return;
  }

  const doc = frame.contentDocument;
  if (!doc) {
    return;
  }

  const target = findHashTarget(doc, id);
  if (target === 'top') {
    doc.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function resolveDeployHost(
  tokens: DeployTokens,
  hostConfig: DeployHostConfig | undefined,
  deployers: Partial<Deployers>,
): DeployHost | null {
  const selection = selectDeployHost({ tokens, hostConfig, deployers });
  return selection.ok ? selection.value.selectedHost : null;
}

function mapDeployErrorReason(error: AppError): TelemetryDeployErrorReason {
  const code = error.code?.toLowerCase() ?? '';
  if (code.includes('auth') || code.includes('token') || code.includes('unauthorized')) {
    return 'auth';
  }
  if (code.includes('rate')) {
    return 'rate_limit';
  }
  if (error.category === 'retryable' || code.includes('network')) {
    return 'network';
  }
  return 'unknown';
}

async function buildDemoVfs(html: string): Promise<VirtualFileSystem> {
  const vfs = new VirtualFileSystem({
    metadata: DEMO_METADATA,
    templateId: 'demo',
  });
  await vfs.addFile('index.html', html);
  return vfs;
}

function estimateVfsSize(vfs: VfsState): number {
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
  vfs: VfsState;
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

function extractPreviewTitle(html: string): string | null {
  const match = /<title>([^<]+)<\/title>/i.exec(html);
  if (!match) {
    return null;
  }
  const title = match[1]?.trim() ?? '';
  return title.length > 0 ? title : null;
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

export function PreviewPanel({
  label,
  sessionId,
  automationPaused = false,
  onToggleAutomationPause,
}: PreviewPanelProps) {
  const [activeSlot, setActiveSlot] = useState<PreviewSlot>('blue');
  const [slotDocs, setSlotDocs] = useState<Record<PreviewSlot, string>>(() => ({
    blue: '',
    green: '',
  }));
  const [slotRoutes, setSlotRoutes] = useState<Record<PreviewSlot, PreviewRouteMap>>({
    blue: {},
    green: {},
  });
  const [slotPagePaths, setSlotPagePaths] = useState<Record<PreviewSlot, string>>({
    blue: 'index.html',
    green: 'index.html',
  });
  const [slotRevisions, setSlotRevisions] = useState<Record<PreviewSlot, number>>({
    blue: 0,
    green: 0,
  });
  const [stagedSlot, setStagedSlot] = useState<PreviewSlot | null>(null);
  const [hasGeneratedPreview, setHasGeneratedPreview] = useState(false);
  const [validationState, setValidationState] = useState<ValidationState>('pending');
  const [isSwapping, setIsSwapping] = useState(false);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [deployState, setDeployState] = useState<DeployState>('idle');
  const [deploySummary, setDeploySummary] = useState<DeploySummary | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const addMessage = useChatStore((state) => state.addMessage);
  const deployTokens = useSettingsStore((state) => state.settings.deployTokens);
  const recordBuildSwap = useTelemetryStore((state) => state.recordBuildSwap);
  const recordDeployStart = useTelemetryStore((state) => state.recordDeployStart);
  const recordDeployComplete = useTelemetryStore((state) => state.recordDeployComplete);
  const recordDeployError = useTelemetryStore((state) => state.recordDeployError);

  const validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardedDocuments = useRef(new WeakSet<Document>());
  const pendingHashBySlotRef = useRef<Record<PreviewSlot, string | null>>({
    blue: null,
    green: null,
  });

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
  const hasStagedPreview =
    stagedSlot !== null &&
    stagedSlot !== activeSlot &&
    slotRevisions[stagedSlot] > 0 &&
    slotDocs[stagedSlot].trim().length > 0;
  const canSwap = hasStagedPreview && validationState === 'passed' && !isSwapping;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(
      new CustomEvent(PREVIEW_STAGED_STATE_EVENT, {
        detail: { hasStaged: hasStagedPreview },
      }),
    );
  }, [hasStagedPreview]);

  useEffect(() => {
    return () => {
      if (validationTimer.current) {
        clearTimeout(validationTimer.current);
      }
      if (swapTimer.current) {
        clearTimeout(swapTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (validationTimer.current) {
      clearTimeout(validationTimer.current);
      validationTimer.current = null;
    }
    if (swapTimer.current) {
      clearTimeout(swapTimer.current);
      swapTimer.current = null;
    }
    guardedDocuments.current = new WeakSet<Document>();
    setActiveSlot('blue');
    setSlotDocs({
      blue: '',
      green: '',
    });
    setSlotRoutes({
      blue: {},
      green: {},
    });
    setSlotPagePaths({
      blue: 'index.html',
      green: 'index.html',
    });
    setSlotRevisions({
      blue: 0,
      green: 0,
    });
    pendingHashBySlotRef.current = {
      blue: null,
      green: null,
    };
    setStagedSlot(null);
    setHasGeneratedPreview(false);
    setValidationState('pending');
    setIsSwapping(false);
    setDeployState('idle');
    setDeployError(null);
    setDeploySummary((current) => {
      if (current?.docsUrl) {
        URL.revokeObjectURL(current.docsUrl);
      }
      return null;
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(PREVIEW_ACTIVE_SLOT_EVENT, {
          detail: { slot: 'blue' },
        }),
      );
    }
    studioLog({
      level: 'debug',
      source: 'preview.session.reset',
      sessionId,
      message: 'Reset preview panel state for active session.',
    });
  }, [sessionId]);

  const handleValidate = () => {
    if (!hasStagedPreview || validationState === 'validating' || isSwapping) return;
    if (validationTimer.current) {
      clearTimeout(validationTimer.current);
    }
    setValidationState('validating');
    validationTimer.current = setTimeout(() => {
      setValidationState('passed');
    }, VALIDATION_DURATION_MS);
  };

  useEffect(() => {
    if (!hasStagedPreview || automationPaused || validationState !== 'pending' || isSwapping) {
      return;
    }
    if (validationTimer.current) {
      clearTimeout(validationTimer.current);
    }
    setValidationState('validating');
    validationTimer.current = setTimeout(() => {
      setValidationState('passed');
    }, VALIDATION_DURATION_MS);
    return () => {
      if (validationTimer.current) {
        clearTimeout(validationTimer.current);
        validationTimer.current = null;
      }
    };
  }, [automationPaused, hasStagedPreview, isSwapping, validationState]);

  const performSwapTo = useCallback(
    (nextSlot: PreviewSlot) => {
      if (swapTimer.current) {
        clearTimeout(swapTimer.current);
      }
      studioLog({
        level: 'debug',
        source: 'preview.swap.perform',
        sessionId,
        message: `Animating swap to ${nextSlot}.`,
      });
      setIsSwapping(true);
      swapTimer.current = setTimeout(() => {
        setActiveSlot(nextSlot);
        setIsSwapping(false);
        setStagedSlot(null);
        setValidationState('pending');
        setHasGeneratedPreview(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(PREVIEW_ACTIVE_SLOT_EVENT, {
              detail: { slot: nextSlot },
            }),
          );
        }
        void recordBuildSwap({
          sessionId,
          slot: nextSlot,
          timestamp: Date.now(),
        });
      }, SWAP_DURATION_MS);
    },
    [recordBuildSwap, sessionId],
  );

  const getFrameLoadMetrics = useCallback((frame: HTMLIFrameElement): PreviewFrameLoadMetrics => {
    const rect = frame.getBoundingClientRect();
    const wrapperRect = frame.parentElement?.getBoundingClientRect();
    const slotRect = frame.closest<HTMLElement>('[data-preview-slot]')?.getBoundingClientRect();
    return {
      frameWidth: Math.round(rect.width),
      frameHeight: Math.round(rect.height),
      wrapperHeight: Math.round(wrapperRect?.height ?? 0),
      slotHeight: Math.round(slotRect?.height ?? 0),
    };
  }, []);

  const restoreFrameToSlotDoc = useCallback(
    (frame: HTMLIFrameElement, slot: PreviewSlot, href: string) => {
      studioLog({
        level: 'warn',
        source: 'preview.iframe.recover',
        sessionId,
        message: 'Preview iframe navigated away from srcDoc. Restoring staged preview.',
        details: {
          slot,
          href,
        },
      });
      frame.srcdoc = slotDocs[slot];
    },
    [sessionId, slotDocs],
  );

  const bindPreviewNavigationGuards = useCallback(
    (frame: HTMLIFrameElement, slot: PreviewSlot) => {
      let doc: Document | null = null;
      let win: Window | null = null;
      try {
        doc = frame.contentDocument;
        win = frame.contentWindow;
      } catch {
        doc = null;
        win = null;
      }
      if (!doc || !win) {
        studioLog({
          level: 'warn',
          source: 'preview.iframe.guard',
          sessionId,
          message: 'Unable to bind preview navigation guard due to iframe access restrictions.',
          details: {
            slot,
          },
        });
        return;
      }

      const href = win.location?.href ?? '';
      const safeProtocol = SRC_DOC_PROTOCOLS.some((protocol) => href.startsWith(protocol));
      if (!safeProtocol) {
        restoreFrameToSlotDoc(frame, slot, href);
        return;
      }

      if (guardedDocuments.current.has(doc)) {
        return;
      }
      guardedDocuments.current.add(doc);

      doc.addEventListener(
        'click',
        (event) => {
          const target = event.target as Element | null;
          const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
          if (!anchor) {
            return;
          }
          const hrefValue = anchor.getAttribute('href')?.trim() ?? '';
          if (hrefValue.length === 0) {
            return;
          }
          if (hrefValue.toLowerCase().startsWith('javascript:')) {
            event.preventDefault();
            return;
          }

          const currentPath = slotPagePaths[slot] ?? 'index.html';
          const routes = slotRoutes[slot] ?? {};
          const resolution = resolveRouteFromHref(hrefValue, currentPath, routes);

          if (resolution.kind === 'hash') {
            event.preventDefault();
            if (resolution.hash) {
              scrollToHashInFrame(frame, resolution.hash);
            }
            return;
          }

          if (resolution.kind === 'route' && resolution.path && resolution.html) {
            event.preventDefault();
            pendingHashBySlotRef.current[slot] = resolution.hash ?? null;
            setSlotPagePaths((current) => ({
              ...current,
              [slot]: resolution.path as string,
            }));
            setSlotDocs((current) => ({
              ...current,
              [slot]: resolution.html as string,
            }));
            setSlotRevisions((current) => ({
              ...current,
              [slot]: current[slot] + 1,
            }));
            studioLog({
              level: 'info',
              source: 'preview.iframe.nav.routed',
              sessionId,
              message: 'Navigated preview iframe to a routed page.',
              details: {
                slot,
                href: hrefValue,
                path: resolution.path,
                hash: resolution.hash ?? null,
              },
            });
            return;
          }

          if (resolution.kind === 'external') {
            event.preventDefault();
            studioLog({
              level: 'warn',
              source: 'preview.iframe.nav.blocked',
              sessionId,
              message: 'Blocked external navigation from preview iframe.',
              details: {
                slot,
                href: hrefValue,
                target: anchor.target || null,
              },
            });
            return;
          }

          event.preventDefault();
          studioLog({
            level: 'warn',
            source: 'preview.iframe.nav.blocked',
            sessionId,
            message: 'Blocked unknown in-preview route.',
            details: {
              slot,
              href: hrefValue,
              target: anchor.target || null,
              knownRoutes: Object.keys(routes),
            },
          });
        },
        { capture: true },
      );

      doc.addEventListener(
        'submit',
        (event) => {
          event.preventDefault();
          studioLog({
            level: 'warn',
            source: 'preview.iframe.form.blocked',
            sessionId,
            message: 'Blocked in-preview form submission to prevent iframe navigation.',
            details: {
              slot,
            },
          });
        },
        { capture: true },
      );
    },
    [restoreFrameToSlotDoc, sessionId, slotPagePaths, slotRoutes],
  );

  const handleFrameLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement>, slot: PreviewSlot) => {
      const frame = event.currentTarget;
      const metrics = getFrameLoadMetrics(frame);
      const revision = slotRevisions[slot];
      const htmlLength = slotDocs[slot].length;

      studioLog({
        level: 'debug',
        source: 'preview.iframe.load',
        sessionId,
        message: 'Preview iframe loaded.',
        details: {
          slot,
          revision,
          htmlLength,
          ...metrics,
        },
      });

      bindPreviewNavigationGuards(frame, slot);
      const pendingHash = pendingHashBySlotRef.current[slot];
      if (pendingHash) {
        pendingHashBySlotRef.current[slot] = null;
        window.requestAnimationFrame(() => {
          scrollToHashInFrame(frame, pendingHash);
        });
      }
    },
    [bindPreviewNavigationGuards, getFrameLoadMetrics, sessionId, slotDocs, slotRevisions],
  );

  const handleSwap = () => {
    if (!canSwap || !stagedSlot) return;
    performSwapTo(stagedSlot);
  };

  useEffect(() => {
    if (automationPaused || !canSwap || !stagedSlot) {
      return;
    }
    performSwapTo(stagedSlot);
  }, [automationPaused, canSwap, performSwapTo, stagedSlot]);

  useEffect(() => {
    const onPreviewSwap = (event: Event) => {
      const customEvent = event as CustomEvent<PreviewSwapDetail>;
      const html = customEvent.detail?.html;
      if (typeof html !== 'string' || html.trim().length === 0) {
        studioLog({
          level: 'warn',
          source: 'preview.swap.receive',
          sessionId,
          message: 'Received preview swap event without valid html payload.',
        });
        return;
      }
      const requestedSlot = customEvent.detail?.slot;
      const fallbackSlot: PreviewSlot = activeSlot === 'blue' ? 'green' : 'blue';
      let nextSlot: PreviewSlot =
        requestedSlot === 'blue' || requestedSlot === 'green'
          ? requestedSlot
          : fallbackSlot;
      const pagePath =
        typeof customEvent.detail?.pagePath === 'string' && customEvent.detail.pagePath.trim().length > 0
          ? normalizeRoutePath(customEvent.detail.pagePath)
          : 'index.html';
      const routes = coercePreviewRoutes(customEvent.detail?.routes, pagePath, html);
      if (nextSlot === activeSlot) {
        studioLog({
          level: 'warn',
          source: 'preview.swap.slot-corrected',
          sessionId,
          message: `Preview payload targeted live slot ${nextSlot}. Staging to inactive slot ${fallbackSlot} instead.`,
          details: {
            requestedSlot: requestedSlot === 'blue' || requestedSlot === 'green' ? requestedSlot : null,
            activeSlot,
          },
        });
        nextSlot = fallbackSlot;
      }
      studioLog({
        level: 'info',
        source: 'preview.swap.receive',
        sessionId,
        message: `Preview payload received for ${nextSlot}.`,
        details: {
          htmlLength: html.length,
          title: extractPreviewTitle(html),
          slot: nextSlot,
          pagePath,
          routeCount: Object.keys(routes).length,
        },
      });
      const isInitialPreview = slotRevisions.blue === 0 && slotRevisions.green === 0;
      if (isInitialPreview) {
        setSlotDocs({ blue: html, green: html });
        setSlotRoutes({ blue: routes, green: routes });
        setSlotPagePaths({ blue: pagePath, green: pagePath });
        setSlotRevisions({ blue: 1, green: 1 });
        setActiveSlot('blue');
        setHasGeneratedPreview(true);
        setIsSwapping(false);
        setStagedSlot(null);
        setValidationState('pending');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(PREVIEW_ACTIVE_SLOT_EVENT, {
              detail: { slot: 'blue' },
            }),
          );
        }
        return;
      }

      setSlotDocs((current) => ({
        ...current,
        [nextSlot]: html,
      }));
      setSlotRoutes((current) => ({
        ...current,
        [nextSlot]: routes,
      }));
      setSlotPagePaths((current) => ({
        ...current,
        [nextSlot]: pagePath,
      }));
      setSlotRevisions((current) => ({
        ...current,
        [nextSlot]: current[nextSlot] + 1,
      }));

      setStagedSlot(nextSlot);
      setValidationState((current) => (current === 'pending' ? 'pending' : current));
      studioLog({
        level: 'info',
        source: 'preview.swap.staged',
        sessionId,
        message: `New preview build staged in ${nextSlot}.`,
        details: {
          slot: nextSlot,
          revision: slotRevisions[nextSlot] + 1,
        },
      });
    };

    window.addEventListener(PREVIEW_SWAP_EVENT, onPreviewSwap as EventListener);
    return () => {
      window.removeEventListener(PREVIEW_SWAP_EVENT, onPreviewSwap as EventListener);
    };
  }, [activeSlot, sessionId, slotRevisions]);

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

    const deployStartedAt = Date.now();
    const tokens: DeployTokens = {
      github: deployTokens.github,
      cloudflare: deployTokens.cloudflare,
      netlify: deployTokens.netlify,
      vercel: deployTokens.vercel,
    };
    const deployers = buildMockDeployers();
    const selectedHost = resolveDeployHost(tokens, deployHostConfig, deployers);
    if (selectedHost) {
      void recordDeployStart({
        sessionId,
        host: selectedHost,
        timestamp: deployStartedAt,
      });
    }

    emitSystemMessage('Deploy started. Running pre-deploy checks...');
    studioLog({
      level: 'info',
      source: 'deploy.start',
      sessionId,
      message: 'Deploy started from preview panel.',
      details: {
        activeSlot,
      },
    });

    try {
      const vfs = await buildDemoVfs(slotDocs[activeSlot]);
      await delay(400);
      emitSystemMessage('Validating deploy bundle...');

      const deployResult = await deploySite({
        vfs,
        sessionId,
        tokens,
        hostConfig: deployHostConfig,
        deployers,
      });

      if (!deployResult.ok) {
        const message = deployResult.error.message ?? 'Deploy failed.';
        const durationMs = Math.max(0, Date.now() - deployStartedAt);
        if (selectedHost) {
          const reason = mapDeployErrorReason(deployResult.error);
          void recordDeployError({
            sessionId,
            host: selectedHost,
            reason,
            timestamp: Date.now(),
          });
          void recordDeployComplete({
            sessionId,
            host: selectedHost,
            status: 'failed',
            durationMs,
            siteSize: 0,
            fileCount: 0,
            timestamp: Date.now(),
          });
        }
        emitSystemMessage(`Deploy failed: ${message}`);
        studioLog({
          level: 'error',
          source: 'deploy.error',
          sessionId,
          message,
        });
        setDeployState('error');
        setDeployError(message);
        return;
      }

      const deployment = deployResult.value;
      void recordDeployComplete({
        sessionId,
        host: deployment.host,
        status: 'live',
        durationMs: Math.max(0, Date.now() - deployStartedAt),
        siteSize: deployment.siteSize,
        fileCount: deployment.fileCount,
        timestamp: Date.now(),
      });
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
      studioLog({
        level: 'info',
        source: 'deploy.complete',
        sessionId,
        message: 'Deploy completed.',
        details: {
          host: deployment.host,
          url: deployment.url,
        },
      });
      setDeployState('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deploy failed.';
      const durationMs = Math.max(0, Date.now() - deployStartedAt);
      if (selectedHost) {
        void recordDeployError({
          sessionId,
          host: selectedHost,
          reason: 'unknown',
          timestamp: Date.now(),
        });
        void recordDeployComplete({
          sessionId,
          host: selectedHost,
          status: 'failed',
          durationMs,
          siteSize: 0,
          fileCount: 0,
          timestamp: Date.now(),
        });
      }
      emitSystemMessage(`Deploy failed: ${message}`);
      studioLog({
        level: 'error',
        source: 'deploy.exception',
        sessionId,
        message,
      });
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
    recordDeployComplete,
    recordDeployError,
    recordDeployStart,
    emitStudioMessage,
    emitSystemMessage,
    sessionId,
    slotDocs,
  ]);

  const viewportWidth = VIEWPORT_OPTIONS.find((option) => option.id === viewport)?.width ?? '100%';
  const frameStyle = {
    width: viewportWidth,
    maxWidth: '100%',
  } as const;

  return (
    <>
      <header className="flex items-center justify-between">
        <h2 className="font-['JetBrains_Mono'] text-lg font-bold uppercase tracking-[0.22em] text-slate-100">
          {label}
        </h2>
        <span
          className={`rounded-full border px-3 py-1 font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] ${
            !hasGeneratedPreview
              ? 'border-slate-700/80 text-slate-400'
              : activeSlot === 'blue'
              ? 'border-sky-400/60 text-sky-200'
              : 'border-emerald-300/70 text-emerald-200'
          }`}
        >
          {hasGeneratedPreview ? (activeSlot === 'blue' ? 'Blue Live' : 'Green Live') : 'Waiting'}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBar />
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
              <span>Active {hasGeneratedPreview ? activeSlot : '--'}</span>
              <span>Next {hasGeneratedPreview ? incomingSlot : '--'}</span>
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
            {automationPaused ? (
              <>
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={!hasStagedPreview || validationState === 'validating' || isSwapping}
                  className="rounded-full border border-slate-800/80 bg-slate-900/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {validationState === 'passed' ? 'Validated' : 'Validate'}
                </button>
                <button
                  type="button"
                  onClick={handleSwap}
                  disabled={!canSwap}
                  className="rounded-full bg-emerald-300/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSwapping ? 'Swapping' : 'Swap'}
                </button>
              </>
            ) : (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                Auto validate + swap
              </span>
            )}
            <span className="rounded-full border border-slate-800/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
              {hasStagedPreview ? 'Staged build ready' : 'No staged build queued'}
            </span>
            <button
              type="button"
              onClick={onToggleAutomationPause}
              className="rounded-full border border-transparent px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-slate-600 opacity-0 transition hover:border-slate-800/80 hover:opacity-100 focus:opacity-100"
              aria-label={automationPaused ? 'Resume automation' : 'Pause automation'}
              title={automationPaused ? 'Resume automation' : 'Pause automation'}
            >
              {automationPaused ? 'Resume auto' : 'Pause auto'}
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

        {deployState !== 'idle' && (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
              <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.3em] text-slate-500">
                Deploy Status
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-slate-300">
                {deployStateLabel}
              </div>
            </div>
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
        )}

        <div className="relative flex h-[460px] flex-none items-stretch justify-center overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/40 via-slate-900/30 to-slate-950/80 p-4 md:h-[min(72vh,760px)]">
          <div className="relative w-full self-stretch" style={frameStyle}>
            {!hasGeneratedPreview ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
                <ChlorastroliteLoader label="Forging your first preview..." />
              </div>
            ) : (
              <>
                <div
                  data-preview-slot="blue"
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
                      key={`preview-blue-${slotRevisions.blue}`}
                      title="Preview slot blue"
                      sandbox={PREVIEW_IFRAME_SANDBOX}
                      srcDoc={slotDocs.blue}
                      className="block h-full w-full"
                      onLoad={(event) => handleFrameLoad(event, 'blue')}
                      onError={() => {
                        studioLog({
                          level: 'error',
                          source: 'preview.iframe.error',
                          sessionId,
                          message: 'Preview iframe failed to load.',
                          details: {
                            slot: 'blue',
                            revision: slotRevisions.blue,
                          },
                        });
                      }}
                    />
                  </div>
                </div>

                <div
                  data-preview-slot="green"
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
                      key={`preview-green-${slotRevisions.green}`}
                      title="Preview slot green"
                      sandbox={PREVIEW_IFRAME_SANDBOX}
                      srcDoc={slotDocs.green}
                      className="block h-full w-full"
                      onLoad={(event) => handleFrameLoad(event, 'green')}
                      onError={() => {
                        studioLog({
                          level: 'error',
                          source: 'preview.iframe.error',
                          sessionId,
                          message: 'Preview iframe failed to load.',
                          details: {
                            slot: 'green',
                            revision: slotRevisions.green,
                          },
                        });
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
