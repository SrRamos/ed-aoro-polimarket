/**
 * Positions store (T302 · AC6.1/AC6.4/AC6.5 · T3/T13/C12 · plan §2).
 *
 * The betting *service* is pure (no persistence) — persisting a filled receipt as
 * a Position, and reconciling it across tabs, is THIS store's job. Persistence is
 * `localStorage` only, hardened per plan §2:
 *   - READ: per-item schema+type validation → drop only invalid item(s), keep the
 *     rest (never a wipe-on-tamper DoS). A corrupt/partial payload raises a
 *     DISTINCT recoverable notice (`corruptNotice`) — NOT the first-run empty
 *     state (which is simply "zero positions AND not corrupt").
 *   - WRITE: `QuotaExceededError` / storage-unavailable → a non-blocking
 *     `saveError` flag; the position is NOT committed in-memory, so the UI must
 *     not present a receipt for a bet it could not persist (AC6.1).
 *   - CROSS-TAB: a `window` `storage` listener re-reads + re-validates the payload
 *     so a bet placed in another tab appears here without a reload (AC6.5).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BetReceipt, Position } from '../models/bet'
import { readItem, writeItem } from '../utils/storage'
import { logEvent } from '../utils/logger'

/** Versioned storage key + envelope so a future schema change is detectable. */
const STORAGE_KEY = 'aora:positions'
const SCHEMA_VERSION = 1 as const

interface PositionsEnvelope {
  schemaVersion: typeof SCHEMA_VERSION
  items: Position[]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Validate ONE persisted item against the {@link Position} schema (AC6.4). A
 * tampered/partial item fails here and is dropped; the rest survive.
 */
export function isValidPosition(v: unknown): v is Position {
  if (!isObject(v)) return false
  if (v.status !== 'filled') return false
  if (v.schemaVersion !== SCHEMA_VERSION) return false
  if (typeof v.id !== 'string' || v.id.length === 0) return false
  if (typeof v.marketId !== 'string' || v.marketId.length === 0) return false
  if (typeof v.question !== 'string' || v.question.length === 0) return false
  if (typeof v.outcome !== 'string' || v.outcome.length === 0) return false
  if (typeof v.txHash !== 'string' || v.txHash.length === 0) return false
  if (typeof v.createdAt !== 'string' || v.createdAt.length === 0) return false
  if (!isFiniteNumber(v.size) || v.size <= 0) return false
  if (!isFiniteNumber(v.price) || v.price <= 0) return false
  if (!isFiniteNumber(v.avgPrice)) return false
  if (!isFiniteNumber(v.shares)) return false
  if (!isFiniteNumber(v.cost)) return false
  return true
}

/** Result of reading + validating the stored payload. */
interface LoadOutcome {
  positions: Position[]
  /** `true` when the payload existed but was corrupt / had invalid item(s). */
  corrupt: boolean
}

/**
 * Read + validate the persisted payload. Missing key → clean first-run (not
 * corrupt). Unparseable/mis-shaped payload, or any dropped item → `corrupt=true`.
 */
export function loadPositions(): LoadOutcome {
  const raw = readItem(STORAGE_KEY)
  if (raw === null) return { positions: [], corrupt: false } // first run — nothing stored

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { positions: [], corrupt: true } // present but unparseable → recoverable notice
  }

  if (!isObject(parsed) || !Array.isArray(parsed.items)) {
    return { positions: [], corrupt: true }
  }

  const valid: Position[] = []
  for (const item of parsed.items) {
    if (isValidPosition(item)) valid.push(item)
  }
  // Dropped at least one item (or a wrong schemaVersion envelope) → corrupt notice,
  // but keep every valid position (no wipe-on-tamper).
  const corrupt = valid.length !== parsed.items.length || parsed.schemaVersion !== SCHEMA_VERSION
  return { positions: valid, corrupt }
}

function serialize(positions: Position[]): string {
  const envelope: PositionsEnvelope = { schemaVersion: SCHEMA_VERSION, items: positions }
  return JSON.stringify(envelope)
}

function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Context required to turn a filled receipt into a persisted Position. */
export interface RecordBetParams {
  marketId: string
  question: string
  outcome: string
  size: number
  price: number
  receipt: BetReceipt
}

export const useBetsStore = defineStore('bets', () => {
  const positions = ref<Position[]>([])
  /** Non-blocking "couldn't save locally" flag (AC6.1). Cleared on next OK write. */
  const saveError = ref(false)
  /** Distinct recoverable notice when stored data was corrupt/partial (AC6.4). */
  const corruptNotice = ref(false)

  const hasPositions = computed(() => positions.value.length > 0)
  /** First-run onboarding is empty AND not corrupt (empty-state anti-pattern, T13). */
  const isFirstRun = computed(() => positions.value.length === 0 && !corruptNotice.value)

  /** Read + validate from storage into memory (idempotent; used on init + cross-tab). */
  function load(): void {
    const { positions: loaded, corrupt } = loadPositions()
    positions.value = loaded
    corruptNotice.value = corrupt
  }

  /**
   * Commit a Position: write-first, then commit in-memory ONLY on a successful
   * persist. On quota/unavailable the position is NOT added and `saveError` is set
   * so the caller withholds the receipt (AC6.1). Returns whether it persisted.
   */
  function addPosition(position: Position): boolean {
    const next = [position, ...positions.value] // newest first
    const res = writeItem(STORAGE_KEY, serialize(next))
    if (!res.ok) {
      saveError.value = true
      logEvent(
        { event: 'bets.persist', service: 'betting', status: 'error', errorKind: res.reason },
        'warn',
      )
      return false
    }
    positions.value = next
    saveError.value = false
    return true
  }

  /** Build a Position from a filled receipt + context and persist it (AC5.1/6.1). */
  function recordFilledBet(params: RecordBetParams): boolean {
    const { marketId, question, outcome, size, price, receipt } = params
    const position: Position = {
      ...receipt,
      id: newId(),
      marketId,
      question,
      outcome,
      size,
      price,
      createdAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
    }
    return addPosition(position)
  }

  /** Dismiss the recoverable corrupt-storage notice once the user has seen it. */
  function dismissCorruptNotice(): void {
    corruptNotice.value = false
  }

  // --- Cross-tab reconciliation (AC6.5 / C12) --------------------------------

  function onStorage(e: StorageEvent): void {
    // Our key changed elsewhere, or storage was cleared (`key === null`).
    if (e.key !== null && e.key !== STORAGE_KEY) return
    load()
  }

  let listening = false
  function startCrossTabSync(): void {
    if (listening || typeof window === 'undefined') return
    window.addEventListener('storage', onStorage)
    listening = true
  }
  function stopCrossTabSync(): void {
    if (!listening || typeof window === 'undefined') return
    window.removeEventListener('storage', onStorage)
    listening = false
  }

  // Hydrate + wire cross-tab sync at store creation.
  load()
  startCrossTabSync()

  return {
    positions,
    saveError,
    corruptNotice,
    hasPositions,
    isFirstRun,
    load,
    addPosition,
    recordFilledBet,
    dismissCorruptNotice,
    startCrossTabSync,
    stopCrossTabSync,
  }
})
