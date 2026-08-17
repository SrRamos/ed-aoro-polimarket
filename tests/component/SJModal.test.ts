/**
 * SJModal (T505 · AC4.4/AC4.7) — the a11y dialog contract: role/aria-modal/
 * aria-labelledby, Teleport to body, defined initial focus, focus trap, Escape,
 * backdrop dismiss, focus restore, and axe.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import SJModal from '../../src/components/ui/SJModal.vue'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }
const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null
const bodySlot = '<button id="b1">One</button><button id="b2">Two</button>'

function keydown(el: Element, key: string, shiftKey = false): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
}

afterEach(() => {
  document.body.replaceChildren()
  document.body.style.overflow = ''
  vi.restoreAllMocks()
})

describe('SJModal', () => {
  it('exposes dialog semantics wired to the title', async () => {
    const w = mount(SJModal, {
      props: { open: true, title: 'Confirm bet' },
      attachTo: document.body,
    })
    await nextTick()
    const d = dialog()!
    expect(d).toBeTruthy()
    expect(d.getAttribute('aria-modal')).toBe('true')
    const titleId = d.getAttribute('aria-labelledby')!
    expect(document.getElementById(titleId)?.textContent).toBe('Confirm bet')
    w.unmount()
  })

  it('teleports the dialog to <body>, not inside the mount root', async () => {
    const w = mount(SJModal, { props: { open: true, title: 'T' }, attachTo: document.body })
    await nextTick()
    expect(document.body.querySelector('.sj-modal')).toBeTruthy()
    expect(w.element.querySelector?.('[role="dialog"]')).toBeFalsy()
    w.unmount()
  })

  it('moves initial focus to the dialog panel on open', async () => {
    const w = mount(SJModal, { props: { open: true, title: 'T' }, attachTo: document.body })
    await nextTick()
    expect(document.activeElement).toBe(dialog())
    w.unmount()
  })

  it('closes on Escape (emits close + update:open=false)', async () => {
    const w = mount(SJModal, { props: { open: true, title: 'T' }, attachTo: document.body })
    await nextTick()
    keydown(dialog()!, 'Escape')
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    w.unmount()
  })

  it('closes on backdrop click', async () => {
    const w = mount(SJModal, { props: { open: true, title: 'T' }, attachTo: document.body })
    await nextTick()
    document.body.querySelector<HTMLElement>('.sj-modal__backdrop')!.click()
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    w.unmount()
  })

  it('traps Tab within the dialog (wraps last→first)', async () => {
    const w = mount(SJModal, {
      props: { open: true, title: 'T' },
      slots: { default: bodySlot },
      attachTo: document.body,
    })
    await nextTick()
    const last = document.getElementById('b2')!
    last.focus()
    keydown(last, 'Tab')
    // Wraps to the first focusable — the close button.
    expect(document.activeElement).toBe(document.body.querySelector('[aria-label="Close"]'))
    w.unmount()
  })

  it('traps Shift+Tab within the dialog (wraps first→last)', async () => {
    const w = mount(SJModal, {
      props: { open: true, title: 'T' },
      slots: { default: bodySlot },
      attachTo: document.body,
    })
    await nextTick()
    const close = document.body.querySelector<HTMLElement>('[aria-label="Close"]')!
    close.focus()
    keydown(close, 'Tab', true)
    expect(document.activeElement).toBe(document.getElementById('b2'))
    w.unmount()
  })

  it('restores focus to the invoking control on close', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const w = mount(SJModal, { props: { open: true, title: 'T' }, attachTo: document.body })
    await nextTick()
    expect(document.activeElement).toBe(dialog())

    await w.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(opener)
    w.unmount()
  })

  it('wires aria-describedby only when describe is set', async () => {
    const w = mount(SJModal, {
      props: { open: true, title: 'T', describe: true },
      slots: { summary: 'Betting $10 on Yes' },
      attachTo: document.body,
    })
    await nextTick()
    const d = dialog()!
    const descId = d.getAttribute('aria-describedby')!
    expect(document.getElementById(descId)?.textContent).toContain('Betting $10')
    w.unmount()
  })

  it('has no axe violations while open', async () => {
    const w = mount(SJModal, {
      props: { open: true, title: 'Market detail' },
      slots: { default: '<p>Body copy</p>' },
      attachTo: document.body,
    })
    await nextTick()
    expect(await axe(dialog()!, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
