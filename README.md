# Polymarket Widget

A self-contained, single-page **Polymarket widget** — a mini-app that lets you **search prediction markets → place a (builder-aware) bet → get an optional AI prediction**, built with Vue 3 + TypeScript and the RamosLabs Design System.

## What "widget" means here

"Widget" here is a **custom Polymarket-style SPA**, not the official read-only embed. The official `embed.polymarket.com` iframe is display-only: it shows a single market, its "Buy" buttons redirect out to polymarket.com, and it attributes no volume to a builder account. This build instead is a small self-contained frontend that consumes Polymarket's **public Gamma API** for real market data and models the full order flow (including a `builderCode`) itself — so it can search across markets, open a detail view, and run a builder-aware bet flow in one page.

## Features

- **Search + browse** — real market data from the public Polymarket **Gamma API** (no auth, CORS `*`). A default list of active markets (top by volume) loads on start; free-text search is debounced.
- **Market detail** — outcomes with prices as percentages, volume/liquidity, and selectable outcomes.
- **Builder-aware mock bet** — place a simulated bet on a chosen outcome and amount. The bet is **mock by default** but genuinely builder-aware: it shows the **real fee breakdown** (notional, additive **builder** fee + **platform** fee, `fee = notional × bps / 10000`, builder taker ≤ 100 bps / maker ≤ 50 bps) **before you confirm**, and the receipt records the configured **`builderCode` (bytes32)** a real signed order would carry.
- **AI prediction (opt-in)** — with your own OpenRouter key you can ask the AI to help **choose a market** (over the visible list) and **choose an outcome** (inside a market): recommended pick + confidence + rationale, one request per explicit click, never automatic. A free model is discovered at runtime.
- **Persisted positions** — simulated bets are saved to `localStorage` and restored across reloads, with their full fee breakdown and builderCode.

## Stack & architecture

- **Vue 3** (`<script setup>`, Composition API) + **Vite** + **TypeScript**.
- **Pinia** stores — markets (browse/search), bets (persisted positions), settings (AI key, builder override).
- **Service layer** — all browser I/O (`fetch`) is encapsulated behind services: `http.ts` (the sole `fetch` caller: timeout, retry, normalized errors), `polymarket.service.ts` (Gamma reads + normalization), `betting.service.ts` (the `BettingService` interface + mock/real implementations), `openrouter.service.ts` (AI). Components and stores never call `fetch` directly.
- **RamosLabs Design System, token-only** — every color/spacing/type/radius/shadow/motion value comes from `@ramoslabs/tokens`; no raw literals. Custom `SJ*` primitives and `W*` widgets follow the DS's own guidelines (press-first states, visible focus, native-first forms, semantic triads).
- **Mobile-first** — base styles author for mobile (base = 0), enhanced at the DS breakpoints; touch targets ≥ 24×24, inputs ≥ 16px. Light theme only (the DS ships no dark mode).

```
src/
  services/   http, polymarket, betting, openrouter
  models/     market, bet, prediction (typed contracts)
  lib/        fees (pure), format, outcome, status helpers
  stores/     markets, bets, settings (+ persist helper)
  config/     builder.config, features.config (env/flag isolation)
  components/  ui/ (SJ* primitives) + widget/ (W* widgets)
  fixtures/   sample markets (graceful-degradation fallback)
```

## How to run

```bash
npm install
npm run dev        # start the dev server
```

Open the printed local URL. **No environment variables are required** — the demo runs with none set. All variables in `.env.example` are optional:

| Variable                                                                  | Purpose                                                                                            | Default                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `VITE_GAMMA_BASE_URL`                                                     | Polymarket Gamma base URL (point at the built-in Vite dev proxy `/gamma-api` to defeat CORS)       | `https://gamma-api.polymarket.com` |
| `VITE_BUILDER_CODE`                                                       | builderCode (`bytes32`) carried on the order — public, not a secret, but never commit a real value | all-zero placeholder               |
| `VITE_BUILDER_TAKER_BPS` / `VITE_BUILDER_MAKER_BPS` / `VITE_PLATFORM_BPS` | fee rates                                                                                          | `100` / `50` / `0`                 |
| `VITE_ENABLE_REAL_ORDERS`                                                 | opt into the gated real-order path (stub in this build; never submits)                             | unset (mock)                       |

The OpenRouter AI key is **not** an env var — it is entered by the user at runtime in Settings.

## Key decisions

- **Why the bet is mock.** The reason is **operational, not technical**. Attributing builder volume/fees needs only the public `builder` field on the user-signed order — no backend, no builder secret. But a real `POST /order` is blocked by Polymarket's **geoblock by IP** (33 countries incl. US/UK, checked on every submit), requires a **funded USDC wallet with approvals**, and **VPN circumvention is ToS-prohibited** (the challenge brief itself notes a VPN may be needed even for reads). The deliverable is a GitHub repo, not a funded real-bet demo — so the demo mocks.
- **Reads are real.** Market search, browse, and detail hit the public Gamma API for real. If a read fails (network/CORS/geoblock/5xx), the app degrades gracefully to bundled sample fixtures and flags a "sample data" state rather than breaking.
- **A real order path exists behind the same interface (US10, stretch).** `ClobBettingService` sits behind the _same_ `BettingService` interface as the mock (`@polymarket/client` + a browser viem signer, `builder`-field attribution, no backend), gated by `VITE_ENABLE_REAL_ORDERS`. It is a documented stub in this build and **never submits a real order** — even with the flag on it falls back to the mock.

## Testing

```bash
npm run test       # unit tests (Vitest): normalization, fee math, persistence, AI parse/validate ladder
npm run test:e2e   # E2E (Playwright): search → open detail → select outcome → place bet → see position
```

## Formatting

```bash
npm run format         # normalize the repo with Prettier
npm run format:check   # verify formatting (CI gate)
```

## Security

- **AI key is user-supplied.** The OpenRouter key is entered at runtime, stored only in `localStorage`, and sent **only** in the `Authorization` header of the OpenRouter request — never placed in a URL, never logged, never bundled. No key is committed to source or shipped in the build; the only key ever used is the user's own.
- **No secrets for reads.** All Polymarket reads are public unauthenticated GETs — no API key or `.env` secret is required or used.
- **`builderCode` is configurable, not secret.** It travels publicly inside a signed order, so it is treated as configuration with an all-zero placeholder default and is never committed as a real value. No builder **secret** (the relayer/gasless API key) is ever present in the client.

See the full security review in [`docs/security-review.md`](./docs/security-review.md).

## Documentation

- [`docs/analysis-and-architecture.md`](./docs/analysis-and-architecture.md) — decisions (D1–D12), stack, architecture, service contracts.
- [`specs/polymarket-widget/spec.md`](./specs/polymarket-widget/spec.md) — spec (user stories, EARS ACs, NFRs).
- [`specs/polymarket-widget/design.md`](./specs/polymarket-widget/design.md) — technical design.
- [`docs/`](./docs) — research notes (Polymarket API, OpenRouter, RamosLabs DS).
