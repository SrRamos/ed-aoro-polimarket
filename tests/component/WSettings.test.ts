/**
 * WSettings (T608) — password key field with show/hide toggle + paste-allowed
 * semantics (AC8.6), save/clear bound to the store (AC8.1/8.2), the security
 * disclaimer (AC8.3), and the persist-failure notice. Store injected. Plus axe.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import WSettings from '../../src/components/widget/WSettings.vue'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

function makeStore(over: Partial<ReturnType<typeof base>> = {}) {
  return { ...base(), ...over }
}
function base() {
  return {
    openrouterKey: '',
    hasKey: false,
    saveError: false,
    saveKey: vi.fn(),
    clearKey: vi.fn(),
  }
}

describe('WSettings', () => {
  it('renders the key field as type=password with disabled auto-* and a show/hide toggle (AC8.6)', async () => {
    const w = mount(WSettings, { props: { store: makeStore() } })
    const input = w.get('input')
    expect(input.attributes('type')).toBe('password')
    expect(input.attributes('autocomplete')).toBe('off')
    expect(input.attributes('autocapitalize')).toBe('off')
    expect(input.attributes('autocorrect')).toBe('off')
    // Show/hide toggle swaps the type only (paste + password managers stay live).
    const toggle = w.get('.sj-input__toggle')
    await toggle.trigger('click')
    expect(w.get('input').attributes('type')).toBe('text')
  })

  it('does not block paste (no onpaste handler on the field)', () => {
    const w = mount(WSettings, { props: { store: makeStore() } })
    // WCAG 3.3.8: the field must accept pasted values — no paste interception.
    expect(w.get('input').attributes('onpaste')).toBeUndefined()
  })

  it('saves the entered key via the store and enables AI (AC8.1)', async () => {
    const store = makeStore()
    const w = mount(WSettings, { props: { store } })
    const saveBtn = () => w.findAll('button').find((b) => b.text() === 'Save key')!
    expect(saveBtn().attributes('disabled')).toBeDefined() // disabled while empty
    await w.get('input').setValue('sk-or-abc123')
    expect(saveBtn().attributes('disabled')).toBeUndefined()
    await w.get('form').trigger('submit')
    expect(store.saveKey).toHaveBeenCalledWith('sk-or-abc123')
    expect(w.emitted('saved')).toHaveLength(1)
  })

  it('clears the key via the store when a key is present (AC8.2)', async () => {
    const store = makeStore({ openrouterKey: 'sk-or-existing', hasKey: true })
    const w = mount(WSettings, { props: { store } })
    const clearBtn = w.findAll('button').find((b) => b.text() === 'Clear key')!
    expect(clearBtn.attributes('disabled')).toBeUndefined()
    await clearBtn.trigger('click')
    expect(store.clearKey).toHaveBeenCalledOnce()
    expect(w.emitted('cleared')).toHaveLength(1)
  })

  it('shows the security disclaimer: local storage, direct-to-OpenRouter, scoped/revocable (AC8.3)', () => {
    const w = mount(WSettings, { props: { store: makeStore() } })
    const text = w.text()
    expect(text).toContain('readable by any script')
    expect(text).toContain('directly to OpenRouter')
    expect(text).toContain('scoped, spend-capped')
    expect(text).toContain('revoke')
    // Notes bets are simulated.
    expect(text).toContain('simulated')
  })

  it('surfaces a non-blocking notice when the key could not be persisted', () => {
    const w = mount(WSettings, { props: { store: makeStore({ saveError: true }) } })
    expect(w.get('.w-settings__save-error').attributes('role')).toBe('status')
    expect(w.text()).toContain('couldn’t save the key locally')
  })

  it('has no axe violations', async () => {
    const w = mount(WSettings, { attachTo: document.body, props: { store: makeStore() } })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
