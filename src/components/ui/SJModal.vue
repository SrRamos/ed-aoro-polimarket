<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

/**
 * Modal container (design.md §3.1, NFR-DS-8, NFR-A11Y-5).
 * --radius-xl, --shadow-lg, --z-modal-backdrop / --z-modal, focus trap,
 * Escape + backdrop close, focus return to the invoking control, motion
 * ≤300ms (transform/opacity only, reduced-motion gated).
 */
type SJModalProps = {
  open: boolean
  title: string
  size?: 'md' | 'lg'
}
const props = withDefaults(defineProps<SJModalProps>(), { size: 'md' })

type SJModalEmits = { close: [] }
const emit = defineEmits<SJModalEmits>()

const uid = useId()
const titleId = `sj-modal-title-${uid}`
const dialogRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

function focusableEls(): HTMLElement[] {
  if (!dialogRef.value) return []
  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement)
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.stopPropagation()
    emit('close')
    return
  }
  if (ev.key !== 'Tab') return
  const els = focusableEls()
  if (els.length === 0) {
    ev.preventDefault()
    dialogRef.value?.focus()
    return
  }
  const first = els[0]
  const last = els[els.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (ev.shiftKey && active === first) {
    ev.preventDefault()
    last.focus()
  } else if (!ev.shiftKey && active === last) {
    ev.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null
      document.addEventListener('keydown', onKeydown, true)
      document.body.style.overflow = 'hidden'
      await nextTick()
      const els = focusableEls()
      ;(els[0] ?? dialogRef.value)?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown, true)
      document.body.style.overflow = ''
      previouslyFocused?.focus?.()
      previouslyFocused = null
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="sj-modal-layer">
      <div class="sj-modal__backdrop" @click="emit('close')" />
      <div
        ref="dialogRef"
        class="sj-modal"
        :class="`sj-modal--${props.size}`"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <header class="sj-modal__header">
          <h2 :id="titleId" class="sj-modal__title">{{ props.title }}</h2>
          <button
            type="button"
            class="sj-modal__close"
            aria-label="Close dialog"
            @click="emit('close')"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>
        <div class="sj-modal__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="sj-modal__footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sj-modal-layer {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}

.sj-modal__backdrop {
  position: absolute;
  inset: 0;
  background: var(--color-slate-900);
  opacity: 0.44;
  animation: sj-fade var(--duration-normal) var(--easing-out);
}

.sj-modal {
  position: relative;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 92vh;
  background: var(--color-surface);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  box-shadow: var(--shadow-lg);
  animation: sj-sheet-in var(--duration-slow) var(--easing-out);
}

.sj-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--color-border-subtle);
}

.sj-modal__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-snug);
  color: var(--color-text-heading);
}

.sj-modal__close {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--space-12);
  height: var(--space-12);
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.sj-modal__close::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--color-primary);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--easing-out);
}

.sj-modal__close:active::after {
  opacity: var(--state-pressed);
}

.sj-modal__close:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.sj-modal__close:focus-visible::after {
  opacity: var(--state-focus);
}

@media (hover: hover) and (pointer: fine) {
  .sj-modal__close:hover::after {
    opacity: var(--state-hover);
  }
}

.sj-modal__body {
  padding: var(--space-6);
  overflow-y: auto;
}

.sj-modal__footer {
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--color-border-subtle);
}

/* Centered dialog on larger viewports. */
@media (min-width: 769px) {
  .sj-modal-layer {
    align-items: center;
    padding: var(--space-8);
  }

  .sj-modal {
    max-width: 560px;
    border-radius: var(--radius-xl);
    animation-name: sj-scale-in;
  }

  .sj-modal--lg {
    max-width: 720px;
  }
}

@keyframes sj-fade {
  from {
    opacity: 0;
  }
}

@keyframes sj-sheet-in {
  from {
    transform: translateY(var(--space-8));
    opacity: 0;
  }
}

@keyframes sj-scale-in {
  from {
    transform: scale(0.98);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sj-modal,
  .sj-modal__backdrop {
    animation: none;
  }
}
</style>
