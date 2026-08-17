# Deployment — Cloudflare

> How the Polymarket Widget is deployed, configured, and evolved from simulation-only toward "something real".
> Platform decision confirmed against Cloudflare's official docs (Aug 2026), biased to docs over memory.
> Related: [`analysis-and-architecture.md`](./analysis-and-architecture.md) (D10) · spec [`specs/polymarket-widget/spec.md`](../specs/polymarket-widget/spec.md) (US9).

## 1. Platform decision — Cloudflare Workers with Static Assets

**Decision: deploy as a single Cloudflare Worker with Static Assets** (the Worker serves the built Vue 3 + Vite SPA and can host `/api/*` server routes with env vars/secrets). **Not** Cloudflare Pages.

### Why Workers Static Assets (not Pages)

Our requirements: (a) static asset serving for the SPA, (b) env vars + server-side secrets, (c) the ability to **later** add server-side API routes (an OpenRouter proxy that hides the AI key, and a future real CLOB/betting adapter), and (d) auto-deploy on merge to `main`.

| Need | Workers Static Assets | Verdict |
|---|---|---|
| Serve SPA static assets | `assets.directory` + `not_found_handling: "single-page-application"` returns `index.html` (200) for client-routed paths. Static-asset requests are **free** (same cost model as Pages). | ✅ native |
| Public config + server secrets | `vars` (build/config) in `wrangler.jsonc` + `wrangler secret put` (encrypted, server-only). | ✅ native |
| Add `/api/*` later **in the same deploy unit** | `assets.run_worker_first: ["/api/*"]` routes those paths to the Worker `fetch` handler **before** static assets; everything else serves the SPA. No second service, no re-platforming. | ✅ native — the deciding reason |
| Auto-deploy on merge to main | `wrangler deploy` from GitHub Actions (or CF Git integration). | ✅ |

**Deciding reason:** we start static-only but must be able to add server-side routes (OpenRouter proxy, future CLOB adapter) **without changing platforms**. Workers Static Assets lets one Worker + one `wrangler.jsonc` serve the SPA today and add `/api/*` routes tomorrow via `run_worker_first`, with first-class `vars`/secrets and the broader Workers feature set (Durable Objects, Cron, Queues, observability) available if the "real" path grows. Cloudflare's official guidance points here: Workers has the broader feature set, static assets are free, and Cloudflare ships a Pages→Workers migration guide — Workers is the forward full-stack platform.

**When Pages would have won (it didn't):** a purely static SPA with zero server-side ambitions and a preference for the Pages dashboard's preview-per-PR flow. Our OpenRouter-proxy and CLOB-adapter roadmap rules that out — putting server logic in Pages Functions would be the weaker long-term path per Cloudflare's own direction.

## 2. `wrangler.jsonc` configuration outline

> Config outline only — **no infra code is created in this planning phase.** JSONC is preferred over TOML (newer features are JSON-only). Use a recent `compatibility_date` and run `wrangler types` after changes.

### Phase 1 — SPA only (ship now)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "polymarket-widget",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./dist/",
    "not_found_handling": "single-page-application"
  },
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "vars": {
    "VITE_BET_MODE": "mock"
  }
}
```

Notes:
- `not_found_handling: "single-page-application"` serves `index.html` (200) for any path that is not a real asset, so Vue client-side routing works on hard refresh / deep links.
- No `main` entry yet → no Worker script; assets are served directly.
- `vars` here are **non-secret** config surfaced to the deployed environment.

### Phase 2 — add `/api/*` server routes (when the "real" path is requested)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "polymarket-widget",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "vars": {
    "VITE_BET_MODE": "real",
    "AI_PROXY_ENABLED": "true"
  }
  // Server-side secrets (OPENROUTER_API_KEY, future CLOB creds) are NOT here.
  // They are set out-of-band via `wrangler secret put` and read from `env` in the Worker.
}
```

Routing priority (per Cloudflare docs): `run_worker_first` patterns → real asset files → navigation requests (`Sec-Fetch-Mode: navigate`) → fallback rewrite to `index.html`. So `/api/*` hits the Worker; everything else serves the SPA.

## 3. Environment variables & secrets — the split

Two distinct mechanisms; do not conflate them.

| Kind | Where declared | Visibility | Examples |
|---|---|---|---|
| **Build-time public config** (`VITE_*`) | Vite build env (GitHub Actions build step) and/or `wrangler.jsonc` `vars` | **Public** — inlined into the client bundle, readable in DevTools | `VITE_BET_MODE`, `VITE_GAMMA_BASE_URL`, `VITE_AI_MODE` |
| **Server-side secrets** | `wrangler secret put <NAME>` (encrypted at rest), read as `env.<NAME>` in the Worker | **Hidden** — never in the client bundle, never in Git | `OPENROUTER_API_KEY` (prod proxy), future `CLOB_API_KEY`/`CLOB_SECRET`/`CLOB_PASSPHRASE` |

**Hard rule:** anything prefixed `VITE_` is public by definition — it is compiled into the SPA and is trivially readable. **Never** put an API key, secret, or credential in a `VITE_*` var or in `wrangler.jsonc` `vars`. Secrets exist only server-side via `wrangler secret put` and are only reachable from Worker code, never shipped to the browser (spec AC9.4 / NFR-SEC-1).

Local development:
- Public config: `.env` / `.env.local` (Vite) — committed values are non-secret only.
- Local Worker secrets: `.dev.vars` (git-ignored) for `wrangler dev`.

## 4. "Simulation → real" switch design

Two independent switches, both env-driven, so flipping from a demo to "something real" is configuration, not a rewrite.

### 4.1 Betting mode — `VITE_BET_MODE = mock | real`

- The app selects the `BettingService` implementation from `VITE_BET_MODE`:
  - `mock` → `MockBettingService` (current: local simulation + `localStorage`).
  - `real` → a future `ClobBettingService` that calls `/api/bet` on the Worker, which holds the server-side CLOB adapter/credentials.
- The `BettingService` interface (already specified, D2) is the seam: the swap is a factory switch, no call-site changes.
- Default everywhere today: `mock`. `real` is inert until the server adapter exists.

### 4.2 AI key sourcing — reconcile "user-supplied" (demo) vs "server proxy" (prod)

The AI feature has two mutually consistent modes, chosen by env:

| Environment | Mode | Key source | Request path |
|---|---|---|---|
| **Local dev / static demo** | `VITE_AI_MODE=user-key` | User pastes their **own** OpenRouter key in Settings → `localStorage` | Browser → OpenRouter directly (spec US7/US8; disclaimer shown) |
| **Deployed prod (when enabled)** | `VITE_AI_MODE=proxy` | **Server-side** `OPENROUTER_API_KEY` secret on the Worker | Browser → `/api/ai/predict` (Worker) → OpenRouter. Key never reaches the client. |

Reconciliation: the deployed production build should prefer the **server proxy** so the reviewer/user does not have to supply a key and no key is user-managed in prod, while **local dev keeps the user-supplied-key** approach (zero server needed, matches the challenge's opt-in demo). The client AI service reads `VITE_AI_MODE`:
- `user-key` → attach `Authorization: Bearer <localStorage key>`, call OpenRouter directly, show the "stored locally, sent directly to OpenRouter" disclaimer.
- `proxy` → call `/api/ai/predict` with no key; the Worker injects the secret. Settings hides the key field (or marks it optional) since the server owns the key.

Until the proxy route is built, deployed builds run `VITE_AI_MODE=user-key` (opt-in, no server key), keeping the current behavior. This is the same seam described in the OpenRouter research (Approach B for demo, Approach C proxy for prod).

## 5. Deploy-on-merge-to-main pipeline

**Recommendation: GitHub Actions running `wrangler deploy`** (rather than the Cloudflare Git integration).

Why GitHub Actions over CF Git integration for this repo:
- The SPA needs a **build step** (`npm ci && npm run build` → `./dist`) plus the project's **full quality gate** (lint + format check + `vitest` unit + 1 Playwright E2E) to run **before** deploy — Actions expresses this as explicit, reviewable steps and blocks deploy on failure.
- One source of truth (`.github/workflows/deploy.yml`) versioned with the code; no dashboard-managed build config drift.
- `wrangler deploy` produces an immutable version we can roll back (see §6).

### Sample workflow (outline — not created in this phase)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare
on:
  push:
    branches: [main]        # deploy on merge to main
  workflow_dispatch: {}      # manual re-deploy / rollback trigger
concurrency:
  group: deploy-production
  cancel-in-progress: false  # never cancel a half-finished production deploy
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint && npm run format:check   # full gate, not just lint
      - run: npm run test:unit                       # Vitest
      - run: npx playwright install --with-deps
      - run: npm run test:e2e                         # 1 Playwright E2E (search -> bet)
      - run: npm run build                            # Vite -> ./dist
      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        # env for the build step (public config only):
        env:
          VITE_BET_MODE: mock
          VITE_AI_MODE: user-key
```

Notes:
- Deploy only runs on `push` to `main` (i.e., after a PR merge). Feature branches build/test via a separate CI workflow but do **not** deploy.
- Server-side secrets (`OPENROUTER_API_KEY`, CLOB creds) are **not** in this workflow — they are set once on the Worker via `wrangler secret put` and persist across deploys. The workflow only needs the deploy credentials.
- `wrangler-action` runs `wrangler deploy` using the pinned `wrangler.jsonc`.

## 6. Rollback strategy

- **Primary — Worker versions:** every `wrangler deploy` creates an immutable version. Roll back with `wrangler rollback` (previous) or `wrangler rollback <VERSION_ID>` (specific). List with `wrangler versions list`, inspect with `wrangler versions view <ID>`. This reverts the served build in seconds without a Git revert.
- **Secondary — Git revert + redeploy:** revert the offending merge on `main`; the push re-triggers the workflow and deploys the reverted build (slower, but restores source-of-truth alignment).
- **Gate before rollback need:** the pre-deploy gate (lint/format/unit/E2E) is the first line of defense — a red gate blocks the deploy entirely.
- **Manual trigger:** `workflow_dispatch` allows re-running a known-good commit's deploy without a new merge.

## 7. Required secrets

### GitHub repository secrets (for the Actions deploy)
| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Scoped API token with **Workers Scripts: Edit** (and Workers KV/R2/etc. only if later bound). Used by `wrangler-action` to deploy. |
| `CLOUDFLARE_ACCOUNT_ID` | Target Cloudflare account id for the deploy. |

Token scoping: create a **least-privilege** custom token (Edit Workers on the specific account) — not a global API key. Rotate on exposure.

### Cloudflare Worker secrets (server-side, set via `wrangler secret put`, only when Phase 2 lands)
| Secret | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Server-side key for the `/api/ai/predict` proxy (prod `VITE_AI_MODE=proxy`). Never client-exposed. |
| `CLOB_API_KEY` / `CLOB_SECRET` / `CLOB_PASSPHRASE` (future) | Credentials for the real CLOB/betting adapter behind `/api/bet` when `VITE_BET_MODE=real`. Never client-exposed. |

None of these Worker secrets are needed for the Phase 1 static-only deploy.

## 8. Scope note

This deployment path is **bonus / infra scope**. The core widget (search → detail → simulated bet → positions, plus opt-in AI) runs fully in local dev with `mock` betting and the user-supplied AI key; nothing in this doc blocks or gates the core feature. Phase 2 (`/api/*` routes, server proxy, `real` betting) is built only on explicit request.
