/**
 * WMarketList (T602 · D11) — compact SINGLE-COLUMN list (no multi-column grid; the
 * widget shell owns the bounded, scrolling body), keyed rendering, loading
 * skeletons, error/empty states, >50 "show more" (C5), select bubbling, and axe.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import WMarketList from '../../src/components/widget/WMarketList.vue'
import type { Market } from '../../src/models/market'
import { loading, errorState, successState } from '../../src/models/request-state'

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

function makeMany(n: number): Market[] {
  return Array.from({ length: n }, (_, i) => makeMarket(`m${i}`))
}

describe('WMarketList', () => {
  it('renders skeleton cards while loading', () => {
    const w = mount(WMarketList, { props: { state: loading(), skeletonCount: 4 } })
    expect(w.findAll('.w-market-list__skeleton')).toHaveLength(4)
    expect(w.find('.w-market-card').exists()).toBe(false)
    // Skeleton list is hidden from AT (the live region owns "loading").
    expect(w.get('.w-market-list').attributes('aria-hidden')).toBe('true')
  })

  it('renders an alert on error', () => {
    const w = mount(WMarketList, { props: { state: errorState({ kind: 'network' }) } })
    const notice = w.get('.w-market-list__notice')
    expect(notice.attributes('role')).toBe('alert')
  })

  it('renders the explicit empty label on empty success', () => {
    const w = mount(WMarketList, {
      props: { state: successState<Market[]>([]), emptyLabel: 'Nothing here.' },
    })
    expect(w.text()).toContain('Nothing here.')
    expect(w.find('.w-market-card').exists()).toBe(false)
  })

  it('renders one keyed card per market', () => {
    const markets = makeMany(3)
    const w = mount(WMarketList, { props: { state: successState(markets) } })
    const cards = w.findAll('.w-market-card')
    expect(cards).toHaveLength(3)
    // Keyed <li> wrappers exist (C3 — patch, not re-mount).
    expect(w.findAll('.w-market-list__cell')).toHaveLength(3)
  })

  it('bubbles a card `select` up to the list consumer', async () => {
    const markets = makeMany(2)
    const w = mount(WMarketList, { props: { state: successState(markets) } })
    await w.findAll('.w-market-card')[1]!.trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([markets[1]])
  })

  it('caps rendering at 50 and reveals the rest via "Show more" (C5)', async () => {
    const markets = makeMany(60)
    const w = mount(WMarketList, { props: { state: successState(markets) } })
    expect(w.findAll('.w-market-card')).toHaveLength(50)
    const more = w.get('.w-market-list__more button')
    expect(more.text()).toContain('Show 10 more')
    await more.trigger('click')
    expect(w.findAll('.w-market-card')).toHaveLength(60)
    expect(w.find('.w-market-list__more').exists()).toBe(false)
  })

  it('does not show "Show more" at or below 50 rows', () => {
    const w = mount(WMarketList, { props: { state: successState(makeMany(50)) } })
    expect(w.findAll('.w-market-card')).toHaveLength(50)
    expect(w.find('.w-market-list__more').exists()).toBe(false)
  })

  it('resets the visible window when a fresh result set arrives', async () => {
    const w = mount(WMarketList, { props: { state: successState(makeMany(60)) } })
    await w.get('.w-market-list__more button').trigger('click')
    expect(w.findAll('.w-market-card')).toHaveLength(60)
    await w.setProps({ state: successState(makeMany(60).map((m) => ({ ...m, id: `x${m.id}` }))) })
    expect(w.findAll('.w-market-card')).toHaveLength(50)
  })

  it('has no axe violations for a results grid', async () => {
    const w = mount(WMarketList, {
      attachTo: document.body,
      props: { state: successState(makeMany(3)) },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
