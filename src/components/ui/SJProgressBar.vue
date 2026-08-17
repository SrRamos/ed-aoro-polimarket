<script setup lang="ts">
/**
 * SJProgressBar (shared meter · C1/C14, NFR-DS-6, NFR-A11Y-2) — proportional
 * bar reused by price bars and the AI-confidence bar.
 *
 * - The fill scales via `transform: scaleX()` (NEVER `width` — C1/NFR-DS-6), so
 *   animation stays on the compositor; transition is reduced-motion gated.
 * - The bar is `aria-hidden`; the NUMERIC label (slot) carries the meaning
 *   (SC 1.4.1) — never color/length alone.
 * - `--color-primary` fill = the indigo action accent (AI confidence). `neutral`
 *   tone (price bars, >2-outcome markets) uses a non-accent surface.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Fraction in [0,1] (or use `max`). */
    value: number
    max?: number
    tone?: 'primary' | 'neutral'
  }>(),
  { max: 1, tone: 'primary' },
)

const fraction = computed(() => {
  const raw = props.max > 0 ? props.value / props.max : 0
  if (!Number.isFinite(raw)) return 0
  return Math.min(1, Math.max(0, raw))
})
</script>

<template>
  <div class="sj-progress">
    <div class="sj-progress__track" aria-hidden="true">
      <div
        :class="['sj-progress__fill', `sj-progress__fill--${tone}`]"
        :style="{ transform: `scaleX(${fraction})` }"
      />
    </div>
    <span v-if="$slots.default" class="sj-progress__label"><slot /></span>
  </div>
</template>

<style scoped>
.sj-progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.sj-progress__track {
  flex: 1;
  height: var(--space-2);
  overflow: hidden;
  background: var(--color-surface-hover);
  border-radius: var(--radius-pill);
}

.sj-progress__fill {
  height: 100%;
  border-radius: var(--radius-pill);
  transform-origin: left center;
  transition: transform var(--duration-normal) var(--easing-out);
}

.sj-progress__fill--primary {
  background: var(--color-primary);
}

.sj-progress__fill--neutral {
  background: var(--color-text-secondary);
}

.sj-progress__label {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .sj-progress__fill {
    transition: none;
  }
}
</style>
