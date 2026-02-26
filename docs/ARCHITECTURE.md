# ARCHITECTURE.md - System Design

## Purpose
This document is the source of truth for system shape and boundaries. It explains how the studio is layered, how data flows, and what is allowed to cross each boundary.

## Core Principles
- Local-first, client-only. No studio server required.
- Static output only. Generated sites are hostable on zero-cost static hosts.
- Deterministic, incremental updates. We patch, we do not regenerate.
- Guardrails over speed. Validation gates every swap.
- Security by default. Tokens are encrypted in-browser and never leave the client.

## Layered Architecture

```
User
  |  (chat, settings, backlog)
  v
UI Layer (React) ---------------------> Preview (Blue/Green iframes)
  |                                        |
  v                                        v
Zustand Stores                      srcdoc + CSP
  |
  v
Engine (pure TS)  <----------------- Telemetry + Cost
  |
  v
VFS + Patch Engine
  |
  v
Persistence (IndexedDB)
```

### UI Layer (React)
- Location: `src/components/`, `src/app/`
- Responsibilities: render UI, collect user input, display status and preview.
- Constraints: may use DOM and browser APIs, but does not implement business logic.

### Stores (Zustand)
- Location: `src/store/`
- Responsibilities: UI state, session state, build progress, settings, telemetry.
- Constraints: no direct DOM calls; minimal logic; delegates to engine.

### Engine (Pure TS)
- Location: `src/engine/`
- Responsibilities: build loop, patching, validation, deploy orchestration.
- Constraints: no React, no DOM, no side effects outside injected adapters.
- Error handling: return `Result<T, E>` instead of throwing.

### Persistence
- Location: `src/persistence/`
- Responsibilities: IndexedDB storage, AES-256 encryption wrapper, append-only logs.
- Constraints: local-only storage, no PII in telemetry.

### Types
- Location: `src/types/`
- Responsibilities: interface definitions only.
- Constraints: no implementations; no imports from other src directories.

## Build Flow (High Level)
1. User message enters chat.
2. First-message classifier decides template vs scratch.
3. PO logic decomposes into Builder Atoms and produces backlog.
4. On Deck item is sent to Builder.
5. Builder emits patch operations only (no full files).
6. Patch engine applies ops to VFS with optimistic version lock.
7. Guardrails + continuity checks validate.
8. Blue/Green swap occurs on success.
9. Telemetry and cost ticker update.

## Preview and Swap
- Blue/Green iframes use `srcdoc` and are isolated from the studio UI.
- CSP is enforced on preview content; `eval` is disallowed.
- Swap happens only after validation passes.

## Security Model
- API keys and deploy tokens are encrypted in-browser (AES-256) before storage.
- No keys or tokens are sent to any studio servers.
- No third-party trackers in the studio or generated sites.

## Deployment Model
- Static output only.
- Host priority: GitHub Pages -> Cloudflare Pages -> Netlify -> Vercel (hobby).
- Deploy manager validates bundle and enforces zero-cost constraints.

## Telemetry and Cost
- Telemetry is local-only and stored in IndexedDB.
- Cost ticker uses `src/config/model-pricing.json` with a visible "last updated" date.
- No PII in telemetry.

## Linked Docs
- `docs/CONVENTIONS.md`
- `docs/PATCH-PROTOCOL.md`
- `docs/SECTION-SCHEMA.md`
- `docs/SYSTEM-PROMPTS.md`
- `docs/ZERO-COST-PLAYBOOK.md`
- `docs/BUILD_ENGINE.md`
- `docs/OBSERVABILITY_UX.md`
- `docs/TEMPLATES_ARCH.md`
