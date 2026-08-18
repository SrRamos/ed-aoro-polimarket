<script setup lang="ts">
import { computed } from 'vue'
import type { AiMarketPick } from '../../models/prediction'
import type { ViewStatus } from '../../lib/status'
import { formatPercent } from '../../lib/format'
import SJButton from '../ui/SJButton.vue'
import SJSpinner from '../ui/SJSpinner.vue'
import SJLiveRegion from '../ui/SJLiveRegion.vue'

/**
 * AI market pick over the visible list (design.md §3.2, AC9.1–AC9.6).
 * On-demand only; no key → same Settings CTA as the outcome pick. The
 * recommended market is also highlighted in the list (parent wires that via
 * recommendedMarketId). Confidence is a numeric-labelled bar; disclaimer shown.
 */
type WAiMarketPickProps = {
  hasKey: boolean
  status: ViewStatus
  pick?: AiMarketPick | null
  recommendedQuestion?: string | null
  errorMessage?: string
}
const props = withDefaults(defineProps<WAiMarketPickProps>(), {
  pick: null,
  recommendedQuestion: null,
  errorMessage: 'The AI request failed. Please try again.',
})

type WAiMarketPickEmits = {
  request: []
  retry: []
  dismiss: []
  'open-settings': []
}
const emit = defineEmits<WAiMarketPickEmits>()

const confidencePct = computed(() =>
  props.pick ? formatPercent(props.pick.confidence) : '0%',
)
</script>

<template>
  <section class="amp" aria-labelledby="amp-heading">
    <div class="amp__bar">
      <h3 id="amp-heading" class="amp__title">
        <span aria-hidden="true">✨</span> AI: pick a market
      </h3>

      <!-- No key (AC9.1) -->
      <SJButton
        v-if="!hasKey"
        variant="secondary"
        size="sm"
        @click="emit('open-settings')"
        >Enable in Settings</SJButton
      >
      <!-- Idle trigger (AC9.2) -->
      <SJButton
        v-else-if="status === 'idle'"
        variant="primary"
        size="sm"
        @click="emit('request')"
        >Recommend a market</SJButton
      >
      <SJButton
        v-else-if="status === 'success' || status === 'error'"
        variant="ghost"
        size="sm"
        @click="emit('dismiss')"
        >Dismiss</SJButton
      >
    </div>

    <SJLiveRegion
      :tone="status === 'error' ? 'assertive' : 'polite'"
      :message="
        status === 'loading'
          ? 'Requesting AI market recommendation'
          : status === 'error'
            ? errorMessage
            : status === 'success' && recommendedQuestion
              ? `AI recommends ${recommendedQuestion} at ${confidencePct} confidence`
              : ''
      "
    />

    <p v-if="!hasKey" class="amp__muted">
      Add your OpenRouter key to let the AI recommend which market to explore.
    </p>

    <div v-else-if="status === 'loading'" class="amp__loading">
      <SJSpinner size="sm" label="Requesting AI recommendation" />
      <span>Scanning the visible markets…</span>
    </div>

    <div v-else-if="status === 'error'" class="amp__error">
      <p class="amp__error-text">
        <span aria-hidden="true">⚠️</span> {{ errorMessage }}
      </p>
      <SJButton variant="secondary" size="sm" @click="emit('retry')"
        >Retry</SJButton
      >
    </div>

    <div v-else-if="status === 'success' && pick" class="amp__result">
      <p class="amp__pick">
        Top pick:
        <strong>{{ recommendedQuestion }}</strong>
      </p>
      <div class="amp__conf">
        <div class="amp__conf-label">
          <span>Confidence</span>
          <span class="amp__conf-num">{{ confidencePct }}</span>
        </div>
        <div
          class="amp__conf-track"
          role="meter"
          :aria-valuenow="Math.round(pick.confidence * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`AI confidence ${confidencePct}`"
        >
          <div class="amp__conf-fill" :style="{ width: confidencePct }" />
        </div>
      </div>
      <p class="amp__rationale">{{ pick.rationale }}</p>
      <p class="amp__disclaimer">
        Highlighted in the list below. Not financial advice.
      </p>
    </div>
  </section>
</template>

<style scoped>
.amp {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-indigo-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.amp__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.amp__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.amp__muted {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.amp__loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.amp__error {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
}

.amp__error-text {
  font-size: var(--font-size-sm);
  color: var(--color-error-text);
}

.amp__result {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.amp__pick {
  font-size: var(--font-size-base);
  color: var(--color-text-strong);
}

.amp__pick strong {
  color: var(--color-primary-dark);
}

.amp__conf-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.amp__conf-num {
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-heading);
}

.amp__conf-track {
  height: var(--space-3);
  background: var(--color-surface-hover);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.amp__conf-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-pill);
  transition: width var(--duration-normal) var(--easing-out);
}

.amp__rationale {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-body);
}

.amp__disclaimer {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .amp__conf-fill {
    transition: none;
  }
}
</style>
