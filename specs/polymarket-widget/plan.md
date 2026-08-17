# Implementation Plan — Polymarket Widget

> Companion to [`spec.md`](./spec.md) · produced by `spec-harden` (draft → ready-for-dev).
> Source of truth: [`docs/analysis-and-architecture.md`](../../docs/analysis-and-architecture.md) (D1–D10).
> This file is the **design/threat-model/ops** layer; [`tasks.md`](./tasks.md) is the executable breakdown.

---

## 0. Hardening summary

| Phase | Result |
|---|---|
| Layout detection | `single` (git repo at root). |
| Prior-audit ingestion | None — first harden run (no `AUDIT-REPORT.md`). |
| Open questions (research) | **0 unresolved.** The analysis doc's two "confirm with user" notes are already closed in-doc (§9 → TypeScript; D6 → light-only). No web research required, no BLOCKED. |
| Dependency validation | Core runtime deps already installed; **0 new runtime deps**. Gate/deploy tooling (eslint, prettier, wrangler…) validated: all exist, **0 CVEs** (OSV.dev). |
| Security threat model | 10 threats enumerated; 2 HIGH mitigated by gate tasks; 0 CRITICAL-unmitigated → **no hard block**. |
| Performance threat model | 6 bottlenecks, all with feasible mitigations → **no PERF-IMPOSSIBLE**. |
| Cost projection | **~$0/month** at demo usage (all free tiers). |
| Status transition | `draft` → **ready-for-dev (with warnings)** — warnings are bonus/infra-scope only (see §9). |

---

## 1. Codebase integration (Phase 4)

The repo is already scaffolded (`feature/polymarket-widget`): Vite 8 + Vue 3.5 + TS 6 + Pinia 4 + `@ramoslabs/tokens@0.1.0`, Vitest 4 + Playwright 1.62. Empty target folders exist with `.gitkeep`:

| Target dir (exists) | Fills to |
|---|---|
| `src/services/` | `http.ts`, `polymarket.service.ts`, `betting.service.ts`, `openrouter.service.ts` |
| `src/models/` | `market.ts`, `bet.ts`, `prediction.ts` |
| `src/stores/` | `markets.store.ts`, `bets.store.ts`, `settings.store.ts` |
| `src/composables/` | `useMarketSearch.ts`, `useAiPrediction.ts` |
| `src/components/ui/` | `SJButton`, `SJInput`, `SJCard`, `SJBadge`, `SJModal`, `SJSpinner`, `SJSkeleton`, `SJLiveRegion` |
| `src/components/widget/` | `WMarketSearch`, `WMarketList`, `WMarketCard`, `WMarketDetail`, `WBetForm`, `WBetReceipt`, `WPositions`, `WAiPrediction`, `WSettings` |
| `src/styles/base.css` | reset, font-face/preconnect, `.sr-only`, `.focus-ring`, `.skip-link` |
| `src/App.vue`, `src/main.ts` | layout composition; `main.ts` already the entry (imports `@ramoslabs/tokens/css`) |

**Idiom to match:** `<script setup>` + Composition API, Pinia stores, path structure per analysis §4. No existing product code to conflict with → **0 hard conflicts**.

**Integration seams:**
- All `fetch` flows through `http.ts` (NFR-SVC-1). Components/stores never call `fetch`.
- Betting is selected by a factory keyed on `VITE_BET_MODE` (D2/AC9.5); only `MockBettingService` ships.
- AI request path is selected by `VITE_AI_MODE` (AC9.6); only `user-key` (browser → OpenRouter) ships.
- Config is centralized in one `src/config.ts` reading `import.meta.env.VITE_*` with safe defaults (`bet=mock`, `ai=user-key`, `gammaBase=https://gamma-api.polymarket.com`).

---

## 2. Data-model & contracts (Phase 4)

```ts
// models/market.ts
interface Market {
  id: string; question: string; slug: string;
  outcomes: string[];          // JSON.parse(raw.outcomes)
  prices: number[];            // JSON.parse(raw.outcomePrices).map(Number), clamped [0,1]
  tokenIds: string[];          // JSON.parse(raw.clobTokenIds)
  volume: number; liquidity: number;
  endDate: string; image?: string;
  active: boolean; closed: boolean;
  pricingReliable: boolean;    // false when any price was clamped / out of range (AC1.5)
}
// models/bet.ts
interface BetOrder { marketId: string; tokenId: string; outcome: string; side: 'BUY'; size: number; price: number; }
interface BetReceipt { status: 'filled'; avgPrice: number; shares: number; cost: number; txHash: string; }
interface Position extends BetReceipt { id: string; marketId: string; question: string; outcome: string; size: number; price: number; createdAt: string; schemaVersion: 1; }
// models/prediction.ts
interface AiPrediction { recommendedOutcome: string; confidence: number; rationale: string; modelId: string; }
```

**Normalization contract (`normalizeMarket`, AC1.1–1.5):** parse the three JSON-encoded string fields → positionally-aligned arrays; coerce prices to `number`; **clamp** to `[0,1]` and set `pricingReliable=false` on out-of-range/`NaN`; if any field is missing / invalid JSON / unequal-length → **return `null`** and the caller **excludes** that market (never throws, never renders `NaN`).

**No database, no server, no migrations.** Persistence is `localStorage` only (`positions`, `settings.openrouterKey`), each with a `schemaVersion` and defensive parse (AC6.4).

**Error model:** `http.ts` normalizes failures to `{ kind: 'network'|'timeout'|'http'|'cors'|'parse', status?, message }`. UI maps `kind` → error state + retry (AC2.5, AC3.4, AC5.7, AC7.9). Aborted (superseded) requests are swallowed, not surfaced as errors (AC2.2).

---

## 3. Security threat model (Phase 6)

| # | Threat | Surface | Severity | Mitigation | AC/task |
|---|---|---|---|---|---|
| T1 | OpenRouter key exfiltration | key in `localStorage`, sent in `Authorization` header | **HIGH** | user-supplied only; **never bundled/committed**; sent **only** in `Authorization` header; never in URL/logs; disclaimer; recommend spend-capped key | AC8.3/8.4, NFR-SEC-1/2, T-gate `security: T701` |
| T2 | XSS via untrusted strings (market `question`, outcome labels, AI `rationale`) rendered to DOM | all external text | **HIGH** | Vue text-interpolation only; **forbid `v-html`** on any external data (lint rule `vue/no-v-html`); strict CSP header | `security: T701`, `security: T703` |
| T3 | Corrupt/tampered `localStorage` payload | positions/settings restore | MEDIUM | versioned payload + defensive parse → recover to empty | AC6.4 → `store: T302` |
| T4 | Prompt injection via market question into the LLM | AI predict call | MEDIUM | output treated as untrusted: `recommendedOutcome ∈ labels`, `confidence` clamped, `rationale` length-capped, rendered as text; invalid → error not display | AC7.6/7.10 → `svc: T203.4` |
| T5 | Secret in client bundle | build config | **HIGH** | strict `VITE_*`=public / Worker-secret split; **no key in `VITE_*` or `vars`**; post-build grep scan of `dist/` | AC9.4, NFR-SEC-1 → `security: T803` |
| T6 | Clickjacking | hosted page | LOW | `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` response headers | `security: T703` |
| T7 | AI rate-limit / cost abuse | OpenRouter free tier (20 req/min) | LOW | **on-demand only**, never auto-call; user's own key/quota | AC7.3 |
| T8 | Dependency supply chain | npm deps | LOW | versions pinned; OSV.dev scan clean (see §5); Dependabot optional | `ci` gate |
| T9 | Over-scoped Cloudflare deploy token | GitHub secret | MEDIUM | least-privilege token (Workers Scripts: Edit on one account); rotate on exposure | deploy doc §7 → `deploy: T802` |
| T10 | Polymarket ToS / geoblock | reads only | LOW | reads are global+public; **no** trading, **no** VPN bypass (out of scope §6) | spec §6 |

**No CRITICAL-without-mitigation → no `blocked-security`.** Two HIGH (T1, T2, T5) are handled by explicit `security:` gate tasks placed before/with the tasks they cover.

**Security plan (anchor `#security-plan`):** CSP `default-src 'self'; connect-src 'self' https://gamma-api.polymarket.com https://openrouter.ai; img-src 'self' https: data:; frame-ancestors 'none'`; no `v-html`; key only in `Authorization`; no secret in bundle; least-privilege deploy token.

---

## 4. Performance threat model (Phase 7)

Client SPA, no server hot path. Budgets (no constitution exists → derived from web.dev norms + research):

| Budget | Target |
|---|---|
| JS bundle (gzip) | ≤ 150 KB (Vue+Pinia ≈ 60 KB + app; **no UI/chart lib** — D7/analysis §3) |
| LCP | ≤ 2.5 s (Fast 3G) |
| INP | ≤ 200 ms |
| Gamma request timeout / retry | 10 s, 1 retry (`http.ts`) |
| AI request timeout | 30 s, no auto-retry beyond the ladder's single temp-0 retry |
| Search debounce | ~300 ms, ≤1 in-flight request |

| # | Bottleneck | Severity | Mitigation |
|---|---|---|---|
| P1 | Search request storm on keystroke | could burst Gamma | debounce ~300 ms + abort superseded (AC2.2) |
| P2 | Runtime model discovery (`/models`) latency on first AI call | adds ~1 RTT | cache picked model id in memory for the session; discover once per prediction session |
| P3 | Default-list render cost | low | cap `limit=20` (AC3.1); proportional bars are CSS `transform`/width, no JS layout; virtualization unnecessary at 20 |
| P4 | Synchronous `localStorage` read on mount | negligible | small payload; parse once into Pinia |
| P5 | Web-font FOIT / LCP hit (Rubik / Red Hat Display not bundled) | could delay LCP | `font-display: swap` + `preconnect`; `system-ui` fallback (research DS §2) |
| P6 | N+1 / DB fanout | N/A | no DB; each Gamma call is a single GET |

**No PERF-IMPOSSIBLE.** All mitigations feasible within budget.

---

## 5. Dependency validation (Phase 5)

**Core runtime — already in `package.json`, 0 new:**

| Dep | Version | Registry | OSV |
|---|---|---|---|
| vue | ^3.5.40 | ✅ | CLEAN |
| pinia | ^4.0.3 | ✅ | CLEAN |
| @ramoslabs/tokens | ^0.1.0 | ✅ (internal DS) | n/a |

Dev/build already present (vite 8.2, vitest 4.1, typescript 6.0, vue-tsc 3.3, @vue/test-utils 2.4, @playwright/test 1.62, jsdom 30) — all CLEAN.

**New tooling required for the gate/deploy (⚠ bonus/infra scope — needs `--allow-new-dep` at implementation time):**

| Dep | Latest | OSV | Purpose |
|---|---|---|---|
| eslint | 10.8.1 | CLEAN | lint gate (AC9.2) |
| prettier | 3.9.6 | CLEAN | format gate (AC9.2) |
| eslint-plugin-vue | 10.10.0 | CLEAN | `vue/no-v-html` (T2) + Vue rules |
| @vue/eslint-config-typescript | 14.9.0 | CLEAN | TS+Vue lint preset |
| wrangler | 4.123.0 | CLEAN | Cloudflare deploy (US9, Phase-1 SPA) |

All exist and are CVE-clean, but the skill's safety rail treats *adding* deps as gated. Since the **core widget needs none of these**, this is a **warning**, not a spec-level block — see §9.

---

## 6. Observability plan (Phase 8) `#observability-plan`

Client-first (Worker analytics available in Phase 2 via `observability.enabled` in `wrangler.jsonc`).

**Structured log fields (≥5, typed) — one `logEvent(...)` helper, dev console + optional sink:**
`event: string` · `service: 'polymarket'|'betting'|'openrouter'` · `operation: string` · `status: 'ok'|'error'` · `durationMs: number` · `errorKind: string|null` · `marketId: string|null` · `modelId: string|null` · `correlationId: string`. **Never** log `apiKey` (NFR-SEC-2).

**Metrics (name + type):**
`search_requests_total` (counter) · `search_errors_total` (counter) · `gamma_request_duration_ms` (histogram) · `bet_placed_total` (counter) · `ai_prediction_requests_total` (counter) · `ai_prediction_failures_total` (counter) · `ai_parse_fallback_total{stage}` (counter — which rung of the ladder was used).

**Spans (one per external call):** `gamma.searchMarkets`, `gamma.getMarkets`, `gamma.getMarket`, `openrouter.pickFreeModel`, `openrouter.predict`. Mock betting = local span `betting.placeBet`.

**Alerts (thresholds; Phase-2 Worker / CF analytics):** Gamma error-rate > 20% / 5 min → warn · AI failure-rate > 50% / 10 min → warn · **CI deploy-gate failure → block deploy** (hard, AC9.2).

---

## 7. Cost projection (Phase 11) `#cost-projection`

| Resource | Usage assumption | Unit cost | Monthly $ |
|---|---|---|---|
| Cloudflare Workers Static Assets | demo traffic, static reqs free; < 100k Worker req/day | free tier | **$0** |
| OpenRouter (AI) | free `:free` models, **user-supplied key**, ≤ 20 req/min | $0 (free tier) | **$0** (project pays nothing) |
| Polymarket Gamma reads | public, unauthenticated GET | $0 | **$0** |
| GitHub Actions CI/deploy | small repo, within free minutes | free tier | **$0** |
| **Total** | | | **≈ $0/month** |

No declared budget (no `constitution.md`). Ceiling: if Workers exceeds free tier → +$5/mo paid plan. **< 50% of any plausible budget → no cost block.**

---

## 8. Feature flags & rollback (Phases 10, 14)

**Flags (env-driven, both default to the safe/simulated path):**

| Flag (env var) | Namespace | Default | Rollout | Owner |
|---|---|---|---|---|
| `VITE_BET_MODE` = `mock`\|`real` | `bet.mode` | `mock` | `real` inert until Phase-2 `/api/bet` exists (AC9.5) | widget team |
| `VITE_AI_MODE` = `user-key`\|`proxy` | `ai.mode` | `user-key` | `proxy` inert until Phase-2 `/api/ai/predict` exists (AC9.6) | widget team |
| AI feature enable | runtime | off | on when a valid OpenRouter key is present in Settings (AC7.1/7.2) | widget team |

**Rollback:**
- **No DB migrations.** Only destructive surface is the `localStorage` schema → mitigated by `schemaVersion` + defensive parse + recover-to-empty (AC6.4). Forward-compatible; no inverse migration needed.
- **Deploy:** `wrangler rollback` / `wrangler versions` reverts the served build in seconds (AC9.7); secondary = git revert + redeploy.
- **Switches default-safe:** flipping back to `mock`/`user-key` is env-only, no code change.

---

## 9. Warnings (ready-with-warnings)

1. **New dev/deploy tooling deps** (eslint, prettier, eslint-plugin-vue, @vue/eslint-config-typescript, wrangler) are required for the CI gate + US9 deploy. All validated (exist, 0 CVEs) but the skill's `--allow-new-dep` rail applies — **approve when picking up the gate/deploy tasks** (`setup: T003`, `deploy: T801`). The **core widget needs zero new deps**, so this does not block core development.
2. **Missing `package.json` scripts** referenced by the deploy gate: `lint`, `format:check`, and the CI's `test:unit` (package currently exposes `test`). Add these (task `setup: T003`).
3. **Bonus / Phase-2 scope kept as future extensions, not blockers** (per spec §6): real on-chain betting (`VITE_BET_MODE=real` + `/api/bet`), server-side AI proxy (`VITE_AI_MODE=proxy` + `/api/ai/predict`), and live CLOB pricing are **designed, not implemented**. Deployment ships the static SPA with `mock` betting + user-supplied AI key.
4. **No `constitution.md`** → no declared perf/cost budgets; budgets in §4/§7 are derived from research + web.dev norms and should be ratified if a constitution is later added.

**No hard blockers** (no missing core deps, no unmitigated CRITICAL, no PERF-IMPOSSIBLE, no BLOCKED research, cost ≈ $0).
