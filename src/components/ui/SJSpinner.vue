<script setup lang="ts">
/** Inline loading affordance. role="status"; motion gated by reduced-motion. */
type SJSpinnerProps = {
  label?: string
  size?: 'sm' | 'md'
}
withDefaults(defineProps<SJSpinnerProps>(), {
  label: 'Loading',
  size: 'md',
})
</script>

<template>
  <span class="sj-spinner" :class="`sj-spinner--${size}`" role="status">
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
  border-radius: var(--radius-pill);
  border: 2px solid var(--color-primary-surface);
  border-top-color: var(--color-primary);
  animation: sj-spin var(--duration-slow) linear infinite;
}

.sj-spinner--sm .sj-spinner__ring {
  width: var(--space-4);
  height: var(--space-4);
}

@keyframes sj-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sj-spinner__ring {
    animation-duration: 1200ms;
  }
}
</style>
