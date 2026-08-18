<script setup lang="ts">
import type { Market } from '../../models/market'
import type { ViewStatus } from '../../lib/status'
import WMarketCard from './WMarketCard.vue'
import SJCard from '../ui/SJCard.vue'
import SJSkeleton from '../ui/SJSkeleton.vue'
import SJButton from '../ui/SJButton.vue'
import SJLiveRegion from '../ui/SJLiveRegion.vue'

/**
 * Market list with the full 4-state model (design.md §5): loading (skeletons),
 * empty, error (+retry), success. Renders WMarketCard per market and hosts the
 * AI-pick panel via the `toolbar` slot.
 */
type WMarketListProps = {
  markets: Market[]
  status: ViewStatus
  heading: string
  emptyMessage?: string
  errorMessage?: string
  recommendedMarketId?: string | null
}
const props = withDefaults(defineProps<WMarketListProps>(), {
  emptyMessage: 'No markets to show.',
  errorMessage: 'Something went wrong loading markets.',
  recommendedMarketId: null,
})

type WMarketListEmits = {
  select: [market: Market]
  retry: []
}
const emit = defineEmits<WMarketListEmits>()
</script>

<template>
  <section class="wl" aria-labelledby="wl-heading">
    <div class="wl__bar">
      <h2 id="wl-heading" class="wl__heading">
        {{ heading }}
        <span v-if="status === 'success'" class="wl__count"
          >({{ markets.length }})</span
        >
      </h2>
      <slot name="toolbar" />
    </div>

    <SJLiveRegion
      :tone="status === 'error' ? 'assertive' : 'polite'"
      :message="
        status === 'loading'
          ? 'Loading markets'
          : status === 'error'
            ? errorMessage
            : status === 'empty'
              ? emptyMessage
              : status === 'success'
                ? `${markets.length} markets loaded`
                : ''
      "
    />

    <!-- Loading -->
    <div v-if="status === 'loading'" class="wl__grid" aria-hidden="true">
      <SJCard v-for="n in 3" :key="n">
        <div class="skel">
          <div class="skel__top">
            <SJSkeleton variant="block" width="var(--space-12)" height="var(--space-12)" />
            <div class="skel__lines">
              <SJSkeleton width="40%" />
              <SJSkeleton width="85%" height="var(--space-5)" />
            </div>
          </div>
          <SJSkeleton width="100%" />
          <SJSkeleton width="100%" />
          <SJSkeleton width="60%" />
        </div>
      </SJCard>
    </div>

    <!-- Error -->
    <SJCard v-else-if="status === 'error'">
      <div class="wl__state">
        <span class="wl__state-icon" aria-hidden="true">⚠️</span>
        <p class="wl__state-title">Couldn’t load markets</p>
        <p class="wl__state-text">{{ errorMessage }}</p>
        <SJButton variant="secondary" @click="emit('retry')">Retry</SJButton>
      </div>
    </SJCard>

    <!-- Empty -->
    <SJCard v-else-if="status === 'empty'">
      <div class="wl__state">
        <span class="wl__state-icon" aria-hidden="true">🔍</span>
        <p class="wl__state-title">No markets found</p>
        <p class="wl__state-text">{{ emptyMessage }}</p>
      </div>
    </SJCard>

    <!-- Success -->
    <div v-else-if="status === 'success'" class="wl__grid">
      <WMarketCard
        v-for="m in markets"
        :key="m.id"
        :market="m"
        :recommended="m.id === recommendedMarketId"
        @select="emit('select', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.wl {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.wl__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.wl__heading {
  font-family: var(--font-family-display);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.wl__count {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.wl__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

.skel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.skel__top {
  display: flex;
  gap: var(--space-4);
}

.skel__lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1 1 auto;
}

.wl__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

.wl__state-icon {
  font-size: var(--font-size-3xl);
}

.wl__state-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-heading);
}

.wl__state-text {
  max-width: 42ch;
  color: var(--color-text-secondary);
}

@media (min-width: 769px) {
  .wl__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1200px) {
  .wl__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
