/**
 * Betting service (design.md §2.5, spec.md AC5.*, AC10.*, NFR-SVC-3).
 *
 * Betting lives behind ONE interface. `MockBettingService` is the default and
 * only implementation active in the demo; `ClobBettingService` is a documented
 * STRETCH stub behind the SAME signature (US10) that is never wired in the demo.
 * Components/stores depend on the interface, never a concrete class, so the two
 * are swappable at the single `createBettingService()` wiring point.
 *
 * Fee math is pure and shared via `lib/fees.ts` (re-exported here as the
 * service-contract entry point per design §2.5).
 */
import type { BetOrder, BetReceipt, BuilderConfig } from '../models/bet'
import { computeFees } from '../lib/fees'
import { isRealOrderPathEnabled } from '../config/features.config'

// Re-export so the fee contract is reachable from the betting service module
// (design §2.5) while the implementation stays in the pure `lib/fees.ts`.
export { computeFees } from '../lib/fees'

export interface BettingService {
  /** AC10.1: shared signature across mock and real. */
  placeBet(order: BetOrder): Promise<BetReceipt>
}

/** Typed validation failure — surfaced as a promise rejection, never thrown sync (AC5.7). */
export class BetValidationError extends Error {
  readonly kind = 'validation' as const
  constructor(message: string) {
    super(message)
    this.name = 'BetValidationError'
  }
}

/** Validates an order before it can be "filled" (AC5.4/AC5.5). Returns a message or null. */
export function validateOrder(order: BetOrder): string | null {
  if (!order.outcome || typeof order.outcome !== 'string') {
    return 'Select an outcome before placing a bet.'
  }
  if (!Number.isFinite(order.price) || order.price <= 0 || order.price > 1) {
    return 'The selected outcome has an invalid price.'
  }
  if (!Number.isFinite(order.size) || order.size <= 0) {
    return 'Enter a bet amount greater than $0.'
  }
  return null
}

function mockTxHash(): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(16).slice(2).padEnd(16, '0')
  return `mock-0x${rand.slice(0, 40)}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface MockBettingOptions {
  /** Fixed simulated network delay (ms). Omit for a ~300–800ms random delay. */
  delayMs?: number
}

/**
 * Default, builder-aware simulated betting (NFR-SVC-3). Validates the order,
 * simulates a short network delay, then resolves a filled receipt whose fees
 * and builderCode mirror what a real signed order would carry (AC5.1/AC5.9).
 * Validation failures reject (never throw synchronously) so component error
 * handling is uniform (AC5.7).
 */
export class MockBettingService implements BettingService {
  private readonly builderConfig: BuilderConfig
  private readonly options: MockBettingOptions

  constructor(builderConfig: BuilderConfig, options: MockBettingOptions = {}) {
    this.builderConfig = builderConfig
    this.options = options
  }

  async placeBet(order: BetOrder): Promise<BetReceipt> {
    const invalid = validateOrder(order)
    if (invalid) {
      // Async function → this becomes a promise rejection (AC5.7), not a sync throw.
      throw new BetValidationError(invalid)
    }

    const ms = this.options.delayMs ?? 300 + Math.round(Math.random() * 500) // 300–800ms
    await delay(ms)

    const cost = order.size * order.price // notional (AC5.2)
    const shares = order.size / order.price // AC5.3
    const fees = computeFees(cost, this.builderConfig, 'taker') // AC5.8

    return {
      status: 'filled',
      avgPrice: order.price,
      shares,
      cost,
      fees,
      builderCode: this.builderConfig.builderCode, // AC5.9
      txHash: mockTxHash(),
      filledAt: new Date().toISOString(),
    }
  }
}

// ---- STRETCH — gated by config/features.config.ts, never wired in the demo (AC10.1–AC10.5) ----
//
// TODO(US10): implement the real CLOB order path behind THIS interface.
//   - browser wallet signer (viem via window.ethereum / WalletConnect)
//   - sign L1 `ClobAuth` -> derive L2 creds -> build + sign V2 Order struct
//     (builder = builderConfig.builderCode) -> POST /order to the CLOB, no backend
//   - surface the SAME FeeBreakdown (via computeFees) BEFORE requesting the
//     signature (AC10.5)
// It is intentionally NOT implemented here. Enabling the flag must never submit
// a real order in this build; see createBettingService() below. Introducing this
// class would add `@polymarket/client` + `viem` — the only new deps in the repo,
// gated and out of the demo bundle path (design §7/§8).

/**
 * Single wiring point (NFR-SVC-3). Returns the mock service for the demo.
 * The real path is gated: even with the flag on, `ClobBettingService` is not
 * implemented in this build, so the mock is used and no real order is ever sent
 * (a dev-only note is logged so the gap is visible).
 */
export function createBettingService(builderConfig: BuilderConfig): BettingService {
  if (isRealOrderPathEnabled() && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      '[betting] VITE_ENABLE_REAL_ORDERS is set, but ClobBettingService is a ' +
        'documented STRETCH stub (US10) and is not implemented in this build — ' +
        'falling back to the mock. No real order will be submitted.',
    )
  }
  return new MockBettingService(builderConfig)
}
