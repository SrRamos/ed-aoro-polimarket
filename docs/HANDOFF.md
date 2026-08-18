# Handoff — Polymarket Widget

State snapshot to resume work from another machine (one that has a VPN for live Polymarket access).

## Repo & branches

Remote: `https://github.com/SrRamos/ed-aoro-polimarket.git`

```
main                        baseline scaffold only
feature/polymarket-widget   PR#1 Foundation  → PR #1 (base: main)
feature/core                PR#2 Core        → PR #2 (base: feature/polymarket-widget)
feature/ui                  PR#3 UI + widget → PR #3 (base: feature/core)   ← latest work
```

Stacked PRs (each targets the one below). Open PRs: #1, #2, #3. **All three await your merge to `main`** (merges to main trigger the Cloudflare deploy — pipeline itself is PR#4, not yet built). Nothing is merged yet.

To continue on the other machine:
```
git clone https://github.com/SrRamos/ed-aoro-polimarket.git
cd ed-aoro-polimarket
git checkout feature/ui   # latest; has everything from PR#1+#2+#3
npm install
```

## How to run

- **Real mode (needs VPN — Polymarket is geo-blocked):**
  ```
  npm run dev
  ```
  Search + market data come live from the public Gamma API. No API key needed for markets.
- **Demo/mock mode (no VPN, no network to Polymarket):**
  ```
  VITE_USE_MOCK_DATA=true npm run dev
  ```
  Serves 10 fixture markets (incl. a >2-outcome election) so the whole UI is explorable offline. Default is OFF (`.env.example` documents the flag).
- **AI (optional bonus):** paste any OpenRouter key in the widget's Settings (gear icon). In mock mode any placeholder key enables the canned prediction; in real mode use a real free-tier key (see `docs/research-openrouter-ai.md`). Key is stored in `localStorage`, sent directly to OpenRouter (disclaimer in-app).

## Gate & tests (all currently green)
```
npm run lint
npm run format:check
npm run build      # vue-tsc strict + vite
npm run test       # 276 unit + component tests (Vitest + MSW + vitest-axe)
```

## What's done

- **Foundation (PR#1):** Vite + Vue 3 + TS (strict, `noUncheckedIndexedAccess`) + Pinia + `@ramoslabs/tokens`; self-hosted WOFF2 fonts; `config.ts` + env validation; global error handler + `SJErrorBoundary`; ESLint/Prettier gate.
- **Core (PR#2):** models · `http.ts` (timeout/abort/offline/retry, AppError union) · `polymarket` service (whole-payload schema validation, JSON-encoded-array parse, price clamp) · `betting` (mock, price-guard, fail-safe real) · `openrouter` (free-model discovery + JSON ladder + validation) · Pinia stores (markets, bets w/ hardened localStorage + cross-tab, settings) · composables (`useMarketSearch` debounce/offline, `useAiPrediction`).
- **UI (PR#3):** `SJ*` primitives (token-only, WCAG 2.2 AA) + `W*` widgets, assembled as a **compact embeddable widget** (`PolymarketWidget.vue`, ~448px card, internal Markets/Positions tabs + browse→detail→bet/AI view-stack) embedded in a demo host page (`App.vue`). Decision recorded in `docs/widget-form-factor.md` (D11 — supersedes the earlier full-page two-pane layout).

## What's pending (PR#4 — not started)

- **E2E:** one Playwright flow (search → select → confirm bet → appears in positions). `playwright.config.ts` is scaffolded; chromium is installed.
- **Deploy:** `wrangler.jsonc` (Cloudflare Workers static assets) + GitHub Actions `deploy.yml` (gate → build → `wrangler deploy` on merge to `main`) + `dist/_headers` with the **core CSP + security headers** (spec task `security:T710`, `NFR-SEC-4`). See `docs/deployment-cloudflare.md`. Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` GitHub secrets + branch protection on `main`.
- **README:** usage/run/deploy instructions for the reviewer.
- **Optional polish:** the list reuses `WMarketCard` (tall 16:9 image); could be denser rows for a more compact widget feel. Honest caveats live at the bottom of each agent's work and in `docs/spec-audit-external.md`.

## SDD artifacts (the plan)

- `docs/` — analysis, 3 research docs (Polymarket/OpenRouter/RamosLabs DS), deployment, `spec-audit-external.md` (5-lens audit → 0 open gaps), `widget-form-factor.md`, this handoff.
- `specs/polymarket-widget/` — `spec.md` (64 ACs / 34 NFRs), `plan.md`, `tasks.md` (65 items), `HARDEN-REPORT.md`, `AUDIT-REPORT.md`.
- `TASKS.md` — promoted task list.

## Suggested resume order
1. Merge PR#1 → PR#2 → PR#3 to `main` (or keep reviewing).
2. Verify live real-mode markets load (with VPN).
3. Build PR#4 (E2E + Cloudflare deploy + README) — tasks are in `specs/polymarket-widget/tasks.md` Groups 7–9.
