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

---
