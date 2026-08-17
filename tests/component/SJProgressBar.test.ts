/**
 * SJProgressBar (shared meter · C1/C14) — scaleX fill (never width), clamp,
 * non-finite guard, aria-hidden track, numeric label carries meaning, axe.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import SJProgressBar from '../../src/components/ui/SJProgressBar.vue'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

describe('SJProgressBar', () => {
  it('fills via transform: scaleX (not width)', () => {
    const w = mount(SJProgressBar, { props: { value: 0.62 } })
    const fill = w.get('.sj-progress__fill')
    expect(fill.attributes('style')).toContain('scaleX(0.62)')
    expect(fill.attributes('style')).not.toContain('width')
  })

  it('clamps out-of-range values to [0,1]', () => {
    expect(
      mount(SJProgressBar, { props: { value: 2 } })
        .get('.sj-progress__fill')
        .attributes('style'),
    ).toContain('scaleX(1)')
    expect(
      mount(SJProgressBar, { props: { value: -1 } })
        .get('.sj-progress__fill')
        .attributes('style'),
    ).toContain('scaleX(0)')
  })

  it('supports a max other than 1', () => {
    const w = mount(SJProgressBar, { props: { value: 25, max: 100 } })
    expect(w.get('.sj-progress__fill').attributes('style')).toContain('scaleX(0.25)')
  })

  it('guards non-finite input (renders 0, never NaN)', () => {
    const w = mount(SJProgressBar, { props: { value: Number.NaN } })
    expect(w.get('.sj-progress__fill').attributes('style')).toContain('scaleX(0)')
  })

  it('hides the track from AT so the numeric label carries the meaning', () => {
    const w = mount(SJProgressBar, { props: { value: 0.5 }, slots: { default: '50%' } })
    expect(w.get('.sj-progress__track').attributes('aria-hidden')).toBe('true')
    expect(w.get('.sj-progress__label').text()).toBe('50%')
  })

  it('applies the tone class (primary = indigo accent)', () => {
    const w = mount(SJProgressBar, { props: { value: 0.5, tone: 'neutral' } })
    expect(w.get('.sj-progress__fill').classes()).toContain('sj-progress__fill--neutral')
  })

  it('has no axe violations', async () => {
    const w = mount(SJProgressBar, {
      attachTo: document.body,
      props: { value: 0.8 },
      slots: { default: '80% confidence' },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
