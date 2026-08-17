<script setup lang="ts">
/**
 * SJModal (T505 · AC4.4/AC4.7, NFR-DS-8, NFR-A11Y-4/5, WCAG 2.4.11 · T14/T16/C2)
 *
 * Accessible dialog with the full contract:
 * - `<Teleport to="body">` (escapes stacking/overflow ancestors — C2).
 * - `role="dialog"` + `aria-modal="true"` + `aria-labelledby`(title) +
 *   `aria-describedby`(optional summary) + a defined initial focus target.
 * - Focus trap (Tab cycles inside), Escape + backdrop click to close, and focus
 *   RESTORE to the invoking control on close (AC4.4).
 * - Mobile (base): full-screen / bottom sheet honoring `env(safe-area-inset-*)`
 *   with an internal `overflow-y: auto` body and a visible close (X). A centered
 *   dialog only at `md+` — `--radius-xl`, `--shadow-lg`, `--z-modal*`.
 * - Motion ≤ `--duration-slow`, transform/opacity only, reduced-motion gated.
 * - `scroll-padding` keeps a focused control clear of the sticky header (2.4.11).
 */
import { nextTick, ref, useId, watch } from 'vue'
import SJButton from './SJButton.vue'

withDefaults(
  defineProps<{
    title: string
    /** Set true to wire `aria-describedby` to the summary slot region. */
    describe?: boolean
    closeLabel?: string
  }>(),
  { describe: false, closeLabel: 'Close' },
)

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [] }>()

const uid = useId()
const titleId = `sj-modal-${uid}-title`
const descId = `sj-modal-${uid}-desc`

const panelRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

function getFocusable(): HTMLElement[] {
  const panel = panelRef.value
  if (!panel) return []
  // The selector already excludes disabled + tabindex=-1; `hidden` covers the
  // rest without depending on layout (offsetParent is unreliable under test).
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden)
}

function close(): void {
  open.value = false
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return

  const focusables = getFocusable()
  const panel = panelRef.value
  if (!panel) return

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null

  if (focusables.length === 0) {
    event.preventDefault()
    panel.focus()
    return
  }
  // Wrap the trap at both ends; also re-enter if focus escaped the panel.
  if (event.shiftKey) {
    if (active === first || active === panel || !panel.contains(active)) {
      event.preventDefault()
      last?.focus()
    }
  } else if (active === last) {
    event.preventDefault()
    first?.focus()
  }
}

function onBackdrop(): void {
  close()
}

watch(
  open,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null
      document.body.style.overflow = 'hidden'
      await nextTick()
      // Defined initial focus: the panel (announces the dialog label), then Tab
      // moves into the controls.
      panelRef.value?.focus()
    } else {
      document.body.style.overflow = ''
      // Restore focus to whatever opened the dialog (AC4.4).
      previouslyFocused?.focus()
      previouslyFocused = null
    }
  },
  // Run for an initially-open modal too (capture opener + set initial focus).
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="sj-modal">
      <div v-if="open" class="sj-modal" @keydown="onKeydown">
        <div class="sj-modal__backdrop" @click="onBackdrop" />
        <div
          ref="panelRef"
          class="sj-modal__panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="describe ? descId : undefined"
          tabindex="-1"
        >
          <header class="sj-modal__header">
            <h2 :id="titleId" class="sj-modal__title">{{ title }}</h2>
            <SJButton variant="ghost" size="sm" icon-only :aria-label="closeLabel" @click="close">
              <span aria-hidden="true">✕</span>
            </SJButton>
          </header>

          <div v-if="describe" :id="descId" class="sj-modal__summary">
            <slot name="summary" />
          </div>

          <div class="sj-modal__body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="sj-modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sj-modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  display: flex;
  /* base (mobile): sheet rises from the bottom edge into thumb reach. */
  align-items: flex-end;
  justify-content: center;
}

.sj-modal__backdrop {
  position: absolute;
  inset: 0;
  background: var(--color-text-heading);
  opacity: 0.5;
}

.sj-modal__panel {
  position: relative;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  width: 100%;
  /* Full-screen-ish sheet; internal scroll keeps the header/footer pinned. */
  max-height: 92dvh;
  padding: var(--space-6);
  /* Safe-area for the notch + home indicator (needs viewport-fit=cover). */
  padding-top: calc(var(--space-6) + env(safe-area-inset-top, 0px));
  padding-bottom: calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
  background: var(--color-surface);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  box-shadow: var(--shadow-lg);
  outline: none;
  /* Keep a focused control clear of the sticky header (WCAG 2.4.11). */
  scroll-padding-top: var(--space-16);
}

.sj-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-shrink: 0;
}

.sj-modal__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-snug);
  color: var(--color-text-heading);
}

.sj-modal__summary {
  flex-shrink: 0;
  margin-top: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.sj-modal__body {
  flex: 1;
  min-height: 0;
  margin-top: var(--space-4);
  overflow-y: auto;
}

.sj-modal__footer {
  flex-shrink: 0;
  margin-top: var(--space-6);
}

/* Centered dialog only at md+ (NFR-MF-5 / AC4.7). */
@media (min-width: 769px) {
  .sj-modal {
    align-items: center;
  }

  .sj-modal__panel {
    width: auto;
    min-width: 33ch;
    max-width: 65ch;
    max-height: 85dvh;
    border-radius: var(--radius-xl);
  }
}

/* Motion ≤ --duration-slow, transform/opacity only (NFR-DS-6). */
.sj-modal-enter-active,
.sj-modal-leave-active {
  transition: opacity var(--duration-normal) var(--easing-out);
}

.sj-modal-enter-active .sj-modal__panel,
.sj-modal-leave-active .sj-modal__panel {
  transition: transform var(--duration-slow) var(--easing-out);
}

.sj-modal-enter-from,
.sj-modal-leave-to {
  opacity: 0;
}

.sj-modal-enter-from .sj-modal__panel,
.sj-modal-leave-to .sj-modal__panel {
  transform: translateY(var(--space-8));
}

@media (min-width: 769px) {
  .sj-modal-enter-from .sj-modal__panel,
  .sj-modal-leave-to .sj-modal__panel {
    transform: scale(0.97);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sj-modal-enter-active,
  .sj-modal-leave-active,
  .sj-modal-enter-active .sj-modal__panel,
  .sj-modal-leave-active .sj-modal__panel {
    transition: none;
  }

  .sj-modal-enter-from .sj-modal__panel,
  .sj-modal-leave-to .sj-modal__panel {
    transform: none;
  }
}
</style>
