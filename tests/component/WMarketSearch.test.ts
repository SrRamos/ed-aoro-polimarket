/**
 * WMarketSearch (T601) — search-input semantics, live-region announcement, clear
 * affordance, and each discriminated state (loading / offline / error / no-results
 * recovery / results). State coverage uses an injected controller (synchronous,
 * no network); one wiring test drives the real composable with injected service
 * fns + fake timers. Plus axe.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import WMarketSearch from '../../src/components/widget/WMarketSearch.vue'
import type { UseMarketSearch } from '../../src/composables/useMarketSearch'
import type { Market } from '../../src/models/market'
import type { AppError, Result } from '../../src/models/errors'
import { ok } from '../../src/models/errors'
import {
  idle,
  loading,
  errorState,
  successState,
  type RequestState,
} from '../../src/models/request-state'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

function makeMarket(id: string): Market {
  return {
    id,
    question: `Question ${id}?`,
    slug: `q-${id}`,
    outcomes: ['Yes', 'No'],
    prices: [0.5, 0.5],
    tokenIds: ['a', 'b'],
    volume: 1000,
    liquidity: 500,
    endDate: '2025-12-31T00:00:00Z',
    image: undefined,
    active: true,
    closed: false,
    pricingReliable: true,
  }
}

/** A fully controllable fake of the composable for state-by-state assertions. */
function fakeController(over: Partial<UseMarketSearch> = {}): UseMarketSearch {
  return {
    query: ref(''),
    state: ref<RequestState<Market[]>>(idle()),
    browseState: ref<RequestState<Market[]>>(successState([makeMarket('b1')])),
    isOffline: ref(false),
    announcement: ref(''),
    clear: vi.fn(),
    retry: vi.fn(),
    loadBrowse: vi.fn(async () => {}),
    dispose: vi.fn(),
    ...over,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('WMarketSearch', () => {
  it('renders the input with search semantics', () => {
    const w = mount(WMarketSearch, { props: { controller: fakeController() } })
    const input = w.get('input')
    expect(input.attributes('type')).toBe('search')
    expect(input.attributes('enterkeyhint')).toBe('search')
    expect(input.attributes('autocomplete')).toBe('off')
    expect(w.get('[role="search"]').exists()).toBe(true)
  })

  it('exposes a polite live region bound to the announcement', () => {
    const controller = fakeController({ announcement: ref('3 markets found.') })
    const w = mount(WMarketSearch, { props: { controller } })
    const live = w.get('[aria-live="polite"]')
    expect(live.attributes('role')).toBe('status')
    expect(live.text()).toBe('3 markets found.')
  })

  it('shows the clear button only when there is a query, and clears on click', async () => {
    const controller = fakeController({ query: ref('') })
    const w = mount(WMarketSearch, { props: { controller } })
    expect(w.find('.w-market-search__clear').exists()).toBe(false)

    controller.query.value = 'rain'
    await w.vm.$nextTick()
    const clearBtn = w.get('.w-market-search__clear')
    expect(clearBtn.attributes('aria-label')).toBe('Clear search')
    await clearBtn.trigger('click')
    expect(controller.clear).toHaveBeenCalledOnce()
  })

  it('renders skeletons in the loading state', () => {
    const w = mount(WMarketSearch, {
      props: { controller: fakeController({ state: ref(loading()) }) },
    })
    expect(w.find('.w-market-list__skeleton').exists()).toBe(true)
  })

  it('renders a DISTINCT offline state (not a generic network error)', () => {
    const controller = fakeController({
      isOffline: ref(true),
      query: ref('rain'),
      state: ref(errorState<Market[]>({ kind: 'offline' })),
    })
    const w = mount(WMarketSearch, { props: { controller } })
    expect(w.get('.w-market-search__offline').exists()).toBe(true)
    expect(w.text()).toContain('offline')
    // Offline is not a hard error → no "Retry" button, but browse stays reachable.
    expect(w.text()).not.toContain('Retry')
    expect(w.find('.w-market-card').exists()).toBe(true)
  })

  it('renders an error state with a retry affordance and a browse fallback', async () => {
    const controller = fakeController({
      query: ref('rain'),
      state: ref(errorState<Market[]>({ kind: 'timeout' })),
    })
    const w = mount(WMarketSearch, { props: { controller } })
    const alert = w.get('.w-market-search__message')
    expect(alert.attributes('role')).toBe('alert')
    const retryBtn = w.findAll('button').find((b) => b.text() === 'Retry')
    expect(retryBtn).toBeTruthy()
    await retryBtn!.trigger('click')
    expect(controller.retry).toHaveBeenCalledOnce()
    // Not a dead end — the top-by-volume fallback list is present.
    expect(w.text()).toContain('Top markets by volume')
    expect(w.find('.w-market-card').exists()).toBe(true)
  })

  it('recovers from no-results: echoes the query + clear + top-by-volume fallback', () => {
    const controller = fakeController({
      query: ref('zzz'),
      state: ref(successState<Market[]>([])),
    })
    const w = mount(WMarketSearch, { props: { controller } })
    // Query echoed & preserved.
    expect(w.get('.w-market-search__echo').text()).toBe('zzz')
    expect(w.findAll('button').some((b) => b.text() === 'Clear search')).toBe(true)
    expect(w.text()).toContain('Top markets by volume')
    expect(w.find('.w-market-card').exists()).toBe(true)
  })

  it('renders the results grid on a non-empty success', () => {
    const controller = fakeController({
      query: ref('rain'),
      state: ref(successState([makeMarket('r1'), makeMarket('r2')])),
    })
    const w = mount(WMarketSearch, { props: { controller } })
    expect(w.findAll('.w-market-card')).toHaveLength(2)
  })

  it('bubbles a card selection up as `select`', async () => {
    const market = makeMarket('r1')
    const controller = fakeController({ query: ref('rain'), state: ref(successState([market])) })
    const w = mount(WMarketSearch, { props: { controller } })
    await w.get('.w-market-card').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([market])
  })

  it('wires the real composable: typing → debounced search → count announcement', async () => {
    vi.useFakeTimers()
    const search = vi.fn(async (): Promise<Result<Market[], AppError>> =>
      ok([makeMarket('r1'), makeMarket('r2')]),
    )
    const browse = vi.fn(async (): Promise<Result<Market[], AppError>> => ok([]))
    const w = mount(WMarketSearch, { props: { options: { search, browse, debounceMs: 0 } } })

    await w.get('input').setValue('rain')
    await vi.runAllTimersAsync()

    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0]![0]).toBe('rain')
    expect(w.findAll('.w-market-card')).toHaveLength(2)
    expect(w.get('[aria-live="polite"]').text()).toContain('2 markets found')
  })

  it('has no axe violations for the results state', async () => {
    const controller = fakeController({
      query: ref('rain'),
      state: ref(successState([makeMarket('r1')])),
    })
    const w = mount(WMarketSearch, { attachTo: document.body, props: { controller } })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
