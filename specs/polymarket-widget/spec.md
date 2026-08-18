# Spec — Polymarket Widget

> Status: **draft** · Feature: `polymarket-widget` · Single-page Vue 3 + TypeScript widget
> Source of truth: [`docs/analysis-and-architecture.md`](../../docs/analysis-and-architecture.md) (decisions D1–D12)
> Research: [Polymarket API](../../docs/research-polymarket-api.md) · [Polymarket product/embeds](../../docs/research-polymarket-product.md) · [Polymarket SDKs/builder](../../docs/research-polymarket-sdks-builder.md) · [OpenRouter AI](../../docs/research-openrouter-ai.md) · [RamosLabs DS](../../docs/research-ramoslabs-ds.md)

---

## 1. Overview / Intent

### 1.1 What this is

A **single-page, custom Polymarket-style SPA** (D10 — not the official read-only embed, not a blind reconstruction) that lets a user **search Polymarket prediction markets**, **browse** a default list, **open a market** to see its outcomes and prices, **place a builder-aware simulated bet** (mock by default, showing the real builder/platform fee breakdown — D11), **track positions**, and optionally request an **AI-assisted suggestion for choosing a market and an outcome**. A real CLOB order path lives behind the same `BettingService` interface as an opt-in, gated stretch capability (D12). All browser I/O (`fetch`) is encapsulated behind a **service layer**; all UI/UX is built exclusively from the **RamosLabs Design System** tokens and documented patterns.

### 1.2 Scope

Everything lives on **one page** (`App.vue`) with a vertical, mobile-first layout: header + settings entry, search bar, results list, market detail (modal/panel), bet form + receipt, positions list, and an opt-in AI prediction panel inside the detail.

### 1.3 Confirmed decisions (the spec is built on these)

| Ref   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1    | **Market reads are REAL** via Polymarket Gamma API (`https://gamma-api.polymarket.com`) — public, no auth, CORS `*`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D2    | **Betting is MOCK by default** behind a `BettingService` interface. The reason to mock is **operational, not technical** (corrected): charging a builder fee / attributing volume needs only the `bytes32` `builder` field on the user-signed order — **no backend, no builder secret**. The demo mocks because of **geoblock by IP on `POST /order` (33 countries, incl. US/UK), a ToS ban on VPN circumvention, and the need for a funded USDC wallet + approvals**. The brief confirms a VPN may be required even for reads. The deliverable is a GitHub repo, not a funded real-bet demo. |
| D3    | **Prices are Gamma snapshots** (`outcomePrices`) for the MVP. Live CLOB `/price` quoting is a deferred enhancement, not built now.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D4    | **AI is opt-in** via OpenRouter free models; the API key is **user-supplied** in Settings and stored in `localStorage`. No key is ever bundled.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D5    | AI model is **discovered at runtime** with a preference/fallback chain (`z-ai/glm-5.2:free` → `nvidia/nemotron-3-ultra-550b-a55b:free` → `openai/gpt-oss-20b:free` → `openrouter/free`).                                                                                                                                                                                                                                                                                                                                                                                                      |
| D6    | **Light theme only.** The DS ships no dark mode; no dark tokens are invented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D7–D8 | **Custom components only**, `SJ`/`W` naming, **token-only**, and they MUST follow **all** DS guidelines (not just tokens).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D9    | **Mobile-first under the DS's own conditions**: base = 0, five `min-width` breakpoints, thumb-zone ergonomics, touch ≥24×24 (aim 44×44), inputs ≥16px.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D10   | **"Widget" = custom Polymarket-style SPA** (this build); the **official read-only embed is rejected** (display-only iframe: no in-frame betting, single-market only, no builder-volume attribution), and it is **not a blind reconstruction**. Reads are real via Gamma.                                                                                                                                                                                                                                                                                                                      |
| D11   | **Mock bet is genuinely "builder-aware"**: the `BettingService` carries the configurable **builderCode (`bytes32`)** and shows the **real fee breakdown** — notional, platform fee, and **additive** builder fee (taker ≤100 bps / maker ≤50 bps), via `fee = notional × bps / 10000` — surfaced **before confirmation** (builder obligation: disclose total cost before signing).                                                                                                                                                                                                            |
| D12   | **A real CLOB order path is implemented behind the same `BettingService` interface as an opt-in, gated stretch capability.** It uses `@polymarket/client` (V2 TS SDK) with a browser **viem** signer, signs L1 (`ClobAuth`) + V2 Order struct with the `builder` field, derives the user's L2 creds, and `POST /order`s to the CLOB **with no backend** for attribution. It exists in code (swappable) but is **gated behind a flag/config** and **never runs in the demo** (geoblock, funded wallet + approvals, possible Verified tier).                                                    |
| Stack | Vue 3 (`<script setup>`, Composition API) + Vite + **TypeScript** + Pinia + `@ramoslabs/tokens`. Testing: **Vitest unit + 1 Playwright E2E** (search → bet).                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### 1.4 Glossary

- **Market** — a Polymarket question with a set of mutually exclusive **outcomes** (e.g. `["Yes","No"]`), each carrying an **outcomePrice** in `[0,1]` interpreted as an implied probability.
- **Position** — a simulated bet the user has placed, persisted locally.
- **Snapshot price** — the `outcomePrices` value returned by Gamma at fetch time (not a live CLOB quote).
- **builderCode** — a `bytes32` identifier of a Polymarket builder account, carried in the `builder` field of a signed V2 order to attribute volume/fees. Public (not a secret); configurable here with a placeholder default.
- **Builder fee** — a flat % of notional a builder may charge (taker ≤100 bps, maker ≤50 bps), **additive** to the platform fee; `fee = notional × bps / 10000`.
- **Notional** — the bet's cost basis (size × price) on which fees are computed.

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

### Capability D — Place a bet (simulated, builder-aware)

- **US5** — As a user, I want to place a simulated bet on a chosen outcome with a chosen amount and see the cost, the real builder/platform **fee breakdown**, and the potential payout, so I can experience a builder-aware betting flow without real funds. The receipt records the builderCode that a real order would carry.

### Capability E — View positions

- **US6** — As a user, I want to see my placed (simulated) positions persisted across reloads, so I can track what I have "bet" on.

### Capability F — AI-assisted suggestions (bonus)

- **US7** — As a user with an OpenRouter key, I want an on-demand AI suggestion for a market (recommended outcome + confidence + rationale), so I can get a data-grounded second opinion on **which outcome** to pick.
- **US9** — As a user with an OpenRouter key, I want an on-demand AI suggestion over the current market list/search results recommending **which market** is most attractive (recommended market + confidence + rationale), so the AI assists in _choosing a market_ as well as an outcome (per the brief: "assist in choosing a market and outcome").

### Capability G — Settings (AI key)

- **US8** — As a user, I want to enter and manage my OpenRouter API key in Settings, so the optional AI feature can be enabled or disabled by me.

### Capability H — Real order path (opt-in, gated stretch)

- **US10** — As an advanced/opt-in user, I want a real CLOB order path implemented behind the same `BettingService` interface (builder-code attribution, browser wallet signing, no backend) that is **disabled by default and gated by config**, so the widget demonstrates a real path without ever submitting a real order in the demo.

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
**AC1.4** (Unwanted-behavior, error)
IF any of `outcomes`, `outcomePrices`, or `clobTokenIds` is missing, is not valid JSON, or parses to arrays of unequal length, THEN THE SYSTEM SHALL treat that market as malformed and exclude it from rendering rather than throwing an unhandled error that breaks the list.

<a id="ac1-5"></a>
**AC1.5** (Unwanted-behavior, edge)
IF a parsed price is non-numeric or falls outside `[0,1]`, THEN THE SYSTEM SHALL clamp it to `[0,1]` for display and flag the market's pricing as unreliable (never render `NaN`).

---

### US2 — Search markets

<a id="ac2-1"></a>
**AC2.1** (Event-driven, happy)
WHEN the user types a query and the input settles after the debounce interval, THE SYSTEM SHALL request matching markets from the search service and render the results as a list of market cards.

<a id="ac2-2"></a>
**AC2.2** (Event-driven, debounce)
WHEN the user types multiple characters in rapid succession, THE SYSTEM SHALL debounce input (≈300 ms) and issue at most one search request for the final settled value, cancelling or ignoring superseded in-flight requests.

<a id="ac2-3"></a>
**AC2.3** (State-driven, loading)
WHILE a search request is in flight, THE SYSTEM SHALL display a loading indicator and announce the loading state via a polite live region.

<a id="ac2-4"></a>
**AC2.4** (State-driven, empty)
WHILE a search has completed with zero matching markets, THE SYSTEM SHALL display an explicit empty state (distinct from the loading and error states) telling the user no markets matched.

<a id="ac2-5"></a>
**AC2.5** (Unwanted-behavior, error)
IF the search request fails (network error, non-2xx, or timeout), THEN THE SYSTEM SHALL display an error state with a retry affordance and announce it via an assertive live region, without discarding the previous results silently.

<a id="ac2-6"></a>
**AC2.6** (State-driven, cleared input)
WHILE the search input is empty, THE SYSTEM SHALL show the default browse list (US3) rather than an empty-results message.

> **Note — graceful degradation to fixtures is the sanctioned failure mode for reads (implementation reconciliation).** In the shipped build, when a read (search or browse) fails — network, CORS, geoblock, or 5xx — `markets.store` **degrades gracefully to the bundled sample fixtures** and flags `usingFallback` so the UI shows a discreet "sample data" notice, rather than surfacing a dead-end error. This is an **accepted, deliberate behavior**: because Gamma reads can be geoblocked by IP (the brief notes a VPN may be needed even for reads), the demo must stay usable offline/blocked. The explicit **error + retry** path of **AC2.5 / AC3.4** therefore remains a **secondary path** — it is still implemented (`retry()` re-runs the active view), and is exercisable via a demo override that disables the fixture fallback. Both are conformant: the error-state ACs describe the contract when fallback is off; fixture degradation is the default resilience posture when it is on.

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
IF the default list request fails, THEN THE SYSTEM SHALL display an error state with a retry affordance. (See the US2 note: by default the shipped build degrades to sample fixtures as the sanctioned failure mode; this error + retry path is the secondary path, exercisable via a demo override.)

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

---

### US5 — Place a bet (simulated)

<a id="ac5-1"></a>
**AC5.1** (Complex, happy)
WHILE an outcome is selected and a valid amount is entered, WHEN the user submits the bet, THE SYSTEM SHALL call `BettingService.placeBet`, produce a simulated filled receipt `{ status:'filled', avgPrice, shares, cost, fees, builderCode, txHash }`, and add the resulting position to the persisted positions store.

<a id="ac5-2"></a>
**AC5.2** (Ubiquitous, cost math)
THE SYSTEM SHALL compute bet **cost = size × price** (using the selected outcome's snapshot price) and display it live as the amount changes.

<a id="ac5-3"></a>
**AC5.3** (Ubiquitous, payout math)
THE SYSTEM SHALL compute **shares = size / price** and **potential payout = shares × $1.00** (each share resolves to $1 on a winning outcome) and display the potential payout live.

<a id="ac5-4"></a>
**AC5.4** (Unwanted-behavior, invalid amount)
IF the entered amount is missing, non-numeric, ≤ 0, or exceeds the input's allowed maximum, THEN THE SYSTEM SHALL block submission, keep the button disabled/inert, and show a specific inline error tied to the field (styled via `:user-invalid`), never a placeholder-as-error.

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
**AC5.8** (Ubiquitous, fee breakdown)
THE SYSTEM SHALL compute and display, **before the user confirms the bet**, a fee breakdown consisting of the **notional** (= cost), the **platform fee**, and the **additive builder fee**, where each fee is computed as `fee = notional × bps / 10000` and the builder rate is `builderTakerBps` (≤ 100) or `builderMakerBps` (≤ 50) per the order side, plus the resulting **total cost** (notional + platform fee + builder fee). Builder and platform fees are additive; a zero platform fee SHALL NOT suppress a configured builder fee.

<a id="ac5-9"></a>
**AC5.9** (Ubiquitous, builderCode in receipt)
THE SYSTEM SHALL include the configured **builderCode (`bytes32`)** and the computed fee breakdown in the bet receipt and the persisted position, reflecting the `builder` field a real signed order would carry. The builderCode SHALL be sourced from configuration (env/settings) with a placeholder default and SHALL NEVER be a real hardcoded value committed to source.

---

### US6 — View positions

<a id="ac6-1"></a>
**AC6.1** (Ubiquitous, persistence)
THE SYSTEM SHALL persist positions in `localStorage` and restore them on load so they survive a page reload.

<a id="ac6-2"></a>
**AC6.2** (Ubiquitous, content)
THE SYSTEM SHALL display each position with its market question, chosen outcome, size, price, cost, shares, potential payout, the builder/platform fee breakdown, and the builderCode recorded on the receipt.

<a id="ac6-3"></a>
**AC6.3** (State-driven, empty)
WHILE no positions exist, THE SYSTEM SHALL show a first-run empty state that explains no bets have been placed yet (onboarding tone), distinct from an error.

<a id="ac6-4"></a>
**AC6.4** (Unwanted-behavior, corrupt storage)
IF the persisted positions payload is missing or fails to parse, THEN THE SYSTEM SHALL recover to an empty positions list without crashing the app.

---

### US7 — AI-assisted prediction (bonus)

<a id="ac7-1"></a>
**AC7.1** (Optional, gated on key)
WHERE a valid OpenRouter API key is present in settings, THE SYSTEM SHALL enable the "AI suggestion" action inside the market detail.

<a id="ac7-2"></a>
**AC7.2** (Complex, no-key CTA)
WHILE no OpenRouter key is configured, WHEN the user looks for the AI feature, THE SYSTEM SHALL disable/hide the AI action and present a CTA linking to Settings (US8) rather than calling the API.

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
**AC7.9** (Unwanted-behavior, error/retry)
IF the AI request fails, is rate-limited, or the response fails validation after the retry, THEN THE SYSTEM SHALL show an error state with a retry affordance and MUST NOT surface a partial/unvalidated prediction as if it were valid.

<a id="ac7-10"></a>
**AC7.10** (Unwanted-behavior, verbatim outcome)
IF `recommendedOutcome` does not match any provided outcome label after the single retry, THEN THE SYSTEM SHALL treat the prediction as invalid (per AC7.9) rather than displaying a fabricated or coerced outcome.

---

### US9 — AI-assisted market pick (bonus)

> This capability assists the user in _choosing a market_ (over the current list/search results), complementing US7's outcome pick — together they satisfy the brief's "assist in choosing a market and outcome". It reuses the model-discovery and structured-output ladder defined for US7 (AC7.4–AC7.5).

<a id="ac9-1"></a>
**AC9.1** (Optional, gated on key)
WHERE a valid OpenRouter API key is present in settings, THE SYSTEM SHALL enable an "AI: pick a market" action over the current market list / search results; WHILE no key is configured, THE SYSTEM SHALL disable/hide it and present the same Settings CTA as AC7.2 rather than calling the API.

<a id="ac9-2"></a>
**AC9.2** (Event-driven, on-demand only)
WHEN — and only when — the user explicitly activates the "AI: pick a market" action, THE SYSTEM SHALL send exactly one recommendation request over the currently visible markets; THE SYSTEM SHALL NOT call the AI automatically on load, search, scroll, or selection (respecting the free tier's 20 req/min cap).

<a id="ac9-3"></a>
**AC9.3** (Ubiquitous, output validation)
THE SYSTEM SHALL validate the parsed recommendation: `recommendedMarketId` MUST be one of the IDs of the markets currently presented to the model, and `confidence` MUST be clamped to `[0,1]`; `rationale` length is capped for display.

<a id="ac9-4"></a>
**AC9.4** (State-driven, loading)
WHILE a market-pick request is in flight, THE SYSTEM SHALL show a loading state and announce it via a polite live region.

<a id="ac9-5"></a>
**AC9.5** (Ubiquitous, render + confidence signal)
THE SYSTEM SHALL render the result by identifying the recommended market (e.g. highlighting its card and/or naming its question), a confidence signal pairing color with a numeric label (never color alone), and the rationale text, alongside a "not financial advice" disclaimer.

<a id="ac9-6"></a>
**AC9.6** (Unwanted-behavior, error/invalid)
IF the request fails, is rate-limited, or `recommendedMarketId` does not match any presented market after the single retry, THEN THE SYSTEM SHALL show an error state with a retry affordance and MUST NOT surface a fabricated or unvalidated market recommendation as if it were valid.

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
THE SYSTEM SHALL display a security disclaimer in Settings stating the key is stored locally in the browser and sent directly to OpenRouter, and SHALL NOT log the key or place it in any URL.

<a id="ac8-4"></a>
**AC8.4** (Ubiquitous, no bundled key)
THE SYSTEM SHALL never ship, embed, or fall back to a built-in/bundled API key; the only key ever used is the user-supplied one.

<a id="ac8-5"></a>
**AC8.5** (State-driven, form conventions)
WHILE the Settings form is shown, THE SYSTEM SHALL use a persistent visible `<label>` for the key field (never placeholder-as-label), native input semantics, and expose the key field so a value can be entered on touch without iOS zoom (font-size ≥ `--font-size-base`/16px).

---

### US10 — Real order path (opt-in, gated stretch)

> A real CLOB order path implemented behind the **same** `BettingService` interface as the mock. It exists in code to demonstrate the real flow but is disabled by default; it MUST NOT submit a real order in the demo. See D12.

<a id="ac10-1"></a>
**AC10.1** (Ubiquitous, same interface)
THE SYSTEM SHALL implement the real order path (`ClobBettingService`) behind the **same** `BettingService` interface as `MockBettingService`, sharing the `placeBet(o: BetOrder): Promise<BetReceipt>` signature and the same fee-breakdown computation, so the two are swappable at a single wiring point.

<a id="ac10-2"></a>
**AC10.2** (Optional, config-gated, disabled by default)
WHERE — and only where — an explicit build/runtime config flag opts into the real path, THE SYSTEM SHALL wire `ClobBettingService`; by default (flag absent) THE SYSTEM SHALL use `MockBettingService`, and no real order path SHALL be reachable in the demo.

<a id="ac10-3"></a>
**AC10.3** (Ubiquitous, browser-only signing, no backend)
WHERE the real path is enabled, THE SYSTEM SHALL sign the L1 `ClobAuth` and the V2 Order struct (including the `builder` = configured builderCode field) with a browser wallet signer (viem via `window.ethereum`/WalletConnect), derive the user's L2 credentials, and `POST /order` to the CLOB directly, using **no backend** for builder-code attribution and never transmitting a builder secret from the client.

<a id="ac10-4"></a>
**AC10.4** (Ubiquitous, gating disclosure)
THE SYSTEM SHALL document, and surface where the real path is enabled, that real submission is blocked by **geoblock (33 countries, incl. US/UK) checked on every `POST /order`**, requires a **funded USDC wallet with ERC-20/1155 approvals**, and may require a **Verified builder tier** — and that VPN/geoblock circumvention is out of scope (ToS-prohibited).

<a id="ac10-5"></a>
**AC10.5** (Unwanted-behavior, disclose before sign)
IF the real path is enabled and an order is about to be signed, THEN THE SYSTEM SHALL present the full fee breakdown (builder + platform, per AC5.8) **before** requesting the signature, honoring the builder obligation to disclose total cost prior to signing.

---

## 4. Acceptance criteria (Given / When / Then summary)

> These restate the testable core of each story in Given/When/Then form; the authoritative, atomic criteria are the EARS ACs in §3.

- **US1 — Normalization.** Given a Gamma market with JSON-encoded string arrays, When it is normalized, Then `outcomes`/`prices`/`tokenIds` are aligned typed arrays and a malformed market is excluded (AC1.1–AC1.5).
- **US2 — Search.** Given text in the search box, When input settles after debounce, Then at most one request runs and results/empty/loading/error states render correctly (AC2.1–AC2.6).
- **US3 — Browse.** Given a fresh load with no query, When the page mounts, Then top-by-volume active markets render with skeletons while loading and an explicit empty/error state otherwise (AC3.1–AC3.5).
- **US4 — Detail.** Given a market card, When selected, Then the detail opens with outcomes signalled by triad+text, selection drives the bet form, and focus returns on close (AC4.1–AC4.5).
- **US5 — Bet (builder-aware).** Given a selected outcome and a valid amount, When the user submits, Then cost = size×price and payout = (size/price)×$1 are shown live, the additive builder/platform fee breakdown (`fee = notional × bps / 10000`) is shown before confirmation, a simulated receipt carrying the fees + builderCode is produced, the position persists, and invalid input/no-outcome/service-failure are blocked with specific feedback (AC5.1–AC5.9).
- **US6 — Positions.** Given placed bets, When the page reloads, Then positions restore from `localStorage` with their fee breakdown + builderCode; an empty first-run state shows when none exist; corrupt storage recovers to empty (AC6.1–AC6.4).
- **US7 — AI outcome pick.** Given a configured key, When the user explicitly requests an outcome suggestion, Then exactly one request runs, the model is discovered at runtime, output is parsed via the ladder and validated (`recommendedOutcome` ∈ outcomes, confidence clamped), rendered with a numeric confidence signal + disclaimer, and failures show retry without surfacing invalid results (AC7.1–AC7.10).
- **US9 — AI market pick.** Given a configured key, When the user explicitly requests a market recommendation over the visible list, Then exactly one request runs, output is validated (`recommendedMarketId` ∈ presented markets, confidence clamped), the recommended market is identified with a numeric confidence signal + disclaimer, and failures/invalid results show retry without fabrication (AC9.1–AC9.6).
- **US8 — Settings.** Given the Settings form, When the user saves/clears a key, Then it is persisted/removed in `localStorage`, the AI feature toggles accordingly, the disclaimer shows, no key is ever bundled, and the field follows DS form conventions (AC8.1–AC8.5).
- **US10 — Real order path (opt-in, gated).** Given the same `BettingService` interface, When the config flag opts in, Then `ClobBettingService` signs L1+Order (with the `builder` field) via a browser wallet and `POST /order`s with no backend; by default it is disabled and the mock is used; gating (geoblock, funded wallet, Verified tier) is disclosed, and the fee breakdown is shown before signing (AC10.1–AC10.5).

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
**NFR-MF-1** (Ubiquitous, base=0 + breakpoints)
THE SYSTEM SHALL author base styles for mobile (base = 0) and layer enhancements only at the DS's five `min-width` breakpoints — `sm:576`, `md:769`, `lg:992`, `xl:1200`, `2xl:1366` (px). No `xs`, no max-width-first media queries.

<a id="nfr-mf-2"></a>
**NFR-MF-2** (Ubiquitous, touch targets)
THE SYSTEM SHALL size every interactive target ≥ 24×24 CSS px (WCAG 2.2 AA floor), aiming for 44×44, and place primary actions within thumb-zone reach.

<a id="nfr-mf-3"></a>
**NFR-MF-3** (Ubiquitous, input font size)
THE SYSTEM SHALL set form inputs to a font size ≥ `--font-size-base` (16px) to prevent iOS auto-zoom on focus.

<a id="nfr-mf-4"></a>
**NFR-MF-4** (Optional, sticky CTA)
WHERE a screen has a single primary action on mobile (e.g. the bet form's "Place bet"), THE SYSTEM SHALL present it as a sticky bottom CTA within the thumb zone.

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
**NFR-SEC-4** (Ubiquitous, builderCode configurable, not hardcoded)
THE SYSTEM SHALL treat the **builderCode (`bytes32`)** as configuration (env/settings) with a placeholder default; it is **not a security secret** (it travels publicly inside the signed order) but it MUST be replaceable and MUST NEVER be committed as a real value in source. No builder **secret** (the builder API key used for gasless relayer/wallet creation) is ever present in the client (D11, D12).

<a id="nfr-sec-5"></a>
**NFR-SEC-5** (Ubiquitous, geoblock + ToS disclaimer)
THE SYSTEM SHALL disclose that real order submission is subject to Polymarket's **geoblock by IP** (33 countries incl. US/UK, checked on every `POST /order`) and requires a funded wallet, and that the widget does **not** circumvent geo-restrictions (VPN bypass is ToS-prohibited and out of scope). The default (mock) flow performs no order submission.

### 5.6 Services & resilience

<a id="nfr-svc-1"></a>
**NFR-SVC-1** (Ubiquitous, service encapsulation)
THE SYSTEM SHALL route all browser I/O (`fetch`) through the service layer (`http.ts`, `polymarket.service.ts`, `betting.service.ts`, `openrouter.service.ts`); components and stores SHALL NOT call `fetch` directly.

<a id="nfr-svc-2"></a>
**NFR-SVC-2** (Unwanted-behavior, CORS contingency)
IF a network returns a CORS/opaque failure from Gamma, THEN the widget SHALL be operable via a Vite dev proxy without any change to the service-layer call sites.

<a id="nfr-svc-3"></a>
**NFR-SVC-3** (Ubiquitous, betting behind one interface, mock and real)
THE SYSTEM SHALL keep betting behind the `BettingService` interface, with **`MockBettingService` as the default and only implementation active in the demo** and `ClobBettingService` (the real CLOB path) implemented behind the **same** signature and selected only via explicit config (D11, D12, US10). Components and stores SHALL depend on the interface, never on a concrete implementation, so the two are swappable at a single wiring point.

### 5.7 Testing

<a id="nfr-test-1"></a>
**NFR-TEST-1** (Ubiquitous, unit coverage)
THE SYSTEM SHALL cover with Vitest unit tests at minimum: market normalization (AC1._), bet cost/payout math (AC5.2–AC5.3), the additive builder/platform fee breakdown math (AC5.8, `fee = notional × bps / 10000`), position persistence (AC6._), and the AI parse/validate ladder for both outcome and market picks (AC7.5–AC7.6, AC7.10, AC9.3, AC9.6).

<a id="nfr-test-2"></a>
**NFR-TEST-2** (Ubiquitous, E2E)
THE SYSTEM SHALL include one Playwright E2E covering the primary flow: search a market → open detail → select outcome → place a simulated bet → see the position.

---

## 6. Out of scope

The following are explicitly **not** run/built in this feature's default demo:

- **Real on-chain order placement as the default flow** — betting is **mock by default**. NOTE (changed): the real CLOB path (`ClobBettingService`: `POST /order`, EIP-712 L1 `ClobAuth` + V2 Order signing, browser wallet, `builder`-field attribution) **is implemented behind the same interface as an opt-in, config-gated stretch** (US10, D12) — it is **not executed in the demo**, not "not built".
- **Funding a wallet, USDC/pUSD balances, and ERC-20/1155 approvals** — required only for the opt-in real path; never part of the default demo. The demo assumes no funded wallet.
- **Gasless relayer / builder-secret backend** — the builder API secret (relayer, Safe/Deposit-wallet creation) stays out of the client; no backend is built. Attribution needs only the public `builder` field.
- **VPN / geoblock bypass** — the deliverable is not designed around circumventing Polymarket's geo-restrictions (ToS-prohibited); the brief notes a VPN may be needed even for reads, but the widget itself never bypasses geoblock. Only global read endpoints and mock bets run by default.
- **Dark mode** — the DS ships no dark palette (D6).
- **Real-time live CLOB pricing** (`/book`, `/price`, `/prices-history` live quoting and price charts) — deferred enhancement; MVP uses Gamma `outcomePrices` snapshots (D3).
- **Server-side AI proxy** (Approach C) — documented as the production path but not implemented; the challenge uses the user-supplied-key approach (D4).
- **Auth/accounts, multi-user, or backend persistence** — state is local (`localStorage` + Pinia).

---

## 7. Traceability

### 7.1 Service contracts (from the analysis doc §5)

| Requirement(s)       | Service / contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC2._, AC3._, AC4.*  | `polymarket.service.ts` — `searchMarkets(q)` (Gamma `/public-search`), `getMarkets(filters)` (`/markets`), `getMarket(idOrSlug)`; `normalizeMarket(raw)` performs AC1.* parsing.                                                                                                                                                                                                                                                                                                                                                                                   |
| AC1.*                | `models/market.ts` — normalized `Market { id, question, slug, outcomes[], prices[], tokenIds[], volume, liquidity, endDate, image, active, closed }`.                                                                                                                                                                                                                                                                                                                                                                                                              |
| AC5._, AC6._, AC10.* | `betting.service.ts` — `interface BettingService { placeBet(o: BetOrder): Promise<BetReceipt> }`; `MockBettingService` (default, builder-aware) + `ClobBettingService` (opt-in, config-gated, `@polymarket/client` + viem signer) behind the same interface; shared `computeFees(notional, builderConfig)` (additive builder/platform, `notional×bps/10000`); `models/bet.ts` — `BetOrder`, `BetReceipt { …, fees, builderCode }`, `FeeBreakdown`, `Position`; builderCode from config (placeholder default); persisted via `stores/bets.store.ts` (localStorage). |
| AC7._, AC9._, AC8.*  | `openrouter.service.ts` — `pickFreeModel(apiKey)`, `predictOutcome(market, apiKey)` and `recommendMarket(markets, apiKey)` with the shared parse ladder + validation; `models/prediction.ts` — `AiPrediction { recommendedOutcome, confidence, rationale }`, `AiMarketPick { recommendedMarketId, confidence, rationale }`; key in `stores/settings.store.ts`.                                                                                                                                                                                                     |
| NFR-SVC-1, NFR-SVC-2 | `http.ts` — fetch wrapper (base URL, timeout, error normalization, retry); Vite dev proxy as CORS fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### 7.2 Folder architecture (from the analysis doc §4)

Stores (`markets.store.ts`, `bets.store.ts`, `settings.store.ts`), composables (`useMarketSearch.ts` — debounce + loading/empty/error, `useAiPrediction.ts`), UI primitives (`components/ui/`: `SJButton`, `SJInput`, `SJCard`, `SJBadge`, `SJModal`, `SJSpinner`, `SJSkeleton`), and app widgets (`components/widget/`: `WMarketSearch`, `WMarketList`, `WMarketCard`, `WMarketDetail`, `WBetForm`, `WBetReceipt`, `WPositions`, `WAiPrediction`, `WSettings`) implement the requirements above; `styles/base.css` carries the minimal reset, fonts, and `.sr-only`/`.focus-ring` utilities.

### 7.3 UX mapping (from the analysis doc §6)

Header + Settings entry (US8) → Search bar `WMarketSearch` (US2) → Results `WMarketList`/`WMarketCard` (US3) with an opt-in "AI: pick a market" action over the list (US9) → Detail `WMarketDetail` (US4) → `WBetForm` (with builder/platform fee breakdown, US5) + `WBetReceipt` (fees + builderCode, US5) → `WPositions` (US6) → `WAiPrediction` opt-in inside detail for outcome pick (US7). The bet path is wired to `BettingService`; the opt-in real `ClobBettingService` (US10) swaps in only via config, never in the demo.
