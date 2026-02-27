# Ralph Tasks

## Guardrails (Non-Negotiable)
- Zero-cost first: client-side only studio; generated sites favor GitHub Pages → Cloudflare Pages → Netlify → Vercel (hobby) with no paid services unless explicitly consented.
- Security: User LLM/API/deploy tokens encrypted in-browser (AES-256), never sent to studio servers; no third-party trackers; CSP; no eval.
- Quality guardrails always on (no YOLO): enforce accessibility (semantic HTML, AA contrast), no autoplay/popup/dark patterns; push back twice then comply with caveat.
- Template/patch protocol: Monolithic section library; PP:SECTION/BLOCK/FUNC anchors; Builder outputs patch ops only (no full files); scaffold must stay intact; CSS uses var(--*) not hardcoded hex; BEM for generated sites; Tailwind utilities for studio UI.
- Builder Atom limits: touches ≤5 files, ≤150 LOC, one visible change, single concern (structure/content/style/behavior/integration), ≤3 LLM calls, ≤90s wall time.
- Architecture boundaries: engine/ pure TS (no React/DOM, Result types, no throws, no any); components/ React only; store/ Zustand; types/ interfaces only; follow naming conventions; tests required per engine module (≥80% lines/functions, ≥70% branches).
- Cost & telemetry: Always show running LLM cost; pricing table lives in JSON config with “last updated”; telemetry stored locally in IndexedDB, no PII.
- Content constraints: No user image upload for MVP; use SVG/Unsplash/gradients; SEO items auto-added; single active session model.
- Change control: New dependencies documented in DECISIONS; commit message format `feat|fix(module): ...`; maintain section anchors and CSS blocks.

- [x] Epic: Constraint Check (Guardrails)
  - [ ] Implement automated checks that enforce anchors intact, CSS var usage, accessibility basics, zero-cost host selection, and Builder Atom size before swap.
  - [ ] Wire guardrail violations to retry/skip with PO chat notification; block swap on failures.
  - [ ] Add CI step/lint rule stubs to prevent engine React imports and disallow `any`.
  - [ ] Add CSP headers + SRI to preview iframe responses; block third-party trackers/eval; tests assert CSP present and eval disallowed.
  - [ ] Add autoplay/popup/dark-pattern prevention checks; tests reject autoplay video/audio on load and modal-on-load patterns.
  - [ ] Extend guardrail tests to enforce WCAG AA contrast for new CSS, CSS var-only colors, and zero-cost host priority in Deploy Manager.
  - [ ] Acceptance: Guardrail suite fails seeded violations (missing PP anchor, hardcoded hex, CSP missing, autoplay video) and blocks swap/CI; passes on corrected code.

- [x] Epic: Sequencing Roadmap (Dependency Order)
  - [ ] Document execution order: Project Scaffold → CI/CD → Foundational Docs → Type Contracts → VFS Core → Snapshot Manager → Patch Engine → Scaffold/Continuity → Section Library → Template Configs → UI Shell/Panels → Builder/PO wiring → Deploy flows → E2E suites.
  - [ ] Add checklist to gating CI to ensure upstream dependencies completed before downstream epics are picked up.
  - [ ] Acceptance: Roadmap published in docs/WORK_ITEMS.md and referenced in PR templates.

- [x] Epic: Project Scaffold
  - [ ] Initialize Vite React TS project with Tailwind/PostCSS, strict TS, @/ alias, placeholder App.
  - [ ] Add ESLint+Prettier config, Vitest config, base scripts, empty test dirs.
  - [ ] Acceptance: `npm run dev`, `npm run build`, `npm run lint`, `tsc --noEmit` all succeed.

- [x] Epic: CI/CD Pipelines
  - [ ] Add ci.yml (lint, typecheck, unit, build with bundle-size gate, integration stubs).
  - [ ] Add deploy-preview.yml for PR CF Pages previews; deploy-production.yml for main with tag v0.0.x.
  - [ ] Acceptance: Push on feature branch runs CI green; preview workflow syntactically valid; build artifact under 512KB gate.

- [x] Epic: Foundational Docs
  - [ ] Author CONVENTIONS, ARCHITECTURE, DECISIONS (D-001/002), PATCH-PROTOCOL, SECTION-SCHEMA, SYSTEM-PROMPTS, ZERO-COST-PLAYBOOK, README aligned to operating model.
  - [ ] Acceptance: Docs render without TODOs; links to files/sections resolve; DECISIONS append-only.

- [x] Epic: Type Contracts
  - [ ] Define interfaces for session/chat/backlog/vfs/patch/build/deploy/template/telemetry/pricing; Result helper and error categories.
  - [ ] Acceptance: `tsc --noEmit` passes with no `any`; types consumed by tests compile.

- [x] Epic: VFS Core
  - [ ] Implement in-memory VFS CRUD with versioning + content hash; manifest serialization.
  - [ ] Acceptance: Unit tests cover CRUD, version bump, hash integrity.

- [x] Epic: Snapshot Manager
  - [ ] Rolling last-5 snapshot store with rollback restoring version counters.
  - [ ] Acceptance: Tests show save/prune/rollback; lostVersions reported.

- [x] Epic: Patch Engine
  - [ ] Apply patch ops (section replace/insert/delete, css append/replace, js append/replace func, file create/delete, metadata update) with optimistic version lock.
  - [ ] Acceptance: Tests per op; schema violations rejected; untouched files unchanged.

- [x] Epic: Scaffold Auditor
  - [ ] Detect PP anchor drift (missing/malformed/orphaned) across HTML/CSS/JS; auto-repair common cases; health score output.
  - [ ] Acceptance: Corrupted fixture repaired or flagged; health score thresholds computed.

- [x] Epic: Continuity Checks
  - [ ] Implement theme/nav consistency, section-count delta, filesTouch enforcement, CSS var usage checks.
  - [ ] Acceptance: Failing check blocks swap; passing check allows swap.

- [x] Epic: Circuit Breaker
  - [ ] Track attempts per atom (max 3), open/half-open states, reset on success.
  - [ ] Acceptance: Tests show retry → skip after max; success resets breaker.

- [x] Epic: Heartbeat Monitor
  - [x] Phase timers with warn/timeout hooks for build phases.
  - [x] Acceptance: Tests emit warn/timeout at thresholds; idle phases ignored.

- [x] Epic: LLM Gateway (OpenAI)
  - [ ] Provider abstraction, cost calc, telemetry hook; error mapping; unknown model fallback.
  - [ ] Acceptance: Tests cover routing, cost math, unknown model returns “Cost: unknown”.

- [x] Epic: Anthropic & Google Providers
  - [ ] Add adapters for Anthropic and Google models.
  - [ ] Acceptance: Tests show successful routing + error handling per provider.

- [x] Epic: Context Budget Manager
  - [ ] Token budgeting, history trim/summarize, minimal context mode.
  - [ ] Acceptance: Tests keep context under budget; minimal mode triggers when constrained.

- [x] Epic: Narration Layer
  - [ ] Status-bar text mapping, slow-message rotation, swap/skip chat messages.
  - [ ] Acceptance: Tests map each phase to expected text; slow messaging after threshold.

- [x] Epic: First-Message Classifier
  - [ ] Template vs scratch JSON with confidence gate + clarifying question rule; fixtures.
  - [ ] Acceptance: Tests classify template/scratch/ambiguous per fixtures.

- [x] Epic: Encryption
  - [ ] AES-256 encrypt/decrypt wrapper for keys/tokens; validation errors.
  - [ ] Acceptance: Tests pass roundtrip; invalid key rejected.

- [x] Epic: Persistence
  - [ ] IndexedDB setup; checkpoint save/restore; telemetry append-only log.
  - [ ] Acceptance: Tests confirm checkpoint resume; log order preserved.

- [x] Epic: Telemetry Logger
  - [ ] Event schema + write path; export hook; no PII.
  - [ ] Acceptance: Tests ensure append-only and schema validation.

- [x] Epic: Section Library Schema
  - [ ] Validate SectionDefinition/Slot; fixtures for universal/near/shared/unique sections.
  - [ ] Acceptance: Schema tests pass; invalid fixtures rejected.

- [x] Epic: Universal Sections
  - [ ] Build hero, nav, footer, contact, SEO-base partials with PP anchors + CSS blocks.
  - [ ] Acceptance: Tests validate anchors/blocks; render placeholders.

- [x] Epic: Near-Universal Sections
  - [ ] Build about, features grid, testimonials, CTA banner sections.
  - [ ] Acceptance: Tests validate anchors and slot bindings.

- [x] Epic: Shared Sections
  - [ ] Build FAQ, pricing, category filter, filterable grid, lightbox, services list, team, hours/location, reviews embed.
  - [ ] Acceptance: Tests include dependency rules (e.g., lightbox ↔ gallery).

- [x] Epic: Unique Sections
  - [ ] Build blog list/detail + RSS, feature comparison, gallery, product cards, cart, stripe link, calendar embed, service menu, multi-step form, confirmation page.
  - [ ] Acceptance: Tests per section; cart uses localStorage; RSS outputs XML.

- [x] Epic: Template Assembler
  - [x] Config → VFS assembly with dependency/conflict validation and slot filling.
  - [x] Acceptance: Integration tests assemble from configs; missing dep rejected.

- [x] Epic: Template Configs Wave 1
  - [ ] Marketing, Portfolio, Small Business JSON configs.
  - [ ] Acceptance: Integration tests produce expected section order.

- [x] Epic: Template Configs Wave 2
  - [ ] Blog, SaaS, Simple Store, Bookings, Form-to-Email configs.
  - [ ] Acceptance: Tests pass assembly; unique feature flags honored.

- [x] Epic: UI Layout Shell
  - [ ] Three-panel responsive layout + HeaderBar with buttons placeholders.
  - [ ] Acceptance: Layout adapts desktop/tablet/mobile; panels sized 30/45/25%.

- [x] Epic: Chat Panel
  - [ ] iMessage bubbles, typing indicator, message grouping, auto-scroll.
  - [ ] Acceptance: Visual check; unit snapshot/test for grouping logic.

- [x] Epic: ChlorastroliteLoader
  - [ ] Gem/eye variants, dynamic label state machine, secret trigger hook.
  - [ ] Acceptance: Renders both variants; label progression mapped to stages.

- [x] Epic: Preview Panel & Blue/Green Swap
  - [ ] Iframes with srcdoc injection, responsive toggles, status bar.
  - [ ] Acceptance: Swap animation occurs only after validation; inactive frame hidden.

- [x] Epic: Blue/Green Swap Manager
  - [ ] Swap controller + iframe bridge postMessage.
  - [ ] Acceptance: Tests cover swap, error handling, postMessage routing.

- [x] Epic: Backlog Panel
  - [ ] On Deck locked card, drag/drop backlog list, focus highlight, pause/resume.
  - [ ] Acceptance: UI reflects lock, pause badge; drag reorder events emitted.

- [x] Epic: Settings Modal
  - [ ] Tabs for LLM Keys/Models/Deploy Tokens; AES persistence; validation pings; expandable guides.
  - [ ] Acceptance: Keys/tokens stored encrypted; invalid key shows error.

- [x] Epic: Cost Ticker
  - [ ] Running total, hover breakdown, unknown-model tooltip, pricing “last updated”.
  - [ ] Acceptance: Cost recomputes on mocked usage; tooltip shows breakdown + date.

- [x] Epic: New Conversation Flow
  - [ ] Confirm dialog; reset preserves preferences; loader reset state.
  - [ ] Acceptance: Reset clears session/backlog/VFS; preserves keys/models/tokens.

- [x] Epic: Zustand Stores
  - [ ] Session/chat/backlog/build/settings/telemetry stores with derived selectors.
  - [ ] Acceptance: Unit tests on actions ensure immutability and state transitions.

- [x] Epic: LLM First-Message Path
  - [ ] Wire classifier → template assemble → quick customize Title/Logo/Slogan/Colors → preview ≤30s.
  - [ ] Acceptance: Integration test hits preview within SLA with mocked LLM.

- [x] Epic: PO Backlog Generation
  - [ ] Apply decomposition + SEO auto-items; visibleChange/filesTouch/effort/deps set.
  - [ ] Acceptance: Fixture produces atoms all within Builder Atom limits.

- [x] Epic: Guardrail UX (Pushback Rule)
  - [x] Implement “push back twice then comply with caveat” flow in chat PO with tone guidance.
  - [x] Add automated conversation tests covering refusal → alternative → comply-with-caveat paths.
  - [x] Acceptance: Tests verify two pushbacks then compliance with inline note; no infinite denial.

- [x] Epic: Content Constraints Enforcement
  - [x] Block user image upload UI; enforce SVG/Unsplash/gradient-only imagery; fallback patterns when Unsplash limited.
  - [x] Auto-add SEO items (meta, OG, JSON-LD, sitemap, robots) when missing; validation checks ensure presence before deploy.
  - [x] Enforce single active session model (no multi-session switch); reset flow preserves preferences only.
  - [x] Acceptance: Tests fail when upload attempted, SEO items missing, or second session opened; pass when constraints met.

- [x] Epic: Backlog Wiring to UI
  - [x] Sync PO output to stores/UI; On Deck promotion logic; statuses update.
  - [x] Acceptance: On Deck always present/locked; completed items collapse.

- [x] Epic: Builder Context Assembly
  - [ ] Manifest + affected/adjacent sections + patch instructions per atom.
  - [ ] Acceptance: Context excludes unrelated sections; matches budget thresholds.

- [x] Epic: Builder Loop
  - [ ] On Deck → LLM → patch → validate → continuity → swap; retry + breaker.
  - [ ] Acceptance: Integration test passes successful build and retry-fail-skip path.

- [x] Epic: Narration Wiring
  - [ ] Status bar + chat messages driven from build state; slow/timeout transitions.
  - [ ] Acceptance: UI messages match OBSERVABILITY_UX mapping for each phase.

- [x] Epic: Reorder Arbitration
  - [x] Drag/drop → PO approve/deny with revert animation.
  - [x] Acceptance: Approved reorder persists; denied reorder animates revert + chat rationale.

- [x] Epic: Focus-Chat Mode
  - [ ] Click backlog item → chat context tag + hint; builder unaffected mid-build.
  - [ ] Acceptance: Focused item highlighted; messages carry backlog item metadata.

- [x] Epic: Session Recovery
  - [ ] Checkpoint detect on load; resume/start-fresh dialog; persisted last 20 msgs.
  - [ ] Acceptance: Crash fixture reload offers resume; fresh load shows no prompt.

- [x] Epic: Deploy – GitHub Pages
  - [ ] Create repo, push, enable Pages via API; scope validation.
  - [ ] Acceptance: Mocked API tests create repo, enable pages, return live URL.

- [x] Epic: Deploy – Cloudflare Pages
  - [ ] Wrangler/API deploy; account ID handling.
  - [ ] Acceptance: Mocked deploy returns URL; handles missing token gracefully.

- [x] Epic: Deploy – Netlify
  - [ ] Netlify API deploy flow.
  - [ ] Acceptance: Mocked deploy returns URL; handles invalid token error path.

- [ ] Epic: Deploy Manager & Validators
  - [ ] Host selection (zero-cost priority + features + available tokens); predeploy scans (no node_modules, Lighthouse stub, link check, vulnerability allowlist).
  - [ ] Acceptance: Tests pick correct host per matrix (GH→CF→Netlify priority) and validation blocks bad bundle.

- [ ] Epic: Token Guides & Validation UI
  - [ ] Render GitHub/Netlify/CF guides; “Test token” buttons call validators.
  - [ ] Acceptance: Invalid token shows actionable error; valid token unlocks host option.

- [ ] Epic: Documentation Packet Generator
  - [ ] Branded Markdown bundle + PDF render; logo/colors/fonts from site; screenshots capture hook.
  - [ ] Acceptance: Generated packet contains all 7 sections and assets; renders without broken links.

- [ ] Epic: Deploy UI Wiring
  - [ ] DeployButton states, progress chat events, final live URL + doc download link.
  - [ ] Acceptance: UI disables when no tokens; shows progress and success/fail chat messages.

- [ ] Epic: Model Pricing Config
  - [ ] External JSON pricing table load; unknown model path; “pricing last updated” tooltip date.
  - [ ] Acceptance: Tests for known/unknown models and date display.

- [ ] Epic: Observability UX Integration
  - [ ] Map build phases to status dot colors/text; slow/timeout messaging; skip/fail chat flows; channel consistency.
  - [ ] Acceptance: UI shows amber on warn, red on error; skip emits chat; status/backlog channels consistent.

- [ ] Epic: Scaffold Health Snapshots
  - [ ] Auto-save healthy snapshots; auto-repair degraded; rollback on critical score.
  - [ ] Acceptance: Health <50 triggers rollback; >=90 saves snapshot; tests verify.

- [ ] Epic: Telemetry Surfacing
  - [ ] Capture metrics per PRD §4.5; export hook; ensure local-only storage.
  - [ ] Acceptance: Logged events match schema; export produces JSON bundle.

- [ ] Epic: E2E – Template Flow
  - [ ] Playwright: first message → preview → 3 swaps → deploy (mocked).
  - [ ] Acceptance: Test passes with mocked LLM/deploy; preview swaps visible.

- [ ] Epic: E2E – Backlog Interactions
  - [ ] Playwright: drag reorder (approve/deny), focus-chat, pause/resume.
  - [ ] Acceptance: Test asserts UI + chat behaviors per OBSERVABILITY_UX.

- [ ] Epic: E2E – Deploy Tokens
  - [ ] Playwright: paste tokens, validation errors, host gating.
  - [ ] Acceptance: Invalid tokens block deploy; valid tokens enable host selection.

- [ ] Epic: Change Control Enforcement
  - [ ] Add CI/commit lint to enforce `feat|fix(module): description` pattern.
  - [ ] Add PR template/CI check requiring DECISIONS.md entry when adding dependencies.
  - [ ] Acceptance: Non-conforming commit message fails lint; PR adding dep without DECISIONS entry fails check.
