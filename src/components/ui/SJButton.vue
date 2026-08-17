<script setup lang="ts">
/**
 * SJButton (T501 · NFR-DS-2/3/4/6, NFR-MF-2) — the shared action primitive.
 *
 * - Indigo `--color-primary` is the ONLY action accent (primary variant);
 *   secondary/ghost are lower-emphasis, still indigo-tinted on interaction.
 * - Press-first states: `:active` → `:focus-visible` → `:hover` (hover gated),
 *   expressed via the tonal `--state-*` overlay — NEVER shadow-for-state.
 * - Focus ring via `--shadow-focus`; control radius `--radius-sm`.
 * - `loading` sets `aria-busy` + disables (prevents double-submit) and swaps the
 *   label for an inline spinner without collapsing the box.
 * - `iconOnly` pads the hit area to the 44px target and REQUIRES an accessible
 *   name (pass `aria-label`) — dev-warns if missing.
 */
import { computed, useAttrs } from 'vue'
import SJSpinner from './SJSpinner.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    iconOnly?: boolean
    block?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    iconOnly: false,
    block: false,
  },
)

const attrs = useAttrs()

// A loading button is disabled to the pointer/keyboard but keeps `aria-busy`
// so assistive tech announces the in-flight state (AC5.1a pattern).
const isDisabled = computed(() => props.disabled || props.loading)

if (import.meta.env.DEV && props.iconOnly) {
  const label = attrs['aria-label'] ?? attrs['ariaLabel']
  if (!label) {
    console.warn('[SJButton] iconOnly requires an `aria-label` for an accessible name.')
  }
}
</script>

<template>
  <button
    :type="type"
    :class="[
      'sj-button',
      `sj-button--${variant}`,
      `sj-button--${size}`,
      { 'sj-button--icon': iconOnly, 'sj-button--block': block },
    ]"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
    v-bind="attrs"
  >
    <SJSpinner v-if="loading" class="sj-button__spinner" :size="size === 'lg' ? 'md' : 'sm'" />
    <span :class="{ 'sj-button__label--hidden': loading }" class="sj-button__label">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.sj-button {
  /* Overlay tint per variant; the layer's opacity carries the state (NFR-DS-3). */
  --sj-state-layer: var(--color-primary);

  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--space-10); /* 40px; icon/size modifiers push to the 44px aim */
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-snug);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--easing-out);
}

/* Tonal state layer — expresses hover/focus/pressed (NFR-DS-3). */
.sj-button::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--sj-state-layer);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--easing-out);
  pointer-events: none;
}

/* Press-first cascade: active → focus-visible → hover (hover gated). */
.sj-button:active::after {
  opacity: var(--state-pressed);
}

.sj-button:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.sj-button:focus-visible::after {
  opacity: var(--state-focus);
}

@media (hover: hover) and (pointer: fine) {
  .sj-button:hover::after {
    opacity: var(--state-hover);
  }
}

.sj-button:disabled {
  cursor: not-allowed;
  color: var(--color-text-disabled);
  background: var(--color-surface-secondary);
  border-color: var(--color-border);
  box-shadow: none;
}

.sj-button:disabled::after {
  opacity: 0;
}

/* --- Variants --- */
.sj-button--primary {
  --sj-state-layer: var(--color-white); /* on-primary overlay lightens the fill */
  color: var(--color-white);
  background: var(--color-primary);
  box-shadow: var(--shadow-sm); /* elevation only, never state (NFR-DS-6) */
}

.sj-button--secondary {
  color: var(--color-primary-dark);
  background: var(--color-primary-surface);
  border-color: var(--color-border);
}

.sj-button--ghost {
  color: var(--color-primary-dark);
  background: transparent;
}

/* --- Sizes --- */
.sj-button--sm {
  min-height: var(--space-8); /* 32px — still ≥24px AA floor */
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
}

.sj-button--lg {
  min-height: var(--space-12); /* 48px — Material target */
  padding: var(--space-3) var(--space-6);
  font-size: var(--font-size-lg);
}

/* --- Icon-only: square, padded to the 44px hit area --- */
.sj-button--icon {
  min-width: var(--space-10);
  min-height: var(--space-10);
  padding: var(--space-2);
}

.sj-button--icon.sj-button--lg {
  min-width: var(--space-12);
  min-height: var(--space-12);
}

.sj-button--block {
  width: 100%;
}

/* Keep the box from collapsing while the spinner replaces the label. */
.sj-button__label--hidden {
  visibility: hidden;
}

.sj-button__spinner {
  position: absolute;
}
</style>
