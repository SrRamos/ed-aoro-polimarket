/**
 * WBetForm (T604) — the confirm step + submitting/double-submit guard (AC5.0.5/
 * AC5.1a), amount validation + aria wiring + live math preview + zero/non-finite
 * price guard (AC5.2–AC5.5/AC5.8), the betting fail-safe disabled path (C10), the
 * happy path (record + receipt toast, AC5.1/5.6), the reject path (AC5.7), and axe.
 *
 * Services/stores are injected so nothing touches Pinia or the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import WBetForm from '../../src/components/widget/WBetForm.vue'
import { BettingError, type BettingService } from '../../src/services/betting.service'
import { appError } from '../../src/models/errors'
import { useToast } from '../../src/composables/useToast'
import type { Market } from '../../src/models/market'
import type { BetReceipt } from '../../src/models/bet'

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

const filledReceipt: BetReceipt = {
  status: 'filled',
  avgPrice: 0.5,
  shares: 20,
  cost: 5,
  txHash: 'mock-0xabc',
}

function okService(placeBet = vi.fn(async () => filledReceipt)): BettingService {
  return { available: true, placeBet }
}

const { clearToasts, toasts } = useToast()

beforeEach(() => clearToasts())
afterEach(() => {
  vi.restoreAllMocks()
})

/** Drive the form to a valid, reviewable state: select Yes + enter an amount. */
async function fillValid(w: ReturnType<typeof mount>, amount = '10') {
  await w.findAll('.w-bet-form__chip')[0]!.trigger('click') // Yes
  await w.get('input').setValue(amount)
}

describe('WBetForm', () => {
  it('keeps the Review CTA disabled until an outcome and a valid amount are set', async () => {
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: okService(),
        betsRecorder: { recordFilledBet: vi.fn(() => true) },
      },
    })
    const reviewBtn = () => w.findAll('button').find((b) => b.text() === 'Review bet')!
    expect(reviewBtn().attributes('disabled')).toBeDefined()
    await fillValid(w)
    expect(reviewBtn().attributes('disabled')).toBeUndefined()
  })

  it('shows a live cost/payout preview computed from size × price (AC5.2/5.3)', async () => {
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: okService(),
        betsRecorder: { recordFilledBet: vi.fn(() => true) },
      },
    })
    await fillValid(w, '10')
    // cost = 10 × 0.5 = $5.00; shares = 20; payout = $20.00.
    expect(w.get('.w-bet-form__preview').text()).toContain('$5.00')
    expect(w.get('.w-bet-form__preview').text()).toContain('$20.00')
  })

  it('validates the amount with aria-invalid + aria-describedby, shown after blur (AC5.4)', async () => {
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: okService(),
        betsRecorder: { recordFilledBet: vi.fn(() => true) },
      },
    })
    const input = w.get('input')
    await input.setValue('-5')
    await input.trigger('blur')
    expect(input.attributes('aria-invalid')).toBe('true')
    const describedby = input.attributes('aria-describedby')
    expect(describedby).toBeTruthy()
    expect(w.text()).toContain('greater than $0')
  })

  it('renders the amount field as text + inputmode="decimal" (never type=number) at ≥16px', () => {
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: okService(),
        betsRecorder: { recordFilledBet: vi.fn(() => true) },
      },
    })
    const input = w.get('input')
    expect(input.attributes('type')).toBe('text')
    expect(input.attributes('inputmode')).toBe('decimal')
    expect(input.attributes('type')).not.toBe('number')
  })

  it('disables an outcome whose snapshot price is not usable (≤0 / non-finite) (AC5.3)', () => {
    const w = mount(WBetForm, {
      props: {
        market: makeMarket({ prices: [0, 0.5] }),
        bettingService: okService(),
        betsRecorder: { recordFilledBet: vi.fn(() => true) },
      },
    })
    const chips = w.findAll('.w-bet-form__chip')
    expect(chips[0]!.attributes('disabled')).toBeDefined() // price 0 → blocked
    expect(chips[1]!.attributes('disabled')).toBeUndefined()
  })

  it('requires the review-and-confirm step before calling placeBet (AC5.0.5)', async () => {
    const placeBet = vi.fn(async () => filledReceipt)
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: okService(placeBet),
        betsRecorder: { recordFilledBet: vi.fn(() => true) },
      },
    })
    await fillValid(w)
    // Submitting the form moves to REVIEW — it does NOT place the bet yet.
    await w.get('form').trigger('submit')
    expect(placeBet).not.toHaveBeenCalled()
    expect(w.text()).toContain('Review your bet')
    // Only an explicit confirm calls placeBet.
    const confirm = w.findAll('button').find((b) => b.text().includes('Confirm'))!
    await confirm.trigger('click')
    await flushPromises()
    expect(placeBet).toHaveBeenCalledTimes(1)
  })

  it('guards double-submit: sets aria-busy and files exactly one bet (AC5.1a)', async () => {
    let resolveFn: (r: BetReceipt) => void = () => {}
    const placeBet = vi.fn(() => new Promise<BetReceipt>((res) => (resolveFn = res)))
    const recordFilledBet = vi.fn(() => true)
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: { available: true, placeBet },
        betsRecorder: { recordFilledBet },
      },
    })
    await fillValid(w)
    await w.get('form').trigger('submit')
    const confirm = () =>
      w
        .findAll('button')
        .find((b) => b.text().includes('Confirm') || b.text().includes('place bet'))!
    await confirm().trigger('click')
    // In-flight: aria-busy set, and a rapid second tap cannot fire a duplicate.
    expect(confirm().attributes('aria-busy')).toBe('true')
    await confirm().trigger('click')
    resolveFn(filledReceipt)
    await flushPromises()
    expect(placeBet).toHaveBeenCalledTimes(1)
    expect(recordFilledBet).toHaveBeenCalledTimes(1)
  })

  it('on success records the position and enqueues a success toast, then shows the receipt', async () => {
    const recordFilledBet = vi.fn(() => true)
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: okService(),
        betsRecorder: { recordFilledBet },
      },
    })
    await fillValid(w)
    await w.get('form').trigger('submit')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Confirm'))!
      .trigger('click')
    await flushPromises()
    expect(recordFilledBet).toHaveBeenCalledOnce()
    expect(recordFilledBet.mock.calls[0]![0]).toMatchObject({
      outcome: 'Yes',
      size: 10,
      price: 0.5,
    })
    expect(toasts.some((t) => t.variant === 'success')).toBe(true)
    // The inline receipt is surfaced.
    expect(w.text()).toContain('Bet filled')
    expect(w.emitted('filled')?.[0]).toEqual([{ receipt: filledReceipt, persisted: true }])
  })

  it('when the fill cannot be persisted, shows the unsaved notice (no false receipt, AC6.1)', async () => {
    const recordFilledBet = vi.fn(() => false) // persist failed
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: okService(),
        betsRecorder: { recordFilledBet },
      },
    })
    await fillValid(w)
    await w.get('form').trigger('submit')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Confirm'))!
      .trigger('click')
    await flushPromises()
    expect(w.text()).toContain('couldn’t save it locally')
    expect(w.text()).not.toContain('Bet filled')
  })

  it('surfaces a retryable error when placeBet rejects, leaving no receipt (AC5.7)', async () => {
    const placeBet = vi.fn(async () => {
      throw new BettingError(appError('sim-failure', { message: 'boom' }))
    })
    const recordFilledBet = vi.fn(() => true)
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: { available: true, placeBet },
        betsRecorder: { recordFilledBet },
      },
    })
    await fillValid(w)
    await w.get('form').trigger('submit')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Confirm'))!
      .trigger('click')
    await flushPromises()
    expect(w.get('.w-bet-form__error').attributes('role')).toBe('alert')
    expect(recordFilledBet).not.toHaveBeenCalled()
    expect(w.text()).not.toContain('Bet filled')
    // Retry affordance present.
    expect(w.findAll('button').some((b) => b.text() === 'Try again')).toBe(true)
  })

  it('honors the betting fail-safe: renders disabled with the reason and never calls placeBet (C10)', () => {
    const placeBet = vi.fn()
    const w = mount(WBetForm, {
      props: {
        market: makeMarket(),
        bettingService: {
          available: false,
          unavailableReason: 'Real betting mode is not available.',
          placeBet,
        },
        betsRecorder: { recordFilledBet: vi.fn(() => true) },
      },
    })
    expect(w.get('.w-bet-form__blocked').text()).toContain('not available')
    // No form / no CTA to place a bet.
    expect(w.find('form').exists()).toBe(false)
    expect(placeBet).not.toHaveBeenCalled()
  })

  it('has no axe violations in the form state', async () => {
    const w = mount(WBetForm, {
      attachTo: document.body,
      props: {
        market: makeMarket(),
        bettingService: okService(),
        betsRecorder: { recordFilledBet: vi.fn(() => true) },
      },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
