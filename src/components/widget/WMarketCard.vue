<script setup lang="ts">
import { computed } from 'vue'
import type { Market } from '../../models/market'
import { formatCompactCurrency, formatPercent } from '../../lib/format'
import { outcomeTone } from '../../lib/outcome'
import SJCard from '../ui/SJCard.vue'
import SJBadge from '../ui/SJBadge.vue'

/** Market card (design.md §3.2, AC3.2). Whole card is the click target. */
type WMarketCardProps = {
  market: Market
  recommended?: boolean
}
const props = withDefaults(defineProps<WMarketCardProps>(), {
  recommended: false,
})

type WMarketCardEmits = { select: [market: Market] }
const emit = defineEmits<WMarketCardEmits>()

/** Show at most the four leading outcomes on the card face. */
const shown = computed(() =>
  props.market.outcomes
    .map((label, i) => ({ label, price: props.market.prices[i] ?? 0, i }))
    .slice(0, 4),
)
const hiddenCount = computed(() => Math.max(0, props.market.outcomes.length - shown.value.length))
</script>

<template>
  <SJCard
    interactive
    :highlighted="recommended"
    :aria-label="`Open market: ${market.question}`"
    @click="emit('select', market)"
  >
    <div class="mc">
      <div class="mc__top">
        <span class="mc__avatar" aria-hidden="true">{{ market.image }}</span>
        <div class="mc__headings">
          <div class="mc__badges">
            <SJBadge tone="neutral">{{ market.category }}</SJBadge>
            <SJBadge v-if="market.closed" tone="warning" icon="●">Closed</SJBadge>
            <SJBadge v-else tone="success" icon="●">Open</SJBadge>
            <SJBadge v-if="market.pricingUnreliable" tone="error" icon="⚠"
              >Pricing unreliable</SJBadge
            >
          </div>
          <h3 class="mc__question">{{ market.question }}</h3>
        </div>
      </div>

      <ul class="mc__outcomes">
        <li v-for="o in shown" :key="o.i" class="oc">
          <div class="oc__head">
            <span class="oc__name">{{ o.label }}</span>
            <span class="oc__pct">{{ formatPercent(o.price) }}</span>
          </div>
          <div class="oc__track">
            <div
              class="oc__fill"
              :class="`oc__fill--${outcomeTone(o.label)}`"
              :style="{ width: formatPercent(o.price) }"
            />
          </div>
        </li>
        <li v-if="hiddenCount > 0" class="mc__more">
          +{{ hiddenCount }} more outcome{{ hiddenCount > 1 ? 's' : '' }}
        </li>
      </ul>

      <dl class="mc__stats">
        <div class="mc__stat">
          <dt>Volume</dt>
          <dd>{{ formatCompactCurrency(market.volume) }}</dd>
        </div>
        <div class="mc__stat">
          <dt>Liquidity</dt>
          <dd>{{ formatCompactCurrency(market.liquidity) }}</dd>
        </div>
        <div v-if="recommended" class="mc__stat mc__stat--pick">
          <dt class="sr-only">AI</dt>
          <dd><SJBadge tone="primary" icon="✨">AI pick</SJBadge></dd>
        </div>
      </dl>
    </div>
  </SJCard>
</template>

<style scoped>
.mc {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.mc__top {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}

.mc__avatar {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--space-12);
  height: var(--space-12);
  font-size: var(--font-size-2xl);
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.mc__headings {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.mc__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.mc__question {
  font-family: var(--font-family-display);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-snug);
  color: var(--color-text-heading);
}

.mc__outcomes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.oc__head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-1);
}

.oc__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-strong);
}

.oc__pct {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-heading);
}

.oc__track {
  height: var(--space-2);
  background: var(--color-surface-hover);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.oc__fill {
  height: 100%;
  border-radius: var(--radius-pill);
  transition: width var(--duration-normal) var(--easing-out);
}

.oc__fill--success {
  background: var(--color-success);
}

.oc__fill--error {
  background: var(--color-error);
}

.oc__fill--primary {
  background: var(--color-primary);
}

.mc__more {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.mc__stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
  margin: 0;
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.mc__stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.mc__stat dt {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--color-text-secondary);
}

.mc__stat dd {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-strong);
}

.mc__stat--pick {
  margin-left: auto;
  justify-content: center;
}

@media (prefers-reduced-motion: reduce) {
  .oc__fill {
    transition: none;
  }
}
</style>
