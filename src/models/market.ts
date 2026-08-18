/**
 * Normalized market model (design.md §2.2 / spec.md AC1.*).
 * Types only — no network logic. Real normalization lives in the (future)
 * service layer; the UI is built props-driven against these shapes.
 */

/** Raw shape as returned by Gamma. Kept for parity with the service contract. */
export interface RawGammaMarket {
  id: string
  question: string
  slug: string
  outcomes: string // JSON-encoded string[]
  outcomePrices: string // JSON-encoded string[] of numeric strings
  clobTokenIds: string // JSON-encoded string[]
  volumeNum?: number
  liquidityNum?: number
  /** String variants Gamma also returns; numeric `*Num` fields are preferred. */
  volume?: string
  liquidity?: string
  endDate?: string
  endDateIso?: string
  image?: string
  icon?: string
  /** Not returned by Gamma /markets; derived heuristically in normalization. */
  category?: string
  active: boolean
  closed: boolean
}

export interface Market {
  id: string
  question: string
  slug: string
  category: string
  /** AC1.1 — positionally aligned with `prices`/`tokenIds` (AC1.2). */
  outcomes: string[]
  /** AC1.3 — each clamped to [0,1] (AC1.5). */
  prices: number[]
  tokenIds: string[]
  volume: number
  liquidity: number
  endDate: string | null
  /** Emoji or short glyph used as the card avatar (CSP-safe, no remote image). */
  image: string | null
  active: boolean
  closed: boolean
  /** AC1.5 — true when any raw price was non-numeric or out of [0,1]. */
  pricingUnreliable: boolean
}
