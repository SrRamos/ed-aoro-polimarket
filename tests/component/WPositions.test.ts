/**
 * WPositions (T606) — the three distinct surfaces: first-run onboarding empty
 * state (AC6.3), the corrupt-storage recoverable notice (AC6.4, NOT onboarding),
 * and the positions table with format.ts figures (AC6.2). Store injected. Plus axe.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import WPositions from '../../src/components/widget/WPositions.vue'
import type { Position } from '../../src/models/bet'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

function makePosition(over: Partial<Position> = {}): Position {
  return {
    status: 'filled',
    avgPrice: 0.5,
    shares: 20,
    cost: 10,
    txHash: 'mock-0xabc',
    id: 'p1',
    marketId: 'm1',
    question: 'Will it rain tomorrow?',
    outcome: 'Yes',
    size: 10,
    price: 0.5,
    createdAt: '2025-01-01T00:00:00Z',
    schemaVersion: 1,
    ...over,
  }
}

function makeStore(over: Partial<Parameters<typeof mkStore>[0]> = {}) {
  return mkStore(over)
}
function mkStore(o: {
  positions?: Position[]
  isFirstRun?: boolean
  corruptNotice?: boolean
  dismissCorruptNotice?: () => void
}) {
  return {
    positions: o.positions ?? [],
    isFirstRun: o.isFirstRun ?? false,
    corruptNotice: o.corruptNotice ?? false,
    dismissCorruptNotice: o.dismissCorruptNotice ?? vi.fn(),
  }
}

describe('WPositions', () => {
  it('shows the first-run onboarding empty state with a browse CTA (AC6.3)', async () => {
    const w = mount(WPositions, {
      props: { store: makeStore({ positions: [], isFirstRun: true, corruptNotice: false }) },
    })
    expect(w.get('.w-positions__empty').text()).toContain('No bets yet')
    // Onboarding is NOT the corrupt notice.
    expect(w.find('.w-positions__notice').exists()).toBe(false)
    const browse = w.findAll('button').find((b) => b.text() === 'Browse markets')!
    await browse.trigger('click')
    expect(w.emitted('browse')).toHaveLength(1)
  })

  it('shows a DISTINCT recoverable corrupt notice (role=status), not the onboarding state (AC6.4)', async () => {
    const dismiss = vi.fn()
    const w = mount(WPositions, {
      props: {
        store: makeStore({
          positions: [makePosition()],
          isFirstRun: false,
          corruptNotice: true,
          dismissCorruptNotice: dismiss,
        }),
      },
    })
    const notice = w.get('.w-positions__notice')
    expect(notice.attributes('role')).toBe('status')
    expect(notice.text()).toContain('couldn’t be read')
    // Not the first-run onboarding.
    expect(w.find('.w-positions__empty').exists()).toBe(false)
    // Surviving positions still render alongside the notice.
    expect(w.find('.w-positions__table').exists()).toBe(true)
    await w
      .findAll('button')
      .find((b) => b.text() === 'Dismiss')!
      .trigger('click')
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('renders each position with question, outcome, size, price, cost, shares, payout via format.ts (AC6.2)', () => {
    const w = mount(WPositions, {
      props: { store: makeStore({ positions: [makePosition()], isFirstRun: false }) },
    })
    const text = w.text()
    expect(text).toContain('Will it rain tomorrow?')
    expect(text).toContain('Yes')
    expect(text).toContain('$10.00') // size + cost
    expect(text).toContain('50%') // price
    expect(text).toContain('20') // shares
    expect(text).toContain('$20.00') // payout = shares × $1
  })

  it('keys rows and renders one row per position', () => {
    const w = mount(WPositions, {
      props: {
        store: makeStore({
          positions: [makePosition({ id: 'a' }), makePosition({ id: 'b' })],
          isFirstRun: false,
        }),
      },
    })
    expect(w.findAll('.w-positions__row')).toHaveLength(2)
  })

  it('has no axe violations with positions', async () => {
    const w = mount(WPositions, {
      attachTo: document.body,
      props: { store: makeStore({ positions: [makePosition()], isFirstRun: false }) },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
