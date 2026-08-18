<script setup lang="ts">
/**
 * Card shell (design.md §3.1, NFR-DS-8): --color-surface, --space-6 padding,
 * --radius-lg, --shadow-sm. When `interactive`, renders a native <button> so
 * the whole card is keyboard-operable, with press-first state layer + focus
 * ring (shadow never conveys state).
 */
type SJCardProps = {
  interactive?: boolean
  highlighted?: boolean
  ariaLabel?: string
}
const props = withDefaults(defineProps<SJCardProps>(), {
  interactive: false,
  highlighted: false,
})

type SJCardEmits = { click: [ev: MouseEvent] }
const emit = defineEmits<SJCardEmits>()
</script>

<template>
  <component
    :is="props.interactive ? 'button' : 'div'"
    :type="props.interactive ? 'button' : undefined"
    class="sj-card"
    :class="{
      'sj-card--interactive': props.interactive,
      'sj-card--highlighted': props.highlighted,
    }"
    :aria-label="props.ariaLabel"
    @click="emit('click', $event)"
  >
    <slot />
  </component>
</template>

<style scoped>
.sj-card {
  position: relative;
  isolation: isolate;
  display: block;
  width: 100%;
  padding: var(--space-6);
  color: var(--color-text-body);
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.sj-card--highlighted {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
}

.sj-card--interactive {
  cursor: pointer;
  font: inherit;
}

.sj-card--interactive::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--color-primary);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--easing-out);
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
