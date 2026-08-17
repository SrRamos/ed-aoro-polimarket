<script setup lang="ts">
/**
 * WMarketDetail (T603 · AC4.1/AC4.4/AC4.5/AC4.6/AC4.7 · NFR-MF-5 [D11]) — the
 * selected market's detail, rendered as a COMPACT IN-WIDGET VIEW (D11).
 *
 * Per Decision D11 (docs/widget-form-factor.md) the detail is NO LONGER a
 * modal/bottom-sheet or a two-pane inline panel. The widget is a bounded card
 * with an internal view-stack, so the detail is one step of that stack:
 *   - A labelled `region` (NOT a dialog — dialog semantics now belong only to the
 *     Settings modal, owned by the widget shell).
 *   - A BACK affordance (`emit('back')`) returns to the browse view; the shell
 *     restores scroll/focus.
 *   - Focus moves to the detail heading on open (and whenever the selected market
 *     changes) so keyboard users land in the new content — a handoff, not a trap.
 *   - Composes the shared `WMarketDetailBody` (outcomes overview + WBetForm +
 *     WAiPrediction), keeping the >2-outcome neutral chips, the closed/inactive
 *     notice, and all formatting unchanged.
 *
 * The shell only ever mounts this view when a market is selected, so `market` is
 * always present here.
 */
import { computed, nextTick, onMounted, useId, useTemplateRef, watch } from 'vue'
import type { Market } from '../../models/market'
import type { BetReceipt } from '../../models/bet'
import type { BettingService } from '../../services/betting.service'
import type { RecordBetParams } from '../../stores/bets.store'
import type { UseAiPrediction } from '../../composables/useAiPrediction'
import { formatEndDate, formatUsdCompact } from '../../utils/format'
import SJButton from '../ui/SJButton.vue'
import WMarketDetailBody from './WMarketDetailBody.vue'

interface BetsRecorder {
  recordFilledBet(params: RecordBetParams): boolean
}

const props = defineProps<{
  /** The selected market. The shell mounts this view only when one is selected. */
  market: Market
  bettingService?: BettingService
  betsRecorder?: BetsRecorder
  aiController?: UseAiPrediction
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'open-settings'): void
  (e: 'filled', payload: { receipt: BetReceipt; persisted: boolean }): void
}>()

/** Selected outcome index — shared with the store, forwarded to the bet form. */
const outcomeIndex = defineModel<number | null>('outcomeIndex', { default: null })

const uid = useId()
const titleId = `w-market-detail-${uid}-title`

/** Short one-line summary shown under the heading. */
const summary = computed(
  () =>
    `Volume ${formatUsdCompact(props.market.volume)} · Closes ${formatEndDate(props.market.endDate)}`,
)

// Focus handoff: move focus to the region heading when the view opens and whenever
// the selected market changes — WITHOUT a focus trap (that belongs to the Settings
// modal, owned by the shell). `tabindex=-1` keeps the heading out of the tab order.
const headingRef = useTemplateRef<HTMLElement>('headingRef')
async function focusHeading(): Promise<void> {
  await nextTick()
  headingRef.value?.focus()
}
onMounted(focusHeading)
watch(
  () => props.market.id,
  (id, prev) => {
    if (id !== prev) void focusHeading()
  },
)
</script>

<template>
  <section class="w-market-detail" :aria-labelledby="titleId" aria-label="Market detail">
    <div class="w-market-detail__bar">
      <SJButton variant="ghost" size="sm" class="w-market-detail__back" @click="emit('back')">
        <span aria-hidden="true">←</span> Back
      </SJButton>
    </div>

    <header class="w-market-detail__head">
      <!-- tabindex=-1: programmatically focusable for the browse→detail handoff,
           but kept out of the tab order (not a control). -->
      <h2 :id="titleId" ref="headingRef" tabindex="-1" class="w-market-detail__title">
        {{ market.question }}
      </h2>
      <p class="w-market-detail__summary">{{ summary }}</p>
    </header>

    <WMarketDetailBody
      v-model:outcome-index="outcomeIndex"
      :market="market"
      :betting-service="bettingService"
      :bets-recorder="betsRecorder"
      :ai-controller="aiController"
      @open-settings="emit('open-settings')"
      @filled="emit('filled', $event)"
    />
  </section>
</template>

<style scoped>
.w-market-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.w-market-detail__bar {
  display: flex;
}

/* Pull the ghost back-button's padding to the edge so it aligns with the body. */
.w-market-detail__back {
  margin-inline-start: calc(-1 * var(--space-3));
}

.w-market-detail__head {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.w-market-detail__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-snug);
  color: var(--color-text-heading);
}

.w-market-detail__title:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
  border-radius: var(--radius-sm);
}

.w-market-detail__summary {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
