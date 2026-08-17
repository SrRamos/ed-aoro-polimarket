# Tasks — Polymarket Widget

> Executable breakdown produced by `spec-harden`. Refs point to [`spec.md`](./spec.md) AC anchors and [`plan.md`](./plan.md) sections.
> Ordering is **dependency-based** (see §Execution order). Prefixes: `setup` · `model` · `svc` · `store` · `compose` · `ui` · `widget` · `test` · `security` · `deploy` · `docs`.
> Legend: ⚠ = requires `--allow-new-dep` approval (bonus/infra tooling, see plan §9).

---

## Group 0 — Foundations (parallel-safe)

- [ ] `setup: T001` — Wire `@ramoslabs/tokens/css` in `main.ts` + author `styles/base.css`: minimal reset, `font-display:swap` + `preconnect` for Rubik/Red Hat Display (fallback `system-ui`), `.sr-only`/`.focus-ring`/`.skip-link` (refs: NFR-DS-1, NFR-THEME-1, NFR-A11Y-1, plan §4 P5)
- [ ] `setup: T002` — `src/config.ts`: read `import.meta.env.VITE_*` with safe defaults (`VITE_GAMMA_BASE_URL`, `VITE_BET_MODE=mock`, `VITE_AI_MODE=user-key`); typed config object (refs: AC9.3, AC9.5, AC9.6, plan §1)
- [ ] ⚠ `setup: T003` — Add ESLint (flat config) + `eslint-plugin-vue` (`vue/no-v-html` **error**) + `@vue/eslint-config-typescript` + Prettier; add `package.json` scripts `lint`, `format:check`, `test:unit` (refs: AC9.2, plan §5, plan §9-2, T2)

## Group 1 — Models & HTTP (after Group 0; parallel-safe)

- [ ] `model: T101` — `models/market.ts`, `models/bet.ts`, `models/prediction.ts` type contracts (refs: AC1.*, AC5.1, AC7.*, plan §2)
- [ ] `svc: T102` — `services/http.ts` fetch wrapper: base URL, 10s timeout, retry×1, `AbortController`, normalized error `{kind,status,message}` (refs: NFR-SVC-1, NFR-SVC-2, AC2.5, plan §2 error-model)
- [ ] `setup: T103` — Vite dev proxy for Gamma as CORS contingency (no call-site change) (refs: NFR-SVC-2)

## Group 2 — Services (after Group 1)

- [ ] `svc: T201` — `polymarket.service.ts` (refs: AC1.*, AC2.1, AC3.1, AC4.1, NFR-SVC-1)
  - [ ] `svc: T201.1` — `normalizeMarket(raw)`: `JSON.parse` outcomes/outcomePrices/clobTokenIds → positionally-aligned arrays, prices→number (refs: AC1.1, AC1.2, AC1.3)
  - [ ] `svc: T201.2` — malformed guard: missing/invalid-JSON/unequal-length → return `null`, caller excludes; never throw (refs: AC1.4)
  - [ ] `svc: T201.3` — clamp price to `[0,1]`, set `pricingReliable=false`, never render `NaN` (refs: AC1.5)
  - [ ] `svc: T201.4` — `searchMarkets(q)` → `/public-search`; `getMarkets()` → `/markets?closed=false&active=true&order=volume&ascending=false&limit=20`; `getMarket(slug)` (refs: AC2.1, AC3.1, AC4.1)
- [ ] `svc: T202` — `betting.service.ts`: `interface BettingService` + `MockBettingService` (refs: AC5.1, NFR-SVC-3, D2)
  - [ ] `svc: T202.1` — validate size>0 & price; `cost=size×price`, `shares=size/price`, `payout=shares×$1` (refs: AC5.2, AC5.3)
  - [ ] `svc: T202.2` — simulated delay → receipt `{status:'filled',avgPrice,shares,cost,txHash:'mock-0x…'}`; reject path for failures (refs: AC5.1, AC5.7)
  - [ ] `svc: T202.3` — factory selects impl by `VITE_BET_MODE` (only `mock` ships; `real` throws not-implemented) (refs: AC9.5)
- [ ] `svc: T203` — `openrouter.service.ts` (refs: AC7.3–AC7.6, AC7.10, AC9.6)
  - [ ] `svc: T203.1` — `pickFreeModel(key)`: fetch `/models`, preference chain → `structured_outputs` free → `openrouter/free`; cache per session (refs: AC7.4, plan §4 P2)
  - [ ] `svc: T203.2` — `predict(market,key)`: system+user prompt, `temperature≤0.2`, `Authorization` header only, `HTTP-Referer`/`X-Title` (refs: AC7.3, NFR-SEC-2)
  - [ ] `svc: T203.3` — parse ladder: `json_schema` → `json_object` → fence-strip+first-`{…}`+retry@temp0 (refs: AC7.5)
  - [ ] `svc: T203.4` — validate: `recommendedOutcome ∈ labels`, clamp `confidence` `[0,1]`, cap `rationale`; invalid after retry → error (refs: AC7.6, AC7.10, T4)

## Group 3 — Stores (after Group 2)

- [ ] `store: T301` — `markets.store.ts`: list, search results, selected market/outcome (refs: AC2.*, AC3.*, AC4.3)
- [ ] `store: T302` — `bets.store.ts`: positions + `localStorage` persist with `schemaVersion`; restore on load; corrupt/missing → recover to empty (refs: AC6.1, AC6.4, T3)
- [ ] `store: T303` — `settings.store.ts`: OpenRouter key persist/clear in `localStorage`; toggles AI enablement (refs: AC8.1, AC8.2)

## Group 4 — Composables (after Group 3)

- [ ] `compose: T401` — `useMarketSearch.ts`: ~300ms debounce, ≤1 in-flight (abort superseded), loading/empty/error/cleared states; empty input → browse list (refs: AC2.2, AC2.3, AC2.4, AC2.5, AC2.6)
- [ ] `compose: T402` — `useAiPrediction.ts`: on-demand single call, loading/error/retry (refs: AC7.3, AC7.7, AC7.9)

## Group 5 — UI primitives `SJ*` (after Group 0; parallel-safe)

- [ ] `ui: T501` — `SJButton`: press-first states `:active→:focus-visible→:hover` (hover gated), tonal `--state-*` overlays, `--shadow-focus`, `--radius-sm`, ≥24×24 (aim 44) (refs: NFR-DS-3, NFR-DS-4, NFR-MF-2)
- [ ] `ui: T502` — `SJInput`: persistent visible `<label>`, native, `:user-invalid`/`:user-valid`, `font-size≥16px`, inline error (refs: NFR-DS-5, NFR-MF-3)
- [ ] `ui: T503` — `SJCard`: `--color-surface`, `--space-6`, `--radius-lg`, `--shadow-sm` (refs: NFR-DS-8)
- [ ] `ui: T504` — `SJBadge`: `--radius-pill` + semantic triad (`-surface`+`-border`+`-text`) + icon/text (refs: NFR-DS-8, NFR-A11Y-2)
- [ ] `ui: T505` — `SJModal`: `--radius-xl`, `--shadow-lg`, `--z-modal-backdrop/modal`, focus trap + Escape + focus-return, motion ≤300ms transform/opacity (refs: NFR-DS-8, AC4.4, NFR-A11Y-5, NFR-A11Y-4)
- [ ] `ui: T506` — `SJSpinner` + `SJSkeleton` from surface/border tokens, animate opacity/transform, `prefers-reduced-motion` (refs: AC3.3, NFR-A11Y-4)
- [ ] `ui: T507` — `SJLiveRegion`/toast: `role="status"`/`aria-live="polite"` + `role="alert"`, `--z-toast` (refs: NFR-A11Y-3)

## Group 6 — Widgets `W*` (after Groups 4 & 5)

- [ ] `widget: T601` — `WMarketSearch`: labelled input, debounce wired, live-region loading/empty/error (refs: AC2.1–AC2.6)
- [ ] `widget: T602` — `WMarketList` + `WMarketCard`: question, each outcome + % with proportional bar, volume/liquidity; skeleton while loading; explicit empty/error (refs: AC3.1–AC3.5)
- [ ] `widget: T603` — `WMarketDetail` (modal): outcomes selectable via success/error triad **+ text/icon**, price %, volume/liquidity; selection drives bet form; close→focus return; closed market → disable + text reason (refs: AC4.1–AC4.5, NFR-A11Y-2)
- [ ] `widget: T604` — `WBetForm`: outcome + numeric amount (≥16px), live cost/payout, `:user-invalid` inline error, no-outcome guard, disabled-until-valid, sticky bottom CTA on mobile (refs: AC5.1–AC5.5, NFR-MF-4)
- [ ] `widget: T605` — `WBetReceipt`: toast via live region + add position, no reload (refs: AC5.6)
- [ ] `widget: T606` — `WPositions`: per-position content (question, outcome, size, price, cost, shares, payout); first-run onboarding empty state (refs: AC6.2, AC6.3)
- [ ] `widget: T607` — `WAiPrediction`: opt-in gate; no-key CTA → Settings; result = recommended outcome + `--color-primary` confidence bar **+ numeric label** + rationale + "not financial advice"; error/retry (refs: AC7.1, AC7.2, AC7.8, AC7.9, NFR-A11Y-2)
- [ ] `widget: T608` — `WSettings`: labelled key field (≥16px), save/clear, "stored locally, sent directly to OpenRouter" disclaimer, **no bundled key** (refs: AC8.1–AC8.5, NFR-SEC-1)
- [ ] `widget: T609` — `App.vue`: vertical mobile-first layout (base=0 + 5 `min-width` breakpoints), header + Settings entry, compose all widgets per UX map (refs: NFR-MF-1, spec §7.3)

## Group 7 — Tests & verification (after Group 6; parallel-safe)

- [ ] `test: T701` — unit: `normalizeMarket` parse/align/clamp/malformed-exclude (refs: AC1.*, NFR-TEST-1)
- [ ] `test: T702` — unit: bet cost/shares/payout math (refs: AC5.2, AC5.3)
- [ ] `test: T703` — unit: position persistence + corrupt-storage recovery (refs: AC6.*, T3)
- [ ] `test: T704` — unit: AI parse-ladder + validation (outcome∈labels, clamp, invalid-after-retry) (refs: AC7.5, AC7.6, AC7.10)
- [ ] `test: T705` — E2E (Playwright): search → open detail → select outcome → place simulated bet → see position (refs: NFR-TEST-2)
- [ ] `test: T706` — a11y verification: contrast AA, full keyboard operability, live regions, `prefers-reduced-motion`, color-not-sole-signal (refs: NFR-A11Y-1..5)
- [ ] `test: T707` — performance verification vs plan §4 budgets (bundle ≤150KB gz, LCP ≤2.5s, debounce, timeouts) (refs: plan §4)
- [ ] `security: T708` — security verification: no `v-html` on external data, CSP present, key only in `Authorization`, no key in URL/logs (refs: plan §3, T1, T2)
- [ ] `test: T709` — manual QA pass per user story US1–US9 (refs: spec §2, all AC)

## Group 8 — Deploy / Ops (bonus; after Group 7 green — non-blocking for core)

- [ ] ⚠ `deploy: T801` — `wrangler.jsonc` Phase-1 SPA (`assets.directory=./dist`, `not_found_handling:"single-page-application"`, `observability.enabled`, `vars.VITE_BET_MODE=mock`); add `wrangler` dev dep (refs: AC9.1, D10, deploy doc §2)
- [ ] `deploy: T802` — `.github/workflows/deploy.yml`: on push to `main` → full gate (lint + format:check + unit + E2E) → build → `wrangler deploy`; least-privilege `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID` (refs: AC9.1, AC9.2, T9, deploy doc §5)
- [ ] `security: T803` — env split enforcement: no secret in `VITE_*`/`vars`; post-build grep scan of `dist/` for key patterns (refs: AC9.4, NFR-SEC-1, T5)
- [ ] `deploy: T804` — CSP + `frame-ancestors 'none'` / `X-Frame-Options` response headers (refs: plan §3, T2, T6)
- [ ] `deploy: T805` — verify core runs with **no** deploy configured (local dev, `mock` + user key) (refs: AC9.8)

## Group 9 — Documentation (last)

- [ ] `docs: T901` — README: setup, env vars, `npm run dev`, the full gate (refs: AC9.8, plan §5)
- [ ] `docs: T902` — Runbook: deploy + `wrangler rollback`/`versions`, observability fields/alerts (refs: AC9.7, plan §6, plan §8)
- [ ] `docs: T903` — Document env switches / feature flags (`bet.mode`, `ai.mode`) (refs: AC9.3, plan §8)

---

## Execution order (topological)

```
Group 0  (parallel):  setup:T001  setup:T002  ⚠setup:T003
Group 1  (after 0):   model:T101  svc:T102  setup:T103
Group 2  (after 1):   svc:T201(.1–.4)  svc:T202(.1–.3)  svc:T203(.1–.4)   [3 services parallel]
Group 3  (after 2):   store:T301  store:T302  store:T303                  [parallel]
Group 4  (after 3):   compose:T401  compose:T402                          [parallel]
Group 5  (after 0):   ui:T501..T507   [parallel; can overlap Groups 1–4]
Group 6  (after 4&5): widget:T601..T609  (T609 App.vue last within group)
Group 7  (after 6):   test/security T701..T709                            [parallel]
Group 8  (after 7):   ⚠deploy:T801  deploy:T802  security:T803  deploy:T804  deploy:T805
Group 9  (after 8):   docs:T901  docs:T902  docs:T903
```

**Parallel-safe groups:** Group 0, Group 5 (with 1–4), Group 2 (3 services), Group 3, Group 4, Group 7, Group 9.
**Critical path:** T001/T002 → T101/T102 → T201 → T301 → T401 → T601–T609 → T701–T709.

## Coverage check

Every AC (AC1.1–AC9.8) and every NFR (DS/MF/A11Y/THEME/SEC/SVC/TEST) is referenced by ≥1 task above. QA (`test:`), security (`security:`), and docs (`docs:`) tasks exist per user story. Groups 8–9 (deploy/AI-proxy/real-betting infra) are bonus scope and do not gate Groups 0–7 (core deliverable).
