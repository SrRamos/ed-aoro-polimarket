<script setup lang="ts">
/**
 * WBetForm (T604 · AC5.0.5/AC5.1/AC5.1a/AC5.2–AC5.5/AC5.8 · NFR-MF-4/NFR-A11Y-6)
 *
 * The bet-placement flow for a single market:
 *   - OUTCOME SELECTOR: binary markets use the success/error triad + TEXT + a
 *     selected-check (never colour alone, SC 1.4.1); >2-outcome markets use
 *     neutral chips (no forced Yes/No, AC4.6). A `role="radiogroup"` of toggle
 *     buttons; no-outcome blocks submission (AC5.5).
 *   - AMOUNT: `type="text"` + `inputmode="decimal"` (never `type="number"` for
 *     money), ≥16px via SJInput; invalid/≤0/over-max is blocked with an inline
 *     `aria-invalid` + `aria-describedby` error, shown only after blur (AC5.4/5.8).
 *   - LIVE MATH: cost = size×price and payout = (size/price)×$1 update as the
 *     amount changes (AC5.2/5.3), all via `utils/format.ts`.
 *   - FINITE GUARD: an outcome whose snapshot price is `<= 0` / non-finite blocks
 *     betting entirely (AC5.3) — the service rejects it too, but the UI never even
 *     offers it.
 *   - REVIEW → CONFIRM: `placeBet` is called ONLY after an explicit confirm step
 *     that restates amount / outcome / price(%) / payout (AC5.0.5).
 *   - IN-FLIGHT: the confirm control is disabled + `aria-busy` while the call is in
 *     flight, so a double-tap cannot file a duplicate (AC5.1a).
 *   - FAIL-SAFE: when the betting service is unavailable (`available === false`,
 *     e.g. `VITE_BET_MODE=real` with no adapter) the form renders disabled with the
 *     service's `unavailableReason` and never calls `placeBet` (C10 / AC9.5).
 *   - PERSIST: on a fill it records the position via the bets store; the store's
 *     boolean return is the source of truth — a bet that filled but couldn't be
 *     saved surfaces the "couldn't save locally" notice, never a false receipt
 *     (AC6.1). The primary CTA is a sticky bottom bar in the thumb zone on mobile
 *     (NFR-MF-4) with `env(safe-area-inset-bottom)` + reserved scroll padding so it
 *     never obscures the focused field (NFR-A11Y-6).
 *
 * Services/stores are injectable (props) so tests drive the flow with no Pinia and
 * no network.
 */
import { computed, ref } from 'vue'
import type { Market } from '../../models/market'
import type { AppError } from '../../models/errors'
import type { BetOrder, BetReceipt } from '../../models/bet'
import { formatPercent, formatUsd } from '../../utils/format'
import {
  BettingError,
  createBettingService,
  type BettingService,
} from '../../services/betting.service'
import { useBetsStore, type RecordBetParams } from '../../stores/bets.store'
import { useToast } from '../../composables/useToast'
import SJInput from '../ui/SJInput.vue'
import SJButton from '../ui/SJButton.vue'
import WBetReceipt from './WBetReceipt.vue'

/** Minimal recorder surface (the bets store satisfies it structurally). */
interface BetsRecorder {
  recordFilledBet(params: RecordBetParams): boolean
}

const props = defineProps<{
  market: Market
  /** Inject a betting service (defaults to `createBettingService()`). */
  bettingService?: BettingService
  /** Inject a recorder (defaults to the bets store). */
  betsRecorder?: BetsRecorder
  /** Optional maximum stake (e.g. a balance). No cap when omitted. */
  max?: number
}>()

const emit = defineEmits<{
  (e: 'filled', payload: { receipt: BetReceipt; persisted: boolean }): void
}>()

/** Selected outcome index — bindable by a parent detail, standalone otherwise. */
const outcomeIndex = defineModel<number | null>('outcomeIndex', { default: null })

// Resolve injectables lazily so passing a prop never touches Pinia (tests).
const service = props.bettingService ?? createBettingService()
const recorder: BetsRecorder = props.betsRecorder ?? useBetsStore()
const { addToast } = useToast()

type Phase = 'form' | 'review' | 'result'
const phase = ref<Phase>('form')
const submitting = ref(false)
const submitError = ref<AppError | null>(null)
const result = ref<{
  receipt: BetReceipt
  persisted: boolean
  outcome: string
  size: number
} | null>(null)

const amountRaw = ref('')
const amountTouched = ref(false)

// --- Betting availability (fail-safe) + closed-market guard -------------------
const serviceAvailable = computed(() => service.available)
const disabledReason = computed<string | null>(() => {
  if (!serviceAvailable.value) {
    return service.unavailableReason ?? 'Betting is unavailable right now.'
  }
  if (props.market.closed) return 'This market is closed — betting is no longer available.'
  return null
})
const bettingBlocked = computed(() => disabledReason.value !== null)

// --- Outcome model -----------------------------------------------------------
const isBinary = computed(() => props.market.outcomes.length === 2)

interface OutcomeChoice {
  index: number
  label: string
  price: number | null
  /** Usable = finite, positive price (AC5.3). */
  usable: boolean
}

const choices = computed<OutcomeChoice[]>(() =>
  props.market.outcomes.map((label, index) => {
    const raw = props.market.prices[index] ?? null
    const usable = raw !== null && Number.isFinite(raw) && raw > 0
    return { index, label, price: raw, usable }
  }),
)

function selectOutcome(index: number): void {
  outcomeIndex.value = index
  // Re-entering the form after a selection change resets a stale review/result.
  if (phase.value !== 'form') phase.value = 'form'
  submitError.value = null
}

const selectedChoice = computed<OutcomeChoice | null>(() => {
  const i = outcomeIndex.value
  if (i === null) return null
  return choices.value[i] ?? null
})

const priceUsable = computed(() => selectedChoice.value?.usable ?? false)

/** Distinct message when an outcome is picked but its price can't back a bet. */
const priceBlockMessage = computed<string | null>(() => {
  const c = selectedChoice.value
  if (c === null) return null
  if (!c.usable) return 'Betting isn’t available on this outcome — its price is unreliable.'
  return null
})

// --- Amount validation (AC5.4) ----------------------------------------------
/** Parsed amount: `null` when empty, `NaN` when unparseable, else the number. */
const parsedAmount = computed<number | null>(() => {
  const t = amountRaw.value.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
})

/** The reason the amount is invalid, or `null`. Independent of "touched". */
const amountValidationError = computed<string | null>(() => {
  const n = parsedAmount.value
  if (n === null) return 'Enter an amount greater than $0.'
  if (Number.isNaN(n)) return 'Enter a valid dollar amount (numbers only).'
  if (n <= 0) return 'Amount must be greater than $0.'
  if (props.max !== undefined && n > props.max) {
    return `Amount can’t exceed ${formatUsd(props.max)}.`
  }
  return null
})

/** Show the amount error only after the field has been interacted with. */
const shownAmountError = computed<string | undefined>(() =>
  amountTouched.value && amountValidationError.value !== null
    ? amountValidationError.value
    : undefined,
)

function onAmountBlur(): void {
  amountTouched.value = true
}

// --- Live cost / payout preview (AC5.2/5.3) ---------------------------------
const validAmount = computed<number | null>(() => {
  const n = parsedAmount.value
  if (n === null || Number.isNaN(n) || n <= 0) return null
  return n
})

const preview = computed<{ cost: number; shares: number; payout: number } | null>(() => {
  const amt = validAmount.value
  const price = selectedChoice.value?.price ?? null
  if (amt === null || price === null || !Number.isFinite(price) || price <= 0) return null
  const cost = amt * price
  const shares = amt / price
  const payout = shares * 1
  if (!Number.isFinite(cost) || !Number.isFinite(shares) || !Number.isFinite(payout)) return null
  return { cost, shares, payout }
})

// --- Gate: can we move to review? -------------------------------------------
const canReview = computed(
  () =>
    !bettingBlocked.value &&
    outcomeIndex.value !== null &&
    priceUsable.value &&
    amountValidationError.value === null &&
    preview.value !== null,
)

/** Prompt shown when the user tries to proceed without choosing an outcome. */
const noOutcomeHint = computed(() => outcomeIndex.value === null)

// --- Flow --------------------------------------------------------------------
function goReview(): void {
  amountTouched.value = true
  if (!canReview.value) return
  submitError.value = null
  phase.value = 'review'
}

function editBet(): void {
  phase.value = 'form'
  submitError.value = null
}

function betErrorCopy(e: AppError): string {
  switch (e.kind) {
    case 'validation':
      return 'That bet couldn’t be placed — check the amount and try again.'
    case 'sim-failure':
      return 'The bet couldn’t be completed. Please try again.'
    default:
      return 'Something went wrong placing the bet. Please try again.'
  }
}

async function confirmBet(): Promise<void> {
  // Double-submit guard (AC5.1a): ignore re-entry while a call is in flight.
  if (submitting.value) return
  const choice = selectedChoice.value
  const amt = validAmount.value
  if (choice === null || amt === null || !choice.usable || choice.price === null) return
  if (bettingBlocked.value) return // never call placeBet in the fail-safe state (C10)

  const order: BetOrder = {
    marketId: props.market.id,
    tokenId: props.market.tokenIds[choice.index] ?? '',
    outcome: choice.label,
    side: 'BUY',
    size: amt,
    price: choice.price,
  }

  submitting.value = true
  submitError.value = null
  try {
    const receipt = await service.placeBet(order)
    const persisted = recorder.recordFilledBet({
      marketId: props.market.id,
      question: props.market.question,
      outcome: choice.label,
      size: amt,
      price: choice.price,
      receipt,
    })
    result.value = { receipt, persisted, outcome: choice.label, size: amt }
    phase.value = 'result'
    if (persisted) {
      addToast({
        variant: 'success',
        message: `Bet filled: ${formatUsd(receipt.cost)} on ${choice.label}.`,
      })
    } else {
      // Filled but not saved — a truthful, non-blocking notice (AC6.1), never a
      // success receipt.
      addToast({
        variant: 'error',
        message: 'Bet placed, but it couldn’t be saved locally.',
      })
    }
    emit('filled', { receipt, persisted })
  } catch (err) {
    submitError.value =
      err instanceof BettingError ? err.error : { kind: 'sim-failure', message: 'unknown' }
  } finally {
    submitting.value = false
  }
}

function placeAnother(): void {
  phase.value = 'form'
  result.value = null
  submitError.value = null
  amountRaw.value = ''
  amountTouched.value = false
}
</script>

<template>
  <section class="w-bet-form" aria-labelledby="w-bet-form-title">
    <h3 id="w-bet-form-title" class="w-bet-form__title">Place a bet</h3>

    <!-- Polite status region for submit progress / outcome (AC5.6 backup). -->
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ submitting ? 'Placing your bet…' : '' }}
    </div>

    <!-- Fail-safe / closed: render disabled with a text reason; never call placeBet. -->
    <p v-if="bettingBlocked" class="w-bet-form__blocked" role="status">
      {{ disabledReason }}
    </p>

    <!-- RESULT: the filled receipt (or the couldn't-save notice via WBetReceipt). -->
    <template v-else-if="phase === 'result' && result">
      <WBetReceipt
        :receipt="result.receipt"
        :outcome="result.outcome"
        :size="result.size"
        :question="market.question"
        :save-error="!result.persisted"
      />
      <div class="w-bet-form__cta-bar">
        <SJButton block variant="primary" @click="placeAnother">Place another bet</SJButton>
      </div>
    </template>

    <!-- REVIEW: restate the bet and require an explicit confirm (AC5.0.5). -->
    <template v-else-if="phase === 'review' && selectedChoice && preview">
      <div class="w-bet-form__review" role="group" aria-labelledby="w-bet-form-review-title">
        <p id="w-bet-form-review-title" class="w-bet-form__review-title">Review your bet</p>
        <dl class="w-bet-form__summary">
          <div class="w-bet-form__summary-row">
            <dt class="w-bet-form__summary-term">Outcome</dt>
            <dd class="w-bet-form__summary-value">{{ selectedChoice.label }}</dd>
          </div>
          <div class="w-bet-form__summary-row">
            <dt class="w-bet-form__summary-term">Amount</dt>
            <dd class="w-bet-form__summary-value">{{ formatUsd(validAmount ?? 0) }}</dd>
          </div>
          <div class="w-bet-form__summary-row">
            <dt class="w-bet-form__summary-term">Snapshot price</dt>
            <dd class="w-bet-form__summary-value">
              {{ formatPercent(selectedChoice.price ?? 0) }}
            </dd>
          </div>
          <div class="w-bet-form__summary-row">
            <dt class="w-bet-form__summary-term">Cost</dt>
            <dd class="w-bet-form__summary-value">{{ formatUsd(preview.cost) }}</dd>
          </div>
          <div class="w-bet-form__summary-row">
            <dt class="w-bet-form__summary-term">Potential payout</dt>
            <dd class="w-bet-form__summary-value w-bet-form__summary-value--emphasis">
              {{ formatUsd(preview.payout) }}
            </dd>
          </div>
        </dl>

        <p v-if="submitError" class="w-bet-form__error" role="alert">
          {{ betErrorCopy(submitError) }}
        </p>

        <div class="w-bet-form__cta-bar">
          <div class="w-bet-form__cta-stack">
            <SJButton block variant="primary" :loading="submitting" @click="confirmBet">
              {{ submitError ? 'Try again' : 'Confirm & place bet' }}
            </SJButton>
            <SJButton block variant="ghost" :disabled="submitting" @click="editBet"
              >Edit bet</SJButton
            >
          </div>
        </div>
      </div>
    </template>

    <!-- FORM: outcome selector + amount + live math -->
    <form v-else class="w-bet-form__body" novalidate @submit.prevent="goReview">
      <fieldset class="w-bet-form__outcomes">
        <legend class="w-bet-form__legend">Choose an outcome</legend>
        <div class="w-bet-form__chips" role="radiogroup" aria-label="Outcome">
          <button
            v-for="choice in choices"
            :key="choice.label"
            type="button"
            role="radio"
            :aria-checked="outcomeIndex === choice.index"
            :disabled="!choice.usable"
            :class="[
              'w-bet-form__chip',
              isBinary ? `w-bet-form__chip--binary-${choice.index}` : 'w-bet-form__chip--neutral',
              { 'w-bet-form__chip--selected': outcomeIndex === choice.index },
            ]"
            @click="selectOutcome(choice.index)"
          >
            <span
              v-if="outcomeIndex === choice.index"
              class="w-bet-form__chip-check"
              aria-hidden="true"
              >✓</span
            >
            <span class="w-bet-form__chip-label">{{ choice.label }}</span>
            <span class="w-bet-form__chip-price">{{ formatPercent(choice.price ?? 0) }}</span>
          </button>
        </div>
        <p v-if="priceBlockMessage" class="w-bet-form__hint" role="status">
          {{ priceBlockMessage }}
        </p>
      </fieldset>

      <SJInput
        v-model="amountRaw"
        class="w-bet-form__amount"
        label="Amount (USD)"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        placeholder="0.00"
        :error="shownAmountError"
        help="How much to stake, in dollars."
        @blur="onAmountBlur"
      />

      <!-- Live cost/payout preview (AC5.2/5.3). -->
      <dl v-if="preview" class="w-bet-form__preview" aria-live="polite">
        <div class="w-bet-form__summary-row">
          <dt class="w-bet-form__summary-term">Cost</dt>
          <dd class="w-bet-form__summary-value">{{ formatUsd(preview.cost) }}</dd>
        </div>
        <div class="w-bet-form__summary-row">
          <dt class="w-bet-form__summary-term">Potential payout</dt>
          <dd class="w-bet-form__summary-value w-bet-form__summary-value--emphasis">
            {{ formatUsd(preview.payout) }}
          </dd>
        </div>
      </dl>

      <p v-if="noOutcomeHint" class="w-bet-form__hint">Choose an outcome to place a bet.</p>

      <div class="w-bet-form__cta-bar">
        <SJButton block type="submit" variant="primary" :disabled="!canReview">Review bet</SJButton>
      </div>
    </form>
  </section>
</template>

<style scoped>
.w-bet-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  /* Reserve space so the sticky CTA never hides the last field / focused control
     (NFR-A11Y-6). */
  padding-bottom: calc(var(--space-16) + env(safe-area-inset-bottom, 0px));
}

.w-bet-form__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.w-bet-form__blocked {
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
}

.w-bet-form__body,
.w-bet-form__review {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.w-bet-form__outcomes {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0;
  border: 0;
  margin: 0;
}

.w-bet-form__legend {
  padding: 0;
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-strong);
}

.w-bet-form__chips {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10ch, 1fr));
  gap: var(--space-2);
}

.w-bet-form__chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--space-12); /* 48px target */
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--easing-out);
}

.w-bet-form__chip:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.w-bet-form__chip:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-secondary);
  cursor: not-allowed;
}

@media (hover: hover) and (pointer: fine) {
  .w-bet-form__chip:not(:disabled):hover {
    border-color: var(--color-primary);
  }
}

/* Binary triad: index 0 = success (Yes), index 1 = error (No). Colour is paired
   with the outcome text + a check on selection (never colour alone, SC 1.4.1). */
.w-bet-form__chip--binary-0.w-bet-form__chip--selected {
  color: var(--color-success-text);
  background: var(--color-success-surface);
  border-color: var(--color-success-border);
}

.w-bet-form__chip--binary-1.w-bet-form__chip--selected {
  color: var(--color-error-text);
  background: var(--color-error-surface);
  border-color: var(--color-error-border);
}

/* >2 outcomes: neutral, non-committal selection (AC4.6). */
.w-bet-form__chip--neutral.w-bet-form__chip--selected {
  color: var(--color-primary-dark);
  background: var(--color-primary-surface);
  border-color: var(--color-primary);
}

.w-bet-form__chip-price {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.w-bet-form__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.w-bet-form__preview,
.w-bet-form__summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-surface-secondary);
  border-radius: var(--radius-md);
}

.w-bet-form__summary-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
}

.w-bet-form__summary-term {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.w-bet-form__summary-value {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-strong);
  font-variant-numeric: tabular-nums;
}

.w-bet-form__summary-value--emphasis {
  font-weight: var(--font-weight-bold);
  color: var(--color-primary-dark);
}

.w-bet-form__review-title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-heading);
}

.w-bet-form__error {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-error-text);
}

/* Sticky bottom CTA in the thumb zone on mobile (NFR-MF-4). */
.w-bet-form__cta-bar {
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky);
  padding: var(--space-3) 0;
  padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  background: var(--color-surface);
  border-top: 1px solid var(--color-border-subtle);
}

.w-bet-form__cta-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Desktop has a pointer — release the sticky/full-width constraints (NFR-MF-4). */
@media (min-width: 769px) {
  .w-bet-form {
    padding-bottom: 0;
  }

  .w-bet-form__cta-bar {
    position: static;
    padding-bottom: var(--space-3);
  }
}
</style>
