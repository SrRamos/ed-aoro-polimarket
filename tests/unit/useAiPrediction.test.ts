/**
 * On-demand AI prediction composable (T402 / T704 · AC7.2/AC7.3/AC7.9).
 * predict fn + key getter injected; no MSW / live Pinia.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Market } from '../../src/models/market'
import type { AiPrediction } from '../../src/models/prediction'
import { ok, err, type Result, type AppError } from '../../src/models/errors'
import { useAiPrediction } from '../../src/composables/useAiPrediction'

function market(): Market {
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
  }
}

function prediction(): AiPrediction {
  return { recommendedOutcome: 'Yes', confidence: 0.68, rationale: 'because', modelId: 'm' }
}

const okPred = (p: AiPrediction): Result<AiPrediction, AppError> => ok(p)

describe('no-key gating (AC7.2 / AC7.3)', () => {
  it('does NOT call the API without a key and surfaces a no-key state', async () => {
    const predict = vi.fn()
    const ai = useAiPrediction({ predict, getKey: () => '' })
    expect(ai.hasKey.value).toBe(false)
    expect(ai.canRun.value).toBe(false)

    await ai.run(market())
    expect(predict).not.toHaveBeenCalled()
    expect(ai.state.value.status).toBe('error')
    if (ai.state.value.status === 'error') expect(ai.state.value.error.kind).toBe('no-key')
  })
})

describe('success path (AC7.6)', () => {
  it('goes loading → success with the validated prediction', async () => {
    const predict = vi.fn().mockResolvedValue(okPred(prediction()))
    const ai = useAiPrediction({ predict, getKey: () => 'sk-key' })
    expect(ai.hasKey.value).toBe(true)

    const p = ai.run(market())
    expect(ai.state.value.status).toBe('loading')
    await p
    expect(predict).toHaveBeenCalledTimes(1)
    expect(ai.state.value.status).toBe('success')
    if (ai.state.value.status === 'success')
      expect(ai.state.value.data.recommendedOutcome).toBe('Yes')
  })

  it('is on-demand only — nothing fires until run() is called', () => {
    const predict = vi.fn()
    useAiPrediction({ predict, getKey: () => 'sk-key' })
    expect(predict).not.toHaveBeenCalled()
  })
})

describe('429 rate-limit vs hard failure (AC7.9)', () => {
  it('distinguishes a 429 (with retryAfter) and does NOT auto-retry', async () => {
    const predict = vi
      .fn()
      .mockResolvedValue(err<AppError>({ kind: 'http', status: 429, retryAfter: 12 }))
    const ai = useAiPrediction({ predict, getKey: () => 'sk-key' })
    await ai.run(market())
    expect(predict).toHaveBeenCalledTimes(1) // no auto-retry
    expect(ai.state.value.status).toBe('error')
    expect(ai.isRateLimited.value).toBe(true)
    expect(ai.retryAfterSeconds.value).toBe(12)
  })

  it('a hard failure is NOT flagged as rate-limited', async () => {
    const predict = vi.fn().mockResolvedValue(err<AppError>({ kind: 'parse-fail' }))
    const ai = useAiPrediction({ predict, getKey: () => 'sk-key' })
    await ai.run(market())
    expect(ai.state.value.status).toBe('error')
    expect(ai.isRateLimited.value).toBe(false)
    expect(ai.retryAfterSeconds.value).toBeNull()
  })

  it('an outcome-mismatch surfaces as an error (never a coerced result, AC7.10)', async () => {
    const predict = vi.fn().mockResolvedValue(err<AppError>({ kind: 'outcome-mismatch' }))
    const ai = useAiPrediction({ predict, getKey: () => 'sk-key' })
    await ai.run(market())
    expect(ai.state.value.status).toBe('error')
    if (ai.state.value.status === 'error')
      expect(ai.state.value.error.kind).toBe('outcome-mismatch')
  })
})

describe('supersede + reset', () => {
  it('a superseded run does not clobber the newer result', async () => {
    let resolveFirst: (r: Result<AiPrediction, AppError>) => void = () => {}
    const predict = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Result<AiPrediction, AppError>>((r) => (resolveFirst = r)),
      )
      .mockResolvedValueOnce(okPred({ ...prediction(), recommendedOutcome: 'No' }))
    const ai = useAiPrediction({ predict, getKey: () => 'sk-key' })

    const first = ai.run(market()) // in-flight
    await ai.run(market()) // supersedes → 'No'
    resolveFirst(okPred({ ...prediction(), recommendedOutcome: 'Yes' })) // stale
    await first

    expect(ai.state.value.status).toBe('success')
    if (ai.state.value.status === 'success')
      expect(ai.state.value.data.recommendedOutcome).toBe('No')
  })

  it('reset returns to idle', async () => {
    const predict = vi.fn().mockResolvedValue(okPred(prediction()))
    const ai = useAiPrediction({ predict, getKey: () => 'sk-key' })
    await ai.run(market())
    ai.reset()
    expect(ai.state.value.status).toBe('idle')
  })
})
