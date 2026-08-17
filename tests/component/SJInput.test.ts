/**
 * SJInput (T502) — persistent label wiring, help/error aria-describedby +
 * aria-invalid, password show/hide (never blocks paste), v-model, and axe.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import SJInput from '../../src/components/ui/SJInput.vue'

const axeOpts = { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } }

describe('SJInput', () => {
  it('renders a persistent visible label linked to the input', () => {
    const w = mount(SJInput, { props: { label: 'Email' } })
    const label = w.get('label')
    const input = w.get('input')
    expect(label.text()).toBe('Email')
    expect(label.attributes('for')).toBe(input.attributes('id'))
    expect(label.classes()).not.toContain('sr-only')
  })

  it('wires help text via aria-describedby', () => {
    const w = mount(SJInput, { props: { label: 'Key', help: 'Stored locally' } })
    const input = w.get('input')
    const help = w.get('.sj-input__help')
    expect(input.attributes('aria-describedby')).toContain(help.attributes('id'))
    expect(input.attributes('aria-invalid')).toBeUndefined()
  })

  it('sets aria-invalid and links the error message when errored', () => {
    const w = mount(SJInput, { props: { label: 'Amount', error: 'Enter a number' } })
    const input = w.get('input')
    const error = w.get('.sj-input__error')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toContain(error.attributes('id'))
    expect(error.attributes('role')).toBe('alert')
    expect(w.classes()).toContain('sj-input--errored')
  })

  it('passes native attributes (type/inputmode/enterkeyhint) through', () => {
    const w = mount(SJInput, {
      props: { label: 'Search' },
      attrs: { type: 'search', inputmode: 'search', enterkeyhint: 'search', autocomplete: 'off' },
    })
    const input = w.get('input')
    expect(input.attributes('type')).toBe('search')
    expect(input.attributes('inputmode')).toBe('search')
    expect(input.attributes('enterkeyhint')).toBe('search')
    expect(input.attributes('autocomplete')).toBe('off')
  })

  it('two-way binds via v-model', async () => {
    const w = mount(SJInput, { props: { label: 'Name', modelValue: '' } })
    await w.get('input').setValue('ada')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['ada'])
  })

  it('password variant starts masked and toggles to text without blocking paste', async () => {
    const w = mount(SJInput, { props: { label: 'API key', type: 'password' } })
    const input = w.get('input')
    expect(input.attributes('type')).toBe('password')

    const toggle = w.get('.sj-input__toggle')
    expect(toggle.attributes('aria-pressed')).toBe('false')

    await toggle.trigger('click')
    expect(w.get('input').attributes('type')).toBe('text')
    expect(w.get('.sj-input__toggle').attributes('aria-pressed')).toBe('true')

    // No paste interception: the input carries no paste handler and still accepts value.
    await w.get('input').setValue('sk-pasted')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['sk-pasted'])
  })

  it('hides the label from view but keeps it for AT when hideLabel', () => {
    const w = mount(SJInput, { props: { label: 'Query', hideLabel: true } })
    expect(w.get('label').classes()).toContain('sr-only')
  })

  it('has no axe violations (labelled, with help + error)', async () => {
    const w = mount(SJInput, {
      attachTo: document.body,
      props: { label: 'Amount', help: 'USD', error: 'Too low' },
    })
    expect(await axe(w.element, axeOpts)).toHaveNoViolations()
    w.unmount()
  })
})
