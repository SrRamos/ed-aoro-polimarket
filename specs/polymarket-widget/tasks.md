# Tasks — Polymarket Widget

> Atomic task plan derived from `design.md`, anchored to `spec.md` ACs/NFRs. Topological order with explicit parallel groups. Every task carries `(refs: …)`; every AC/NFR is referenced by ≥1 task (cross-check in §9).
> Prefixes: `setup:` `svc:` `store:` `ui:` `widget:` `test:` `docs:` `security:`.
> `[STRETCH]` = US10 opt-in real-order path — optional, sequenced last, never required for the core demo.

---

## Group 0 — Setup & shared foundations (parallel, no cross-deps)

These five tasks touch disjoint files and can run in parallel worktrees.

| Task        | Description                                                                                                                                                                                                                              | Refs                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **SETUP-1** | Create `config/builder.config.ts`: `getBuilderConfig(overrides?)` resolving settings-override → `VITE_BUILDER_CODE` env → placeholder default; also exports default `builderTakerBps`/`builderMakerBps`/`platformBps` (env-overridable). | AC5.9, NFR-SEC-4             |
| **SETUP-2** | Create `config/features.config.ts`: `isRealOrderPathEnabled()` reading `VITE_ENABLE_REAL_ORDERS === '1'`, default `false`.                                                                                                               | AC10.2                       |
| **SETUP-3** | Add `.env.example` documenting `VITE_BUILDER_CODE`, `VITE_GAMMA_BASE_URL`, `VITE_ENABLE_REAL_ORDERS` — all commented/placeholder, none required for core demo.                                                                           | NFR-SEC-3, NFR-SEC-4, AC10.2 |
| **SETUP-4** | Add Vite dev proxy fallback: `server.proxy` entry in `vite.config.ts` for the Gamma base path, gated so it's opt-in via `VITE_GAMMA_BASE_URL` pointing at the proxy path — zero change to service call sites.                            | NFR-SVC-2                    |
| **SETUP-5** | Create `stores/persist.ts`: `readJson<T>(key, fallback)` / `writeJson(key, value)` — try/catch around `JSON.parse`/`localStorage`, recovers to `fallback` on missing key or parse failure without throwing.                              | AC6.4, AC8.1, AC8.2          |

---

## Group 1 — Models & core services (parallel streams after Group 0)

Two independent streams: **models** (pure types/parsing, no config dep) and **http** can start immediately; `polymarket.service` and `betting.service` depend on their respective model + config tasks; `openrouter.service` depends on its model + `http.ts`. Safe as 2 parallel worktrees: **Stream A (market data)** and **Stream B (betting + AI)**.

### Stream A — market data

| Task      | Description                                                                                                                                                                                                                                                                              | Refs                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **SVC-1** | Create `models/market.ts`: `RawGammaMarket`, `Market` interfaces exactly as in `design.md` §2.2.                                                                                                                                                                                         | AC1.1–AC1.3                       |
| **SVC-2** | Create `services/http.ts`: `fetchJson<T>()` (AbortController timeout, JSON parse, normalized `HttpError`), `buildQuery()`. No retry beyond a configurable single-attempt default.                                                                                                        | NFR-SVC-1                         |
| **SVC-3** | Implement `normalizeMarket(raw)` in `services/polymarket.service.ts`: `JSON.parse` outcomes/outcomePrices/clobTokenIds, align positionally, coerce prices to numbers, clamp to `[0,1]` + set `pricingUnreliable`, return `null` on missing/non-JSON/unequal-length fields (never throw). | AC1.1, AC1.2, AC1.3, AC1.4, AC1.5 |
| **SVC-4** | Implement `searchMarkets(query, opts)`: `GET /public-search`, flatten `events[].markets[]` through `normalizeMarket`, filter nulls.                                                                                                                                                      | AC2.1                             |
| **SVC-5** | Implement `getMarkets(filters, opts)`: `GET /markets?closed=false&active=true&order=volume&ascending=false`, filter nulls.                                                                                                                                                               | AC3.1                             |
| **SVC-6** | Implement `getMarket(idOrSlug, opts)`: `GET /markets/slug/{slug}` (fallback `/markets/{id}` for numeric ids), `normalizeMarket`.                                                                                                                                                         | AC4.1                             |

### Stream B — betting + AI

| Task       | Description                                                                                                                                                                                                                                                                                                                             | Refs                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **SVC-7**  | Create `models/bet.ts`: `BetOrder`, `FeeBreakdown`, `BetReceipt`, `Position`, `BuilderConfig` exactly as in `design.md` §2.4.                                                                                                                                                                                                           | AC5.1, AC5.8, AC5.9, AC6.2                      |
| **SVC-8**  | Implement `computeFees(notional, cfg, side)` in `services/betting.service.ts`: additive `builderFee`/`platformFee` = `notional × bps / 10000`, `total = notional + builderFee + platformFee`; zero `platformBps` never suppresses a configured `builderBps`.                                                                            | AC5.8                                           |
| **SVC-9**  | Implement `MockBettingService.placeBet(order)`: validate `size > 0`/finite and a resolvable outcome (reject, don't throw, on failure — AC5.4/AC5.5), compute `cost = size×price`, `shares = size/price`, call `computeFees`, simulate delay, return `BetReceipt` with `builderCode` from `getBuilderConfig()` and `txHash: 'mock-0x…'`. | AC5.1, AC5.2, AC5.3, AC5.4, AC5.5, AC5.7, AC5.9 |
| **SVC-10** | Create `models/prediction.ts`: `OpenRouterModel`, `AiPrediction`, `AiMarketPick`.                                                                                                                                                                                                                                                       | AC7.6, AC9.3                                    |
| **SVC-11** | Implement `pickFreeModel(apiKey)` in `services/openrouter.service.ts`: `GET /api/v1/models`, filter `:free`, walk the preference chain, fallback to `structured_outputs`-advertising free model, then `openrouter/free`.                                                                                                                | AC7.4                                           |
| **SVC-12** | Implement the shared parse/validation ladder as an internal helper (`json_schema` → `json_object` → fence-strip/first-`{}` + retry at `temperature:0`), used by both `predictOutcome` and `recommendMarket`.                                                                                                                            | AC7.5, AC9.2 (ladder reuse)                     |
| **SVC-13** | Implement `predictOutcome(market, apiKey)`: builds the system/user prompt from `design`'s research prompt template, applies the ladder, validates `recommendedOutcome ∈ market.outcomes`, clamps `confidence`, caps `rationale` length; rejects (never fabricates) if invalid after retry.                                              | AC7.6, AC7.9, AC7.10                            |
| **SVC-14** | Implement `recommendMarket(markets, apiKey)`: same ladder, validates `recommendedMarketId ∈ markets.map(m=>m.id)`, clamps `confidence`, caps `rationale`; rejects if invalid after retry.                                                                                                                                               | AC9.3, AC9.6                                    |

---

## Group 2 — Stretch: real order path service `[STRETCH — optional, US10]`

Depends on SVC-7, SVC-8, SETUP-1, SETUP-2. Isolated in its own worktree — touches only `services/betting.service.ts` (additive section) and no other module in Group 1/3, so it never blocks the core path.

| Task                   | Description                                                                                                                                                                                                                                                                                                                                                                       | Refs                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **SVC-15** `[STRETCH]` | Add `ClobSigner` interface + `ClobBettingService` class (constructor-injected signer + `BuilderConfig`) implementing the same `BettingService.placeBet` signature; signs L1 `ClobAuth`, derives L2, builds V2 Order struct with `builder = builderConfig.builderCode`, signs Order, `POST /order`. Reuses `computeFees` from SVC-8, surfaced **before** requesting the signature. | AC10.1, AC10.3, AC10.5 |
| **SVC-16** `[STRETCH]` | Add `createBettingService(builderConfig)` single wiring function: returns `ClobBettingService` only when `isRealOrderPathEnabled()`, else `MockBettingService`. Wire `App.vue`/store injection through this function exclusively.                                                                                                                                                 | AC10.2, NFR-SVC-3      |
| **docs-1** `[STRETCH]` | Document in-code (JSDoc on `ClobBettingService`) and in a short README section: geoblock (33 countries), funded-wallet requirement, possible Verified tier, VPN/geoblock-bypass explicitly out of scope.                                                                                                                                                                          | AC10.4, NFR-SEC-5      |

---

## Group 3 — Stores (parallel after Group 1; depends on Stream A + Stream B services)

| Task        | Description                                                                                                                                                                                                                                                                                                                   | Refs                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **STORE-1** | Create `stores/markets.store.ts`: `query`, `results`, `defaultList`, `selectedMarketId`, `selectedOutcomeIndex`, `searchStatus`/`browseStatus` (4-state), error strings; actions `search`, `loadDefaultList`, `selectMarket`, `selectOutcome`. Not persisted.                                                                 | AC2.1, AC2.3, AC2.4, AC2.6, AC3.1, AC3.3, AC3.5, AC4.3 |
| **STORE-2** | Create `stores/bets.store.ts`: `positions[]` hydrated via `stores/persist.ts` (`polymarket-widget:positions:v1`), `placeStatus`/`placeError`; `placeBet(order)` delegates to injected `BettingService` (via `createBettingService`), appends `Position` only on `status:'filled'`, leaves `positions` untouched on rejection. | AC5.1, AC5.6, AC5.7, AC6.1, AC6.2, AC6.4               |
| **STORE-3** | Create `stores/settings.store.ts`: `openRouterApiKey`, `builderCodeOverride`, persisted via `stores/persist.ts` (`polymarket-widget:settings:v1`); actions `saveApiKey`, `clearApiKey`. Never logs the key.                                                                                                                   | AC8.1, AC8.2, NFR-SEC-1                                |

---

## Group 4 — UI primitives `ui:` (fully parallel — no store/service deps)

Pure presentational Vue components + scoped CSS from tokens only. All 8 can run in parallel worktrees; group as one stream if a single agent, or split 2–3 per sub-agent.

| Task     | Description                                                                                                                                                                                                                                        | Refs                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **UI-1** | `SJButton.vue`: variants primary/secondary/ghost; `:active`→`:focus-visible`→`:hover` (hover gated `@media (hover:hover) and (pointer:fine)`); `--shadow-focus` on focus-visible; `--radius-sm`; ≥24×24 (aim 44×44); disabled/inert state styling. | NFR-DS-3, NFR-DS-4, NFR-DS-6, NFR-MF-2  |
| **UI-2** | `SJInput.vue`: persistent `<label>`, help text slot, inline error slot styled via `:user-invalid`/`:user-valid`; `font-size: var(--font-size-base)` floor; `inputmode`/`autocomplete` passthrough props.                                           | NFR-DS-5, NFR-MF-3, AC5.4, AC8.5        |
| **UI-3** | `SJCard.vue`: `--color-surface`, `--space-6` padding, `--radius-lg`, `--shadow-sm`.                                                                                                                                                                | NFR-DS-8                                |
| **UI-4** | `SJBadge.vue`: semantic-triad variants (success/error/warning/info/neutral) with `--radius-pill`, icon+text slot (never color-only).                                                                                                               | NFR-DS-8, NFR-A11Y-2                    |
| **UI-5** | `SJModal.vue`: `--radius-xl`, `--shadow-lg`, `--z-modal-backdrop:500`/`--z-modal:600`, focus trap, Escape-to-close, focus-return to invoking control, motion ≤300ms gated by `prefers-reduced-motion`.                                             | NFR-DS-8, NFR-A11Y-4, NFR-A11Y-5, AC4.4 |
| **UI-6** | `SJSpinner.vue`: `role="status"`, reduced-motion-aware.                                                                                                                                                                                            | NFR-A11Y-3, NFR-A11Y-4                  |
| **UI-7** | `SJSkeleton.vue`: `--color-surface`/`--color-border` shimmer built from opacity/transform only, reduced-motion gated.                                                                                                                              | NFR-DS-6, NFR-A11Y-4, AC3.3             |
| **UI-8** | `SJLiveRegion.vue`: `polite`/`assertive` prop toggling `role="status" aria-live="polite"` vs `role="alert"`.                                                                                                                                       | NFR-A11Y-3                              |

---

## Group 5 — App widgets `widget:` (parallel sub-streams after Group 3 + Group 4)

Depends on: UI-1..8 (primitives) and the relevant store(s). Sub-streams below have no file overlap and can run in separate worktrees.

### Sub-stream 5a — Search & browse

| Task         | Description                                                                                                                                                                                                                  | Refs                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **WIDGET-1** | `composables/useMarketSearch.ts`: debounce ≈300ms, `AbortController` cancel-on-supersede, drives `markets.store.search`.                                                                                                     | AC2.2                                    |
| **WIDGET-2** | `WMarketSearch.vue`: `SJInput` + `SJLiveRegion` (polite while loading, alert on error); wires `useMarketSearch`.                                                                                                             | AC2.1, AC2.3, AC2.5                      |
| **WIDGET-3** | `WMarketCard.vue`: question, per-outcome `%` + proportional bar, volume/liquidity, `SJBadge` for outcome/status.                                                                                                             | AC3.2, AC4.2                             |
| **WIDGET-4** | `WMarketList.vue`: renders `defaultList` when query empty (AC2.6) or `results` otherwise; `SJSkeleton` while loading (AC3.3); explicit empty (AC2.4/AC3.5) and error+retry (AC2.5/AC3.4) states; hosts `WAiMarketPick` slot. | AC2.4, AC2.6, AC3.1, AC3.3, AC3.4, AC3.5 |

### Sub-stream 5b — Detail & betting

| Task         | Description                                                                                                                                                                                                                                                        | Refs                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| **WIDGET-5** | `WMarketDetail.vue`: `SJModal` wrapper, question/outcomes/volume/liquidity, selectable outcomes via `SJBadge` (success/error triad + text/icon), closed-market disabled state (text-conveyed reason).                                                              | AC4.1, AC4.2, AC4.3, AC4.4, AC4.5           |
| **WIDGET-6** | `WBetForm.vue`: outcome-bound amount input (`SJInput`, ≥16px), live cost/payout computation, fee-breakdown table (notional/builder/platform/total) shown before submit, disabled/inert submit on invalid amount or no outcome, sticky-bottom CTA at mobile widths. | AC5.2, AC5.3, AC5.4, AC5.5, AC5.8, NFR-MF-4 |
| **WIDGET-7** | `WBetReceipt.vue`: toast via `SJLiveRegion` (`status`/`alert`), receipt detail incl. `builderCode` + fee breakdown; wires to `bets.store.placeBet` success/error paths.                                                                                            | AC5.6, AC5.7, AC5.9                         |
| **WIDGET-8** | `WPositions.vue`: list of persisted positions (question/outcome/size/price/cost/shares/payout/fees/builderCode); first-run onboarding empty state distinct from error tone.                                                                                        | AC6.2, AC6.3                                |

### Sub-stream 5c — AI + Settings

| Task          | Description                                                                                                                                                                                                                                                                   | Refs                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **WIDGET-9**  | `composables/useAiPrediction.ts`: wraps `predictOutcome`/`recommendMarket` calls, exposes 4-state status per call, enforces single-call-per-activation (no auto-invoke).                                                                                                      | AC7.3, AC9.2                             |
| **WIDGET-10** | `WAiPrediction.vue`: CTA-to-Settings when no key (AC7.2/AC7.1); on-demand button; `SJSpinner`+polite region while loading; confidence bar (`--color-primary` + numeric label) + rationale + "not financial advice" disclaimer; error+retry, never renders unvalidated output. | AC7.1, AC7.2, AC7.3, AC7.7, AC7.8, AC7.9 |
| **WIDGET-11** | `WAiMarketPick.vue`: same CTA/gating pattern over the visible list; highlights recommended `WMarketCard` + confidence + rationale + disclaimer; error+retry.                                                                                                                  | AC9.1, AC9.2, AC9.4, AC9.5, AC9.6        |
| **WIDGET-12** | `WSettings.vue`: key field with persistent `<label>`, save/clear actions wired to `settings.store`, security disclaimer text (local storage + sent directly to OpenRouter), font-size ≥16px.                                                                                  | AC8.1, AC8.2, AC8.3, AC8.5               |

### Sub-stream 5d — Wiring (sequential, after 5a–5c)

| Task          | Description                                                                                                                                                                                                                                                                                          | Refs                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **WIDGET-13** | Wire `App.vue`: header + Settings entry → `WMarketSearch` → `WMarketList` (+`WAiMarketPick`) → `WMarketDetail` (+`WBetForm`/`WBetReceipt`/`WAiPrediction`) → `WPositions` → `WSettings` overlay, per `design.md` §3.2 UX flow. Injects `createBettingService(getBuilderConfig())` into `bets.store`. | Full US1–US9 wiring, NFR-SVC-3 |

---

## Group 6 — Security gates `security:`

| Task                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                  | Refs                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **SECURITY-1**             | Audit pass: confirm the OpenRouter API key is (a) never interpolated into a URL/query string anywhere in `services/openrouter.service.ts`, (b) sent only via the `Authorization` header, (c) never passed to any `console.*` call, (d) never present in `stores/persist.ts`-written blobs other than `settings.store`'s own key. Add a one-line JSDoc contract on `predictOutcome`/`recommendMarket`/`pickFreeModel` stating this invariant. | NFR-SEC-1, NFR-SEC-2, AC8.3, AC8.4 |
| **SECURITY-2**             | Audit pass: confirm `builderCode` is sourced exclusively from `config/builder.config.ts` (env/settings-override/placeholder) in every call site (`MockBettingService`, `ClobBettingService` if built) — grep the repo for any literal 32-byte hex string outside `.env.example`/config default; fail the task if found. Confirm the placeholder default is obviously non-real (all-zero or clearly marked).                                  | NFR-SEC-4, AC5.9                   |
| **SECURITY-3**             | Confirm no `.env` value is required for the core demo to run (`npm run dev` with no `.env` file present must still serve real Gamma reads and mock bets) — document this in `.env.example` comments.                                                                                                                                                                                                                                         | NFR-SEC-3                          |
| **SECURITY-4** `[STRETCH]` | If Group 2 is built: confirm no builder **secret** (relayer/HMAC secret) ever appears in client code, env, or bundle — only the public `builderCode` bytes32. Grep for `secret`/`privateKey`/`relayer` imports outside test fixtures.                                                                                                                                                                                                        | NFR-SEC-4, AC10.3, AC10.4          |

---

## Group 7 — Tests `test:`

Unit tests can start as soon as the corresponding `svc:`/`store:` task lands — no need to wait for `ui:`/`widget:`. Each unit-test task below is independently parallelizable once its target module exists.

| Task       | Description                                                                                                                                                                                                                                                                                                                                                                     | Refs                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **TEST-1** | `tests/unit/polymarket.service.spec.ts`: `normalizeMarket` — happy path alignment, price clamping/`pricingUnreliable` flag, malformed-market → `null` (missing field, non-JSON, unequal-length arrays).                                                                                                                                                                         | AC1.1, AC1.2, AC1.3, AC1.4, AC1.5 |
| **TEST-2** | `tests/unit/betting.service.spec.ts` (math): `cost = size×price`, `shares = size/price`, `computeFees` additive builder+platform (`fee = notional×bps/10000`), zero-platform-doesn't-suppress-builder case, taker vs maker bps selection.                                                                                                                                       | AC5.2, AC5.3, AC5.8               |
| **TEST-3** | `tests/unit/betting.service.spec.ts` (validation): `MockBettingService.placeBet` rejects on invalid size (missing/non-numeric/≤0/over-max) and on missing outcome, without mutating any external state; resolves with `builderCode`+`fees` populated on success.                                                                                                                | AC5.1, AC5.4, AC5.5, AC5.7, AC5.9 |
| **TEST-4** | `tests/unit/bets.store.spec.ts`: positions persist to (mocked) `localStorage` and rehydrate; corrupt/missing payload recovers to `[]` without throwing; `placeBet` appends only on fill, leaves store untouched on rejection.                                                                                                                                                   | AC6.1, AC6.2, AC6.4, AC5.7        |
| **TEST-5** | `tests/unit/openrouter.service.spec.ts` (outcome ladder): `predictOutcome` — schema-mode happy path, json_object-mode happy path, fence-strip+retry-at-temp0 recovery path, final-failure rejection; validates `recommendedOutcome ∈ outcomes` and rejects a verbatim-mismatch after retry (never coerces/fabricates); `confidence` clamped to `[0,1]`; `rationale` length cap. | AC7.5, AC7.6, AC7.9, AC7.10       |
| **TEST-6** | `tests/unit/openrouter.service.spec.ts` (market pick): `recommendMarket` — same ladder reuse, validates `recommendedMarketId ∈ presented ids`, rejects mismatch/failure after retry.                                                                                                                                                                                            | AC9.3, AC9.6                      |
| **TEST-7** | `tests/unit/settings.store.spec.ts`: save/clear persists and clears `localStorage`; never calls `console.*` with the key value (spy assertion).                                                                                                                                                                                                                                 | AC8.1, AC8.2, NFR-SEC-1           |
| **TEST-8** | `tests/e2e/bet-flow.spec.ts` (Playwright): search a market → open detail → select outcome → enter amount → place simulated bet → assert the position appears in `WPositions` without a page reload.                                                                                                                                                                             | NFR-TEST-2                        |

---

## Group 8 — Docs `docs:`

| Task       | Description                                                                                                                                                                                                                                                                                                         | Refs              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **DOCS-1** | Update root `README.md` (or add one if absent — check first) with: run instructions, `.env.example` walkthrough, note that betting is mock-by-default and why (geoblock/ToS/funded-wallet), OpenRouter key disclaimer, and — if Group 2 built — how to opt into the stretch real-order path and its gating caveats. | AC10.4, NFR-SEC-5 |

---

## 9. Traceability check (every AC/NFR ⇒ ≥1 task)

| AC/NFR        | Covering task(s)                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AC1.1–AC1.5   | SVC-1, SVC-3, TEST-1                                                                                                            |
| AC2.1–AC2.6   | SVC-4, STORE-1, WIDGET-1, WIDGET-2, WIDGET-4                                                                                    |
| AC3.1–AC3.5   | SVC-5, STORE-1, WIDGET-4                                                                                                        |
| AC4.1–AC4.5   | SVC-6, STORE-1, WIDGET-3, WIDGET-5                                                                                              |
| AC5.1–AC5.9   | SVC-7, SVC-8, SVC-9, STORE-2, WIDGET-6, WIDGET-7, TEST-2, TEST-3, TEST-4                                                        |
| AC6.1–AC6.4   | SETUP-5, STORE-2, WIDGET-8, TEST-4                                                                                              |
| AC7.1–AC7.10  | SVC-10, SVC-11, SVC-12, SVC-13, WIDGET-9, WIDGET-10, TEST-5                                                                     |
| AC8.1–AC8.5   | SETUP-5, STORE-3, WIDGET-12, TEST-7, SECURITY-1                                                                                 |
| AC9.1–AC9.6   | SVC-12, SVC-14, WIDGET-9, WIDGET-11, TEST-6                                                                                     |
| AC10.1–AC10.5 | SVC-15, SVC-16, DOCS-1, SECURITY-4 `[STRETCH]`                                                                                  |
| NFR-DS-1…8    | UI-1…UI-8, WIDGET-3, WIDGET-5, WIDGET-6                                                                                         |
| NFR-MF-1…4    | UI-1, UI-2, WIDGET-6                                                                                                            |
| NFR-A11Y-1…5  | UI-2, UI-4, UI-5, UI-6, UI-7, UI-8                                                                                              |
| NFR-THEME-1   | (structural — no dark-mode code is added anywhere; enforced by omission, spot-checked in SECURITY audit passes and code review) |
| NFR-SEC-1…5   | SECURITY-1, SECURITY-2, SECURITY-3, SECURITY-4 `[STRETCH]`, SVC-11/13/14, SETUP-1                                               |
| NFR-SVC-1…3   | SVC-2, SETUP-4, SVC-16, WIDGET-13                                                                                               |
| NFR-TEST-1    | TEST-1…TEST-7                                                                                                                   |
| NFR-TEST-2    | TEST-8                                                                                                                          |

---

## 10. Suggested worktree partition (max parallelism)

For an autopilot/multi-agent run, these are the largest safe concurrent streams (no file overlap):

1. **Worktree `svc-market`** — SETUP-1..5, SVC-1..6 (Stream A)
2. **Worktree `svc-betting-ai`** — SVC-7..14 (Stream B) — can start once SETUP-1/2 land (or stub config imports and rebase)
3. **Worktree `ui-primitives`** — UI-1..8 — fully independent, can start immediately (Group 0/1 not required)
4. **Worktree `stretch-clob`** `[STRETCH]` — SVC-15, SVC-16, DOCS-1(partial), SECURITY-4 — isolated, merge last, never blocks core
5. **Worktree `tests-unit`** — TEST-1..7 — rebase onto `svc-market`/`svc-betting-ai` as those land; can be written test-first against the interfaces in `design.md` §2 before implementations exist
6. After (1)+(2)+(3) merge to an integration branch: **Worktree `widgets`** — STORE-1..3, WIDGET-1..13 (5a/5b/5c parallel internally, 5d sequential last)
7. **Worktree `e2e`** — TEST-8 — after WIDGET-13 lands
8. **`SECURITY-1..3`, `DOCS-1`** — run last, as a gate before considering the core demo done

Total: **55 core tasks** (Groups 0,1,3,4,5,6[core],7,8) + **3 stretch tasks** (SVC-15, SVC-16, SECURITY-4; DOCS-1 carries a stretch addendum but is itself a core task) across the prefixes: `setup:` 5, `svc:` 14 (+2 stretch), `store:` 3, `ui:` 8, `widget:` 13, `security:` 3 (+1 stretch), `test:` 8, `docs:` 1.
