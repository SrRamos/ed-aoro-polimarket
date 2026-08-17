# Tasks — Polymarket Widget

> Executable breakdown produced by `spec-harden`. Refs point to [`spec.md`](./spec.md) AC anchors and [`plan.md`](./plan.md) sections.
> Ordering is **dependency-based** (see §Execution order). Prefixes: `setup` · `model` · `util` · `svc` · `store` · `compose` · `ui` · `widget` · `test` · `security` · `deploy` · `docs`.
> Legend: ⚠ = requires `--allow-new-dep` approval (bonus/infra tooling, see plan §9).

---

## Group 0 — Foundations (parallel-safe)

- [ ] `setup: T001` — Wire `@ramoslabs/tokens/css` in `main.ts` + author `styles/base.css`: minimal reset, **self-hosted** subsetted WOFF2 Rubik/Red Hat Display via inline `@font-face` (no Google CDN) with `font-display:optional` (or `size-adjust`/`ascent-override`/`descent-override` tuned to `system-ui`) to kill swap CLS + a font-byte budget; `viewport-fit=cover` meta (no `maximum-scale`/`user-scalable=no`); `.sr-only`/`.focus-ring`/`.skip-link` (skip-link target = real `<main>`) (refs: NFR-DS-1, NFR-THEME-1, NFR-A11Y-1, NFR-A11Y-7, NFR-MF-1, T2, plan §4 P5)
- [ ] `setup: T002` — `src/config.ts`: read `import.meta.env.VITE_*` with safe defaults (`VITE_GAMMA_BASE_URL`, `VITE_BET_MODE=mock`, `VITE_AI_MODE=user-key`); typed config object; validate `VITE_BET_MODE ∈ {mock,real}` / `VITE_AI_MODE ∈ {user-key,proxy}` and reject `http://` base (HTTPS-only) (refs: AC9.3, AC9.5, AC9.6, NFR-ENV-1, plan §1)
- [ ] ⚠ `setup: T003` — Add ESLint (flat config) + `eslint-plugin-vue` (`vue/no-v-html` **error**) + `@vue/eslint-config-typescript` + Prettier; add `package.json` scripts `lint`, `format:check`, `test:unit` (refs: AC9.2, plan §5, plan §9-2, T2)
- [ ] `setup: T004` — `tsconfig`: `strict:true` + `noUncheckedIndexedAccess` + `noImplicitAny` (forces positional-alignment/short-array handling); commit `.env.example`; augment `ImportMetaEnv` in `vite-env.d.ts` (refs: NFR-ENV-1, T20, plan §1)
- [ ] `setup: T005` — `main.ts` `app.config.errorHandler` → `logEvent` (uncaught render/lifecycle/watcher capture) + `SJErrorBoundary` (`onErrorCaptured`) so one bad card/panel degrades, not white-screens (refs: NFR-ERR-1, T5)

## Group 1 — Models & HTTP (after Group 0; parallel-safe)

- [ ] `model: T101` — `models/market.ts`, `models/bet.ts`, `models/prediction.ts` type contracts (refs: AC1.*, AC5.1, AC7.*, plan §2)
- [ ] `svc: T102` — `services/http.ts` fetch wrapper: base URL, 10s timeout, `AbortController`, unified `AppError` union + `RequestState<T>` discriminated union; retry **only** `network`/`timeout`/`5xx` with backoff (never 4xx/429); model `429` + `Retry-After` distinctly (no auto-retry); **short-circuit when `navigator.onLine === false` — surface a distinct `offline` `AppError` kind instead of firing/retrying the request (no retry-storm)**; `Result<T,AppError>` (no throw across the seam) (refs: NFR-SVC-1, NFR-SVC-2, AC2.5, AC2.8, AC7.9, T11, C4, C17, plan §2 error-model)
- [ ] `setup: T103` — Vite dev proxy for Gamma as CORS contingency (no call-site change) (refs: NFR-SVC-2)
- [ ] `util: T104` — `utils/format.ts`: pinned-locale `Intl.NumberFormat`/`Intl.DateTimeFormat` for %, currency (volume/liquidity/cost/payout), and `endDate`; single source used by all rendering components (refs: NFR-INTL-1, T12)

## Group 2 — Services (after Group 1)

- [ ] `svc: T201` — `polymarket.service.ts` (refs: AC1.*, AC2.1, AC3.1, AC4.1, NFR-SVC-1)
  - [ ] `svc: T201.1` — `normalizeMarket(raw: unknown)`: schema-validate the **whole** payload (zod or disciplined hand-rolled) then `JSON.parse` outcomes/outcomePrices/clobTokenIds → positionally-aligned arrays, prices→number (refs: AC1.1, AC1.2, AC1.3, AC1.4, T8)
  - [ ] `svc: T201.2` — malformed guard: missing/wrong-type field, invalid-JSON, or unequal-length → return `null`, caller excludes; validate both response envelopes (`/markets` array, `/public-search {events,tags,profiles}`); never throw (refs: AC1.4, T8)
  - [ ] `svc: T201.3` — clamp price to `[0,1]`, set `pricingReliable=false`, never render `NaN` (refs: AC1.5)
  - [ ] `svc: T201.4` — `searchMarkets(q)` → `/public-search?limit=50` (bounded result cap, never unbounded); `getMarkets()` → `/markets?closed=false&active=true&order=volume&ascending=false&limit=20`; `getMarket(slug)`; all reads are public unauthenticated GETs (no API key/secret) (refs: AC2.1, AC3.1, AC4.1, NFR-SEC-3, C5)
- [ ] `svc: T202` — `betting.service.ts`: `interface BettingService` + `MockBettingService` (refs: AC5.1, NFR-SVC-3, D2)
  - [ ] `svc: T202.1` — validate size>0 & price; **reject when `price<=0` or `!Number.isFinite(price)`**; `cost=size×price`, `shares=size/price`, `payout=shares×$1`; assert `Number.isFinite` on cost/shares/payout before receipt/persist; `avgPrice = prices[i]` (closes D005) (refs: AC5.2, AC5.3, T3)
  - [ ] `svc: T202.2` — simulated delay → receipt `{status:'filled',avgPrice,shares,cost,txHash:'mock-0x…'}`; reject path for failures (refs: AC5.1, AC5.7)
  - [ ] `svc: T202.3` — factory selects impl by `VITE_BET_MODE` (only `mock` ships); when `real` is set but no CLOB adapter exists, **fail safe** — return a disabled betting state exposing a clear "real betting mode is not available" message; **never throw at startup / crash the widget** (refs: AC9.5, C10)
- [ ] `svc: T203` — `openrouter.service.ts` (refs: AC7.3–AC7.6, AC7.10, AC9.6)
  - [ ] `svc: T203.1` — `pickFreeModel(key)`: fetch `/models`, preference chain → `structured_outputs` free → `openrouter/free`; cache per session (refs: AC7.4, plan §4 P2)
  - [ ] `svc: T203.2` — `predict(market,key)`: system+user prompt, `temperature≤0.2`, `Authorization` header only, `HTTP-Referer`/`X-Title` (refs: AC7.3, NFR-SEC-2)
  - [ ] `svc: T203.3` — parse ladder: `json_schema` → `json_object` → fence-strip+first-`{…}`+retry@temp0 (refs: AC7.5)
  - [ ] `svc: T203.4` — validate: `recommendedOutcome ∈ labels`, clamp `confidence` `[0,1]`, cap `rationale`; invalid after retry → error (refs: AC7.6, AC7.10, T4)

## Group 3 — Stores (after Group 2)

- [ ] `store: T301` — `markets.store.ts`: list, search results, selected market/outcome (refs: AC2.*, AC3.*, AC4.3)
- [ ] `store: T302` — `bets.store.ts`: positions + `localStorage` persist with `schemaVersion`; **per-item** schema+type validation on read → drop only invalid item(s), keep the rest (no wipe-on-tamper); on write catch `QuotaExceededError`/storage-unavailable → non-blocking "couldn't save locally" notice (no receipt for an unpersisted bet); corrupt payload → distinct `role="status"` notice, NOT the first-run empty state; **cross-tab sync — a `window` `storage`-event listener reconciles positions from the updated `localStorage` payload (re-validating per-item per AC6.4) so tabs stay consistent without reload** (refs: AC6.1, AC6.4, AC6.5, T3, T13, C12)
- [ ] `store: T303` — `settings.store.ts`: OpenRouter key persist/clear in `localStorage`; toggles AI enablement; **cross-tab sync — `window` `storage`-event listener reconciles the AI key/settings across tabs without reload** (refs: AC8.1, AC8.2, AC6.5, C12)

## Group 4 — Composables (after Group 3)

- [ ] `compose: T401` — `useMarketSearch.ts`: ~300ms debounce, ≤1 in-flight (abort superseded), loading/empty/error/cleared states as `RequestState<T>`; announce **result count** on settle (polite); no-results recovery (echo+preserve query, clear affordance, top-by-volume fallback); empty input → browse list; **offline handling — `navigator.onLine` + `window` `online`/`offline` listeners: show a distinct offline state (not a generic network error), suppress the debounced request while offline (no retry-storm), and auto-resume the pending query on `online`** (refs: AC2.2, AC2.3, AC2.4, AC2.5, AC2.6, AC2.8, T11, T17, C17)
- [ ] `compose: T402` — `useAiPrediction.ts`: on-demand single call, loading/error/retry; distinguish `429` rate-limit (honor `Retry-After`, no auto-retry) from hard failure (refs: AC7.3, AC7.7, AC7.9, T11)

## Group 5 — UI primitives `SJ*` (after Group 0; parallel-safe)

- [ ] `ui: T501` — `SJButton`: press-first states `:active→:focus-visible→:hover` (hover gated), tonal `--state-*` overlays, `--shadow-focus`, `--radius-sm`, ≥24×24 (aim 44); indigo `--color-primary` as the only action accent; `SJ*` naming + DS Interactive pattern (refs: NFR-DS-3, NFR-DS-4, NFR-MF-2, NFR-DS-2, NFR-DS-7)
- [ ] `ui: T502` — `SJInput`: persistent visible `<label>`, native, `:user-invalid`/`:user-valid`, `font-size≥16px`, inline error (refs: NFR-DS-5, NFR-MF-3)
- [ ] `ui: T503` — `SJCard`: `--color-surface`, `--space-6`, `--radius-lg` (card role), `--shadow-sm` (elevation only) (refs: NFR-DS-8, NFR-DS-6)
- [ ] `ui: T504` — `SJBadge`: `--radius-pill` + semantic triad (`-surface`+`-border`+`-text`) + icon/text (refs: NFR-DS-8, NFR-A11Y-2)
- [ ] `ui: T505` — `SJModal`: `<Teleport to="body">`; `role="dialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby` + defined initial focus; `--radius-xl`, `--shadow-lg`, `--z-modal-backdrop/modal`, focus trap + Escape + focus-return; **mobile = full-screen/bottom sheet** with `env(safe-area-inset-*)` + internal `overflow-y:auto` + visible close + backdrop, centered dialog only at md+; motion ≤300ms transform/opacity only (refs: NFR-DS-8, AC4.4, AC4.7, NFR-A11Y-5, NFR-A11Y-4, NFR-DS-6, T14, T16, C2)
- [ ] `ui: T506` — `SJSpinner` + `SJSkeleton` from surface/border tokens, animate opacity/transform, `prefers-reduced-motion` (refs: AC3.3, NFR-A11Y-4)
- [ ] `ui: T507` — `SJLiveRegion`/toast: `role="status"`/`aria-live="polite"` + `role="alert"`, `--z-toast` (refs: NFR-A11Y-3)

## Group 6 — Widgets `W*` (after Groups 4 & 5)

- [ ] `widget: T601` — `WMarketSearch`: labelled input with **search semantics** (`type="search"` + `enterkeyhint="search"` + `autocomplete="off"`), debounce wired, live-region loading/result-count/empty/error (refs: AC2.1–AC2.7, T15)
- [ ] `widget: T602` — `WMarketList` + `WMarketCard`: question, each outcome + % (via `utils/format.ts`) with proportional bar animated by `transform: scaleX()` (reduced-motion gated), keyed `v-for` on `market.id`; **images reserve space** (`width/height` or `aspect-ratio`) + `loading="lazy"`/`decoding="async"` below fold (eager LCP image) + `preconnect` + broken-image fallback + skeleton mirrors card height; **multi-column card grid at md+**; **virtualization/"show more" threshold — beyond 50 rendered results, virtualize or paginate rather than mounting the full list** (search is capped at `limit=50` upstream, T201.4); explicit empty/error (refs: AC2.1, AC3.1–AC3.5, NFR-INTL-1, NFR-MF-5, T7, C1, C3, C5, C14, plan §4 P3)
- [ ] `widget: T603` — `WMarketDetail` (via `SJModal`, dialog semantics + mobile sheet): outcomes selectable via success/error triad **+ text/icon** for binary, **neutral chip (color+text, no forced success/error) when >2 outcomes**; price %/volume/liquidity via `utils/format.ts`; selection drives bet form; close→focus return; closed market → disable + text reason; **inline right pane at md/lg** (refs: AC4.1–AC4.7, NFR-A11Y-2, NFR-MF-5)
- [ ] `widget: T604` — `WBetForm`: outcome + amount field (`type="text"` + `inputmode="decimal"`, ≥16px), live cost/payout, **review-and-confirm step before placeBet**, **in-flight disable + `aria-busy`** (no double-submit), `aria-invalid`+`aria-describedby` inline error (`:user-invalid`), no-outcome guard, disabled-until-valid, sticky bottom CTA on mobile with `env(safe-area-inset-bottom)` (never obscuring focus) (refs: AC5.0.5, AC5.1, AC5.1a, AC5.4, AC5.5, AC5.8, NFR-MF-4, NFR-A11Y-6, T15)
- [ ] `widget: T605` — `WBetReceipt`: toast via live region + add position, no reload; do NOT surface a receipt for a bet that failed to persist (refs: AC5.6, AC6.1)
- [ ] `widget: T606` — `WPositions`: per-position content (question, outcome, size, price, cost, shares, payout) via `utils/format.ts`; first-run onboarding empty state with next-step CTA toward search; **table layout at md+**; corrupt-storage distinct recoverable notice (not first-run) (refs: AC6.2, AC6.3, AC6.4, NFR-MF-5, NFR-INTL-1, T17)
- [ ] `widget: T607` — `WAiPrediction`: opt-in gate; **visible-but-disabled** no-key affordance + CTA → Settings (never fully hidden); generic outcome framing for >2 outcomes; result = recommended outcome + `--color-primary` confidence bar (indigo action accent only) **+ numeric label** + rationale + "not financial advice"; error/retry incl. distinct 429 message (refs: AC4.6, AC7.1, AC7.2, AC7.8, AC7.9, NFR-A11Y-2, NFR-DS-2, T17)
- [ ] `widget: T608` — `WSettings`: labelled key field `type="password"` (≥16px) + show/hide toggle, allow paste/password-managers, `autocomplete/autocapitalize/autocorrect` off; save/clear; "stored locally (readable by page scripts), sent directly to OpenRouter; use a scoped, spend-capped, revocable key" disclaimer; **no bundled key** (refs: AC8.1–AC8.6, NFR-SEC-1, T15)
- [ ] `widget: T609` — `App.vue`: **responsive scale-up per NFR-MF-5** (base=0 stack → md/lg two-pane list+detail + table positions → xl/2xl capped `max-inline-size`), header + Settings entry; heading outline (`h1`+section `h2`) + landmarks (`header`/`main`/`search`/`region`) + skip-link → `<main>`; compose all `W*` widgets per UX map (SJ*/W* naming + DS patterns, reuse before creating) (refs: NFR-MF-1, NFR-MF-5, NFR-A11Y-6, NFR-A11Y-7, spec §7.3, NFR-DS-7, T6, T16)

## Group 7 — Tests & verification (after Group 6; parallel-safe)

- [ ] `test: T701` — unit: `normalizeMarket` parse/align/clamp/malformed-exclude + **whole-payload/envelope schema validation** (refs: AC1.*, NFR-TEST-1, T8)
- [ ] `test: T702` — unit: bet cost/shares/payout math + **finite guards** (`price<=0`/non-finite rejected, `avgPrice=prices[i]`) (refs: AC5.2, AC5.3, T3)
- [ ] `test: T703` — unit: position persistence + **per-item corrupt-storage recovery** (drop-invalid-keep-rest) + quota/unavailable handling (refs: AC6.*, T3, T13)
- [ ] `test: T704` — unit: AI parse-ladder + validation (outcome∈labels, clamp, invalid-after-retry) (refs: AC7.5, AC7.6, AC7.10)
- [ ] `test: T705` — E2E (Playwright): search → open detail → select outcome → **confirm** → place simulated bet → see position (refs: NFR-TEST-2)
- [ ] `test: T706` — a11y verification: contrast AA, full keyboard operability, live regions, `prefers-reduced-motion`, color-not-sole-signal, **focus-not-obscured (2.4.11)**, heading/landmarks/skip-link, landscape/200%-zoom/320px-reflow (refs: NFR-A11Y-1..7, C15)
- [ ] `test: T707` — performance verification + **`size-limit` CI gate** (JS/CSS/font/image/total budgets, fail on exceed) + CWV (Lighthouse-CI or web-vitals RUM: LCP/INP/CLS); asset caching `_headers` (refs: plan §4, T7, T10)
- [ ] `test: T712` — unit: `utils/format.ts` Intl formatters (deterministic %, currency, dates) (refs: NFR-INTL-1, T12)
- [ ] `security: T708` — security verification: no `v-html` on external data, CSP + companion headers present **and page boots**, key only in `Authorization`, no key in URL/logs (refs: plan §3, NFR-SEC-4, T1, T2)
- [ ] `security: T710` — **core-gated** HTTP security headers (`dist/_headers` or nonce Worker): full corrected CSP (`object-src/base-uri/form-action/frame-src 'none'`, explicit `script-src`, `style-src 'self' 'unsafe-inline'`, narrowed `img-src`, `connect-src` allowlist, `font-src 'self'`, `upgrade-insecure-requests`, `report-to`) + `Referrer-Policy`/nosniff/`Permissions-Policy`/HSTS; verifier asserts present **and** boots (refs: NFR-SEC-4, T1, C20)
- [ ] ⚠ `test: T711` — **component/integration tier** (`@vue/test-utils`/Testing Library) for loading/empty/error/focus/disabled/no-key-CTA state ACs; **MSW** mocks Gamma/OpenRouter (no live network); `vitest --coverage` threshold; **axe** (vitest-axe/Playwright-axe) automated a11y assertions (refs: NFR-TEST-3, T18)
- [ ] `test: T709` — manual QA pass per user story US1–US9 (refs: spec §2, all AC)

## Group 8 — Deploy / Ops (bonus; after Group 7 green — non-blocking for core)

- [ ] ⚠ `deploy: T801` — `wrangler.jsonc` Phase-1 SPA (`assets.directory=./dist`, `not_found_handling:"single-page-application"`, `observability.enabled`, `vars.VITE_BET_MODE=mock`); add `wrangler` dev dep (refs: AC9.1, D10, deploy doc §2)
- [ ] `deploy: T802` — `.github/workflows/deploy.yml`: on push to `main` → full gate (lint + format:check + unit + component + E2E + `npm audit --audit-level=high`) → build → `wrangler deploy`; **`npm ci`** (committed lockfile); **SHA-pinned** actions; least-privilege `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID` (refs: AC9.1, AC9.2, T9, T19, deploy doc §5)
- [ ] `security: T803` — env split enforcement: no secret in `VITE_*`/`vars`; post-build grep scan of `dist/` for key patterns (refs: AC9.4, NFR-SEC-1)
- [ ] `deploy: T804` — deploy-side header wiring for the **core** `dist/_headers` (T710): `report-to`/CSP-report endpoint + edge HSTS; assert same CSP served in production (refs: plan §3, NFR-SEC-4, T1, T6)
- [ ] `security: T806` — supply-chain merge gate: **Dependabot required**; blocking `npm audit --audit-level=high` (or osv-scanner); **branch protection on `main`** with the full gate as a **required PR status check** (merge gate, not just deploy); SHA-pin all Actions (refs: AC9.2, T19, plan §5)
- [ ] `deploy: T805` — verify core runs with **no** deploy configured (local dev, `mock` + user key) (refs: AC9.8)

## Group 9 — Documentation (last)

- [ ] `docs: T901` — README: setup, env vars, `npm run dev`, the full gate (refs: AC9.8, plan §5)
- [ ] `docs: T902` — Runbook: deploy + `wrangler rollback`/`versions`, observability fields/alerts (refs: AC9.7, plan §6, plan §8)
- [ ] `docs: T903` — Document env switches / feature flags (`bet.mode`, `ai.mode`) (refs: AC9.3, plan §8)

---

## Execution order (topological)

```
Group 0  (parallel):  setup:T001  setup:T002  ⚠setup:T003  setup:T004  setup:T005
Group 1  (after 0):   model:T101  svc:T102  setup:T103  util:T104
Group 2  (after 1):   svc:T201(.1–.4)  svc:T202(.1–.3)  svc:T203(.1–.4)   [3 services parallel]
Group 3  (after 2):   store:T301  store:T302  store:T303                  [parallel]
Group 4  (after 3):   compose:T401  compose:T402                          [parallel]
Group 5  (after 0):   ui:T501..T507   [parallel; can overlap Groups 1–4]
Group 6  (after 4&5): widget:T601..T609  (T609 App.vue last within group)
Group 7  (after 6):   test/security T701..T712 (incl. core-gated security:T710, ⚠test:T711)  [parallel]
Group 8  (after 7):   ⚠deploy:T801  deploy:T802  security:T803  deploy:T804  security:T806  deploy:T805
Group 9  (after 8):   docs:T901  docs:T902  docs:T903
```

**Parallel-safe groups:** Group 0, Group 5 (with 1–4), Group 2 (3 services), Group 3, Group 4, Group 7, Group 9.
**Critical path:** T001/T002 → T101/T102/T104 → T201 → T301 → T401 → T601–T609 → T701–T712.
**Core blocking (not bonus):** `security:T710` (HTTP security headers) is a **core** Group-7 gate per NFR-SEC-4 — the widget is not shippable without it.

## Coverage check

**TRUE — every AC and every NFR is referenced by ≥1 task.** ACs AC1.1–AC9.8 including the added AC2.7, AC2.8 (offline, C17 → T102/T401), AC4.6, AC4.7, AC5.0.5, AC5.1a, AC5.8, AC6.5 (cross-tab sync, C12 → T302/T303), AC8.6 (and the extended AC1.4/2.1[C5]/2.3/2.4/5.3/5.4/6.1/6.4/7.2/7.9/8.3/9.2/9.5[C10, fail-safe real]) each have an owning task. NFR families and their owning task(s):
- **DS-1..8** → T001, T501–T507, T602/T603/T607. **THEME-1** → T001.
- **MF-1** → T001/T609; **MF-2** → T501; **MF-3** → T502; **MF-4** → T604; **MF-5** (new) → T602/T603/T606/T609.
- **A11Y-1..5** → T501–T507, T706; **A11Y-6** (new) → T604/T609/T706; **A11Y-7** (new) → T001/T609/T706.
- **SEC-1..3** → T607/T608/T803/T201.4; **SEC-4** (new) → T710/T708/T804.
- **SVC-1..3** → T102/T103/T201/T202; **ERR-1** (new) → T005; **INTL-1** (new) → T104/T602/T606/T712; **ENV-1** (new) → T002/T004.
- **TEST-1..2** → T701–T705, T712; **TEST-3** (new) → T711.

QA (`test:`), security (`security:`), and docs (`docs:`) tasks exist per user story. `security:T710` (HTTP security headers, NFR-SEC-4) is **core/blocking** in Group 7. Groups 8–9 (deploy/AI-proxy/real-betting infra) remain bonus scope and do not gate Groups 0–7 (core deliverable).

**Task count:** 54 top-level tasks (was 47) + 11 subtasks = **65 task line items** (was 58). New tasks added by the prior remediation: `setup:T004`, `setup:T005`, `util:T104`, `test:T712`, `security:T710`, `test:T711`, `security:T806`. The low-severity closeout (C5/C10/C12/C17) added **no new tasks** — it extended existing tasks (T201.4, T602, T202.3, T102, T401, T302, T303), so the count is unchanged. AC count: **64** (added AC2.8, AC6.5; was 62).
