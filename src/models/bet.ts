/**
 * Betting contracts (T101 · AC5.* / AC6.* · plan §2).
 *
 * `BettingService.placeBet(o: BetOrder) => Promise<BetReceipt>` is the single seam
 * between the mock (shipping) and a future CLOB (real) implementation (D2). The
 * `price` field is the Gamma snapshot price used for the mock cost math; a future
 * `ClobBettingService` maps it to the order's marketable `priceLimit` — one
 * documented field, no shape drift (C11).
 */
export interface BetOrder {
  marketId: string
  tokenId: string
  outcome: string
  side: 'BUY'
  /** Stake in dollars. */
  size: number
  /** Selected outcome's snapshot price in (0,1]. */
  price: number
}

export interface BetReceipt {
  status: 'filled'
  /** Fill price — the selected outcome's snapshot price (`prices[i]`, AC5.3). */
  avgPrice: number
  /** `size / price`. */
  shares: number
  /** `size * price`. */
  cost: number
  txHash: string
}

/**
 * A persisted (simulated) position. Extends the receipt with the context needed
 * to render it later; `schemaVersion` gates the localStorage migration/recovery
 * path (AC6.4 — the store's job, next agent).
 */
export interface Position extends BetReceipt {
  id: string
  marketId: string
  question: string
  outcome: string
  size: number
  price: number
  /** ISO-8601 creation timestamp. */
  createdAt: string
  schemaVersion: 1
}
