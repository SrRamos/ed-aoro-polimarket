<script setup lang="ts">
/**
 * WMarketSearch (T601 · AC2.1–AC2.8, T11/T15/T17, C13/C17) — the search entry
 * point that drives `useMarketSearch` and renders its discriminated states.
 *
 * - The field carries search semantics: `type="search"` + `enterkeyhint="search"`
 *   + `autocomplete="off"` (T15). Typing debounces through the composable; Enter
 *   (form submit) fires the current query immediately.
 * - A clear ("×") affordance (an icon `SJButton`, ≥44px hit area, spaced) resets
 *   to the browse list (AC2.6).
 * - A polite live region announces the settled result count / loading / offline
 *   text (AC2.3) — bound straight to the composable's `announcement`.
 * - States are exhaustive, never a dead end (T17):
 *     idle       → browse list (top by volume)
 *     loading    → skeleton grid
 *     offline    → distinct offline notice + browse fallback (AC2.8, not a
 *                  generic network error)
 *     error      → friendly message + retry (AC2.5)
 *     no-results → echoes & preserves the query, offers clear + a top-by-volume
 *                  fallback (AC2.4)
 *     results    → the result grid
 *
 * The composable is injectable (`controller` / `options` props) so tests drive
 * any state synchronously and never touch the network.
 */
import type { Market } from '../../models/market'
import type { AppError } from '../../models/errors'
import {
  useMarketSearch,
  type UseMarketSearch,
  type UseMarketSearchOptions,
} from '../../composables/useMarketSearch'
import SJInput from '../ui/SJInput.vue'
import SJButton from '../ui/SJButton.vue'
import WMarketList from './WMarketList.vue'

const props = defineProps<{
  /** Inject a ready controller (tests / shared state). */
  controller?: UseMarketSearch
  /** Options forwarded to `useMarketSearch` when no controller is injected. */
  options?: UseMarketSearchOptions
}>()

const emit = defineEmits<{ (e: 'select', market: Market): void }>()

const search = props.controller ?? useMarketSearch(props.options)
const { query, state, browseState, isOffline, announcement, clear, retry } = search

/** Fixed, friendly copy per error kind — never surface upstream text (C13/C19). */
function errorCopy(error: AppError): string {
  switch (error.kind) {
    case 'offline':
      return 'You’re offline. We’ll resume your search when the connection returns.'
    case 'timeout':
      return 'The search timed out. Check your connection and try again.'
    case 'rate-limit':
      return 'Too many requests right now. Wait a moment, then retry.'
    default:
      return 'Something went wrong with the search. Try again.'
  }
}

function onSubmit(): void {
  // Enter on a `type="search"` field submits — run the query without waiting for
  // the debounce. No-op when empty (the composable guards it).
  retry()
}
</script>

<template>
  <div class="w-market-search">
    <!-- Polite live region: announces loading / result count / offline (AC2.3). -->
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ announcement }}
    </div>

    <form class="w-market-search__form" role="search" @submit.prevent="onSubmit">
      <div class="w-market-search__field">
        <SJInput
          v-model="query"
          class="w-market-search__input"
          label="Search markets"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          placeholder="Search markets…"
        />
        <SJButton
          v-if="query.length > 0"
          class="w-market-search__clear"
          variant="ghost"
          icon-only
          aria-label="Clear search"
          @click="clear"
        >
          <span aria-hidden="true">×</span>
        </SJButton>
      </div>
    </form>

    <div class="w-market-search__results">
      <!-- Offline banner: distinct from a network error (AC2.8). -->
      <p v-if="isOffline" class="w-market-search__offline" role="status">
        You’re offline. Showing the latest markets we already loaded; search resumes when you’re
        back online.
      </p>

      <!-- Loading -->
      <WMarketList v-if="state.status === 'loading'" :state="state" />

      <!-- Error (incl. distinct offline error state) -->
      <div v-else-if="state.status === 'error'" class="w-market-search__panel">
        <p
          class="w-market-search__message"
          :role="state.error.kind === 'offline' ? 'status' : 'alert'"
        >
          {{ errorCopy(state.error) }}
        </p>
        <div class="w-market-search__actions">
          <SJButton v-if="state.error.kind !== 'offline'" variant="secondary" @click="retry"
            >Retry</SJButton
          >
          <SJButton v-if="query.length > 0" variant="ghost" @click="clear">Clear search</SJButton>
        </div>
        <!-- Never a dead end: keep the browse fallback in reach. -->
        <p class="w-market-search__fallback-title">Top markets by volume</p>
        <WMarketList :state="browseState" @select="emit('select', $event)" />
      </div>

      <!-- No results: echo + preserve the query, offer recovery (AC2.4). -->
      <div
        v-else-if="state.status === 'success' && state.data.length === 0"
        class="w-market-search__panel"
      >
        <p class="w-market-search__message" role="status">
          No markets match “<span class="w-market-search__echo">{{ query }}</span
          >”.
        </p>
        <div class="w-market-search__actions">
          <SJButton variant="secondary" @click="clear">Clear search</SJButton>
        </div>
        <p class="w-market-search__fallback-title">Top markets by volume</p>
        <WMarketList :state="browseState" @select="emit('select', $event)" />
      </div>

      <!-- Results -->
      <WMarketList
        v-else-if="state.status === 'success'"
        :state="state"
        @select="emit('select', $event)"
      />

      <!-- Idle (empty input) → browse the top markets. -->
      <div v-else class="w-market-search__panel">
        <p class="w-market-search__fallback-title">Top markets by volume</p>
        <WMarketList
          :state="browseState"
          empty-label="No markets available right now."
          @select="emit('select', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.w-market-search {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.w-market-search__field {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

.w-market-search__input {
  flex: 1;
  min-width: 0;
}

/* Nudge the clear control down so it aligns with the field, not the label. */
.w-market-search__clear {
  margin-bottom: var(--space-1);
}

.w-market-search__results {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.w-market-search__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.w-market-search__offline {
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
}

.w-market-search__message {
  font-size: var(--font-size-base);
  line-height: var(--leading-normal);
  color: var(--color-text-body);
}

.w-market-search__echo {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.w-market-search__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.w-market-search__fallback-title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}
</style>
