/**
 * AI suggestion models (design.md §2.6 / spec.md AC7.*, AC9.*).
 * Types only.
 */

export interface AiPrediction {
  /** MUST be a verbatim member of the market's outcomes (AC7.6, AC7.10). */
  recommendedOutcome: string
  /** Clamped to [0,1] (AC7.6). */
  confidence: number
  /** Length-capped for display (AC7.6). */
  rationale: string
}

export interface AiMarketPick {
  /** MUST be one of the presented markets' ids (AC9.3). */
  recommendedMarketId: string
  confidence: number
  rationale: string
}
