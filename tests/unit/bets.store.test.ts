/**
 * Positions store (T703 · AC6.1/AC6.4/AC6.5 · T3/T13/C12).
 * localStorage hardening: per-item validation, drop-invalid-keep-rest,
 * quota/unavailable write handling, corrupt≠first-run, cross-tab reconciliation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { BetReceipt, Position } from '../../src/models/bet'
import {
  useBetsStore,
  loadPositions,
  isValidPosition,
  type RecordBetParams,
} from '../../src/stores/bets.store'

const STORAGE_KEY = 'aora:positions'

function position(overrides: Partial<Position> = {}): Position {
  return {
    status: 'filled',
    avgPrice: 0.5,
    shares: 200,
    cost: 100,
    txHash: 'mock-0xabc',
    id: 'p1',
    marketId: '507081',
    question: 'Will it rain?',
    outcome: 'Yes',
    size: 100,
    price: 0.5,
    createdAt: '2026-08-17T00:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  }
}

function receipt(): BetReceipt {
  return { status: 'filled', avgPrice: 0.5, shares: 200, cost: 100, txHash: 'mock-0xabc' }
}

function recordParams(overrides: Partial<RecordBetParams> = {}): RecordBetParams {
  return {
    marketId: '507081',
    question: 'Will it rain?',
    outcome: 'Yes',
    size: 100,
    price: 0.5,
    receipt: receipt(),
    ...overrides,
  }
}

function writeEnvelope(items: unknown[], schemaVersion: unknown = 1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion, items }))
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('isValidPosition (per-item schema, AC6.4)', () => {
  it('accepts a well-formed position', () => {
    expect(isValidPosition(position())).toBe(true)
  })
  it('rejects wrong type / missing fields / non-finite numbers / bad status', () => {
    expect(isValidPosition(null)).toBe(false)
    expect(isValidPosition(position({ size: 0 }))).toBe(false)
    expect(isValidPosition(position({ price: -1 }))).toBe(false)
    expect(isValidPosition(position({ cost: Number.NaN }))).toBe(false)
    expect(isValidPosition({ ...position(), status: 'pending' })).toBe(false)
    expect(isValidPosition({ ...position(), schemaVersion: 2 })).toBe(false)
    const noQuestion: Record<string, unknown> = { ...position() }
    delete noQuestion.question
    expect(isValidPosition(noQuestion)).toBe(false)
  })
})

describe('load — first run vs corrupt (T13)', () => {
  it('missing key → clean first-run, NOT corrupt', () => {
    const store = useBetsStore()
    expect(store.positions).toEqual([])
    expect(store.corruptNotice).toBe(false)
    expect(store.isFirstRun).toBe(true)
  })

  it('unparseable payload → corrupt notice (distinct from first-run), recovers empty', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const store = useBetsStore()
    expect(store.positions).toEqual([])
    expect(store.corruptNotice).toBe(true)
    expect(store.isFirstRun).toBe(false)
  })

  it('drops only invalid item(s) and keeps the rest (no wipe-on-tamper)', () => {
    writeEnvelope([position({ id: 'good1' }), { id: 'tampered' }, position({ id: 'good2' })])
    const { positions, corrupt } = loadPositions()
    expect(positions.map((p) => p.id)).toEqual(['good1', 'good2'])
    expect(corrupt).toBe(true) // an item was dropped → recoverable notice
  })

  it('all-valid payload → not corrupt', () => {
    writeEnvelope([position({ id: 'a' }), position({ id: 'b' })])
    const store = useBetsStore()
    expect(store.positions.map((p) => p.id)).toEqual(['a', 'b'])
    expect(store.corruptNotice).toBe(false)
  })

  it('wrong schemaVersion envelope → corrupt notice', () => {
    writeEnvelope([position()], 2)
    const { corrupt } = loadPositions()
    expect(corrupt).toBe(true)
  })
})

describe('recordFilledBet — persist-first (AC6.1)', () => {
  it('persists and commits the position (newest first)', () => {
    const store = useBetsStore()
    const first = store.recordFilledBet(recordParams({ outcome: 'Yes' }))
    const second = store.recordFilledBet(recordParams({ outcome: 'No' }))
    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(store.positions).toHaveLength(2)
    expect(store.positions[0]?.outcome).toBe('No') // newest first
    // Survives a reload (fresh store reads the same localStorage).
    setActivePinia(createPinia())
    const reloaded = useBetsStore()
    expect(reloaded.positions).toHaveLength(2)
  })

  it('QuotaExceededError → saveError, position NOT committed (no receipt for unpersisted bet)', () => {
    const store = useBetsStore()
    const quota = new DOMException('quota', 'QuotaExceededError')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quota
    })
    const persisted = store.recordFilledBet(recordParams())
    expect(persisted).toBe(false)
    expect(store.saveError).toBe(true)
    expect(store.positions).toEqual([]) // not committed in-memory
  })

  it('storage-unavailable (setItem throws) → saveError, not committed', () => {
    const store = useBetsStore()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    const persisted = store.addPosition(position())
    expect(persisted).toBe(false)
    expect(store.saveError).toBe(true)
    expect(store.positions).toEqual([])
  })
})

describe('cross-tab reconciliation (AC6.5 / C12)', () => {
  it('a storage event for the positions key re-reads + re-validates', () => {
    const store = useBetsStore()
    expect(store.positions).toEqual([])

    // Another tab wrote two positions, one tampered.
    writeEnvelope([position({ id: 'x' }), { bad: true }])
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: localStorage.getItem(STORAGE_KEY),
      }),
    )

    expect(store.positions.map((p) => p.id)).toEqual(['x'])
    expect(store.corruptNotice).toBe(true) // dropped the tampered item
  })

  it('ignores storage events for unrelated keys', () => {
    const store = useBetsStore()
    writeEnvelope([position({ id: 'x' })])
    window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-key' }))
    expect(store.positions).toEqual([]) // unchanged
  })

  it('reconciles a full clear (key === null)', () => {
    writeEnvelope([position({ id: 'x' })])
    const store = useBetsStore()
    expect(store.positions).toHaveLength(1)
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(store.positions).toEqual([])
  })
})
