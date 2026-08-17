/**
 * WAiPrediction (T607) — the no-key visible-but-disabled CTA (AC7.2), on-demand
 * trigger (AC7.3, no auto-call), the success render (recommended outcome +
 * numeric confidence + PLAIN-TEXT rationale, AC7.8), and the distinct 429
 * rate-limit message with no auto-retry (AC7.9). Controller injected. Plus axe.
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import WAiPrediction from '../../src/components/widget/WAiPrediction.vue'
import type { UseAiPrediction } from '../../src/composables/useAiPrediction'
import type { Market } from '../../src/models/market'
import type { AiPrediction } from '../../src/models/prediction'
import {
  idle,
  loading,
  errorState,
  successState,
  type RequestState,
} from '../../src/models/request-state'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

function makeMarket(): Market {
  return {
    id: 'm1',
    question: 'Will it rain tomorrow?',
    slug: 'rain',
    outcomes: ['Yes', 'No'],
    prices: [0.6, 0.4],
    tokenIds: ['t1', 't2'],
    volume: 1000,
    liquidity: 500,
    endDate: '2025-12-31T00:00:00Z',
    active: true,
    closed: false,
    pricingReliable: true,
  }
}

function fakeController(over: Partial<UseAiPrediction> = {}): UseAiPrediction {
  return {
    state: ref<RequestState<AiPrediction>>(idle()),
    hasKey: ref(true),
    canRun: ref(true),
    isRateLimited: ref(false),
    retryAfterSeconds: ref(null),
    run: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    reset: vi.fn(),
    ...over,
  } as UseAiPrediction
}

describe('WAiPrediction', () => {
  it('with no key shows a VISIBLE-but-disabled affordance + a Settings CTA (AC7.2)', async () => {
    const controller = fakeController({ hasKey: ref(false), canRun: ref(false) })
    const w = mount(WAiPrediction, { props: { market: makeMarket(), controller } })
    const getBtn = w.findAll('button').find((b) => b.text() === 'Get AI suggestion')!
    // Visible but disabled — never hidden.
    expect(getBtn.exists()).toBe(true)
    expect(getBtn.attributes('disabled')).toBeDefined()
    const settings = w.findAll('button').find((b) => b.text() === 'Open Settings')!
    await settings.trigger('click')
    expect(w.emitted('open-settings')).toHaveLength(1)
  })

  it('never auto-calls the API on mount; only an explicit click runs it (AC7.3)', async () => {
    const controller = fakeController()
    const w = mount(WAiPrediction, { props: { market: makeMarket(), controller } })
    expect(controller.run).not.toHaveBeenCalled()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Get AI suggestion')!
      .trigger('click')
    expect(controller.run).toHaveBeenCalledOnce()
  })

  it('announces loading via a polite live region (AC7.7)', () => {
    const controller = fakeController({ state: ref(loading()) })
    const w = mount(WAiPrediction, { props: { market: makeMarket(), controller } })
    const live = w.get('[aria-live="polite"]')
    expect(live.attributes('role')).toBe('status')
    expect(live.text()).toContain('Generating')
  })

  it('renders the result: recommended outcome + numeric confidence + plain-text rationale (AC7.8)', () => {
    const prediction: AiPrediction = {
      recommendedOutcome: 'Yes',
      confidence: 0.73,
      rationale: 'Momentum favors Yes <not html>.',
      modelId: 'free/model',
    }
    const controller = fakeController({ state: ref(successState(prediction)) })
    const w = mount(WAiPrediction, { props: { market: makeMarket(), controller } })
    expect(w.get('.w-ai__recommend').text()).toContain('Yes')
    // Numeric label carries the confidence (not colour/length alone).
    expect(w.get('.sj-progress__label').text()).toBe('73%')
    // Rationale is PLAIN TEXT — the angle brackets survive as text, no injected node.
    expect(w.get('.w-ai__rationale').text()).toContain('<not html>')
    expect(w.find('.w-ai__rationale script').exists()).toBe(false)
    expect(w.text()).toContain('not financial advice')
  })

  it('distinguishes a 429 rate-limit with wait guidance and no auto-retry (AC7.9)', async () => {
    const controller = fakeController({
      state: ref(errorState<AiPrediction>({ kind: 'http', status: 429, retryAfter: 30 })),
      isRateLimited: ref(true),
      retryAfterSeconds: ref(30),
    })
    const w = mount(WAiPrediction, { props: { market: makeMarket(), controller } })
    expect(w.get('.w-ai__error-text').text()).toContain('rate-limited')
    expect(w.text()).toContain('30 second')
    // No auto-retry — retry is only invoked by an explicit click.
    expect(controller.retry).not.toHaveBeenCalled()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Try again')!
      .trigger('click')
    expect(controller.retry).toHaveBeenCalledOnce()
  })

  it('shows a generic error with retry for a hard failure', () => {
    const controller = fakeController({
      state: ref(errorState<AiPrediction>({ kind: 'parse-fail' })),
    })
    const w = mount(WAiPrediction, { props: { market: makeMarket(), controller } })
    expect(w.get('.w-ai__error-text').attributes('role')).toBe('alert')
    expect(w.text()).not.toContain('rate-limited')
    expect(w.findAll('button').some((b) => b.text() === 'Try again')).toBe(true)
  })

  it('has no axe violations for the result state', async () => {
    const prediction: AiPrediction = {
      recommendedOutcome: 'Yes',
      confidence: 0.73,
      rationale: 'Because reasons.',
      modelId: 'free/model',
    }
    const controller = fakeController({ state: ref(successState(prediction)) })
    const w = mount(WAiPrediction, {
      attachTo: document.body,
      props: { market: makeMarket(), controller },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
