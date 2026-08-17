/**
 * Markets store (T301 · AC2.x / AC3.x / AC4.3 · plan §2 · PERF-12).
 *
 * Owns the browse list, the search-results state, and the selected market/outcome
 * that the detail + bet form operate against. State is modelled as
 * `RequestState<Market[]>` (T11) so impossible combinations are unrepresentable.
 *
 * PERF: market lists can be sizeable, so the states are held in `shallowRef` (no
 * deep reactive proxying of every card) and their payload arrays are `markRaw`ed.
 * PERF-12: `selectByIdOrSlug` REUSES a market already present in the search/browse
 * results instead of forcing a network refetch — a fetch only happens on a miss.
 *
 * Search *orchestration* (debounce/abort/offline) lives in `useMarketSearch`
 * (T401); the composable pushes its settled state here via `setSearchState` so the
 * store stays the single source of truth for selection reuse.
 */
import { defineStore } from 'pinia'
import { computed, markRaw, ref, shallowRef } from 'vue'
import type { Market } from '../models/market'
import type { AppError } from '../models/errors'
import { idle, loading, errorState, successState, type RequestState } from '../models/request-state'
import { getMarket, getMarkets } from '../services/polymarket.service'

/** Data of a `RequestState`, or an empty array when not in `success`. */
function dataOf<T>(state: RequestState<T[]>): T[] {
  return state.status === 'success' ? state.data : []
}

export const useMarketsStore = defineStore('markets', () => {
  const listState = shallowRef<RequestState<Market[]>>(idle())
  const searchState = shallowRef<RequestState<Market[]>>(idle())
  const selectedMarket = shallowRef<Market | null>(null)
  const selectedOutcomeIndex = ref<number | null>(null)
  /** State of a selection that had to be fetched (miss on the reuse path). */
  const selectState = shallowRef<RequestState<Market | null>>(idle())

  const browseMarkets = computed(() => dataOf(listState.value))
  const searchMarketsResults = computed(() => dataOf(searchState.value))

  /** The selected outcome label, or `null` when no outcome is chosen (AC4.3). */
  const selectedOutcome = computed<string | null>(() => {
    const m = selectedMarket.value
    const i = selectedOutcomeIndex.value
    if (m === null || i === null) return null
    return m.outcomes[i] ?? null
  })

  /** The selected outcome's snapshot price the bet form operates against (AC4.3). */
  const selectedPrice = computed<number | null>(() => {
    const m = selectedMarket.value
    const i = selectedOutcomeIndex.value
    if (m === null || i === null) return null
    return m.prices[i] ?? null
  })

  /** Load the default top-by-volume browse list (AC3.1). */
  async function loadMarkets(signal?: AbortSignal): Promise<void> {
    listState.value = loading()
    const res = await getMarkets({}, signal)
    if (res.ok) listState.value = successState(markRaw(res.value))
    else listState.value = errorState<Market[]>(res.error)
  }

  /** Push settled search state from `useMarketSearch` (T401) into the store. */
  function setSearchState(state: RequestState<Market[]>): void {
    searchState.value = state.status === 'success' ? successState(markRaw(state.data)) : state
  }

  /** Reset search back to idle (empty input → browse list, AC2.6). */
  function clearSearch(): void {
    searchState.value = idle()
  }

  /** Look for a market already loaded in search or browse results (PERF-12). */
  function findLoaded(idOrSlug: string): Market | null {
    for (const m of searchMarketsResults.value) {
      if (m.id === idOrSlug || m.slug === idOrSlug) return m
    }
    for (const m of browseMarkets.value) {
      if (m.id === idOrSlug || m.slug === idOrSlug) return m
    }
    return null
  }

  /** Directly select an already-loaded market (no fetch). Resets outcome. */
  function selectMarket(market: Market): void {
    selectedMarket.value = markRaw(market)
    selectedOutcomeIndex.value = null
    selectState.value = successState(market)
  }

  /**
   * Select by id or slug, REUSING a loaded market when present (PERF-12) and only
   * fetching `getMarket(slug)` on a miss. `selectState` tracks the fetch path.
   */
  async function selectByIdOrSlug(idOrSlug: string, signal?: AbortSignal): Promise<void> {
    const reused = findLoaded(idOrSlug)
    if (reused !== null) {
      selectMarket(reused)
      return
    }
    selectState.value = loading()
    const res = await getMarket(idOrSlug, signal)
    if (!res.ok) {
      selectState.value = errorState<Market | null>(res.error)
      return
    }
    const market = res.value
    if (market === null) {
      // Existed upstream but was malformed (excluded) — surface as parse error.
      const notFound: AppError = { kind: 'parse', message: 'market unavailable' }
      selectState.value = errorState<Market | null>(notFound)
      return
    }
    selectMarket(market)
  }

  /** Choose an outcome index on the selected market (AC4.3). */
  function selectOutcome(index: number): void {
    const m = selectedMarket.value
    if (m === null || index < 0 || index >= m.outcomes.length) return
    selectedOutcomeIndex.value = index
  }

  /** Clear the current selection (e.g. on detail close). */
  function clearSelection(): void {
    selectedMarket.value = null
    selectedOutcomeIndex.value = null
    selectState.value = idle()
  }

  return {
    listState,
    searchState,
    selectState,
    selectedMarket,
    selectedOutcomeIndex,
    browseMarkets,
    searchMarketsResults,
    selectedOutcome,
    selectedPrice,
    loadMarkets,
    setSearchState,
    clearSearch,
    selectMarket,
    selectByIdOrSlug,
    selectOutcome,
    clearSelection,
  }
})
