<script setup lang="ts">
import { computed } from 'vue'
import type { AiPrediction } from '../../models/prediction'
import type { ViewStatus } from '../../lib/status'
import { formatPercent } from '../../lib/format'
import SJButton from '../ui/SJButton.vue'
import SJSpinner from '../ui/SJSpinner.vue'
import SJLiveRegion from '../ui/SJLiveRegion.vue'

/**
 * AI outcome suggestion (design.md §3.2, AC7.1–AC7.10). On-demand only.
 * No key → CTA to Settings (never calls the API). Confidence shown as a
 * --color-primary bar paired with a numeric label (never color alone),
 * plus a "not financial advice" disclaimer.
 */
type WAiPredictionProps = {
  hasKey: boolean
  status: ViewStatus
  prediction?: AiPrediction | null
  errorMessage?: string
}
const props = withDefaults(defineProps<WAiPredictionProps>(), {
  prediction: null,
  errorMessage: 'The AI request failed. Please try again.',
})

type WAiPredictionEmits = {
  request: []
  retry: []
  'open-settings': []
}
const emit = defineEmits<WAiPredictionEmits>()

const confidencePct = computed(() =>
  props.prediction ? formatPercent(props.prediction.confidence) : '0%',
)
</script>

<template>
  <section class="ai" aria-labelledby="ai-outcome-heading">
    <div class="ai__head">
      <h3 id="ai-outcome-heading" class="ai__title">
        <span aria-hidden="true">✨</span> AI outcome suggestion
      </h3>
    </div>

    <SJLiveRegion
      :tone="status === 'error' ? 'assertive' : 'polite'"
      :message="
        status === 'loading'
          ? 'Requesting AI suggestion'
          : status === 'error'
            ? errorMessage
            : status === 'success' && prediction
              ? `AI suggests ${prediction.recommendedOutcome} at ${confidencePct} confidence`
              : ''
      "
    />

    <!-- No key (AC7.2) -->
    <div v-if="!hasKey" class="ai__cta">
      <p class="ai__cta-text">
        Add your OpenRouter API key in Settings to enable AI suggestions.
      </p>
      <SJButton variant="secondary" size="sm" @click="emit('open-settings')"
        >Open Settings</SJButton
      >
    </div>

    <!-- Idle / trigger (AC7.3) -->
    <div v-else-if="status === 'idle'" class="ai__idle">
      <p class="ai__idle-text">
        Get a data-grounded second opinion on which outcome to pick.
      </p>
      <SJButton variant="primary" size="sm" @click="emit('request')"
        >Get AI suggestion</SJButton
      >
    </div>

    <!-- Loading (AC7.7) -->
    <div v-else-if="status === 'loading'" class="ai__loading">
      <SJSpinner size="sm" label="Requesting AI suggestion" />
      <span>Analyzing outcomes…</span>
    </div>

    <!-- Error (AC7.9) -->
    <div v-else-if="status === 'error'" class="ai__error">
      <p class="ai__error-text">
        <span aria-hidden="true">⚠️</span> {{ errorMessage }}
      </p>
      <SJButton variant="secondary" size="sm" @click="emit('retry')"
        >Retry</SJButton
      >
    </div>

    <!-- Success (AC7.8) -->
    <div v-else-if="status === 'success' && prediction" class="ai__result">
      <p class="ai__pick">
        Recommended: <strong>{{ prediction.recommendedOutcome }}</strong>
      </p>
      <div class="ai__conf">
        <div class="ai__conf-label">
          <span>Confidence</span>
          <span class="ai__conf-num">{{ confidencePct }}</span>
        </div>
        <div
          class="ai__conf-track"
          role="meter"
          :aria-valuenow="Math.round(prediction.confidence * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`AI confidence ${confidencePct}`"
        >
          <div class="ai__conf-fill" :style="{ width: confidencePct }" />
        </div>
      </div>
      <p class="ai__rationale">{{ prediction.rationale }}</p>
      <p class="ai__disclaimer">Not financial advice.</p>
    </div>
  </section>
</template>

<style scoped>
.ai {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--color-primary-surface);
  border: 1px solid var(--color-indigo-200);
  border-radius: var(--radius-lg);
}

.ai__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.ai__cta,
.ai__idle {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
}

.ai__cta-text,
.ai__idle-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.ai__loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.ai__error {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
}

.ai__error-text {
  font-size: var(--font-size-sm);
  color: var(--color-error-text);
}

.ai__result {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ai__pick {
  font-size: var(--font-size-base);
  color: var(--color-text-strong);
}

.ai__pick strong {
  color: var(--color-primary-dark);
}

.ai__conf-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.ai__conf-num {
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-heading);
}

.ai__conf-track {
  height: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-indigo-200);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.ai__conf-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-pill);
  transition: width var(--duration-normal) var(--easing-out);
}

.ai__rationale {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-body);
}

.ai__disclaimer {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .ai__conf-fill {
    transition: none;
  }
}
</style>
