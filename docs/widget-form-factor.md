# Decision D11 — Widget form factor (supersedes the full-page layout)

> User feedback (2026-08-17): the full-page markets layout "reads as a markets page, not a widget."
> The challenge asks for a **Polymarket widget** on a single page. We adopt a **compact, self-contained,
> embeddable widget**.

## Decision

The deliverable is a **compact embeddable widget** — a bounded card (`max-inline-size ≈ 28rem / 448px`,
`width: 100%` on smaller viewports) that lives **inside a host page**, with **internal navigation**
(a view-stack), not a full-bleed index page.

- **Host page** (`App.vue`): a minimal demo host (site chrome + placeholder content) that **embeds the
  widget**, so it visibly reads as "a widget on a page". The widget is the product; the host is just
  context to prove embeddability.
- **Widget shell** (`PolymarketWidget.vue`): bounded card (DS surface + `--radius-lg` + `--shadow-md`),
  header (title + Settings gear), and an internal view state:
  - **Browse**: search input + compact scrollable market list (single column of rows/cards).
  - **Detail**: back button → selected market (outcomes + bars), **Place-a-bet** (outcome, amount,
    review-and-confirm, submitting guard), and **AI suggestion** (opt-in, confidence, rationale).
  - **Receipt/positions**: filled-bet receipt + a compact positions view (tab or section within the widget).
  - **Settings**: OpenRouter key entry (in-widget view or a modal scoped to the widget).
- Navigation is a **stack/step flow with back**, because the widget is compact — NOT the desktop two-pane.

## Reconciliation with existing spec

- **NFR-MF-5 (responsive two-pane matrix) is SUPERSEDED for the widget.** The two-pane list+detail was
  predicated on a full-page layout. The compact widget uses a **single-column internal view-stack at all
  sizes**; responsiveness means: the widget is fluid up to its `max-inline-size` cap and the **host page**
  is responsive around it. Mobile-first still holds (base = mobile, the widget is already ~mobile-width).
- **AC4.7 (detail dialog/sheet):** the detail is now an **in-widget view with a back affordance**; a
  sheet/modal is only used for Settings (scoped within/over the widget). Dialog semantics apply to that
  modal; the detail view is a labelled `region` with focus moved to its heading on open.
- **Everything else stands:** real Gamma reads, mocked betting behind `BettingService`, opt-in AI,
  token-only DS, WCAG 2.2 AA, bet confirmation + double-submit guard, empty/error/offline states,
  localStorage hardening, security headers, deployment. The `SJ*` primitives and most `W*` widgets are
  reused unchanged; only the **shell/composition** and the **detail presentation** change.

## Reuse map (what changes vs. what stays)

| Layer | Change? |
|---|---|
| models / http / services / stores / composables | **No change** (all reused; ~140 tests stand) |
| `SJ*` primitives | **Reused** (Button/Input/Card/Badge/Modal/Spinner/Skeleton/Toast/ProgressBar) |
| `W*` widgets (Search, Card, BetForm, Receipt, Positions, AiPrediction, Settings) | **Reused**, restyled compact |
| `WMarketList` | Compact single-column list inside the widget (no multi-col grid) |
| `WMarketDetail` | **Reworked**: compact in-widget view with back nav (no modal/two-pane) |
| `App.vue` | **Reworked**: demo host page embedding the widget |
| `PolymarketWidget.vue` | **New**: the bounded widget shell + internal view-stack |
