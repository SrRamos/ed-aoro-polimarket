/**
 * SJBadge (T504) — semantic-triad variants, text-always (color-not-alone),
 * optional icon slot, and axe.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import SJBadge from '../../src/components/ui/SJBadge.vue'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

describe('SJBadge', () => {
  it('defaults to the neutral variant', () => {
    const w = mount(SJBadge, { slots: { default: 'Multi' } })
    expect(w.classes()).toContain('sj-badge--neutral')
  })

  it.each(['success', 'warning', 'error', 'info', 'neutral'] as const)(
    'renders the %s triad variant with a text label',
    (v) => {
      const w = mount(SJBadge, { props: { variant: v }, slots: { default: 'Yes' } })
      expect(w.classes()).toContain(`sj-badge--${v}`)
      // Meaning is carried by text, never color alone (SC 1.4.1).
      expect(w.get('.sj-badge__label').text()).toBe('Yes')
    },
  )

  it('renders a decorative (aria-hidden) icon slot alongside the label', () => {
    const w = mount(SJBadge, {
      props: { variant: 'success' },
      slots: { default: 'Open', icon: '✓' },
    })
    const icon = w.get('.sj-badge__icon')
    expect(icon.attributes('aria-hidden')).toBe('true')
    expect(icon.text()).toBe('✓')
  })

  it('has no axe violations', async () => {
    const w = mount(SJBadge, {
      attachTo: document.body,
      props: { variant: 'error' },
      slots: { default: 'Closed' },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
