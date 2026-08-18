import { describe, expect, it } from 'vitest'
import {
  MockBettingService,
  BetValidationError,
  validateOrder,
  computeFees,
} from '../../src/services/betting.service'
import type { BetOrder, BuilderConfig } from '../../src/models/bet'

const CFG: BuilderConfig = {
  builderCode: '0xabc',
  builderTakerBps: 100, // 1%
  builderMakerBps: 50, // 0.5%
  platformBps: 25, // 0.25%
}

function order(overrides: Partial<BetOrder> = {}): BetOrder {
  return {
    marketId: 'm1',
    tokenId: 't1',
    outcome: 'Yes',
    side: 'BUY',
    size: 100,
    price: 0.5,
    ...overrides,
  }
}

describe('computeFees (AC5.8 — additive builder + platform, fee = notional × bps / 10000)', () => {
  it('computes builder + platform fees independently and sums them', () => {
    const fees = computeFees(200, CFG, 'taker')
    expect(fees.notional).toBe(200)
    expect(fees.builderBps).toBe(100)
    expect(fees.builderFee).toBeCloseTo(2, 10) // 200 × 100 / 10000
    expect(fees.platformBps).toBe(25)
    expect(fees.platformFee).toBeCloseTo(0.5, 10) // 200 × 25 / 10000
    expect(fees.total).toBeCloseTo(202.5, 10)
  })

  it('uses the maker rate on the maker side', () => {
    const fees = computeFees(200, CFG, 'maker')
    expect(fees.builderBps).toBe(50)
    expect(fees.builderFee).toBeCloseTo(1, 10) // 200 × 50 / 10000
  })

  it('a zero platform fee never suppresses a configured builder fee (AC5.8)', () => {
    const fees = computeFees(1000, { ...CFG, platformBps: 0 }, 'taker')
    expect(fees.platformFee).toBe(0)
    expect(fees.builderFee).toBeCloseTo(10, 10)
    expect(fees.total).toBeCloseTo(1010, 10)
  })

  it('a zero builder fee never suppresses a configured platform fee', () => {
    const fees = computeFees(1000, { ...CFG, builderTakerBps: 0 }, 'taker')
    expect(fees.builderFee).toBe(0)
    expect(fees.platformFee).toBeCloseTo(2.5, 10)
    expect(fees.total).toBeCloseTo(1002.5, 10)
  })

  it('treats a non-positive/non-finite notional as 0', () => {
    expect(computeFees(0, CFG, 'taker').total).toBe(0)
    expect(computeFees(Number.NaN, CFG, 'taker').total).toBe(0)
    expect(computeFees(-5, CFG, 'taker').notional).toBe(0)
  })
})

describe('MockBettingService.placeBet (AC5.1–AC5.3, AC5.9)', () => {
  it('resolves a filled receipt with cost = amount and toWin = amount/price', async () => {
    const svc = new MockBettingService(CFG, { delayMs: 0 })
    const receipt = await svc.placeBet(order({ size: 100, price: 0.5 }))

    expect(receipt.status).toBe('filled')
    expect(receipt.avgPrice).toBe(0.5)
    expect(receipt.cost).toBeCloseTo(100, 10) // = stake amount (AC5.2)
    expect(receipt.shares).toBeCloseTo(200, 10) // 100 / 0.5 → toWin = shares × $1
    expect(receipt.fees.notional).toBeCloseTo(100, 10) // notional = amount
    expect(receipt.fees.builderFee).toBeCloseTo(1, 10) // 100 × 100 / 10000
    expect(receipt.builderCode).toBe('0xabc') // AC5.9 (recorded on receipt)
    expect(receipt.txHash).toMatch(/^mock-0x/)
    expect(typeof receipt.filledAt).toBe('string')
  })

  it('matches the Polymarket model: cost = amount, toWin = amount / price', async () => {
    const svc = new MockBettingService(CFG, { delayMs: 0 })

    // E2E market: $100 on Yes @ 0.60 → cost $100, shares/toWin 166.67.
    const r1 = await svc.placeBet(order({ size: 100, price: 0.6 }))
    expect(r1.cost).toBeCloseTo(100, 10)
    expect(r1.shares).toBeCloseTo(166.6667, 3) // 100 / 0.60
    expect(r1.shares * 1).toBeCloseTo(166.6667, 3) // toWin = shares × $1

    // $5 on a 33.5¢ outcome → cost $5, toWin ≈ 14.93 (never a ~9× return).
    const r2 = await svc.placeBet(order({ size: 5, price: 0.335 }))
    expect(r2.cost).toBeCloseTo(5, 10)
    expect(r2.shares).toBeCloseTo(14.9254, 3) // 5 / 0.335
  })

  it('rejects (not sync-throw) an invalid amount (AC5.4/AC5.7)', async () => {
    const svc = new MockBettingService(CFG, { delayMs: 0 })
    await expect(svc.placeBet(order({ size: 0 }))).rejects.toBeInstanceOf(BetValidationError)
    await expect(svc.placeBet(order({ size: Number.NaN }))).rejects.toBeInstanceOf(
      BetValidationError,
    )
  })

  it('rejects an invalid outcome/price (AC5.5)', async () => {
    const svc = new MockBettingService(CFG, { delayMs: 0 })
    await expect(svc.placeBet(order({ outcome: '' }))).rejects.toBeInstanceOf(BetValidationError)
    await expect(svc.placeBet(order({ price: 0 }))).rejects.toBeInstanceOf(BetValidationError)
    await expect(svc.placeBet(order({ price: 1.5 }))).rejects.toBeInstanceOf(BetValidationError)
  })
})

describe('validateOrder', () => {
  it('returns null for a valid order and a message otherwise', () => {
    expect(validateOrder(order())).toBeNull()
    expect(validateOrder(order({ size: -1 }))).toMatch(/greater than/i)
    expect(validateOrder(order({ outcome: '' }))).toMatch(/outcome/i)
    expect(validateOrder(order({ price: 2 }))).toMatch(/price/i)
  })
})
