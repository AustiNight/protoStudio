# WORK_ITEMS.md — prontoproto.studio Sprint Backlog

> **How to use this file:**
>
> 1. **AI agents:** Read this file at the start of every coding session.
>    Find the next work item with status `⬜ TODO` whose dependencies
>    are all `✅ DONE`. That is your task.
> 2. **On completion:** Change the status to `✅ DONE` and append the
>    completion date. Do NOT delete or rewrite previous entries.
> 3. **If blocked:** Change status to `🟡 BLOCKED` and add a note.
> 4. **If split:** Change status to `🔀 SPLIT` and reference the new
>    sub-item IDs.
>
> **Status legend:**
> - `⬜ TODO` — Not started
> - `🔵 IN PROGRESS` — Agent is actively working on this
> - `✅ DONE` — Merged to main; CI green
> - `🟡 BLOCKED` — Waiting on something (see notes)
> - `🔀 SPLIT` — Decomposed into smaller items
> - `⏭️ DEFERRED` — Moved to a future sprint

---

## Sequencing Roadmap (Dependency Order)

Execution order (complete upstream before starting downstream):

1. Project Scaffold
2. CI/CD
3. Foundational Docs
4. Type Contracts
5. VFS Core
6. Snapshot Manager
7. Patch Engine
8. Scaffold/Continuity
9. Section Library
10. Template Configs
11. UI Shell/Panels
12. Builder/PO Wiring
13. Deploy Flows
14. E2E Suites

Dependency Gate Checklist (CI/PR):

- [ ] All listed dependencies for the work item(s) are `✅ DONE` in this file.
- [ ] The roadmap stage above this item is complete (no upstream stage left `⬜ TODO`, `🔵 IN PROGRESS`, or `🟡 BLOCKED`).
- [ ] If an exception is required, it is documented in `docs/DECISIONS.md` with owner sign-off.
- [ ] The work item ID(s) are referenced in the PR description.

If any box is unchecked, the PR must not merge.

---

## Sprint 0 — Project Foundation

**Goal:** Empty app builds, deploys, and CI is green. All conventions
documented. All TypeScript interfaces defined.

**Milestone M1:** Empty Vite app live at Cloudflare Pages preview URL
with passing CI.

---

### WI-001 · Initialize Project Scaffold

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | — (start here) |
| **Sprint** | 0 |
| **Estimated effort** | S |

**Files to create:**

```
package.json
vite.config.ts
tsconfig.json
tailwind.config.ts
postcss.config.cjs
.eslintrc.cjs
.prettierrc
index.html
src/app/main.tsx
src/app/App.tsx
public/favicon.svg
README.md
```

**Agent instructions:**

1. Initialize a Vite project with the `react-ts` template.
2. Add Tailwind CSS 4 with PostCSS.
3. Configure ESLint with `@typescript-eslint` and Prettier integration.
4. Enable TypeScript strict mode in `tsconfig.json`.
5. Set up path aliases: `@/` → `src/`.
6. The `App.tsx` should render a single centered `<h1>` that reads
   "prontoproto.studio" — placeholder only.
7. `favicon.svg` should be a simple green gemstone shape (matches the
   ChlorastroliteLoader aesthetic).

**Acceptance criteria:**

- [ ] `npm run dev` starts the dev server and renders the placeholder
- [ ] `npm run build` produces a `dist/` folder with no errors
- [ ] `npm run lint` passes with zero warnings
- [ ] `tsc --noEmit` passes
- [ ] Tailwind utility classes work in `App.tsx`
- [ ] Path alias `@/` resolves correctly

**Do NOT:**

- Add any dependencies beyond: react, react-dom, vite, tailwindcss,
  postcss, eslint, prettier, typescript, @types/react, @types/react-dom
- Create any directories beyond the ones listed above

---

### WI-002 · Create CI/CD Pipelines

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-001 |
| **Sprint** | 0 |
| **Estimated effort** | S |

**Files to create:**

```
.github/workflows/ci.yml
.github/workflows/deploy-preview.yml
.github/workflows/deploy-production.yml
```

**Agent instructions:**

1. `ci.yml` runs on push and PR to `main`. Jobs:
   - `lint-and-typecheck`: npm ci → eslint → tsc --noEmit
   - `unit-tests` (needs lint-and-typecheck): npm ci → vitest run tests/unit/
     (will be empty initially — that's fine, it should pass with 0 tests)
   - `build` (needs lint-and-typecheck): npm ci → vite build → check bundle
     size < 512KB
   - `integration-tests` (needs build): npm ci → vitest run tests/integration/
     (empty initially)
2. `deploy-preview.yml` runs on PR to `main`. Uses
   `cloudflare/wrangler-action@v3` to deploy `dist/` to Cloudflare Pages
   with the branch name. Requires secrets: `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`.
3. `deploy-production.yml` runs on push to `main` only. Runs full CI
   first, then deploys to Cloudflare Pages production. Tags the commit
   with an auto-incrementing patch version (`v0.0.x`).
4. Add `vitest` as a dev dependency. Create `vitest.config.ts` that
   mirrors the Vite config. Create empty `tests/unit/` and
   `tests/integration/` directories with a `.gitkeep` in each.
5. Add scripts to `package.json`:
   ```
   "test:unit": "vitest run tests/unit/",
   "test:integration": "vitest run tests/integration/",
   "test": "vitest run",
   "test:watch": "vitest watch tests/unit/",
   "typecheck": "tsc --noEmit"
   ```

**Acceptance criteria:**

- [ ] Pushing to a feature branch triggers `ci.yml`; all jobs pass
- [ ] Opening a PR triggers `deploy-preview.yml` (may fail until CF
      secrets are configured — that's expected; the workflow file must be
      syntactically valid)
- [ ] `npm run test:unit` exits 0 (no tests, no failures)
- [ ] `npm run build` still succeeds after adding vitest

**Do NOT:**

- Add Playwright or any E2E tooling yet (that comes later)
- Configure coverage thresholds yet (no code to cover)

---

### WI-003 · Write Foundational Documentation

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-001 |
| **Sprint** | 0 |
| **Estimated effort** | M |

**Files to create:**

```
docs/CONVENTIONS.md
docs/ARCHITECTURE.md
docs/DECISIONS.md
docs/PATCH-PROTOCOL.md
docs/SECTION-SCHEMA.md
docs/SYSTEM-PROMPTS.md
docs/ZERO-COST-PLAYBOOK.md
```

**Agent instructions:**

These documents are provided in the PRD and supporting design documents.
Transcribe them accurately into standalone Markdown files:

1. `CONVENTIONS.md` — Copy the full conventions specification from the
   Development Operating Model §4.2. This is the most important file in
   the repo. Every future agent session begins by reading it.
2. `ARCHITECTURE.md` — Transcribe PRD §2 (architecture overview) and §5
   (technical architecture) into a single reference document. Include
   the ASCII diagrams. Add a section listing every directory in `src/`
   with a one-line description of its purpose.
3. `DECISIONS.md` — Create with the header format and the first two
   entries (D-001: Zustand, D-002: Vitest). This file is append-only.
4. `PATCH-PROTOCOL.md` — Transcribe the patch format specification from
   the Iterative Build Engine design: section anchor convention
   (PP:SECTION, PP:BLOCK, PP:FUNC), PatchOperation types, the
   patch application sequence, scaffold validation rules, and the
   continuity check list.
5. `SECTION-SCHEMA.md` — Transcribe the SectionDefinition interface,
   SectionSlot interface, the tier classification (universal,
   near-universal, shared, specialist), the dependency graph, and the
   testimonials section as a complete example.
6. `SYSTEM-PROMPTS.md` — Copy the Chat AI (PO) and Builder AI
   (Developer) system prompts from PRD §9 verbatim. These are the
   source of truth. Add a header noting they are loaded at runtime from
   this file (not hardcoded in source).
7. `ZERO-COST-PLAYBOOK.md` — Transcribe PRD §6 (the full solution
   lookup table and escalation decision tree).

**Acceptance criteria:**

- [ ] All 7 files exist in `docs/`
- [ ] Each file has a clear title and "last updated" date
- [ ] `CONVENTIONS.md` includes every rule from the specification
- [ ] `PATCH-PROTOCOL.md` includes the full PatchOperation type union
- [ ] `SECTION-SCHEMA.md` includes the complete testimonials example
- [ ] No broken internal links between documents
- [ ] All ASCII diagrams render correctly in GitHub Markdown preview

**Do NOT:**

- Summarize or abbreviate the source material. These are reference
  documents. Completeness matters more than brevity.
- Add commentary or opinions. Transcribe the specifications as designed.

---

### WI-004 · Define All TypeScript Interfaces

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-001 |
| **Sprint** | 0 |
| **Estimated effort** | M |

**Files to create:**

```
src/types/session.ts
src/types/chat.ts
src/types/backlog.ts
src/types/vfs.ts
src/types/patch.ts
src/types/build.ts
src/types/deploy.ts
src/types/template.ts
src/types/index.ts          ← re-exports all types
```

**Agent instructions:**

Transcribe the interfaces from PRD §7.1, the Iterative Build Engine
design (BuildPatch, PatchOperation, PatchResult, BuildPhase, BuildState,
ContinuityCheck), and the Template design (SectionDefinition,
SectionSlot, TemplateConfig) into individual type files organized by
domain.

Rules:
- `types/` contains ONLY interfaces, type aliases, and enums.
- ZERO imports from any other `src/` directory.
- ZERO implementations or function bodies.
- Every interface and every field must have a JSDoc comment.
- Use `interface` for object shapes, `type` for unions and aliases.
- `index.ts` re-exports everything for convenient imports.

File organization:
- `session.ts`: Session, StudioState, LLMConfig, LLMProvider
- `chat.ts`: ChatMessage, MessageSender
- `backlog.ts`: WorkItem, WorkItemStatus, AtomType, Effort
- `vfs.ts`: VirtualFile, VirtualFileSystem, ColorPalette, FontSelection
- `patch.ts`: BuildPatch, PatchOperation (full union with all operation
  types), PatchResult
- `build.ts`: BuildPhase, BuildState, CircuitBreaker, ContinuityResult,
  ScaffoldHealth, ScaffoldIssue, ContextBudget, PhaseTimeouts
- `deploy.ts`: Deployment, DeployHost, TokenValidation
- `template.ts`: SectionDefinition, SectionSlot, SectionCategory,
  SectionPosition, TemplateConfig, TemplatePageConfig

**Acceptance criteria:**

- [ ] `tsc --noEmit` passes
- [ ] No file in `types/` imports from outside `types/`
- [ ] Every exported interface has a JSDoc comment
- [ ] Every field on every interface has a JSDoc comment
- [ ] `import { WorkItem, BuildPatch, VirtualFileSystem } from '@/types'`
      works from any source file
- [ ] The PatchOperation type union includes all 10 operation types:
      SectionReplace, SectionInsert, SectionDelete, CssAppend,
      CssReplaceBlock, JsAppend, JsReplaceFunction, FileCreate,
      FileDelete, MetadataUpdate

**Do NOT:**

- Add utility functions, validators, or factory functions. Types only.
- Use `class`. All types are `interface` or `type`.
- Use `any` or `unknown` without a JSDoc explaining why.

---

## Sprint 1 — Core Engine (No UI)

**Goal:** All `engine/` modules implemented and tested. Every module is
pure logic with zero React dependencies. 80+ unit tests passing.

**Milestone M2:** `npm run test:unit` passes 80+ tests; zero `engine/`
code imports React or DOM APIs.

---

### WI-005 · Implement VFS Core

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 1 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/vfs/vfs.ts
tests/unit/engine/vfs.test.ts
```

**Agent instructions:**

Implement the `VirtualFileSystem` as a class that manages an in-memory
map of `VirtualFile` objects. Use the interfaces from `@/types/vfs`.

Methods to implement:
- `addFile(path: string, content: string): VirtualFile`
- `getFile(path: string): VirtualFile | null`
- `updateFile(path: string, content: string): VirtualFile`
- `deleteFile(path: string): boolean`
- `hasFile(path: string): boolean`
- `listFiles(): string[]`
- `getVersion(): number`
- `incrementVersion(): number`
- `clone(): VirtualFileSystem` — deep copy for dry-run patching
- `toManifest(): SiteManifest` — returns a lightweight summary
  (page list, section names per page, css block names, js function
  names, theme colors, fonts) for use as builder context. Parse
  PP:SECTION, PP:BLOCK, and PP:FUNC anchors from file contents.

Implementation notes:
- Use SHA-256 (via Web Crypto API / `crypto.subtle`) for file hashes.
- `clone()` must produce a fully independent copy (no shared references).
- `toManifest()` must extract anchor names via regex, not by parsing HTML
  as a DOM tree (we're in a pure-logic module with no DOM dependency).

**Tests (minimum 12):**

```
should create a file and retrieve it by path
should return null for nonexistent file path
should update file content and increment hash
should delete a file and confirm it no longer exists
should list all file paths
should increment version on explicit call
should produce a deep clone with no shared references
should not affect original when clone is modified
should generate a manifest with correct page list
should extract PP:SECTION anchor names from HTML
should extract PP:BLOCK anchor names from CSS
should extract PP:FUNC anchor names from JS
```

**Do NOT:**

- Import React, DOM APIs, or any browser-only API except `crypto.subtle`
  (available in Node 20+ and all modern browsers).
- Use `fs` or any Node-only module.
- Implement persistence (that's in `persistence/`, not here).

---

### WI-006 · Implement VFS Snapshot Manager

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-005 |
| **Sprint** | 1 |
| **Estimated effort** | S |

**Files to create:**

```
src/engine/vfs/snapshots.ts
tests/unit/engine/snapshots.test.ts
```

**Agent instructions:**

Implement the `VFSSnapshotManager` class that stores up to N deep copies
of VFS states as a safety net for scaffold corruption recovery.

Methods:
- `saveSnapshot(vfs: VirtualFileSystem): void` — deep clones the VFS and
  stores it keyed by version. If at max capacity, prunes the oldest.
- `getSnapshot(version: number): VirtualFileSystem | null`
- `getLatestSnapshot(): { vfs: VirtualFileSystem; version: number } | null`
- `rollback(): { vfs: VirtualFileSystem; lostVersions: number } | null`
  — returns the latest snapshot for recovery
- `getSnapshotCount(): number`
- `clear(): void`

Configuration: `maxSnapshots` defaults to 5, configurable via constructor.

**Tests (minimum 6):**

```
should save a snapshot and retrieve it by version
should prune oldest snapshot when max capacity is reached
should return latest snapshot on rollback
should report correct lostVersions count on rollback
should return null when no snapshots exist
should clear all snapshots
```

---

### WI-007 · Implement Patch Engine

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-005 |
| **Sprint** | 1 |
| **Estimated effort** | L |

**Files to create:**

```
src/engine/builder/patch-engine.ts
tests/unit/engine/patch-engine.test.ts
tests/fixtures/patches/valid-section-replace.json
tests/fixtures/patches/valid-section-insert.json
tests/fixtures/patches/valid-css-append.json
tests/fixtures/patches/valid-css-replace-block.json
tests/fixtures/patches/valid-js-append.json
tests/fixtures/patches/valid-file-create.json
tests/fixtures/patches/valid-metadata-update.json
tests/fixtures/patches/invalid-malformed-json.txt
tests/fixtures/patches/invalid-wrong-schema.json
tests/fixtures/patches/invalid-wrong-section.json
tests/fixtures/patches/invalid-version-mismatch.json
tests/fixtures/scaffolds/basic-scaffold.json
```

**Agent instructions:**

Implement the `PatchEngine` class. Read `docs/PATCH-PROTOCOL.md` for the
full specification.

Methods:
- `apply(vfs: VirtualFileSystem, patch: BuildPatch): PatchResult`
  - Checks version lock (patch.targetVersion must match vfs.version)
  - Clones VFS
  - Applies each operation to the clone
  - Returns `{ success: true, version }` or `{ success: false, error, failedOp }`

Each `PatchOperation` type needs an applier:
- `SectionReplace`: Find `<!-- PP:SECTION:name -->...<!-- /PP:SECTION:name -->`
  in the target file and replace inner content. Preserve anchors.
- `SectionInsert`: Find `<!-- PP:INSERT_BEFORE:name -->` and insert the
  new section (with its own PP:SECTION anchors) above that marker.
- `SectionDelete`: Remove the entire section including its anchors.
- `CssAppend`: Insert new CSS rules at `/* PP:CSS_INSERT_POINT */`.
- `CssReplaceBlock`: Find `/* === PP:BLOCK:name === */.../* === /PP:BLOCK:name === */`
  and replace inner content. Preserve anchors.
- `JsAppend`: Insert new code at `// PP:JS_INSERT_POINT`.
- `JsReplaceFunction`: Find `// === PP:FUNC:name ===...// === /PP:FUNC:name ===`
  and replace inner content. Preserve anchors.
- `FileCreate`: Add a new file to VFS.
- `FileDelete`: Remove a file from VFS.
- `MetadataUpdate`: Update VFS metadata (title, colors, fonts).

Implementation rules:
- All anchor matching must use regex, not DOM parsing.
- Anchors are preserved — only the content BETWEEN anchors is replaced.
- If a target anchor is not found, the operation fails immediately.
- On ANY operation failure, the entire patch is discarded (atomic).

Create fixture files for each operation type with realistic content.
Create the `basic-scaffold.json` fixture representing a minimal
3-section site (nav + hero + footer) with CSS and JS anchors.

**Tests (minimum 15):**

```
should apply a valid SectionReplace and preserve anchors
should apply a valid SectionInsert at the correct position
should apply a valid SectionDelete and remove anchors
should apply a valid CssAppend at the insert point
should apply a valid CssReplaceBlock and preserve anchors
should apply a valid JsAppend at the insert point
should apply a valid JsReplaceFunction and preserve anchors
should apply a valid FileCreate
should apply a valid FileDelete
should apply a valid MetadataUpdate
should reject a patch with wrong targetVersion
should reject a patch targeting a nonexistent section
should reject a patch with an unknown operation type
should atomically rollback on mid-patch failure
should increment VFS version on successful apply
```

---

### WI-008 · Implement Scaffold Auditor and Repairer

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-005 |
| **Sprint** | 1 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/builder/scaffold.ts
tests/unit/engine/scaffold.test.ts
tests/fixtures/scaffolds/healthy-scaffold.json
tests/fixtures/scaffolds/degraded-scaffold.json
tests/fixtures/scaffolds/corrupted-scaffold.json
```

**Agent instructions:**

Implement `ScaffoldAuditor` as described in the Resilience design §5.
Read `docs/PATCH-PROTOCOL.md` for anchor format specifications.

Methods:
- `audit(vfs: VirtualFileSystem): ScaffoldHealth`
  - Scan all HTML files for PP:SECTION anchor pairs (open + close).
  - Scan all CSS files for PP:BLOCK anchor pairs.
  - Scan all JS files for PP:FUNC anchor pairs.
  - For each anchor: verify open exists, close exists, they are properly
    nested, `data-pp-section` attribute matches (HTML only).
  - Return health score (0–100), intact/total counts, and issue list.
- `repair(vfs: VirtualFileSystem, issues: ScaffoldIssue[]): RepairResult`
  - Auto-repair: normalize whitespace in anchors, re-insert missing
    close anchors (infer from next section's open), fix malformed
    anchor syntax.
  - Return count of repaired vs unrepairable issues.

Health score calculation:
- Start at 100.
- Each `warning` issue: -5 points.
- Each `error` issue: -15 points.
- Minimum 0.

Create three fixture scaffolds:
1. `healthy-scaffold.json` — all anchors correct, score 100.
2. `degraded-scaffold.json` — 2 warnings (extra whitespace, minor
   formatting), score ~90, auto-repairable.
3. `corrupted-scaffold.json` — 2 errors (missing close anchor,
   mismatched attribute), score ~70, one repairable and one not.

**Tests (minimum 10):**

```
should return score 100 for a healthy scaffold
should detect missing closing PP:SECTION anchor
should detect missing opening PP:SECTION anchor
should detect malformed PP:BLOCK anchor (extra whitespace)
should detect mismatched data-pp-section attribute
should detect orphaned closing anchor
should calculate correct health score with mixed issues
should auto-repair normalizable whitespace issues
should auto-repair missing closing anchor by inference
should report unrepairable issues accurately
```

---

### WI-009 · Implement Continuity Checks

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-007, WI-008 |
| **Sprint** | 1 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/builder/continuity.ts
tests/unit/engine/continuity.test.ts
```

**Agent instructions:**

Implement the `validateContinuity` function and all individual continuity
checks as described in the Iterative Build Engine design §3.2.4.

Function signature:
```typescript
function validateContinuity(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
  atom: WorkItem,
): { pass: boolean; violations: string[] }
```

Individual checks to implement:
1. `scaffoldIntact` — All PP:SECTION anchors from `before` still exist
   in `after` (unless atom explicitly deletes a section).
2. `themeConsistent` — `:root` CSS variables block is unchanged (unless
   atom's `atomType` is `'style'`).
3. `navConsistent` — Navigation section content is unchanged (unless
   atom explicitly targets nav).
4. `noUnrelatedChanges` — Only files listed in `atom.filesTouch` have
   diffs between `before` and `after`.
5. `sectionCountDelta` — Number of sections added/removed matches the
   atom's expected delta (structure atom adding 1 section = +1).
6. `cssVariableUsage` — Any NEW CSS rules added by the patch use
   `var(--...)` for color values, not hardcoded hex. Detect by scanning
   the diff for hex color patterns (e.g., `#[0-9a-fA-F]{3,8}`) in
   new CSS content.

Each check returns `{ pass: boolean; reason?: string }`.

**Tests (minimum 8):**

```
should pass all checks when patch is well-behaved
should fail scaffoldIntact when a section anchor is missing
should pass themeConsistent when atom type is 'style' and :root changes
should fail themeConsistent when non-style atom changes :root
should fail navConsistent when nav is modified by a non-nav atom
should fail noUnrelatedChanges when unlisted file is modified
should fail sectionCountDelta when count doesn't match expectation
should fail cssVariableUsage when new CSS contains hardcoded hex color
```

---

### WI-010 · Implement Circuit Breaker

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 1 |
| **Estimated effort** | S |

**Files to create:**

```
src/engine/builder/circuit-breaker.ts
tests/unit/engine/circuit-breaker.test.ts
```

**Agent instructions:**

Implement the `BuildCircuitBreaker` class as described in the Resilience
design §2.3.

Methods:
- `canAttempt(atomId: string): boolean`
- `recordFailure(atomId: string, error: string): 'retry' | 'skip'`
- `recordSuccess(atomId: string): void` — clears the breaker for that atom
- `getState(atomId: string): CircuitBreaker | null`
- `reset(): void` — clears all breakers

Configuration: `maxAttempts` defaults to 3, configurable via constructor.

State transitions:
- First attempt → `closed` state, attempts = 0
- Each failure → attempts++; if < max → return `'retry'`; if >= max → state
  becomes `'open'`, return `'skip'`
- Success → delete breaker entirely (clean slate)

**Tests (minimum 6):**

```
should allow first attempt for unknown atom
should return 'retry' on first and second failure
should return 'skip' on third failure (default max)
should reset breaker on success
should respect custom maxAttempts
should clear all breakers on reset
```

---

### WI-011 · Implement Heartbeat Monitor

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 1 |
| **Estimated effort** | S |

**Files to create:**

```
src/engine/builder/heartbeat.ts
tests/unit/engine/heartbeat.test.ts
```

**Agent instructions:**

Implement the `BuildHeartbeat` class that monitors build phase durations
and emits warning and timeout events.

Constructor takes the `PHASE_TIMEOUTS` configuration (see Resilience
design §3.3).

Methods:
- `start(buildState: BuildState, callbacks: HeartbeatCallbacks): void`
  — begins polling at 1-second intervals
- `stop(): void` — stops the polling timer
- `onPhaseChange(newPhase: BuildPhase): void` — resets the phase timer

`HeartbeatCallbacks`:
```typescript
interface HeartbeatCallbacks {
  onWarning: (phase: BuildPhase, elapsed: number) => void;
  onTimeout: (phase: BuildPhase, elapsed: number) => void;
}
```

Use `setInterval` internally. Tests should use fake timers
(`vi.useFakeTimers()`).

**Tests (minimum 5):**

```
should not emit warning before threshold
should emit warning after warn threshold elapsed
should emit timeout after timeout threshold elapsed
should reset phase timer on phase change
should stop emitting after stop() is called
```

---

### WI-012 · Implement LLM Gateway and Cost Calculation

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 1 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/llm/gateway.ts
src/engine/llm/cost.ts
src/engine/llm/providers/openai.ts
src/config/model-pricing.json
tests/unit/engine/gateway.test.ts
tests/unit/engine/cost.test.ts
tests/fixtures/llm-responses/sample-chat-response.json
tests/fixtures/llm-responses/sample-builder-response.json
```

**Agent instructions:**

1. `cost.ts`: Implement `calculateCost(model: string, usage: TokenUsage): number`.
   Load pricing from `config/model-pricing.json`. Return 0 for unknown
   models (and set an `unknownModel` flag on the result). Include all
   models from PRD §3 Epic 1 Feature 1.3.

2. `gateway.ts`: Implement `LLMGateway` class.
   - Constructor takes `LLMConfig` (chat model + builder model configs).
   - `send(request: LLMRequest): Promise<LLMResponse>` — routes to the
     correct provider based on `request.role`, calls the provider,
     calculates cost, returns unified response.
   - Maintains a running total of cost per role.
   - `getRunningTotal(): { chat: number; builder: number; total: number }`
   - `resetTotal(): void`

3. `providers/openai.ts`: Implement `OpenAIProvider` class.
   - `call(apiKey: string, model: string, messages: Message[], options: LLMCallOptions): Promise<RawLLMResponse>`
   - Uses `fetch()` to call `https://api.openai.com/v1/chat/completions`.
   - Handles 429 (rate limit) by throwing a typed `RateLimitError` with
     the `Retry-After` value.
   - Handles 401 by throwing a typed `AuthenticationError`.
   - Handles timeout by throwing a typed `TimeoutError`.
   - **Tests must mock `fetch` — never call the real API.**

4. `model-pricing.json`: All models from the PRD cost table. Include a
   `lastUpdated` field.

**Tests (minimum 8):**

```
should calculate correct cost for gpt-4o
should calculate correct cost for claude-sonnet-4
should return 0 and flag unknown model
should route chat requests to chat model config
should route builder requests to builder model config
should accumulate running total across multiple calls
should throw RateLimitError on 429 response
should throw AuthenticationError on 401 response
```

---

### WI-013 · Add Anthropic and Google LLM Providers

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-012 |
| **Sprint** | 1 |
| **Estimated effort** | S |

**Files to create:**

```
src/engine/llm/providers/anthropic.ts
src/engine/llm/providers/google.ts
tests/unit/engine/anthropic-provider.test.ts
tests/unit/engine/google-provider.test.ts
```

**Agent instructions:**

Implement providers following the same interface as `OpenAIProvider`.

1. `anthropic.ts`: Calls `https://api.anthropic.com/v1/messages`.
   Header: `x-api-key` and `anthropic-version: 2023-06-01`.
   Map the unified message format to Anthropic's format (system message
   separate from user/assistant messages).

2. `google.ts`: Calls the Gemini API at
   `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
   API key passed as query parameter `?key=`.
   Map the unified message format to Google's `contents` array format.

Both providers handle 429, 401, and timeout the same way as OpenAI.
Mock `fetch` in all tests.

**Tests (minimum 4 per provider):**

```
# Anthropic
should format request with x-api-key header
should map system message to separate system field
should parse response into unified format
should throw RateLimitError on 429

# Google
should format request with API key as query param
should map messages to Google contents format
should parse response into unified format
should throw RateLimitError on 429
```

---

### WI-014 · Implement Context Budget Manager

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-012 |
| **Sprint** | 1 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/llm/context.ts
tests/unit/engine/context.test.ts
```

**Agent instructions:**

Implement `ContextManager` as described in the Resilience design §6.

Methods:
- `assembleBuildContext(atom: WorkItem, vfs: VirtualFileSystem, conversation: ChatMessage[]): BuildContext`
  — assembles the context window for a builder call within budget.
- `assembleChatContext(conversation: ChatMessage[], backlog: WorkItem[]): ChatContext`
  — assembles context for a chat AI call within budget.
- `estimateTokens(text: string): number` — rough estimator using
  the "4 chars per token" heuristic. Good enough for budgeting.
- `getUtilization(): { used: number; available: number; percent: number }`

Context assembly priority for builder (highest to lowest):
1. System prompt (fixed, always included)
2. Site manifest (always included)
3. Work item (always included)
4. Patch format instructions (always included)
5. CSS `:root` variables block (always included for theme consistency)
6. Affected sections (included in full)
7. Adjacent sections (included if budget allows, else as signatures)
8. Conversation history (trimmed to fit remaining budget — keep first
   message + last N that fit + summary of trimmed middle)

**Tests (minimum 8):**

```
should include all fixed-priority items within budget
should include affected sections in builder context
should trim conversation when budget is tight
should keep first message when trimming conversation
should insert summary placeholder for trimmed messages
should fall back to signatures for adjacent sections when tight
should report correct utilization percentage
should handle empty conversation gracefully
```

---

### WI-015 · Implement Narration Layer

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 1 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/chat/narration.ts
tests/unit/engine/narration.test.ts
```

**Agent instructions:**

Implement the full narration layer as described in the Resilience design
§4. This module translates internal build state into user-facing text.

Functions:
- `getStatusBarText(state: BuildState): string` — returns the status bar
  text for the current build phase (see §4.4 mapping).
- `getStatusBarColor(state: BuildState): 'green' | 'amber' | 'red' | 'gray'`
- `getSwapChatMessage(atom: WorkItem): string` — success message for
  chat after a swap, using the atom's `visibleChange` field.
- `getSkipChatMessage(atom: WorkItem, nextAtom: WorkItem | null): string`
- `getErrorChatMessage(error: string, remediation: string): string`
- `getMilestoneChatMessage(type: 'first_preview' | 'deployed', data: Record<string, string>): string`
- `getBuildingMessages(atom: WorkItem): string` — contextual verb based
  on atomType.
- `getSlowMessages(atom: WorkItem, retryCount: number): string` — rotating
  reassurance messages that change every ~8 seconds.

All functions are pure (no side effects, no state). They take data in
and return strings.

**Tests (minimum 10):**

```
should return contextual verb for structure atom
should return contextual verb for style atom
should return green color for normal awaiting_llm phase
should return amber color when awaiting_llm exceeds warning threshold
should return red color for error phase
should return gray color for idle phase
should generate swap message using atom's visibleChange
should generate skip message referencing next atom title
should rotate slow messages based on elapsed time
should generate milestone message with deploy URL
```

---

### WI-016 · Implement First-Message Classifier

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 1 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/chat/classifier.ts
tests/unit/engine/classifier.test.ts
tests/fixtures/llm-responses/classification/template-match-marketing.json
tests/fixtures/llm-responses/classification/template-match-portfolio.json
tests/fixtures/llm-responses/classification/template-match-small-business.json
tests/fixtures/llm-responses/classification/template-match-blog.json
tests/fixtures/llm-responses/classification/scratch-match.json
tests/fixtures/llm-responses/classification/ambiguous.json
```

**Agent instructions:**

Implement the `ClassificationEngine` that determines template-path vs
scratch-path from the user's first message.

Methods:
- `buildClassificationPrompt(userMessage: string, templateCatalog: TemplateConfig[]): LLMRequest`
  — constructs the prompt that asks the LLM to classify.
- `parseClassificationResponse(response: LLMResponse): ClassificationResult`
  — parses and validates the LLM's JSON response.
- `getTemplateConfidence(result: ClassificationResult): number`

```typescript
interface ClassificationResult {
  path: 'template' | 'scratch';
  templateId?: string;
  confidence: number;       // 0.0 to 1.0
  reasoning: string;        // One-sentence explanation
  suggestedCustomization?: {
    title?: string;
    slogan?: string;
    primaryColor?: string;
    industry?: string;
  };
}
```

The classification prompt should instruct the LLM to return JSON matching
the `ClassificationResult` schema. If confidence < 0.7, the PO should
ask one clarifying question before routing.

Create fixtures with realistic LLM responses for each template match
type plus scratch and ambiguous cases.

**Tests (minimum 8):**

```
should build a prompt that includes all template descriptions
should parse a valid template-match response
should parse a valid scratch-match response
should extract suggested customization fields
should flag confidence < 0.7 for ambiguous input
should handle malformed LLM response gracefully (return scratch with low confidence)
should identify marketing template from "Build a landing page for my SaaS"
should identify scratch path from "Build a zodiac greeting card maker"
```

---

### WI-017 · Implement Encryption Module

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 1 |
| **Estimated effort** | S |

**Files to create:**

```
src/persistence/encryption.ts
tests/unit/persistence/encryption.test.ts
```

**Agent instructions:**

Implement AES-256-GCM encryption for API keys and deploy tokens stored
in `localStorage`.

Functions:
- `encrypt(plaintext: string, passphrase: string): Promise<string>`
  — returns a base64-encoded string containing IV + ciphertext + auth tag.
- `decrypt(ciphertext: string, passphrase: string): Promise<string>`
  — decrypts and returns the original plaintext.

Use the Web Crypto API (`crypto.subtle`). Derive the encryption key from
the passphrase using PBKDF2 with a random salt (stored with the
ciphertext). Generate a random 12-byte IV for each encryption.

The passphrase for MVP can be a hardcoded studio-level secret combined
with a browser fingerprint component (e.g., `navigator.userAgent` hash).
This is defense-in-depth, not a fortress — the primary protection is
that keys never leave the browser.

**Tests (minimum 5):**

```
should encrypt and decrypt a roundtrip successfully
should produce different ciphertext for same plaintext (random IV)
should fail decryption with wrong passphrase
should handle empty string input
should handle very long input (4KB+ API key edge case)
```

---

### WI-018 · Implement IndexedDB Persistence Layer

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 1 |
| **Estimated effort** | M |

**Files to create:**

```
src/persistence/db.ts
src/persistence/checkpoint.ts
src/persistence/telemetry-log.ts
tests/unit/persistence/db.test.ts
tests/unit/persistence/checkpoint.test.ts
```

**Agent instructions:**

1. `db.ts`: Set up IndexedDB using the `idb` library (add as dependency,
   document in DECISIONS.md). Create database `prontoproto-studio` with
   object stores:
   - `vfs` — stores VirtualFileSystem snapshots
   - `conversation` — stores ChatMessage arrays
   - `checkpoints` — stores session recovery checkpoints
   - `telemetry` — append-only event log

2. `checkpoint.ts`: Implement `SessionCheckpoint` class.
   - `save(state: StudioState): Promise<void>` — persists enough state
     to recover a session (session, vfs, backlog, last 20 messages).
   - `load(): Promise<CheckpointData | null>`
   - `detectRecovery(): Promise<RecoveryState | null>` — returns info
     about a recoverable session if one exists.
   - `clear(): Promise<void>`

3. `telemetry-log.ts`: Implement `TelemetryLog` class.
   - `append(event: TelemetryEvent): Promise<void>` — append-only write
   - `getEvents(sessionId: string): Promise<TelemetryEvent[]>`
   - `exportAsJSON(sessionId: string): Promise<string>`
   - `clear(sessionId: string): Promise<void>`

Use `fake-indexeddb` for testing (add as dev dependency).

**Tests (minimum 6):**

```
should save and load a checkpoint
should return null when no checkpoint exists
should detect a recoverable session
should append telemetry events and retrieve by session
should export telemetry as JSON string
should clear checkpoint data
```

---

## Sprint 2 — Template System

**Goal:** All 30 sections defined. All 8 template configs created.
Template assembler produces valid VFS from any config.

**Milestone M3:** `npm run test:integration` passes; all 8 templates
assemble into valid HTML/CSS with correct anchors.

---

### WI-019 · Define Section Library Schema + 5 Universal Sections

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004, WI-008 |
| **Sprint** | 2 |
| **Estimated effort** | L |

**Files to create:**

```
src/engine/templates/section-library.ts
src/engine/templates/sections/hero/hero.html
src/engine/templates/sections/hero/hero.css
src/engine/templates/sections/nav/nav.html
src/engine/templates/sections/nav/nav.css
src/engine/templates/sections/nav/nav.ts
src/engine/templates/sections/footer/footer.html
src/engine/templates/sections/footer/footer.css
src/engine/templates/sections/contact/contact.html
src/engine/templates/sections/contact/contact.css
src/engine/templates/sections/contact/contact.ts
src/engine/templates/sections/seo-base/seo-base.html
tests/unit/engine/section-library.test.ts
```

**Agent instructions:**

Read `docs/SECTION-SCHEMA.md` for the full interface specification and
the testimonials example.

1. `section-library.ts`: Implement a `SectionLibrary` class that
   loads and validates section definitions.
   - `getSection(id: string): SectionDefinition | null`
   - `getSectionsByCategory(category: SectionCategory): SectionDefinition[]`
   - `validateSection(def: SectionDefinition): ValidationResult`
   - `getAllSectionIds(): string[]`

2. Create the 5 universal sections. Each section directory contains:
   - `[name].html` — HTML partial with `<!-- PP:SECTION:name -->` anchors,
     `data-pp-section` attribute, `{{slot}}` placeholders for
     customization slots.
   - `[name].css` — CSS with `/* === PP:BLOCK:name-styles === */` anchors.
     ALL colors via `var(--*)`. ALL spacing via `var(--*)` or `clamp()`.
     Mobile-first. BEM class naming.
   - `[name].ts` — Optional JS module with `// === PP:FUNC:name === //`
     anchors. Only for sections with interactivity (nav hamburger,
     contact form, map).

3. Section specifics:
   - **hero**: Title, slogan, CTA button, background. Slots: heading,
     subheading, ctaText, ctaHref, backgroundStyle.
   - **nav**: Logo, links, hamburger menu. Slots: logoText, links[].
     JS: hamburger toggle.
   - **footer**: Social links, copyright, columns. Slots: copyright,
     socialLinks[], columns[].
   - **contact**: Leaflet/OSM map embed + Formspree form. Slots: address,
     lat, lng, formAction, fields[]. JS: map initialization, form
     submission.
   - **seo-base**: `<head>` content only (not a visible section). meta
     description, OG tags, structured data placeholder. Slots: title,
     description, ogImage, ogType.

**Tests (minimum 5):**

```
should load all 5 universal sections
should validate section HTML contains correct PP:SECTION anchors
should validate section CSS contains correct PP:BLOCK anchors
should validate CSS uses only var(--*) for colors (no hardcoded hex)
should reject a section definition missing required fields
```

**Do NOT:**

- Use Google Maps. Use Leaflet + OpenStreetMap (zero cost).
- Hardcode any color, font, or spacing value in section CSS.
- Import React in any section file. Sections are raw HTML/CSS/JS.

---

### WI-020 · Implement 4 Near-Universal Sections

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-019 |
| **Sprint** | 2 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/templates/sections/about/about.html
src/engine/templates/sections/about/about.css
src/engine/templates/sections/features-grid/features-grid.html
src/engine/templates/sections/features-grid/features-grid.css
src/engine/templates/sections/testimonials/testimonials.html
src/engine/templates/sections/testimonials/testimonials.css
src/engine/templates/sections/cta-banner/cta-banner.html
src/engine/templates/sections/cta-banner/cta-banner.css
tests/unit/engine/near-universal-sections.test.ts
```

**Agent instructions:**

Create 4 sections following the same conventions as WI-019. Read
`docs/SECTION-SCHEMA.md` for the testimonials example — replicate that
level of detail for all 4.

Section specifics:
- **about**: Image + text layout (configurable: left-img, right-img,
  full-width). Slots: heading, body, imageAlt, layout.
- **features-grid**: Responsive card grid. Slots: heading, subheading,
  items[] (each: icon, title, description).
- **testimonials**: Review cards in responsive grid. Slots: heading,
  subheading, items[] (each: quote, name, role, rating).
- **cta-banner**: Full-width colored band with heading + button. Slots:
  heading, subheading, ctaText, ctaHref, style (primary/accent).

All CSS mobile-first. All colors via `var(--*)`.

**Tests (minimum 4):**

```
should validate about section anchors and slots
should validate features-grid section anchors and slots
should validate testimonials section matches the reference example
should validate cta-banner section anchors and slots
```

---

### WI-021 · Implement Template Assembler

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-005, WI-019 |
| **Sprint** | 2 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/vfs/assembler.ts
tests/unit/engine/assembler.test.ts
tests/integration/template-assembly.test.ts
```

**Agent instructions:**

Implement `TemplateAssembler` as described in the Template Architecture
design.

Methods:
- `assemble(config: TemplateConfig, customization?: QuickCustomization): VirtualFileSystem`
  — builds a complete VFS from a template config.
  1. Start with scaffold shell (HTML boilerplate + head + body wrapper).
  2. For each page in config: insert sections in order with anchors.
  3. Build CSS: `:root` variables from theme + all section CSS blocks +
     insert points.
  4. Build JS: all section JS modules + main DOMContentLoaded + insert
     points.
  5. Apply quick customization (title, slogan, colors) if provided.
  6. Set VFS version to 1.
- `fillSlots(sectionHtml: string, customization: QuickCustomization, slots: SectionSlot[]): string`
  — replaces `{{slotName}}` placeholders with customized or default values.
- `validateConfig(config: TemplateConfig): ValidationResult`
  — checks all referenced sections exist, dependencies are met,
  no conflicts.

**Unit tests (minimum 5):**

```
should assemble a single-page site with 3 sections
should fill slots with customization values
should use default slot values when customization is empty
should validate that all referenced sections exist in library
should reject config with conflicting sections
```

**Integration tests (minimum 1):**

```
should assemble marketing template into valid VFS with correct
  anchor structure (run scaffold auditor on result; expect score 100)
```

---

### WI-022 · Create First 3 Template Configs

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-021 |
| **Sprint** | 2 |
| **Estimated effort** | S |

**Files to create:**

```
src/engine/templates/configs/marketing.json
src/engine/templates/configs/portfolio.json
src/engine/templates/configs/small-business.json
tests/integration/template-configs.test.ts
```

**Agent instructions:**

Create JSON configs following the schema from the Template Architecture
design. Each config must:
- Reference only sections that exist in the library (WI-019 + WI-020).
- Define pages, section order per page, enabled features, and default
  theme.
- For sections not yet created (shared/specialist), omit them — these
  configs will be updated in WI-025.

Initial configs use only the 9 sections from WI-019 and WI-020.

**Integration tests (minimum 3):**

```
should assemble marketing template with scaffold score 100
should assemble portfolio template with scaffold score 100
should assemble small-business template with scaffold score 100
```

---

### WI-023 · Implement 9 Shared Sections

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-019 |
| **Sprint** | 2 |
| **Estimated effort** | L |

**Files to create:**

```
src/engine/templates/sections/faq/faq.html
src/engine/templates/sections/faq/faq.css
src/engine/templates/sections/faq/faq.ts
src/engine/templates/sections/pricing-table/pricing-table.html
src/engine/templates/sections/pricing-table/pricing-table.css
src/engine/templates/sections/filterable-grid/filterable-grid.html
src/engine/templates/sections/filterable-grid/filterable-grid.css
src/engine/templates/sections/filterable-grid/filterable-grid.ts
src/engine/templates/sections/lightbox/lightbox.html
src/engine/templates/sections/lightbox/lightbox.css
src/engine/templates/sections/lightbox/lightbox.ts
src/engine/templates/sections/category-filter/category-filter.html
src/engine/templates/sections/category-filter/category-filter.css
src/engine/templates/sections/category-filter/category-filter.ts
src/engine/templates/sections/services-list/services-list.html
src/engine/templates/sections/services-list/services-list.css
src/engine/templates/sections/team/team.html
src/engine/templates/sections/team/team.css
src/engine/templates/sections/hours-location/hours-location.html
src/engine/templates/sections/hours-location/hours-location.css
src/engine/templates/sections/reviews-embed/reviews-embed.html
src/engine/templates/sections/reviews-embed/reviews-embed.css
tests/unit/engine/shared-sections.test.ts
```

**Agent instructions:**

Create 9 sections following the same conventions as WI-019 and WI-020.

Section specifics:
- **faq**: Accordion (details/summary elements — semantic, zero JS
  needed for basic expand/collapse; JS version for smooth animation).
- **pricing-table**: Static 2–3 column pricing cards. No payment logic.
- **filterable-grid**: Grid with filter buttons. JS: filter by
  `data-category` attribute.
- **lightbox**: Overlay for images. JS: open/close/navigate.
- **category-filter**: Tag buttons that filter items. JS: toggle active,
  filter DOM.
- **services-list**: Card grid for services. Pure CSS, no JS.
- **team**: Team member cards with photo, name, role. Pure CSS.
- **hours-location**: Business hours table + address. Pure CSS.
- **reviews-embed**: Placeholder for Google/Yelp embed + static fallback
  reviews. Pure CSS.

All CSS mobile-first. All colors via `var(--*)`. All JS with PP:FUNC
anchors.

**Tests (minimum 9 — one per section):**

```
should validate faq section anchors, slots, and JS module
should validate pricing-table section anchors and slots
should validate filterable-grid section anchors and JS module
should validate lightbox section anchors and JS module
should validate category-filter section anchors and JS module
should validate services-list section anchors and slots
should validate team section anchors and slots
should validate hours-location section anchors and slots
should validate reviews-embed section anchors and slots
```

---

### WI-024 · Implement 12 Specialist Sections

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-019 |
| **Sprint** | 2 |
| **Estimated effort** | L |

**Files to create:**

```
src/engine/templates/sections/blog-listing/blog-listing.html
src/engine/templates/sections/blog-listing/blog-listing.css
src/engine/templates/sections/blog-listing/blog-listing.ts
src/engine/templates/sections/blog-detail/blog-detail.html
src/engine/templates/sections/blog-detail/blog-detail.css
src/engine/templates/sections/rss/rss.ts
src/engine/templates/sections/feature-comparison/feature-comparison.html
src/engine/templates/sections/feature-comparison/feature-comparison.css
src/engine/templates/sections/project-gallery/project-gallery.html
src/engine/templates/sections/project-gallery/project-gallery.css
src/engine/templates/sections/product-cards/product-cards.html
src/engine/templates/sections/product-cards/product-cards.css
src/engine/templates/sections/cart/cart.html
src/engine/templates/sections/cart/cart.css
src/engine/templates/sections/cart/cart.ts
src/engine/templates/sections/stripe-checkout/stripe-checkout.html
src/engine/templates/sections/stripe-checkout/stripe-checkout.css
src/engine/templates/sections/stripe-checkout/stripe-checkout.ts
src/engine/templates/sections/calendar-embed/calendar-embed.html
src/engine/templates/sections/calendar-embed/calendar-embed.css
src/engine/templates/sections/service-menu/service-menu.html
src/engine/templates/sections/service-menu/service-menu.css
src/engine/templates/sections/multi-step-form/multi-step-form.html
src/engine/templates/sections/multi-step-form/multi-step-form.css
src/engine/templates/sections/multi-step-form/multi-step-form.ts
src/engine/templates/sections/form-confirmation/form-confirmation.html
src/engine/templates/sections/form-confirmation/form-confirmation.css
tests/unit/engine/specialist-sections.test.ts
```

**Agent instructions:**

Create 12 specialist sections. These are more complex than universal
or shared sections. Key implementation notes:

- **blog-listing**: Static post cards. Data comes from a JSON array in
  the HTML. JS: renders post cards from data, handles pagination.
- **blog-detail**: Template page for a single post. Builder generates
  individual post pages from this template.
- **rss**: JS-only module that generates an RSS XML string from blog data.
  Output as a FileCreate patch to `feed.xml`.
- **feature-comparison**: Responsive table with checkmarks. Pure CSS.
- **project-gallery**: Image grid. Integrates with lightbox and
  filterable-grid if present.
- **product-cards**: Product display cards with "Add to Cart" buttons.
  Integrates with cart if present.
- **cart**: localStorage-backed shopping cart. JS: add/remove/quantity,
  cart count badge, cart drawer. This is the most complex section.
- **stripe-checkout**: "Checkout" button that links to a Stripe Payment
  Link URL. Slot: `stripePaymentLink`.
- **calendar-embed**: Cal.com iframe embed. Slot: `calendarUrl`.
- **service-menu**: Service items with name, description, price, and
  "Book" button (links to calendar or contact). Pure CSS.
- **multi-step-form**: Multi-page form with progress indicator. JS:
  step navigation, field validation, Formspree submission.
- **form-confirmation**: Static thank-you page. Pure CSS.

Respect the dependency graph from the Template Architecture design:
- `product-cards` declares `requires: []` but `enhancedBy: ['cart', 'filterable-grid']`
- `cart` declares `requires: ['product-cards']`
- `stripe-checkout` declares `requires: ['cart']`
- `lightbox` declares `requires: []` but `enhancedBy: ['project-gallery', 'product-cards']`
- `blog-detail` declares `requires: ['blog-listing']`
- `multi-step-form` declares `conflictsWith: ['contact']`

**Tests (minimum 12 — one per section):**

```
should validate blog-listing section anchors and JS module
should validate blog-detail section anchors and slots
should validate rss module generates valid XML structure
should validate feature-comparison section anchors
should validate project-gallery section anchors
should validate product-cards section anchors
should validate cart section anchors and JS module
should validate cart requires product-cards dependency
should validate stripe-checkout section anchors
should validate calendar-embed section anchors and slot
should validate multi-step-form section anchors and JS module
should validate multi-step-form conflicts with contact section
```

---

### WI-025 · Create Remaining 5 Template Configs

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-021, WI-023, WI-024 |
| **Sprint** | 2 |
| **Estimated effort** | S |

**Files to create:**

```
src/engine/templates/configs/blog.json
src/engine/templates/configs/saas-landing.json
src/engine/templates/configs/simple-store.json
src/engine/templates/configs/bookings.json
src/engine/templates/configs/form-to-email.json
```

**Update existing file:**

```
tests/integration/template-configs.test.ts  ← add 5 new test cases
```

**Agent instructions:**

Create the remaining 5 configs. Also update the 3 configs from WI-022
to include the shared and specialist sections that are now available.

**Integration tests (add 5 — total of 8 template assembly tests):**

```
should assemble blog template with scaffold score 100
should assemble saas-landing template with scaffold score 100
should assemble simple-store template with scaffold score 100
should assemble bookings template with scaffold score 100
should assemble form-to-email template with scaffold score 100
```

After this work item, ALL 8 templates must assemble cleanly.

---

## Sprint 3 — UI Shell

**Goal:** Three-panel layout renders. All visual components exist.
Stores are wired. User can interact with mock data.

**Milestone M4:** Three-panel layout renders; chat sends/receives mock
messages; loader animates; backlog cards are draggable.

---

### WI-026 · Implement Three-Panel Layout

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-001 |
| **Sprint** | 3 |
| **Estimated effort** | M |

**Files to create:**

```
src/app/Layout.tsx
src/components/shared/HeaderBar.tsx
```

**Agent instructions:**

Implement the three-panel responsive layout from PRD §8.1.

- `Layout.tsx`: CSS Grid or Flexbox. Three columns: Chat (30%), Preview
  (45%), Backlog (25%). On mobile (< 768px): stack vertically with tabs
  to switch between panels.
- `HeaderBar.tsx`: Fixed top bar with logo text "prontoproto.studio",
  placeholder slots for CostTicker, SettingsButton, and
  NewConversationButton.

Use Tailwind utility classes for all studio UI styling.

**Acceptance criteria:**

- [ ] Three-panel layout renders at desktop widths
- [ ] Panels resize proportionally
- [ ] Mobile layout stacks panels with tab navigation
- [ ] Header bar is fixed at top, does not scroll

---

### WI-027 · Implement Chat Panel Components

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-026 |
| **Sprint** | 3 |
| **Estimated effort** | M |

**Files to create:**

```
src/components/chat/ChatPanel.tsx
src/components/chat/MessageList.tsx
src/components/chat/UserBubble.tsx
src/components/chat/AiBubble.tsx
src/components/chat/SystemMessage.tsx
src/components/chat/TypingIndicator.tsx
src/components/chat/ChatInput.tsx
```

**Agent instructions:**

Implement iMessage-style chat components per PRD §8.3. Use mock
hardcoded messages for initial development. Wire to store in WI-028.

Visual specifications:
- User bubbles: right-aligned, `#007AFF`, white text, 18px border-radius
- AI bubbles: left-aligned, `#E9E9EB`, dark text, 18px border-radius
- System messages: centered, muted gray, no bubble
- Typing indicator: three animated dots in a gray bubble
- Chat input: bottom-fixed, rounded, placeholder "Message
  prontoproto.studio…", send arrow button
- Auto-scroll to latest message on new message

**Acceptance criteria:**

- [ ] All three message types render correctly
- [ ] Typing indicator animates
- [ ] Input field accepts text and triggers send on Enter / button click
- [ ] Message list auto-scrolls to bottom on new message
- [ ] Bubbles have max-width 75% of panel

---

### WI-028 · Implement Zustand Stores

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004, WI-017, WI-018 |
| **Sprint** | 3 |
| **Estimated effort** | M |

**Files to create:**

```
src/store/session-store.ts
src/store/chat-store.ts
src/store/backlog-store.ts
src/store/build-store.ts
src/store/settings-store.ts
src/store/telemetry-store.ts
tests/unit/store/session-store.test.ts
tests/unit/store/backlog-store.test.ts
tests/unit/store/build-store.test.ts
```

**Agent instructions:**

Implement Zustand stores. Each store handles one domain. Document the
decision to use Zustand in `docs/DECISIONS.md` (D-001 already covers
this — just confirm).

Key stores:
- `session-store`: session state, resetSession, create/archive session
- `chat-store`: messages array, addMessage, clearMessages
- `backlog-store`: workItems array, addItem, reorderItems,
  setOnDeck, promoteNext, updateItemStatus, focusItem, pauseResume
- `build-store`: buildState, currentAtom, retryCount, phase transitions
- `settings-store`: llmConfig, deploy tokens (encrypted via persistence
  layer), model selections
- `telemetry-store`: append events, get totals, export

All stores that persist data should hydrate from `localStorage` or
`IndexedDB` on creation.

**Tests (minimum 10):**

```
should create a session and set active
should reset session and clear related stores
should add messages to chat store in order
should add work items to backlog with correct ordering
should prevent reordering the On Deck item
should promote next backlog item to On Deck
should update build phase and track timing
should persist settings to localStorage on change
should hydrate settings from localStorage on creation
should track pause/resume state in build store
```

---

### WI-029 · Implement ChlorastroliteLoader

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-026 |
| **Sprint** | 3 |
| **Estimated effort** | S |

**Files to create:**

```
src/components/preview/ChlorastroliteLoader.tsx
```

**Agent instructions:**

The complete component source code is provided in PRD §3 Epic 3 Feature
3.2. Transcribe it exactly. Add the easter egg activation logic: track
click count on the gem SVG; if 7 clicks within 3 seconds, switch variant
to `'eye'` for the remainder of the session. Also detect if the user
types `margaret` in the chat input while the loader is visible.

**Acceptance criteria:**

- [ ] Gem variant renders and animates (pulsing aura, rotating rings,
      highlight sweep)
- [ ] Eye variant renders and animates (iris pulse, pupil pulse)
- [ ] Custom label prop overrides default text
- [ ] Easter egg activates on 7 rapid clicks
- [ ] Easter egg activates on typing `margaret` in chat input

---

### WI-030 · Implement Preview Panel

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-026, WI-029 |
| **Sprint** | 3 |
| **Estimated effort** | M |

**Files to create:**

```
src/components/preview/PreviewPanel.tsx
src/components/preview/PreviewIframe.tsx
src/components/preview/StatusBar.tsx
src/components/preview/ResponsiveToggles.tsx
src/components/preview/DeployButton.tsx
```

**Agent instructions:**

- `PreviewPanel.tsx`: Shows ChlorastroliteLoader when no build exists;
  shows blue/green iframes + status bar when build exists.
- `PreviewIframe.tsx`: Sandboxed iframe with `srcdoc` prop.
  `sandbox="allow-scripts allow-forms allow-same-origin"`.
- `StatusBar.tsx`: Below iframe. Pulsing dot (color-coded) + status
  text + elapsed timer. Wire to build-store for phase and narration
  module for text.
- `ResponsiveToggles.tsx`: Desktop / Tablet / Mobile buttons that
  resize the iframe container.
- `DeployButton.tsx`: Disabled if no deploy tokens configured. Tooltip
  explains why disabled.

**Acceptance criteria:**

- [ ] Loader shows when buildState is idle and no VFS exists
- [ ] Two iframes exist in DOM (one visible, one hidden)
- [ ] Status bar renders with correct color and text for each build phase
- [ ] Responsive toggles resize the iframe
- [ ] Deploy button shows disabled state with tooltip when appropriate

---

### WI-031 · Implement Blue/Green Swap Manager

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-005 |
| **Sprint** | 3 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/preview/blue-green.ts
src/engine/preview/iframe-bridge.ts
tests/unit/engine/blue-green.test.ts
```

**Agent instructions:**

1. `blue-green.ts`: Implement `SwapManager` class.
   - `injectToInactive(html: string): void` — writes `srcdoc` to the
     currently inactive iframe.
   - `swap(): void` — toggles active/inactive via opacity and z-index.
   - `getActiveSlot(): 'blue' | 'green'`
   - `waitForLoad(timeout: number): Promise<boolean>` — resolves when
     iframe `load` event fires, or rejects on timeout.

2. `iframe-bridge.ts`: `postMessage` communication layer.
   - `sendToIframe(iframe: HTMLIFrameElement, message: BridgeMessage): void`
   - `listenForErrors(callback: (error: string) => void): () => void`
     — returns unsubscribe function. Listens for `error` type messages
     from the iframe's injected error reporter script.
   - `getConsoleInterceptorScript(): string` — returns a JS string that
     hijacks `console.error` inside the iframe and sends errors to the
     parent via `postMessage`.

Tests use JSDOM or mock iframe elements.

**Tests (minimum 5):**

```
should track active slot correctly after swap
should alternate slots on consecutive swaps
should inject srcdoc to the inactive iframe
should generate console interceptor script
should resolve waitForLoad when load event fires
```

---

### WI-032 · Implement Backlog Panel Components

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-026, WI-028 |
| **Sprint** | 3 |
| **Estimated effort** | M |

**Files to create:**

```
src/components/backlog/BacklogPanel.tsx
src/components/backlog/OnDeckCard.tsx
src/components/backlog/BacklogList.tsx
src/components/backlog/BacklogCard.tsx
src/components/backlog/PauseResumeButton.tsx
```

**Agent instructions:**

Implement backlog panel per PRD §8.4.

- `OnDeckCard`: Lock icon, amber left border, no drag handle, shows
  "Paused" badge when paused. Untouchable.
- `BacklogList`: Ordered, drag-and-drop reorderable list. Use a
  lightweight drag library (e.g., `@dnd-kit/core` — document in
  DECISIONS.md). On drop: dispatch reorder to store (which will
  eventually trigger PO arbitration).
- `BacklogCard`: Numbered, draggable, click-to-focus. Visual states:
  normal, focused (elevated + blue border), done (checkmark + muted).
- `PauseResumeButton`: Toggle button. Updates build-store.

**Acceptance criteria:**

- [ ] On Deck card renders with lock icon and is not draggable
- [ ] Backlog cards can be dragged and dropped to reorder
- [ ] Clicking a backlog card focuses it (elevates, blue border)
- [ ] Clicking the focused card again defocuses it
- [ ] Pause button toggles to Resume and shows badge on On Deck
- [ ] Done items show checkmark and are visually muted

---

### WI-033 · Implement Settings Modal

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-017, WI-026 |
| **Sprint** | 3 |
| **Estimated effort** | M |

**Files to create:**

```
src/components/settings/SettingsModal.tsx
src/components/settings/ApiKeyInput.tsx
src/components/settings/ModelSelector.tsx
src/components/settings/TokenInput.tsx
src/components/settings/ExpandableGuide.tsx
```

**Agent instructions:**

Implement settings modal per PRD §8.5. Three tabs: LLM Keys, Models,
Deploy Tokens.

- `ApiKeyInput`: Password-style input, "Show" toggle, validation ping
  on save (calls the provider's auth endpoint), stores encrypted via
  settings-store.
- `ModelSelector`: Dropdown populated with models available for the
  configured provider. Two dropdowns: Chat AI model, Builder AI model.
- `TokenInput`: Similar to ApiKeyInput. Includes inline validation
  button. Each token input has an `ExpandableGuide` below it.
- `ExpandableGuide`: Accordion component that expands to show the
  step-by-step token acquisition guide. Content sourced from
  `config/token-guides.ts`.

**Acceptance criteria:**

- [ ] Modal opens from Settings button in header
- [ ] Three tabs switch content correctly
- [ ] API keys are masked by default, revealable
- [ ] Saving a key triggers validation ping and shows result
- [ ] Token guides expand/collapse with smooth animation
- [ ] All inputs persist to settings-store (encrypted)

---

### WI-034 · Implement Cost Ticker

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-012, WI-026 |
| **Sprint** | 3 |
| **Estimated effort** | S |

**Files to create:**

```
src/components/shared/CostTicker.tsx
```

**Agent instructions:**

Implement per PRD §8.2. Reads from LLM gateway's running total (via
build-store or a dedicated cost slice).

- Displays `💰 $X.XX` in the header bar
- Hover shows tooltip with breakdown: per-role cost, call counts, model
  names, total tokens in/out, pricing last-updated date
- Formats to 2 decimal places; shows `$0.00` initially
- If any model is unknown, shows `*` next to total with tooltip:
  "Some costs could not be calculated — unknown model pricing"

**Acceptance criteria:**

- [ ] Ticker displays formatted cost
- [ ] Hover tooltip shows breakdown
- [ ] Unknown model flag renders correctly
- [ ] Updates in real-time as store changes

---

### WI-035 · Implement New Conversation Button + Reset Flow

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-028, WI-029 |
| **Sprint** | 3 |
| **Estimated effort** | S |

**Files to create:**

```
src/components/shared/NewConversationButton.tsx
src/components/shared/ConfirmDialog.tsx
```

**Agent instructions:**

- `NewConversationButton`: Triggers confirmation dialog if session has
  content. On confirm: calls `resetSession` on session-store.
- `ConfirmDialog`: Reusable modal with title, message, confirm/cancel
  buttons. Used for: reset confirmation.

After reset: preview shows ChlorastroliteLoader, chat shows welcome
message, backlog clears, build state returns to idle.

**Acceptance criteria:**

- [ ] Clicking when session has content shows confirm dialog
- [ ] Clicking when no session resets immediately (no dialog)
- [ ] After reset: loader is visible, chat is clear, backlog is empty
- [ ] Settings (keys, tokens, model selections) are preserved

---

## Sprint 4 — Integration

**Goal:** End-to-end flow works. First message produces a preview.
Builder loop runs. Backlog interactions work.

**Milestone M5:** Type a first message → see template preview → watch
3 iterative builds swap in → backlog updates visually.

---

### WI-036 · Wire First Message → Classify → Assemble → Preview

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-012, WI-016, WI-021, WI-031 |
| **Sprint** | 4 |
| **Estimated effort** | L |

**Agent instructions:**

This is the first cross-cutting integration. Connect:
ChatInput → chat-store → LLM Gateway (classifier) → TemplateAssembler →
VFS store → SwapManager → PreviewIframe.

On first message:
1. User types message, hits send
2. Message appears in chat (user bubble)
3. Typing indicator appears
4. LLM classifier called (or mocked for dev)
5. Classification result determines template
6. TemplateAssembler creates VFS with quick customization
7. VFS injected into inactive iframe via SwapManager
8. Loader replaced by preview (first swap)
9. AI chat message confirms: "Here's your first preview!"

Use mock LLM responses from fixtures during development. The real LLM
call should be behind a feature flag or `import.meta.env.DEV` check.

**Integration test:**

```
should classify first message, assemble template, and produce VFS v1
  with correct sections and customization applied
```

---

### WI-037 · Implement PO Logic (Backlog Generation + Decomposition)

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004, WI-015, WI-016 |
| **Sprint** | 4 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/chat/po-logic.ts
tests/unit/engine/po-logic.test.ts
tests/fixtures/llm-responses/backlog/small-business-decomposition.json
tests/fixtures/llm-responses/backlog/blog-decomposition.json
```

**Agent instructions:**

Implement PO backlog generation and arbitration logic.

Functions:
- `buildBacklogPrompt(classification: ClassificationResult, templateConfig: TemplateConfig): LLMRequest`
- `parseBacklogResponse(response: LLMResponse): WorkItem[]`
- `validateAtomSizing(items: WorkItem[]): ValidationResult` — checks
  each item against Builder Atom constraints
- `evaluateReorder(fromIndex: number, toIndex: number, backlog: WorkItem[]): Promise<ReorderDecision>`

All atom decomposition rules from the Iterative Build Engine design must
be encoded in the prompt.

**Tests (minimum 5):**

```
should generate backlog prompt including atom sizing rules
should parse valid backlog response into WorkItem array
should reject work items exceeding atom constraints
should approve a valid reorder with no dependency violation
should deny a reorder that violates dependency ordering
```

---

### WI-038 · Wire PO to Backlog Panel

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-032, WI-037 |
| **Sprint** | 4 |
| **Estimated effort** | S |

**Agent instructions:**

Connect PO backlog generation output to backlog-store and BacklogPanel.
After classification and first preview (WI-036), PO generates backlog
items which appear in the Backlog Panel with the first item set as
On Deck.

---

### WI-039 · Implement Full Builder Loop

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-007, WI-009, WI-010, WI-011, WI-014, WI-031 |
| **Sprint** | 4 |
| **Estimated effort** | L |

**Files to create:**

```
src/engine/builder/builder-loop.ts
tests/integration/builder-loop.test.ts
```

**Agent instructions:**

Implement the master builder loop from the Iterative Build Engine design
§3.3. This is the orchestration module that ties together: context
assembly, LLM call, patch parsing, validation, continuity checks,
scaffold audit, circuit breaker, and swap.

The loop:
1. Check: is there an On Deck item? Is build unpaused? → proceed
2. Assemble context (ContextManager)
3. Call Builder AI (LLMGateway)
4. Parse response as BuildPatch
5. Validate patch schema
6. Apply patch to VFS clone (PatchEngine)
7. Run continuity checks
8. Run scaffold audit
9. If all pass → commit to real VFS, inject to inactive iframe, swap
10. If fail → circuit breaker decides retry or skip
11. Update backlog: mark done, promote next On Deck
12. Loop

Use the Heartbeat monitor throughout for phase timing. Emit events for
the narration layer.

**Integration tests (minimum 3):**

```
should complete a successful build cycle from On Deck to swap
should retry once on bad patch then succeed
should skip atom after 3 failures and move to next
```

---

### WI-040 · Wire Builder Loop to UI

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-015, WI-030, WI-039 |
| **Sprint** | 4 |
| **Estimated effort** | M |

**Agent instructions:**

Connect builder-loop events to:
- StatusBar (phase text, dot color, elapsed timer)
- Chat (swap messages, skip messages)
- Backlog (status transitions, checkmarks, On Deck promotion)

After this work item, the user should see: status bar updating during
builds, chat messages on each swap, and backlog items progressing.

---

### WI-041 · Implement Backlog Drag/Drop → PO Arbitration

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-032, WI-037 |
| **Sprint** | 4 |
| **Estimated effort** | M |

**Agent instructions:**

Wire the drag-and-drop reorder event to PO arbitration:
1. User drops item at new position
2. Optimistically show the new order (feels responsive)
3. Submit to `po-logic.evaluateReorder()`
4. If approved: keep new order
5. If denied: animate revert to original order + PO explanation in chat

---

### WI-042 · Implement Focus-Chat Mode

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-027, WI-032 |
| **Sprint** | 4 |
| **Estimated effort** | S |

**Agent instructions:**

When user clicks a backlog card:
1. Card elevates visually (focused state)
2. Chat input placeholder changes to "Ask about [item title]…"
3. Chat context switches: subsequent messages are about this item
4. PO responds in context of the focused item
5. Click again or click another item to change focus

---

### WI-043 · Implement Session Recovery

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-018, WI-028 |
| **Sprint** | 4 |
| **Estimated effort** | M |

**Agent instructions:**

On app load:
1. Check for recoverable session via `SessionCheckpoint.detectRecovery()`
2. If found: show recovery dialog with session info
3. "Resume" loads checkpoint into stores
4. "Start fresh" clears checkpoint and shows fresh loader

Wire checkpoint saving to VFS commit events (save after every successful
swap).

---

## Sprint 5 — Deploy & Polish

**Goal:** Deploy pipeline works. Documentation generates. E2E tests
pass. Studio is production-ready.

**Milestone M6:** Click deploy → site live on GitHub Pages → doc packet
downloads.

---

### WI-044 · Implement GitHub Pages Deploy

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 5 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/deploy/hosts/github-pages.ts
tests/unit/engine/github-pages.test.ts
```

**Agent instructions:**

Implement deployment to GitHub Pages via the GitHub REST API (Octokit).

Steps:
1. Create repo (if not exists): `POST /user/repos`
2. Create/update files: `PUT /repos/{owner}/{repo}/contents/{path}`
   for each file in VFS
3. Enable GitHub Pages: `POST /repos/{owner}/{repo}/pages` with
   source branch `main`
4. Poll for Pages build completion
5. Return live URL: `https://{username}.github.io/{repo}`

Mock all API calls in tests using `msw` (Mock Service Worker) or
manual fetch mocks.

**Tests (minimum 3):**

```
should create a repo and push all VFS files
should enable GitHub Pages on the repo
should return the correct live URL
```

---

### WI-045 · Implement Netlify Deploy

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 5 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/deploy/hosts/netlify.ts
tests/unit/engine/netlify.test.ts
```

**Agent instructions:**

Deploy to Netlify via their REST API.
1. Create site: `POST /api/v1/sites`
2. Deploy files: `POST /api/v1/sites/{site_id}/deploys` with file digest
3. Upload files: `PUT /api/v1/deploys/{deploy_id}/files/{path}`
4. Return live URL from deploy response

---

### WI-046 · Implement Cloudflare Pages Deploy

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-004 |
| **Sprint** | 5 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/deploy/hosts/cloudflare.ts
tests/unit/engine/cloudflare.test.ts
```

**Agent instructions:**

Deploy to Cloudflare Pages via the Cloudflare API.
1. Create project: `POST /accounts/{account_id}/pages/projects`
2. Create deployment: `POST /accounts/{account_id}/pages/projects/{project}/deployments`
3. Upload files as multipart form data
4. Return live URL from deployment response

---

### WI-047 · Implement Deploy Manager

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-044, WI-045, WI-046 |
| **Sprint** | 5 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/deploy/deploy-manager.ts
src/engine/deploy/validators.ts
tests/unit/engine/deploy-manager.test.ts
tests/unit/engine/validators.test.ts
```

**Agent instructions:**

1. `validators.ts`: Pre-deploy checks.
   - No `node_modules` in VFS
   - All files are static (HTML, CSS, JS, images, JSON, XML)
   - All internal links resolve to files that exist in VFS
   - Total size under 100MB (generous limit)
2. `deploy-manager.ts`: Orchestrates the deploy flow.
   - Select host based on zero-cost priority + available tokens
   - Run validators
   - Call appropriate host deployer
   - Return deployment record

**Tests (minimum 5):**

```
should select GitHub Pages when only GitHub token is configured
should select Cloudflare Pages when site needs Workers
should reject VFS containing node_modules
should detect broken internal links
should complete deploy and return deployment record
```

---

### WI-048 · Implement Documentation Packet Generator

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-005 |
| **Sprint** | 5 |
| **Estimated effort** | M |

**Files to create:**

```
src/engine/deploy/doc-generator.ts
tests/unit/engine/doc-generator.test.ts
```

**Agent instructions:**

Generate user-site-branded documentation per PRD §3 Epic 7.

Input: VFS, session, deployment record, backlog (for feature list).
Output: Map of Markdown files matching the packet structure in PRD §7.1.2.

Apply branding: user's site title, logo SVG, primary/accent colors
(extracted from VFS CSS `:root` block).

**Tests (minimum 3):**

```
should generate all 7 documentation sections as Markdown
should apply user site branding (title, colors) to README
should include correct deploy URL and host info
```

---

### WI-049 · Wire Deploy Flow to UI

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-030, WI-047, WI-048 |
| **Sprint** | 5 |
| **Estimated effort** | M |

**Agent instructions:**

Connect DeployButton click → deploy-manager → progress messages in
chat → completion message with live URL → documentation packet
download link.

---

### WI-050 · E2E Test: Full Template Path

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | All Sprint 4 items |
| **Sprint** | 5 |
| **Estimated effort** | M |

**Files to create:**

```
tests/e2e/template-flow.spec.ts
playwright.config.ts
```

**Agent instructions:**

Add Playwright. Write E2E test: type first message → loader disappears →
preview renders → 3 build swaps occur → backlog items check off → deploy
button becomes available.

Use mocked LLM responses (intercept fetch in Playwright).

---

### WI-051 · E2E Test: Backlog Interactions

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | All Sprint 4 items |
| **Sprint** | 5 |
| **Estimated effort** | S |

**Files to create:**

```
tests/e2e/backlog-interaction.spec.ts
```

**Agent instructions:**

E2E test: drag/drop reorder → PO approves → order persists. Drag again →
PO denies → order reverts. Click to focus → chat context changes. Pause →
builder stops → resume → builder continues.

---

### WI-052 · Token Acquisition Guide Content

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-033 |
| **Sprint** | 5 |
| **Estimated effort** | S |

**Files to create:**

```
src/config/token-guides.ts
```

**Agent instructions:**

Transcribe the three token acquisition guides from PRD §3 Epic 6
(§6.2.2, §6.2.3, §6.2.4) into structured TypeScript objects that the
`ExpandableGuide` component renders. Include: steps, URLs, security
notes, and a `lastVerified` date field.

---

### WI-053 · Model Pricing Config + Unknown Model Handling

| Field | Value |
|---|---|
| **Status** | ⬜ TODO |
| **Depends on** | WI-012 |
| **Sprint** | 5 |
| **Estimated effort** | S |

**Agent instructions:**

Ensure `config/model-pricing.json` includes all models from the PRD.
Add `lastUpdated` field. Update `cost.ts` to handle unknown models by
returning `{ cost: 0, unknownModel: true }`. Update `CostTicker` to
show the `*` indicator and tooltip for unknown models.

**Tests (minimum 3):**

```
should load pricing from JSON config file
should return unknownModel flag for unlisted model
should display last-updated date in tooltip
```

---

## Summary

| Sprint | Items | Estimated Days | Key Milestone |
|---|---|---|---|
| **Sprint 0** | WI-001 → WI-004 | 2 | M1: App builds and deploys |
| **Sprint 1** | WI-005 → WI-018 | 6 | M2: All engine code tested |
| **Sprint 2** | WI-019 → WI-025 | 6 | M3: All templates assemble |
| **Sprint 3** | WI-026 → WI-035 | 6 | M4: UI shell interactive |
| **Sprint 4** | WI-036 → WI-043 | 8 | M5: First end-to-end flow |
| **Sprint 5** | WI-044 → WI-053 | 8 | M6: Deployable studio |
| **Total** | 53 items | ~36 days | Production-ready MVP |

---
