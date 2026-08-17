# TASKS.md

> Global pending queue consumed by `/autopilot`. Tasks are promoted here from
> `specs/<feature>/tasks.md` by `/promote-tasks` after a passing `/spec-audit`.
> `/autopilot` owns the lifecycle of these lines — do not hand-edit states.

## Routing prefixes

Each task carries a routing prefix that tells the master agent which lane runs it:
`setup` · `model` · `svc` · `store` · `compose` · `ui` · `widget` · `test` · `security` · `deploy` · `docs`.

Task states: `[ ]` pending · `[x]` done · `[!]` blocked/needs-attention.

## Tasks

- [ ] setup: T001 — Wire `@ramoslabs/tokens/css` in `main.ts` + author `styles/base.css`: minimal reset, `font-display:swap` + `preconnect` for Rubik/Red Hat Display (fallback `system-ui`), `.sr-only`/`.focus-ring`/`.skip-link` (refs: specs/polymarket-widget/NFR-DS-1, specs/polymarket-widget/NFR-THEME-1, specs/polymarket-widget/NFR-A11Y-1, specs/polymarket-widget/plan §4 P5)
- [ ] setup: T002 — `src/config.ts`: read `import.meta.env.VITE_*` with safe defaults (`VITE_GAMMA_BASE_URL`, `VITE_BET_MODE=mock`, `VITE_AI_MODE=user-key`); typed config object (refs: specs/polymarket-widget/AC9.3, specs/polymarket-widget/AC9.5, specs/polymarket-widget/AC9.6, specs/polymarket-widget/plan §1)
- [ ] setup: T003 — Add ESLint (flat config) + `eslint-plugin-vue` (`vue/no-v-html` **error**) + `@vue/eslint-config-typescript` + Prettier; add `package.json` scripts `lint`, `format:check`, `test:unit` (refs: specs/polymarket-widget/AC9.2, specs/polymarket-widget/plan §5, specs/polymarket-widget/plan §9-2, specs/polymarket-widget/T2)  ⚠ requires --allow-new-dep
- [ ] model: T101 — `models/market.ts`, `models/bet.ts`, `models/prediction.ts` type contracts (refs: specs/polymarket-widget/AC1.*, specs/polymarket-widget/AC5.1, specs/polymarket-widget/AC7.*, specs/polymarket-widget/plan §2)
- [ ] svc: T102 — `services/http.ts` fetch wrapper: base URL, 10s timeout, retry×1, `AbortController`, normalized error `{kind,status,message}` (refs: specs/polymarket-widget/NFR-SVC-1, specs/polymarket-widget/NFR-SVC-2, specs/polymarket-widget/AC2.5, specs/polymarket-widget/plan §2 error-model)
- [ ] setup: T103 — Vite dev proxy for Gamma as CORS contingency (no call-site change) (refs: specs/polymarket-widget/NFR-SVC-2)
- [ ] svc: T201 — `polymarket.service.ts` (refs: specs/polymarket-widget/AC1.*, specs/polymarket-widget/AC2.1, specs/polymarket-widget/AC3.1, specs/polymarket-widget/AC4.1, specs/polymarket-widget/NFR-SVC-1)
- [ ] svc: T202 — `betting.service.ts`: `interface BettingService` + `MockBettingService` (refs: specs/polymarket-widget/AC5.1, specs/polymarket-widget/NFR-SVC-3, specs/polymarket-widget/D2)
- [ ] svc: T203 — `openrouter.service.ts` (refs: specs/polymarket-widget/AC7.3–AC7.6, specs/polymarket-widget/AC7.10, specs/polymarket-widget/AC9.6)
- [ ] store: T301 — `markets.store.ts`: list, search results, selected market/outcome (refs: specs/polymarket-widget/AC2.*, specs/polymarket-widget/AC3.*, specs/polymarket-widget/AC4.3)
- [ ] store: T302 — `bets.store.ts`: positions + `localStorage` persist with `schemaVersion`; restore on load; corrupt/missing → recover to empty (refs: specs/polymarket-widget/AC6.1, specs/polymarket-widget/AC6.4, specs/polymarket-widget/T3)
- [ ] store: T303 — `settings.store.ts`: OpenRouter key persist/clear in `localStorage`; toggles AI enablement (refs: specs/polymarket-widget/AC8.1, specs/polymarket-widget/AC8.2)
- [ ] compose: T401 — `useMarketSearch.ts`: ~300ms debounce, ≤1 in-flight (abort superseded), loading/empty/error/cleared states; empty input → browse list (refs: specs/polymarket-widget/AC2.2, specs/polymarket-widget/AC2.3, specs/polymarket-widget/AC2.4, specs/polymarket-widget/AC2.5, specs/polymarket-widget/AC2.6)
- [ ] compose: T402 — `useAiPrediction.ts`: on-demand single call, loading/error/retry (refs: specs/polymarket-widget/AC7.3, specs/polymarket-widget/AC7.7, specs/polymarket-widget/AC7.9)
- [ ] ui: T501 — `SJButton`: press-first states `:active→:focus-visible→:hover` (hover gated), tonal `--state-*` overlays, `--shadow-focus`, `--radius-sm`, ≥24×24 (aim 44); indigo `--color-primary` as the only action accent; `SJ*` naming + DS Interactive pattern (refs: specs/polymarket-widget/NFR-DS-3, specs/polymarket-widget/NFR-DS-4, specs/polymarket-widget/NFR-MF-2, specs/polymarket-widget/NFR-DS-2, specs/polymarket-widget/NFR-DS-7)
- [ ] ui: T502 — `SJInput`: persistent visible `<label>`, native, `:user-invalid`/`:user-valid`, `font-size≥16px`, inline error (refs: specs/polymarket-widget/NFR-DS-5, specs/polymarket-widget/NFR-MF-3)
- [ ] ui: T503 — `SJCard`: `--color-surface`, `--space-6`, `--radius-lg` (card role), `--shadow-sm` (elevation only) (refs: specs/polymarket-widget/NFR-DS-8, specs/polymarket-widget/NFR-DS-6)
- [ ] ui: T504 — `SJBadge`: `--radius-pill` + semantic triad (`-surface`+`-border`+`-text`) + icon/text (refs: specs/polymarket-widget/NFR-DS-8, specs/polymarket-widget/NFR-A11Y-2)
- [ ] ui: T505 — `SJModal`: `--radius-xl` (modal role), `--shadow-lg` (elevation only), `--z-modal-backdrop/modal`, focus trap + Escape + focus-return, motion ≤300ms transform/opacity only (refs: specs/polymarket-widget/NFR-DS-8, specs/polymarket-widget/AC4.4, specs/polymarket-widget/NFR-A11Y-5, specs/polymarket-widget/NFR-A11Y-4, specs/polymarket-widget/NFR-DS-6)
- [ ] ui: T506 — `SJSpinner` + `SJSkeleton` from surface/border tokens, animate opacity/transform, `prefers-reduced-motion` (refs: specs/polymarket-widget/AC3.3, specs/polymarket-widget/NFR-A11Y-4)
- [ ] ui: T507 — `SJLiveRegion`/toast: `role="status"`/`aria-live="polite"` + `role="alert"`, `--z-toast` (refs: specs/polymarket-widget/NFR-A11Y-3)
- [ ] widget: T601 — `WMarketSearch`: labelled input, debounce wired, live-region loading/empty/error (refs: specs/polymarket-widget/AC2.1–AC2.6)
- [ ] widget: T602 — `WMarketList` + `WMarketCard`: question, each outcome + % with proportional bar, volume/liquidity; skeleton while loading; explicit empty/error (refs: specs/polymarket-widget/AC3.1–AC3.5)
- [ ] widget: T603 — `WMarketDetail` (modal): outcomes selectable via success/error triad **+ text/icon**, price %, volume/liquidity; selection drives bet form; close→focus return; closed market → disable + text reason (refs: specs/polymarket-widget/AC4.1–AC4.5, specs/polymarket-widget/NFR-A11Y-2)
- [ ] widget: T604 — `WBetForm`: outcome + numeric amount (≥16px), live cost/payout, `:user-invalid` inline error, no-outcome guard, disabled-until-valid, sticky bottom CTA on mobile (refs: specs/polymarket-widget/AC5.1–AC5.5, specs/polymarket-widget/NFR-MF-4)
- [ ] widget: T605 — `WBetReceipt`: toast via live region + add position, no reload (refs: specs/polymarket-widget/AC5.6)
- [ ] widget: T606 — `WPositions`: per-position content (question, outcome, size, price, cost, shares, payout); first-run onboarding empty state (refs: specs/polymarket-widget/AC6.2, specs/polymarket-widget/AC6.3)
- [ ] widget: T607 — `WAiPrediction`: opt-in gate; no-key CTA → Settings; result = recommended outcome + `--color-primary` confidence bar (indigo action accent only) **+ numeric label** + rationale + "not financial advice"; error/retry (refs: specs/polymarket-widget/AC7.1, specs/polymarket-widget/AC7.2, specs/polymarket-widget/AC7.8, specs/polymarket-widget/AC7.9, specs/polymarket-widget/NFR-A11Y-2, specs/polymarket-widget/NFR-DS-2)
- [ ] widget: T608 — `WSettings`: labelled key field (≥16px), save/clear, "stored locally, sent directly to OpenRouter" disclaimer, **no bundled key** (refs: specs/polymarket-widget/AC8.1–AC8.5, specs/polymarket-widget/NFR-SEC-1)
- [ ] widget: T609 — `App.vue`: vertical mobile-first layout (base=0 + 5 `min-width` breakpoints), header + Settings entry, compose all `W*` widgets per UX map (SJ*/W* naming + DS patterns, reuse before creating) (refs: specs/polymarket-widget/NFR-MF-1, specs/polymarket-widget/spec §7.3, specs/polymarket-widget/NFR-DS-7)
- [ ] test: T701 — unit: `normalizeMarket` parse/align/clamp/malformed-exclude (refs: specs/polymarket-widget/AC1.*, specs/polymarket-widget/NFR-TEST-1)
- [ ] test: T702 — unit: bet cost/shares/payout math (refs: specs/polymarket-widget/AC5.2, specs/polymarket-widget/AC5.3)
- [ ] test: T703 — unit: position persistence + corrupt-storage recovery (refs: specs/polymarket-widget/AC6.*, specs/polymarket-widget/T3)
- [ ] test: T704 — unit: AI parse-ladder + validation (outcome∈labels, clamp, invalid-after-retry) (refs: specs/polymarket-widget/AC7.5, specs/polymarket-widget/AC7.6, specs/polymarket-widget/AC7.10)
- [ ] test: T705 — E2E (Playwright): search → open detail → select outcome → place simulated bet → see position (refs: specs/polymarket-widget/NFR-TEST-2)
- [ ] test: T706 — a11y verification: contrast AA, full keyboard operability, live regions, `prefers-reduced-motion`, color-not-sole-signal (refs: specs/polymarket-widget/NFR-A11Y-1..5)
- [ ] test: T707 — performance verification vs plan §4 budgets (bundle ≤150KB gz, LCP ≤2.5s, debounce, timeouts) (refs: specs/polymarket-widget/plan §4)
- [ ] security: T708 — security verification: no `v-html` on external data, CSP present, key only in `Authorization`, no key in URL/logs (refs: specs/polymarket-widget/plan §3, specs/polymarket-widget/T1, specs/polymarket-widget/T2)
- [ ] test: T709 — manual QA pass per user story US1–US9 (refs: specs/polymarket-widget/spec §2, specs/polymarket-widget/all AC)
- [ ] deploy: T801 — `wrangler.jsonc` Phase-1 SPA (`assets.directory=./dist`, `not_found_handling:"single-page-application"`, `observability.enabled`, `vars.VITE_BET_MODE=mock`); add `wrangler` dev dep (refs: specs/polymarket-widget/AC9.1, specs/polymarket-widget/D10, specs/polymarket-widget/deploy doc §2)  ⚠ requires --allow-new-dep
- [ ] deploy: T802 — `.github/workflows/deploy.yml`: on push to `main` → full gate (lint + format:check + unit + E2E) → build → `wrangler deploy`; least-privilege `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID` (refs: specs/polymarket-widget/AC9.1, specs/polymarket-widget/AC9.2, specs/polymarket-widget/T9, specs/polymarket-widget/deploy doc §5)
- [ ] security: T803 — env split enforcement: no secret in `VITE_*`/`vars`; post-build grep scan of `dist/` for key patterns (refs: specs/polymarket-widget/AC9.4, specs/polymarket-widget/NFR-SEC-1, specs/polymarket-widget/T5)
- [ ] deploy: T804 — CSP + `frame-ancestors 'none'` / `X-Frame-Options` response headers (refs: specs/polymarket-widget/plan §3, specs/polymarket-widget/T2, specs/polymarket-widget/T6)
- [ ] deploy: T805 — verify core runs with **no** deploy configured (local dev, `mock` + user key) (refs: specs/polymarket-widget/AC9.8)
- [ ] docs: T901 — README: setup, env vars, `npm run dev`, the full gate (refs: specs/polymarket-widget/AC9.8, specs/polymarket-widget/plan §5)
- [ ] docs: T902 — Runbook: deploy + `wrangler rollback`/`versions`, observability fields/alerts (refs: specs/polymarket-widget/AC9.7, specs/polymarket-widget/plan §6, specs/polymarket-widget/plan §8)
- [ ] docs: T903 — Document env switches / feature flags (`bet.mode`, `ai.mode`) (refs: specs/polymarket-widget/AC9.3, specs/polymarket-widget/plan §8)
