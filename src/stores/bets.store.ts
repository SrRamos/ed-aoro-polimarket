/**
 * Bets store (design.md §4, spec.md AC5.*, AC6.*). Owns the persisted positions
 * list and delegates order placement to the injected `BettingService` (mock by
 * default). Positions persist to localStorage and restore on load; a missing or
 * corrupt payload recovers to `[]` without crashing (AC6.1/AC6.4).
 *
 * A position is appended ONLY when `placeBet` resolves `status:'filled'`; a
 * rejection leaves the list untouched so the UI can retry (AC5.7).
 */
import { defineStore } from 'pinia'
import type { BetOrder, BetReceipt, Position } from '../models/bet'
import type { BettingService } from '../services/betting.service'
import { createBettingService } from '../services/betting.service'
import { getBuilderConfig } from '../config/builder.config'
import { useSettingsStore } from './settings.store'
import { readJson, writeJson } from './persist'

const POSITIONS_KEY = 'polymarket-widget:positions:v1'

/** Restore positions, tolerating a missing/corrupt/non-array payload (AC6.4). */
function loadPositions(): Position[] {
  const data = readJson<unknown>(POSITIONS_KEY, [])
  return Array.isArray(data) ? (data as Position[]) : []
}

function newId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// Single wiring point (NFR-SVC-3): the store depends on the interface, resolved
// once here. A settings builderCode override (if any) feeds the config.
let service: BettingService | null = null
function bettingService(): BettingService {
  if (!service) {
    const override = useSettingsStore().builderCodeOverride
    service = createBettingService(
      getBuilderConfig(override ? { builderCode: override } : undefined),
    )
  }
  return service
}

interface BetsState {
  positions: Position[]
  placeStatus: 'idle' | 'submitting' | 'error'
  placeError: string | null
  lastReceipt: BetReceipt | null
}

export const useBetsStore = defineStore('bets', {
  state: (): BetsState => ({
    positions: loadPositions(),
    placeStatus: 'idle',
    placeError: null,
    lastReceipt: null,
  }),

  actions: {
    /**
     * Place a bet via the BettingService. On a filled receipt, prepend the new
     * position and persist (AC5.1/AC5.6/AC6.1). On rejection, set an error and
     * leave positions unchanged (AC5.7). Returns the Position or throws.
     */
    async placeBet(order: BetOrder, meta: { marketQuestion: string }): Promise<Position> {
      this.placeStatus = 'submitting'
      this.placeError = null
      try {
        const receipt = await bettingService().placeBet(order)
        const position: Position = {
          id: newId(),
          marketId: order.marketId,
          marketQuestion: meta.marketQuestion,
          outcome: order.outcome,
          order,
          receipt,
          createdAt: new Date().toISOString(),
        }
        this.positions = [position, ...this.positions]
        this.lastReceipt = receipt
        this.placeStatus = 'idle'
        this.persist()
        return position
      } catch (err) {
        this.placeStatus = 'error'
        this.placeError = err instanceof Error ? err.message : 'The bet could not be placed.'
        throw err
      }
    },

    persist() {
      writeJson(POSITIONS_KEY, this.positions)
    },
  },
})
