# Ralph Tasks

## Guardrails (Non-Negotiable)
- Keep architecture boundaries intact: UI work stays in `src/app` and `src/components`; provider/network logic stays in `src/engine/llm`; shared state stays in `src/store`; no React imports inside `src/engine/**`.
- `useSettingsStore` is the settings source of truth for runtime behavior; `SettingsModal` must not become UI-only state that diverges from store-backed runtime consumers.
- Never persist or log plaintext API keys outside the encrypted settings flow (`src/persistence/encryption.ts` + settings storage). Validation calls may use keys in-memory only.
- Use only official OpenAI sources for model-list updates (`platform.openai.com` and `developers.openai.com`), and stamp updates with an absolute review date (`2026-03-02`).
- Preserve existing encrypted settings UX (unlock/save/clear), deploy-token validation behavior, and single active session model.
- Every changed behavior must be covered by automated tests (unit and/or e2e), with explicit checks for regressions in chat input, key ping states, model selection list, and cost reset scope.

- [x] Epic: Constraint Check (Guardrails)
  - [x] Add a pre-merge checklist for this fix set that verifies: no plaintext-key persistence, no engine React imports, and only intended files changed for chat/settings/cost/model logic.
  - [x] Add/update lint or test assertions ensuring no `console.log`/telemetry payload ever includes full API keys.
  - [x] Add schema/test enforcement for OpenAI model metadata in `src/config/model-pricing.json` requiring `sourceUrls` (official OpenAI URLs) and `reviewedAt: 2026-03-02` whenever model catalog data changes.
  - [x] Add a guardrail check that runtime settings readers/writers resolve through `useSettingsStore` to prevent modal/store drift.
  - [x] Acceptance: CI/test run fails when a key leak, model-metadata omission, settings-source-of-truth drift, or architecture-boundary violation is introduced.

- [x] Epic: Fix #1 - Chat Window Input Does Not Accept User Typing
  - [x] Replace the chat-footer placeholder status row in `src/app/Layout.tsx` with a real composer control (`textarea` or `input`) + submit button while preserving the existing visual language.
  - [x] Add controlled draft state, disabled-send behavior for blank input, and keyboard handling: `Enter` sends, `Shift+Enter` inserts newline.
  - [x] On submit, append a `user` message to `useChatStore` with the active `sessionId`, current timestamp, and focused backlog metadata when present.
  - [x] Keep scroll-to-bottom behavior after send and maintain current focus hint text (`Ask about ...` vs general prompt).
  - [x] Add automated coverage for typing + send flow (e2e recommended: new `tests/e2e/chat-composer.spec.ts`; unit fallback if e2e unavailable in CI).
  - [x] Acceptance: typing is possible in the chat composer, sending creates a user bubble immediately, empty submissions are blocked, and keyboard behavior matches spec.

- [x] Epic: Cross-Cut - Settings Source Of Truth Alignment
  - [x] Audit current split between `SettingsModal` local state and `useSettingsStore` state, including runtime consumers in preview/deploy/chat flows.
  - [x] Implement a single store-backed read/write path so model/key selections used at runtime match what the modal displays and saves.
  - [x] Add regression tests proving modal updates are reflected in runtime consumers without refresh.
  - [x] Acceptance: changing provider/model/key in settings updates the canonical store and downstream consumers consistently.

- [x] Epic: Fix #2 - OpenAI Key Ping Marks Valid Key as Invalid
  - [x] Implement OpenAI key ping in `src/engine/llm` (service/provider module) and invoke that service from `src/components/shared/SettingsModal.tsx`; do not call OpenAI fetch directly from React UI code.
  - [x] Replace regex-only verdicts with API-based validation (preferred endpoint: `GET https://api.openai.com/v1/models`); keep local format checks as advisory hints only.
  - [x] Extend validation status handling to include explicit `error` state with timeout, cancellation (`AbortController`), and stale-response protection for repeated clicks/input edits/unmount.
  - [x] Map outcomes to actionable messages: `200` valid, `401/403` auth invalid, `429` rate limit, all other HTTP/network/CORS/timeout paths as service/connectivity errors (never default to “invalid key”).
  - [x] Ensure ping logic does not persist plaintext keys and does not emit them into telemetry events.
  - [x] Add unit tests for response mapping + async race scenarios (abort/timeout/stale result suppression).
  - [x] Add e2e ping coverage using deterministic mocked OpenAI responses (no live key/network dependency in CI).
  - [x] Acceptance: a valid OpenAI key passes ping, invalid auth fails with clear reason, and transient connectivity/timeout failures are reported distinctly from invalid credentials.

- [x] Epic: Fix #3 - OpenAI Model List Is Outdated
  - [x] Research current OpenAI model catalog using official sources (`/docs/models` + `/v1/models` reference) and record required model metadata in `src/config/model-pricing.json` with `sourceUrls` and `reviewedAt: 2026-03-02`.
  - [x] Update OpenAI entries in `src/config/model-pricing.json` to reflect currently allowed API models relevant to this app’s chat/builder usage (including current GPT-5 family, GPT-4.1 family, `gpt-4o` variants, and current `o*` reasoning models where applicable).
  - [x] Refactor `buildModelOptions` in `src/components/shared/SettingsModal.tsx` to avoid `gpt-`-only OpenAI detection so valid OpenAI `o*` IDs are selectable.
  - [x] Exclude or clearly mark deprecated/ChatGPT-only aliases from default selectable options when they are not intended for normal API use in this app.
  - [x] Add tests confirming model-option classification includes modern OpenAI families (`gpt-*` and `o*`) and still separates Anthropic/Google correctly.
  - [x] Acceptance: OpenAI dropdown contains an up-to-date, usable model set, includes modern non-`gpt-` OpenAI IDs, and no longer silently omits valid OpenAI models.

- [x] Epic: Fix #5 - New Conversation Must Reset Cost Counter To Active Conversation Only
  - [x] Introduce explicit session-id lifecycle on `New Conversation`: generate a new active session id, end the prior telemetry session, and start a fresh telemetry session while preserving the single-active-session model.
  - [x] Remove static demo cost wiring in `src/app/Layout.tsx` (`sampleCostRoles`, `sampleCostTotal`) and replace with live state driven by active session.
  - [x] Derive `CostTicker` totals/breakdowns from session-scoped telemetry (`llm.response`) keyed by active session id to prevent cross-session cost bleed.
  - [x] Reset active-session cost totals to zero during `New Conversation` confirm flow together with session/chat/backlog/build resets.
  - [x] Implement recovery rehydration so resumed sessions restore their own cost totals from checkpoint/telemetry history without mixing sessions.
  - [x] Add automated tests: session-id rotation + telemetry session rollover, cost reset semantics, and e2e check that clicking `New Conversation` returns visible cost to `$0.00` for the fresh conversation.
  - [x] Acceptance: top-right cost ticker always represents only the active conversation, `New Conversation` reliably resets visible cost to zero, and recovery restores the resumed session’s own totals.

- [ ] Epic: Regression Sweep and Verification
  - [ ] Run targeted unit tests for settings/model/cost/chat changes and update failing fixtures/snapshots intentionally affected by model list/cost data changes.
  - [ ] Run relevant e2e tests covering chat input, settings ping UX, and new-conversation cost reset behavior with mocked OpenAI validation responses.
  - [ ] Add/update concise notes in `docs/DECISIONS.md` documenting: why key ping moved to engine-level API validation, model catalog source metadata requirements, settings source-of-truth decisions, and why cost is session-scoped.
  - [ ] Acceptance: all targeted tests pass; no regressions in settings unlock/save flow, chat rendering, or header actions (`Settings`, `New Conversation`).
