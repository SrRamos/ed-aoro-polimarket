/**
 * Markets store (design.md §4). Owns browse + search state and is the single
 * source of market data for the UI. All fetches go through
 * `polymarket.service.ts`; on any service failure (network / CORS / geoblock /
 * 5xx) it degrades gracefully to the bundled fixtures and flags
 * `usingFallback` so the UI can show a discreet "sample data" notice — it never
 * throws or breaks (AC2.5/AC3.4 handled as graceful degradation).
 *
 * Search is debounced (~300ms) and supersedes in-flight requests via
 * AbortController (AC2.2).
 */
import { defineStore } from 'pinia'
import type { Market } from '../models/market'
import type { ViewStatus } from '../lib/status'
import { getMarkets, searchMarkets } from '../services/polymarket.service'
import { DEFAULT_MARKETS, MARKETS } from '../fixtures/markets'

const SEARCH_DEBOUNCE_MS = 300

// Non-reactive request coordination (kept out of the reactive state).
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined
let searchAbort: AbortController | undefined
let browseAbort: AbortController | undefined

interface MarketsState {
  query: string
  list: Market[]
  searchResults: Market[]
  selected: Market | null
  browseStatus: ViewStatus
  searchStatus: ViewStatus
  browseError: string | null
  searchError: string | null
  usingFallback: boolean
}

/** Client-side filter used when degrading search to fixtures. */
function filterFixtures(term: string): Market[] {
  const q = term.trim().toLowerCase()
  if (!q) return DEFAULT_MARKETS
  return MARKETS.filter(
    (m) =>
      m.question.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.outcomes.some((o) => o.toLowerCase().includes(q)),
  )
}

export const useMarketsStore = defineStore('markets', {
  state: (): MarketsState => ({
    query: '',
    list: [],
    searchResults: [],
    selected: null,
    browseStatus: 'idle',
    searchStatus: 'idle',
    browseError: null,
    searchError: null,
    usingFallback: false,
  }),

  getters: {
    /** Active view: search results while a query is present, else the browse list. */
    displayedMarkets(state): Market[] {
      return state.query.trim() ? state.searchResults : state.list
    },
    /** Status that drives the list widget's 4-state model. */
    listStatus(state): ViewStatus {
      return state.query.trim() ? state.searchStatus : state.browseStatus
    },
  },

  actions: {
    /** Browse: fetch active, non-closed markets by volume desc (AC3.1). */
    async loadDefaultList() {
      browseAbort?.abort()
      browseAbort = new AbortController()
      const signal = browseAbort.signal

      this.browseStatus = 'loading'
      this.browseError = null
      try {
        const markets = await getMarkets({}, { signal })
        if (signal.aborted) return
        this.list = markets
        this.usingFallback = false
        this.browseStatus = markets.length ? 'success' : 'empty'
      } catch (err) {
        if (signal.aborted) return
        // Graceful degradation — never break the demo.
        if (import.meta.env.DEV) console.error('[markets] browse failed, using fixtures', err)
        this.list = DEFAULT_MARKETS
        this.usingFallback = true
        this.browseStatus = DEFAULT_MARKETS.length ? 'success' : 'empty'
      }
    },

    /** Debounced search entry point (AC2.1/AC2.2). Empty query clears to browse (AC2.6). */
    search(query: string) {
      this.query = query
      const term = query.trim()

      if (searchDebounceTimer) clearTimeout(searchDebounceTimer)

      if (!term) {
        searchAbort?.abort()
        this.searchResults = []
        this.searchStatus = 'idle'
        this.searchError = null
        return
      }

      searchDebounceTimer = setTimeout(() => {
        void this.runSearch(term)
      }, SEARCH_DEBOUNCE_MS)
    },

    /** Executes one search, superseding any in-flight request (AC2.2). */
    async runSearch(term: string) {
      searchAbort?.abort()
      searchAbort = new AbortController()
      const signal = searchAbort.signal

      this.searchStatus = 'loading'
      this.searchError = null
      try {
        const results = await searchMarkets(term, { signal })
        if (signal.aborted) return
        this.searchResults = results
        this.usingFallback = false
        this.searchStatus = results.length ? 'success' : 'empty'
      } catch (err) {
        if (signal.aborted) return
        if (import.meta.env.DEV) console.error('[markets] search failed, using fixtures', err)
        const fallback = filterFixtures(term)
        this.searchResults = fallback
        this.usingFallback = true
        this.searchStatus = fallback.length ? 'success' : 'empty'
      }
    },

    /** Re-run whichever view is active (retry affordance). */
    retry() {
      if (this.query.trim()) void this.runSearch(this.query.trim())
      else void this.loadDefaultList()
    },

    selectMarket(market: Market | null) {
      this.selected = market
    },
  },
})
