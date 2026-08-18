import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBetsStore } from '../../src/stores/bets.store'
import { useSettingsStore } from '../../src/stores/settings.store'
import { readJson, writeJson, removeItem } from '../../src/stores/persist'
import type { BetOrder } from '../../src/models/bet'

const POSITIONS_KEY = 'polymarket-widget:positions:v1'
const SETTINGS_KEY = 'polymarket-widget:settings:v1'

function order(overrides: Partial<BetOrder> = {}): BetOrder {
  return {
    marketId: 'm1',
    tokenId: 't1',
    outcome: 'Yes',
    side: 'BUY',
    size: 100,
    price: 0.5,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('persist helper (AC6.4)', () => {
  it('readJson returns the fallback on a missing key', () => {
    expect(readJson('nope', [])).toEqual([])
  })
  it('readJson returns the fallback on corrupt JSON', () => {
    localStorage.setItem('k', '{ not json')
    expect(readJson('k', { def: 1 })).toEqual({ def: 1 })
  })
  it('writeJson + readJson round-trips a value', () => {
    writeJson('k', { a: 1, b: [2, 3] })
    expect(readJson('k', null)).toEqual({ a: 1, b: [2, 3] })
  })
  it('removeItem deletes a key', () => {
    writeJson('k', 1)
    removeItem('k')
    expect(readJson('k', 'gone')).toBe('gone')
  })
})

describe('bets store persistence (AC6.1, AC6.4)', () => {
  it('persists a placed position and restores it on reload (AC6.1)', async () => {
    const bets = useBetsStore()
    expect(bets.positions).toEqual([])

    const position = await bets.placeBet(order(), { marketQuestion: 'Will it rain?' })
    expect(bets.positions).toHaveLength(1)
    expect(position.receipt.status).toBe('filled')
    expect(position.receipt.builderCode).toBeTruthy()

    // Written through to localStorage.
    const stored = JSON.parse(localStorage.getItem(POSITIONS_KEY)!)
    expect(Array.isArray(stored)).toBe(true)
    expect(stored).toHaveLength(1)
    expect(stored[0].marketQuestion).toBe('Will it rain?')

    // Simulate a reload: a fresh pinia rehydrates from storage.
    setActivePinia(createPinia())
    const reloaded = useBetsStore()
    expect(reloaded.positions).toHaveLength(1)
    expect(reloaded.positions[0].outcome).toBe('Yes')
    expect(reloaded.positions[0].receipt.shares).toBeCloseTo(200, 6)
  })

  it('leaves positions unchanged when placeBet rejects (AC5.7)', async () => {
    const bets = useBetsStore()
    await expect(bets.placeBet(order({ size: 0 }), { marketQuestion: 'Q' })).rejects.toBeTruthy()
    expect(bets.positions).toEqual([])
    expect(bets.placeStatus).toBe('error')
    expect(localStorage.getItem(POSITIONS_KEY)).toBeNull()
  })

  it('recovers to an empty list when the stored payload is corrupt (AC6.4)', () => {
    localStorage.setItem(POSITIONS_KEY, '{ corrupt payload')
    setActivePinia(createPinia())
    const bets = useBetsStore()
    expect(bets.positions).toEqual([])
  })

  it('recovers to an empty list when the payload is valid JSON but not an array (AC6.4)', () => {
    localStorage.setItem(POSITIONS_KEY, '{"foo":"bar"}')
    setActivePinia(createPinia())
    const bets = useBetsStore()
    expect(bets.positions).toEqual([])
  })
})

describe('settings store persistence (AC8.1, AC8.2)', () => {
  it('saves and restores the OpenRouter key', () => {
    const settings = useSettingsStore()
    expect(settings.hasKey).toBe(false)

    settings.saveKey('  sk-or-abc  ')
    expect(settings.openRouterKey).toBe('sk-or-abc') // trimmed
    expect(settings.hasKey).toBe(true)

    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!)
    expect(stored.openRouterKey).toBe('sk-or-abc')

    setActivePinia(createPinia())
    const reloaded = useSettingsStore()
    expect(reloaded.openRouterKey).toBe('sk-or-abc')
    expect(reloaded.hasKey).toBe(true)
  })

  it('clears the key and disables AI (AC8.2)', () => {
    const settings = useSettingsStore()
    settings.saveKey('sk-or-abc')
    settings.clearKey()
    expect(settings.openRouterKey).toBeNull()
    expect(settings.hasKey).toBe(false)

    setActivePinia(createPinia())
    const reloaded = useSettingsStore()
    expect(reloaded.openRouterKey).toBeNull()
  })
})
