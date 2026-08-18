/**
 * Polymarket Gamma read service (design.md §2.3; AC1, AC2, AC3, AC4).
 * All network I/O goes through `http.ts` (NFR-SVC-1). Betting stays mock.
 *
 * Base URL resolves from `VITE_GAMMA_BASE_URL` (default the public Gamma host).
 * Point that env at the Vite dev proxy (`/gamma-api`) to defeat CORS with zero
 * call-site changes (NFR-SVC-2).
 */
import type { Market, RawGammaMarket } from '../models/market'
import { buildQuery, fetchJson } from './http'

export const GAMMA_BASE_URL: string =
  (import.meta.env.VITE_GAMMA_BASE_URL as string | undefined) ?? 'https://gamma-api.polymarket.com'

/** Reads: short retry so a flaky network/5xx gets one more shot before falling back. */
const READ_RETRY = { attempts: 2, backoffMs: 300 }

export interface MarketListFilters {
  order?: 'volume' | 'liquidity' | 'startDate' | 'endDate'
  ascending?: boolean
  active?: boolean
  closed?: boolean
  limit?: number
  offset?: number
}

/* ----------------------------- normalization ----------------------------- */

function parseJsonArray(value: unknown): unknown[] | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return value
  const n = Number.parseFloat(String(value))
  return Number.isFinite(n) ? n : 0
}

/**
 * Gamma exposes no simple `category` on a market and its `image` is a remote
 * URL, while the (props-driven) UI expects a short label and an emoji glyph in
 * a text avatar. Derive both from question keywords so the existing cards keep
 * their look without a redesign. Best-effort only — documented discrepancy.
 */
const CATEGORY_RULES: Array<{ category: string; image: string; test: RegExp }> = [
  {
    category: 'Crypto',
    image: '₿',
    test: /\b(bitcoin|btc|ethereum|eth|crypto|solana|xrp|doge|coin|token|blockchain)\b/i,
  },
  {
    category: 'Politics',
    image: '🏛️',
    test: /\b(president|election|senate|congress|primary|vote|governor|parliament|prime minister|democrat|republican|trump|biden)\b/i,
  },
  {
    category: 'Economics',
    image: '🏦',
    test: /\b(fed|rate cut|inflation|gdp|recession|interest rate|unemployment|cpi|economy)\b/i,
  },
  {
    category: 'Sports',
    image: '🏆',
    test: /\b(super bowl|nba|nfl|world cup|champions league|premier league|final|cup|playoff|qualify|match|game|win the|team|series)\b/i,
  },
  {
    category: 'Tech',
    image: '🤖',
    test: /\b(openai|gpt|ai|apple|google|tesla|spacex|nvidia|chip|model|launch|release)\b/i,
  },
  {
    category: 'Entertainment',
    image: '🎬',
    test: /\b(oscar|movie|film|album|grammy|box office|netflix|show|season)\b/i,
  },
]

function deriveCategoryAndImage(question: string): { category: string; image: string } {
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(question)) return { category: rule.category, image: rule.image }
  }
  return { category: 'Markets', image: '📊' }
}

/**
 * Parses `outcomes`/`outcomePrices`/`clobTokenIds` (JSON-encoded strings) into
 * positionally-aligned arrays, coerces prices to numbers clamped to [0,1], and
 * returns `null` (never throws) for a malformed market (AC1.1–AC1.5).
 */
export function normalizeMarket(raw: RawGammaMarket): Market | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.question !== 'string') {
    return null
  }

  const outcomes = parseJsonArray(raw.outcomes)
  const rawPrices = parseJsonArray(raw.outcomePrices)
  const tokenIds = parseJsonArray(raw.clobTokenIds)

  // Missing or non-JSON → malformed (AC1.4).
  if (!outcomes || !rawPrices || !tokenIds) return null

  // Empty or unequal lengths → malformed (AC1.4).
  if (
    outcomes.length === 0 ||
    outcomes.length !== rawPrices.length ||
    outcomes.length !== tokenIds.length
  ) {
    return null
  }

  // Prices → numbers clamped to [0,1]; flag unreliable, never render NaN (AC1.3/1.5).
  let pricingUnreliable = false
  const prices = rawPrices.map((p) => {
    const n = typeof p === 'number' ? p : Number.parseFloat(String(p))
    if (!Number.isFinite(n)) {
      pricingUnreliable = true
      return 0
    }
    if (n < 0) {
      pricingUnreliable = true
      return 0
    }
    if (n > 1) {
      pricingUnreliable = true
      return 1
    }
    return n
  })

  const derived = deriveCategoryAndImage(raw.question)

  return {
    id: raw.id,
    question: raw.question,
    slug: typeof raw.slug === 'string' ? raw.slug : raw.id,
    category: typeof raw.category === 'string' && raw.category ? raw.category : derived.category,
    outcomes: outcomes.map((o) => String(o)),
    prices,
    tokenIds: tokenIds.map((t) => String(t)),
    volume: raw.volumeNum ?? toFiniteNumber(raw.volume),
    liquidity: raw.liquidityNum ?? toFiniteNumber(raw.liquidity),
    endDate: raw.endDate ?? raw.endDateIso ?? null,
    image: derived.image,
    active: raw.active ?? false,
    closed: raw.closed ?? false,
    pricingUnreliable,
  }
}

/* ------------------------------- endpoints ------------------------------- */

/** GET /markets — active, non-closed, top by volume by default (AC3.1). */
export async function getMarkets(
  filters: MarketListFilters = {},
  opts?: { signal?: AbortSignal },
): Promise<Market[]> {
  const qs = buildQuery({
    active: filters.active ?? true,
    closed: filters.closed ?? false,
    order: filters.order ?? 'volume',
    ascending: filters.ascending ?? false,
    limit: filters.limit ?? 20,
    offset: filters.offset,
  })
  const raw = await fetchJson<RawGammaMarket[]>(`${GAMMA_BASE_URL}/markets${qs}`, {
    retry: READ_RETRY,
    signal: opts?.signal,
  })
  const list = Array.isArray(raw) ? raw : []
  return list.map((m) => normalizeMarket(m)).filter((m): m is Market => m !== null)
}

interface PublicSearchResponse {
  events?: Array<{ markets?: RawGammaMarket[] }>
}

/** GET /public-search — flattens events[].markets[] through normalizeMarket (AC2.1). */
export async function searchMarkets(
  query: string,
  opts?: { signal?: AbortSignal },
): Promise<Market[]> {
  const term = query.trim()
  if (!term) return []
  const qs = buildQuery({ q: term, limit_per_type: 20, events_status: 'active' })
  const data = await fetchJson<PublicSearchResponse>(`${GAMMA_BASE_URL}/public-search${qs}`, {
    retry: READ_RETRY,
    signal: opts?.signal,
  })

  const seen = new Set<string>()
  const results: Market[] = []
  for (const event of data.events ?? []) {
    for (const rawMarket of event.markets ?? []) {
      const market = normalizeMarket(rawMarket)
      if (market && !seen.has(market.id)) {
        seen.add(market.id)
        results.push(market)
      }
    }
  }
  return results
}

/** GET /markets/{id} or /markets/slug/{slug} — single market detail (AC4.1). */
export async function getMarket(
  idOrSlug: string,
  opts?: { signal?: AbortSignal },
): Promise<Market | null> {
  const path = /^\d+$/.test(idOrSlug)
    ? `/markets/${encodeURIComponent(idOrSlug)}`
    : `/markets/slug/${encodeURIComponent(idOrSlug)}`
  const data = await fetchJson<RawGammaMarket | RawGammaMarket[]>(`${GAMMA_BASE_URL}${path}`, {
    retry: READ_RETRY,
    signal: opts?.signal,
  })
  const raw = Array.isArray(data) ? data[0] : data
  return raw ? normalizeMarket(raw) : null
}
