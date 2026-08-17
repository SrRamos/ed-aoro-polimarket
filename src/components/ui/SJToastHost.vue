<script setup lang="ts">
/**
 * SJToastHost (T507 · NFR-A11Y-3, C9) — mount ONCE near the app root. Teleports a
 * `position: fixed` overlay to `<body>` so toasts never sit in the document flow
 * (no CLS). Two live regions: a polite one (`role="status"`) for success/info and
 * an assertive one (`role="alert"`) for errors, so interruption matches severity.
 */
import { computed } from 'vue'
import { useToast } from '../../composables/useToast'
import SJToast from './SJToast.vue'

const { toasts, dismissToast } = useToast()

const politeToasts = computed(() => toasts.filter((t) => t.variant !== 'error'))
const assertiveToasts = computed(() => toasts.filter((t) => t.variant === 'error'))
</script>

<template>
  <Teleport to="body">
    <div class="sj-toast-host">
      <div class="sj-toast-host__region" role="status" aria-live="polite" aria-atomic="false">
        <SJToast
          v-for="t in politeToasts"
          :key="t.id"
          :message="t.message"
          :variant="t.variant"
          @dismiss="dismissToast(t.id)"
        />
      </div>
      <div class="sj-toast-host__region" role="alert" aria-live="assertive" aria-atomic="false">
        <SJToast
          v-for="t in assertiveToasts"
          :key="t.id"
          :message="t.message"
          :variant="t.variant"
          @dismiss="dismissToast(t.id)"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sj-toast-host {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  /* Clear of the notch / home indicator + never full-bleed (thumb-reach bottom). */
  padding: var(--space-4);
  padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
  pointer-events: none;
}

.sj-toast-host__region {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Only the toasts themselves capture pointer events, not the whole strip. */
.sj-toast-host__region :deep(.sj-toast) {
  pointer-events: auto;
}

/* Centered, capped column on larger screens (NFR-MF-5). */
@media (min-width: 769px) {
  .sj-toast-host {
    right: var(--space-6);
    left: auto;
    /* ch is font-relative, not a raw px — caps the toast column (NFR-MF-5). */
    inline-size: min(100%, 48ch);
  }
}
</style>
