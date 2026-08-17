/**
 * Betting service (T202 · AC5.1–5.3 / AC5.7 / AC9.5 · NFR-SVC-3 · D2/C10/C11).
 *
 * `BettingService` is the single seam a future on-chain `ClobBettingService` would
 * also implement (same signature). Only `MockBettingService` ships. The service is
 * PURE — it computes + simulates a fill and returns a receipt; persisting the
 * resulting position is the store's job (next agent), so nothing here imports a
 * store (plan §1).
 *
 * Math (AC5.2/5.3): `cost = size × price`, `shares = size / price`,
 * `payout = shares × $1`, `avgPrice = price` (the selected snapshot `prices[i]`).
 * A price of `0` is IN the clamped [0,1] range (AC1.5) → dividing would yield
 * `Infinity`, so `price <= 0` / non-finite is rejected BEFORE the division, and
 * `Number.isFinite` is asserted on cost/shares/payout before a receipt exists.
 */
import { appError, type AppError } from '../models/errors'
import type { BetOrder, BetReceipt } from '../models/bet'
import { config } from '../config'

/**
 * Rejection carrier for `placeBet`. The contract (AC5.7) is that `placeBet`
 * *rejects* on validation/simulated failure; callers `catch` and read `.error`
 * (an {@link AppError}) to map it to fixed UI copy.
 */
export class BettingError extends Error {
  readonly error: AppError
  constructor(error: AppError) {
    super(error.message ?? error.kind)
    this.name = 'BettingError'
    this.error = error
  }
}

export interface BettingService {
  /** Whether real fills are possible; `false` = disabled/fail-safe state (C10). */
  readonly available: boolean
  /** Human-readable reason when `available === false`. */
  readonly unavailableReason?: string
  /** Place a bet; resolves with a filled receipt or REJECTS with {@link BettingError}. */
  placeBet(order: BetOrder): Promise<BetReceipt>
}

export interface MockBettingOptions {
  /** Simulated network/settle delay (ms). Default 400; tests pass 0. */
  delayMs?: number
  /** Injectable delay (defaults to a real timer). */
  sleep?: (ms: number) => Promise<void>
  /** Injectable txHash suffix generator (defaults to crypto random hex). */
  txSuffix?: () => string
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function randomHex(): string {
  const bytes = new Uint8Array(20)
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The simulated betting implementation (D2). Always fills a *valid* order. */
export class MockBettingService implements BettingService {
  readonly available = true
  private readonly delayMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly txSuffix: () => string

  constructor(options: MockBettingOptions = {}) {
    this.delayMs = options.delayMs ?? 400
    this.sleep = options.sleep ?? realSleep
    this.txSuffix = options.txSuffix ?? randomHex
  }

  async placeBet(order: BetOrder): Promise<BetReceipt> {
    const { size, price } = order

    // Stake must be a positive finite number (AC5.4 is the UI mirror of this).
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      throw new BettingError(appError('validation', { message: 'size must be a positive number' }))
    }
    // Guard divide-by-zero / non-finite BEFORE computing shares (T3 / AC5.3).
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      throw new BettingError(
        appError('validation', { message: 'price must be a finite number greater than 0' }),
      )
    }

    const cost = size * price
    const shares = size / price
    const payout = shares * 1

    // Belt-and-braces: never emit a receipt / persist a non-finite figure (AC5.3).
    if (!Number.isFinite(cost) || !Number.isFinite(shares) || !Number.isFinite(payout)) {
      throw new BettingError(appError('sim-failure', { message: 'non-finite bet math' }))
    }

    if (this.delayMs > 0) await this.sleep(this.delayMs)

    return {
      status: 'filled',
      avgPrice: price, // = the selected outcome's snapshot price (prices[i], AC5.3)
      shares,
      cost,
      txHash: `mock-0x${this.txSuffix()}`,
    }
  }
}

/**
 * Fail-safe stand-in for `VITE_BET_MODE=real` when no CLOB adapter is built (C10 /
 * AC9.5). Constructing it NEVER throws; every `placeBet` rejects with a clear
 * message so the UI degrades to a disabled betting state instead of crashing.
 */
export class UnavailableBettingService implements BettingService {
  readonly available = false
  readonly unavailableReason =
    'Real betting mode is not available — no on-chain adapter is configured.'

  placeBet(): Promise<BetReceipt> {
    return Promise.reject(
      new BettingError(appError('sim-failure', { message: this.unavailableReason })),
    )
  }
}

/**
 * Select the betting implementation from `mode` (defaults to `config.betMode`).
 * `real` has no adapter yet → returns {@link UnavailableBettingService} (fail-safe,
 * never throws at startup, AC9.5/C10). `mock` (default) → {@link MockBettingService}.
 */
export function createBettingService(
  mode: 'mock' | 'real' = config.betMode,
  options?: MockBettingOptions,
): BettingService {
  if (mode === 'real') return new UnavailableBettingService()
  return new MockBettingService(options)
}
