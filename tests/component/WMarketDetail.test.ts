/**
 * WMarketDetail (T603) — the responsive presentation contract:
 *   - inline (`inline=true`): a labelled region (NOT a dialog) with the question,
 *     outcomes overview, and the composed bet form + AI panel; a placeholder when
 *     nothing is selected.
 *   - modal (`inline=false`): an SJModal `role="dialog"` (teleported) labelled by
 *     the question, with a describedby summary (AC4.7).
 *   - closed market → a text "not open for betting" reason (AC4.5).
 *   - >2 outcomes → every outcome shown as a neutral chip (AC4.6).
 *   - bubbles `open-settings` (US7) and `filled` up; plus axe.
 *
 * A fresh Pinia backs the composed widgets' default stores; the AI controller is
 * injected so nothing touches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import WMarketDetail from '../../src/components/widget/WMarketDetail.vue'
import type { UseAiPrediction } from '../../src/composables/useAiPrediction'
import { MockBettingService } from '../../src/services/betting.service'
import { idle, type RequestState } from '../../src/models/request-state'
import type { AiPrediction } from '../../src/models/prediction'
import type { Market } from '../../src/models/market'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

function makeMarket(over: Partial<Market> = {}): Market {
  return {
    id: 'm1',
    question: 'Will it rain tomorrow?',
    slug: 'rain',
    outcomes: ['Yes', 'No'],
    prices: [0.6, 0.4],
    tokenIds: ['t1', 't2'],
    volume: 1_000_000,
    liquidity: 250_000,
    endDate: '2025-12-31T00:00:00Z',
    active: true,
    closed: false,
    pricingReliable: true,
    ...over,
  }
}

/** A no-key AI controller (visible-but-disabled CTA), fully synchronous. */
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

function baseProps(over: Record<string, unknown> = {}) {
  return {
    market: makeMarket(),
    bettingService: new MockBettingService({ delayMs: 0 }),
    aiController: makeAi(),
    ...over,
  }
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('WMarketDetail', () => {
  it('inline mode renders a labelled region (not a dialog) with the question + bet form', () => {
    const w = mount(WMarketDetail, { props: baseProps({ inline: true }) })
    const region = w.get('.w-market-detail--inline')
    expect(region.element.tagName).toBe('SECTION')
    expect(w.get('.w-market-detail__title').text()).toBe('Will it rain tomorrow?')
    // Not a dialog in inline mode.
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    // The composed bet form + AI panel are present.
    expect(w.find('.w-bet-form').exists()).toBe(true)
    expect(w.find('.w-ai').exists()).toBe(true)
  })

  it('inline mode with no selection shows a placeholder, not a dead pane', () => {
    const w = mount(WMarketDetail, { props: baseProps({ inline: true, market: null }) })
    expect(w.get('.w-market-detail__placeholder').text()).toContain('Select a market')
    expect(w.find('.w-bet-form').exists()).toBe(false)
  })

  it('modal mode exposes a dialog labelled by the question with a describedby summary (AC4.7)', () => {
    mount(WMarketDetail, {
      attachTo: document.body,
      props: { ...baseProps({ inline: false }), open: true },
    })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.getAttribute('aria-modal')).toBe('true')
    expect(dialog!.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog!.getAttribute('aria-describedby')).toBeTruthy()
    expect(dialog!.textContent).toContain('Will it rain tomorrow?')
  })

  it('shows a text "closed" reason for a closed market (AC4.5)', () => {
    const w = mount(WMarketDetail, {
      props: baseProps({ inline: true, market: makeMarket({ closed: true }) }),
    })
    expect(w.get('.w-market-detail-body__closed').text()).toContain('closed')
  })

  it('encodes every outcome as a neutral chip for a >2-outcome market (AC4.6)', () => {
    const market = makeMarket({
      outcomes: ['Team A', 'Team B', 'Draw'],
      prices: [0.5, 0.3, 0.2],
      tokenIds: ['a', 'b', 'c'],
    })
    const w = mount(WMarketDetail, { props: baseProps({ inline: true, market }) })
    const overview = w.get('.w-market-detail-body__outcome-list')
    expect(overview.text()).toContain('Team A')
    expect(overview.text()).toContain('Team B')
    expect(overview.text()).toContain('Draw')
    // Overview chips are all neutral (no forced success/error triad).
    expect(overview.findAll('.sj-badge--success').length).toBe(0)
    expect(overview.findAll('.sj-badge--error').length).toBe(0)
  })

  it('bubbles open-settings from the AI panel (US7)', async () => {
    const w = mount(WMarketDetail, { props: baseProps({ inline: true }) })
    const openSettings = w.findAll('button').find((b) => b.text() === 'Open Settings')!
    await openSettings.trigger('click')
    expect(w.emitted('open-settings')).toHaveLength(1)
  })

  it('has no axe violations in the inline detail', async () => {
    const w = mount(WMarketDetail, { attachTo: document.body, props: baseProps({ inline: true }) })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
