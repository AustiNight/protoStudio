/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_REAL_LLM?: string;
  readonly VITE_DEBUG_LOGS?: string;
  readonly VITE_LOG_VIEWER_ENABLED?: string;
  readonly VITE_LOG_VIEWER_MAX_ENTRIES?: string;
  readonly VITE_BUILDER_LOOP_DELAY_MS?: string;
  readonly VITE_PREVIEW_SWAP_DURATION_MS?: string;
  readonly VITE_PREVIEW_VALIDATION_DURATION_MS?: string;
  readonly VITE_PREVIEW_IFRAME_SANDBOX?: string;
  readonly VITE_DEFAULT_CHAT_PROVIDER?: string;
  readonly VITE_DEFAULT_CHAT_MODEL?: string;
  readonly VITE_DEFAULT_BUILDER_PROVIDER?: string;
  readonly VITE_DEFAULT_BUILDER_MODEL?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_GITHUB_TOKEN?: string;
  readonly VITE_CLOUDFLARE_TOKEN?: string;
  readonly VITE_NETLIFY_TOKEN?: string;
  readonly VITE_VERCEL_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
