/**
 * SJButton (T501) — variants, sizes, disabled, loading/aria-busy, icon-only
 * accessible-name guard, click, and automated axe a11y.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import SJButton from '../../src/components/ui/SJButton.vue'
import SJSpinner from '../../src/components/ui/SJSpinner.vue'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

afterEach(() => vi.restoreAllMocks())

describe('SJButton', () => {
  it('defaults to a type=button primary button', () => {
    const w = mount(SJButton, { slots: { default: 'Go' } })
    expect(w.element.tagName).toBe('BUTTON')
    expect(w.attributes('type')).toBe('button')
    expect(w.classes()).toContain('sj-button--primary')
    expect(w.text()).toBe('Go')
  })

  it.each(['primary', 'secondary', 'ghost'] as const)('renders the %s variant class', (v) => {
    const w = mount(SJButton, { props: { variant: v }, slots: { default: 'x' } })
    expect(w.classes()).toContain(`sj-button--${v}`)
  })

  it.each(['sm', 'md', 'lg'] as const)('renders the %s size class', (s) => {
    const w = mount(SJButton, { props: { size: s }, slots: { default: 'x' } })
    expect(w.classes()).toContain(`sj-button--${s}`)
  })

  it('disables the native button when disabled', () => {
    const w = mount(SJButton, { props: { disabled: true }, slots: { default: 'x' } })
    expect(w.attributes('disabled')).toBeDefined()
  })

  it('sets aria-busy and disables + shows a spinner while loading', () => {
    const w = mount(SJButton, { props: { loading: true }, slots: { default: 'Save' } })
    expect(w.attributes('aria-busy')).toBe('true')
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.findComponent(SJSpinner).exists()).toBe(true)
  })

  it('does not set aria-busy when idle', () => {
    const w = mount(SJButton, { slots: { default: 'x' } })
    expect(w.attributes('aria-busy')).toBeUndefined()
  })

  it('passes an accessible name through for icon-only buttons', () => {
    const w = mount(SJButton, {
      props: { iconOnly: true },
      attrs: { 'aria-label': 'Close' },
      slots: { default: '✕' },
    })
    expect(w.classes()).toContain('sj-button--icon')
    expect(w.attributes('aria-label')).toBe('Close')
  })

  it('dev-warns when an icon-only button has no accessible name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mount(SJButton, { props: { iconOnly: true }, slots: { default: '✕' } })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('aria-label'))
  })

  it('is clickable (emits native click) when enabled', async () => {
    const w = mount(SJButton, { slots: { default: 'x' } })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('has no axe violations', async () => {
    const w = mount(SJButton, { attachTo: document.body, slots: { default: 'Place bet' } })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
