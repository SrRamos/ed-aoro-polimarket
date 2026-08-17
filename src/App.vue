<script setup lang="ts">
/**
 * App.vue (T609 · NFR-MF-1/NFR-MF-5 · NFR-A11Y-6/NFR-A11Y-7 · spec §7.3) — the
 * single-page composition that assembles the widget from the `SJ*` primitives and
 * `W*` widgets. It owns three things and delegates everything else:
 *
 *   1. LANDMARKS + HEADING OUTLINE (NFR-A11Y-7): a `<header>` (banner) with the one
 *      `h1` + a Settings entry, a `<main id="main">` skip-link target, a `search`
 *      landmark (WMarketSearch's inner form), and labelled `region`s (Markets,
 *      detail pane, Positions) — each `h2` section under the single `h1`.
 *   2. RESPONSIVE MATRIX (NFR-MF-5): base = single-column stack, detail as a mobile
 *      sheet; md (769) = capped inline-size + multi-column card grid; lg (992) =
 *      two-pane list+detail (the sheet becomes an inline right pane) + positions
 *      table. The breakpoint decision is made here (matchMedia) and passed down as
 *      `inline`, so WMarketDetail never guesses the viewport.
 *   3. DATA FLOW (§7.3): `useMarketSearch` → `markets.setSearchState` (store is the
 *      single source of truth) → WMarketList `select` → `markets.selectMarket` →
 *      WMarketDetail; outcome selection round-trips through the store (AC4.3);
 *      WPositions `browse` focuses the search; WAiPrediction `open-settings` opens
 *      WSettings. `SJToastHost` is mounted once; the corrupt-storage notice
 *      (WPositions) stays distinct from onboarding; the whole tree stays under the
 *      `SJErrorBoundary` so one bad panel degrades instead of white-screening.
 *
 * Injectables (`searchController` / `bettingService` / `aiController` / `wide`) let
 * the integration tests drive the assembled flow with no live network.
 */
import { computed, onMounted, onBeforeUnmount, ref, watch, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import type { Market } from './models/market'
import type { BettingService } from './services/betting.service'
import { useMarketSearch, type UseMarketSearch } from './composables/useMarketSearch'
import { useAiPrediction, type UseAiPrediction } from './composables/useAiPrediction'
import { useMarketsStore } from './stores/markets.store'
import SJErrorBoundary from './components/ui/SJErrorBoundary.vue'
import SJButton from './components/ui/SJButton.vue'
import SJModal from './components/ui/SJModal.vue'
import SJToastHost from './components/ui/SJToastHost.vue'
import WMarketSearch from './components/widget/WMarketSearch.vue'
import WMarketDetail from './components/widget/WMarketDetail.vue'
import WPositions from './components/widget/WPositions.vue'
import WSettings from './components/widget/WSettings.vue'

const props = defineProps<{
  /** Inject a search controller (tests) — otherwise a live one is created. */
  searchController?: UseMarketSearch
  /** Inject a betting service (tests) — forwarded to the bet form. */
  bettingService?: BettingService
  /** Inject an AI controller (tests) — forwarded to the AI panel. */
  aiController?: UseAiPrediction
  /** Force the two-pane (`lg`) layout on/off (tests). Auto via matchMedia otherwise. */
  wide?: boolean
}>()

const markets = useMarketsStore()
const { selectedMarket, selectedOutcomeIndex } = storeToRefs(markets)

// Search orchestration → push settled state into the store (single source of truth).
const search = props.searchController ?? useMarketSearch()
watch(search.state, (state) => markets.setSearchState(state), { immediate: true })

// Provide a shared AI controller so the detail reuses one instance across renders.
const ai = props.aiController ?? useAiPrediction()

// --- Responsive mode (NFR-MF-5): two-pane at lg (992px) --------------------------
const autoWide = ref(false)
const isWide = computed(() => props.wide ?? autoWide.value)

let mql: MediaQueryList | null = null
function onMediaChange(e: MediaQueryListEvent | MediaQueryList): void {
  autoWide.value = e.matches
}
onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mql = window.matchMedia('(min-width: 992px)')
    onMediaChange(mql)
    mql.addEventListener('change', onMediaChange)
  }
})
onBeforeUnmount(() => mql?.removeEventListener('change', onMediaChange))

// --- Selection -------------------------------------------------------------------
function onSelectMarket(market: Market): void {
  markets.selectMarket(market)
}

/** Modal is used only on narrow layouts; on lg the detail is an inline pane. */
const detailModalOpen = computed<boolean>({
  get: () => !isWide.value && selectedMarket.value !== null,
  set: (v) => {
    if (!v) markets.clearSelection()
  },
})

/** Outcome selection round-trips through the store seam (AC4.3). */
const outcomeIndex = computed<number | null>({
  get: () => selectedOutcomeIndex.value,
  set: (v) => {
    if (v === null) markets.selectedOutcomeIndex = null
    else markets.selectOutcome(v)
  },
})

function onDetailClose(): void {
  markets.clearSelection()
}

// --- Settings --------------------------------------------------------------------
const settingsOpen = ref(false)
function openSettings(): void {
  settingsOpen.value = true
}

// --- WPositions "browse" → focus the search input (§7.3) -------------------------
const listPane = useTemplateRef<HTMLElement>('listPane')
function focusSearch(): void {
  const input = listPane.value?.querySelector('input')
  if (input) {
    input.focus()
    input.scrollIntoView({ block: 'center' })
  }
}
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <SJErrorBoundary>
    <div class="app">
      <div class="app__inner">
        <header class="app__header">
          <div class="app__brand">
            <h1 class="app__title">Polymarket Widget</h1>
            <p class="app__tagline">Explore prediction markets and place simulated bets.</p>
          </div>
          <SJButton variant="secondary" icon-only aria-label="Open settings" @click="openSettings">
            <span aria-hidden="true">⚙</span>
          </SJButton>
        </header>

        <main id="main" class="app__main">
          <!-- Persistent "bets are simulated" framing (US5). -->
          <p class="app__sim-banner" role="note">
            <span aria-hidden="true">ⓘ</span> Bets here are <strong>simulated</strong> — no real
            funds are ever involved.
          </p>

          <section class="app__markets" aria-labelledby="app-markets-heading">
            <h2 id="app-markets-heading" class="app__section-title">Markets</h2>
            <div class="app__markets-grid">
              <div ref="listPane" class="app__list-pane">
                <WMarketSearch :controller="search" @select="onSelectMarket" />
              </div>
              <!-- Detail: inline right pane at lg; a modal/sheet below lg. -->
              <div class="app__detail-pane">
                <WMarketDetail
                  v-model:open="detailModalOpen"
                  v-model:outcome-index="outcomeIndex"
                  :market="selectedMarket"
                  :inline="isWide"
                  :betting-service="bettingService"
                  :ai-controller="ai"
                  @close="onDetailClose"
                  @open-settings="openSettings"
                />
              </div>
            </div>
          </section>

          <WPositions @browse="focusSearch" />
        </main>
      </div>
    </div>

    <!-- Settings dialog (US8) — opened from the header and from the AI panel. -->
    <SJModal v-model:open="settingsOpen" title="Settings" close-label="Close settings">
      <WSettings />
    </SJModal>

    <!-- Live-region toast host, mounted once near the root (NFR-A11Y-3). -->
    <SJToastHost />
  </SJErrorBoundary>
</template>

<style scoped>
.app {
  min-height: 100dvh;
  padding: var(--space-4);
  background: var(--color-background);
}

.app__inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.app__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding-block: var(--space-2);
}

.app__brand {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.app__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-tight);
  color: var(--color-text-heading);
}

.app__tagline {
  max-width: 60ch;
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}

.app__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.app__sim-banner {
  max-width: 65ch;
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-info-text);
  background: var(--color-info-surface);
  border: 1px solid var(--color-info-border);
  border-radius: var(--radius-md);
}

.app__markets {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.app__section-title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.app__markets-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.app__list-pane {
  min-width: 0;
}

/* base / md: the detail is a modal (teleported) — the inline pane is not shown. */
.app__detail-pane {
  display: none;
}

/* md (769): cap the overall inline-size + center; the card grid goes multi-column
   inside WMarketList. Text blocks keep their own ch caps above. */
@media (min-width: 769px) {
  .app {
    padding: var(--space-8);
  }

  .app__inner {
    inline-size: 100%;
    max-inline-size: 140ch;
    margin-inline: auto;
  }

  .app__title {
    font-size: var(--font-size-3xl);
  }
}

/* lg (992): two-pane list+detail — the mobile sheet becomes an inline right pane. */
@media (min-width: 992px) {
  .app__markets-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 46ch);
    gap: var(--space-8);
    align-items: start;
  }

  .app__detail-pane {
    display: block;
    position: sticky;
    /* Clear of the top edge; keeps a focused control visible (NFR-A11Y-6). */
    top: var(--space-4);
  }
}
</style>
