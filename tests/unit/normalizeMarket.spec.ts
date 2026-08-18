import { describe, expect, it } from 'vitest'
import { normalizeMarket } from '../../src/services/polymarket.service'
import type { RawGammaMarket } from '../../src/models/market'

/** Minimal valid raw Gamma market; individual tests override fields. */
function rawMarket(overrides: Partial<RawGammaMarket> = {}): RawGammaMarket {
  return {
    id: '507081',
    question: 'Will Bitcoin exceed $100,000 by end of 2025?',
    slug: 'bitcoin-above-100k-2025',
    outcomes: '["Yes", "No"]',
    outcomePrices: '["0.62", "0.38"]',
    clobTokenIds: '["7190", "2836"]',
    volumeNum: 5_250_000,
    liquidityNum: 125_000,
    endDate: '2025-12-31T23:59:59Z',
    active: true,
    closed: false,
    ...overrides,
  }
}

describe('normalizeMarket', () => {
  // AC1.1 / AC1.2 — happy path: JSON string arrays parsed, positionally aligned.
  it('parses JSON-encoded arrays into aligned typed arrays (AC1.1, AC1.2)', () => {
    const m = normalizeMarket(rawMarket())
    expect(m).not.toBeNull()
    expect(m!.outcomes).toEqual(['Yes', 'No'])
    expect(m!.prices).toEqual([0.62, 0.38])
    expect(m!.tokenIds).toEqual(['7190', '2836'])
    // index i describes the same outcome across all three arrays.
    expect(m!.outcomes.length).toBe(m!.prices.length)
    expect(m!.outcomes.length).toBe(m!.tokenIds.length)
    expect(m!.pricingUnreliable).toBe(false)
  })

  // AC1.3 — prices coerced to numbers.
  it('coerces numeric-string prices to numbers (AC1.3)', () => {
    const m = normalizeMarket(rawMarket({ outcomePrices: '["0.5", "0.5"]' }))
    expect(m!.prices.every((p) => typeof p === 'number')).toBe(true)
    expect(m!.prices).toEqual([0.5, 0.5])
  })

  // AC1.4 — malformed markets excluded (return null), never throw.
  describe('malformed → excluded via null, never throws (AC1.4)', () => {
    it('missing field', () => {
      expect(
        normalizeMarket(rawMarket({ outcomes: undefined as unknown as string })),
      ).toBeNull()
    })

    it('non-JSON string', () => {
      expect(normalizeMarket(rawMarket({ outcomePrices: 'not-json' }))).toBeNull()
    })

    it('unequal array lengths', () => {
      expect(
        normalizeMarket(
          rawMarket({ outcomes: '["Yes", "No", "Maybe"]', outcomePrices: '["0.6", "0.4"]' }),
        ),
      ).toBeNull()
    })

    it('empty outcomes array', () => {
      expect(
        normalizeMarket(
          rawMarket({ outcomes: '[]', outcomePrices: '[]', clobTokenIds: '[]' }),
        ),
      ).toBeNull()
    })

    it('does not throw on garbage input', () => {
      expect(() =>
        normalizeMarket({ id: 'x', question: 'q' } as RawGammaMarket),
      ).not.toThrow()
      expect(normalizeMarket({ id: 'x', question: 'q' } as RawGammaMarket)).toBeNull()
    })
  })

  // AC1.5 — out-of-range / non-numeric prices clamped, flagged unreliable, never NaN.
  describe('out-of-range / non-numeric prices → clamp + flag (AC1.5)', () => {
    it('clamps a price above 1 to 1 and flags unreliable', () => {
      const m = normalizeMarket(rawMarket({ outcomePrices: '["1.4", "0.38"]' }))
      expect(m!.prices[0]).toBe(1)
      expect(m!.pricingUnreliable).toBe(true)
    })

    it('clamps a negative price to 0 and flags unreliable', () => {
      const m = normalizeMarket(rawMarket({ outcomePrices: '["-0.2", "0.38"]' }))
      expect(m!.prices[0]).toBe(0)
      expect(m!.pricingUnreliable).toBe(true)
    })

    it('replaces a non-numeric price with 0 (never NaN) and flags unreliable', () => {
      const m = normalizeMarket(rawMarket({ outcomePrices: '["abc", "0.38"]' }))
      expect(Number.isNaN(m!.prices[0])).toBe(false)
      expect(m!.prices[0]).toBe(0)
      expect(m!.pricingUnreliable).toBe(true)
    })
  })

  // Field mapping: numeric fallbacks and endDate resolution.
  it('maps volume/liquidity from *Num and string fallbacks', () => {
    const m = normalizeMarket(
      rawMarket({ volumeNum: undefined, liquidityNum: undefined, volume: '999', liquidity: '111' }),
    )
    expect(m!.volume).toBe(999)
    expect(m!.liquidity).toBe(111)
  })
})
