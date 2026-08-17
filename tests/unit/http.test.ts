/**
 * http.ts AppError mapping + retry discipline (T102 · AC2.5/2.8/7.9 · C4/C17).
 * Uses injected fetch/online/sleep for deterministic transport simulation — no
 * live network, no real timers.
 */
import { describe, it, expect, vi } from 'vitest'
import { httpRequestJson, type HttpRequestOptions } from '../../src/services/http'

const nap = () => Promise.resolve()

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

const base: HttpRequestOptions = { sleep: nap, isOnline: () => true }

describe('offline short-circuit (AC2.8 / C17)', () => {
  it('returns a distinct offline error and never calls fetch', async () => {
    const fetchImpl = vi.fn()
    const res = await httpRequestJson('https://x/api', {
      ...base,
      isOnline: () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('offline')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('network failure', () => {
  it('maps a fetch rejection to a network error and retries once', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const res = await httpRequestJson('https://x/api', {
      ...base,
      retries: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('network')
    expect(fetchImpl).toHaveBeenCalledTimes(2) // initial + 1 retry
  })
})

describe('timeout', () => {
  it('aborts after timeoutMs and maps to a timeout error', async () => {
    const fetchImpl = (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })
    const res = await httpRequestJson('https://x/api', {
      ...base,
      retries: 0,
      timeoutMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('timeout')
  })
})

describe('HTTP status mapping', () => {
  it('does NOT retry a 429 and captures Retry-After (AC7.9)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '30' } }))
    const res = await httpRequestJson('https://x/api', {
      ...base,
      retries: 3,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok && res.error.kind === 'http') {
      expect(res.error.status).toBe(429)
      expect(res.error.retryAfter).toBe(30)
    } else {
      throw new Error('expected http 429')
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1) // never auto-retried
  })

  it('does NOT retry a 4xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    const res = await httpRequestJson('https://x/api', {
      ...base,
      retries: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    if (!res.ok && res.error.kind === 'http') expect(res.error.status).toBe(404)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries a 5xx then surfaces it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }))
    const res = await httpRequestJson('https://x/api', {
      ...base,
      retries: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    if (!res.ok && res.error.kind === 'http') expect(res.error.status).toBe(500)
    expect(fetchImpl).toHaveBeenCalledTimes(2) // initial + 1 retry
  })
})

describe('success + parse', () => {
  it('returns the parsed JSON body on 2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }))
    const res = await httpRequestJson('https://x/api', {
      ...base,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toEqual({ hello: 'world' })
  })

  it('maps an unparseable 2xx body to a parse error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<<not json>>', { status: 200 }))
    const res = await httpRequestJson('https://x/api', {
      ...base,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('parse')
  })
})

describe('baseUrl joining', () => {
  it('joins base + relative path without double slashes', async () => {
    let seen = ''
    const fetchImpl = vi.fn((url: string) => {
      seen = url
      return Promise.resolve(jsonResponse({}))
    })
    await httpRequestJson('/markets?x=1', {
      ...base,
      baseUrl: 'https://gamma-api.polymarket.com/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(seen).toBe('https://gamma-api.polymarket.com/markets?x=1')
  })
})
