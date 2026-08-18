<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { Market } from './models/market'
import type { BetOrder } from './models/bet'
import type { AiPrediction, AiMarketPick } from './models/prediction'
import type { ViewStatus } from './lib/status'
import { useMarketsStore } from './stores/markets.store'
import { useBetsStore } from './stores/bets.store'
import { useSettingsStore } from './stores/settings.store'
import { getBuilderConfig } from './config/builder.config'
import {
  predictOutcome,
  recommendMarket,
  isAiConfigured,
  sampleOutcome,
  sampleMarketPick,
} from './services/openrouter.service'
import WMarketSearch from './components/widget/WMarketSearch.vue'
import WMarketList from './components/widget/WMarketList.vue'
import WMarketDetail from './components/widget/WMarketDetail.vue'
import WPositions from './components/widget/WPositions.vue'
import WAiMarketPick from './components/widget/WAiMarketPick.vue'
import WBetReceipt from './components/widget/WBetReceipt.vue'
import SJBadge from './components/ui/SJBadge.vue'

/* ---------------------------------------------------------------- *
 * Wave 2: betting and AI are now REAL services behind Pinia stores.
 *  - Market data → markets store (real Gamma read, fixture fallback).
 *  - Betting → bets store → MockBettingService (builder-aware), positions
 *    persisted to localStorage.
 *  - AI → openrouter.service (REAL OpenRouter call when env-configured; a
 *    labelled sample when the toggle is on but no env config is present).
 *  - Settings → settings store: just an `aiEnabled` toggle, persisted to
 *    localStorage. The key + model are deploy-time env config, never here.
 * Widgets keep the same props/events — only the wiring changed.
 * ---------------------------------------------------------------- */

const marketsStore = useMarketsStore()
const betsStore = useBetsStore()
const settingsStore = useSettingsStore()
const { usingFallback } = storeToRefs(marketsStore)
const { positions } = storeToRefs(betsStore)
const { aiEnabled } = storeToRefs(settingsStore)

/** AI is env-configured (key + model present). Fixed for the session/build. */
const aiConfigured = isAiConfigured()

/** Builder/fee config resolved from env/settings (placeholder default). */
const builderConfig = computed(() =>
  getBuilderConfig(
    settingsStore.builderCodeOverride
      ? { builderCode: settingsStore.builderCodeOverride }
      : undefined,
  ),
)

/* --- Dev demo controls (audit aid; kept out of the main look) --- */
type DemoState = 'auto' | 'loading' | 'empty' | 'error'
const demoState = ref<DemoState>('auto')
const forceAiError = ref(false)

/* --- Search / browse (driven by the store) --- */
const query = ref('')

// Dev override still wins so the auditor can inspect each state.
const listStatus = computed<ViewStatus>(() =>
  demoState.value !== 'auto' ? demoState.value : marketsStore.listStatus,
)

const displayedMarkets = computed<Market[]>(() =>
  listStatus.value === 'success' ? marketsStore.displayedMarkets : [],
)

const activeQuery = computed(() => marketsStore.query)

const listHeading = computed(() =>
  activeQuery.value.trim() ? 'Search results' : 'Top markets by volume',
)
const listEmptyMessage = computed(() =>
  activeQuery.value.trim()
    ? `No markets matched “${activeQuery.value.trim()}”. Try another term or clear the search.`
    : 'No active markets right now. Check back soon.',
)

function onSearch(q: string) {
  marketsStore.search(q)
}

function onRetry() {
  marketsStore.retry()
}

/* --- Detail / outcome selection --- */
const detailOpen = ref(false)
const selectedMarket = ref<Market | null>(null)
const selectedIndex = ref<number | null>(null)
const betFormResetKey = ref(0)

function selectMarket(market: Market) {
  selectedMarket.value = market
  marketsStore.selectMarket(market)
  selectedIndex.value = null
  betError.value = null
  aiStatus.value = 'idle'
  aiPrediction.value = null
  aiIsSample.value = false
  aiError.value = null
  detailOpen.value = true
}

function selectOutcome(index: number) {
  selectedIndex.value = index
  betError.value = null
}

function closeDetail() {
  detailOpen.value = false
}

/* --- Bet placement (real MockBettingService via the bets store) --- */
const submitting = ref(false)
const betError = ref<string | null>(null)

/* --- Receipt toast --- */
const receiptVisible = ref(false)
const receiptOutcome = ref('')
const receiptSize = ref(0)
const receiptTotal = ref(0)
const receiptTx = ref('')
let receiptTimer: ReturnType<typeof setTimeout> | undefined

async function placeBet(order: BetOrder) {
  const market = selectedMarket.value
  if (!market) return
  submitting.value = true
  betError.value = null
  try {
    const position = await betsStore.placeBet(order, {
      marketQuestion: market.question,
    })
    const receipt = position.receipt

    // Surface the receipt toast + reset the form, then close the detail.
    receiptOutcome.value = order.outcome
    receiptSize.value = order.size
    receiptTotal.value = receipt.fees.total
    receiptTx.value = receipt.txHash
    receiptVisible.value = true
    if (receiptTimer) clearTimeout(receiptTimer)
    receiptTimer = setTimeout(() => (receiptVisible.value = false), 6000)

    betFormResetKey.value += 1
    detailOpen.value = false
  } catch (err) {
    // Positions store is left unchanged on failure (AC5.7).
    betError.value =
      err instanceof Error ? err.message : 'The bet could not be placed. Please retry.'
  } finally {
    submitting.value = false
  }
}

function dismissReceipt() {
  receiptVisible.value = false
  if (receiptTimer) clearTimeout(receiptTimer)
}

/* --- AI outcome suggestion (US7) — REAL OpenRouter call when env-configured,
       a labelled sample otherwise; gated by the aiEnabled toggle --- */
const aiStatus = ref<ViewStatus>('idle')
const aiPrediction = ref<AiPrediction | null>(null)
const aiIsSample = ref(false)
const aiError = ref<string | null>(null)

async function requestAiPrediction() {
  const market = selectedMarket.value
  if (!market || !aiEnabled.value) return

  // No env config → labelled sample suggestion, never a network call.
  if (!aiConfigured) {
    aiPrediction.value = sampleOutcome(market)
    aiIsSample.value = true
    aiError.value = null
    aiStatus.value = 'success'
    return
  }

  aiStatus.value = 'loading'
  aiError.value = null
  aiPrediction.value = null
  aiIsSample.value = false

  // Dev aid: preview the error state without a live model call.
  if (forceAiError.value) {
    aiError.value = 'Forced AI error (dev control). Please retry.'
    aiStatus.value = 'error'
    return
  }

  try {
    aiPrediction.value = await predictOutcome(market)
    aiStatus.value = 'success'
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : 'The AI request failed. Please retry.'
    aiStatus.value = 'error'
  }
}

/* --- AI market pick (US9) — REAL OpenRouter call over the visible list when
       env-configured, a labelled sample otherwise --- */
const ampStatus = ref<ViewStatus>('idle')
const ampPick = ref<AiMarketPick | null>(null)
const ampIsSample = ref(false)
const ampError = ref<string | null>(null)

const recommendedMarketId = computed(() =>
  ampStatus.value === 'success' && ampPick.value ? ampPick.value.recommendedMarketId : null,
)
const recommendedQuestion = computed(() => {
  const id = recommendedMarketId.value
  return id ? (marketsStore.displayedMarkets.find((m) => m.id === id)?.question ?? null) : null
})

async function requestAiMarketPick() {
  const markets = displayedMarkets.value
  if (!aiEnabled.value || markets.length === 0) return

  // No env config → labelled sample pick, never a network call.
  if (!aiConfigured) {
    ampPick.value = sampleMarketPick(markets)
    ampIsSample.value = true
    ampError.value = null
    ampStatus.value = 'success'
    return
  }

  ampStatus.value = 'loading'
  ampError.value = null
  ampPick.value = null
  ampIsSample.value = false

  if (forceAiError.value) {
    ampError.value = 'Forced AI error (dev control). Please retry.'
    ampStatus.value = 'error'
    return
  }

  try {
    ampPick.value = await recommendMarket(markets)
    ampStatus.value = 'success'
  } catch (err) {
    ampError.value = err instanceof Error ? err.message : 'The AI request failed. Please retry.'
    ampStatus.value = 'error'
  }
}

function dismissAmp() {
  ampStatus.value = 'idle'
  ampPick.value = null
  ampIsSample.value = false
  ampError.value = null
}

/* --- AI toggle (persisted in the settings store) --- */
const aiStatusLabel = computed(() => (aiConfigured ? 'AI ready' : 'AI unavailable'))

function onToggleAi(enabled: boolean) {
  settingsStore.setAiEnabled(enabled)
  if (!enabled) {
    // Reset AI states when turning the feature off.
    aiStatus.value = 'idle'
    aiPrediction.value = null
    aiIsSample.value = false
    aiError.value = null
    dismissAmp()
  }
}

/* --- Lifecycle --- */
onMounted(() => marketsStore.loadDefaultList())
onBeforeUnmount(() => {
  if (receiptTimer) clearTimeout(receiptTimer)
})
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>

  <div class="app">
    <header class="app__header">
      <div class="app__brand">
        <span class="app__logo" aria-hidden="true">◆</span>
        <div>
          <h1 class="app__title">Polymarket Widget</h1>
          <p class="app__tagline">
            Search prediction markets, place a builder-aware simulated bet, and track positions.
          </p>
        </div>
      </div>

      <div class="app__actions">
        <label class="ai-toggle">
          <input
            class="ai-toggle__input"
            type="checkbox"
            role="switch"
            :checked="aiEnabled"
            @change="onToggleAi(($event.target as HTMLInputElement).checked)"
          />
          <span class="ai-toggle__track" aria-hidden="true">
            <span class="ai-toggle__thumb" />
          </span>
          <span class="ai-toggle__text">
            <span class="ai-toggle__label">Enable AI</span>
            <span v-if="aiEnabled" class="ai-toggle__status">{{ aiStatusLabel }}</span>
          </span>
        </label>
      </div>
    </header>

    <!-- Dev demo controls (audit aid) -->
    <details class="demo">
      <summary class="demo__summary">Demo controls (dev)</summary>
      <div class="demo__body">
        <div class="demo__field">
          <label class="demo__label" for="demo-state">List state</label>
          <select id="demo-state" v-model="demoState" class="demo__select">
            <option value="auto">Auto (populated / empty)</option>
            <option value="loading">Loading (skeletons)</option>
            <option value="empty">Empty</option>
            <option value="error">Error + retry</option>
          </select>
        </div>
        <label class="demo__check">
          <input v-model="forceAiError" type="checkbox" />
          Force AI error state
        </label>
      </div>
    </details>

    <main id="main" class="app__main">
      <WMarketSearch v-model:query="query" @search="onSearch" />

      <WAiMarketPick
        :enabled="aiEnabled"
        :configured="aiConfigured"
        :status="ampStatus"
        :pick="ampPick"
        :recommended-question="recommendedQuestion"
        :sample="ampIsSample"
        :error-message="ampError ?? undefined"
        @request="requestAiMarketPick"
        @retry="requestAiMarketPick"
        @dismiss="dismissAmp"
      />

      <p v-if="usingFallback" class="app__fallback" role="status">
        <SJBadge tone="warning" icon="⚠">Sample data</SJBadge>
        <span>Showing sample data — live Polymarket is unreachable right now.</span>
      </p>

      <WMarketList
        :markets="displayedMarkets"
        :status="listStatus"
        :heading="listHeading"
        :empty-message="listEmptyMessage"
        error-message="Couldn’t reach the markets service. Check your connection and retry."
        :recommended-market-id="recommendedMarketId"
        @select="selectMarket"
        @retry="onRetry"
      />

      <WPositions :positions="positions" />
    </main>

    <footer class="app__footer">
      <p>
        Demo build · market data is real (Polymarket Gamma, sample fallback if unreachable) · bets
        are simulated (mock <code>BettingService</code>) · AI is opt-in via the Enable AI toggle
        (configured by deployment). Not financial advice.
      </p>
    </footer>
  </div>

  <!-- Overlays -->
  <WMarketDetail
    :open="detailOpen"
    :market="selectedMarket"
    :selected-index="selectedIndex"
    :submitting="submitting"
    :bet-error="betError"
    :builder-config="builderConfig"
    :reset-key="betFormResetKey"
    :ai-enabled="aiEnabled"
    :ai-configured="aiConfigured"
    :ai-status="aiStatus"
    :ai-prediction="aiPrediction"
    :ai-sample="aiIsSample"
    :ai-error="aiError"
    @close="closeDetail"
    @select-outcome="selectOutcome"
    @place="placeBet"
    @ai-request="requestAiPrediction"
    @ai-retry="requestAiPrediction"
  />

  <WBetReceipt
    :visible="receiptVisible"
    :outcome="receiptOutcome"
    :size="receiptSize"
    :total="receiptTotal"
    :tx-hash="receiptTx"
    @dismiss="dismissReceipt"
  />
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: var(--breakpoint-2xl);
  min-height: 100vh;
  margin: 0 auto;
  padding: var(--space-4);
}

.app__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding-block: var(--space-2);
}

.app__brand {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.app__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--space-10);
  height: var(--space-10);
  font-size: var(--font-size-lg);
  color: var(--color-surface);
  background: var(--color-primary);
  border-radius: var(--radius-md);
}

.app__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-tight);
  color: var(--color-text-heading);
}

.app__tagline {
  max-width: 52ch;
  margin-top: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.app__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.ai-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
}

/* Visually-hidden native checkbox — keeps semantics + keyboard behaviour. */
.ai-toggle__input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.ai-toggle__track {
  position: relative;
  flex: 0 0 auto;
  width: calc(var(--space-10) + var(--space-1));
  height: var(--space-6);
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-pill);
  transition: background var(--duration-fast) var(--easing-out);
}

.ai-toggle__thumb {
  position: absolute;
  top: 50%;
  left: var(--space-1);
  width: var(--space-4);
  height: var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-sm);
  transform: translateY(-50%);
  transition: transform var(--duration-fast) var(--easing-out);
}

.ai-toggle__input:checked + .ai-toggle__track {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.ai-toggle__input:checked + .ai-toggle__track .ai-toggle__thumb {
  transform: translate(var(--space-5), -50%);
}

.ai-toggle__input:focus-visible + .ai-toggle__track {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.ai-toggle__text {
  display: flex;
  flex-direction: column;
  line-height: var(--leading-tight);
}

.ai-toggle__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.ai-toggle__status {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

@media (prefers-reduced-motion: reduce) {
  .ai-toggle__track,
  .ai-toggle__thumb {
    transition: none;
  }
}

.demo {
  font-size: var(--font-size-sm);
  background: var(--color-surface);
  border: 1px dashed var(--color-border-light);
  border-radius: var(--radius-md);
}

.demo__summary {
  padding: var(--space-2) var(--space-4);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.demo__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border-top: 1px dashed var(--color-border-light);
}

.demo__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.demo__label {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.demo__select {
  min-height: var(--space-10);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-strong);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
}

.demo__select:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.demo__check {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-strong);
}

.app__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  flex: 1 1 auto;
}

.app__fallback {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  margin-bottom: calc(var(--space-6) * -1 + var(--space-2));
  font-size: var(--font-size-sm);
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
}

.app__footer {
  padding-top: var(--space-4);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  border-top: 1px solid var(--color-border-subtle);
}

.app__footer code {
  font-family: var(--font-family-alt);
}

@media (min-width: 769px) {
  .app {
    padding: var(--space-8);
  }

  .app__title {
    font-size: var(--font-size-3xl);
  }
}
</style>
