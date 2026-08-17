<script setup lang="ts">
/**
 * SJSkeleton (T506 · NFR-A11Y-4, CLS) — placeholder block built from
 * surface/border tokens. Sizing props (`width`/`height`/`radius`) let a caller
 * mirror the real content's box so swapping in the loaded content shifts nothing
 * (zero CLS). Animates `opacity` ONLY, gated by `prefers-reduced-motion`.
 *
 * Decorative: `aria-hidden` — the surrounding region owns the live "loading"
 * announcement (SJSpinner / live region), not each shimmer block.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    width?: string
    height?: string
    radius?: 'sm' | 'md' | 'lg' | 'pill'
    circle?: boolean
  }>(),
  { width: '100%', height: 'var(--space-4)', radius: 'sm', circle: false },
)

const style = computed(() => ({
  width: props.width,
  height: props.height,
  borderRadius: props.circle ? 'var(--radius-pill)' : `var(--radius-${props.radius})`,
}))
</script>

<template>
  <span class="sj-skeleton" :style="style" aria-hidden="true" />
</template>

<style scoped>
.sj-skeleton {
  display: block;
  background: var(--color-surface-hover);
  animation: sj-skeleton-pulse var(--duration-slow) var(--easing-in-out) infinite alternate;
}

@keyframes sj-skeleton-pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.4;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sj-skeleton {
    animation: none;
    opacity: 0.7;
  }
}
</style>
