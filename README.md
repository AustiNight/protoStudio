# prontoproto.studio

Local-first website studio scaffold built with Vite, React, and Tailwind. The repo is the spec: read the docs before shipping changes.



## Docs

* `docs/OPERATING\_MODEL.md`
* `docs/ARCHITECTURE.md`
* `docs/CONVENTIONS.md`
* `docs/PATCH-PROTOCOL.md`
* `docs/SECTION-SCHEMA.md`
* `docs/SYSTEM-PROMPTS.md`
* `docs/ZERO-COST-PLAYBOOK.md`
* `docs/BUILD\_ENGINE.md`
* `docs/OBSERVABILITY\_UX.md`
* `docs/TEMPLATES\_ARCH.md`
* `docs/WORK\_ITEMS.md`
* `docs/DECISIONS.md`
* `docs/PRD\_V1.md`

## Quick start

```bash
npm install
npm run dev
```

## Environment

* `.env.example` documents all runtime knobs (LLM mode, preview sandbox, logging, model defaults, optional keys/tokens).
* `.env.local` is loaded by Vite for local overrides and is gitignored.

## Scripts

* `npm run dev` — start dev server
* `npm run build` — typecheck then build
* `npm run lint` — run ESLint
* `npm run test` — run Vitest

## Deployment

* Production hosting is Cloudflare Pages.
* The current bootstrap deployment path is direct upload to the `prontoproto-studio` Pages project via `npm run deploy:pages`.
* GitHub Actions are CI-only and do not own preview or production deploys.
* Custom domain target: `https://prontoproto.studio`
* OpenAI requests in production are routed through a Pages Function at `/api/openai/\*`.
* Configure the server secret before deploying:
`npx wrangler@4.71.0 pages secret put OPENAI\_API\_KEY --project-name prontoproto-studio`
* If `VITE\_OPENAI\_PROXY\_BASE\_URL` points to a different origin, also set
`OPENAI\_PROXY\_ALLOWED\_ORIGINS` (comma-separated), for example:
`https://prontoproto.studio,https://www.prontoproto.studio`

## Guardrails (Short)

* Client-only studio and static output; zero-cost hosting priority.
* Keys and tokens are encrypted in-browser; no third-party trackers; no eval.
* Builder uses patch ops only; scaffold and anchors stay intact.

