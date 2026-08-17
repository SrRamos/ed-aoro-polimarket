<script setup lang="ts">
/**
 * SJSpinner (T506 · AC3.3, NFR-A11Y-4) — indeterminate loading indicator built
 * from surface/border tokens. Animates `transform` only; under
 * `prefers-reduced-motion` the ring stops spinning (meaning kept via the label).
 *
 * A11y: `role="status"` + a visually-hidden label so screen readers announce it;
 * `label` is overridable for context ("Loading markets").
 */
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg'
    label?: string
  }>(),
  { size: 'md', label: 'Loading' },
)
</script>

<template>
  <span :class="['sj-spinner', `sj-spinner--${size}`]" role="status">
    <span class="sj-spinner__ring" aria-hidden="true" />
    <span class="sr-only">{{ label }}</span>
  </span>
</template>

<style scoped>
.sj-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sj-spinner__ring {
  display: block;
  width: var(--space-5);
  height: var(--space-5);
  border: var(--space-1) solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-pill);
  animation: sj-spinner-rotate var(--duration-slow) linear infinite;
}

.sj-spinner--sm .sj-spinner__ring {
  width: var(--space-4);
  height: var(--space-4);
}

.sj-spinner--lg .sj-spinner__ring {
  width: var(--space-8);
  height: var(--space-8);
}

@keyframes sj-spinner-rotate {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sj-spinner__ring {
    animation: none;
  }
}
</style>
