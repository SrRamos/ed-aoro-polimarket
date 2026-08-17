/**
 * Mock/demo adapter (opt-in `VITE_USE_MOCK_DATA` mode).
 *
 * Verifies the fixture-backed seams the real services delegate to when the flag is
 * on: case-insensitive query filtering + limit, top-by-volume browse, id/slug
 * lookup, the presence of a >2-outcome fixture (neutral-chip path), and that the
 * canned prediction honors the same validation contract as the real service.
 * These adapters are pure delegators fed a limit, so they need no config toggle.
 */
import { describe, it, expect } from 'vitest'
import {
  mockSearchMarkets,
  mockGetMarkets,
  mockGetMarket,
  mockPredict,
} from '../../src/services/mock/mock.adapter'
import { MOCK_MARKETS, mockPrediction, MOCK_MODEL_ID } from '../../src/services/mock/fixtures'

function unwrap<T>(res: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!res.ok) throw new Error('expected ok Result')
  return res.value
}

describe('mock fixtures', () => {
  it('ships 8–12 realistic normalized markets', () => {
    expect(MOCK_MARKETS.length).toBeGreaterThanOrEqual(8)
    expect(MOCK_MARKETS.length).toBeLessThanOrEqual(12)
  })

  it('every fixture is positionally aligned and in-range', () => {
    for (const m of MOCK_MARKETS) {
      expect(m.outcomes.length).toBe(m.prices.length)
      expect(m.outcomes.length).toBe(m.tokenIds.length)
      expect(m.outcomes.length).toBeGreaterThan(0)
      for (const p of m.prices) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
      }
      expect(m.pricingReliable).toBe(true)
    }
  })

  it('includes at least one >2-outcome market (neutral-chip path)', () => {
    const multi = MOCK_MARKETS.filter((m) => m.outcomes.length > 2)
    expect(multi.length).toBeGreaterThanOrEqual(1)
    expect(multi[0]!.outcomes.length).toBeGreaterThanOrEqual(3)
  })

  it('includes markets carrying an image URL', () => {
    expect(MOCK_MARKETS.some((m) => typeof m.image === 'string' && m.image.length > 0)).toBe(true)
  })
})

describe('mockSearchMarkets', () => {
  it('filters case-insensitively by question and respects the limit', async () => {
    const res = await mockSearchMarkets('BITCOIN', 50)
    const markets = unwrap(res)
    expect(markets.length).toBeGreaterThanOrEqual(1)
    expect(markets.every((m) => m.question.toLowerCase().includes('bitcoin'))).toBe(true)
  })

  it('caps the result count at the given limit', async () => {
    const res = await mockSearchMarkets('', 3)
    expect(unwrap(res).length).toBe(3)
  })

  it('returns an empty list when nothing matches', async () => {
    const res = await mockSearchMarkets('zzz-no-such-market-zzz', 50)
    expect(unwrap(res)).toEqual([])
  })
})

describe('mockGetMarkets', () => {
  it('returns top fixtures by volume descending, capped at the limit', async () => {
    const res = await mockGetMarkets(5)
    const markets = unwrap(res)
    expect(markets.length).toBe(5)
    for (let i = 1; i < markets.length; i++) {
      expect(markets[i - 1]!.volume).toBeGreaterThanOrEqual(markets[i]!.volume)
    }
  })
})

describe('mockGetMarket', () => {
  it('finds a fixture by slug', async () => {
    const res = await mockGetMarket('bitcoin-above-100k-2025')
    expect(unwrap(res)?.slug).toBe('bitcoin-above-100k-2025')
  })

  it('finds a fixture by id', async () => {
    const res = await mockGetMarket('507081')
    expect(unwrap(res)?.id).toBe('507081')
  })

  it('returns null in the success channel on a miss', async () => {
    const res = await mockGetMarket('does-not-exist')
    expect(unwrap(res)).toBeNull()
  })
})

describe('mockPredict / mockPrediction', () => {
  it('produces a contract-valid prediction (outcome ∈ outcomes, confidence ∈ [0,1])', async () => {
    const market = MOCK_MARKETS[0]!
    const res = await mockPredict(market)
    const p = unwrap(res)
    expect(market.outcomes).toContain(p.recommendedOutcome)
    expect(p.confidence).toBeGreaterThanOrEqual(0)
    expect(p.confidence).toBeLessThanOrEqual(1)
    expect(typeof p.rationale).toBe('string')
    expect(p.rationale.length).toBeGreaterThan(0)
    expect(p.modelId).toBe(MOCK_MODEL_ID)
  })

  it('recommends the highest-priced outcome, including on a >2-outcome market', () => {
    const multi = MOCK_MARKETS.find((m) => m.outcomes.length > 2)!
    const p = mockPrediction(multi)
    const maxPrice = Math.max(...multi.prices)
    const expected = multi.outcomes[multi.prices.indexOf(maxPrice)]
    expect(p.recommendedOutcome).toBe(expected)
    expect(multi.outcomes).toContain(p.recommendedOutcome)
  })
})
