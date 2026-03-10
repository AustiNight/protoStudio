# Development Operating Model

## 1. The Reality of Building with AI Agents

### 1.1 What AI Coding Agents Are Good At

| Strength | How to Exploit It |
|---|---|
| Generating boilerplate and scaffolding | Have the agent create entire file structures, configs, and project setup in one pass |
| Implementing a well-specified function | Write detailed specs (inputs, outputs, edge cases) and let the agent implement |
| Writing tests from a contract | Give the agent an interface and acceptance criteria; it writes thorough tests |
| Refactoring with clear before/after | "Move X from file A to file B, update all imports" — agents excel at this |
| Filling in repetitive patterns | 30 section definitions that all follow the same schema — perfect agent work |

### 1.2 What AI Coding Agents Are Bad At

| Weakness | How to Mitigate It |
|---|---|
| Maintaining coherence across 50+ files | Keep tasks scoped to ≤5 files; use a CONVENTIONS.md the agent reads every session |
| Understanding implicit architectural intent | Make ALL architecture explicit in reference docs the agent loads as context |
| Knowing when to stop | Set hard boundaries: "Only modify files X, Y, Z. Do not touch anything else." |
| Remembering decisions from previous sessions | Maintain a living DECISIONS.md log that each session starts by reading |
| Testing their own output honestly | Never trust agent-written tests alone; CI pipeline is the source of truth |

### 1.3 The Key Principle

> **The repo itself is the spec.** Every convention, boundary, and contract must be encoded in files that the agent reads — not in your head.

---

## 2. Repository Structure

Designed for both human understanding and AI agent context-loading:

```
📁 prontoproto-studio/
├── .github/
│   └── workflows/
│       └── ci.yml                  ← Runs on every push/PR (CI only)
│
├── docs/                           ← Agent context documents
│   ├── ARCHITECTURE.md             ← High-level system design (from PRD §2, §5)
│   ├── CONVENTIONS.md              ← Code style, naming, file organization rules
│   ├── DECISIONS.md                ← Append-only log of architectural decisions
│   ├── PATCH-PROTOCOL.md           ← Section anchor spec, patch format, scaffold rules
│   ├── SECTION-SCHEMA.md           ← SectionDefinition interface + examples
│   ├── SYSTEM-PROMPTS.md           ← Chat AI + Builder AI prompts (source of truth)
│   ├── ZERO-COST-PLAYBOOK.md       ← Solution lookup table for the Builder
│   └── WORK-ITEMS.md               ← Current sprint backlog (agent reads this)
│
├── src/
│   ├── app/                        ← App shell and routing
│   │   ├── App.tsx
│   │   ├── Layout.tsx              ← Three-panel layout
│   │   └── main.tsx                ← Entry point
│   │
│   ├── components/                 ← React components (organized by panel)
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── UserBubble.tsx
│   │   │   ├── AiBubble.tsx
│   │   │   ├── SystemMessage.tsx
│   │   │   ├── TypingIndicator.tsx
│   │   │   └── ChatInput.tsx
│   │   ├── preview/
│   │   │   ├── PreviewPanel.tsx
│   │   │   ├── PreviewIframe.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   ├── ResponsiveToggles.tsx
│   │   │   ├── DeployButton.tsx
│   │   │   └── ChlorastroliteLoader.tsx
│   │   ├── backlog/
│   │   │   ├── BacklogPanel.tsx
│   │   │   ├── OnDeckCard.tsx
│   │   │   ├── BacklogList.tsx
│   │   │   ├── BacklogCard.tsx
│   │   │   └── PauseResumeButton.tsx
│   │   ├── settings/
│   │   │   ├── SettingsModal.tsx
│   │   │   ├── ApiKeyInput.tsx
│   │   │   ├── ModelSelector.tsx
│   │   │   ├── TokenInput.tsx
│   │   │   └── ExpandableGuide.tsx
│   │   └── shared/
│   │       ├── HeaderBar.tsx
│   │       ├── CostTicker.tsx
│   │       ├── ConfirmDialog.tsx
│   │       └── NewConversationButton.tsx
│   │
│   ├── engine/                     ← Core logic (no React dependency)
│   │   ├── llm/
│   │   │   ├── gateway.ts          ← Unified LLM interface
│   │   │   ├── providers/
│   │   │   │   ├── openai.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   └── google.ts
│   │   │   ├── cost.ts             ← Cost calculation
│   │   │   └── context.ts          ← Context window budget manager
│   │   ├── builder/
│   │   │   ├── builder-loop.ts     ← On Deck → build → validate → swap cycle
│   │   │   ├── patch-engine.ts     ← Applies patches to VFS
│   │   │   ├── scaffold.ts         ← Scaffold auditor + repairer
│   │   │   ├── continuity.ts       ← Continuity checks
│   │   │   ├── circuit-breaker.ts  ← Retry/skip logic
│   │   │   └── heartbeat.ts        ← Phase timing + timeout detection
│   │   ├── chat/
│   │   │   ├── classifier.ts       ← First-message template vs scratch routing
│   │   │   ├── po-logic.ts         ← Backlog arbitration, decomposition
│   │   │   └── narration.ts        ← Status text generation
│   │   ├── preview/
│   │   │   ├── blue-green.ts       ← Swap manager
│   │   │   └── iframe-bridge.ts    ← postMessage communication
│   │   ├── deploy/
│   │   │   ├── deploy-manager.ts   ← Orchestrates deployment flow
│   │   │   ├── hosts/
│   │   │   │   ├── github-pages.ts
│   │   │   │   ├── netlify.ts
│   │   │   │   └── cloudflare.ts
│   │   │   ├── validators.ts       ← Pre-deploy checks
│   │   │   └── doc-generator.ts    ← Documentation packet
│   │   ├── vfs/
│   │   │   ├── vfs.ts              ← Virtual file system core
│   │   │   ├── snapshots.ts        ← Snapshot manager
│   │   │   └── assembler.ts        ← Template assembly from config
│   │   └── templates/
│   │       ├── section-library.ts  ← All 30 section definitions
│   │       ├── configs/
│   │       │   ├── marketing.json
│   │       │   ├── blog.json
│   │       │   ├── saas-landing.json
│   │       │   ├── portfolio.json
│   │       │   ├── small-business.json
│   │       │   ├── simple-store.json
│   │       │   ├── bookings.json
│   │       │   └── form-to-email.json
│   │       └── sections/           ← HTML/CSS/JS partials per section
│   │           ├── hero/
│   │           │   ├── hero.html
│   │           │   ├── hero.css
│   │           │   └── hero.ts     ← Optional JS module
│   │           ├── nav/
│   │           ├── footer/
│   │           └── ... (30 section directories)
│   │
│   ├── store/                      ← Zustand stores
│   │   ├── session-store.ts
│   │   ├── chat-store.ts
│   │   ├── backlog-store.ts
│   │   ├── build-store.ts
│   │   ├── settings-store.ts
│   │   └── telemetry-store.ts
│   │
│   ├── persistence/                ← IndexedDB + localStorage layer
│   │   ├── db.ts                   ← IndexedDB setup
│   │   ├── encryption.ts           ← AES-256 for keys/tokens
│   │   ├── checkpoint.ts           ← Session recovery
│   │   └── telemetry-log.ts        ← Append-only event log
│   │
│   ├── config/
│   │   ├── model-pricing.json      ← Updatable pricing table
│   │   └── token-guides.ts         ← Deploy token acquisition guide content
│   │
│   └── types/                      ← Shared TypeScript interfaces
│       ├── session.ts
│       ├── chat.ts
│       ├── backlog.ts
│       ├── vfs.ts
│       ├── patch.ts
│       ├── build.ts
│       ├── deploy.ts
│       └── template.ts
│
├── tests/
│   ├── unit/                       ← Pure logic tests (no DOM)
│   │   ├── engine/
│   │   │   ├── patch-engine.test.ts
│   │   │   ├── scaffold.test.ts
│   │   │   ├── continuity.test.ts
│   │   │   ├── circuit-breaker.test.ts
│   │   │   ├── context.test.ts
│   │   │   ├── cost.test.ts
│   │   │   ├── vfs.test.ts
│   │   │   ├── assembler.test.ts
│   │   │   └── classifier.test.ts
│   │   └── persistence/
│   │       └── encryption.test.ts
│   ├── integration/                ← Multi-module tests
│   │   ├── builder-loop.test.ts
│   │   ├── template-assembly.test.ts
│   │   └── deploy-flow.test.ts
│   ├── e2e/                        ← Playwright browser tests
│   │   ├── chat-flow.spec.ts
│   │   ├── backlog-interaction.spec.ts
│   │   ├── preview-swap.spec.ts
│   │   └── settings.spec.ts
│   └── fixtures/
│       ├── patches/                ← Sample valid/invalid patches
│       ├── scaffolds/              ← Sample VFS states at various versions
│       └── llm-responses/          ← Recorded LLM outputs for replay
│
├── public/
│   └── favicon.svg
│
├── index.html                      ← Vite entry point
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── package.json
├── .eslintrc.cjs
├── .prettierrc
└── README.md
```

### 2.1 Why This Structure Matters for AI Agents

| Decision | Reason |
|---|---|
| `engine/` has zero React imports | Agents can work on business logic without needing DOM context. Tests run in Node, no browser needed. |
| `components/` organized by panel | Agent task: "Implement the chat panel" → load only `src/components/chat/*` + `src/store/chat-store.ts` + `src/types/chat.ts`. Minimal context. |
| `docs/` at repo root | Every agent session starts with: "Read docs/CONVENTIONS.md and docs/ARCHITECTURE.md before writing any code." |
| `types/` separated from implementation | Agent can read interfaces to understand contracts without loading implementation files. |
| `tests/fixtures/` with recorded LLM responses | Agent-written tests can replay real LLM outputs without making API calls. Deterministic tests. |
| Section partials in individual directories | Agent task: "Create the testimonials section" → one directory, three files, follows `SECTION-SCHEMA.md`. |

---

## 3. CI/CD Pipeline

### 3.1 Pipeline Overview

```
Developer + AI Agent
        │
        │ git push (feature branch)
        ▼
┌──────────────────────────────────────────────────┐
│  GitHub Actions: ci.yml                           │
│                                                    │
│  ┌────────────────┐                               │
│  │ 1. Install     │  npm ci                       │
│  └───────┬────────┘                               │
│  ┌───────▼────────┐                               │
│  │ 2. Lint        │  eslint + prettier --check    │
│  └───────┬────────┘                               │
│  ┌───────▼────────┐                               │
│  │ 3. Type Check  │  tsc --noEmit                 │
│  └───────┬────────┘                               │
│  ┌───────▼────────┐                               │
│  │ 4. Unit Tests  │  vitest run (engine/, persist/)│
│  └───────┬────────┘                               │
│  ┌───────▼────────┐                               │
│  │ 5. Build       │  vite build                   │
│  └───────┬────────┘                               │
│  ┌───────▼────────┐                               │
│  │ 6. Integration │  vitest run tests/integration/ │
│  │    Tests       │                                │
│  └───────┬────────┘                               │
│  ┌───────▼────────────────┐                       │
│  │ 7. Bundle Analysis     │  check output < 500KB │
│  └───────┬────────────────┘                       │
│          │                                         │
│          │ All pass?                               │
│          ├──── YES ──► ✅ PR is mergeable          │
│          └──── NO  ──► ❌ Block merge              │
└──────────────────────────────────────────────────┘
        │
        │ PR merged to main
        ▼
┌──────────────────────────────────────────────────┐
│  Cloudflare Pages Git Integration                 │
│                                                    │
│  1. Watches the production branch                 │
│  2. Runs the configured build command             │
│  3. Publishes the built `dist/` output            │
│  4. Serves preview and production deploys         │
│  5. Custom domain points at the Pages project     │
└──────────────────────────────────────────────────┘
```

### 3.2 Cloudflare Pages Deployments

Cloudflare Pages owns production hosting for this repo.

- The current bootstrap path is direct upload to the `prontoproto-studio` Pages project.
- Local redeploy command: `npm run deploy:pages`.
- GitHub Actions remain CI-only and should not duplicate deploy ownership.
- Native Git integration remains a valid follow-up once domain/account access is consolidated.

### 3.3 CI Workflow (Full)

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --reporter=verbose --coverage
      - name: Check coverage thresholds
        run: |
          # Enforce minimum coverage on engine/ code
          npx vitest run --coverage.thresholds.lines=80 \
                         --coverage.thresholds.functions=80 \
                         --coverage.thresholds.branches=70

  build:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Bundle size check
        run: |
          SIZE=$(du -sk dist/ | cut -f1)
          echo "Bundle size: ${SIZE}KB"
          if [ "$SIZE" -gt 512 ]; then
            echo "::error::Bundle exceeds 512KB limit (${SIZE}KB)"
            exit 1
          fi
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  integration-tests:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration
```

### 3.4 Package Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint src/ --ext .ts,.tsx --max-warnings 0",
    "lint:fix": "eslint src/ --ext .ts,.tsx --fix",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run tests/unit/",
    "test:integration": "vitest run tests/integration/",
    "test:e2e": "playwright test",
    "test": "npm run test:unit && npm run test:integration",
    "test:watch": "vitest watch tests/unit/"
  }
}
```

---

## 4. Agent Workflow — How You Actually Work Day-to-Day

### 4.1 The Session Protocol

Every coding session with an AI agent follows this protocol:

```
┌────────────────────────────────────────────────────────┐
│  SESSION START                                          │
│                                                          │
│  1. Agent reads context documents:                      │
│     • docs/CONVENTIONS.md                               │
│     • docs/ARCHITECTURE.md                              │
│     • docs/DECISIONS.md (tail — last 10 decisions)      │
│     • docs/WORK-ITEMS.md (current sprint)               │
│                                                          │
│  2. You specify the work item:                          │
│     "Implement WI-024: Patch Engine core"               │
│                                                          │
│  3. Agent reads relevant type files:                    │
│     • src/types/patch.ts                                │
│     • src/types/vfs.ts                                  │
│                                                          │
│  4. Agent reads relevant test fixtures:                 │
│     • tests/fixtures/patches/                           │
│     • tests/fixtures/scaffolds/                         │
│                                                          │
│  5. Agent implements (write code + tests together)      │
│                                                          │
│  6. Agent runs local validation:                        │
│     npm run typecheck && npm run test:unit              │
│                                                          │
│  7. YOU review the diff                                 │
│                                                          │
│  8. If changes affect architecture, agent appends       │
│     to docs/DECISIONS.md                                │
│                                                          │
│  9. git commit → push → CI runs → PR (if feature branch)│
└────────────────────────────────────────────────────────┘
```

### 4.2 CONVENTIONS.md (Critical File)

This is the most important file in the repo for agent quality. Every rule here prevents a class of agent mistakes:

```markdown
# CONVENTIONS.md — prontoproto.studio

## Read This First
Every coding session must begin by reading this file. Do not write any
code that violates these conventions. If a convention seems wrong, 
propose a change — do not silently deviate.

## File Organization
- `engine/` contains pure business logic. ZERO React imports. ZERO DOM APIs.
  Every module in engine/ must be testable with `vitest` in Node.js.
- `components/` contains React components. They may import from `engine/`
  and `store/` but never the reverse.
- `store/` contains Zustand stores. They may import from `engine/`.
- `types/` contains TypeScript interfaces only. No implementations.
  No imports from other src/ directories.

## Naming
- Files: kebab-case (`patch-engine.ts`, `chat-panel.tsx`)
- React components: PascalCase (`ChatPanel`, `BacklogCard`)
- Functions: camelCase (`applyPatch`, `validateScaffold`)
- Interfaces: PascalCase, no `I` prefix (`WorkItem`, not `IWorkItem`)
- Constants: UPPER_SNAKE (`MAX_RETRY_ATTEMPTS`, `PHASE_TIMEOUTS`)
- CSS classes in generated sites: BEM (`testimonials__card--featured`)
- CSS classes in studio UI: Tailwind utility classes

## TypeScript
- Strict mode. No `any`. No `as` casts except in test files.
- Prefer `interface` over `type` for object shapes.
- All functions that can fail return `Result<T, E>`, not throw.
- No classes except where state encapsulation is required (engines,
  managers). Prefer plain functions + closures.

## Error Handling
- Never throw in engine/ code. Return Result types.
- Components may use error boundaries for unexpected errors.
- All errors must be categorized: 'retryable' | 'user_action' | 'fatal'

## Testing
- Every engine/ module must have a corresponding .test.ts file.
- Tests use fixtures from tests/fixtures/, never call live APIs.
- Test names: "should [expected behavior] when [condition]"
- Minimum coverage: 80% lines, 80% functions, 70% branches for engine/

## Section Template Conventions
- See docs/SECTION-SCHEMA.md for the full SectionDefinition interface.
- Every section directory contains: [name].html, [name].css,
  optionally [name].ts
- All CSS must use var(--*) for colors, fonts, and spacing.
  Never hardcoded hex values.
- All HTML must include PP:SECTION comment anchors.
- All CSS must include PP:BLOCK comment anchors.
- All JS must include PP:FUNC comment anchors.

## Commit Messages
- Format: `feat(module): description` or `fix(module): description`
- Module names: chat, preview, backlog, builder, deploy, vfs, templates,
  settings, store, ci, docs
- Example: `feat(builder): implement patch engine with scaffold validation`

## What NOT To Do
- Do not add dependencies without documenting in DECISIONS.md with
  rationale + bundle size impact.
- Do not modify docs/ARCHITECTURE.md without explicit approval.
- Do not create files outside the established directory structure.
- Do not import from `engine/` into `types/`.
- Do not use localStorage directly — use the persistence/ layer.
```

### 4.3 DECISIONS.md (Append-Only)

```markdown
# DECISIONS.md — Architectural Decision Log

## Format
Each entry: date, decision, rationale, alternatives considered.
APPEND ONLY. Never edit or delete previous entries.

---

### D-001 | 2026-02-25 | Zustand over Redux for state management
**Decision:** Use Zustand for all client-side state.
**Rationale:** Single-user app; no middleware needed; 1KB bundle;
simpler mental model for AI agents to work with.
**Alternatives:** Redux Toolkit (too heavy), Jotai (atomic model 
adds complexity for this use case), React Context (performance 
concerns with frequent updates).

### D-002 | 2026-02-25 | Vitest over Jest for testing
**Decision:** Use Vitest for all unit and integration tests.
**Rationale:** Native Vite integration; faster startup; ESM-native;
same config as build tool.
**Alternatives:** Jest (slower, needs transforms for ESM).

(new entries appended here by agents)
```

### 4.4 Branch Strategy

Simple trunk-based development with short-lived feature branches:

```
main (protected — requires CI pass + 1 review)
  │
  ├── feat/wi-001-project-scaffold
  ├── feat/wi-005-chat-components
  ├── feat/wi-012-patch-engine
  └── fix/wi-012-scaffold-audit-edge-case
```

| Rule | Enforcement |
|---|---|
| All pushes to `main` go through PR | GitHub branch protection |
| CI must pass before merge | Required status checks |
| PRs should be small (≤500 lines changed) | Convention — agents produce focused PRs |
| Feature branches live ≤3 days | Convention — merge or abandon |
| No direct commits to `main` | Branch protection |

### 4.5 Agent Task Sizing — Matching Builder Atoms

Just like the Builder uses atoms for generated sites, we use **agent atoms** for studio development:

| Property | Target | Hard Limit |
|---|---|---|
| Files created/modified | 2–5 | ≤ 8 |
| Lines of code | 100–300 | ≤ 500 |
| Test coverage for new code | ≥80% | Must pass CI threshold |
| Context documents needed | 2–3 (CONVENTIONS + relevant types + one doc) | ≤ 5 |
| Session duration | 30–60 minutes | ≤ 90 minutes (context degrades) |

---

## 5. Testing Strategy

### 5.1 Test Pyramid

```
         ╱ ╲
        ╱ E2E ╲           2-3 critical flows
       ╱ (slow) ╲         Playwright in real browser
      ╱───────────╲
     ╱ Integration  ╲      10-15 multi-module flows
    ╱  (medium)      ╲     Vitest, no browser
   ╱──────────────────╲
  ╱    Unit Tests       ╲   100+ focused tests
 ╱     (fast)            ╲  Vitest, pure functions
╱────────────────────────╲
```

### 5.2 What Gets Tested Where

| Module | Unit Tests | Integration Tests | E2E Tests |
|---|---|---|---|
| `engine/builder/patch-engine.ts` | ✅ Apply valid patch; reject invalid; scaffold check | ✅ Full build loop with mocked LLM | — |
| `engine/builder/scaffold.ts` | ✅ Audit healthy scaffold; detect corruption; auto-repair | — | — |
| `engine/builder/circuit-breaker.ts` | ✅ Retry counting; state transitions; skip behavior | — | — |
| `engine/builder/continuity.ts` | ✅ Each check independently; pass/fail scenarios | — | — |
| `engine/llm/gateway.ts` | ✅ Provider routing; cost calculation; error handling | ✅ Full request/response with recorded fixtures | — |
| `engine/llm/context.ts` | ✅ Budget calculation; conversation trimming; overflow handling | — | — |
| `engine/vfs/vfs.ts` | ✅ CRUD operations; versioning; hashing | — | — |
| `engine/vfs/assembler.ts` | ✅ Template assembly from config; slot filling; constraint validation | ✅ Assemble each of 8 templates, validate output | — |
| `engine/chat/classifier.ts` | ✅ Template matching with fixture first-messages | — | — |
| `engine/deploy/validators.ts` | ✅ Pre-deploy checks (no node_modules, valid HTML) | — | — |
| `persistence/encryption.ts` | ✅ Encrypt/decrypt roundtrip; key format validation | — | — |
| `components/chat/*` | — | — | ✅ Send message, see response, scroll behavior |
| `components/backlog/*` | — | — | ✅ Drag/drop, focus, pause/resume |
| `components/preview/*` | — | — | ✅ Loader → preview swap animation |

### 5.3 LLM Test Fixtures

Agent-written tests must never call live LLM APIs. Instead, we record representative responses:

```
tests/fixtures/llm-responses/
├── classification/
│   ├── template-match-marketing.json    ← "Build me a landing page for my SaaS"
│   ├── template-match-portfolio.json    ← "I'm a photographer and need a portfolio"
│   ├── scratch-match.json              ← "Build me a zodiac greeting card maker"
│   └── ambiguous.json                  ← "I need a website" (low confidence)
├── patches/
│   ├── valid-section-replace.json      ← Well-formed SectionReplace patch
│   ├── valid-section-insert.json       ← Well-formed SectionInsert patch
│   ├── valid-css-append.json           ← Well-formed CssAppend patch
│   ├── invalid-malformed-json.txt      ← LLM returned non-JSON
│   ├── invalid-wrong-schema.json       ← Valid JSON, missing required fields
│   ├── invalid-wrong-section.json      ← References nonexistent section
│   └── invalid-scaffold-break.json     ← Patch that would corrupt anchors
├── backlog/
│   ├── small-business-decomposition.json ← Full backlog from first message
│   └── blog-decomposition.json
└── narration/
    └── swap-messages.json              ← Chat messages for completed atoms
```

---

## 6. Work Items — The Initial Backlog

Organized in dependency order. Each work item follows the agent atom sizing constraints. The `WI-` prefix is the task ID referenced in `docs/WORK-ITEMS.md` and commit messages.

### Sprint 0: Project Foundation (Days 1–2)

These must be done first and are sequential. They establish the scaffold that everything else builds on.

| WI | Title | Files | Tests | Depends On |
|---|---|---|---|---|
| **WI-001** | Initialize Vite + React + TypeScript project with Tailwind | `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `index.html`, `src/app/main.tsx` | Build succeeds; lint passes | — |
| **WI-002** | Create CI pipeline (GitHub Actions) | `.github/workflows/ci.yml` | CI runs and passes on push | WI-001 |
| **WI-003** | Write foundational docs | `docs/CONVENTIONS.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/PATCH-PROTOCOL.md`, `docs/SECTION-SCHEMA.md` | Docs exist and are referenced by CI readme check | WI-001 |
| **WI-004** | Define all TypeScript interfaces | `src/types/session.ts`, `chat.ts`, `backlog.ts`, `vfs.ts`, `patch.ts`, `build.ts`, `deploy.ts`, `template.ts` | `tsc --noEmit` passes; no implementations | WI-001 |

### Sprint 1: Core Engine — No UI (Days 3–8)

All `engine/` modules. Pure logic, fully testable, no React.

| WI | Title | Files | Tests | Depends On |
|---|---|---|---|---|
| **WI-005** | Implement VFS core (create, read, update, delete, version, hash) | `engine/vfs/vfs.ts` | 12+ unit tests covering CRUD, versioning, hash integrity | WI-004 |
| **WI-006** | Implement VFS snapshot manager | `engine/vfs/snapshots.ts` | 6+ tests: save, prune, rollback, max snapshot enforcement | WI-005 |
| **WI-007** | Implement patch engine (apply operations to VFS) | `engine/builder/patch-engine.ts` | 15+ tests: each PatchOperation type, version lock, schema validation | WI-005 |
| **WI-008** | Implement scaffold auditor and repairer | `engine/builder/scaffold.ts` | 10+ tests: healthy scaffold, each corruption type, auto-repair, health score calculation | WI-005 |
| **WI-009** | Implement continuity checks | `engine/builder/continuity.ts` | 8+ tests: each check (theme, nav, unrelated changes, css vars, section count) | WI-007, WI-008 |
| **WI-010** | Implement circuit breaker | `engine/builder/circuit-breaker.ts` | 6+ tests: counting, state transitions, skip trigger, reset on success | WI-004 |
| **WI-011** | Implement heartbeat monitor with phase timeouts | `engine/builder/heartbeat.ts` | 5+ tests: warning threshold, timeout threshold, phase transitions | WI-004 |
| **WI-012** | Implement LLM gateway (provider abstraction + cost calculation) | `engine/llm/gateway.ts`, `engine/llm/cost.ts`, `engine/llm/providers/openai.ts` | 8+ tests: routing, cost calc, error handling, unknown model | WI-004 |
| **WI-013** | Add Anthropic and Google providers | `engine/llm/providers/anthropic.ts`, `engine/llm/providers/google.ts` | 4+ tests per provider | WI-012 |
| **WI-014** | Implement context budget manager | `engine/llm/context.ts` | 8+ tests: budget calculation, conversation trimming, overflow handling, minimal context mode | WI-012 |
| **WI-015** | Implement narration layer (status text + chat message generation) | `engine/chat/narration.ts` | 10+ tests: each build phase → text mapping, slow messages, swap messages, skip messages | WI-004 |
| **WI-016** | Implement first-message classifier | `engine/chat/classifier.ts` | 8+ tests using fixture first-messages: each template match, scratch match, ambiguous | WI-004 |
| **WI-017** | Implement encryption module (AES-256 for keys/tokens) | `persistence/encryption.ts` | 5+ tests: roundtrip, invalid key, empty input | WI-004 |
| **WI-018** | Implement IndexedDB persistence layer | `persistence/db.ts`, `persistence/checkpoint.ts`, `persistence/telemetry-log.ts` | 6+ tests: CRUD, checkpoint save/restore, append-only log | WI-004 |

### Sprint 2: Template System (Days 9–14)

| WI | Title | Files | Tests | Depends On |
|---|---|---|---|---|
| **WI-019** | Define section library schema and implement 5 universal sections (hero, nav, footer, contact, seo-base) | `engine/templates/section-library.ts`, 5 section directories under `sections/` | 5+ tests: each section validates against schema, anchors are correct | WI-004, WI-008 |
| **WI-020** | Implement 4 near-universal sections (about, features-grid, testimonials, cta-banner) | 4 section directories | 4+ tests | WI-019 |
| **WI-021** | Implement template assembler (config → VFS) | `engine/vfs/assembler.ts` | 5+ tests: assemble from config, slot filling, constraint validation, dependency check | WI-005, WI-019 |
| **WI-022** | Create configs for first 3 templates (marketing, portfolio, small-business) | `configs/marketing.json`, `configs/portfolio.json`, `configs/small-business.json` | 3 integration tests: assemble each, validate output has correct sections | WI-021 |
| **WI-023** | Implement 9 shared sections (faq, pricing, filterable-grid, lightbox, category-filter, services-list, team, hours-location, reviews-embed) | 9 section directories | 9+ tests | WI-019 |
| **WI-024** | Implement 12 specialist sections (blog-listing, blog-detail, rss, feature-comparison, project-gallery, product-cards, cart, stripe-checkout, calendar-embed, service-menu, multi-step-form, form-confirmation) | 12 section directories | 12+ tests | WI-019 |
| **WI-025** | Create configs for remaining 5 templates (blog, saas-landing, simple-store, bookings, form-to-email) | 5 config files | 5 integration tests | WI-021, WI-023, WI-024 |

### Sprint 3: UI Shell (Days 15–20)

| WI | Title | Files | Tests | Depends On |
|---|---|---|---|---|
| **WI-026** | Implement three-panel layout with responsive behavior | `app/Layout.tsx`, `components/shared/HeaderBar.tsx` | Build succeeds; layout renders | WI-001 |
| **WI-027** | Implement ChatPanel with iMessage-style bubbles | `components/chat/ChatPanel.tsx`, `MessageList.tsx`, `UserBubble.tsx`, `AiBubble.tsx`, `SystemMessage.tsx`, `TypingIndicator.tsx`, `ChatInput.tsx` | Build succeeds; visual review | WI-026 |
| **WI-028** | Implement Zustand stores (session, chat, backlog, build, settings, telemetry) | All files in `store/` | 10+ unit tests on store actions | WI-004, WI-017, WI-018 |
| **WI-029** | Implement ChlorastroliteLoader with gem/eye variants and dynamic labels | `components/preview/ChlorastroliteLoader.tsx` | Build succeeds; both variants render; visual review | WI-026 |
| **WI-030** | Implement PreviewPanel with blue/green iframes + status bar | `components/preview/PreviewPanel.tsx`, `PreviewIframe.tsx`, `StatusBar.tsx`, `ResponsiveToggles.tsx` | Build succeeds; status bar updates | WI-026, WI-029 |
| **WI-031** | Implement blue/green swap manager (iframe bridge) | `engine/preview/blue-green.ts`, `engine/preview/iframe-bridge.ts` | 5+ tests: swap, inject srcdoc, postMessage handling | WI-005 |
| **WI-032** | Implement BacklogPanel with On Deck, drag/drop, focus, pause | `components/backlog/BacklogPanel.tsx`, `OnDeckCard.tsx`, `BacklogList.tsx`, `BacklogCard.tsx`, `PauseResumeButton.tsx` | Build succeeds; visual review | WI-026, WI-028 |
| **WI-033** | Implement SettingsModal (LLM Keys, Models, Deploy Tokens tabs) | `components/settings/SettingsModal.tsx`, `ApiKeyInput.tsx`, `ModelSelector.tsx`, `TokenInput.tsx`, `ExpandableGuide.tsx` | Build succeeds; keys encrypt/persist | WI-017, WI-026 |
| **WI-034** | Implement CostTicker with hover breakdown | `components/shared/CostTicker.tsx` | Build succeeds; displays mock cost data | WI-012, WI-026 |
| **WI-035** | Implement NewConversationButton with confirmation dialog + reset | `components/shared/NewConversationButton.tsx`, `ConfirmDialog.tsx` | Reset clears state; loader appears | WI-028, WI-029 |

### Sprint 4: Integration — Wire It All Together (Days 21–28)

| WI | Title | Files | Tests | Depends On |
|---|---|---|---|---|
| **WI-036** | Wire LLM Gateway to Chat AI: first message → classifier → template assembly → preview | Cross-cutting: connects gateway, classifier, assembler, store, preview | 1 integration test: mock LLM, send first message, verify preview shows assembled template | WI-012, WI-016, WI-021, WI-031 |
| **WI-037** | Implement PO logic: backlog generation from first message response | `engine/chat/po-logic.ts` | 5+ tests: decomposition rules, atom sizing self-audit, dependency ordering | WI-004, WI-015, WI-016 |
| **WI-038** | Wire PO to backlog panel: generated items appear in UI | Connects po-logic, backlog-store, BacklogPanel | 1 integration test: PO generates items, they appear in panel with correct states | WI-032, WI-037 |
| **WI-039** | Implement full builder loop: On Deck → context assembly → LLM → patch → validate → swap | `engine/builder/builder-loop.ts` | 3 integration tests: successful build, retry on bad patch, circuit breaker skip | WI-007, WI-009, WI-010, WI-011, WI-014, WI-031 |
| **WI-040** | Wire builder loop to UI: status bar updates, chat messages on swap/skip, backlog state transitions | Connects builder-loop, narration, stores, StatusBar, chat | 1 integration test: full cycle from On Deck through swap with UI state assertions | WI-015, WI-030, WI-039 |
| **WI-041** | Implement backlog drag/drop → PO arbitration → accept/deny with animation | Connects BacklogList drag events, po-logic.evaluateReorder, store updates | 2 tests: approved reorder, denied reorder with revert | WI-032, WI-037 |
| **WI-042** | Implement focus-chat mode: click backlog item → contextual chat | Connects BacklogCard click, chat-store context switch, ChatInput hint | 1 test: focus item, send message, verify context includes item | WI-027, WI-032 |
| **WI-043** | Implement session recovery: checkpoint detection, resume dialog | Connects checkpoint persistence, recovery UI | 2 tests: crash simulation → reload → recovery offered; fresh load → no recovery | WI-018, WI-028 |

### Sprint 5: Deploy & Polish (Days 29–36)

| WI | Title | Files | Tests | Depends On |
|---|---|---|---|---|
| **WI-044** | Implement GitHub Pages deploy (create repo, push, enable Pages) | `engine/deploy/hosts/github-pages.ts` | 3 tests with mocked GitHub API: create, push, enable | WI-004 |
| **WI-045** | Implement Netlify deploy | `engine/deploy/hosts/netlify.ts` | 3 tests with mocked API | WI-004 |
| **WI-046** | Implement Cloudflare Pages deploy | `engine/deploy/hosts/cloudflare.ts` | 3 tests with mocked API | WI-004 |
| **WI-047** | Implement deploy manager (host selection, pre-deploy validation, orchestration) | `engine/deploy/deploy-manager.ts`, `engine/deploy/validators.ts` | 5+ tests: host selection logic, validation pass/fail, token availability gating | WI-044, WI-045, WI-046 |
| **WI-048** | Implement documentation packet generator | `engine/deploy/doc-generator.ts` | 3 tests: generates all 7 sections, applies user branding, outputs valid Markdown | WI-005 |
| **WI-049** | Wire deploy flow to UI: DeployButton → progress in chat → live URL → doc download | Connects deploy-manager, stores, DeployButton, chat | 1 integration test with mocked deploy | WI-030, WI-047, WI-048 |
| **WI-050** | E2E test: full template path (first message → preview → 3 builds → deploy) | `tests/e2e/template-flow.spec.ts` | 1 Playwright test with mocked LLM | All above |
| **WI-051** | E2E test: backlog interactions (drag, focus-chat, pause/resume) | `tests/e2e/backlog-interaction.spec.ts` | 1 Playwright test | All above |
| **WI-052** | Token acquisition guide content + validation wiring | `config/token-guides.ts`, wire to SettingsModal | All 3 guides render; validation calls fire on paste | WI-033 |
| **WI-053** | Model pricing config file + unknown model handling | `config/model-pricing.json`, update cost.ts | 3 tests: known model, unknown model, stale date display | WI-012 |

---

## 7. Recommended Day-by-Day Kickoff Plan

For the first two weeks — the most critical period:

| Day | Focus | Work Items | Milestone |
|---|---|---|---|
| **Day 1** | Project init + CI | WI-001, WI-002, WI-003 | ✅ Empty app builds and is ready for Cloudflare Pages Git integration |
| **Day 2** | Type definitions + first engine module | WI-004, WI-005 | ✅ All interfaces defined; VFS core tested |
| **Day 3** | VFS snapshots + patch engine | WI-006, WI-007 | ✅ Can apply patches to VFS with validation |
| **Day 4** | Scaffold health + continuity | WI-008, WI-009 | ✅ Scaffold auditing and continuity checks pass |
| **Day 5** | Circuit breaker + heartbeat + encryption | WI-010, WI-011, WI-017 | ✅ Builder resilience layer complete |
| **Day 6** | LLM gateway + cost calculation | WI-012, WI-013 | ✅ Can call all 3 providers; cost tracking works |
| **Day 7** | Context manager + narration + classifier | WI-014, WI-015, WI-016 | ✅ Full builder intelligence layer complete |
| **Day 8** | IndexedDB persistence | WI-018 | ✅ **Milestone: All engine/ code complete and tested** |
| **Day 9-10** | Universal + near-universal sections + assembler | WI-019, WI-020, WI-021 | ✅ Can assemble a site from template config |
| **Day 11** | First 3 template configs | WI-022 | ✅ Marketing, Portfolio, SmallBiz templates work |
| **Day 12-13** | Remaining sections | WI-023, WI-024 | ✅ All 30 sections defined |
| **Day 14** | Remaining configs | WI-025 | ✅ **Milestone: Full template library complete** |

> **After Day 14** you have a fully tested engine with zero UI — but everything behind the scenes works. Days 15+ layer the React UI on top of proven, tested logic.

---

## 8. What Success Looks Like at Each Milestone

| Milestone | Day | Proof |
|---|---|---|
| **M1: "It builds and deploys"** | 1 | Empty Vite app live at preview URL; CI green |
| **M2: "The engine works"** | 8 | `npm run test:unit` passes 80+ tests; zero engine/ code has React imports |
| **M3: "Templates assemble"** | 14 | `npm run test:integration` passes; all 8 templates produce valid HTML/CSS with correct anchors |
| **M4: "It looks like a studio"** | 20 | Three-panel layout renders; chat sends/receives mock messages; loader animates; backlog cards drag |
| **M5: "First end-to-end flow"** | 28 | Type a first message → see a template preview → watch 3 iterative builds swap in → backlog updates |
| **M6: "Deployable"** | 36 | Click deploy → site goes live on GitHub Pages → documentation packet downloads |

---
