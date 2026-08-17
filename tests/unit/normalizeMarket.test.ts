/**
 * Market normalization + envelope validation (T701 · AC1.* · NFR-TEST-1).
 * JSON-encoded-array parsing, positional alignment, short/unequal arrays, price
 * clamping, malformed-drop, and both response envelopes (via MSW — no live net).
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './msw/server'
import { normalizeMarket, searchMarkets, getMarkets } from '../../src/services/polymarket.service'

const GAMMA = 'https://gamma-api.polymarket.com'

function rawMarket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    image: 'https://img.example/btc.png',
    active: true,
    closed: false,
    ...overrides,
  }
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('normalizeMarket — happy path', () => {
  it('parses JSON-encoded arrays into positionally-aligned typed arrays', () => {
    const m = normalizeMarket(rawMarket())
    expect(m).not.toBeNull()
    expect(m!.outcomes).toEqual(['Yes', 'No'])
    expect(m!.prices).toEqual([0.62, 0.38])
    expect(m!.tokenIds).toEqual(['7190', '2836'])
    expect(m!.volume).toBe(5_250_000)
    expect(m!.liquidity).toBe(125_000)
    expect(m!.pricingReliable).toBe(true)
    // Alignment invariant: index i describes the same outcome across all arrays.
    expect(m!.outcomes[0]).toBe('Yes')
    expect(m!.prices[0]).toBe(0.62)
    expect(m!.tokenIds[0]).toBe('7190')
  })

  it('coerces a numeric id and falls back slug→id', () => {
    const m = normalizeMarket(rawMarket({ id: 999, slug: undefined }))
    expect(m!.id).toBe('999')
    expect(m!.slug).toBe('999')
  })
})

describe('normalizeMarket — price clamping (AC1.5)', () => {
  it('clamps out-of-range prices to [0,1] and flags unreliable', () => {
    const m = normalizeMarket(rawMarket({ outcomePrices: '["1.5", "-0.2"]' }))
    expect(m!.prices).toEqual([1, 0])
    expect(m!.pricingReliable).toBe(false)
  })

  it('treats a non-numeric price as 0 and flags unreliable (never NaN)', () => {
    const m = normalizeMarket(rawMarket({ outcomePrices: '["oops", "0.4"]' }))
    expect(m!.prices[0]).toBe(0)
    expect(Number.isNaN(m!.prices[0])).toBe(false)
    expect(m!.pricingReliable).toBe(false)
  })
})

describe('normalizeMarket — malformed → null (AC1.4)', () => {
  it('drops unequal-length arrays (positional misalignment)', () => {
    expect(normalizeMarket(rawMarket({ outcomePrices: '["0.62"]' }))).toBeNull()
  })
  it('drops invalid JSON in an encoded array', () => {
    expect(normalizeMarket(rawMarket({ outcomes: 'not json' }))).toBeNull()
  })
  it('drops a missing encoded array', () => {
    expect(normalizeMarket(rawMarket({ clobTokenIds: undefined }))).toBeNull()
  })
  it('drops when a required scalar is missing/wrong-typed', () => {
    expect(normalizeMarket(rawMarket({ question: undefined }))).toBeNull()
    expect(normalizeMarket(rawMarket({ volumeNum: '5250000' }))).toBeNull()
    expect(normalizeMarket(rawMarket({ active: 'yes' }))).toBeNull()
    expect(normalizeMarket(rawMarket({ endDate: 123 }))).toBeNull()
  })
  it('drops non-object / empty-outcome inputs without throwing', () => {
    expect(normalizeMarket(null)).toBeNull()
    expect(normalizeMarket('x')).toBeNull()
    expect(
      normalizeMarket(rawMarket({ outcomes: '[]', outcomePrices: '[]', clobTokenIds: '[]' })),
    ).toBeNull()
  })
})

describe('getMarkets — /markets array envelope', () => {
  it('normalizes valid markets and excludes malformed ones', async () => {
    server.use(
      http.get(`${GAMMA}/markets`, () =>
        HttpResponse.json([rawMarket(), rawMarket({ id: 'bad', outcomes: 'not json' })]),
      ),
    )
    const res = await getMarkets()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value).toHaveLength(1)
      expect(res.value[0]!.id).toBe('507081')
    }
  })

  it('returns a parse error when the envelope is not an array', async () => {
    server.use(http.get(`${GAMMA}/markets`, () => HttpResponse.json({ nope: true })))
    const res = await getMarkets()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('parse')
  })
})

describe('searchMarkets — /public-search {events,…} envelope', () => {
  it('flattens events[].markets and caps at 50', async () => {
    let capturedUrl = ''
    server.use(
      http.get(`${GAMMA}/public-search`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({
          events: [{ markets: [rawMarket(), rawMarket({ id: '2' })] }],
          tags: [],
          profiles: [],
        })
      }),
    )
    const res = await searchMarkets('bitcoin')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toHaveLength(2)
    expect(capturedUrl).toContain('limit=50')
    expect(capturedUrl).toContain('q=bitcoin')
  })

  it('returns a parse error when the envelope is not an object', async () => {
    server.use(http.get(`${GAMMA}/public-search`, () => HttpResponse.json([1, 2, 3])))
    const res = await searchMarkets('x')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('parse')
  })
})
