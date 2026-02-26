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

---
