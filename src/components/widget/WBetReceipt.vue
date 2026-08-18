<script setup lang="ts">
import { formatCurrency } from '../../lib/format'

/**
 * Bet receipt toast (design.md §3.2, AC5.6). Announced via a polite live
 * region and reflected in the positions list by the parent. Auto-dismiss is
 * driven by the parent; a manual close is always available.
 */
type WBetReceiptProps = {
  visible: boolean
  outcome?: string
  size?: number
  total?: number
  txHash?: string
}
const props = withDefaults(defineProps<WBetReceiptProps>(), {
  outcome: '',
  size: 0,
  total: 0,
  txHash: '',
})

type WBetReceiptEmits = { dismiss: [] }
const emit = defineEmits<WBetReceiptEmits>()
</script>

<template>
  <Teleport to="body">
    <div class="toast-layer" role="status" aria-live="polite" aria-atomic="true">
      <div v-if="props.visible" class="toast">
        <span class="toast__icon" aria-hidden="true">✅</span>
        <div class="toast__body">
          <p class="toast__title">Bet filled</p>
          <p class="toast__text">
            {{ formatCurrency(props.size) }} on
            <strong>{{ props.outcome }}</strong> · total
            {{ formatCurrency(props.total) }}
          </p>
          <p class="toast__tx">{{ props.txHash }}</p>
        </div>
        <button
          type="button"
          class="toast__close"
          aria-label="Dismiss receipt"
          @click="emit('dismiss')"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-layer {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: var(--z-toast);
  display: flex;
  justify-content: center;
  padding: var(--space-4);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  width: 100%;
  max-width: 420px;
  padding: var(--space-4);
  pointer-events: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: toast-in var(--duration-normal) var(--easing-out);
}

.toast__icon {
  font-size: var(--font-size-lg);
}

.toast__body {
  flex: 1 1 auto;
  min-width: 0;
}

.toast__title {
  font-weight: var(--font-weight-bold);
  color: var(--color-success-text);
}

.toast__text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.toast__text strong {
  color: var(--color-text-strong);
}

.toast__tx {
  margin-top: var(--space-1);
  font-family: var(--font-family-alt);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  word-break: break-all;
}

.toast__close {
  position: relative;
  isolation: isolate;
  flex: 0 0 auto;
  width: var(--space-8);
  height: var(--space-8);
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.toast__close::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--color-primary);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--easing-out);
}

.toast__close:active::after {
  opacity: var(--state-pressed);
}

.toast__close:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.toast__close:focus-visible::after {
  opacity: var(--state-focus);
}

@media (hover: hover) and (pointer: fine) {
  .toast__close:hover::after {
    opacity: var(--state-hover);
  }
}

@keyframes toast-in {
  from {
    transform: translateY(var(--space-4));
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}
</style>
