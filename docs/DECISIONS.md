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

(new entries appended here by agents)

---
