/**
 * SJSpinner + SJSkeleton (T506) — status role + sr label, decorative skeleton,
 * caller-controlled sizing (CLS), axe.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import SJSpinner from '../../src/components/ui/SJSpinner.vue'
import SJSkeleton from '../../src/components/ui/SJSkeleton.vue'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

describe('SJSpinner', () => {
  it('exposes role=status with a visually-hidden label', () => {
    const w = mount(SJSpinner, { props: { label: 'Loading markets' } })
    expect(w.attributes('role')).toBe('status')
    const sr = w.get('.sr-only')
    expect(sr.text()).toBe('Loading markets')
  })

  it('marks the animated ring decorative', () => {
    const w = mount(SJSpinner)
    expect(w.get('.sj-spinner__ring').attributes('aria-hidden')).toBe('true')
  })

  it.each(['sm', 'md', 'lg'] as const)('applies the %s size class', (s) => {
    expect(mount(SJSpinner, { props: { size: s } }).classes()).toContain(`sj-spinner--${s}`)
  })

  it('has no axe violations', async () => {
    const w = mount(SJSpinner, { attachTo: document.body })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})

describe('SJSkeleton', () => {
  it('is decorative (aria-hidden)', () => {
    expect(mount(SJSkeleton).attributes('aria-hidden')).toBe('true')
  })

  it('reflects caller sizing so it can mirror real content height (CLS)', () => {
    const w = mount(SJSkeleton, { props: { width: 'var(--space-16)', height: 'var(--space-8)' } })
    const style = w.attributes('style') ?? ''
    expect(style).toContain('width: var(--space-16)')
    expect(style).toContain('height: var(--space-8)')
  })

  it('renders a pill radius when circle', () => {
    const w = mount(SJSkeleton, { props: { circle: true } })
    expect(w.attributes('style')).toContain('border-radius: var(--radius-pill)')
  })
})
