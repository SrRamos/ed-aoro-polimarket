<script setup lang="ts">
/**
 * SJCard (T503 · NFR-DS-8, NFR-DS-6) — surface container.
 *
 * `--color-surface` bg · `--space-6` pad · `--radius-lg` (card role) ·
 * `--shadow-sm` (elevation ONLY, never state).
 *
 * `interactive` renders the card as a real `<button>` (a whole clickable card,
 * e.g. a market result) with the press-first tonal state layer + `--shadow-focus`
 * focus ring. Non-interactive cards render as a plain `<section>`/`<div>`.
 */
withDefaults(
  defineProps<{
    interactive?: boolean
    /** Tag for the static (non-interactive) card. */
    as?: 'div' | 'section' | 'article' | 'li'
  }>(),
  { interactive: false, as: 'section' },
)
</script>

<template>
  <button v-if="interactive" type="button" class="sj-card sj-card--interactive">
    <slot />
  </button>
  <component :is="as" v-else class="sj-card">
    <slot />
  </component>
</template>

<style scoped>
.sj-card {
  display: block;
  padding: var(--space-6);
  color: var(--color-text-body);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.sj-card--interactive {
  position: relative;
  isolation: isolate;
  width: 100%;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
}

/* Tonal state layer (press-first) — same contract as SJButton (NFR-DS-3). */
.sj-card--interactive::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--color-primary);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--easing-out);
  pointer-events: none;
}

.sj-card--interactive:active::after {
  opacity: var(--state-pressed);
}

.sj-card--interactive:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.sj-card--interactive:focus-visible::after {
  opacity: var(--state-focus);
}

@media (hover: hover) and (pointer: fine) {
  .sj-card--interactive:hover::after {
    opacity: var(--state-hover);
  }
}
</style>
