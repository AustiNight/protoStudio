# Constraint Fix Set Pre-Merge Checklist

Use this checklist for chat/settings/cost/model guardrail work.

- [ ] Run `node scripts/guardrails-lint.js` and confirm it passes.
- [ ] Run targeted tests:
  `npx vitest run tests/unit/config/model-pricing-schema.test.ts tests/unit/persistence/telemetry-log.test.ts tests/unit/store/telemetry-store.test.ts`
- [ ] Confirm no plaintext settings-key persistence path exists outside the store flow:
  `rg -n "studio\\.settings\\.v1|settings-storage|localStorage" src/components src/app src/store src/persistence`
- [ ] Confirm no `console.log` usage exists in runtime source:
  `rg -n "\\bconsole\\.log\\s*\\(" src`
- [ ] Confirm no React imports exist in `src/engine/**`:
  `rg -n "from ['\\\"]react['\\\"]|from ['\\\"]react-dom['\\\"]|import React\\b" src/engine`
- [ ] Confirm changed files are limited to intended chat/settings/cost/model scope:
  `git diff --name-only ${CHANGE_CONTROL_BASE:-HEAD~1}..${CHANGE_CONTROL_HEAD:-HEAD}`
