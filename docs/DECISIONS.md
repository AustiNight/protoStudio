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

### D-003 | 2026-02-27 | Add idb + fake-indexeddb for IndexedDB persistence
**Decision:** Add `idb` as a runtime dependency and `fake-indexeddb` as a dev dependency
for IndexedDB persistence and deterministic unit tests.
**Rationale:** `idb` provides a typed, promise-based IndexedDB wrapper; `fake-indexeddb`
enables reliable Node test coverage for persistence logic.
**Alternatives:** Manual IndexedDB wrapper (more boilerplate), skip persistence tests
(higher regression risk).
**Bundle impact:** Small client footprint (few KB gz for `idb`); `fake-indexeddb` is
dev-only (no production bundle impact).

### D-004 | 2026-02-27 | Add Zustand dependency
**Decision:** Add `zustand` as a runtime dependency for the `store/` layer.
**Rationale:** D-001 selected Zustand for state management; adding the dependency
unblocks store implementation and keeps state logic lightweight.
**Alternatives:** Redux Toolkit, Jotai, React Context (see D-001).
**Bundle impact:** Small client footprint (few KB gz).

### D-005 | 2026-02-27 | Add Playwright for E2E testing
**Decision:** Add `@playwright/test` as a dev dependency for end-to-end browser tests.
**Rationale:** E2E coverage is required for critical flows (template build, swaps, deploy)
and Playwright provides reliable, cross-browser automation with Vite-friendly setup.
**Alternatives:** Cypress (heavier runner, less flexible for multi-browser), WebdriverIO
more setup overhead, Puppeteer (no built-in test runner).
**Bundle impact:** Dev-only dependency (no production bundle impact).

(new entries appended here by agents)

### D-006 | 2026-03-02 | Move OpenAI key validation to engine-level API checks
**Decision:** Run OpenAI key ping via `src/engine/llm/openai-key-validation.ts` and consume
that service from UI, using `GET https://api.openai.com/v1/models` response mapping
(`200` valid, `401/403` invalid auth, `429` rate-limited, others as service/connectivity).
**Rationale:** Keeps provider/network logic out of React UI, prevents regex-only false negatives,
supports timeout/cancellation/stale-response handling, and centralizes key-safe behavior.
**Alternatives:** UI-local regex checks (too inaccurate), UI-direct fetch calls
(architecture violation + duplicated logic).

### D-007 | 2026-03-02 | Require official source metadata for OpenAI model catalog updates
**Decision:** Enforce `sourceUrls` (OpenAI official docs only) and `reviewedAt: 2026-03-02`
for OpenAI entries in `src/config/model-pricing.json` via schema + tests.
**Rationale:** Model availability and pricing change quickly; source and review stamping makes
catalog updates auditable and reduces drift.
**Alternatives:** Unstamped/manual model edits (higher risk of stale/unsupported entries),
third-party model lists (non-authoritative).

### D-008 | 2026-03-02 | Keep runtime settings store-backed as single source of truth
**Decision:** Treat `useSettingsStore` as canonical for provider/model/key runtime behavior;
`SettingsModal` reads/writes through store state instead of diverging local-only state.
**Rationale:** Prevents modal/runtime mismatch, ensures preview/deploy/chat consumers see updates
without refresh, and preserves encrypted settings UX semantics.
**Alternatives:** Modal-local state with delayed sync (drift/regression risk), scattered per-feature state.

### D-009 | 2026-03-02 | Scope cost ticker to the active telemetry session
**Decision:** Compute visible cost from `llm.response` events tied to the active `sessionId`,
rotate telemetry session on New Conversation, and reset active totals to zero for the new session.
**Rationale:** Prevents cross-conversation cost bleed and keeps header cost aligned with current chat context;
rehydration restores only the resumed session totals.
**Alternatives:** Global cumulative cost across sessions (confusing for per-conversation UX),
hardcoded/demo cost values (non-runtime-accurate).
 
---
