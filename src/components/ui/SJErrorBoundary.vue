<script setup lang="ts">
/**
 * SJErrorBoundary (T005 · NFR-ERR-1) — an `onErrorCaptured` boundary so one bad
 * card/panel degrades to a token-styled fallback instead of white-screening the
 * whole SPA. Wrap any subtree that could throw during render/lifecycle/watcher.
 */
import { onErrorCaptured, ref } from 'vue'
import { logEvent } from '../../utils/logger'

const failed = ref(false)

onErrorCaptured((err, _instance, info) => {
  failed.value = true
  logEvent(
    {
      event: 'boundary.captured',
      service: 'app',
      status: 'error',
      operation: info,
      errorKind: err instanceof Error ? err.name : 'unknown',
    },
    'error',
  )
  // Stop propagation: contain the failure to this boundary.
  return false
})

function retry(): void {
  failed.value = false
}
</script>

<template>
  <div v-if="failed" role="alert" class="sj-error-boundary">
    <p class="sj-error-boundary__title">Something went wrong here</p>
    <p class="sj-error-boundary__body">
      This part of the page failed to load. The rest of the app is still usable.
    </p>
    <button type="button" class="sj-error-boundary__retry focus-ring" @click="retry">
      Try again
    </button>
  </div>
  <slot v-else />
</template>

<style scoped>
.sj-error-boundary {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  color: var(--color-error-text);
  background: var(--color-error-surface);
  border: 1px solid var(--color-error-border);
  border-radius: var(--radius-lg);
}

.sj-error-boundary__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-snug);
}

.sj-error-boundary__body {
  font-size: var(--font-size-base);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}

.sj-error-boundary__retry {
  align-self: flex-start;
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-surface);
  background: var(--color-primary);
  border: none;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .sj-error-boundary__retry:hover {
    background: var(--color-primary-dark);
  }
}

.sj-error-boundary__retry:active {
  background: var(--color-primary-dark);
}
</style>
