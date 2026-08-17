/**
 * On-demand AI prediction (T402 · AC7.3/AC7.7/AC7.9 · T11 · plan §2).
 *
 * Wraps `openrouter.predict` for the market-detail "AI suggestion" action:
 *   - ON-DEMAND ONLY: nothing fires until `run(market)` is called explicitly, so
 *     the free tier's 20 req/min cap is respected (AC7.3). No auto-call on open.
 *   - REQUIRES A KEY: with no key `run` does NOT call the API — it surfaces a
 *     `no-key` state so the UI shows a visible-but-disabled affordance + a CTA to
 *     Settings (AC7.2/AC7.9).
 *   - Discriminated `RequestState<AiPrediction>` (idle/loading/error/success, T11).
 *   - 429 DISTINCTION: a rate-limit is surfaced by the service as
 *     `{kind:'http', status:429, retryAfter}` (NOT a synthetic kind). This
 *     composable exposes `isRateLimited` + `retryAfterSeconds` so the UI shows
 *     "try again shortly" and NEVER auto-retries (AC7.9).
 *
 * The predict fn + key getter are injectable so tests need no MSW / live Pinia.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { Market } from '../models/market'
import type { AiPrediction } from '../models/prediction'
import type { AppError, Result } from '../models/errors'
import { errorState, idle, loading, successState, type RequestState } from '../models/request-state'
import { useSettingsStore } from '../stores/settings.store'

type PredictFn = (market: Market, apiKey: string) => Promise<Result<AiPrediction, AppError>>

export interface UseAiPredictionOptions {
  /** Injected predict (defaults to `openrouter.predict`). */
  predict?: PredictFn
  /** Reads the current OpenRouter key (defaults to the settings store). */
  getKey?: () => string
}

export interface UseAiPrediction {
  /** Discriminated prediction state (idle until `run`). */
  state: Ref<RequestState<AiPrediction>>
  /** Whether a key is configured — gates the (visible-but-disabled) action. */
  hasKey: ComputedRef<boolean>
  /** Safe to trigger a run right now (has key, not already loading). */
  canRun: ComputedRef<boolean>
  /** `true` when the current error is a 429 rate-limit (distinct from hard fail). */
  isRateLimited: ComputedRef<boolean>
  /** `Retry-After` seconds on a 429, when the server supplied one. */
  retryAfterSeconds: ComputedRef<number | null>
  /** Trigger exactly one prediction for `market` (on-demand, AC7.3). */
  run: (market: Market) => Promise<void>
  /** Re-run for `market` after a failure (manual only, never auto — AC7.9). */
  retry: (market: Market) => Promise<void>
  /** Reset back to idle (e.g. on detail close / market change). */
  reset: () => void
}

export function useAiPrediction(options: UseAiPredictionOptions = {}): UseAiPrediction {
  const predict: PredictFn =
    options.predict ??
    ((market, apiKey) =>
      import('../services/openrouter.service').then((m) => m.predict(market, apiKey)))
  // Default reads the live key from the settings store (requires active Pinia,
  // which components have). Tests inject their own getter so no store is needed.
  const getKey: () => string = options.getKey ?? (() => useSettingsStore().openrouterKey)

  const state = ref<RequestState<AiPrediction>>(idle())
  /** Monotonic token so a superseded run cannot clobber a newer one. */
  let runId = 0

  const hasKey = computed(() => getKey().length > 0)
  const canRun = computed(() => hasKey.value && state.value.status !== 'loading')

  const errorObj = computed<AppError | null>(() =>
    state.value.status === 'error' ? state.value.error : null,
  )
  const isRateLimited = computed(() => {
    const e = errorObj.value
    return e !== null && e.kind === 'http' && e.status === 429
  })
  const retryAfterSeconds = computed<number | null>(() => {
    const e = errorObj.value
    if (e !== null && e.kind === 'http' && e.status === 429) return e.retryAfter ?? null
    return null
  })

  async function run(market: Market): Promise<void> {
    const key = getKey()
    if (key.length === 0) {
      // No key → do NOT call the API; surface the go-to-Settings state (AC7.2).
      state.value = errorState<AiPrediction>({ kind: 'no-key' })
      return
    }
    const id = ++runId
    state.value = loading()
    const res = await predict(market, key)
    if (id !== runId) return // superseded by a newer run — ignore

    if (res.ok) state.value = successState(res.value)
    else state.value = errorState<AiPrediction>(res.error)
  }

  function retry(market: Market): Promise<void> {
    return run(market)
  }

  function reset(): void {
    runId++ // invalidate any in-flight run
    state.value = idle()
  }

  return {
    state,
    hasKey,
    canRun,
    isRateLimited,
    retryAfterSeconds,
    run,
    retry,
    reset,
  }
}
