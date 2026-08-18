<script setup lang="ts">
/**
 * Loading placeholder built from surface/border tokens (design.md §3.1,
 * AC3.3). Animates opacity only, reduced-motion gated. Decorative — hidden
 * from assistive tech (the live region announces "loading").
 */
type SJSkeletonProps = {
  variant?: 'line' | 'block' | 'circle'
  width?: string
  height?: string
}
withDefaults(defineProps<SJSkeletonProps>(), {
  variant: 'line',
})
</script>

<template>
  <span
    class="sj-skeleton"
    :class="`sj-skeleton--${variant}`"
    :style="{ width, height }"
    aria-hidden="true"
  />
</template>

<style scoped>
.sj-skeleton {
  display: block;
  background: var(--color-surface-hover);
  border-radius: var(--radius-sm);
  animation: sj-pulse 1200ms var(--easing-in-out) infinite;
}

.sj-skeleton--line {
  height: var(--space-4);
}

.sj-skeleton--block {
  height: var(--space-16);
  border-radius: var(--radius-lg);
}

.sj-skeleton--circle {
  width: var(--space-10);
  height: var(--space-10);
  border-radius: var(--radius-pill);
}

@keyframes sj-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sj-skeleton {
    animation: none;
    opacity: 0.8;
  }
}
</style>
