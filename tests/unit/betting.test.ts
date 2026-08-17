/**
 * Bet math + finite guards + fail-safe factory (T702 · AC5.2/5.3/9.5 · T3/C10).
 */
import { describe, it, expect } from 'vitest'
import {
  MockBettingService,
  UnavailableBettingService,
  BettingError,
  createBettingService,
} from '../../src/services/betting.service'
import type { BetOrder } from '../../src/models/bet'

const noDelay = { delayMs: 0, txSuffix: () => 'a'.repeat(40) }

function order(overrides: Partial<BetOrder> = {}): BetOrder {
  return {
    marketId: '507081',
    tokenId: '7190',
    outcome: 'Yes',
    side: 'BUY',
    size: 100,
    price: 0.62,
    ...overrides,
  }
}

describe('MockBettingService — happy path math', () => {
  it('computes cost = size×price, shares = size/price, payout via shares, avgPrice = price', async () => {
    const svc = new MockBettingService(noDelay)
    const receipt = await svc.placeBet(order({ size: 100, price: 0.5 }))
    expect(receipt.status).toBe('filled')
    expect(receipt.cost).toBeCloseTo(50) // 100 × 0.5
    expect(receipt.shares).toBeCloseTo(200) // 100 / 0.5
    expect(receipt.avgPrice).toBe(0.5) // = selected snapshot price (prices[i])
    expect(receipt.txHash).toMatch(/^mock-0x[0-9a-f]+$/)
  })

  it('produces finite figures for a normal order', async () => {
    const svc = new MockBettingService(noDelay)
    const r = await svc.placeBet(order())
    for (const v of [r.cost, r.shares, r.avgPrice]) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('MockBettingService — guards (divide-by-zero / non-finite)', () => {
  it('rejects price <= 0 BEFORE dividing (no Infinity into receipt)', async () => {
    const svc = new MockBettingService(noDelay)
    await expect(svc.placeBet(order({ price: 0 }))).rejects.toMatchObject({
      error: { kind: 'validation' },
    })
  })

  it('rejects a non-finite price', async () => {
    const svc = new MockBettingService(noDelay)
    await expect(svc.placeBet(order({ price: Infinity }))).rejects.toBeInstanceOf(BettingError)
    await expect(svc.placeBet(order({ price: NaN }))).rejects.toBeInstanceOf(BettingError)
  })

  it('rejects non-positive / non-finite size', async () => {
    const svc = new MockBettingService(noDelay)
    await expect(svc.placeBet(order({ size: 0 }))).rejects.toMatchObject({
      error: { kind: 'validation' },
    })
    await expect(svc.placeBet(order({ size: -5 }))).rejects.toBeInstanceOf(BettingError)
    await expect(svc.placeBet(order({ size: NaN }))).rejects.toBeInstanceOf(BettingError)
  })
})

describe('createBettingService factory', () => {
  it('returns a working MockBettingService for mode "mock"', async () => {
    const svc = createBettingService('mock', noDelay)
    expect(svc.available).toBe(true)
    const r = await svc.placeBet(order())
    expect(r.status).toBe('filled')
  })

  it('fails safe for mode "real" — disabled, never throws at construction (C10)', async () => {
    const svc = createBettingService('real')
    expect(svc).toBeInstanceOf(UnavailableBettingService)
    expect(svc.available).toBe(false)
    expect(svc.unavailableReason).toMatch(/not available/i)
    // Attempting a bet rejects with a clear message rather than crashing.
    await expect(svc.placeBet(order())).rejects.toBeInstanceOf(BettingError)
  })
})
