/**
 * Debounced market search composable (T401 · AC2.2–AC2.6/AC2.8 · C17).
 * Services injected; fake timers drive the debounce. No MSW needed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { Market } from '../../src/models/market'
import { ok, err, type Result, type AppError } from '../../src/models/errors'
import { useMarketSearch } from '../../src/composables/useMarketSearch'

function market(overrides: Partial<Market> = {}): Market {
  return {
    id: '1',
    question: 'Will it rain?',
    slug: 'will-it-rain',
    outcomes: ['Yes', 'No'],
    prices: [0.62, 0.38],
    tokenIds: ['a', 'b'],
    volume: 1,
    liquidity: 1,
    endDate: '2025-12-31T00:00:00Z',
    active: true,
    closed: false,
    pricingReliable: true,
    ...overrides,
  }
}

const okList = (d: Market[]): Result<Market[], AppError> => ok(d)

let search: ReturnType<typeof vi.fn>
let browse: ReturnType<typeof vi.fn>

function make(debounceMs = 300) {
  return useMarketSearch({ search, browse, debounceMs })
}

async function type(s: ReturnType<typeof make>, value: string) {
  s.query.value = value
  await nextTick() // let the watcher schedule the debounce
}

beforeEach(() => {
  vi.useFakeTimers()
  search = vi.fn().mockResolvedValue(okList([market()]))
  browse = vi.fn().mockResolvedValue(okList([]))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('debounce (AC2.2)', () => {
  it('issues one request for the final settled value', async () => {
    const s = make()
    await type(s, 'a')
    await type(s, 'ab')
    await type(s, 'abc')
    expect(search).not.toHaveBeenCalled() // still within the debounce window
    await vi.advanceTimersByTimeAsync(300)
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0]?.[0]).toBe('abc')
    expect(s.state.value.status).toBe('success')
    expect(s.announcement.value).toContain('1 market')
  })

  it('empty input → idle (browse), never a search request (AC2.6)', async () => {
    const s = make()
    await type(s, 'abc')
    await type(s, '')
    await vi.advanceTimersByTimeAsync(300)
    expect(search).not.toHaveBeenCalled()
    expect(s.state.value.status).toBe('idle')
  })
})

describe('supersede / cancel (AC2.2)', () => {
  it('aborts the superseded in-flight request', async () => {
    let firstSignal: AbortSignal | undefined
    search.mockImplementation((q: string, signal?: AbortSignal) => {
      if (q === 'a') {
        firstSignal = signal
        return new Promise<Result<Market[], AppError>>(() => {}) // never resolves
      }
      return Promise.resolve(okList([market()]))
    })
    const s = make()
    await type(s, 'a')
    await vi.advanceTimersByTimeAsync(300)
    expect(s.state.value.status).toBe('loading')

    await type(s, 'ab')
    await vi.advanceTimersByTimeAsync(300)
    expect(firstSignal?.aborted).toBe(true)
    expect(search).toHaveBeenCalledTimes(2)
    expect(s.state.value.status).toBe('success')
  })
})

describe('no-results vs error (AC2.4 / AC2.5)', () => {
  it('zero matches → success with empty data + a no-results announcement (not error)', async () => {
    search.mockResolvedValue(okList([]))
    const s = make()
    await type(s, 'zzz')
    await vi.advanceTimersByTimeAsync(300)
    expect(s.state.value.status).toBe('success')
    if (s.state.value.status === 'success') expect(s.state.value.data).toEqual([])
    expect(s.announcement.value).toContain('No markets found')
    expect(s.announcement.value).toContain('zzz') // echoes the query
  })

  it('transport failure → error state with the error kind', async () => {
    search.mockResolvedValue(err<AppError>({ kind: 'timeout' }))
    const s = make()
    await type(s, 'boom')
    await vi.advanceTimersByTimeAsync(300)
    expect(s.state.value.status).toBe('error')
    if (s.state.value.status === 'error') expect(s.state.value.error.kind).toBe('timeout')
  })

  it('retry() re-runs the current query', async () => {
    search.mockResolvedValue(err<AppError>({ kind: 'network' }))
    const s = make()
    await type(s, 'again')
    await vi.advanceTimersByTimeAsync(300)
    expect(search).toHaveBeenCalledTimes(1)
    search.mockResolvedValue(okList([market()]))
    s.retry()
    await flushPromises()
    expect(search).toHaveBeenCalledTimes(2)
    expect(s.state.value.status).toBe('success')
  })
})

describe('offline suppression + auto-resume (AC2.8 / C17)', () => {
  it('suppresses the request while offline and shows a distinct offline state', async () => {
    const s = make()
    window.dispatchEvent(new Event('offline'))
    expect(s.isOffline.value).toBe(true)

    await type(s, 'abc')
    await vi.advanceTimersByTimeAsync(300)
    expect(search).not.toHaveBeenCalled() // no retry-storm
    expect(s.state.value.status).toBe('error')
    if (s.state.value.status === 'error') expect(s.state.value.error.kind).toBe('offline')
  })

  it('auto-resumes the pending query when connectivity returns', async () => {
    const s = make()
    window.dispatchEvent(new Event('offline'))
    await type(s, 'abc')
    await vi.advanceTimersByTimeAsync(300)
    expect(search).not.toHaveBeenCalled()

    search.mockResolvedValue(okList([market(), market({ id: '2' })]))
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    expect(s.isOffline.value).toBe(false)
    expect(search).toHaveBeenCalledWith('abc', expect.anything())
    expect(s.state.value.status).toBe('success')
    expect(s.announcement.value).toContain('2 markets')
  })
})
