/**
 * Toast system (T507 · NFR-A11Y-3, WCAG 2.2.1/1.4.13) — useToast queue + auto
 * dismiss + manual dismiss, and SJToastHost's polite/assertive live regions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import { useToast } from '../../src/composables/useToast'
import SJToastHost from '../../src/components/ui/SJToastHost.vue'
import SJToast from '../../src/components/ui/SJToast.vue'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

describe('useToast', () => {
  beforeEach(() => {
    useToast().clearToasts()
    vi.useFakeTimers()
  })
  afterEach(() => {
    useToast().clearToasts()
    vi.useRealTimers()
  })

  it('enqueues a toast with defaults (info variant)', () => {
    const { addToast, toasts } = useToast()
    addToast({ message: 'Saved' })
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ message: 'Saved', variant: 'info' })
  })

  it('auto-dismisses after its duration', () => {
    const { addToast, toasts } = useToast()
    addToast({ message: 'Bye', duration: 3000 })
    expect(toasts).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(toasts).toHaveLength(0)
  })

  it('persists when duration is 0 and dismisses manually', () => {
    const { addToast, dismissToast, toasts } = useToast()
    const id = addToast({ message: 'Stay', duration: 0 })
    vi.advanceTimersByTime(60_000)
    expect(toasts).toHaveLength(1)
    dismissToast(id)
    expect(toasts).toHaveLength(0)
  })
})

describe('SJToastHost', () => {
  beforeEach(() => {
    useToast().clearToasts()
    vi.useFakeTimers()
  })
  afterEach(() => {
    useToast().clearToasts()
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('renders a polite status region and an assertive alert region', async () => {
    const w = mount(SJToastHost, { attachTo: document.body })
    const polite = document.body.querySelector('[role="status"]')
    const assertive = document.body.querySelector('[role="alert"]')
    expect(polite?.getAttribute('aria-live')).toBe('polite')
    expect(assertive?.getAttribute('aria-live')).toBe('assertive')
    w.unmount()
  })

  it('routes error toasts to the assertive region and others to polite', async () => {
    const w = mount(SJToastHost, { attachTo: document.body })
    const { addToast } = useToast()
    addToast({ message: 'Filled', variant: 'success', duration: 0 })
    addToast({ message: 'Failed', variant: 'error', duration: 0 })
    await nextTick()

    const polite = document.body.querySelector('[role="status"]')!
    const assertive = document.body.querySelector('[role="alert"]')!
    expect(polite.textContent).toContain('Filled')
    expect(polite.textContent).not.toContain('Failed')
    expect(assertive.textContent).toContain('Failed')
    w.unmount()
  })

  it('dismisses a toast from its dismiss button', async () => {
    const w = mount(SJToastHost, { attachTo: document.body })
    const { addToast, toasts } = useToast()
    addToast({ message: 'Filled', variant: 'success', duration: 0 })
    await nextTick()
    document.body.querySelector<HTMLElement>('[aria-label="Dismiss notification"]')!.click()
    await nextTick()
    expect(toasts).toHaveLength(0)
    w.unmount()
  })
})

describe('SJToast', () => {
  it('pairs the variant with an icon + text (color not alone)', () => {
    const w = mount(SJToast, { props: { message: 'Done', variant: 'success' } })
    expect(w.get('.sj-toast__icon').attributes('aria-hidden')).toBe('true')
    expect(w.get('.sj-toast__message').text()).toBe('Done')
    expect(w.classes()).toContain('sj-toast--success')
  })

  it('emits dismiss from the close control', async () => {
    const w = mount(SJToast, { props: { message: 'Done', variant: 'info' } })
    await w.get('[aria-label="Dismiss notification"]').trigger('click')
    expect(w.emitted('dismiss')).toHaveLength(1)
  })

  it('has no axe violations', async () => {
    const w = mount(SJToast, {
      attachTo: document.body,
      props: { message: 'Done', variant: 'error' },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
