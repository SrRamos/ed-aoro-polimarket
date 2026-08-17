<script setup lang="ts">
/**
 * App.vue (D11 · docs/widget-form-factor.md) — a minimal demo HOST page that embeds
 * the compact `PolymarketWidget`, so the deliverable visibly reads as "a widget on a
 * page" rather than a full-bleed markets index.
 *
 * The host is deliberately thin — it exists only to PROVE embeddability:
 *   - A faux site banner (brand + nav placeholders) and a hero, in muted DS tokens.
 *   - A content column with a couple of placeholder blocks, with the widget embedded
 *     alongside them (an aside on wide viewports, stacked on mobile — the HOST is what
 *     is responsive; the widget itself is a fixed, bounded card, per D11).
 *
 * It owns only the host chrome + the app-wide plumbing every page needs:
 *   - `SJErrorBoundary` at the root so one bad panel degrades instead of white-screening.
 *   - `SJToastHost` mounted ONCE near the root (NFR-A11Y-3).
 *   - a skip-link targeting the real `<main>` (NFR-A11Y-7).
 *
 * The widget's own logic (search/select/detail/bet/positions/settings) lives inside
 * `PolymarketWidget`; the injectable controllers are forwarded through so the App
 * integration tests can drive the assembled flow with no live network.
 */
import type { BettingService } from './services/betting.service'
import type { UseMarketSearch } from './composables/useMarketSearch'
import type { UseAiPrediction } from './composables/useAiPrediction'
import SJErrorBoundary from './components/ui/SJErrorBoundary.vue'
import SJToastHost from './components/ui/SJToastHost.vue'
import PolymarketWidget from './components/widget/PolymarketWidget.vue'

withDefaults(
  defineProps<{
    /** Forwarded to the widget (tests) — otherwise the widget builds live ones. */
    searchController?: UseMarketSearch
    bettingService?: BettingService
    aiController?: UseAiPrediction
  }>(),
  {
    searchController: undefined,
    bettingService: undefined,
    aiController: undefined,
  },
)
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <SJErrorBoundary>
    <div class="host">
      <!-- Faux site chrome — muted placeholders, just enough to frame the widget. -->
      <header class="host__banner">
        <div class="host__banner-inner">
          <span class="host__brand">
            <span class="host__brand-mark" aria-hidden="true">◆</span>
            <span class="host__brand-name">Acme Insights</span>
          </span>
          <nav class="host__nav" aria-label="Demo site">
            <span class="host__nav-item host__nav-item--active">Home</span>
            <span class="host__nav-item">Research</span>
            <span class="host__nav-item">About</span>
          </nav>
        </div>
      </header>

      <main id="main" class="host__main">
        <div class="host__hero">
          <h1 class="host__hero-title">Prediction markets, embedded.</h1>
          <p class="host__hero-lead">
            A demo host page. The interactive card on the right is the self-contained Polymarket
            widget — drop it into any page.
          </p>
        </div>

        <div class="host__content">
          <!-- Placeholder host content blocks (decorative, muted DS tokens). -->
          <div class="host__article" aria-hidden="true">
            <span class="host__ph host__ph--title"></span>
            <span class="host__ph host__ph--line"></span>
            <span class="host__ph host__ph--line"></span>
            <span class="host__ph host__ph--line host__ph--short"></span>
            <span class="host__ph host__ph--block"></span>
            <span class="host__ph host__ph--line"></span>
            <span class="host__ph host__ph--line"></span>
            <span class="host__ph host__ph--line host__ph--short"></span>
          </div>

          <!-- The embedded widget — the actual product. -->
          <aside class="host__widget" aria-label="Polymarket widget">
            <PolymarketWidget
              :search-controller="searchController"
              :betting-service="bettingService"
              :ai-controller="aiController"
            />
          </aside>
        </div>
      </main>
    </div>

    <!-- Live-region toast host, mounted once near the root (NFR-A11Y-3). -->
    <SJToastHost />
  </SJErrorBoundary>
</template>

<style scoped>
.host {
  min-height: 100dvh;
  background: var(--color-background);
}

.host__banner {
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
}

.host__banner-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  max-inline-size: 75rem;
  margin-inline: auto;
  padding: var(--space-3) var(--space-4);
}

.host__brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.host__brand-mark {
  color: var(--color-primary);
}

.host__brand-name {
  font-family: var(--font-family-display);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.host__nav {
  display: none;
  gap: var(--space-5);
}

.host__nav-item {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.host__nav-item--active {
  color: var(--color-text-strong);
}

.host__main {
  max-inline-size: 75rem;
  margin-inline: auto;
  padding: var(--space-6) var(--space-4) var(--space-16);
}

.host__hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-block: var(--space-6);
}

.host__hero-title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-tight);
  color: var(--color-text-heading);
}

.host__hero-lead {
  max-inline-size: 55ch;
  font-size: var(--font-size-base);
  line-height: var(--leading-relaxed);
  color: var(--color-text-secondary);
}

.host__content {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-8);
}

/* Decorative placeholder "article" — muted DS surfaces, no real content. */
.host__article {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.host__ph {
  display: block;
  border-radius: var(--radius-sm);
  background: var(--color-surface-secondary);
}

.host__ph--title {
  width: 60%;
  height: var(--space-8);
  border-radius: var(--radius-md);
}

.host__ph--line {
  width: 100%;
  height: var(--space-4);
}

.host__ph--short {
  width: 70%;
}

.host__ph--block {
  width: 100%;
  height: var(--space-24);
  margin-block: var(--space-2);
  border-radius: var(--radius-md);
}

.host__widget {
  display: flex;
  justify-content: center;
}

/* md+: the host lays out two columns with the widget as a sticky aside — the HOST
   is responsive; the widget stays a fixed, bounded card (D11). */
@media (min-width: 769px) {
  .host__hero-title {
    font-size: var(--font-size-3xl);
  }

  .host__nav {
    display: flex;
  }

  .host__content {
    flex-direction: row;
    align-items: start;
  }

  .host__article {
    flex: 1;
  }

  .host__widget {
    position: sticky;
    top: var(--space-6);
    justify-content: flex-end;
    flex-shrink: 0;
  }
}
</style>
