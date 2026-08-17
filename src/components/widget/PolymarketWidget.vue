<script setup lang="ts">
/**
 * PolymarketWidget (D11 · docs/widget-form-factor.md) — the compact, self-contained,
 * EMBEDDABLE widget shell. It replaces the old full-page markets index: a bounded
 * DS card (`max-inline-size: 28rem`, fluid to `width:100%` below that) that lives
 * inside a host page and drives an INTERNAL view-stack — no two-pane, no full-bleed.
 *
 * It owns four things and delegates the rest to the reused `W*`/`SJ*` parts:
 *
 *   1. THE BOUNDED CARD: `--color-surface` + `--radius-lg` + `--shadow-md`, a header
 *      (title + Settings gear), a compact segmented nav (Markets / Positions), and a
 *      scrolling body (`overflow-y:auto`, bounded `max-block-size`) that holds one
 *      view at a time. The persistent "bets are simulated" note lives in the footer.
 *   2. THE VIEW-STACK (§D11): `browse` (WMarketSearch → compact single-column list) →
 *      `detail` (WMarketDetail: back → outcomes + WBetForm + WAiPrediction) with a
 *      `positions` view reachable from the nav. Selecting a market pushes `detail`;
 *      Back pops to `browse`, restoring the body scroll and returning focus to the
 *      card that opened it (sane focus/scroll restoration).
 *   3. DATA FLOW (unchanged logic layer): `useMarketSearch` → `markets.setSearchState`
 *      (store = single source of truth) → select → `markets.selectMarket` → detail;
 *      outcome selection round-trips through the store (AC4.3); the shared AI
 *      controller is reused across renders.
 *   4. SETTINGS as the ONLY modal: an `SJModal` scoped over the widget (dialog
 *      semantics live here, per D11's AC4.7 reconciliation), opened from the header
 *      gear and from the AI panel's no-key CTA.
 *
 * Injectables (`searchController` / `bettingService` / `aiController`) let the tests
 * drive the assembled flow with no live network.
 */
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { Market } from '../../models/market'
import type { BettingService } from '../../services/betting.service'
import { useMarketSearch, type UseMarketSearch } from '../../composables/useMarketSearch'
import { useAiPrediction, type UseAiPrediction } from '../../composables/useAiPrediction'
import { useMarketsStore } from '../../stores/markets.store'
import SJButton from '../ui/SJButton.vue'
import SJModal from '../ui/SJModal.vue'
import WMarketSearch from './WMarketSearch.vue'
import WMarketDetail from './WMarketDetail.vue'
import WPositions from './WPositions.vue'
import WSettings from './WSettings.vue'

const props = withDefaults(
  defineProps<{
    /** Inject a search controller (tests) — otherwise a live one is created. */
    searchController?: UseMarketSearch
    /** Inject a betting service (tests) — forwarded to the bet form. */
    bettingService?: BettingService
    /** Inject an AI controller (tests) — forwarded to the AI panel. */
    aiController?: UseAiPrediction
  }>(),
  {
    searchController: undefined,
    bettingService: undefined,
    aiController: undefined,
  },
)

const markets = useMarketsStore()
const { selectedMarket, selectedOutcomeIndex } = storeToRefs(markets)

// Search orchestration → push settled state into the store (single source of truth).
const search = props.searchController ?? useMarketSearch()
watch(search.state, (state) => markets.setSearchState(state), { immediate: true })

// A shared AI controller so the detail reuses one instance across renders.
const ai = props.aiController ?? useAiPrediction()

// --- Internal view-stack (D11) ---------------------------------------------------
type View = 'browse' | 'detail' | 'positions'
const view = ref<View>('browse')

/** The body element — we save/restore its scroll across the browse⇄detail step. */
const bodyRef = useTemplateRef<HTMLElement>('bodyRef')
let savedScrollTop = 0
/** The control that opened the detail — focus returns here on Back. */
let lastTrigger: HTMLElement | null = null

function onSelectMarket(market: Market): void {
  lastTrigger = document.activeElement as HTMLElement | null
  savedScrollTop = bodyRef.value?.scrollTop ?? 0
  markets.selectMarket(market)
  view.value = 'detail'
  // New content scrolls from the top; WMarketDetail moves focus to its heading.
  void nextTick(() => {
    if (bodyRef.value) bodyRef.value.scrollTop = 0
  })
}

function backToBrowse(): void {
  markets.clearSelection()
  view.value = 'browse'
  void nextTick(() => {
    if (bodyRef.value) bodyRef.value.scrollTop = savedScrollTop
    // Return focus to the card that opened the detail, if it is still mounted.
    if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus()
    lastTrigger = null
  })
}

/** Segmented nav: switch between the browse and positions views. */
function showBrowse(): void {
  if (view.value === 'browse') return
  markets.clearSelection()
  view.value = 'browse'
}
function showPositions(): void {
  view.value = 'positions'
}

/** WPositions "browse markets" CTA → go to browse and focus the search input. */
const browseRef = useTemplateRef<HTMLElement>('browseRef')
function focusSearch(): void {
  view.value = 'browse'
  void nextTick(() => {
    const input = browseRef.value?.querySelector('input')
    if (input) {
      input.focus()
      input.scrollIntoView({ block: 'center' })
    }
  })
}

/** Outcome selection round-trips through the store seam (AC4.3). */
const outcomeIndex = computed<number | null>({
  get: () => selectedOutcomeIndex.value,
  set: (v) => {
    if (v === null) markets.selectedOutcomeIndex = null
    else markets.selectOutcome(v)
  },
})

// --- Settings (the only modal, per D11's AC4.7 reconciliation) -------------------
const settingsOpen = ref(false)
function openSettings(): void {
  settingsOpen.value = true
}
</script>

<template>
  <section class="widget" aria-labelledby="widget-title">
    <header class="widget__header">
      <h2 id="widget-title" class="widget__title">Polymarket</h2>
      <SJButton
        variant="ghost"
        icon-only
        size="sm"
        aria-label="Open settings"
        @click="openSettings"
      >
        <span aria-hidden="true">⚙</span>
      </SJButton>
    </header>

    <!-- Segmented nav — hidden inside the detail step (which carries its own Back). -->
    <nav v-if="view !== 'detail'" class="widget__nav" aria-label="Widget views">
      <button
        type="button"
        class="widget__tab"
        :class="{ 'widget__tab--active': view === 'browse' }"
        :aria-current="view === 'browse' ? 'page' : undefined"
        @click="showBrowse"
      >
        Markets
      </button>
      <button
        type="button"
        class="widget__tab"
        :class="{ 'widget__tab--active': view === 'positions' }"
        :aria-current="view === 'positions' ? 'page' : undefined"
        @click="showPositions"
      >
        Positions
      </button>
    </nav>

    <div ref="bodyRef" class="widget__body">
      <!-- BROWSE: search + compact single-column list. -->
      <div v-show="view === 'browse'" ref="browseRef">
        <WMarketSearch :controller="search" @select="onSelectMarket" />
      </div>

      <!-- DETAIL: in-widget view with Back → outcomes + bet form + AI (no dialog). -->
      <WMarketDetail
        v-if="view === 'detail' && selectedMarket"
        v-model:outcome-index="outcomeIndex"
        :market="selectedMarket"
        :betting-service="bettingService"
        :ai-controller="ai"
        @back="backToBrowse"
        @open-settings="openSettings"
      />

      <!-- POSITIONS: compact positions view reachable from the nav. -->
      <WPositions v-if="view === 'positions'" @browse="focusSearch" />
    </div>

    <footer class="widget__footer">
      <p class="widget__sim" role="note">
        <span aria-hidden="true">ⓘ</span> Bets here are <strong>simulated</strong> — no real funds
        are ever involved.
      </p>
    </footer>

    <!-- Settings dialog (US8) — the ONLY modal, scoped over the widget (D11 AC4.7). -->
    <SJModal v-model:open="settingsOpen" title="Settings" close-label="Close settings">
      <WSettings />
    </SJModal>
  </section>
</template>

<style scoped>
.widget {
  display: flex;
  flex-direction: column;
  /* Bounded, embeddable card: fluid to full width, capped at ~448px (D11). */
  inline-size: 100%;
  max-inline-size: 28rem;
  max-block-size: min(85dvh, 44rem);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.widget__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
}

.widget__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-tight);
  color: var(--color-text-heading);
}

.widget__nav {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
}

.widget__tab {
  flex: 1;
  min-height: var(--space-8);
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--duration-fast) var(--easing-out);
}

.widget__tab:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.widget__tab--active {
  color: var(--color-primary-dark);
  background: var(--color-primary-surface);
  border-color: var(--color-border);
}

@media (hover: hover) and (pointer: fine) {
  .widget__tab:not(.widget__tab--active):hover {
    color: var(--color-text-strong);
  }
}

.widget__body {
  flex: 1;
  min-height: 0;
  padding: var(--space-4);
  overflow-y: auto;
  /* Keep a newly focused control clear of the sticky bet CTA (WCAG 2.4.11). */
  scroll-padding-bottom: var(--space-16);
}

.widget__footer {
  flex-shrink: 0;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.widget__sim {
  font-size: var(--font-size-xs);
  line-height: var(--leading-normal);
  color: var(--color-info-text);
}
</style>
