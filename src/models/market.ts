/**
 * Normalized Market contract (T101 · AC1.* · plan §2).
 *
 * The Gamma payload delivers `outcomes`, `outcomePrices`, and `clobTokenIds` as
 * JSON-encoded STRINGS (research §1, "gotcha #1"). `normalizeMarket`
 * (polymarket.service) parses them into positionally-aligned arrays so the rest
 * of the app works with typed data — never raw strings, never `NaN`.
 */
export interface Market {
  id: string
  question: string
  slug: string
  /** Parsed from `raw.outcomes`. `outcomes[i]` ↔ `prices[i]` ↔ `tokenIds[i]` (AC1.2). */
  outcomes: string[]
  /** Parsed from `raw.outcomePrices`, coerced to number, clamped to [0,1] (AC1.3/1.5). */
  prices: number[]
  /** Parsed from `raw.clobTokenIds`. */
  tokenIds: string[]
  /** `raw.volumeNum`. */
  volume: number
  /** `raw.liquidityNum`. */
  liquidity: number
  /** ISO-8601 close timestamp (`raw.endDate`). */
  endDate: string
  /** Optional market image URL. */
  image?: string
  active: boolean
  closed: boolean
  /**
   * `false` when any price had to be clamped / was out of range / non-numeric
   * (AC1.5) — the UI flags pricing as unreliable and never renders `NaN`.
   */
  pricingReliable: boolean
}
