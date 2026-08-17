<script setup lang="ts"></script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="app-shell">
    <header class="app-shell__header">
      <h1 class="app-shell__title">Polymarket Widget</h1>
    </header>
    <main id="main" class="app-shell__main">
      <p class="app-shell__lede">
        Scaffold ready. Build widgets here using the RamosLabs design system.
      </p>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: var(--space-4);
  gap: var(--space-6);
}

.app-shell__header {
  padding-block: var(--space-2);
}

.app-shell__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-tight);
  color: var(--color-text-heading);
}

.app-shell__lede {
  font-size: var(--font-size-base);
  line-height: var(--leading-normal);
  color: var(--color-text-body);
}

/* Mobile-first: scale up at the DS `md` breakpoint (769px). */
@media (min-width: 769px) {
  .app-shell {
    padding: var(--space-8);
  }

  .app-shell__title {
    font-size: var(--font-size-3xl);
  }
}
</style>
