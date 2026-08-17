/**
 * SJCard (T503) — static vs interactive (as-button) rendering + focus target + axe.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import SJCard from '../../src/components/ui/SJCard.vue'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

describe('SJCard', () => {
  it('renders a non-interactive section by default', () => {
    const w = mount(SJCard, { slots: { default: 'Body' } })
    expect(w.element.tagName).toBe('SECTION')
    expect(w.classes()).toContain('sj-card')
    expect(w.classes()).not.toContain('sj-card--interactive')
  })

  it('honors the `as` tag for static cards', () => {
    const w = mount(SJCard, { props: { as: 'article' }, slots: { default: 'x' } })
    expect(w.element.tagName).toBe('ARTICLE')
  })

  it('renders a real button (keyboard-focusable) when interactive', async () => {
    const w = mount(SJCard, { props: { interactive: true }, slots: { default: 'Open' } })
    expect(w.element.tagName).toBe('BUTTON')
    expect(w.attributes('type')).toBe('button')
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('has no axe violations for an interactive card', async () => {
    const w = mount(SJCard, {
      attachTo: document.body,
      props: { interactive: true },
      slots: { default: 'Market question' },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
