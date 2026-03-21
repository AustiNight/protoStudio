# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Reading

Before writing any code, read:
- `docs/CONVENTIONS.md` — naming, TypeScript rules, testing requirements, what not to do
- `docs/ARCHITECTURE.md` — system boundaries, data flow, what crosses each layer
- `docs/PATCH-PROTOCOL.md` — patch ops, section anchors, validation rules (when touching VFS/builder)

## Commands

```bash
npm run dev              # Start dev server (includes OpenAI proxy)
npm run build            # Typecheck + Vite build
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint (max-warnings=0)
npm run format           # Prettier check
npm run format:write     # Prettier fix
npm run test             # All vitest tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:imagery     # Imagery regression tests
npm run test:e2e         # Playwright e2e tests
npm run test:watch       # Vitest watch mode
npm run pricing:check    # Verify model pricing (45-day stale check)
npm run deploy:pages     # Deploy to Cloudflare Pages
```

CI enforces: lint → typecheck → unit → integration → imagery → build → **bundle size gate (gzipped JS+CSS ≤ 256 KB)**.

## Architecture

```
UI Layer (React: src/components/, src/app/)
  ↓
Zustand Stores (src/store/)
  ↓
Engine — pure TS, no React, no DOM (src/engine/)
  ↓
VFS + Patch Engine (src/engine/vfs/)
  ↓
Persistence — IndexedDB + AES-256 (src/persistence/)
```

**Layer rules (hard constraints):**
- `engine/` — zero React, zero DOM. All modules must be testable in Node.js with Vitest.
- `components/` — may import from `engine/` and `store/`, never the reverse.
- `store/` — may import from `engine/`.
- `types/` — interfaces only. No implementations, no imports from other `src/` directories.
- All engine functions that can fail return `Result<T, E>` — never throw.
- Use `src/persistence/` layer; never access localStorage directly.

**Key engine subdirectories:**

| Directory | Responsibility |
|-----------|---------------|
| `engine/builder/` | Build loop: backlog → Builder Atoms → patch ops |
| `engine/chat/` | PO logic, first-message classification, backlog decomposition |
| `engine/llm/` | Multi-provider gateway (OpenAI/Anthropic/Google), cost, context mgmt |
| `engine/vfs/` | Virtual filesystem, patch application, assembly |
| `engine/guardrails/` | CSP, accessibility, dark pattern checks |
| `engine/deploy/` | GitHub/Cloudflare/Netlify/Vercel orchestration |
| `engine/imagery/` | Image generation, public-domain lookups, block policy |
| `engine/templates/` | Section catalog and scaffold generation |

**Build flow:**
1. User message → first-message classifier (template vs. scratch)
2. PO logic decomposes into Builder Atoms → backlog
3. On-deck item → Builder → emits JSON patch ops only (no full-file rewrites)
4. Patch engine applies ops to VFS with optimistic version lock
5. Guardrails + continuity checks validate
6. Blue/Green iframe swap on success; cost ticker updates

## Key Conventions

**TypeScript:** Strict mode, no `any`, no `as` casts (except tests). Prefer `interface` over `type` for object shapes. No classes except for engines/managers.

**Naming:** kebab-case files, PascalCase components/interfaces, camelCase functions, UPPER_SNAKE constants.

**Commit format:** `feat(module): description` or `fix(module): description`
Module names: `chat`, `preview`, `backlog`, `builder`, `deploy`, `vfs`, `templates`, `settings`, `store`, `ci`, `docs`

**CSS in generated sites:** BEM class names, all values via `var(--*)` tokens — no hardcoded hex. Studio UI uses Tailwind utilities.

**Patch anchors required in generated HTML/CSS/JS:** `<!-- PP:SECTION:* -->`, `/* PP:BLOCK:* */`, `// PP:FUNC:* */`

**Adding dependencies:** Document in `docs/DECISIONS.md` with rationale + bundle size impact before adding.

## Testing

Every `engine/` module must have a corresponding `.test.ts`. Coverage targets: 80% lines, 80% functions, 70% branches.

Test names: `"should [expected behavior] when [condition]"`

Use fixtures from `tests/fixtures/` — never call live APIs in tests.

Test files live in `tests/unit/`, `tests/integration/`, `tests/e2e/`.

## Environment

Copy `.env.example` to `.env.local` for local dev. Key knobs:
- `VITE_USE_REAL_LLM` — `true` to use real LLM, `false` for mock
- `VITE_DEBUG_LOGS` — enable console logging
- `VITE_DEFAULT_CHAT_PROVIDER` — `openai` | `anthropic` | `google`
- `OPENAI_API_KEY` — used by the local dev proxy (`/api/openai/*`)

Path alias `@/` maps to `./src/`.
