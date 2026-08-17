/**
 * Markets store (T301 · AC2.x / AC3.x / AC4.3 · PERF-12).
 * Service module is mocked — no MSW / live network needed for store logic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Market } from '../../src/models/market'
import { ok, err, type Result, type AppError } from '../../src/models/errors'

const getMarkets = vi.fn()
const getMarket = vi.fn()

vi.mock('../../src/services/polymarket.service', () => ({
  getMarkets: (...args: unknown[]) => getMarkets(...args),
  getMarket: (...args: unknown[]) => getMarket(...args),
}))

// Import AFTER the mock is registered.
import { useMarketsStore } from '../../src/stores/markets.store'

function market(overrides: Partial<Market> = {}): Market {
  return {
    id: '1',
    question: 'Will it rain?',
    slug: 'will-it-rain',
    outcomes: ['Yes', 'No'],
    prices: [0.62, 0.38],
    tokenIds: ['a', 'b'],
    volume: 412_000,
    liquidity: 85_000,
    endDate: '2025-12-31T00:00:00Z',
    active: true,
    closed: false,
    pricingReliable: true,
    ...overrides,
  }
}

const okList = (data: Market[]): Result<Market[], AppError> => ok(data)

beforeEach(() => {
  setActivePinia(createPinia())
  getMarkets.mockReset()
  getMarket.mockReset()
})

describe('loadMarkets (AC3.1)', () => {
  it('goes loading → success with the browse list', async () => {
    getMarkets.mockResolvedValue(okList([market()]))
    const store = useMarketsStore()
    expect(store.listState.status).toBe('idle')
    const p = store.loadMarkets()
    expect(store.listState.status).toBe('loading')
    await p
    expect(store.listState.status).toBe('success')
    expect(store.browseMarkets).toHaveLength(1)
  })

  it('surfaces a transport error as an error state', async () => {
    getMarkets.mockResolvedValue(err<AppError>({ kind: 'timeout' }))
    const store = useMarketsStore()
    await store.loadMarkets()
    expect(store.listState.status).toBe('error')
    if (store.listState.status === 'error') expect(store.listState.error.kind).toBe('timeout')
    expect(store.browseMarkets).toEqual([])
  })
})

describe('selection reuse (PERF-12)', () => {
  it('reuses a market already in the browse list without fetching', async () => {
    getMarkets.mockResolvedValue(okList([market({ id: '42', slug: 'forty-two' })]))
    const store = useMarketsStore()
    await store.loadMarkets()

    await store.selectByIdOrSlug('forty-two')
    expect(getMarket).not.toHaveBeenCalled()
    expect(store.selectedMarket?.id).toBe('42')
    expect(store.selectState.status).toBe('success')
  })

  it('reuses a market from the search results too', async () => {
    getMarkets.mockResolvedValue(okList([]))
    const store = useMarketsStore()
    store.setSearchState({ status: 'success', data: [market({ id: '7', slug: 'seven' })] })

    await store.selectByIdOrSlug('7')
    expect(getMarket).not.toHaveBeenCalled()
    expect(store.selectedMarket?.slug).toBe('seven')
  })

  it('fetches getMarket only on a miss', async () => {
    getMarkets.mockResolvedValue(okList([]))
    getMarket.mockResolvedValue(ok(market({ id: '99', slug: 'ninety-nine' })))
    const store = useMarketsStore()
    await store.loadMarkets()

    await store.selectByIdOrSlug('ninety-nine')
    expect(getMarket).toHaveBeenCalledTimes(1)
    expect(store.selectedMarket?.id).toBe('99')
  })

  it('surfaces a fetch error on the select path', async () => {
    getMarket.mockResolvedValue(err<AppError>({ kind: 'network' }))
    const store = useMarketsStore()
    await store.selectByIdOrSlug('missing')
    expect(store.selectState.status).toBe('error')
    expect(store.selectedMarket).toBeNull()
  })

  it('treats a malformed (null) fetched market as an error, not a selection', async () => {
    getMarket.mockResolvedValue(ok(null))
    const store = useMarketsStore()
    await store.selectByIdOrSlug('malformed')
    expect(store.selectState.status).toBe('error')
    if (store.selectState.status === 'error') expect(store.selectState.error.kind).toBe('parse')
  })
})

describe('outcome selection (AC4.3)', () => {
  it('selects an outcome and exposes label + snapshot price; clamps out-of-range', () => {
    const store = useMarketsStore()
    store.selectMarket(market())
    expect(store.selectedOutcome).toBeNull()

    store.selectOutcome(0)
    expect(store.selectedOutcome).toBe('Yes')
    expect(store.selectedPrice).toBe(0.62)

    store.selectOutcome(5) // out of range → ignored
    expect(store.selectedOutcomeIndex).toBe(0)
  })

  it('clearSelection resets market + outcome', () => {
    const store = useMarketsStore()
    store.selectMarket(market())
    store.selectOutcome(1)
    store.clearSelection()
    expect(store.selectedMarket).toBeNull()
    expect(store.selectedOutcomeIndex).toBeNull()
    expect(store.selectState.status).toBe('idle')
  })

  it('selecting a new market resets the previously chosen outcome', () => {
    const store = useMarketsStore()
    store.selectMarket(market())
    store.selectOutcome(1)
    store.selectMarket(market({ id: '2' }))
    expect(store.selectedOutcomeIndex).toBeNull()
  })
})

describe('search state passthrough (AC2.6)', () => {
  it('clearSearch returns to idle (empty input → browse)', () => {
    const store = useMarketsStore()
    store.setSearchState({ status: 'success', data: [market()] })
    expect(store.searchMarketsResults).toHaveLength(1)
    store.clearSearch()
    expect(store.searchState.status).toBe('idle')
    expect(store.searchMarketsResults).toEqual([])
  })
})
