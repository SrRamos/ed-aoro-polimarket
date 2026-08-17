/**
 * App.vue (T609) — the assembled single-page flows:
 *   - LANDMARKS + HEADING OUTLINE + SKIP-LINK (NFR-A11Y-7): one h1, section h2s, a
 *     header/main/search landmark, and a skip-link targeting the real <main>.
 *   - SEARCH → SELECT → DETAIL (AC4.1/AC4.7 · NFR-MF-5): selecting a card opens the
 *     detail as a MODAL/SHEET on narrow layouts and as an INLINE PANE on wide — the
 *     mode switch is asserted both ways.
 *   - PLACE A BET (US5): select outcome → review → confirm → receipt → the position
 *     appears in WPositions (persisted through the real bets store).
 *   - AI open-settings (US7/US8): the no-key CTA opens the Settings dialog.
 *   - axe on the full render.
 *
 * The search + AI controllers and a zero-delay betting service are injected, and a
 * fresh Pinia + clean localStorage back the stores, so nothing touches the network.
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
      wide: false,
      ...props,
    },
  })
}

/**
 * Mount WITHOUT an explicit `wide` prop so the app resolves its layout mode from
 * `matchMedia` — the real production path. Stubs `window.matchMedia('(min-width:
 * 992px)')` to `matches`, guarding the NFR-MF-5 regression where Vue's Boolean-prop
 * casting turned an absent `wide` into `false` and pinned the app to modal-mode.
 */
function stubMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: '(min-width: 992px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  )
  return mql
}

function mountAppAuto() {
  return mount(App, {
    attachTo: document.body,
    global: { plugins: [pinia] },
    props: {
      searchController: makeSearch(),
      aiController: makeAi(),
      bettingService: new MockBettingService({ delayMs: 0 }),
      // No `wide` — layout comes from matchMedia (the production default).
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

describe('App landmarks + heading outline (NFR-A11Y-7)', () => {
  it('exposes a skip-link to the real <main>, a single h1, header/main/search landmarks', () => {
    const w = mountApp()
    const skip = w.get('a.skip-link')
    expect(skip.attributes('href')).toBe('#main')
    const main = w.get('#main')
    expect(main.element.tagName).toBe('MAIN')
    expect(w.findAll('h1')).toHaveLength(1)
    expect(w.find('header').exists()).toBe(true)
    // The search landmark comes from WMarketSearch's inner role="search" form.
    expect(w.find('[role="search"]').exists()).toBe(true)
    // Section headings under the single h1.
    const h2s = w.findAll('h2').map((h) => h.text())
    expect(h2s).toContain('Markets')
    expect(h2s).toContain('Your positions')
  })

  it('surfaces the persistent "bets are simulated" framing', () => {
    const w = mountApp()
    expect(w.text()).toContain('simulated')
  })
})

describe('App search → select → detail (NFR-MF-5 mode switch)', () => {
  it('opens the detail as a MODAL/SHEET (role=dialog) on a narrow layout', async () => {
    const w = mountApp({ wide: false })
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('Will it rain tomorrow?')
    // No inline pane in narrow mode.
    expect(w.find('.w-market-detail--inline').exists()).toBe(false)
  })

  it('opens the detail as an INLINE PANE (not a dialog) on a wide layout', async () => {
    const w = mountApp({ wide: true })
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    expect(w.find('.w-market-detail--inline').exists()).toBe(true)
    expect(w.get('.w-market-detail__title').text()).toBe('Will it rain tomorrow?')
    // The inline pane is a region, never a dialog.
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    // The market list stays visible + usable on the left beside the detail pane.
    expect(w.find('[role="search"]').exists()).toBe(true)
    expect(w.findAll('.w-market-card').length).toBeGreaterThan(0)
  })

  it('selecting a card at lg moves focus to the detail region heading (not trapped)', async () => {
    const w = mountApp({ wide: true })
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    // Focus lands on the detail heading — a handoff, not a modal focus trap.
    expect(document.activeElement).toBe(w.get('.w-market-detail__title').element)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})

// Production path: no `wide` prop — the mode is decided by matchMedia. These guard
// the NFR-MF-5 regression (an absent Boolean `wide` was cast to `false`, pinning
// the app to modal-mode even at ≥992px, leaving an empty two-pane right column).
describe('App auto responsive mode via matchMedia (NFR-MF-5, no `wide` prop)', () => {
  it('renders the INLINE two-pane at lg (matchMedia matches) with the list still present', async () => {
    stubMatchMedia(true)
    const w = mountAppAuto()
    await flushPromises()
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    expect(w.find('.w-market-detail--inline').exists()).toBe(true)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    // The list remains on the left, usable beside the detail.
    expect(w.find('[role="search"]').exists()).toBe(true)
    expect(w.findAll('.w-market-card').length).toBeGreaterThan(0)
  })

  it('renders the MODAL/SHEET (role=dialog) below lg (matchMedia does not match)', async () => {
    stubMatchMedia(false)
    const w = mountAppAuto()
    await flushPromises()
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('Will it rain tomorrow?')
    expect(w.find('.w-market-detail--inline').exists()).toBe(false)
  })
})

describe('App place-a-bet happy path (US5)', () => {
  it('select outcome → confirm → receipt → the position appears in WPositions', async () => {
    const w = mountApp({ wide: true })
    // Open the detail inline.
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

    // WPositions now lists the filled position (real bets store, no reload).
    const table = w.get('.w-positions__table')
    expect(table.text()).toContain('Will it rain tomorrow?')
    expect(table.text()).toContain('Yes')
    // First-run onboarding is gone now that a position exists.
    expect(w.find('.w-positions__empty').exists()).toBe(false)
  })
})

describe('App AI open-settings flow (US7/US8)', () => {
  it('the no-key AI CTA opens the Settings dialog', async () => {
    const w = mountApp({ wide: true })
    await w.get('.w-market-card').trigger('click')
    await flushPromises()
    // Settings dialog is not open yet.
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    const openSettings = w.findAll('button').find((b) => b.text() === 'Open Settings')!
    await openSettings.trigger('click')
    await flushPromises()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('OpenRouter API key')
  })

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
})

describe('App a11y', () => {
  it('has no axe violations on the full render', async () => {
    const w = mountApp()
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
