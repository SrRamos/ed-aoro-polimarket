/**
 * Polymarket Gamma read service (T201 · AC1.* / AC2.1 / AC3.1 / AC4.1 · NFR-SVC-1/3).
 *
 * All reads are PUBLIC, unauthenticated GETs — no API key, no secret ever touches
 * this path (NFR-SEC-3 / D1). Every raw payload is validated against an explicit
 * (hand-rolled, discipline-enforced) schema before consumption:
 *   - the response ENVELOPE (`/markets` → array, `/public-search` → `{events,…}`),
 *   - and each market as a WHOLE object (not just the three arrays, AC1.4).
 *
 * The Gamma "gotcha #1": `outcomes` / `outcomePrices` / `clobTokenIds` arrive as
 * JSON-encoded STRINGS; `normalizeMarket` `JSON.parse`s them into positionally-
 * aligned arrays, coerces prices to numbers, clamps to [0,1], and DROPS (returns
 * `null` for) any malformed market rather than throwing (AC1.1–1.5).
 */
import { appError, err, ok, type AppError, type Result } from '../models/errors'
import type { Market } from '../models/market'
import { httpRequestJson } from './http'
import { config } from '../config'

/** Upper bound on search results mounted at once (C5 / AC2.1). */
const SEARCH_LIMIT = 50
/** Default browse-list size (AC3.1). */
const BROWSE_LIMIT = 20

// --- Low-level type guards -------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** `JSON.parse` a JSON-encoded string field into an array, or `null` if invalid. */
function parseJsonArray(value: unknown): unknown[] | null {
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Clamp a price to [0,1]; report whether it was already a clean in-range number. */
function clampPrice(raw: unknown): { value: number; reliable: boolean } {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return { value: 0, reliable: false }
  if (n < 0) return { value: 0, reliable: false }
  if (n > 1) return { value: 1, reliable: false }
  return { value: n, reliable: true }
}

// --- Normalization (AC1.1–1.5) --------------------------------------------

/**
 * Validate + normalize ONE raw Gamma market. Returns a typed {@link Market}, or
 * `null` when any consumed field is missing / wrong-typed, any of the three
 * JSON-encoded arrays is absent / not valid JSON / not positionally aligned
 * (unequal length), or there are zero outcomes. Never throws (AC1.4).
 */
export function normalizeMarket(raw: unknown): Market | null {
  if (!isObject(raw)) return null

  // Scalar fields consumed downstream — whole-object validation (AC1.4).
  const { question, endDate, volumeNum, liquidityNum, active, closed } = raw
  if (typeof question !== 'string' || question.length === 0) return null
  if (typeof endDate !== 'string' || endDate.length === 0) return null
  if (typeof volumeNum !== 'number' || !Number.isFinite(volumeNum)) return null
  if (typeof liquidityNum !== 'number' || !Number.isFinite(liquidityNum)) return null
  if (typeof active !== 'boolean' || typeof closed !== 'boolean') return null

  // id / slug — coerce id to string; slug falls back to id when absent.
  const idRaw = raw.id
  const id = typeof idRaw === 'string' ? idRaw : typeof idRaw === 'number' ? String(idRaw) : null
  if (id === null || id.length === 0) return null
  const slug = typeof raw.slug === 'string' && raw.slug.length > 0 ? raw.slug : id

  // The three JSON-encoded string arrays (gotcha #1).
  const outcomesRaw = parseJsonArray(raw.outcomes)
  const pricesRaw = parseJsonArray(raw.outcomePrices)
  const tokenIdsRaw = parseJsonArray(raw.clobTokenIds)
  if (outcomesRaw === null || pricesRaw === null || tokenIdsRaw === null) return null

  // Positional alignment: all three must be the same non-zero length (AC1.2).
  const len = outcomesRaw.length
  if (len === 0 || pricesRaw.length !== len || tokenIdsRaw.length !== len) return null

  const outcomes: string[] = []
  const prices: number[] = []
  const tokenIds: string[] = []
  let pricingReliable = true

  for (let i = 0; i < len; i++) {
    const label = outcomesRaw[i]
    if (typeof label !== 'string' || label.length === 0) return null
    outcomes.push(label)

    const { value, reliable } = clampPrice(pricesRaw[i])
    prices.push(value)
    if (!reliable) pricingReliable = false

    // tokenIds are opaque ids — coerce string|number, reject anything else.
    const tid = tokenIdsRaw[i]
    if (typeof tid === 'string') tokenIds.push(tid)
    else if (typeof tid === 'number') tokenIds.push(String(tid))
    else return null
  }

  const image = typeof raw.image === 'string' ? raw.image : undefined

  return {
    id,
    question,
    slug,
    outcomes,
    prices,
    tokenIds,
    volume: volumeNum,
    liquidity: liquidityNum,
    endDate,
    ...(image !== undefined ? { image } : {}),
    active,
    closed,
    pricingReliable,
  }
}

/** Normalize a list of raw markets, silently excluding malformed ones. */
function normalizeMany(rawList: unknown[]): Market[] {
  const out: Market[] = []
  for (const raw of rawList) {
    const m = normalizeMarket(raw)
    if (m !== null) out.push(m)
  }
  return out
}

// --- Envelope validation ---------------------------------------------------

/** `/markets` returns a bare array. */
function unwrapMarketsEnvelope(raw: unknown): Result<unknown[], AppError> {
  if (Array.isArray(raw)) return ok(raw)
  return err(appError('parse', { message: '/markets envelope was not an array' }))
}

/** `/public-search` returns `{ events, tags, profiles }`, each event carrying `markets`. */
function unwrapSearchEnvelope(raw: unknown): Result<unknown[], AppError> {
  if (!isObject(raw)) {
    return err(appError('parse', { message: '/public-search envelope was not an object' }))
  }
  const events = raw.events
  if (events === undefined) return ok([]) // well-formed but empty
  if (!Array.isArray(events)) {
    return err(appError('parse', { message: '/public-search events was not an array' }))
  }
  const markets: unknown[] = []
  for (const event of events) {
    if (isObject(event) && Array.isArray(event.markets)) markets.push(...event.markets)
  }
  return ok(markets)
}

// --- Public API ------------------------------------------------------------

/**
 * Full-text market search (AC2.1). Caps results at `limit=50` (C5). Aborting via
 * `signal` cancels a superseded request.
 */
export async function searchMarkets(
  query: string,
  signal?: AbortSignal,
): Promise<Result<Market[], AppError>> {
  const params = new URLSearchParams({
    q: query,
    limit: String(SEARCH_LIMIT),
    events_status: 'active',
  })
  const res = await httpRequestJson(`/public-search?${params.toString()}`, {
    baseUrl: config.gammaBaseUrl,
    ...(signal ? { signal } : {}),
  })
  if (!res.ok) return res
  const envelope = unwrapSearchEnvelope(res.value)
  if (!envelope.ok) return envelope
  return ok(normalizeMany(envelope.value).slice(0, SEARCH_LIMIT))
}

export interface MarketFilters {
  limit?: number
}

/**
 * Default browse list: active, non-closed markets ordered by volume desc,
 * capped at `limit=20` (AC3.1).
 */
export async function getMarkets(
  filters: MarketFilters = {},
  signal?: AbortSignal,
): Promise<Result<Market[], AppError>> {
  const params = new URLSearchParams({
    closed: 'false',
    active: 'true',
    order: 'volume',
    ascending: 'false',
    limit: String(filters.limit ?? BROWSE_LIMIT),
  })
  const res = await httpRequestJson(`/markets?${params.toString()}`, {
    baseUrl: config.gammaBaseUrl,
    ...(signal ? { signal } : {}),
  })
  if (!res.ok) return res
  const envelope = unwrapMarketsEnvelope(res.value)
  if (!envelope.ok) return envelope
  return ok(normalizeMany(envelope.value))
}

/**
 * Fetch a single market by slug (`/markets/slug/{slug}`). Returns `null` in the
 * success channel when the market exists but is malformed (excluded), or an
 * {@link AppError} on transport/envelope failure.
 */
export async function getMarket(
  slug: string,
  signal?: AbortSignal,
): Promise<Result<Market | null, AppError>> {
  const res = await httpRequestJson(`/markets/slug/${encodeURIComponent(slug)}`, {
    baseUrl: config.gammaBaseUrl,
    ...(signal ? { signal } : {}),
  })
  if (!res.ok) return res
  // Gamma may answer with a bare object or a single-element array.
  const raw = Array.isArray(res.value) ? res.value[0] : res.value
  return ok(normalizeMarket(raw))
}
