<script setup lang="ts">
import SJSpinner from './SJSpinner.vue'

/**
 * Shared button primitive (design.md §3.1).
 * Press-first states (:active → :focus-visible → :hover, hover gated),
 * --shadow-focus ring, --radius-sm, ≥44px min target. Tonal state-layer
 * overlay via ::after so shadow is never used to convey state (NFR-DS-3).
 */
type SJButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  block?: boolean
  size?: 'md' | 'sm'
}
const props = withDefaults(defineProps<SJButtonProps>(), {
  variant: 'primary',
  type: 'button',
  disabled: false,
  loading: false,
  block: false,
  size: 'md',
})

type SJButtonEmits = { click: [ev: MouseEvent] }
const emit = defineEmits<SJButtonEmits>()

function onClick(ev: MouseEvent) {
  if (props.disabled || props.loading) return
  emit('click', ev)
}
</script>

<template>
  <button
    :type="props.type"
    class="sj-btn"
    :class="[
      `sj-btn--${props.variant}`,
      `sj-btn--${props.size}`,
      { 'sj-btn--block': props.block, 'sj-btn--loading': props.loading },
    ]"
    :disabled="props.disabled || props.loading"
    :aria-busy="props.loading ? 'true' : undefined"
    @click="onClick"
  >
    <SJSpinner v-if="props.loading" size="sm" class="sj-btn__spinner" />
    <span class="sj-btn__label"><slot /></span>
  </button>
</template>

<style scoped>
.sj-btn {
  --sj-state: var(--color-primary);
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--space-12);
  min-width: var(--space-12);
  padding: var(--space-3) var(--space-5);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-none);
  text-align: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--duration-fast) var(--easing-out);
}

.sj-btn--sm {
  min-height: var(--space-10);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
}

.sj-btn--block {
  width: 100%;
}

/* Tonal state-layer overlay — expresses hover/focus/pressed (NFR-DS-3). */
.sj-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--sj-state);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--easing-out);
}

/* Variants */
.sj-btn--primary {
  --sj-state: var(--color-white);
  color: var(--color-white);
  background: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.sj-btn--secondary {
  --sj-state: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-surface);
  border-color: var(--color-border-light);
  box-shadow: var(--shadow-sm);
}

.sj-btn--ghost {
  --sj-state: var(--color-primary);
  color: var(--color-primary);
  background: transparent;
}

.sj-btn--danger {
  --sj-state: var(--color-white);
  color: var(--color-white);
  background: var(--color-error-strong);
  box-shadow: var(--shadow-sm);
}

/* Press-first ordering: :active → :focus-visible → :hover */
.sj-btn:active::after {
  opacity: var(--state-pressed);
}

.sj-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.sj-btn:focus-visible::after {
  opacity: var(--state-focus);
}

@media (hover: hover) and (pointer: fine) {
  .sj-btn:hover::after {
    opacity: var(--state-hover);
  }
}

.sj-btn:disabled {
  cursor: not-allowed;
  color: var(--color-text-disabled);
  background: var(--color-surface-hover);
  border-color: transparent;
  box-shadow: none;
}

.sj-btn--loading {
  cursor: progress;
}

.sj-btn:disabled::after {
  opacity: 0;
}
</style>
