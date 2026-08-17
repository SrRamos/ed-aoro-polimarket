/**
 * App.vue (D11) — the demo HOST page that embeds the compact PolymarketWidget:
 *   - HOST CHROME + LANDMARKS (NFR-A11Y-7): a faux site banner, a single h1 (the
 *     host hero), a `<main id="main">` skip-link target, and the embedded widget
 *     exposing a `search` landmark + its own h2 title.
 *   - EMBEDDING: the widget renders inside the host `<aside>`, bounded — not a
 *     full-page markets index.
 *   - VIEW-STACK (D11): browse → select → detail (an in-widget region, NEVER a
 *     dialog) → Back → browse; the Positions view is reachable from the nav.
 *   - PLACE A BET (US5): select outcome → review → confirm → receipt → the position
 *     shows in the Positions view (persisted through the real bets store).
 *   - SETTINGS is the ONLY dialog (US8): the header gear + the AI no-key CTA open it.
 *   - axe on the full host+widget render.
 *
 * The search + AI controllers and a zero-delay betting service are injected (and
 * forwarded to the widget), and a fresh Pinia + clean localStorage back the stores,
 * so nothing touches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia, type Pinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import App from '../../src/App.vue'
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

/** A search controller stuck on a single success result — no debounce, no network. */
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

function mountApp(props: Record<string, unknown> = {}) {
  return mount(App, {
    attachTo: document.body,
    global: { plugins: [pinia] },
    props: {
      searchController: makeSearch(),
      aiController: makeAi(),
      bettingService: new MockBettingService({ delayMs: 0 }),
      ...props,
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
  vi.unstubAllGlobals()
})

describe('App host chrome + landmarks (NFR-A11Y-7)', () => {
  it('exposes a skip-link to the real <main>, a single h1, header/main/search landmarks', () => {
    const w = mountApp()
    const skip = w.get('a.skip-link')
    expect(skip.attributes('href')).toBe('#main')
    const main = w.get('#main')
    expect(main.element.tagName).toBe('MAIN')
    // Exactly one h1 — the host hero (the widget title is an h2).
    expect(w.findAll('h1')).toHaveLength(1)
    expect(w.find('header').exists()).toBe(true)
    // The search landmark comes from WMarketSearch's inner role="search" form.
    expect(w.find('[role="search"]').exists()).toBe(true)
    // The widget title is an h2 under the host h1.
    const h2s = w.findAll('h2').map((h) => h.text())
    expect(h2s).toContain('Polymarket')
  })

  it('embeds the bounded widget inside the host page (not a full-page index)', () => {
    const w = mountApp()
    const aside = w.get('.host__widget')
    expect(aside.find('.widget').exists()).toBe(true)
  })

  it('surfaces the persistent "bets are simulated" framing inside the widget', () => {
    const w = mountApp()
    expect(w.get('.widget__footer').text()).toContain('simulated')
  })
})

describe('App widget view-stack: browse → detail → back (D11)', () => {
  it('selecting a market opens the detail as an in-widget region, never a dialog', async () => {
    const w = mountApp()
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    // Detail is an in-widget region with the question — and NOT a dialog.
    const detail = w.get('.w-market-detail')
    expect(detail.element.tagName).toBe('SECTION')
    expect(w.get('.w-market-detail__title').text()).toBe('Will it rain tomorrow?')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    // The browse search is no longer the active step (detail replaced it).
    expect(w.find('.w-market-detail__back').exists()).toBe(true)
  })

  it('moves focus to the detail heading on open (a handoff, not a trap)', async () => {
    const w = mountApp()
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    const heading = w.get('.w-market-detail__title')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(heading.element)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('Back returns to the browse list', async () => {
    const w = mountApp()
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    await w.get('.w-market-detail__back').trigger('click')
    await flushPromises()
    // Detail gone; browse search + list back in view.
    expect(w.find('.w-market-detail').exists()).toBe(false)
    expect(w.find('[role="search"]').exists()).toBe(true)
    expect(w.findAll('.w-market-card').length).toBeGreaterThan(0)
  })

  it('renders the compact single-column list inside the scrolling widget body', () => {
    const w = mountApp()
    // The list lives inside the bounded, scroll-owning body region.
    const body = w.get('.widget__body')
    expect(body.find('.w-market-list').exists()).toBe(true)
  })
})

describe('App Positions view (D11)', () => {
  it('is reachable from the widget nav', async () => {
    const w = mountApp()
    const tab = w.findAll('.widget__tab').find((b) => b.text() === 'Positions')!
    await tab.trigger('click')
    await flushPromises()
    // The positions section (its h2) is now shown; the market list is not.
    expect(w.findAll('h2').map((h) => h.text())).toContain('Your positions')
  })
})

describe('App place-a-bet happy path (US5)', () => {
  it('select outcome → confirm → receipt → the position appears in Positions', async () => {
    const w = mountApp()
    await w.get('.w-market-card').trigger('click')
    await flushPromises()

    // Choose an outcome + a valid amount, then review.
    await w.findAll('.w-bet-form__chip')[0]!.trigger('click') // Yes
    await w.get('.w-bet-form input').setValue('10')
    await w.get('.w-bet-form form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Review your bet')

    // Confirm → the mock fills, the receipt shows, and the position persists.
    const confirm = w.findAll('button').find((b) => b.text().includes('Confirm'))!
    await confirm.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Bet filled')

    // Back to browse, then open the Positions view — the filled position is listed.
    await w.get('.w-market-detail__back').trigger('click')
    await flushPromises()
    const tab = w.findAll('.widget__tab').find((b) => b.text() === 'Positions')!
    await tab.trigger('click')
    await flushPromises()
    const table = w.get('.w-positions__table')
    expect(table.text()).toContain('Will it rain tomorrow?')
    expect(table.text()).toContain('Yes')
    expect(w.find('.w-positions__empty').exists()).toBe(false)
  })
})

describe('App Settings dialog (US7/US8)', () => {
  it('the header Settings button opens the Settings dialog', async () => {
    const w = mountApp()
    const settingsBtn = w
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Open settings')!
    await settingsBtn.trigger('click')
    await flushPromises()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('OpenRouter API key')
  })

  it('the no-key AI CTA opens the Settings dialog from the detail view', async () => {
    const w = mountApp()
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    const openSettings = w.findAll('button').find((b) => b.text() === 'Open Settings')!
    await openSettings.trigger('click')
    await flushPromises()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('OpenRouter API key')
  })
})

describe('App a11y', () => {
  it('has no axe violations on the full host + widget render', async () => {
    const w = mountApp()
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
