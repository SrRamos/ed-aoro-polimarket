<script setup lang="ts">
/**
 * WMarketList (T602 · AC3.1–AC3.5, NFR-MF-5 [D11], T7, C3, C5, C14) — renders a
 * `RequestState<Market[]>` as a compact SINGLE-COLUMN list inside the bounded
 * widget body (D11: the widget is a fixed-width card, never a multi-column page).
 *
 * - Single column at every size — the widget shell caps the inline-size and owns
 *   the scroll (`overflow-y:auto` on the body region), so the list stays a plain
 *   vertical stack of cards/rows. No multi-column grid (superseded by D11).
 * - `v-for` is keyed on `market.id` (C3) so Vue patches rather than re-mounts.
 * - Loading renders skeleton cards whose boxes mirror a real card (reserved
 *   image `aspect-ratio` + text lines) → no CLS when the data swaps in (T7).
 * - Beyond 50 rendered rows the list caps to 50 and reveals the rest via a
 *   "Show more" affordance (C5) rather than mounting an unbounded DOM. Search is
 *   already capped at `limit=50` upstream (T201.4); this guards browse/edge.
 * - Error / empty states are explicit; the richer no-results recovery lives in
 *   `WMarketSearch` (this list stays a dumb, reusable renderer).
 */
import { computed, ref, watch } from 'vue'
import type { Market } from '../../models/market'
import type { RequestState } from '../../models/request-state'
import WMarketCard from './WMarketCard.vue'
import SJSkeleton from '../ui/SJSkeleton.vue'
import SJButton from '../ui/SJButton.vue'

const props = withDefaults(
  defineProps<{
    state: RequestState<Market[]>
    /** Skeleton cards to show while loading (mirrors the grid shape). */
    skeletonCount?: number
    /** Copy for the explicit empty state. */
    emptyLabel?: string
  }>(),
  { skeletonCount: 6, emptyLabel: 'No markets to show.' },
)

const emit = defineEmits<{ (e: 'select', market: Market): void }>()

/** Render cap; "Show more" reveals the next page (C5). */
const PAGE = 50

const allMarkets = computed<Market[]>(() =>
  props.state.status === 'success' ? props.state.data : [],
)

const visibleCount = ref(PAGE)

// Reset the window whenever a fresh result set arrives.
watch(allMarkets, () => {
  visibleCount.value = PAGE
})

const visibleMarkets = computed(() => allMarkets.value.slice(0, visibleCount.value))
const hasMore = computed(() => allMarkets.value.length > visibleCount.value)
const remaining = computed(() => allMarkets.value.length - visibleCount.value)

function showMore(): void {
  visibleCount.value += PAGE
}

const skeletons = computed(() => Array.from({ length: props.skeletonCount }, (_, i) => i))
</script>

<template>
  <!-- Loading: skeleton grid mirrors real card height (no CLS). -->
  <ul v-if="state.status === 'loading'" class="w-market-list" aria-hidden="true">
    <li v-for="n in skeletons" :key="`sk-${n}`" class="w-market-list__cell">
      <div class="w-market-list__skeleton">
        <SJSkeleton height="var(--space-16)" radius="md" />
        <SJSkeleton width="90%" height="var(--space-5)" />
        <SJSkeleton width="60%" height="var(--space-4)" />
        <SJSkeleton width="100%" height="var(--space-2)" radius="pill" />
        <SJSkeleton width="40%" height="var(--space-4)" />
      </div>
    </li>
  </ul>

  <!-- Error: explicit, announced. -->
  <p v-else-if="state.status === 'error'" class="w-market-list__notice" role="alert">
    Couldn’t load markets. Try again in a moment.
  </p>

  <!-- Empty success. -->
  <p
    v-else-if="state.status === 'success' && allMarkets.length === 0"
    class="w-market-list__notice"
  >
    {{ emptyLabel }}
  </p>

  <!-- Results grid (keyed on market.id). -->
  <template v-else-if="state.status === 'success'">
    <ul class="w-market-list">
      <li v-for="market in visibleMarkets" :key="market.id" class="w-market-list__cell">
        <WMarketCard :market="market" @select="emit('select', market)" />
      </li>
    </ul>
    <div v-if="hasMore" class="w-market-list__more">
      <SJButton variant="secondary" @click="showMore"
        >Show {{ Math.min(PAGE, remaining) }} more</SJButton
      >
    </div>
  </template>
</template>

<style scoped>
.w-market-list {
  /* Compact single-column stack inside the bounded widget body (D11). */
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.w-market-list__cell {
  display: flex;
}

.w-market-list__cell > * {
  width: 100%;
}

.w-market-list__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.w-market-list__notice {
  font-size: var(--font-size-base);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}

.w-market-list__more {
  display: flex;
  justify-content: center;
  margin-top: var(--space-4);
}
</style>
