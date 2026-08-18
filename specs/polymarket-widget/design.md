# Design — Polymarket Widget

> Status: **AS-WILL-BE** technical design · Feature: `polymarket-widget`
> Anchored to `spec.md` (US1–US10, AC1._–AC10._, NFR-*, decisions D1–D12). Read that file first — this document does not restate rationale, only the concrete shape of the code that satisfies it.
> Sources: [`docs/analysis-and-architecture.md`](../../docs/analysis-and-architecture.md) §4–§6 · [`docs/research-polymarket-api.md`](../../docs/research-polymarket-api.md) · [`docs/research-polymarket-sdks-builder.md`](../../docs/research-polymarket-sdks-builder.md) · [`docs/research-openrouter-ai.md`](../../docs/research-openrouter-ai.md) · [`docs/research-ramoslabs-ds.md`](../../docs/research-ramoslabs-ds.md)

---

## 1. Arquitectura de carpetas

Confirmada contra `src/` real (scaffold actual: `main.ts`, `App.vue`, `styles/base.css`, `vite-env.d.ts`, y directorios vacíos `services/`, `models/`, `stores/`, `composables/`, `components/ui/`, `components/widget/` con `.gitkeep`). El árbol objetivo, base del analysis §4, con nombres de archivo exactos:

```
src/
  main.ts                        # ya existe: importa @ramoslabs/tokens/css + base.css, monta app + pinia
  App.vue                        # layout de página única (header/settings, search, list, detail, positions)
  vite-env.d.ts                  # ya existe

  services/
    http.ts                      # fetchJson<T>() wrapper: baseURL, timeout, retry, error normalization
    polymarket.service.ts        # searchMarkets, getMarkets, getMarket, normalizeMarket
    betting.service.ts           # BettingService interface, MockBettingService, computeFees, (ClobBettingService stretch)
    openrouter.service.ts        # pickFreeModel, predictOutcome, recommendMarket, parse ladder

  models/
    market.ts                    # Market, RawGammaMarket
    bet.ts                       # BetOrder, BetReceipt, Position, FeeBreakdown, BuilderConfig
    prediction.ts                # AiPrediction, AiMarketPick, OpenRouterModel

  stores/
    markets.store.ts             # pinia: results, defaultList, selectedMarket, loading/error/empty flags
    bets.store.ts                # pinia: positions[] (persisted), placeBet action
    settings.store.ts            # pinia: openRouterApiKey, builderCode, real-order feature flag (persisted)

  composables/
    useMarketSearch.ts           # debounce (≈300ms) + request-cancellation + loading/empty/error state machine
    useAiPrediction.ts           # wraps openrouter.service for US7 (outcome) + US9 (market pick), on-demand only

  components/
    ui/                          # SJ* primitives — see §3
      SJButton.vue
      SJInput.vue
      SJCard.vue
      SJBadge.vue
      SJModal.vue
      SJSpinner.vue
      SJSkeleton.vue
      SJLiveRegion.vue           # thin wrapper for role="status"/"alert" regions (shared by widgets)
    widget/                      # W* app widgets — see §3
      WMarketSearch.vue
      WMarketList.vue
      WMarketCard.vue
      WMarketDetail.vue
      WBetForm.vue
      WBetReceipt.vue
      WPositions.vue
      WAiPrediction.vue
      WAiMarketPick.vue
      WSettings.vue

  styles/
    base.css                     # ya existe: reset, .sr-only, .skip-link, .focus-ring

  config/
    builder.config.ts            # reads VITE_BUILDER_CODE / settings override; placeholder default (AC5.9, NFR-SEC-4)
    features.config.ts           # reads VITE_ENABLE_REAL_ORDERS (stretch gate, AC10.2)
```

**Deltas vs analysis §4 (confirmados intencionalmente):**

- Se añade `config/` (no estaba en el analysis) para aterrizar D11/D12/NFR-SEC-4 de forma explícita: el `builderCode` y el flag de orden real son **config**, no literales en servicios. Evita que `betting.service.ts` lea `import.meta.env` directamente y facilita testear `computeFees()` puro.
- Se añaden `SJLiveRegion.vue` (no listado en el analysis, pero exigido transversalmente por NFR-A11Y-3 en 6+ widgets — se factoriza para no repetir `aria-live` boilerplate) y `WAiMarketPick.vue` (el analysis mencionaba el botón "AI: pick a market" como acción sobre `WMarketList`, pero US9 tiene su propio ciclo loading/result/error → merece su propio componente, montado dentro de `WMarketList`/`App.vue`, no un botón suelto).
- `ClobBettingService` (US10/D12) vive en `betting.service.ts` junto a `MockBettingService` (mismo archivo, mismo interface) per AC10.1 — no se crea un archivo aparte para no sugerir que es una feature de primera clase; se aísla en una sección claramente marcada `// STRETCH — gated, see AC10.2`.
- No hay carpeta `assets/` ni `utils/` nuevas — utilidades puntuales (clamp, formatPercent, formatCurrency) viven en `models/` junto al tipo que formatean o como funciones exportadas de `services/polymarket.service.ts` / `betting.service.ts` (evita una carpeta cajón).

---

## 2. Contratos de servicios (TS)

### 2.1 `services/http.ts`

```ts
export interface HttpError {
  kind: 'network' | 'timeout' | 'http' | 'parse'
  status?: number // present when kind === 'http'
  message: string
  url: string
}

export interface FetchJsonOptions {
  timeoutMs?: number // default 8000
  signal?: AbortSignal // caller-provided cancellation (e.g. debounce supersede, AC2.2)
  headers?: Record<string, string>
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' // default GET
  body?: unknown // JSON body (serialized here; adds a JSON Content-Type when unset)
  retry?: { attempts: number; backoffMs: number } // default { attempts: 1, backoffMs: 0 } (no retry)
}

/**
 * Wraps fetch with a timeout (AbortController), JSON parsing, and a normalized
 * error shape. Never throws a raw Error — always rejects with HttpError so
 * callers can render (AC2.5, AC3.4) without try/catch on fetch internals.
 * NFR-SVC-1: this is the ONLY module allowed to call the global fetch().
 */
export function fetchJson<T>(url: string, opts?: FetchJsonOptions): Promise<T>

/** Builds a query string from a params object, skipping undefined/null values. */
export function buildQuery(params: Record<string, string | number | boolean | undefined>): string
```

- **NFR-SVC-2 (CORS contingency):** `fetchJson` takes an absolute or relative URL. `polymarket.service.ts` builds URLs from a single `GAMMA_BASE_URL` constant, itself resolved from `import.meta.env.VITE_GAMMA_BASE_URL ?? 'https://gamma-api.polymarket.com'`. `vite.config.ts` gets an optional `server.proxy['/gamma-api']` fallback entry (dev-only) so switching to the proxy is a one-line env change, zero call-site changes.
- Never logs response bodies containing an `Authorization` header value (observability rule, §6).
- **Discrepancy — `method`/`body` added (POST support).** The original contract was GET-only. It was extended with optional `method` and `body` so `openrouter.service.ts` can `POST /chat/completions` **through the same single fetch caller**, preserving **NFR-SVC-1** (`http.ts` remains the ONLY module that calls the global `fetch`). When a `body` is present it is `JSON.stringify`'d and a `Content-Type: application/json` header is added unless the caller already set one; reads that omit `method` continue to default to GET, so all existing Gamma call sites are unchanged.

### 2.2 `models/market.ts`

```ts
/** Raw shape as returned by Gamma /markets, /markets/{id}, /markets/slug/{slug}, /public-search. */
export interface RawGammaMarket {
  id: string
  question: string
  slug: string
  outcomes: string // JSON-encoded string[]
  outcomePrices: string // JSON-encoded string[] of numeric strings
  clobTokenIds: string // JSON-encoded string[]
  volumeNum?: number
  liquidityNum?: number
  volume?: string // string variant Gamma also returns; *Num fields preferred
  liquidity?: string
  endDate?: string
  endDateIso?: string
  image?: string // remote URL — NOT used for display (see note below)
  icon?: string
  category?: string // NOT returned by Gamma /markets; derived heuristically in normalization
  active: boolean
  closed: boolean
}

export interface Market {
  id: string
  question: string
  slug: string
  category: string // derived heuristically from question keywords (see note); never a raw Gamma field
  outcomes: string[] // AC1.1, positionally aligned with prices/tokenIds (AC1.2)
  prices: number[] // AC1.3, each clamped to [0,1] (AC1.5)
  tokenIds: string[]
  volume: number
  liquidity: number
  endDate: string | null
  image: string | null // a short emoji/glyph avatar, derived heuristically (see note) — NOT Gamma's remote image URL
  active: boolean
  closed: boolean
  pricingUnreliable: boolean // true when any raw price was non-numeric or out of [0,1] (AC1.5)
}
```

> **Note (implementation discrepancy — `category` / `image` are derived, not 1:1 from Gamma).** Gamma's `/markets` payload exposes no simple per-market `category`, and its `image` is a **remote URL** the CSP-safe card avatar does not load. Both fields are therefore **derived heuristically** in `normalizeMarket()`: `category` (and a matching emoji `image` glyph) come from keyword-matching the market `question` (`CATEGORY_RULES` → Crypto `₿`, Politics `🏛️`, Economics `🏦`, Sports `🏆`, Tech `🤖`, Entertainment `🎬`, default `Markets 📊`). A raw `category` from Gamma, when present, wins over the heuristic. This is best-effort labeling for display only — it does not affect prices, outcomes, volume/liquidity, or any AC1.* normalization guarantee.

### 2.3 `services/polymarket.service.ts`

```ts
export interface MarketListFilters {
  order?: 'volume' | 'liquidity' | 'startDate' | 'endDate'
  ascending?: boolean
  active?: boolean
  closed?: boolean
  limit?: number
  offset?: number
}

/**
 * Parses raw.outcomes / raw.outcomePrices / raw.clobTokenIds (JSON-encoded
 * strings, AC1.1) into aligned arrays (AC1.2), coerces prices to numbers in
 * [0,1] (AC1.3), clamps out-of-range/non-numeric prices and sets
 * pricingUnreliable=true rather than rendering NaN (AC1.5).
 * Returns null (not throw) when outcomes/outcomePrices/clobTokenIds are
 * missing, non-JSON, or of unequal length (AC1.4) — caller filters nulls out.
 */
export function normalizeMarket(raw: RawGammaMarket): Market | null

/** GET /public-search?q=&events_status=active — flattens events[].markets[] through normalizeMarket. AC2.1 */
export function searchMarkets(query: string, opts?: { signal?: AbortSignal }): Promise<Market[]>

/** GET /markets?closed=false&active=true&order=volume&ascending=false — default browse list. AC3.1 */
export function getMarkets(
  filters?: MarketListFilters,
  opts?: { signal?: AbortSignal },
): Promise<Market[]>

/** GET /markets/slug/{slug} (or /markets/{id} when idOrSlug is numeric-looking). AC4.1 */
export function getMarket(idOrSlug: string, opts?: { signal?: AbortSignal }): Promise<Market | null>
```

### 2.4 `models/bet.ts`

```ts
export type BetSide = 'BUY' // MVP: buying an outcome only, no sell/short (out of scope)

export interface BetOrder {
  marketId: string
  tokenId: string
  outcome: string
  side: BetSide
  size: number // dollar amount the user enters (AC5.4 validation target)
  price: number // selected outcome's snapshot price at submit time (AC4.3)
}

export interface FeeBreakdown {
  notional: number // = cost = size × price (AC5.2, AC5.8)
  builderBps: number // builderTakerBps (≤100) or builderMakerBps (≤50) per side (AC5.8)
  builderFee: number // notional × builderBps / 10000
  platformBps: number // 0 by default; additive with builderFee, never suppressed (AC5.8)
  platformFee: number // notional × platformBps / 10000
  total: number // notional + builderFee + platformFee
}

export interface BetReceipt {
  status: 'filled' | 'rejected'
  avgPrice: number
  shares: number // = size / price (AC5.3)
  cost: number // = notional
  fees: FeeBreakdown
  builderCode: string // bytes32 hex string, from config (AC5.9, NFR-SEC-4)
  txHash: string // 'mock-0x…' for MockBettingService
  filledAt: string // ISO timestamp
}

export interface Position {
  id: string // uuid, generated at receipt time
  marketId: string
  marketQuestion: string // denormalized for display without a re-fetch (AC6.2)
  outcome: string
  order: BetOrder
  receipt: BetReceipt
  createdAt: string // ISO timestamp
}

export interface BuilderConfig {
  builderCode: string // from config/builder.config.ts, placeholder default
  builderTakerBps: number // ≤ 100
  builderMakerBps: number // ≤ 50
  platformBps: number // default 0
}
```

### 2.5 `services/betting.service.ts`

```ts
export interface BettingService {
  placeBet(order: BetOrder): Promise<BetReceipt>;   // AC10.1: shared signature, mock and real
}

/**
 * Additive builder + platform fee math shared by Mock and Clob implementations
 * (D11, AC5.8). fee = notional × bps / 10000. A zero platformBps never
 * suppresses a configured builderBps (and vice versa) — both computed
 * independently, then summed into total.
 *
 * DISCREPANCY — single source of truth lives in `lib/fees.ts`. To keep the fee
 * math a pure, network-free, trivially-testable unit, the actual implementation
 * of `computeFees` lives in `src/lib/fees.ts` (alongside the demo `BuilderConfig`
 * default). `betting.service.ts` `import`s it and **re-exports** it
 * (`export { computeFees } from '../lib/fees'`) so the service module remains the
 * documented contract entry point (§2.5 / §7) while there is exactly ONE
 * implementation. Both `MockBettingService` and the stretch `ClobBettingService`
 * consume that same function.
 */
export function computeFees(notional: number, cfg: BuilderConfig, side: 'taker' | 'maker'): FeeBreakdown;

/**
 * Default and only implementation active in the demo (NFR-SVC-3).
 * Validates size>0/finite and a selected outcome (AC5.4, AC5.5) before
 * resolving — callers surface validation failures as BettingService promise
 * rejections, never thrown synchronously, so component error-handling is
 * uniform (AC5.7).
 */
export class MockBettingService implements BettingService {
  constructor(private builderConfig: BuilderConfig);
  placeBet(order: BetOrder): Promise<BetReceipt>;
  // internal: cost = size×price, shares = size/price, fees = computeFees(...),
  // simulated network delay (300–800ms), txHash = `mock-0x${uuid}`.
}

// ---- STRETCH — gated by config/features.config.ts, never wired in the demo (AC10.2–AC10.5) ----
export interface ClobSigner {
  // minimal viem-shaped surface the service depends on, so betting.service.ts
  // has no hard @polymarket/client / viem import in the core bundle path —
  // see §7 dependency note.
  getAddress(): Promise<`0x${string}`>;
  signTypedData(domain: unknown, types: unknown, value: unknown): Promise<`0x${string}`>;
}

export class ClobBettingService implements BettingService {
  constructor(private signer: ClobSigner, private builderConfig: BuilderConfig);
  // placeBet(): signs L1 ClobAuth -> derives L2 creds -> builds V2 Order struct
  // (builder = builderConfig.builderCode) -> signs Order -> POST /order.
  // Surfaces the SAME FeeBreakdown (via computeFees) BEFORE requesting the
  // signature (AC10.5). Never reachable unless VITE_ENABLE_REAL_ORDERS=1.
  placeBet(order: BetOrder): Promise<BetReceipt>;
}

/** Single wiring point (NFR-SVC-3): returns Clob only when the stretch flag is on. */
export function createBettingService(builderConfig: BuilderConfig): BettingService;
```

### 2.6 `models/prediction.ts`

```ts
export interface OpenRouterModel {
  id: string
  supported_parameters?: string[] // presence of 'structured_outputs' drives the ladder (AC7.4)
}

export interface AiPrediction {
  recommendedOutcome: string // MUST be verbatim member of the market's outcomes (AC7.6, AC7.10)
  confidence: number // clamped to [0,1] (AC7.6)
  rationale: string // length-capped for display (AC7.6)
}

export interface AiMarketPick {
  recommendedMarketId: string // MUST be one of the presented markets' ids (AC9.3)
  confidence: number // clamped to [0,1]
  rationale: string // length-capped for display
}
```

### 2.7 `services/openrouter.service.ts`

```ts
const MODEL_PREFERENCE = [
  'z-ai/glm-5.2:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'openai/gpt-oss-20b:free',
] as const

/** GET /api/v1/models, filters `:free`, walks MODEL_PREFERENCE, falls back to any
 *  free model advertising structured_outputs, then 'openrouter/free'. AC7.4 */
export function pickFreeModel(apiKey: string): Promise<string>

/** Single on-demand call (AC7.3). Applies the 3-step degradation ladder
 *  (AC7.5): json_schema strict -> json_object + instruction -> fence-strip +
 *  first-{}-block + retry once at temperature:0. Validates recommendedOutcome
 *  ∈ market.outcomes and clamps confidence (AC7.6); returns a rejected
 *  promise (never a fabricated/coerced result) when validation fails after
 *  the retry (AC7.9, AC7.10). */
export function predictOutcome(market: Market, apiKey: string): Promise<AiPrediction>

/** Same ladder/validation, over the currently visible market list (AC9.2–AC9.3, AC9.6). */
export function recommendMarket(markets: Market[], apiKey: string): Promise<AiMarketPick>
```

- **Security (NFR-SEC-1/2):** the `Authorization: Bearer <key>` header is attached only inside this module, built at call time from the string passed in — never interpolated into a URL, never logged (see §6). The key never crosses into `http.ts`'s generic logging path because `fetchJson` never logs request headers (module-wide rule, not per-call).

### 2.8 `config/builder.config.ts` / `config/features.config.ts`

```ts
// config/builder.config.ts
export function getBuilderConfig(overrides?: Partial<BuilderConfig>): BuilderConfig
// Resolution order: settings.store override (if user set one) > import.meta.env.VITE_BUILDER_CODE
// > placeholder default '0x0000000000000000000000000000000000000000000000000000000000000000'
// (a visibly-placeholder, invalid-length string — never a real committed value, AC5.9/NFR-SEC-4).
// builderTakerBps/builderMakerBps/platformBps default to safe demo values (e.g. 100/50/0) also env-overridable.

// config/features.config.ts
export function isRealOrderPathEnabled(): boolean
// import.meta.env.VITE_ENABLE_REAL_ORDERS === '1' — defaults to false/absent (AC10.2).
```

`.env.example` (new, tracked) documents `VITE_BUILDER_CODE`, `VITE_GAMMA_BASE_URL`, `VITE_ENABLE_REAL_ORDERS` with placeholder/commented-out values. No `.env` is required for the core demo (NFR-SEC-3) — every variable above has a safe default.

---

## 3. Árbol de componentes

### 3.1 `SJ*` primitives (`components/ui/`)

| Component      | Purpose                                                           | Key DS rules encoded                                                                                                              | AC/NFR coverage                               |
| -------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `SJButton`     | primary/secondary/ghost button                                    | `--radius-sm`, press-first states (`:active`→`:focus-visible`→`:hover` gated `hover:hover`), `--shadow-focus`, ≥24×24 (aim 44×44) | NFR-DS-3, NFR-DS-4, NFR-MF-2                  |
| `SJInput`      | text/number input w/ persistent `<label>`, help, inline error     | native-first, `:user-invalid`/`:user-valid`, `font-size:16px` floor, `inputmode`/`autocomplete`                                   | NFR-DS-5, NFR-MF-3, AC5.4, AC8.5              |
| `SJCard`       | market card / position card shell                                 | `--color-surface`, `--space-6` padding, `--radius-lg`, `--shadow-sm`                                                              | NFR-DS-8, AC3.2                               |
| `SJBadge`      | outcome/status chip (Yes/No, Open/Closed, unreliable-pricing)     | `--radius-pill`, semantic triad (`-surface`+`-border`+`-text`) + icon/text, never color-only                                      | NFR-DS-8, NFR-A11Y-2, AC4.2, AC4.5, AC1.5     |
| `SJModal`      | market detail container                                           | `--radius-xl`, `--shadow-lg`, `--z-modal-backdrop:500`/`--z-modal:600`, focus trap, Escape, focus-return, motion ≤300ms           | NFR-DS-8, NFR-A11Y-5, AC4.4                   |
| `SJSpinner`    | inline loading affordance                                         | `role="status"`, motion gated by `prefers-reduced-motion`                                                                         | NFR-A11Y-3, NFR-A11Y-4                        |
| `SJSkeleton`   | list/card loading placeholder                                     | built from `--color-surface`/`--color-border`, opacity/transform only                                                             | NFR-DS-6, AC3.3                               |
| `SJLiveRegion` | thin `role="status"`/`role="alert"` wrapper (polite vs assertive) | centralizes live-region markup so every widget below announces consistently                                                       | NFR-A11Y-3, AC2.3, AC2.5, AC5.6, AC7.7, AC9.4 |

### 3.2 `W*` widgets (`components/widget/`)

| Component       | Composes                                                                       | Primary AC coverage                                            |
| --------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `WMarketSearch` | `SJInput`, `SJLiveRegion` + `useMarketSearch`                                  | AC2.1–AC2.6                                                    |
| `WMarketList`   | `SJSkeleton`, `SJCard` (via `WMarketCard`), `WAiMarketPick` slot               | AC3.1–AC3.5, AC2.4/2.6 (renders default list when query empty) |
| `WMarketCard`   | `SJCard`, `SJBadge`                                                            | AC3.2                                                          |
| `WMarketDetail` | `SJModal`, `SJBadge` (outcomes), `WBetForm`, `WAiPrediction`                   | AC4.1–AC4.5                                                    |
| `WBetForm`      | `SJInput` (amount), `SJButton`, fee breakdown table                            | AC5.1–AC5.5, AC5.8                                             |
| `WBetReceipt`   | `SJBadge`/toast via `SJLiveRegion`                                             | AC5.6, AC5.9                                                   |
| `WPositions`    | `SJCard` list, empty state                                                     | AC6.1–AC6.4                                                    |
| `WAiPrediction` | `SJButton`, confidence bar (`--color-primary` + numeric label), `SJLiveRegion` | AC7.1–AC7.10                                                   |
| `WAiMarketPick` | `SJButton`, highlights a `WMarketCard`, `SJLiveRegion`                         | AC9.1–AC9.6                                                    |
| `WSettings`     | `SJModal` or panel, `SJInput` (key field), disclaimer text                     | AC8.1–AC8.5                                                    |

`App.vue` composes: header (title + Settings entry, US8) → `WMarketSearch` (US2) → `WMarketList` incl. `WAiMarketPick` (US3/US9) → `WMarketDetail` incl. `WBetForm`/`WBetReceipt`/`WAiPrediction` (US4/US5/US7) → `WPositions` (US6) → `WSettings` as an overlay (US8), matching the analysis §6 UX flow.

---

## 4. Estado (Pinia)

### `stores/markets.store.ts`

```ts
interface MarketsState {
  query: string
  results: Market[] // search results (US2)
  defaultList: Market[] // browse list (US3)
  selectedMarketId: string | null
  selectedOutcomeIndex: number | null
  searchStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error'
  browseStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error'
  searchError: string | null
  browseError: string | null
}
```

Not persisted (fresh browse/search on each load, per AC3.1). Actions: `search(query)` (debounced via `useMarketSearch`, cancels prior in-flight via `AbortController` — AC2.2), `loadDefaultList()`, `selectMarket(id)`, `selectOutcome(index)`.

### `stores/bets.store.ts`

```ts
interface BetsState {
  positions: Position[] // AC6.1, persisted
  placeStatus: 'idle' | 'submitting' | 'error'
  placeError: string | null
}
```

**Persists `positions` to `localStorage`** under key `polymarket-widget:positions:v1` (AC6.1). Hydration on store init: `JSON.parse` wrapped in try/catch — on missing key or parse failure, resets to `[]` without throwing (AC6.4). Action `placeBet(order)` delegates to the injected `BettingService`, appends the resulting `Position` only on `status:'filled'` resolution, leaves `positions` untouched on rejection (AC5.7).

### `stores/settings.store.ts`

```ts
interface SettingsState {
  openRouterApiKey: string | null // AC8.1, persisted
  builderCodeOverride: string | null // optional user override of config default, persisted
}
```

**Persists both fields to `localStorage`** under key `polymarket-widget:settings:v1` (AC8.1, AC8.2). `openRouterApiKey` is never included in any log statement or query string (NFR-SEC-1/2) — components read it only to pass directly into `openrouter.service.ts` calls.

**Persistence mechanism (all three stores):** a single small helper `stores/persist.ts` (`readJson<T>(key, fallback)` / `writeJson(key, value)`) used by `bets.store.ts` and `settings.store.ts`, keeping the try/catch-and-recover logic (AC6.4) in one tested place rather than duplicated per store. `markets.store.ts` does not use it (nothing persisted there).

---

## 5. Modelo de errores y estados

Every async-driven view (search, browse, detail load, bet submit, AI predict, AI market-pick) exposes a **4-state status** — `idle | loading | success/empty | error` — never a bare boolean `loading`, so empty and error are always distinguishable (AC2.4 vs AC2.5, AC3.5 vs AC3.4).

| View                                   | Loading                                                                                     | Empty                                                              | Error                                                                                        | Live region                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Search (`WMarketSearch`/`WMarketList`) | `SJSkeleton` list                                                                           | "No markets matched" (explicit, AC2.4)                             | error text + Retry button, previous results _not_ discarded silently (AC2.5)                 | `role="status" aria-live="polite"` while loading; `role="alert"` on error              |
| Browse (`WMarketList`)                 | `SJSkeleton` (AC3.3)                                                                        | "No active markets right now" (AC3.5)                              | error text + Retry (AC3.4)                                                                   | same pattern                                                                           |
| Detail (`WMarketDetail`)               | n/a (opened from an already-loaded card; re-fetch-on-open failure reuses the error pattern) | n/a                                                                | inline error if `getMarket` refresh fails                                                    | `role="alert"`                                                                         |
| Bet submit (`WBetForm`)                | button shows `SJSpinner`, disabled/inert while submitting                                   | n/a                                                                | inline error message, store unchanged, Retry re-enables the button (AC5.7)                   | toast via `SJLiveRegion` `role="status"` on success (AC5.6), `role="alert"` on failure |
| Positions (`WPositions`)               | n/a (synchronous from store)                                                                | first-run onboarding empty state, distinct tone from error (AC6.3) | n/a (corrupt storage recovers silently to empty per AC6.4 — no error UI, just an empty list) | n/a                                                                                    |
| AI outcome (`WAiPrediction`)           | `SJSpinner` + polite live region (AC7.7)                                                    | n/a (no-key state is a CTA, not "empty" — AC7.2)                   | error + Retry, never renders a partial/invalid result (AC7.9)                                | `role="status"` loading, `role="alert"` error                                          |
| AI market pick (`WAiMarketPick`)       | same pattern (AC9.4)                                                                        | n/a                                                                | same pattern (AC9.6)                                                                         | same                                                                                   |
| Settings (`WSettings`)                 | n/a                                                                                         | n/a                                                                | inline validation only (e.g. obviously-empty key on save)                                    | n/a                                                                                    |

**Reads degrade to fixtures (sanctioned failure mode, spec.md US2 note).** The Search/Browse "error" column above is the contract when the fixture fallback is disabled. By default, `markets.store` catches any read failure (network/CORS/geoblock/5xx) and **degrades to the bundled fixtures** (`fixtures/markets.ts`) with a `usingFallback` flag driving a "sample data" notice, instead of leaving the user on an error screen. The AC2.5/AC3.4 error-+-retry path stays implemented (`retry()`) as the secondary path, exercisable via a demo override — so a geoblocked/offline demo is always usable.

**No-key gating (AC7.2, AC9.1):** `WAiPrediction`/`WAiMarketPick` read `settings.store.openRouterApiKey`; when falsy, the action renders as a disabled/CTA state linking to `WSettings` and **never constructs an `openrouter.service.ts` call** — the gating lives in the widget, not the service, so the service itself has no knowledge of UI state.

---

## 6. Observabilidad-lite

Scope: browser-only, no backend, no telemetry vendor. "Observability" here means disciplined `console.*` usage plus resilient failure handling — enough to debug the demo without leaking secrets.

- **What is logged:** `console.error` (dev-only, gated by `import.meta.env.DEV`) for: Gamma fetch failures (URL + HTTP status + `HttpError.kind`, no response body), malformed-market exclusions (AC1.4 — logs the market `id` and the reason, not the raw payload, to avoid noise), `BettingService` rejections (validation reason only), OpenRouter ladder failures (**which stage failed** — schema/json_object/fence-strip/retry — never the request body or the API key).
- **What is never logged:** the OpenRouter API key (in any form — header, partial, hash), the full raw OpenRouter response body (only parse-stage + validation outcome), the `builderCode` is safe to log (it's not a secret, NFR-SEC-4) but request/response bodies containing it are still summarized, not dumped, to keep logs terse.
- **Network/parse failure handling:** every service function returns/rejects through `HttpError` (http.ts) or a typed rejection (`betting.service.ts`, `openrouter.service.ts`) — components never receive a raw `Error` from `fetch()` or `JSON.parse()`; `normalizeMarket` never throws (returns `null`, AC1.4); the AI parse ladder never throws mid-ladder (each stage catches and falls through to the next, final failure is one typed rejection, AC7.9/AC9.6).
- **No PII, no analytics SDK, no third-party beacon** — nothing to configure, nothing to gate behind consent (no user data leaves the browser except: Gamma GETs, and OpenRouter POSTs the user opted into with their own key).

---

## 7. Mapa AC → módulo

| AC / NFR               | Módulo(s)                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1.1–AC1.5            | `services/polymarket.service.ts` (`normalizeMarket`), `models/market.ts`                                                                                                                                                                                         |
| AC2.1–AC2.6            | `composables/useMarketSearch.ts`, `stores/markets.store.ts`, `components/widget/WMarketSearch.vue`, `components/widget/WMarketList.vue`, `components/ui/SJLiveRegion.vue`                                                                                        |
| AC3.1–AC3.5            | `stores/markets.store.ts` (`loadDefaultList`), `services/polymarket.service.ts` (`getMarkets`), `WMarketList.vue`, `SJSkeleton.vue`                                                                                                                              |
| AC4.1–AC4.5            | `components/widget/WMarketDetail.vue`, `components/ui/SJModal.vue`, `SJBadge.vue`, `stores/markets.store.ts` (`selectMarket`/`selectOutcome`)                                                                                                                    |
| AC5.1–AC5.9            | `lib/fees.ts` (`computeFees` — pure source of truth, re-exported by the service), `services/betting.service.ts` (`MockBettingService`), `models/bet.ts`, `stores/bets.store.ts`, `components/widget/WBetForm.vue`, `WBetReceipt.vue`, `config/builder.config.ts` |
| AC6.1–AC6.4            | `stores/bets.store.ts`, `stores/persist.ts`, `components/widget/WPositions.vue`                                                                                                                                                                                  |
| AC7.1–AC7.10           | `services/openrouter.service.ts` (`pickFreeModel`, `predictOutcome`), `composables/useAiPrediction.ts`, `components/widget/WAiPrediction.vue`, `models/prediction.ts`                                                                                            |
| AC8.1–AC8.5            | `stores/settings.store.ts`, `components/widget/WSettings.vue`                                                                                                                                                                                                    |
| AC9.1–AC9.6            | `services/openrouter.service.ts` (`recommendMarket`), `composables/useAiPrediction.ts`, `components/widget/WAiMarketPick.vue`, `models/prediction.ts`                                                                                                            |
| AC10.1–AC10.5          | `services/betting.service.ts` (`ClobBettingService`, `createBettingService`), `config/features.config.ts`                                                                                                                                                        |
| NFR-DS-1…8             | `components/ui/*`, `components/widget/*`, `styles/base.css` (no raw literals anywhere in `<style>` blocks)                                                                                                                                                       |
| NFR-MF-1…4             | `components/ui/*`, `components/widget/*` (breakpoint media queries at `md`/`lg`/etc, sticky CTA in `WBetForm`)                                                                                                                                                   |
| NFR-A11Y-1…5           | `components/ui/SJLiveRegion.vue`, `SJModal.vue` (focus trap/return), all `SJBadge` usages (color+text), `styles/base.css` (`.sr-only`, `.focus-ring`, reduced-motion gates)                                                                                      |
| NFR-THEME-1            | `styles/base.css`, absence of any `@media (prefers-color-scheme: dark)` / `[data-theme]` block repo-wide                                                                                                                                                         |
| NFR-SEC-1…5            | `stores/settings.store.ts`, `services/openrouter.service.ts` (header-only key usage), `config/builder.config.ts`, `.env.example`                                                                                                                                 |
| NFR-SVC-1…3            | `services/http.ts` (sole fetch caller), `vite.config.ts` (dev proxy fallback), `services/betting.service.ts` (`createBettingService` single wiring point)                                                                                                        |
| NFR-TEST-1, NFR-TEST-2 | `tests/unit/*.spec.ts`, `tests/e2e/*.spec.ts` — see `tasks.md` §test streams                                                                                                                                                                                     |

---

## 8. Nota de dependencias (resumen — detalle completo en `tasks.md` §Validación de deps)

El **core** (US1–US9, incl. mock bet builder-aware) requiere **cero dependencias nuevas** — todo el I/O es `fetch()` nativo (Gamma reads, OpenRouter chat completions), sin SDK. Solo el **stretch US10** (`ClobBettingService`, gated, nunca activo en el demo) introduciría `@polymarket/client` (o `@polymarket/clob-client`) + `viem` — y únicamente si se decide implementarlo; el interface `BettingService`/`computeFees` ya está listo para recibirlo sin refactor.
