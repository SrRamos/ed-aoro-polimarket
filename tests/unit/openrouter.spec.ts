import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  predictOutcome,
  recommendMarket,
  isAiConfigured,
  getAiConfig,
  sampleOutcome,
  sampleMarketPick,
  extractJson,
  validatePrediction,
  validateMarketPick,
  AiError,
} from '../../src/services/openrouter.service'
import type { Market } from '../../src/models/market'

const KEY = 'sk-or-test-key'
const MODEL = 'z-ai/glm-5.2:free'

/**
 * Configure AI via env (as a deployment would). A param left `undefined` leaves
 * that var unset (afterEach unstubs everything). NOTE: no default param values —
 * defaults would apply on an explicit `undefined` and wrongly stub the var.
 * Stub each var at most once per test; split scenarios into separate tests.
 */
function configureAi(key?: string, model?: string) {
  if (key !== undefined) vi.stubEnv('VITE_OPENROUTER_API_KEY', key)
  if (model !== undefined) vi.stubEnv('VITE_OPENROUTER_MODEL', model)
}

function market(overrides: Partial<Market> = {}): Market {
  return {
    id: 'm1',
    question: 'Will it rain?',
    slug: 'rain',
    category: 'Markets',
    outcomes: ['Yes', 'No'],
    prices: [0.6, 0.4],
    tokenIds: ['a', 'b'],
    volume: 1000,
    liquidity: 500,
    endDate: null,
    image: null,
    active: true,
    closed: false,
    pricingUnreliable: false,
    ...overrides,
  }
}

/* ---- fetch mock: serves /chat/completions responses in order ---- */

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function chatContent(obj: unknown): unknown {
  const content = typeof obj === 'string' ? obj : JSON.stringify(obj)
  return { choices: [{ message: { content } }] }
}

function mockChats(chats: unknown[]) {
  let chatIdx = 0
  const fn = vi.fn(async () => {
    const body = chats[chatIdx++] ?? { choices: [] }
    return jsonResponse(body)
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/* ------------------------------- config ---------------------------------- */

describe('env config (isAiConfigured / getAiConfig)', () => {
  it('isAiConfigured is true when key AND model are set', () => {
    configureAi(KEY, MODEL)
    expect(isAiConfigured()).toBe(true)
  })
  it('isAiConfigured is false when the key is missing', () => {
    configureAi(undefined, MODEL)
    expect(isAiConfigured()).toBe(false)
  })
  it('isAiConfigured is false when the model is missing', () => {
    configureAi(KEY, undefined)
    expect(isAiConfigured()).toBe(false)
  })

  it('getAiConfig returns null when no key is set', () => {
    configureAi(undefined, undefined)
    expect(getAiConfig()).toBeNull()
  })
  it('getAiConfig falls back to a default model when the model is blank', () => {
    configureAi(KEY, undefined)
    expect(getAiConfig()).toEqual({ apiKey: KEY, model: expect.any(String) })
    expect(getAiConfig()?.model).toBeTruthy()
  })
  it('getAiConfig returns the exact env config when both are set', () => {
    configureAi(KEY, MODEL)
    expect(getAiConfig()).toEqual({ apiKey: KEY, model: MODEL })
  })
})

/* ------------------------------- pure helpers ---------------------------- */

describe('extractJson (AC7.5 fence-strip / first-brace)', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('strips ```json code fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('extracts the first {…} block from surrounding prose', () => {
    expect(extractJson('Sure! Here you go: {"a":1} — hope that helps')).toEqual({ a: 1 })
  })
  it('returns null on unparseable content', () => {
    expect(extractJson('no json here')).toBeNull()
  })
})

describe('validatePrediction (AC7.6, AC7.10)', () => {
  const outcomes = ['Yes', 'No']
  it('accepts a verbatim outcome and clamps confidence to [0,1]', () => {
    expect(
      validatePrediction({ recommendedOutcome: 'Yes', confidence: 1.5, rationale: 'x' }, outcomes),
    ).toEqual({ recommendedOutcome: 'Yes', confidence: 1, rationale: 'x' })
    expect(
      validatePrediction({ recommendedOutcome: 'No', confidence: -0.2, rationale: 'x' }, outcomes),
    ).toEqual({ recommendedOutcome: 'No', confidence: 0, rationale: 'x' })
  })
  it('rejects an outcome not in the list (AC7.10)', () => {
    expect(
      validatePrediction(
        { recommendedOutcome: 'Maybe', confidence: 0.5, rationale: 'x' },
        outcomes,
      ),
    ).toBeNull()
  })
  it('rejects a non-numeric confidence', () => {
    expect(
      validatePrediction(
        { recommendedOutcome: 'Yes', confidence: 'high', rationale: 'x' },
        outcomes,
      ),
    ).toBeNull()
  })
  it('caps the rationale length', () => {
    const long = 'a'.repeat(2000)
    const r = validatePrediction(
      { recommendedOutcome: 'Yes', confidence: 0.5, rationale: long },
      outcomes,
    )
    expect(r!.rationale.length).toBeLessThanOrEqual(600)
  })
})

describe('validateMarketPick (AC9.3)', () => {
  const ids = ['m1', 'm2']
  it('accepts an id in the presented set and clamps confidence', () => {
    expect(
      validateMarketPick({ recommendedMarketId: 'm2', confidence: 2, rationale: 'x' }, ids),
    ).toEqual({ recommendedMarketId: 'm2', confidence: 1, rationale: 'x' })
  })
  it('rejects an id not presented to the model', () => {
    expect(
      validateMarketPick({ recommendedMarketId: 'zzz', confidence: 0.5, rationale: 'x' }, ids),
    ).toBeNull()
  })
})

/* ------------------------------- sample mode ----------------------------- */

describe('sample helpers (network-free fallback)', () => {
  it('sampleOutcome recommends the highest-priced outcome, never a network call', () => {
    const fetchFn = mockChats([])
    const s = sampleOutcome(market({ outcomes: ['Yes', 'No'], prices: [0.6, 0.4] }))
    expect(s.recommendedOutcome).toBe('Yes')
    expect(s.confidence).toBeCloseTo(0.6, 6)
    expect(s.rationale.length).toBeGreaterThan(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('sampleMarketPick recommends the highest-volume market, never a network call', () => {
    const fetchFn = mockChats([])
    const pick = sampleMarketPick([
      market({ id: 'm1', volume: 100 }),
      market({ id: 'm2', volume: 900 }),
    ])
    expect(pick.recommendedMarketId).toBe('m2')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

/* --------------------------- ladder integration -------------------------- */

describe('predictOutcome ladder (AC7.5, AC7.9, AC7.10)', () => {
  it('throws AiError when AI is not env-configured (never hits the network)', async () => {
    configureAi(undefined, undefined)
    const fetchFn = mockChats([])
    await expect(predictOutcome(market())).rejects.toBeInstanceOf(AiError)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns a validated prediction on the first structured attempt', async () => {
    configureAi(KEY, MODEL)
    const fetchFn = mockChats([
      chatContent({ recommendedOutcome: 'No', confidence: 0.72, rationale: 'thin edge' }),
    ])
    const result = await predictOutcome(market())
    expect(result).toEqual({ recommendedOutcome: 'No', confidence: 0.72, rationale: 'thin edge' })
    // No /models discovery anymore — one chat call.
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retries once at temp 0 after an invalid first response, then succeeds', async () => {
    configureAi(KEY, MODEL)
    const fetchFn = mockChats([
      chatContent({ recommendedOutcome: 'Maybe', confidence: 0.9, rationale: 'invalid' }),
      chatContent({ recommendedOutcome: 'Yes', confidence: 0.55, rationale: 'ok' }),
    ])
    const result = await predictOutcome(market())
    expect(result.recommendedOutcome).toBe('Yes')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('handles fence-wrapped content on the retry', async () => {
    configureAi(KEY, MODEL)
    mockChats([
      chatContent('not json at all'),
      chatContent('```json\n{"recommendedOutcome":"Yes","confidence":0.6,"rationale":"r"}\n```'),
    ])
    const result = await predictOutcome(market())
    expect(result.recommendedOutcome).toBe('Yes')
    expect(result.confidence).toBe(0.6)
  })

  it('rejects with AiError when both attempts fail validation (AC7.9/AC7.10)', async () => {
    configureAi(KEY, MODEL)
    mockChats([
      chatContent({ recommendedOutcome: 'Maybe', confidence: 0.9, rationale: 'x' }),
      chatContent({ recommendedOutcome: 'Nope', confidence: 0.9, rationale: 'x' }),
    ])
    await expect(predictOutcome(market())).rejects.toBeInstanceOf(AiError)
  })

  it('surfaces a rate-limit (429) as a clean AiError, no partial result (AC7.9)', async () => {
    configureAi(KEY, MODEL)
    let idx = 0
    globalThis.fetch = vi.fn(async () => {
      idx++
      return jsonResponse({ error: 'rate limited' }, 429)
    }) as unknown as typeof fetch
    await expect(predictOutcome(market())).rejects.toBeInstanceOf(AiError)
    expect(idx).toBe(1)
  })
})

describe('recommendMarket ladder (AC9.3, AC9.6)', () => {
  const markets = [market({ id: 'm1' }), market({ id: 'm2', question: 'Other?' })]

  it('returns a validated pick whose id is one of the presented markets', async () => {
    configureAi(KEY, MODEL)
    mockChats([chatContent({ recommendedMarketId: 'm2', confidence: 0.8, rationale: 'deeper' })])
    const pick = await recommendMarket(markets)
    expect(pick.recommendedMarketId).toBe('m2')
    expect(pick.confidence).toBe(0.8)
  })

  it('rejects when the recommended id is never one of the presented markets (AC9.6)', async () => {
    configureAi(KEY, MODEL)
    mockChats([
      chatContent({ recommendedMarketId: 'ghost', confidence: 0.8, rationale: 'x' }),
      chatContent({ recommendedMarketId: 'ghost', confidence: 0.8, rationale: 'x' }),
    ])
    await expect(recommendMarket(markets)).rejects.toBeInstanceOf(AiError)
  })
})
