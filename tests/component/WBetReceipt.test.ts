/**
 * WBetReceipt (T605) — renders the filled-bet figures via format.ts, and shows the
 * "couldn't save locally" notice (never a false success) when persistence failed
 * (AC6.1). Plus axe.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import WBetReceipt from '../../src/components/widget/WBetReceipt.vue'
import type { BetReceipt } from '../../src/models/bet'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

const receipt: BetReceipt = {
  status: 'filled',
  avgPrice: 0.5,
  shares: 20,
  cost: 10,
  txHash: 'mock-0xabc',
}

describe('WBetReceipt', () => {
  it('renders outcome, size, avgPrice %, cost, shares and payout via format.ts', () => {
    const w = mount(WBetReceipt, {
      props: { receipt, outcome: 'Yes', size: 10, question: 'Will it rain?' },
    })
    expect(w.text()).toContain('Bet filled')
    expect(w.text()).toContain('Will it rain?')
    expect(w.text()).toContain('Yes')
    // avgPrice 0.5 → 50% (pinned percent), cost $10.00, payout = shares = $20.00.
    expect(w.text()).toContain('50%')
    expect(w.text()).toContain('$10.00')
    expect(w.text()).toContain('20') // shares
    expect(w.text()).toContain('$20.00') // payout
  })

  it('shows the "couldn’t save locally" notice INSTEAD of a success receipt when saveError', () => {
    const w = mount(WBetReceipt, {
      props: { receipt, outcome: 'Yes', size: 10, saveError: true },
    })
    expect(w.get('.w-bet-receipt--unsaved').attributes('role')).toBe('status')
    expect(w.text()).toContain('couldn’t save it locally')
    // No false success.
    expect(w.text()).not.toContain('Bet filled')
  })

  it('has no axe violations', async () => {
    const w = mount(WBetReceipt, {
      attachTo: document.body,
      props: { receipt, outcome: 'Yes', size: 10, question: 'Will it rain?' },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
