/**
 * Betting models (design.md §2.4 / spec.md AC5.*, AC6.*).
 * Types only. Fee math lives in `src/lib/fees.ts` (pure, no network).
 */

export type BetSide = 'BUY' // MVP: buying an outcome only (no sell/short).

export interface BetOrder {
  marketId: string
  tokenId: string
  outcome: string
  side: BetSide
  /** Dollar amount the user enters (AC5.4 validation target). */
  size: number
  /** Selected outcome's snapshot price at submit time (AC4.3). */
  price: number
}

export interface FeeBreakdown {
  /** = cost = size × price (AC5.2, AC5.8). */
  notional: number
  /** builderTakerBps (≤100) or builderMakerBps (≤50) per side (AC5.8). */
  builderBps: number
  /** notional × builderBps / 10000. */
  builderFee: number
  /** 0 by default; additive with builderFee, never suppressed (AC5.8). */
  platformBps: number
  /** notional × platformBps / 10000. */
  platformFee: number
  /** notional + builderFee + platformFee. */
  total: number
}

export interface BetReceipt {
  status: 'filled' | 'rejected'
  avgPrice: number
  /** = size / price (AC5.3). */
  shares: number
  /** = notional. */
  cost: number
  fees: FeeBreakdown
  /** bytes32 hex string, from config (AC5.9, NFR-SEC-4). */
  builderCode: string
  /** 'mock-0x…' for the simulated path. */
  txHash: string
  filledAt: string
}

export interface Position {
  id: string
  marketId: string
  /** Denormalized for display without a re-fetch (AC6.2). */
  marketQuestion: string
  outcome: string
  order: BetOrder
  receipt: BetReceipt
  createdAt: string
}

export interface BuilderConfig {
  /** From config, placeholder default (AC5.9, NFR-SEC-4). */
  builderCode: string
  builderTakerBps: number // ≤ 100
  builderMakerBps: number // ≤ 50
  platformBps: number // default 0
}
