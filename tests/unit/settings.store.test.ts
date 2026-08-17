/**
 * Settings store (T303 · AC8.1/AC8.2/AC6.5 · C12).
 * Key persist/clear, AI enablement toggle, cross-tab reconciliation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../../src/stores/settings.store'

const STORAGE_KEY = 'aora:openrouter-key'
const KEY = 'sk-or-v1-test123'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('save / clear key (AC8.1 / AC8.2)', () => {
  it('starts with no key (AI disabled) and exposes env-driven flags', () => {
    const store = useSettingsStore()
    expect(store.openrouterKey).toBe('')
    expect(store.hasKey).toBe(false)
    expect(store.betMode).toBe('mock')
    expect(store.aiMode).toBe('user-key')
  })

  it('saves a key → persisted + AI enabled, and survives reload', () => {
    const store = useSettingsStore()
    store.saveKey(KEY)
    expect(store.hasKey).toBe(true)
    expect(store.openrouterKey).toBe(KEY)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(KEY)

    setActivePinia(createPinia())
    const reloaded = useSettingsStore()
    expect(reloaded.openrouterKey).toBe(KEY)
  })

  it('trims and treats a blank value as a clear', () => {
    const store = useSettingsStore()
    store.saveKey(`  ${KEY}  `)
    expect(store.openrouterKey).toBe(KEY)
    store.saveKey('   ')
    expect(store.hasKey).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clearKey removes the key from storage + memory (AI back to disabled)', () => {
    const store = useSettingsStore()
    store.saveKey(KEY)
    store.clearKey()
    expect(store.hasKey).toBe(false)
    expect(store.openrouterKey).toBe('')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('persist failure raises saveError but keeps the key for the session', () => {
    const store = useSettingsStore()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    store.saveKey(KEY)
    expect(store.saveError).toBe(true)
    expect(store.openrouterKey).toBe(KEY) // usable this session
  })
})

describe('cross-tab reconciliation (AC6.5 / C12)', () => {
  it('reconciles a key saved in another tab without reload', () => {
    const store = useSettingsStore()
    expect(store.hasKey).toBe(false)
    localStorage.setItem(STORAGE_KEY, KEY)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: KEY }))
    expect(store.openrouterKey).toBe(KEY)
    expect(store.hasKey).toBe(true)
  })

  it('reconciles a key cleared in another tab', () => {
    localStorage.setItem(STORAGE_KEY, KEY)
    const store = useSettingsStore()
    expect(store.hasKey).toBe(true)
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: null }))
    expect(store.hasKey).toBe(false)
  })

  it('ignores unrelated storage keys', () => {
    const store = useSettingsStore()
    store.saveKey(KEY)
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new StorageEvent('storage', { key: 'aora:positions' }))
    expect(store.openrouterKey).toBe(KEY) // untouched
  })
})
