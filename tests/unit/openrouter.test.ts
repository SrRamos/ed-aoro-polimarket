/**
 * OpenRouter parse-ladder + validation + discovery (T704 · AC7.4/7.5/7.6/7.9/7.10).
 * All traffic mocked with MSW — no live OpenRouter.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './msw/server'
import {
  pickFreeModel,
  predict,
  parseModelContent,
  validatePrediction,
  resetModelCache,
} from '../../src/services/openrouter.service'
import type { Market } from '../../src/models/market'

const OR = 'https://openrouter.ai/api/v1'
const KEY = 'sk-test-123'

function market(): Market {
  return {
    id: '1',
    question: 'Will it rain?',
    slug: 'will-it-rain',
    outcomes: ['Yes', 'No'],
    prices: [0.62, 0.38],
    tokenIds: ['a', 'b'],
    volume: 412_000,
    liquidity: 85_000,
    endDate: '2025-12-31T00:00:00Z',
    active: true,
    closed: false,
    pricingReliable: true,
  }
}

function modelsHandler(models: Array<{ id: string; supported_parameters?: string[] }>) {
  return http.get(`${OR}/models`, () => HttpResponse.json({ data: models }))
}

function chatContent(content: string, calls?: { n: number }) {
  return http.post(`${OR}/chat/completions`, () => {
    if (calls) calls.n += 1
    return HttpResponse.json({ choices: [{ message: { content } }] })
  })
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
beforeEach(() => resetModelCache())

describe('pickFreeModel (AC7.4)', () => {
  it('rejects when no key is present', async () => {
    const res = await pickFreeModel('')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('no-key')
  })

  it('picks the top preferred model available', async () => {
    server.use(
      modelsHandler([
        { id: 'openai/gpt-oss-20b:free' },
        { id: 'z-ai/glm-5.2:free', supported_parameters: ['structured_outputs'] },
      ]),
    )
    const res = await pickFreeModel(KEY)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.id).toBe('z-ai/glm-5.2:free')
      expect(res.value.supportsStructured).toBe(true)
    }
  })

  it('falls back to any free structured-output model, then openrouter/free', async () => {
    server.use(
      modelsHandler([{ id: 'someorg/model:free', supported_parameters: ['structured_outputs'] }]),
    )
    const a = await pickFreeModel(KEY)
    if (a.ok) expect(a.value.id).toBe('someorg/model:free')

    resetModelCache()
    server.use(modelsHandler([{ id: 'someorg/plain:free' }]))
    const b = await pickFreeModel(KEY)
    if (b.ok) expect(b.value.id).toBe('openrouter/free')
  })

  it('caches the pick per session (second call does not re-fetch)', async () => {
    let hits = 0
    server.use(
      http.get(`${OR}/models`, () => {
        hits += 1
        return HttpResponse.json({ data: [{ id: 'z-ai/glm-5.2:free' }] })
      }),
    )
    await pickFreeModel(KEY)
    await pickFreeModel(KEY)
    expect(hits).toBe(1)
  })
})

describe('parseModelContent (ladder rung 3)', () => {
  it('parses clean JSON directly', () => {
    expect(parseModelContent('{"a":1}')).toEqual({ a: 1 })
  })
  it('strips code fences', () => {
    expect(parseModelContent('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('extracts the first {…} block from surrounding prose', () => {
    expect(parseModelContent('Sure! {"a":1} hope that helps')).toEqual({ a: 1 })
  })
  it('returns null on unparseable content', () => {
    expect(parseModelContent('no json here')).toBeNull()
  })
})

describe('validatePrediction (AC7.6 / AC7.10)', () => {
  it('accepts a valid object, clamps confidence, caps rationale', () => {
    const long = 'x'.repeat(1000)
    const res = validatePrediction(
      { recommendedOutcome: 'Yes', confidence: 1.4, rationale: long },
      ['Yes', 'No'],
      'm',
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.confidence).toBe(1) // clamped
      expect(res.value.rationale.length).toBeLessThanOrEqual(600)
      expect(res.value.modelId).toBe('m')
    }
  })

  it('rejects an outcome not in the provided labels (never coerces)', () => {
    const res = validatePrediction(
      { recommendedOutcome: 'Maybe', confidence: 0.5, rationale: 'r' },
      ['Yes', 'No'],
      'm',
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('outcome-mismatch')
  })

  it('rejects a non-object / missing fields as parse-fail', () => {
    expect(validatePrediction(null, ['Yes'], 'm').ok).toBe(false)
    const r = validatePrediction({ recommendedOutcome: 'Yes', rationale: 'r' }, ['Yes'], 'm')
    if (!r.ok) expect(r.error.kind).toBe('parse-fail')
  })
})

describe('predict — end to end (ladder + validation)', () => {
  it('returns a validated prediction from a clean response', async () => {
    server.use(
      modelsHandler([{ id: 'z-ai/glm-5.2:free' }]),
      chatContent('{"recommendedOutcome":"Yes","confidence":0.68,"rationale":"71% vs 29%."}'),
    )
    const res = await predict(market(), KEY)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.recommendedOutcome).toBe('Yes')
      expect(res.value.confidence).toBeCloseTo(0.68)
      expect(res.value.modelId).toBe('z-ai/glm-5.2:free')
    }
  })

  it('retries once at temp 0 on a first-response outcome mismatch, then succeeds', async () => {
    const calls = { n: 0 }
    server.use(
      modelsHandler([{ id: 'z-ai/glm-5.2:free' }]),
      http.post(`${OR}/chat/completions`, () => {
        calls.n += 1
        const content =
          calls.n === 1
            ? '{"recommendedOutcome":"Maybe","confidence":0.5,"rationale":"bad"}'
            : '{"recommendedOutcome":"No","confidence":0.55,"rationale":"good"}'
        return HttpResponse.json({ choices: [{ message: { content } }] })
      }),
    )
    const res = await predict(market(), KEY)
    expect(calls.n).toBe(2)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.recommendedOutcome).toBe('No')
  })

  it('surfaces an invalid prediction after the single retry', async () => {
    const calls = { n: 0 }
    server.use(
      modelsHandler([{ id: 'z-ai/glm-5.2:free' }]),
      chatContent('{"recommendedOutcome":"Maybe","confidence":0.5,"rationale":"bad"}', calls),
    )
    const res = await predict(market(), KEY)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('outcome-mismatch')
    expect(calls.n).toBe(2) // one retry, no more
  })

  it('distinguishes a 429 rate-limit and does not auto-retry it (AC7.9)', async () => {
    let chatCalls = 0
    server.use(
      modelsHandler([{ id: 'z-ai/glm-5.2:free' }]),
      http.post(`${OR}/chat/completions`, () => {
        chatCalls += 1
        return new HttpResponse('{}', { status: 429, headers: { 'Retry-After': '12' } })
      }),
    )
    const res = await predict(market(), KEY)
    expect(res.ok).toBe(false)
    if (!res.ok && res.error.kind === 'http') {
      expect(res.error.status).toBe(429)
      expect(res.error.retryAfter).toBe(12)
    } else {
      throw new Error('expected http 429')
    }
    expect(chatCalls).toBe(1)
  })

  it('rejects when no key is present', async () => {
    const res = await predict(market(), '')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('no-key')
  })
})
