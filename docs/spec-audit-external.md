# External Multi-Lens Spec Audit — Consolidated & Remediation Plan

> Pre-implementation adversarial audit of `specs/polymarket-widget/` across 5 lenses (security/attacks,
> performance, UI/UX+a11y, mobile-first, architecture/best-practices), each citing official/specialized
> sources. This document **deduplicates** the findings and defines the **remediation** applied to
> `spec.md` / `plan.md` / `tasks.md` before any code is written. Goal: zero gaps.

**Lens totals (raw):** Security 14 · Performance 18 · UI/UX+a11y 21 · Mobile-first 13 · Architecture 24. Many overlap; deduped into 25 themes below.

**Severity legend:** 🔴 Critical/High (breaks the deliverable or is a live bug) · 🟠 Medium · 🟡 Low/cleanup.

---

## A. Cross-cutting BLOCKERS (must fix before code)

### T1 🔴 Content-Security-Policy: correctness + core-gating
Refs: SEC S1,S2,S3,S4 · PERF-05 · ARCH F5.
- **Move all HTTP security headers into the CORE, blocking gate** — they currently live only in the "deploy/bonus" group (Group 8), so the core widget (renders untrusted market/AI text, holds a live key) is shippable with **no CSP / no anti-clickjacking**. → **New `NFR-SEC-4`**; make the header verifier a blocking core task (Group 7), not bonus.
- **Fix the CSP directives.** Current `default-src 'self'; connect-src …; img-src 'self' https: data:; frame-ancestors 'none'` is weak/self-contradictory:
  - add `object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'` (base-uri/object-src do NOT inherit from default-src → `<base>`/plugin injection).
  - add explicit `script-src 'self'` (+ hash-based for Vite inline module-preload, or a nonce-injecting Worker — decide delivery mechanism, S4).
  - **`style-src 'self' 'unsafe-inline'`** — the proportional bars use Vue `:style="{width}"` = inline style **attributes**, which cannot use nonce/hash; without `'unsafe-inline'` the bars are blocked (ARCH F5). (Acceptable tradeoff for style-attrs; scripts stay strict.)
  - narrow `img-src` off the `https:` wildcard → `img-src 'self' https://*.polymarket.com data:` (wildcard reopens key-exfil via `new Image().src`).
  - `connect-src 'self' https://gamma-api.polymarket.com https://openrouter.ai` (add `https://clob.polymarket.com` only if D3 live pricing is enabled).
  - add `upgrade-insecure-requests`; add `report-to` for CSP violation reporting.
- **Static-delivery decision (S4):** Phase-1 has no Worker, so headers come from a `_headers` file (no per-request nonce). Use **build-time hash-based `script-src`** OR route `index.html` through a small Worker. The verifier must assert "CSP present **and page still boots**."

### T2 🔴 Self-host fonts (resolves CSP conflict + CLS + supply-chain)
Refs: PERF-04,05,16 · SEC S6 · ARCH F5.
- Self-host **Rubik / Red Hat Display** as **subsetted WOFF2** with inline `@font-face` (no Google CDN). Removes a render-blocking cross-origin stylesheet (LCP), eliminates the `default-src 'self'` vs font-CDN contradiction, and drops the privacy/supply-chain vector.
- Add `size-adjust`/`ascent-override`/`descent-override` tuned to the `system-ui` fallback (or `font-display: optional`) to kill font-swap CLS.
- Update `T001` + `plan §3 CSP` (`font-src 'self'`) + `plan §4 P5`. Add a **font-byte budget**.

### T3 🔴 Bet math: guard divide-by-zero / non-finite
Refs: SEC S5 · ARCH F4.
- `AC1.5` clamps price to `[0,1]` — **0 is in range**. `AC5.3` `shares = size/price` → `Infinity`/`NaN` into receipt + localStorage.
- **Extend `AC5.3` / `T202.1`:** reject/block betting when `price <= 0` or `!Number.isFinite(price)`; assert `Number.isFinite` on `cost/shares/payout` before producing a receipt or persisting. Pin `avgPrice = prices[i]` (closes D005).

### T4 🔴 Bet UX: confirmation step + submitting/double-submit guard
Refs: UI F1,F2.
- **New `AC5.0.5`:** a review-and-confirm step before `placeBet` ("Betting $X on *Yes* @62% → payout $Y. Confirm?"). Consequential money-shaped action needs a commit gate (NN/g).
- **New `AC5.1a`:** disable the button + `aria-busy` during the in-flight `placeBet` (MockBettingService has a delay → double-tap files two positions). Re-enable on settle.

### T5 🔴 Global error handling + error boundary
Refs: ARCH F1,F2 · PERF none.
- Wire **`app.config.errorHandler`** in `main.ts` → `logEvent` (last-resort capture for uncaught render/lifecycle/watcher errors).
- Add an **`onErrorCaptured` boundary** (`SJErrorBoundary` or in `App.vue`) so one bad card/panel degrades instead of white-screening the SPA. New NFR + task.

### T6 🔴 Mobile: per-screen responsive scale-up + large-screen layout
Refs: MOBILE M1,M2. **The headline mobile gap.**
- The mobile-first *mechanism* (base=0 + `min-width`, no desktop-first) is correctly encoded, but **no layout change is defined at ANY breakpoint** → today it ships a phone column centered on desktop (the user's explicit anti-goal).
- **Make `NFR-MF-1` carry a concrete per-screen responsive matrix** keyed to the DS's 5 breakpoints, centered on:
  - **md/lg two-pane list+detail** (mobile modal → inline right pane on large screens) — the change that genuinely uses the extra space.
  - a capped `max-inline-size` (~65–75ch) so text never runs full-bleed at 1366px.
  - multi-column card grid at md+ for the result list.
  - positions: stacked rows on mobile (wrap, no h-scroll) → table at md+.
- Update `T602`/`T603`/`T609` with the deltas.

---

## B. High-value HARDENING (fold into tasks before code)

### T7 🔴 Images: CLS + LCP + lazy + fallback
Refs: PERF-01,02,03 · MOBILE M10.
- Require `width`/`height` or `aspect-ratio` on every market image (reserve space → no CLS). `loading="lazy"` + `decoding="async"` below the fold; keep the LCP/first image eager; `preconnect` to the image host; broken-image fallback. Skeletons must mirror real card height. → `T602`/`T603`/`T506`, `plan §4`.

### T8 🔴 Runtime schema validation of the whole untrusted payload
Refs: ARCH F8 · SEC S10.
- `normalizeMarket(raw)` validates only 3 array fields of an otherwise-`any` payload; `question/volumeNum/liquidityNum/endDate/active/closed` and both response envelopes (`/markets` array, `/public-search {events,tags,profiles}`) are consumed unchecked → `NaN`/`undefined`/throw.
- Parse `raw: unknown` with a schema (whole object + envelope). Prefer **zod** (or disciplined hand-rolled). Extend `AC1.4` / `T201`. Pair with **TS `strict` + `noUncheckedIndexedAccess`** (T20) to force the positional-alignment/short-array cases.

### T9 🔴 >2-outcome markets
Refs: ARCH F3.
- `AC4.2` forces the green/red (success/error) binary; Polymarket `outcomes` can hold >2 labels. Add an AC: for N>2 use a **neutral chip encoding** (no forced success/error), still color-never-alone. Update `T603`/`T607` (AI framing not "Yes/No").

### T10 🟠 Asset caching + compression + budget enforcement + CWV measurement
Refs: PERF-06,07,08,16,18.
- Add `dist/_headers`: `immutable, max-age=31556952` for `/assets/*` (hashed), `no-cache` for `index.html` (CF default is `max-age=0, must-revalidate` → defeats Vite hashing). Pin budget encoding (gzip; brotli only on CF Pro).
- Add a **`size-limit` gate to CI** (fail >150KB gz) as part of the deploy gate; add CSS/font/image/total budgets with per-metric owners; add **Lighthouse-CI or web-vitals RUM** so budgets are regression-guarded.

### T11 🟠 Discriminated-union state + unified error taxonomy
Refs: ARCH F10,F11 · prior D004.
- Model UI states as `type RequestState<T> = {status:'idle'|'loading'} | {status:'error',error} | {status:'success',data:T}` (no impossible `loading && error`).
- Unify one **`AppError`** union across all 4 services (http `network|timeout|http|cors|parse`, betting `validation|sim-failure`, AI `no-key|rate-limit|parse-fail|outcome-mismatch`). Specify throw-vs-`Result`. Distinguish **429/Retry-After** (backoff, no auto-retry) from hard failure (closes D004, UI F13). → `plan §2`, `T401/T402/T202/T203`.

### T12 🟠 Intl formatting contract (also fixes test determinism)
Refs: ARCH F12 · prior D003 (re-graded Med).
- Add `utils/format.ts` with pinned-locale `Intl.NumberFormat`/`Intl.DateTimeFormat` for %, currency (volume/liquidity), and `endDate`. Prevents `62%`/`62.0%` drift and non-deterministic `toLocaleString` tests. New NFR + used by all rendering components.

### T13 🟠 localStorage hardening
Refs: SEC S10 · ARCH F9 · UI F4.
- Per-item **schema+type validation** on read (drop only the invalid item, keep the rest — not a wipe-on-tamper DoS). Handle `QuotaExceededError` and storage-unavailable (Safari Private/disabled) on write with a non-blocking "couldn't save locally" notice (don't show a receipt for an unpersisted bet).
- Corrupt storage must surface a **distinct recoverable notice** (`role="status"`), NOT the first-run onboarding message (empty-state anti-pattern). → `AC6.1`/`AC6.4`/`T302`/`T606`.

### T14 🟠 Mobile: viewport-fit + safe-area + modal-as-sheet + focus-not-obscured
Refs: MOBILE M3,M4,M6 · UI F5 (WCAG 2.4.11).
- `index.html` meta: `width=device-width, initial-scale=1, viewport-fit=cover`; **forbid** `maximum-scale`/`user-scalable=no` (WCAG 1.4.4). Without `viewport-fit=cover` every `env(safe-area-inset-*)` resolves to 0.
- **Mobile modal = full-screen / bottom sheet** with safe-area insets, internal `overflow-y:auto`, visible close + Esc + backdrop; centered dialog only at md+.
- Sticky "Place bet" CTA: `padding-bottom: calc(... + env(safe-area-inset-bottom))`, reserve scroll padding, stay above the keyboard. Focused control **never obscured** by sticky CTA/header/toast (`scroll-margin`) → **New `NFR-A11Y-6`**.

### T15 🟠 Input semantics (keyboard + credential)
Refs: MOBILE M5 · UI F11,F16.
- Bet amount: `type="text" inputmode="decimal"` (NEVER `type="number"` for money). Search: `type="search" enterkeyhint="search" autocomplete="off"`. Key field: `type="password"` + show/hide toggle, **allow paste/password-managers** (WCAG 3.3.8), `autocomplete/autocapitalize/autocorrect off`. → `T601/T604/T608`.

### T16 🟠 WCAG 2.2 AA mechanics (specify, don't just name)
Refs: UI F6,F7,F9,F10.
- Modal: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`(question) + `aria-describedby` + defined initial focus (`T505`).
- Heading outline (`h1` + section `h2`) + landmarks (`header`/`main`/`search`/`region`); skip-link → real `<main>` target → **New `NFR-A11Y-7`** (`T609`, `T001`).
- Field errors: `aria-invalid` + `aria-describedby` linking input↔message (`AC5.4`/`T502/T604`).
- Announce result count on settle (polite live region), not just "loading" (`AC2.3`/`T507`).

### T17 🟠 Empty states + AI discoverability
Refs: UI F3,F4,F12,F19,F20.
- No-results: echo & preserve the query, offer clear + top-by-volume markets (not a dead-end) (`AC2.4`).
- AI with no key: keep a **visible disabled** affordance + CTA to Settings; never fully hide (`AC7.2`).
- Positions onboarding empty: next-step CTA toward search (`AC6.3`).
- Persistent "**bets are simulated**" framing / first-run orientation (`T609`).

### T18 🟠 Testing: component tier + network mocking + coverage + automated a11y
Refs: ARCH F6,F7,F16.
- Add a **component/integration test tier** (`@vue/test-utils`/Testing Library) for the loading/empty/error/focus/disabled/no-key-CTA state ACs currently delegated to manual QA. Specify **MSW** for Gamma/OpenRouter mocking (no live network in unit tests). Add a **`vitest --coverage` threshold**. Add **axe** (vitest-axe / Playwright-axe) automated a11y assertions. → expand `NFR-TEST-1`, `T701–T709`.

### T19 🟠 Supply chain + merge gate
Refs: SEC S11,S12.
- Make **Dependabot required**; add blocking `npm audit --audit-level=high` (or osv-scanner) to CI; **SHA-pin** all GitHub Actions; deploy with `npm ci` (committed lockfile).
- Run the full gate as a **required PR status check** with branch protection on `main` (gate = merge gate, not just deploy gate).

### T20 🟠 Env + TS strictness
Refs: ARCH F13,F14.
- `strict: true` + `noUncheckedIndexedAccess` + `noImplicitAny` in tsconfig (forces positional-alignment handling).
- Commit `.env.example`; augment `ImportMetaEnv` in `vite-env.d.ts`; validate `VITE_BET_MODE ∈ {mock,real}` / `VITE_AI_MODE ∈ {user-key,proxy}` in `config.ts` (`AC9.3`).

---

## C. Cleanup / lower-severity (fold in; don't block Group 0–1)

| ID | Sev | Finding | Fix | Ref |
|---|---|---|---|---|
| C1 | 🟡 | Bars animate `width` (DS forbids; jank) | `transform: scaleX()`, gate reduced-motion | UI F15 · plan §4 P3 |
| C2 | 🟡 | Modal not Teleported | `<Teleport to="body">` | ARCH F17 · T505 |
| C3 | 🟡 | Keyed `v-for` not mandated | require `:key="market.id"` | ARCH F18 · PERF-11 · T602/T606 |
| C4 | 🟡 | Coarse retry (retries timeouts/4xx) | retry only `network`/`timeout`/`5xx`, backoff | ARCH F19 · T102 |
| C5 | 🟡 | Search results uncapped/unvirtualized | cap search `limit`; virtualization threshold >50 | PERF-10 · T201.4/T602 |
| C6 | 🟡 | Code-split AI + modal | `defineAsyncComponent` for `WAiPrediction`/detail | PERF-09 |
| C7 | 🟡 | Pinia deep-reactive API data | `shallowRef`/`markRaw` for market lists | PERF-13 · T301 |
| C8 | 🟡 | Detail may refetch (INP) | reuse store market; refetch only if absent | PERF-12 · T201/T603 |
| C9 | 🟡 | Toast in flow → CLS | `position:fixed`/overlay; dismissible; timing (WCAG 2.2.1/1.4.13) | PERF-15 · UI F14 · T507 |
| C10 | 🟡 | `real`-mode factory throws | degrade to disabled state, fail-safe | ARCH F22 · T202.3 |
| C11 | 🟡 | `BetOrder` shape drift (`price` vs `priceLimit`) | reconcile now so the mock→real seam is real | ARCH F21/C3 · plan §2 |
| C12 | 🟡 | Cross-tab divergence | optional `storage` event listener | ARCH F20 |
| C13 | 🟡 | Error copy generic | kind→specific human copy | UI F18 · AC2.5/3.4/5.7 |
| C14 | 🟡 | Bars need accessible name | bar `aria-hidden`, numeric label carries meaning | UI F21 · T602/T607 |
| C15 | 🟡 | Landscape/orientation (WCAG 1.3.4), 200% zoom (1.4.4), 320px reflow (1.4.10) | add to QA gate + NFR-A11Y | MOBILE M7,M8,M9 |
| C16 | 🟡 | Icon controls hit-area→44 + `aria-label` | note on Settings/close | MOBILE M11,M12 |
| C17 | 🟡 | HTTPS-only config; reject `http://` base; offline UX (`navigator.onLine`) | validate env; offline state distinct from network error | SEC gap2 · ARCH gap7 |
| C18 | 🟡 | Phase-2 proxy abuse controls | rate-limit/Turnstile, size cap, host-allowlist (SSRF), bounded prompt | SEC S7 · US9 Phase-2 note |
| C19 | 🟡 | Error `message` may leak internals | kind→fixed friendly strings; never log rationale/upstream bodies | SEC S13 · plan §6 |
| C20 | 🟡 | Referrer-Policy/nosniff/Permissions-Policy/HSTS absent | add to `_headers` (folds into T1) | SEC S14 |

---

## D. Still-open prior audit items (apply)
- **D001/D002** were addressed in commit `c6331f6` (4 NFR refs added, count→58). Re-verify they hold after edits.
- **D005** (mock `avgPrice` derivation) — closed by T3 (`avgPrice = prices[i]`).

---

## E. Verdicts (per lens)
- **Security:** not adequate *as specified* — headers in optional scope (S1), weak CSP (S2–S4,S6), live bet-math bug (S5). All cheap to fix in-spec.
- **Performance:** not ready — fonts/images/caching named-not-engineered, no budget enforcement. PERF-05 Critical.
- **UI/UX+a11y:** conditional — strong state architecture, but missing bet confirmation (F1), 5 unspecified WCAG 2.2 mechanics, 2 empty-state anti-patterns.
- **Mobile-first:** mechanism ✅, scale-up ❌ (M1/M2) — the central gap; plus viewport-fit/sheet/inputs.
- **Architecture:** promotable-with-required-fixes — binary/happy-path contract, no global error handling, CSP breaks deploy, 3-field validation of an `any` payload.

**Overall:** no architectural blockers; ~6 items (T1–T6) will each visibly break the deliverable and MUST land before Group 6/8; T7–T20 fold into their tasks; C1–C20 cleanup. After remediation, re-run `spec-audit` to confirm closure.
