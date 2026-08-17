/**
 * WMarketCard (T602) — question/outcomes/%/badges rendering, format.ts wiring,
 * keyed image with reserved box + broken-image fallback, keyboard-openable
 * (native <button>) select emit, and axe.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import WMarketCard from '../../src/components/widget/WMarketCard.vue'
import type { Market } from '../../src/models/market'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

function makeMarket(over: Partial<Market> = {}): Market {
  return {
    id: 'm1',
    question: 'Will it rain tomorrow?',
    slug: 'will-it-rain',
    outcomes: ['Yes', 'No'],
    prices: [0.62, 0.38],
    tokenIds: ['t1', 't2'],
    volume: 5_300_000,
    liquidity: 1_200_000,
    endDate: '2025-12-31T00:00:00Z',
    image: 'https://images.polymarket.com/rain.png',
    active: true,
    closed: false,
    pricingReliable: true,
    ...over,
  }
}

describe('WMarketCard', () => {
  it('renders the question and each outcome with a formatted %', () => {
    const w = mount(WMarketCard, { props: { market: makeMarket() } })
    expect(w.text()).toContain('Will it rain tomorrow?')
    expect(w.text()).toContain('Yes')
    expect(w.text()).toContain('No')
    // format.ts pinned en-US percent (62% / 38%), not raw 0.62.
    expect(w.text()).toContain('62%')
    expect(w.text()).toContain('38%')
  })

  it('drives the progress bars via transform: scaleX (never width)', () => {
    const w = mount(WMarketCard, { props: { market: makeMarket() } })
    const fills = w.findAll('.sj-progress__fill')
    expect(fills.length).toBeGreaterThanOrEqual(2)
    expect(fills[0]!.attributes('style')).toContain('scaleX(0.62)')
    expect(fills[0]!.attributes('style')).not.toContain('width')
  })

  it('formats volume and liquidity compactly via format.ts', () => {
    const w = mount(WMarketCard, { props: { market: makeMarket() } })
    expect(w.text()).toContain('$5.3M')
    expect(w.text()).toContain('$1.2M')
  })

  it('renders as a real <button> and emits `select` on activation', async () => {
    const market = makeMarket()
    const w = mount(WMarketCard, { props: { market } })
    // A native <button> is inherently Enter/Space-operable — proving keyboard open.
    expect(w.get('.sj-card').element.tagName).toBe('BUTTON')
    await w.get('.sj-card').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([market])
  })

  it('reserves the image box and lazy/async-loads it', () => {
    const w = mount(WMarketCard, { props: { market: makeMarket() } })
    const img = w.get('img')
    expect(img.attributes('loading')).toBe('lazy')
    expect(img.attributes('decoding')).toBe('async')
    expect(img.attributes('alt')).toBe('')
    // aspect-ratio reserves the box (zero CLS) — asserted via the scoped class.
    expect(img.classes()).toContain('w-market-card__image')
  })

  it('falls back to a sized placeholder on a broken image', async () => {
    const w = mount(WMarketCard, { props: { market: makeMarket() } })
    expect(w.find('img').exists()).toBe(true)
    await w.get('img').trigger('error')
    expect(w.find('img').exists()).toBe(false)
    expect(w.find('.w-market-card__image--fallback').exists()).toBe(true)
  })

  it('uses the fallback box when the market has no image', () => {
    const w = mount(WMarketCard, { props: { market: makeMarket({ image: undefined }) } })
    expect(w.find('img').exists()).toBe(false)
    expect(w.find('.w-market-card__image--fallback').exists()).toBe(true)
  })

  it('flags unreliable pricing with a text badge (not color alone)', () => {
    const w = mount(WMarketCard, { props: { market: makeMarket({ pricingReliable: false }) } })
    expect(w.text()).toContain('Pricing unreliable')
  })

  it('caps outcome rows and notes the remainder for many-legged markets', () => {
    const market = makeMarket({
      outcomes: ['A', 'B', 'C', 'D', 'E'],
      prices: [0.3, 0.25, 0.2, 0.15, 0.1],
    })
    const w = mount(WMarketCard, { props: { market } })
    expect(w.findAll('.sj-progress__fill')).toHaveLength(3)
    expect(w.text()).toContain('+2 more outcomes')
  })

  it('guards a short prices array without rendering NaN', () => {
    const market = makeMarket({ outcomes: ['Yes', 'No'], prices: [0.7] })
    const w = mount(WMarketCard, { props: { market } })
    expect(w.text()).not.toContain('NaN')
    // Missing price → 0% via the guard.
    expect(w.text()).toContain('0%')
  })

  it('has no axe violations', async () => {
    const w = mount(WMarketCard, { attachTo: document.body, props: { market: makeMarket() } })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
