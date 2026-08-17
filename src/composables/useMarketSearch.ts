/**
 * Debounced market search (T401 · AC2.2–AC2.6/AC2.8 · T11/T17/C17 · plan §2/§4).
 *
 * Orchestrates the search UX around `polymarket.searchMarkets`:
 *   - ~300ms debounce, ≤1 in-flight request: a superseded query aborts the prior
 *     `AbortController` so only the final settled value hits the network (AC2.2).
 *   - Discriminated `RequestState<Market[]>` states: idle (empty input → browse
 *     list), loading, success (result / no-results echo), error (AC2.3–AC2.5).
 *   - Result-count announcement on settle for a polite live region (AC2.3).
 *   - No-results recovery: the empty state echoes + preserves the query and the
 *     composable exposes a top-by-volume `browseState` fallback (AC2.4).
 *   - Offline (C17/AC2.8): `navigator.onLine` + `window` online/offline listeners.
 *     While offline it surfaces a DISTINCT `offline` state (not a generic network
 *     error), suppresses the request (no retry-storm), and auto-resumes the
 *     pending query when connectivity returns.
 *
 * The service deps are injectable so unit tests never need MSW.
 */
import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { Market } from '../models/market'
import type { AppError, Result } from '../models/errors'
import { errorState, idle, loading, successState, type RequestState } from '../models/request-state'

type SearchFn = (query: string, signal?: AbortSignal) => Promise<Result<Market[], AppError>>
type BrowseFn = (signal?: AbortSignal) => Promise<Result<Market[], AppError>>

export interface UseMarketSearchOptions {
  /** Injected search (defaults to `polymarket.searchMarkets`). */
  search?: SearchFn
  /** Injected browse/top-by-volume fallback (defaults to `polymarket.getMarkets`). */
  browse?: BrowseFn
  /** Debounce window in ms (default 300, AC2.2). */
  debounceMs?: number
}

export interface UseMarketSearch {
  /** Bound to the search input (`v-model`). */
  query: Ref<string>
  /** Discriminated search state (idle when the input is empty → browse). */
  state: Ref<RequestState<Market[]>>
  /** Top-by-volume fallback list for the no-results recovery path (AC2.4). */
  browseState: Ref<RequestState<Market[]>>
  /** `true` while the device is offline (drives the distinct offline UI, AC2.8). */
  isOffline: Ref<boolean>
  /** Polite live-region text announced on settle (loading / count, AC2.3). */
  announcement: Ref<string>
  /** Clear the query → back to the browse list (AC2.6). */
  clear: () => void
  /** Manually re-run the current query (retry affordance, AC2.5). */
  retry: () => void
  /** Load the browse fallback list (also called once on creation). */
  loadBrowse: () => Promise<void>
  /** Remove listeners + abort in-flight (auto-called on scope dispose). */
  dispose: () => void
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/** Was this the swallowed abort of a superseded request (never surfaced)? */
function isAbortError(error: AppError): boolean {
  return error.kind === 'network' && error.message === 'aborted'
}

function countMessage(n: number, query: string): string {
  if (n === 0) return `No markets found for “${query}”.`
  if (n === 1) return '1 market found.'
  return `${n} markets found.`
}

export function useMarketSearch(options: UseMarketSearchOptions = {}): UseMarketSearch {
  const debounceMs = options.debounceMs ?? 300

  // Lazily import the real services only when a dep is not injected, so tests that
  // inject both never pull in the network layer.
  const search: SearchFn =
    options.search ??
    ((q, signal) =>
      import('../services/polymarket.service').then((m) => m.searchMarkets(q, signal)))
  const browse: BrowseFn =
    options.browse ??
    ((signal) => import('../services/polymarket.service').then((m) => m.getMarkets({}, signal)))

  const query = ref('')
  const state = ref<RequestState<Market[]>>(idle())
  const browseState = ref<RequestState<Market[]>>(idle())
  const isOffline = ref(!isOnline())
  const announcement = ref('')

  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null
  /** The last non-empty query the user wants — resumed when connectivity returns. */
  let pendingQuery = ''

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function abortInFlight(): void {
    if (controller !== null) {
      controller.abort()
      controller = null
    }
  }

  function toOfflineState(): void {
    abortInFlight()
    state.value = errorState<Market[]>({ kind: 'offline' })
    announcement.value = 'You are offline. Search paused until the connection returns.'
  }

  async function fire(q: string): Promise<void> {
    if (isOffline.value) {
      pendingQuery = q
      toOfflineState()
      return
    }
    abortInFlight()
    const local = new AbortController()
    controller = local
    state.value = loading()
    announcement.value = 'Searching…'

    const res = await search(q, local.signal)
    if (local.signal.aborted) return // superseded — swallow (AC2.2)
    controller = null
    pendingQuery = ''

    if (res.ok) {
      state.value = successState(res.value)
      announcement.value = countMessage(res.value.length, q)
      return
    }
    if (isAbortError(res.error)) return // defensive: aborted mid-flight
    state.value = errorState<Market[]>(res.error)
    announcement.value =
      res.error.kind === 'offline'
        ? 'You are offline. Search paused until the connection returns.'
        : 'Search failed. Retry when ready.'
  }

  function schedule(raw: string): void {
    clearTimer()
    const q = raw.trim()
    if (q === '') {
      // Empty input → browse list, not an empty-results message (AC2.6).
      abortInFlight()
      pendingQuery = ''
      state.value = idle()
      announcement.value = ''
      return
    }
    timer = setTimeout(() => {
      timer = null
      void fire(q)
    }, debounceMs)
  }

  watch(query, (q) => schedule(q))

  async function loadBrowse(signal?: AbortSignal): Promise<void> {
    browseState.value = loading()
    const res = await browse(signal)
    if (res.ok) browseState.value = successState(res.value)
    else browseState.value = errorState<Market[]>(res.error)
  }

  function clear(): void {
    query.value = ''
    // watch fires synchronously-enough, but force the reset in case value was already ''.
    schedule('')
  }

  function retry(): void {
    const q = query.value.trim()
    if (q !== '') void fire(q)
  }

  // --- Offline listeners (C17 / AC2.8) ---------------------------------------

  function onOffline(): void {
    isOffline.value = true
    clearTimer()
    const q = query.value.trim()
    if (q !== '') {
      pendingQuery = q
      toOfflineState()
    }
  }

  function onOnline(): void {
    isOffline.value = false
    if (pendingQuery !== '') void fire(pendingQuery)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
  }

  function dispose(): void {
    clearTimer()
    abortInFlight()
    if (typeof window !== 'undefined') {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  // Seed the browse fallback once.
  void loadBrowse()

  return {
    query,
    state,
    browseState,
    isOffline,
    announcement,
    clear,
    retry,
    loadBrowse,
    dispose,
  }
}
