<script setup lang="ts">
/**
 * Thin ARIA live-region wrapper (design.md §3.1, NFR-A11Y-3).
 * `polite` → role="status" aria-live="polite" (loading, toasts);
 * `assertive` → role="alert" (errors).
 * Renders its `message` visually hidden by default; set `visible` to show it.
 */
type SJLiveRegionProps = {
  message?: string
  tone?: 'polite' | 'assertive'
  visible?: boolean
}
const props = withDefaults(defineProps<SJLiveRegionProps>(), {
  message: '',
  tone: 'polite',
  visible: false,
})
</script>

<template>
  <div
    :role="props.tone === 'assertive' ? 'alert' : 'status'"
    :aria-live="props.tone"
    aria-atomic="true"
    :class="props.visible ? 'sj-live' : 'sr-only'"
  >
    {{ props.message }}
  </div>
</template>

<style scoped>
.sj-live {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
