<script setup lang="ts">
/**
 * WMarketDetail (T603 · AC4.1/AC4.4/AC4.7 · NFR-MF-5) — the selected market's
 * detail, whose PRESENTATION is responsive per NFR-MF-5 while its content stays
 * identical (WMarketDetailBody):
 *   - base / md (`inline === false`): an `SJModal` — a full-screen bottom sheet on
 *     mobile, a centered `role="dialog"` at md — with `aria-labelledby` (question),
 *     `aria-describedby` (summary), focus trap, Escape, backdrop dismissal, and
 *     focus-return to the invoking card (AC4.4/AC4.7). Dialog semantics apply ONLY
 *     in this mode.
 *   - lg+ (`inline === true`): an INLINE right-hand pane in the two-pane
 *     list+detail layout — a plain labelled `region`, NOT a modal (no dialog role,
 *     no focus trap). When nothing is selected it shows a quiet placeholder so the
 *     pane is never a dead space.
 *
 * The app shell (App.vue) owns the breakpoint decision and passes `inline`, so the
 * component never guesses the viewport itself.
 */
import { computed, useId } from 'vue'
import type { Market } from '../../models/market'
import type { BetReceipt } from '../../models/bet'
import type { BettingService } from '../../services/betting.service'
import type { RecordBetParams } from '../../stores/bets.store'
import type { UseAiPrediction } from '../../composables/useAiPrediction'
import { formatEndDate, formatUsdCompact } from '../../utils/format'
import SJModal from '../ui/SJModal.vue'
import WMarketDetailBody from './WMarketDetailBody.vue'

interface BetsRecorder {
  recordFilledBet(params: RecordBetParams): boolean
}

const props = defineProps<{
  /** The selected market, or `null` when nothing is selected (inline pane). */
  market: Market | null
  /** `true` → inline two-pane panel; falsy → modal / bottom sheet. */
  inline?: boolean
  bettingService?: BettingService
  betsRecorder?: BetsRecorder
  aiController?: UseAiPrediction
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-settings'): void
  (e: 'filled', payload: { receipt: BetReceipt; persisted: boolean }): void
}>()

/** Modal visibility (used only when `inline === false`). */
const open = defineModel<boolean>('open', { default: false })
/** Selected outcome index — shared with the store, forwarded to the bet form. */
const outcomeIndex = defineModel<number | null>('outcomeIndex', { default: null })

const uid = useId()
const titleId = `w-market-detail-${uid}-title`

/** Short summary for the dialog's `aria-describedby` (AC4.7). */
const summary = computed(() => {
  const m = props.market
  if (m === null) return ''
  return `Volume ${formatUsdCompact(m.volume)}. Closes ${formatEndDate(m.endDate)}.`
})

function onClose(): void {
  open.value = false
  emit('close')
}
</script>

<template>
  <!-- INLINE (lg two-pane): a labelled region, not a dialog. -->
  <section
    v-if="inline"
    class="w-market-detail w-market-detail--inline"
    :aria-labelledby="market ? titleId : undefined"
    aria-label="Market detail"
  >
    <template v-if="market">
      <header class="w-market-detail__head">
        <h2 :id="titleId" class="w-market-detail__title">{{ market.question }}</h2>
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
    </template>

    <!-- Nothing selected yet — a quiet placeholder, never a dead pane. -->
    <div v-else class="w-market-detail__placeholder">
      <p class="w-market-detail__placeholder-title">Select a market</p>
      <p class="w-market-detail__placeholder-body">
        Choose a market from the list to see its outcomes and place a simulated bet.
      </p>
    </div>
  </section>

  <!-- MODAL / SHEET (base & md): dialog semantics live here (AC4.7). -->
  <SJModal
    v-else-if="market"
    v-model:open="open"
    :title="market.question"
    describe
    close-label="Close market detail"
    @close="onClose"
  >
    <template #summary>{{ summary }}</template>
    <WMarketDetailBody
      v-model:outcome-index="outcomeIndex"
      :market="market"
      :betting-service="bettingService"
      :bets-recorder="betsRecorder"
      :ai-controller="aiController"
      @open-settings="emit('open-settings')"
      @filled="emit('filled', $event)"
    />
  </SJModal>
</template>

<style scoped>
.w-market-detail--inline {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.w-market-detail__head {
  display: flex;
}

.w-market-detail__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-snug);
  color: var(--color-text-heading);
}

.w-market-detail__placeholder {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-4);
  text-align: center;
}

.w-market-detail__placeholder-title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-heading);
}

.w-market-detail__placeholder-body {
  max-width: 40ch;
  margin-inline: auto;
  font-size: var(--font-size-base);
  line-height: var(--leading-relaxed);
  color: var(--color-text-secondary);
}
</style>
