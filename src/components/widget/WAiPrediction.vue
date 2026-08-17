<script setup lang="ts">
/**
 * WAiPrediction (T607 · AC7.1/AC7.2/AC7.3/AC7.7–AC7.10 · NFR-A11Y-2/NFR-DS-2)
 *
 * The opt-in "AI suggestion" action inside a market view:
 *   - ON-DEMAND ONLY: nothing fires until the user activates the button (AC7.3);
 *     `useAiPrediction.run` is never called on mount/selection.
 *   - NO-KEY: the affordance is VISIBLE BUT DISABLED (never hidden) plus a CTA to
 *     open Settings (AC7.2) — no API call is attempted.
 *   - RESULT: recommended outcome + a confidence bar (`--color-primary`, the indigo
 *     action accent) whose NUMERIC label carries the meaning (never colour/length
 *     alone, SC 1.4.1) + the rationale rendered as PLAIN TEXT (interpolation only,
 *     never `v-html`) + a "not financial advice" disclaimer (AC7.8).
 *   - ERROR: a retry affordance; a `429` rate-limit is distinguished from a hard
 *     failure — its message honors `Retry-After` and never auto-retries (AC7.9).
 *
 * The controller + settings source are injectable so tests need no live network.
 */
import { computed } from 'vue'
import type { Market } from '../../models/market'
import type { AppError } from '../../models/errors'
import { formatPercent } from '../../utils/format'
import { useAiPrediction, type UseAiPrediction } from '../../composables/useAiPrediction'
import SJButton from '../ui/SJButton.vue'
import SJBadge from '../ui/SJBadge.vue'
import SJProgressBar from '../ui/SJProgressBar.vue'
import SJSpinner from '../ui/SJSpinner.vue'

const props = defineProps<{
  market: Market
  /** Inject a ready controller (tests / shared). Defaults to `useAiPrediction()`. */
  controller?: UseAiPrediction
}>()

const emit = defineEmits<{ (e: 'open-settings'): void }>()

const ai = props.controller ?? useAiPrediction()
const { state, hasKey, canRun, isRateLimited, retryAfterSeconds, run, retry } = ai

/** The current error object, when the state is an error. */
const errorObj = computed<AppError | null>(() =>
  state.value.status === 'error' ? state.value.error : null,
)

/** A no-key error is treated like the visible-but-disabled CTA case (AC7.2). */
const isNoKeyError = computed(() => errorObj.value?.kind === 'no-key')

const rateLimitMessage = computed(() => {
  const secs = retryAfterSeconds.value
  if (secs !== null && secs > 0) {
    return `The AI service is rate-limited. Try again in about ${secs} second${secs === 1 ? '' : 's'}.`
  }
  return 'The AI service is rate-limited. Wait a moment, then try again.'
})

function errorCopy(e: AppError): string {
  switch (e.kind) {
    case 'outcome-mismatch':
      return 'The AI returned an outcome that doesn’t match this market. No suggestion is shown.'
    case 'parse-fail':
      return 'The AI response couldn’t be read. Try again.'
    default:
      return 'The AI suggestion couldn’t be generated. Try again.'
  }
}

function onRun(): void {
  void run(props.market)
}

function onRetry(): void {
  void retry(props.market)
}
</script>

<template>
  <section class="w-ai" aria-labelledby="w-ai-title">
    <header class="w-ai__head">
      <h3 id="w-ai-title" class="w-ai__title">AI suggestion</h3>
      <SJBadge variant="info">Beta</SJBadge>
    </header>

    <!-- Polite live region for the loading announcement (AC7.7). -->
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ state.status === 'loading' ? 'Generating an AI suggestion…' : '' }}
    </div>

    <!-- NO KEY: visible-but-disabled affordance + CTA to Settings (AC7.2). -->
    <div v-if="!hasKey || isNoKeyError" class="w-ai__no-key">
      <SJButton variant="primary" disabled>Get AI suggestion</SJButton>
      <p class="w-ai__no-key-text">
        Add an OpenRouter API key in Settings to enable AI suggestions.
      </p>
      <SJButton variant="secondary" @click="emit('open-settings')">Open Settings</SJButton>
    </div>

    <!-- LOADING -->
    <div v-else-if="state.status === 'loading'" class="w-ai__loading">
      <SJSpinner />
      <span class="w-ai__loading-text">Analyzing the market…</span>
    </div>

    <!-- ERROR: distinct 429 rate-limit vs hard failure (AC7.9). -->
    <div v-else-if="state.status === 'error'" class="w-ai__error">
      <p class="w-ai__error-text" role="alert">
        {{ isRateLimited ? rateLimitMessage : errorCopy(state.error) }}
      </p>
      <!-- No auto-retry for a 429; the user re-triggers manually (AC7.9). -->
      <SJButton variant="secondary" :disabled="!canRun" @click="onRetry">Try again</SJButton>
    </div>

    <!-- RESULT (AC7.8) -->
    <div v-else-if="state.status === 'success'" class="w-ai__result">
      <p class="w-ai__recommend">
        <span class="w-ai__recommend-label">Recommended:</span>
        <SJBadge variant="neutral">{{ state.data.recommendedOutcome }}</SJBadge>
      </p>

      <div class="w-ai__confidence">
        <span id="w-ai-confidence-label" class="w-ai__confidence-title">Confidence</span>
        <SJProgressBar
          :value="state.data.confidence"
          tone="primary"
          aria-labelledby="w-ai-confidence-label"
        >
          {{ formatPercent(state.data.confidence) }}
        </SJProgressBar>
      </div>

      <!-- Rationale as PLAIN TEXT — interpolation only, never v-html. -->
      <p class="w-ai__rationale">{{ state.data.rationale }}</p>

      <p class="w-ai__disclaimer">
        This is an AI-generated suggestion, not financial advice. Bets are simulated.
      </p>

      <SJButton variant="ghost" size="sm" :disabled="!canRun" @click="onRetry">Regenerate</SJButton>
    </div>

    <!-- IDLE: the on-demand trigger (AC7.3) -->
    <div v-else class="w-ai__idle">
      <SJButton variant="primary" :disabled="!canRun" @click="onRun">Get AI suggestion</SJButton>
      <p class="w-ai__idle-text">Uses your OpenRouter key to analyze this market on demand.</p>
    </div>
  </section>
</template>

<style scoped>
.w-ai {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
}

.w-ai__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.w-ai__title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-heading);
}

.w-ai__no-key,
.w-ai__idle,
.w-ai__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.w-ai__no-key-text,
.w-ai__idle-text {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}

.w-ai__loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.w-ai__loading-text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.w-ai__error-text {
  font-size: var(--font-size-base);
  line-height: var(--leading-normal);
  color: var(--color-error-text);
}

.w-ai__result {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.w-ai__recommend {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.w-ai__recommend-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-strong);
}

.w-ai__confidence {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.w-ai__confidence-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-strong);
}

.w-ai__rationale {
  font-size: var(--font-size-base);
  line-height: var(--leading-relaxed);
  color: var(--color-text-body);
}

.w-ai__disclaimer {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}
</style>
