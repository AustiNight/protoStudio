# prontoproto.studio

Local-first website studio scaffold built with Vite, React, and Tailwind. The repo is the spec: read the docs before shipping changes.

## Docs
- `docs/OPERATING_MODEL.md`
- `docs/ARCHITECTURE.md`
- `docs/CONVENTIONS.md`
- `docs/PATCH-PROTOCOL.md`
- `docs/SECTION-SCHEMA.md`
- `docs/SYSTEM-PROMPTS.md`
- `docs/ZERO-COST-PLAYBOOK.md`
- `docs/BUILD_ENGINE.md`
- `docs/OBSERVABILITY_UX.md`
- `docs/TEMPLATES_ARCH.md`
- `docs/WORK_ITEMS.md`
- `docs/DECISIONS.md`
- `docs/PRD_V1.md`

## Quick start
```bash
npm install
npm run dev
```

## Scripts
- `npm run dev` — start dev server
- `npm run build` — typecheck then build
- `npm run lint` — run ESLint
- `npm run test` — run Vitest

## Guardrails (Short)
- Client-only studio and static output; zero-cost hosting priority.
- Keys and tokens are encrypted in-browser; no third-party trackers; no eval.
- Builder uses patch ops only; scaffold and anchors stay intact.
