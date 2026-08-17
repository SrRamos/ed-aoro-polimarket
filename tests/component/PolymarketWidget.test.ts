/**
 * PolymarketWidget (D11) — the compact embeddable widget shell + internal view-stack:
 *   - BOUNDED CARD: a `.widget` card with header (title + Settings gear), a segmented
 *     nav, a scrolling body, and the persistent "simulated" footer note.
 *   - VIEW-STACK: browse → select → detail (an in-widget region, never a dialog) →
 *     Back → browse; the Positions view is reachable from the nav.
 *   - SETTINGS is the ONLY dialog, scoped over the widget (D11 AC4.7 reconciliation).
 *   - axe on the widget render.
 *
 * The search + AI controllers and a zero-delay betting service are injected; a fresh
 * Pinia + clean localStorage back the stores, so nothing touches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia, type Pinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import PolymarketWidget from '../../src/components/widget/PolymarketWidget.vue'
import type { UseMarketSearch } from '../../src/composables/useMarketSearch'
import type { UseAiPrediction } from '../../src/composables/useAiPrediction'
import { MockBettingService } from '../../src/services/betting.service'
import { successState, idle, type RequestState } from '../../src/models/request-state'
import type { AiPrediction } from '../../src/models/prediction'
import type { Market } from '../../src/models/market'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

function makeMarket(over: Partial<Market> = {}): Market {
  return {
    id: 'm1',
    question: 'Will it rain tomorrow?',
    slug: 'rain',
    outcomes: ['Yes', 'No'],
    prices: [0.5, 0.5],
    tokenIds: ['t1', 't2'],
    volume: 1000,
    liquidity: 500,
    endDate: '2025-12-31T00:00:00Z',
    active: true,
    closed: false,
    pricingReliable: true,
    ...over,
  }
}

function makeSearch(markets: Market[] = [makeMarket()]): UseMarketSearch {
  return {
    query: ref(''),
    state: ref<RequestState<Market[]>>(successState(markets)),
    browseState: ref<RequestState<Market[]>>(successState(markets)),
    isOffline: ref(false),
    announcement: ref(''),
    clear: vi.fn(),
    retry: vi.fn(),
    loadBrowse: vi.fn(async () => {}),
    dispose: vi.fn(),
  }
}

function makeAi(over: Partial<UseAiPrediction> = {}): UseAiPrediction {
  return {
    state: ref<RequestState<AiPrediction>>(idle()),
    hasKey: computed(() => false),
    canRun: computed(() => false),
    isRateLimited: computed(() => false),
    retryAfterSeconds: computed(() => null),
    run: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    reset: vi.fn(),
    ...over,
  }
}

let pinia: Pinia

function mountWidget() {
  return mount(PolymarketWidget, {
    attachTo: document.body,
    global: { plugins: [pinia] },
    props: {
      searchController: makeSearch(),
      aiController: makeAi(),
      bettingService: new MockBettingService({ delayMs: 0 }),
    },
  })
}

beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('PolymarketWidget shell', () => {
  it('renders a bounded card with a title, nav, scrolling body, and simulated note', () => {
    const w = mountWidget()
    expect(w.get('.widget__title').text()).toBe('Polymarket')
    expect(w.findAll('.widget__tab').map((t) => t.text())).toEqual(['Markets', 'Positions'])
    expect(w.find('.widget__body').exists()).toBe(true)
    expect(w.get('.widget__footer').text()).toContain('simulated')
    // The compact single-column list scrolls inside the bounded body.
    expect(w.get('.widget__body').find('.w-market-list').exists()).toBe(true)
  })

  it('navigates browse → detail → back, and detail is never a dialog', async () => {
    const w = mountWidget()
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    expect(w.get('.w-market-detail').element.tagName).toBe('SECTION')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    // The nav is hidden inside the detail step (it carries its own Back).
    expect(w.find('.widget__nav').exists()).toBe(false)

    await w.get('.w-market-detail__back').trigger('click')
    await flushPromises()
    expect(w.find('.w-market-detail').exists()).toBe(false)
    expect(w.find('[role="search"]').exists()).toBe(true)
    expect(w.find('.widget__nav').exists()).toBe(true)
  })

  it('reaches the Positions view from the nav', async () => {
    const w = mountWidget()
    const tab = w.findAll('.widget__tab').find((b) => b.text() === 'Positions')!
    await tab.trigger('click')
    await flushPromises()
    expect(w.find('.w-positions').exists()).toBe(true)
    // Browse stays mounted (v-show preserves search state) but is hidden.
    expect(w.get('.w-market-list').isVisible()).toBe(false)
    expect(tab.attributes('aria-current')).toBe('page')
  })

  it('opens Settings as the only dialog from the header gear', async () => {
    const w = mountWidget()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    const gear = w.findAll('button').find((b) => b.attributes('aria-label') === 'Open settings')!
    await gear.trigger('click')
    await flushPromises()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('OpenRouter API key')
  })

  it('has no axe violations on the widget render', async () => {
    const w = mountWidget()
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
