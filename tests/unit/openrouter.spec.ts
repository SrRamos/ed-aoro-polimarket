import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  predictOutcome,
  recommendMarket,
  pickFreeModel,
  extractJson,
  validatePrediction,
  validateMarketPick,
  AiError,
} from '../../src/services/openrouter.service'
import type { Market } from '../../src/models/market'

const KEY = 'sk-or-test-key'

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

/* ---- fetch mock: routes /models vs /chat/completions, chats served in order ---- */

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

const MODELS_STRUCTURED = {
  data: [{ id: 'z-ai/glm-5.2:free', supported_parameters: ['structured_outputs'] }],
}
const MODELS_NO_STRUCTURED = {
  data: [{ id: 'z-ai/glm-5.2:free', supported_parameters: [] }],
}

function mockFetch(opts: { models?: unknown; chats: unknown[] }) {
  let chatIdx = 0
  const fn = vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u.includes('/models')) return jsonResponse(opts.models ?? MODELS_STRUCTURED)
    const body = opts.chats[chatIdx++] ?? { choices: [] }
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

/* --------------------------- ladder integration -------------------------- */

describe('pickFreeModel (AC7.4)', () => {
  it('prefers the top of the preference chain when present', async () => {
    mockFetch({ chats: [] })
    await expect(pickFreeModel(KEY)).resolves.toBe('z-ai/glm-5.2:free')
  })
  it('falls back to openrouter/free when no free models are advertised', async () => {
    mockFetch({ models: { data: [] }, chats: [] })
    await expect(pickFreeModel(KEY)).resolves.toBe('openrouter/free')
  })
})

describe('predictOutcome ladder (AC7.5, AC7.9, AC7.10)', () => {
  it('returns a validated prediction on the first structured attempt', async () => {
    const fetchFn = mockFetch({
      models: MODELS_STRUCTURED,
      chats: [chatContent({ recommendedOutcome: 'No', confidence: 0.72, rationale: 'thin edge' })],
    })
    const result = await predictOutcome(market(), KEY)
    expect(result).toEqual({ recommendedOutcome: 'No', confidence: 0.72, rationale: 'thin edge' })
    // 1 models call + 1 chat call
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('retries once at temp 0 after an invalid first response, then succeeds', async () => {
    const fetchFn = mockFetch({
      models: MODELS_STRUCTURED,
      chats: [
        chatContent({ recommendedOutcome: 'Maybe', confidence: 0.9, rationale: 'invalid' }),
        chatContent({ recommendedOutcome: 'Yes', confidence: 0.55, rationale: 'ok' }),
      ],
    })
    const result = await predictOutcome(market(), KEY)
    expect(result.recommendedOutcome).toBe('Yes')
    // 1 models + 2 chats (retry)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('handles fence-wrapped content (json_object model)', async () => {
    mockFetch({
      models: MODELS_NO_STRUCTURED,
      chats: [
        chatContent('```json\n{"recommendedOutcome":"Yes","confidence":0.6,"rationale":"r"}\n```'),
      ],
    })
    const result = await predictOutcome(market(), KEY)
    expect(result.recommendedOutcome).toBe('Yes')
    expect(result.confidence).toBe(0.6)
  })

  it('rejects with AiError when both attempts fail validation (AC7.9/AC7.10)', async () => {
    mockFetch({
      models: MODELS_STRUCTURED,
      chats: [
        chatContent({ recommendedOutcome: 'Maybe', confidence: 0.9, rationale: 'x' }),
        chatContent({ recommendedOutcome: 'Nope', confidence: 0.9, rationale: 'x' }),
      ],
    })
    await expect(predictOutcome(market(), KEY)).rejects.toBeInstanceOf(AiError)
  })

  it('surfaces a rate-limit (429) as a clean AiError, no partial result (AC7.9)', async () => {
    let idx = 0
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('/models')) return jsonResponse(MODELS_STRUCTURED)
      idx++
      return jsonResponse({ error: 'rate limited' }, 429)
    }) as unknown as typeof fetch
    await expect(predictOutcome(market(), KEY)).rejects.toBeInstanceOf(AiError)
    expect(idx).toBe(1)
  })
})

describe('recommendMarket ladder (AC9.3, AC9.6)', () => {
  const markets = [market({ id: 'm1' }), market({ id: 'm2', question: 'Other?' })]

  it('returns a validated pick whose id is one of the presented markets', async () => {
    mockFetch({
      models: MODELS_STRUCTURED,
      chats: [chatContent({ recommendedMarketId: 'm2', confidence: 0.8, rationale: 'deeper' })],
    })
    const pick = await recommendMarket(markets, KEY)
    expect(pick.recommendedMarketId).toBe('m2')
    expect(pick.confidence).toBe(0.8)
  })

  it('rejects when the recommended id is never one of the presented markets (AC9.6)', async () => {
    mockFetch({
      models: MODELS_STRUCTURED,
      chats: [
        chatContent({ recommendedMarketId: 'ghost', confidence: 0.8, rationale: 'x' }),
        chatContent({ recommendedMarketId: 'ghost', confidence: 0.8, rationale: 'x' }),
      ],
    })
    await expect(recommendMarket(markets, KEY)).rejects.toBeInstanceOf(AiError)
  })
})
