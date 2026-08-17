/**
 * AI prediction contract (T101 · AC7.* · plan §2).
 *
 * Produced by `openrouter.service.predict`. The model output is treated as
 * UNTRUSTED: `recommendedOutcome` must be one of the market's outcome labels,
 * `confidence` is clamped to [0,1], `rationale` is length-capped (AC7.6/7.10).
 */
export interface AiPrediction {
  /** Verbatim one of the market's outcome labels (validated, AC7.10). */
  recommendedOutcome: string
  /** Decisiveness of the data, clamped to [0,1] (AC7.6). */
  confidence: number
  /** 2–3 sentence justification, length-capped for display. */
  rationale: string
  /** The resolved free model id that produced this prediction. */
  modelId: string
}
