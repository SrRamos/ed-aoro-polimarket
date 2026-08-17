<script setup lang="ts">
/**
 * SJToast (T507 · NFR-A11Y-2/3) — a single toast row. Presentational only; the
 * host owns the live region + timing. Variant is signalled by the semantic triad
 * AND a leading icon + text, never color alone (SC 1.4.1). Dismissible via a
 * padded icon button (WCAG 2.2.1/1.4.13).
 */
import type { ToastVariant } from '../../composables/useToast'
import SJButton from './SJButton.vue'

defineProps<{
  message: string
  variant: ToastVariant
}>()

const emit = defineEmits<{ dismiss: [] }>()

const ICONS: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}
</script>

<template>
  <div :class="['sj-toast', `sj-toast--${variant}`]">
    <span class="sj-toast__icon" aria-hidden="true">{{ ICONS[variant] }}</span>
    <span class="sj-toast__message">{{ message }}</span>
    <SJButton
      class="sj-toast__dismiss"
      variant="ghost"
      size="sm"
      icon-only
      aria-label="Dismiss notification"
      @click="emit('dismiss')"
    >
      <span aria-hidden="true">✕</span>
    </SJButton>
  </div>
</template>

<style scoped>
.sj-toast {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.sj-toast__icon {
  display: inline-flex;
  flex-shrink: 0;
  font-weight: var(--font-weight-bold);
}

.sj-toast__message {
  flex: 1;
  min-width: 0;
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
}

.sj-toast__dismiss {
  flex-shrink: 0;
  margin-left: var(--space-2);
}

.sj-toast--success {
  color: var(--color-success-text);
  background: var(--color-success-surface);
  border-color: var(--color-success-border);
}

.sj-toast--error {
  color: var(--color-error-text);
  background: var(--color-error-surface);
  border-color: var(--color-error-border);
}

.sj-toast--info {
  color: var(--color-info-text);
  background: var(--color-info-surface);
  border-color: var(--color-info-border);
}
</style>
