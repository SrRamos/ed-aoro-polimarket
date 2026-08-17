# Spec — Polymarket Widget

> Status: **ready-for-dev** (with warnings — see [`HARDEN-REPORT.md`](./HARDEN-REPORT.md) §Warnings) · Feature: `polymarket-widget` · Single-page Vue 3 + TypeScript widget
> Hardened: 2026-08-17 (`spec-harden`) — plan in [`plan.md`](./plan.md), tasks in [`tasks.md`](./tasks.md). Open questions: 0 unresolved. Hard blockers: 0.
> Source of truth: [`docs/analysis-and-architecture.md`](../../docs/analysis-and-architecture.md) (decisions D1–D10)
> Research: [Polymarket API](../../docs/research-polymarket-api.md) · [OpenRouter AI](../../docs/research-openrouter-ai.md) · [RamosLabs DS](../../docs/research-ramoslabs-ds.md) · [Deployment](../../docs/deployment-cloudflare.md)

---

## 1. Overview / Intent

### 1.1 What this is

A **single-page widget** that lets a user **search Polymarket prediction markets**, **browse** a default list, **open a market** to see its outcomes and prices, **place a (simulated) bet**, **track positions**, and optionally request an **AI-assisted prediction**. All browser I/O (`fetch`) is encapsulated behind a **service layer**; all UI/UX is built exclusively from the **RamosLabs Design System** tokens and documented patterns.

### 1.2 Scope

Everything lives on **one page** (`App.vue`) with a vertical, mobile-first layout: header + settings entry, search bar, results list, market detail (modal/panel), bet form + receipt, positions list, and an opt-in AI prediction panel inside the detail.

### 1.3 Confirmed decisions (the spec is built on these)

| Ref | Decision |
|---|---|
| D1 | **Market reads are REAL** via Polymarket Gamma API (`https://gamma-api.polymarket.com`) — public, no auth, CORS `*`. |
| D2 | **Betting is SIMULATED (mock)** behind a `BettingService` interface. Real on-chain order placement is out of scope; the interface is swappable for a future real implementation. |
| D3 | **Prices are Gamma snapshots** (`outcomePrices`) for the MVP. Live CLOB `/price` quoting is a deferred enhancement, not built now. |
| D4 | **AI is opt-in** via OpenRouter free models; the API key is **user-supplied** in Settings and stored in `localStorage`. No key is ever bundled. |
| D5 | AI model is **discovered at runtime** with a preference/fallback chain (`z-ai/glm-5.2:free` → `nvidia/nemotron-3-ultra-550b-a55b:free` → `openai/gpt-oss-20b:free` → `openrouter/free`). |
| D6 | **Light theme only.** The DS ships no dark mode; no dark tokens are invented. |
| D7–D8 | **Custom components only**, `SJ`/`W` naming, **token-only**, and they MUST follow **all** DS guidelines (not just tokens). |
| D9 | **Mobile-first under the DS's own conditions**: base = 0, five `min-width` breakpoints, thumb-zone ergonomics, touch ≥24×24 (aim 44×44), inputs ≥16px. |
| D10 | **Deployment: Cloudflare Workers with Static Assets** (single Worker serves the SPA and can host `/api/*` routes with env vars/secrets), not Pages. Env-driven config, simulation→real switch by env var, auto-deploy on merge to `main`. See [`docs/deployment-cloudflare.md`](../../docs/deployment-cloudflare.md). |
| Stack | Vue 3 (`<script setup>`, Composition API) + Vite + **TypeScript** + Pinia + `@ramoslabs/tokens`. Testing: **Vitest unit + 1 Playwright E2E** (search → bet). Hosting: Cloudflare Workers Static Assets. |

### 1.4 Glossary

- **Market** — a Polymarket question with a set of mutually exclusive **outcomes** (e.g. `["Yes","No"]`), each carrying an **outcomePrice** in `[0,1]` interpreted as an implied probability.
- **Position** — a simulated bet the user has placed, persisted locally.
- **Snapshot price** — the `outcomePrices` value returned by Gamma at fetch time (not a live CLOB quote).

---

## 2. User stories (grouped by capability)

### Capability F0 — Market data integrity (foundation)
- **US1** — As a developer/consumer of the widget, I want the JSON-encoded string arrays from Gamma (`outcomes`, `outcomePrices`, `clobTokenIds`) parsed and positionally aligned into a normalized `Market`, so the rest of the UI works with typed arrays instead of raw strings.

### Capability A — Search markets
- **US2** — As a user, I want to search markets by free text, so I can find the market I care about.

### Capability B — Browse / list markets
- **US3** — As a user, I want to see a default list of active markets (top by volume) on load, so I have something to explore before searching.

### Capability C — View market detail
- **US4** — As a user, I want to open a market and see its outcomes, prices (as %), and volume/liquidity, so I can understand the market before betting.

### Capability D — Place a bet (simulated)
- **US5** — As a user, I want to place a simulated bet on a chosen outcome with a chosen amount and see the cost and potential payout, so I can experience the betting flow without real funds.

### Capability E — View positions
- **US6** — As a user, I want to see my placed (simulated) positions persisted across reloads, so I can track what I have "bet" on.

### Capability F — AI-assisted prediction (bonus)
- **US7** — As a user with an OpenRouter key, I want an on-demand AI suggestion for a market (recommended outcome + confidence + rationale), so I can get a data-grounded second opinion.

### Capability G — Settings (AI key)
- **US8** — As a user, I want to enter and manage my OpenRouter API key in Settings, so the optional AI feature can be enabled or disabled by me.

### Capability H — Deployment / Ops (bonus, infra)
- **US9** — As an operator, I want the widget to deploy to Cloudflare automatically on merge to `main`, driven by environment variables (including an env-driven simulation→real switch) with no client-exposed secrets, so the app is hosted and can later switch from simulation-only to "something real" by configuration.

---

## 3. EARS requirements

> EARS patterns used: **Ubiquitous** (`THE SYSTEM SHALL`), **Event-driven** (`WHEN … THE SYSTEM SHALL`), **State-driven** (`WHILE … THE SYSTEM SHALL`), **Optional** (`WHERE … THE SYSTEM SHALL`), **Unwanted-behavior** (`IF … THEN THE SYSTEM SHALL`), **Complex** (combinations). ACs are numbered `AC<story>.<n>` with anchors for `tasks.md` deep-linking.

### US1 — Market data normalization

<a id="ac1-1"></a>
**AC1.1** (Event-driven, happy)
WHEN a raw market object is received from Gamma, THE SYSTEM SHALL `JSON.parse` the `outcomes`, `outcomePrices`, and `clobTokenIds` string fields into arrays and expose them on the normalized `Market` as `outcomes: string[]`, `prices: number[]`, and `tokenIds: string[]`.

<a id="ac1-2"></a>
**AC1.2** (Ubiquitous, invariant)
THE SYSTEM SHALL preserve positional alignment such that for every index `i`, `outcomes[i]`, `prices[i]`, and `tokenIds[i]` describe the same outcome.

<a id="ac1-3"></a>
**AC1.3** (Ubiquitous, invariant)
THE SYSTEM SHALL coerce each parsed price to a `number` and treat it as an implied probability in the range `[0,1]`.

<a id="ac1-4"></a>
**AC1.4** (Complex, whole-payload + envelope validation)
IF any consumed field of the raw market is absent or of the wrong type — the three JSON-encoded string arrays (`outcomes`, `outcomePrices`, `clobTokenIds`) missing / not valid JSON / of unequal length, OR any of `question`, `volumeNum`, `liquidityNum`, `endDate`, `active`, `closed` missing or of the wrong type — THEN THE SYSTEM SHALL treat that market as malformed and exclude it from rendering rather than throwing an unhandled error that breaks the list. THE SYSTEM SHALL parse the raw input (`raw: unknown`) through an explicit schema (whole object, not only the three arrays) AND validate each response envelope before consumption — the `/markets` array shape and the `/public-search` `{events,tags,profiles}` shape — never consuming an `any`-typed payload unchecked.

<a id="ac1-5"></a>
**AC1.5** (Unwanted-behavior, edge)
IF a parsed price is non-numeric or falls outside `[0,1]`, THEN THE SYSTEM SHALL clamp it to `[0,1]` for display and flag the market's pricing as unreliable (never render `NaN`).

---

### US2 — Search markets

<a id="ac2-1"></a>
**AC2.1** (Event-driven, happy)
WHEN the user types a query and the input settles after the debounce interval, THE SYSTEM SHALL request matching markets from the search service with a bounded result cap (`limit=50` passed to `/public-search`) and render the results as a list of market cards, virtualizing or offering a "show more" affordance when more than 50 results would render (so an unbounded result set never mounts thousands of DOM nodes at once).

<a id="ac2-2"></a>
**AC2.2** (Event-driven, debounce)
WHEN the user types multiple characters in rapid succession, THE SYSTEM SHALL debounce input (≈300 ms) and issue at most one search request for the final settled value, cancelling or ignoring superseded in-flight requests.

<a id="ac2-3"></a>
**AC2.3** (Complex, loading + result-count announce)
WHILE a search request is in flight, THE SYSTEM SHALL display a loading indicator and announce the loading state via a polite live region; WHEN the request settles, THE SYSTEM SHALL announce the number of matching markets found via the same polite live region (not only the loading state).

<a id="ac2-4"></a>
**AC2.4** (State-driven, empty + recovery)
WHILE a search has completed with zero matching markets, THE SYSTEM SHALL display an explicit empty state (distinct from the loading and error states) that echoes and preserves the submitted query, offers a clear-search affordance, and surfaces the default top-by-volume markets as a recovery path rather than a dead-end message.

<a id="ac2-5"></a>
**AC2.5** (Unwanted-behavior, error)
IF the search request fails (network error, non-2xx, or timeout), THEN THE SYSTEM SHALL display an error state with a retry affordance and announce it via an assertive live region, without discarding the previous results silently.

<a id="ac2-6"></a>
**AC2.6** (State-driven, cleared input)
WHILE the search input is empty, THE SYSTEM SHALL show the default browse list (US3) rather than an empty-results message.

<a id="ac2-7"></a>
**AC2.7** (Ubiquitous, search input semantics)
THE SYSTEM SHALL render the search field as `type="search"` with `enterkeyhint="search"` and `autocomplete="off"`, carrying a persistent visible label, so the on-screen keyboard and clear affordance match a search intent.

<a id="ac2-8"></a>
**AC2.8** (Unwanted-behavior, offline)
IF the device is offline (`navigator.onLine === false`, or a `window` `offline` event has fired), THEN THE SYSTEM SHALL surface a **distinct offline state** — separate from a generic network/error state — and SHALL NOT issue or retry the debounced search request while offline (no retry-storm), automatically resuming the pending query when a `window` `online` event restores connectivity.

---

### US3 — Browse / list markets

<a id="ac3-1"></a>
**AC3.1** (Event-driven, happy)
WHEN the page loads with no active query, THE SYSTEM SHALL fetch active, non-closed markets ordered by volume (descending) and render them as market cards.

<a id="ac3-2"></a>
**AC3.2** (Ubiquitous, card content)
THE SYSTEM SHALL render each market card with its question, each outcome and its price shown as a percentage with a proportional bar, and its volume and liquidity.

<a id="ac3-3"></a>
**AC3.3** (State-driven, loading)
WHILE the default list is loading, THE SYSTEM SHALL display skeleton/loading placeholders built from DS surface/border tokens (never a blank screen).

<a id="ac3-4"></a>
**AC3.4** (Unwanted-behavior, error)
IF the default list request fails, THEN THE SYSTEM SHALL display an error state with a retry affordance.

<a id="ac3-5"></a>
**AC3.5** (Unwanted-behavior, empty)
IF the default list returns zero markets, THEN THE SYSTEM SHALL display an explicit empty state rather than an ambiguous blank region.

---

### US4 — View market detail

<a id="ac4-1"></a>
**AC4.1** (Event-driven, happy)
WHEN the user selects a market card, THE SYSTEM SHALL open the market detail (modal/panel) showing the question, all outcomes with selectable controls, each outcome's price as a percentage, and volume/liquidity.

<a id="ac4-2"></a>
**AC4.2** (Ubiquitous, outcome signalling)
THE SYSTEM SHALL distinguish outcomes using the DS `success`/`error` semantic triads combined with text and/or icon/shape, never using color as the only signal (WCAG SC 1.4.1).

<a id="ac4-3"></a>
**AC4.3** (State-driven, selection)
WHILE an outcome is selected, THE SYSTEM SHALL visibly mark it as selected and make the bet form (US5) operate against that outcome and its snapshot price.

<a id="ac4-4"></a>
**AC4.4** (Event-driven, close)
WHEN the user dismisses the detail (close button, backdrop, or Escape), THE SYSTEM SHALL close it and return keyboard focus to the invoking control.

<a id="ac4-5"></a>
**AC4.5** (Unwanted-behavior, closed market)
IF the selected market is closed or inactive, THEN THE SYSTEM SHALL indicate it is not open for betting and disable the bet action, with the reason conveyed by text (not color alone).

<a id="ac4-6"></a>
**AC4.6** (Complex, more-than-two outcomes)
WHERE a market carries more than two outcomes, WHEN it is rendered or opened, THE SYSTEM SHALL encode each outcome with a neutral chip (not the binary `success`/`error` triad), still pairing color with a text label so color is never the sole signal (SC 1.4.1), and any AI framing SHALL address the outcome set generically rather than as "Yes/No".

<a id="ac4-7"></a>
**AC4.7** (Complex, dialog semantics + responsive presentation)
WHILE the market detail is open, THE SYSTEM SHALL expose it as `role="dialog"` with `aria-modal="true"`, `aria-labelledby` referencing the question, `aria-describedby` for its summary, and a defined initial focus target; on mobile it SHALL present as a full-screen / bottom sheet honoring `env(safe-area-inset-*)` with internal `overflow-y:auto`, a visible close control, backdrop dismissal, and Escape, becoming a centered dialog only at `md` and above.

---

### US5 — Place a bet (simulated)

<a id="ac5-0-5"></a>
**AC5.0.5** (Complex, confirmation gate)
WHILE an outcome is selected and a valid amount is entered, WHEN the user initiates placing the bet, THE SYSTEM SHALL present a review-and-confirm step restating the amount, outcome, snapshot price (as %), and potential payout, and SHALL call `BettingService.placeBet` only after the user explicitly confirms.

<a id="ac5-1"></a>
**AC5.1** (Complex, happy)
WHILE an outcome is selected and a valid amount is entered, WHEN the user submits the bet, THE SYSTEM SHALL call `BettingService.placeBet`, produce a simulated filled receipt `{ status:'filled', avgPrice, shares, cost, txHash }`, and add the resulting position to the persisted positions store.

<a id="ac5-1a"></a>
**AC5.1a** (State-driven, in-flight double-submit guard)
WHILE a `placeBet` call is in flight, THE SYSTEM SHALL disable the submit/confirm control and set `aria-busy="true"` on it, so a rapid second tap cannot file a duplicate position, re-enabling the control only once the call settles.

<a id="ac5-2"></a>
**AC5.2** (Ubiquitous, cost math)
THE SYSTEM SHALL compute bet **cost = size × price** (using the selected outcome's snapshot price) and display it live as the amount changes.

<a id="ac5-3"></a>
**AC5.3** (Complex, payout math + finite guard)
THE SYSTEM SHALL compute **shares = size / price** and **potential payout = shares × $1.00** (each share resolves to $1 on a winning outcome) and display the potential payout live. IF the selected snapshot price is `<= 0` or not `Number.isFinite`, THEN THE SYSTEM SHALL block betting on that outcome (no receipt, no persistence). THE SYSTEM SHALL assert `Number.isFinite` on `cost`, `shares`, and `payout` before producing a receipt or persisting, and SHALL set the receipt/position `avgPrice = prices[i]` (the selected outcome's snapshot price).

<a id="ac5-4"></a>
**AC5.4** (Unwanted-behavior, invalid amount)
IF the entered amount is missing, non-numeric, ≤ 0, or exceeds the input's allowed maximum, THEN THE SYSTEM SHALL block submission, keep the button disabled/inert, and show a specific inline error tied to the field via `aria-invalid="true"` and `aria-describedby` linking the input to its error message (styled via `:user-invalid`), never a placeholder-as-error.

<a id="ac5-5"></a>
**AC5.5** (Unwanted-behavior, no outcome)
IF no outcome is selected, THEN THE SYSTEM SHALL prevent bet submission and prompt the user to choose an outcome.

<a id="ac5-6"></a>
**AC5.6** (Event-driven, receipt feedback)
WHEN a bet is filled, THE SYSTEM SHALL surface a receipt/confirmation (toast) via a live region and reflect the new position in the positions list without a page reload.

<a id="ac5-7"></a>
**AC5.7** (Unwanted-behavior, service failure)
IF `BettingService.placeBet` rejects (validation or simulated failure), THEN THE SYSTEM SHALL show an error state, leave the positions store unchanged, and allow the user to retry.

<a id="ac5-8"></a>
**AC5.8** (Ubiquitous, amount input semantics)
THE SYSTEM SHALL render the bet-amount field as `type="text"` with `inputmode="decimal"` (never `type="number"` for money), at a font size ≥ 16px, with a persistent visible label.

---

### US6 — View positions

<a id="ac6-1"></a>
**AC6.1** (Complex, persistence + write-failure)
THE SYSTEM SHALL persist positions in `localStorage` and restore them on load so they survive a page reload. IF a write fails because storage is unavailable (Safari Private mode / disabled) or raises `QuotaExceededError`, THEN THE SYSTEM SHALL surface a non-blocking "couldn't save locally" notice and SHALL NOT present a filled receipt for a bet it could not persist.

<a id="ac6-2"></a>
**AC6.2** (Ubiquitous, content)
THE SYSTEM SHALL display each position with its market question, chosen outcome, size, price, cost, shares, and potential payout.

<a id="ac6-3"></a>
**AC6.3** (State-driven, empty)
WHILE no positions exist, THE SYSTEM SHALL show a first-run empty state that explains no bets have been placed yet (onboarding tone), distinct from an error.

<a id="ac6-4"></a>
**AC6.4** (Unwanted-behavior, corrupt storage)
IF the persisted positions payload is missing, fails to parse, or contains invalid items, THEN THE SYSTEM SHALL recover without crashing by validating each item against its schema on read and dropping only the invalid item(s) (never a wipe-on-tamper of the whole store); a corrupt/tampered payload SHALL surface a distinct recoverable notice (`role="status"`) that is NOT the first-run onboarding empty state.

<a id="ac6-5"></a>
**AC6.5** (Event-driven, cross-tab reconciliation)
WHEN a `window` `storage` event fires indicating the persisted positions or settings changed in another tab, THE SYSTEM SHALL reconcile its in-memory state from the updated `localStorage` payload — re-validating each item per AC6.4 — so positions and the AI key stay consistent across tabs without requiring a reload.

---

### US7 — AI-assisted prediction (bonus)

<a id="ac7-1"></a>
**AC7.1** (Optional, gated on key)
WHERE a valid OpenRouter API key is present in settings, THE SYSTEM SHALL enable the "AI suggestion" action inside the market detail.

<a id="ac7-2"></a>
**AC7.2** (Complex, no-key CTA)
WHILE no OpenRouter key is configured, WHEN the user looks for the AI feature, THE SYSTEM SHALL keep a **visible but disabled** AI affordance (never fully hidden) and present a CTA linking to Settings (US8) rather than calling the API.

<a id="ac7-3"></a>
**AC7.3** (Event-driven, on-demand only)
WHEN — and only when — the user explicitly activates the "AI suggestion" action, THE SYSTEM SHALL send exactly one prediction request; THE SYSTEM SHALL NOT call the AI automatically on market open, selection, or search (rate-limit-friendly, respecting the free tier's 20 req/min cap).

<a id="ac7-4"></a>
**AC7.4** (Event-driven, model discovery)
WHEN a prediction is requested, THE SYSTEM SHALL resolve a live free model at runtime using the preference chain (`z-ai/glm-5.2:free` → `nvidia/nemotron-3-ultra-550b-a55b:free` → `openai/gpt-oss-20b:free`), falling back to any free model advertising `structured_outputs`, and finally to `openrouter/free`.

<a id="ac7-5"></a>
**AC7.5** (Event-driven, structured-output ladder)
WHEN parsing the model response, THE SYSTEM SHALL apply a degradation ladder: (1) `json_schema` strict when the model advertises `structured_outputs`; (2) otherwise `json_object` mode with an explicit "reply only with this JSON" instruction; (3) on parse failure, strip code fences, extract the first `{…}` block, `JSON.parse`, and retry once at `temperature: 0`.

<a id="ac7-6"></a>
**AC7.6** (Ubiquitous, output validation)
THE SYSTEM SHALL validate the parsed prediction: `recommendedOutcome` MUST be one of the market's provided outcome labels, and `confidence` MUST be clamped to `[0,1]`; `rationale` length is capped for display.

<a id="ac7-7"></a>
**AC7.7** (State-driven, loading)
WHILE a prediction request is in flight, THE SYSTEM SHALL show a loading state and announce it via a polite live region.

<a id="ac7-8"></a>
**AC7.8** (Ubiquitous, render + confidence signal)
THE SYSTEM SHALL render the result as the recommended outcome, a confidence bar using `--color-primary` accompanied by a numeric label (never color as the only signal), and the rationale text, alongside a "not financial advice" disclaimer.

<a id="ac7-9"></a>
**AC7.9** (Unwanted-behavior, error/retry + rate-limit)
IF the AI request fails or the response fails validation after the retry, THEN THE SYSTEM SHALL show an error state with a retry affordance and MUST NOT surface a partial/unvalidated prediction as if it were valid. IF the failure is specifically a `429` rate-limit, THEN THE SYSTEM SHALL distinguish it from a hard failure — surfacing a "rate-limited, try again shortly" message that honors any `Retry-After` header and does NOT auto-retry.

<a id="ac7-10"></a>
**AC7.10** (Unwanted-behavior, verbatim outcome)
IF `recommendedOutcome` does not match any provided outcome label after the single retry, THEN THE SYSTEM SHALL treat the prediction as invalid (per AC7.9) rather than displaying a fabricated or coerced outcome.

---

### US8 — Settings (AI key)

<a id="ac8-1"></a>
**AC8.1** (Event-driven, save)
WHEN the user enters an OpenRouter API key in Settings and saves, THE SYSTEM SHALL persist it in `localStorage` and enable the AI feature (US7) without a page reload.

<a id="ac8-2"></a>
**AC8.2** (Event-driven, clear)
WHEN the user clears/removes the key, THE SYSTEM SHALL delete it from `localStorage` and return the AI feature to its disabled/CTA state.

<a id="ac8-3"></a>
**AC8.3** (Ubiquitous, disclosure)
THE SYSTEM SHALL display a security disclaimer in Settings stating the key is stored locally in the browser (and is therefore readable by any script running on the page) and sent directly to OpenRouter, recommending a **scoped, spend-capped** key that the user can **revoke** at OpenRouter, and SHALL NOT log the key or place it in any URL.

<a id="ac8-4"></a>
**AC8.4** (Ubiquitous, no bundled key)
THE SYSTEM SHALL never ship, embed, or fall back to a built-in/bundled API key; the only key ever used is the user-supplied one.

<a id="ac8-5"></a>
**AC8.5** (State-driven, form conventions)
WHILE the Settings form is shown, THE SYSTEM SHALL use a persistent visible `<label>` for the key field (never placeholder-as-label), native input semantics, and expose the key field so a value can be entered on touch without iOS zoom (font-size ≥ `--font-size-base`/16px).

<a id="ac8-6"></a>
**AC8.6** (Ubiquitous, key field semantics)
THE SYSTEM SHALL render the key field as `type="password"` with a show/hide toggle, allowing paste and password managers (WCAG SC 3.3.8 Accessible Authentication), with `autocomplete`, `autocapitalize`, and `autocorrect` disabled.

---

### US9 — Deployment / Ops (bonus, infra)

<a id="ac9-1"></a>
**AC9.1** (Event-driven, deploy on merge)
WHEN a change is merged to the `main` branch, THE SYSTEM SHALL build the production bundle and deploy it to the hosting platform automatically, without a manual deploy step.

<a id="ac9-2"></a>
**AC9.2** (State-driven, gate before deploy + merge gate)
WHILE the deploy pipeline runs, THE SYSTEM SHALL execute the full quality gate (lint, format check, unit + component tests, the E2E test, and a blocking `npm audit --audit-level=high`) before deploying, and SHALL proceed to deploy only if the gate passes. The same gate SHALL run as a **required PR status check with branch protection on `main`** (a merge gate, not only a deploy gate); all GitHub Actions SHALL be **SHA-pinned**; and installs SHALL use `npm ci` against the committed lockfile.

<a id="ac9-3"></a>
**AC9.3** (Ubiquitous, env-driven config)
THE SYSTEM SHALL source runtime configuration from environment variables, including a betting-mode switch (`mock` vs `real`) and an AI-key-sourcing switch (user-supplied key vs server proxy), such that behavior changes by configuration without code edits.

<a id="ac9-4"></a>
**AC9.4** (Unwanted-behavior, no client-exposed secrets)
IF a value is a secret (any API key or credential), THEN THE SYSTEM SHALL keep it out of the client bundle and out of version control, exposing it only to server-side code; public build-time config MUST NOT contain any secret.

<a id="ac9-5"></a>
**AC9.5** (Complex, default simulation + fail-safe real)
WHILE the betting-mode configuration is unset or set to `mock`, THE SYSTEM SHALL use the simulated betting path (default), and WHILE it is set to `real`, THE SYSTEM SHALL route bets to the server-side adapter. IF `VITE_BET_MODE=real` but no real (CLOB) betting adapter is available, THEN THE SYSTEM SHALL **fail safe** — degrading to a disabled betting state that surfaces a clear "real betting mode is not available" message — and SHALL NOT throw at startup or otherwise crash the widget (flipping the flag must never take the app down).

<a id="ac9-6"></a>
**AC9.6** (Complex, AI mode reconciliation)
WHILE the AI-mode configuration is `user-key`, WHEN a prediction is requested, THE SYSTEM SHALL use the user-supplied key from Settings and call the AI provider directly; WHILE it is `proxy`, THE SYSTEM SHALL call a server-side route that injects the key, and the key SHALL NOT be handled by the client.

<a id="ac9-7"></a>
**AC9.7** (Unwanted-behavior, rollback)
IF a deployed build is faulty, THEN THE SYSTEM SHALL support reverting to a previous known-good deployed version without requiring a source rewrite.

<a id="ac9-8"></a>
**AC9.8** (Ubiquitous, non-blocking scope)
THE SYSTEM SHALL keep the deployment/ops capability independent of the core widget, such that the core flows (search → detail → simulated bet → positions, plus opt-in AI) remain fully operable in local development without any deployment configured.

---

## 4. Acceptance criteria (Given / When / Then summary)

> These restate the testable core of each story in Given/When/Then form; the authoritative, atomic criteria are the EARS ACs in §3.

- **US1 — Normalization.** Given a Gamma market with JSON-encoded string arrays, When it is normalized, Then `outcomes`/`prices`/`tokenIds` are aligned typed arrays and a malformed market is excluded (AC1.1–AC1.5).
- **US2 — Search.** Given text in the search box, When input settles after debounce, Then at most one capped (`limit=50`) request runs, results/empty/loading/error/offline states render correctly, results virtualize/"show more" beyond 50, the result count is announced on settle, no-results offers a recovery path, the field uses search input semantics, and while offline a distinct offline state shows with no retry-storm (AC2.1–AC2.8).
- **US3 — Browse.** Given a fresh load with no query, When the page mounts, Then top-by-volume active markets render with skeletons while loading and an explicit empty/error state otherwise (AC3.1–AC3.5).
- **US4 — Detail.** Given a market card, When selected, Then the detail opens as a `role="dialog"` (mobile sheet → md+ centered/two-pane) with outcomes signalled by triad+text (neutral chips when >2 outcomes), selection drives the bet form, and focus returns on close (AC4.1–AC4.7).
- **US5 — Bet.** Given a selected outcome and a valid amount, When the user confirms via a review step, Then cost = size×price and payout = (size/price)×$1 are shown live, a finite-guarded simulated receipt (`avgPrice = prices[i]`) is produced, the in-flight control is guarded against double-submit, the position persists, and invalid input/no-outcome/non-finite-price/service-failure are blocked with specific field-linked feedback (AC5.0.5–AC5.8).
- **US6 — Positions.** Given placed bets, When the page reloads, Then positions restore from `localStorage`; an empty first-run state shows when none exist; corrupt storage recovers to empty; and a `storage` event from another tab reconciles positions/settings without a reload (AC6.1–AC6.5).
- **US7 — AI.** Given a configured key, When the user explicitly requests a suggestion, Then exactly one request runs, the model is discovered at runtime, output is parsed via the ladder and validated (`recommendedOutcome` ∈ outcomes, confidence clamped), rendered with a numeric confidence signal + disclaimer, and failures show retry without surfacing invalid results (AC7.1–AC7.10).
- **US8 — Settings.** Given the Settings form, When the user saves/clears a key, Then it is persisted/removed in `localStorage`, the AI feature toggles accordingly, the disclaimer shows, no key is ever bundled, and the field follows DS form conventions (AC8.1–AC8.5).
- **US9 — Deployment / Ops.** Given a merge to `main`, When the pipeline runs, Then the full gate runs before an automatic deploy; env vars drive config including the `mock`/`real` betting switch (which fails safe to a disabled betting state, never a crash, when `real` has no adapter) and `user-key`/`proxy` AI switch; secrets never reach the client bundle or version control; a bad build can be rolled back; and none of this blocks the core widget in local dev (AC9.1–AC9.8).

---

## 5. Non-functional / cross-cutting requirements (HARD constraints)

> These are **mandatory** and apply to **every** component, including all custom `SJ`/`W` components (D7–D8). Requirements quote the RamosLabs DS rules verbatim where load-bearing.

### 5.1 RamosLabs Design System governs everything

<a id="nfr-ds-1"></a>
**NFR-DS-1** (Ubiquitous, token-only)
THE SYSTEM SHALL express every color, spacing, typography, radius, shadow, and motion value as a `var(--token)` from `@ramoslabs/tokens`. A raw hex, `rgb()`, `px`, or `rem` literal in product CSS is a defect. Spacing snaps to the `--space-*` scale only (no off-scale 13px/15px values).

<a id="nfr-ds-2"></a>
**NFR-DS-2** (Ubiquitous, mono-indigo accent)
THE SYSTEM SHALL use **`#4f46e5` (Indigo 600, `--color-primary`) as the only action accent**. The secondary violet is decorative only and MUST NOT be used for interactive affordances.

<a id="nfr-ds-3"></a>
**NFR-DS-3** (Ubiquitous, press-first states)
THE SYSTEM SHALL order interactive states `:active` → `:focus-visible` → `:hover`, with hover gated behind `@media (hover:hover) and (pointer:fine)`, expressing hover/focus/pressed via the tonal indigo state-layer overlays (`--state-hover:0.08`, `--state-focus:0.1`, `--state-pressed:0.1`). Shadow SHALL NEVER be used to convey state.

<a id="nfr-ds-4"></a>
**NFR-DS-4** (Ubiquitous, visible focus)
THE SYSTEM SHALL render a visible focus indicator on `:focus-visible` using `--shadow-focus` (`0 0 0 2px #fff, 0 0 0 4px #4f46e5`) for every interactive element.

<a id="nfr-ds-5"></a>
**NFR-DS-5** (Ubiquitous, native-first + labels)
THE SYSTEM SHALL prefer native HTML controls and attach a **persistent visible `<label>`** to every form control. Placeholder-as-label is prohibited. Validation uses HTML attributes styled with `:user-invalid`/`:user-valid` (post-interaction).

<a id="nfr-ds-6"></a>
**NFR-DS-6** (Ubiquitous, radius/shadow/motion by role)
THE SYSTEM SHALL apply radius by role — `--radius-sm` for controls (buttons/inputs), `--radius-lg` for cards, `--radius-xl` for modals, `--radius-pill` for chips/badges only — apply shadows for **elevation only** (`--shadow-sm` cards/buttons, `--shadow-md` popovers, `--shadow-lg` modals), and restrict motion to the three DS durations (150/200/300 ms) animating **only `transform` and `opacity`** ("no job, no motion").

<a id="nfr-ds-7"></a>
**NFR-DS-7** (Ubiquitous, naming + patterns)
THE SYSTEM SHALL name shared UI primitives `SJ*` and app widgets `W*`, and SHALL follow the DS documented patterns (Interactive, Form Elements, Modals, Accessibility, Mobile First). Reuse before creating.

<a id="nfr-ds-8"></a>
**NFR-DS-8** (Ubiquitous, cards/badges/modals spec)
THE SYSTEM SHALL build cards with `--color-surface` background, `--space-6` padding, `--radius-lg`, `--shadow-sm`; badges/chips with `--radius-pill` + semantic triads (`-surface`+`-border`+`-text`) with icon/text; and modals with `--radius-xl`, `--shadow-lg`, `--z-modal-backdrop:500`/`--z-modal:600`, motion ≤ 300 ms.

### 5.2 Mobile-first under the DS's own conditions (D9)

<a id="nfr-mf-1"></a>
**NFR-MF-1** (Ubiquitous, base=0 + breakpoints + viewport)
THE SYSTEM SHALL author base styles for mobile (base = 0) and layer enhancements only at the DS's five `min-width` breakpoints — `sm:576`, `md:769`, `lg:992`, `xl:1200`, `2xl:1366` (px). No `xs`, no max-width-first media queries. THE SYSTEM SHALL set the viewport meta to `width=device-width, initial-scale=1, viewport-fit=cover` and SHALL NOT set `maximum-scale` or `user-scalable=no` (WCAG SC 1.4.4). Concrete per-breakpoint layout change is mandated by NFR-MF-5 (a centered phone column on desktop is a defect).

<a id="nfr-mf-2"></a>
**NFR-MF-2** (Ubiquitous, touch targets)
THE SYSTEM SHALL size every interactive target ≥ 24×24 CSS px (WCAG 2.2 AA floor), aiming for 44×44, and place primary actions within thumb-zone reach.

<a id="nfr-mf-3"></a>
**NFR-MF-3** (Ubiquitous, input font size)
THE SYSTEM SHALL set form inputs to a font size ≥ `--font-size-base` (16px) to prevent iOS auto-zoom on focus.

<a id="nfr-mf-4"></a>
**NFR-MF-4** (Optional, sticky CTA + safe-area)
WHERE a screen has a single primary action on mobile (e.g. the bet form's "Place bet"), THE SYSTEM SHALL present it as a sticky bottom CTA within the thumb zone, with `padding-bottom: calc(<space> + env(safe-area-inset-bottom))` and reserved scroll padding so it stays above the keyboard and never obscures the focused control (see NFR-A11Y-6).

<a id="nfr-mf-5"></a>
**NFR-MF-5** (Ubiquitous, responsive scale-up matrix)
THE SYSTEM SHALL define a concrete per-screen layout at the DS breakpoints — not merely a centered phone column on large screens:
- **base (0):** single-column stack; market detail as a mobile modal / bottom sheet; positions as stacked, wrapping rows (no horizontal scroll).
- **md/lg (≥769/≥992):** a **two-pane list+detail** (the mobile modal becomes an inline right pane), a **multi-column card grid** for the result list, and positions rendered as a **table**.
- **xl/2xl (≥1200/≥1366):** a capped `max-inline-size` (~65–75ch) on text blocks so content never runs full-bleed.

### 5.3 Accessibility — WCAG 2.2 AA floor

<a id="nfr-a11y-1"></a>
**NFR-A11Y-1** (Ubiquitous, contrast)
THE SYSTEM SHALL meet ≥ 4.5:1 contrast for body text and ≥ 3:1 for large text and UI components; the muted text floor is `#64748b` (slate-400 is prohibited for text).

<a id="nfr-a11y-2"></a>
**NFR-A11Y-2** (Ubiquitous, color not sole signal)
THE SYSTEM SHALL never use color as the only means of conveying information (SC 1.4.1) — outcomes, states, and the AI confidence bar always pair color with text/icon/shape.

<a id="nfr-a11y-3"></a>
**NFR-A11Y-3** (Ubiquitous, live regions)
THE SYSTEM SHALL announce dynamic updates via live regions — `role="status"`/`aria-live="polite"` for loading and toasts, `role="alert"` for errors.

<a id="nfr-a11y-4"></a>
**NFR-A11Y-4** (Ubiquitous, reduced motion)
THE SYSTEM SHALL honor `prefers-reduced-motion`, gating spring/decorative motion and reducing non-essential animation.

<a id="nfr-a11y-5"></a>
**NFR-A11Y-5** (Ubiquitous, keyboard operable)
THE SYSTEM SHALL make every interaction fully keyboard operable (search, card selection, outcome selection, bet submission, modal open/close with focus trap + Escape + focus return, Settings), with correct name/role/value on each control.

<a id="nfr-a11y-6"></a>
**NFR-A11Y-6** (Ubiquitous, focus never obscured)
THE SYSTEM SHALL ensure a focused control is never fully hidden behind sticky CTAs, the header, or toasts (WCAG SC 2.4.11 Focus Not Obscured (Minimum)), using `scroll-margin`/scroll-padding so a newly focused control scrolls clear of overlapping fixed UI.

<a id="nfr-a11y-7"></a>
**NFR-A11Y-7** (Ubiquitous, document structure)
THE SYSTEM SHALL provide a coherent heading outline (one `h1` plus section `h2`s), semantic landmarks (`header` / `main` / `search` / `region`), and a skip-link whose target is the real `<main>` element.

### 5.4 Theme

<a id="nfr-theme-1"></a>
**NFR-THEME-1** (Ubiquitous, light only)
THE SYSTEM SHALL ship the DS light palette only. It SHALL NOT define `@media (prefers-color-scheme: dark)` blocks, `[data-theme]` dark variants, or any invented dark tokens (D6).

### 5.5 Security

<a id="nfr-sec-1"></a>
**NFR-SEC-1** (Ubiquitous, user-supplied key only)
THE SYSTEM SHALL only ever use the user-supplied OpenRouter key from Settings (`localStorage`); no key is bundled in the build or committed to source (see AC8.4).

<a id="nfr-sec-2"></a>
**NFR-SEC-2** (Ubiquitous, disclaimer + hygiene)
THE SYSTEM SHALL show the "stored locally, sent directly to OpenRouter" disclaimer, keep the key out of URLs and logs, and send it only in the `Authorization` header of the OpenRouter request.

<a id="nfr-sec-3"></a>
**NFR-SEC-3** (Ubiquitous, no secrets for reads)
THE SYSTEM SHALL perform all Polymarket reads as public unauthenticated GETs — no API keys, secrets, or `.env` values are required or used for the real read path (D1).

<a id="nfr-sec-4"></a>
**NFR-SEC-4** (Ubiquitous, core-gated HTTP security headers)
THE SYSTEM SHALL serve a Content-Security-Policy plus companion HTTP security headers on the **core** widget as a **blocking core requirement** (not deploy/bonus scope), because the widget renders untrusted market/AI text and holds a live key. The CSP SHALL include: `default-src 'self'`; explicit `script-src 'self'` (build-time hash-based for Vite's inline module-preload, or a nonce-injecting Worker — delivery mechanism decided in plan §3); `style-src 'self' 'unsafe-inline'` (the proportional bars use `:style` width attributes, which cannot carry a nonce/hash); `img-src 'self' https://*.polymarket.com data:` (no `https:` wildcard); `connect-src 'self' https://gamma-api.polymarket.com https://openrouter.ai` (add `https://clob.polymarket.com` only if live pricing is later enabled); `font-src 'self'`; `object-src 'none'`; `base-uri 'none'`; `form-action 'none'`; `frame-src 'none'`; `frame-ancestors 'none'`; `upgrade-insecure-requests`; and `report-to`. THE SYSTEM SHALL additionally set `Referrer-Policy`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`, and `Strict-Transport-Security`. The header verifier SHALL assert the headers are present AND that the page still boots.

### 5.6 Services & resilience

<a id="nfr-svc-1"></a>
**NFR-SVC-1** (Ubiquitous, service encapsulation)
THE SYSTEM SHALL route all browser I/O (`fetch`) through the service layer (`http.ts`, `polymarket.service.ts`, `betting.service.ts`, `openrouter.service.ts`); components and stores SHALL NOT call `fetch` directly.

<a id="nfr-svc-2"></a>
**NFR-SVC-2** (Unwanted-behavior, CORS contingency)
IF a network returns a CORS/opaque failure from Gamma, THEN the widget SHALL be operable via a Vite dev proxy without any change to the service-layer call sites.

<a id="nfr-svc-3"></a>
**NFR-SVC-3** (Ubiquitous, betting behind interface)
THE SYSTEM SHALL keep betting behind the `BettingService` interface with `MockBettingService` as the only implementation shipped, sharing the same signature a future real (CLOB) implementation would use (D2).

### 5.7 Testing

<a id="nfr-test-1"></a>
**NFR-TEST-1** (Ubiquitous, unit coverage)
THE SYSTEM SHALL cover with Vitest unit tests at minimum: market normalization + whole-payload/envelope validation (AC1.*), bet cost/payout math + finite guards (AC5.2–AC5.3), position persistence + per-item recovery (AC6.*), the AI parse/validate ladder (AC7.5–AC7.6, AC7.10), and the Intl formatters (NFR-INTL-1). The component/a11y tier is specified separately in NFR-TEST-3.

<a id="nfr-test-2"></a>
**NFR-TEST-2** (Ubiquitous, E2E)
THE SYSTEM SHALL include one Playwright E2E covering the primary flow: search a market → open detail → select outcome → place a simulated bet → see the position.

<a id="nfr-test-3"></a>
**NFR-TEST-3** (Ubiquitous, component + a11y + coverage tier)
THE SYSTEM SHALL add a component/integration test tier (`@vue/test-utils` / Testing Library) covering the loading/empty/error/focus/disabled/no-key-CTA state ACs currently delegated to manual QA, SHALL mock all network with **MSW** (no live Gamma/OpenRouter in unit or component tests), SHALL enforce a `vitest --coverage` threshold, and SHALL run automated **axe** accessibility assertions (vitest-axe and/or Playwright-axe).

### 5.8 Global error handling, formatting & platform hygiene

<a id="nfr-err-1"></a>
**NFR-ERR-1** (Ubiquitous, global error handling)
THE SYSTEM SHALL register `app.config.errorHandler` in `main.ts` — routing uncaught render/lifecycle/watcher errors to `logEvent` as a last-resort capture — and SHALL provide an `onErrorCaptured` error boundary (`SJErrorBoundary` or in `App.vue`) so a single failing card/panel degrades gracefully instead of white-screening the SPA.

<a id="nfr-intl-1"></a>
**NFR-INTL-1** (Ubiquitous, deterministic formatting)
THE SYSTEM SHALL format all percentages, currency (volume/liquidity/cost/payout), and dates (`endDate`) through a single `utils/format.ts` using pinned-locale `Intl.NumberFormat` / `Intl.DateTimeFormat`, so rendering is deterministic across environments (no `62%`/`62.0%` drift, no locale-dependent `toLocaleString` test flakiness).

<a id="nfr-env-1"></a>
**NFR-ENV-1** (Ubiquitous, env + TypeScript strictness)
THE SYSTEM SHALL enable `strict: true`, `noUncheckedIndexedAccess`, and `noImplicitAny` in `tsconfig` (forcing positional-alignment / short-array handling); commit a `.env.example`; augment `ImportMetaEnv` in `vite-env.d.ts`; and validate in `config.ts` that `VITE_BET_MODE ∈ {mock,real}` and `VITE_AI_MODE ∈ {user-key,proxy}`, rejecting an `http://` base URL (HTTPS-only).

---

## 6. Out of scope

The following are explicitly **not** built in this feature:

- **Real on-chain order placement** (CLOB `POST /order`, EIP-712 signing, L1/L2 HMAC auth, USDC allowances). Betting is mock-only.
- **Wallet integration** (MetaMask/WalletConnect, funded Polygon wallet).
- **VPN / geoblock bypass** — the deliverable is not designed around circumventing Polymarket's geo-restrictions (ToS §2.1.4); only global read endpoints and mock bets are used.
- **Dark mode** — the DS ships no dark palette (D6).
- **Real-time live CLOB pricing** (`/book`, `/price`, `/prices-history` live quoting and price charts) — deferred enhancement; MVP uses Gamma `outcomePrices` snapshots (D3).
- **Server-side AI proxy** (Approach C) — documented as the production path but not implemented; the challenge uses the user-supplied-key approach (D4).
- **Auth/accounts, multi-user, or backend persistence** — state is local (`localStorage` + Pinia).
- **Phase 2 server routes** — the `/api/*` Worker routes (OpenRouter proxy, real CLOB betting adapter) and the `real` betting path are **designed but not implemented** now; built only on explicit request. Deployment ships the static SPA (Phase 1) with `mock` betting and the user-supplied AI key. *(When the OpenRouter proxy route is later built, it MUST carry abuse controls — rate-limit/Turnstile, request size cap, host allowlist against SSRF, and a bounded prompt — per audit C18; these are noted here as a forward requirement, not implemented now.)*

---

## 7. Traceability

### 7.1 Service contracts (from the analysis doc §5)

| Requirement(s) | Service / contract |
|---|---|
| AC2.*, AC3.*, AC4.* | `polymarket.service.ts` — `searchMarkets(q)` (Gamma `/public-search`), `getMarkets(filters)` (`/markets`), `getMarket(idOrSlug)`; `normalizeMarket(raw: unknown)` parses AND schema-validates the whole payload + response envelope (AC1.4). |
| NFR-SEC-4, NFR-ERR-1, NFR-INTL-1, NFR-ENV-1 | Core-gated CSP + security headers (delivered via `dist/_headers` or a nonce Worker — see plan §3 & `docs/deployment-cloudflare.md`); `main.ts` `app.config.errorHandler` + `SJErrorBoundary`; `utils/format.ts` Intl formatters; `config.ts` + `vite-env.d.ts` env validation. |
| NFR-TEST-3 | `@vue/test-utils`/Testing Library component tier + **MSW** network mocks + `vitest --coverage` threshold + **axe** assertions. |
| AC1.* | `models/market.ts` — normalized `Market { id, question, slug, outcomes[], prices[], tokenIds[], volume, liquidity, endDate, image, active, closed }`. |
| AC5.*, AC6.* | `betting.service.ts` — `interface BettingService { placeBet(o: BetOrder): Promise<BetReceipt> }`, `MockBettingService`; `models/bet.ts` — `BetOrder`, `BetReceipt`, `Position`; persisted via `stores/bets.store.ts` (localStorage). |
| AC7.*, AC8.* | `openrouter.service.ts` — `pickFreeModel(apiKey)`, `predict(market, apiKey)` with the parse ladder + validation; `models/prediction.ts` — `AiPrediction { recommendedOutcome, confidence, rationale }`; key in `stores/settings.store.ts`. |
| NFR-SVC-1, NFR-SVC-2 | `http.ts` — fetch wrapper (base URL, timeout, error normalization, retry); Vite dev proxy as CORS fallback. |
| AC9.* | **Deployment** — Cloudflare Workers Static Assets (`wrangler.jsonc`: `assets.directory` + `not_found_handling: "single-page-application"`, later `run_worker_first: ["/api/*"]`); GitHub Actions `wrangler deploy` on merge to `main`; env switches `VITE_BET_MODE` (`mock`/`real`) and `VITE_AI_MODE` (`user-key`/`proxy`); Worker secrets via `wrangler secret put`. Full detail in [`docs/deployment-cloudflare.md`](../../docs/deployment-cloudflare.md). |

### 7.2 Folder architecture (from the analysis doc §4)

Stores (`markets.store.ts`, `bets.store.ts`, `settings.store.ts`), composables (`useMarketSearch.ts` — debounce + loading/empty/error, `useAiPrediction.ts`), UI primitives (`components/ui/`: `SJButton`, `SJInput`, `SJCard`, `SJBadge`, `SJModal`, `SJSpinner`, `SJSkeleton`, `SJLiveRegion`, `SJErrorBoundary`), app widgets (`components/widget/`: `WMarketSearch`, `WMarketList`, `WMarketCard`, `WMarketDetail`, `WBetForm`, `WBetReceipt`, `WPositions`, `WAiPrediction`, `WSettings`), and `utils/format.ts` (Intl formatters, NFR-INTL-1) implement the requirements above; `styles/base.css` carries the minimal reset, self-hosted fonts, and `.sr-only`/`.focus-ring`/`.skip-link` utilities.

### 7.3 UX mapping (from the analysis doc §6)

Header + Settings entry (US8) → Search bar `WMarketSearch` (US2) → Results `WMarketList`/`WMarketCard` (US3) → Detail `WMarketDetail` (US4) → `WBetForm` + `WBetReceipt` (US5) → `WPositions` (US6) → `WAiPrediction` opt-in inside detail (US7).
