import { test, expect, type Page } from '@playwright/test'

/**
 * NFR-TEST-2 — primary happy-path E2E:
 *   search a market → open its detail → select an outcome → enter an amount →
 *   place a (mock) bet → see the receipt/toast and the new position.
 *
 * DETERMINISM OF NETWORK
 * ----------------------
 * The widget reads markets from Polymarket's Gamma API
 * (`https://gamma-api.polymarket.com`, default `VITE_GAMMA_BASE_URL`), which is
 * geoblocked/flaky and would make selectors non-deterministic. We therefore
 * intercept every Gamma call with `page.route()` and answer with ONE controlled
 * market, so exact texts (question, prices, cost, fees) are assertable:
 *
 *   Market "Will the E2E test outcome resolve YES by 2099?"
 *     outcomes:      ["Yes", "No"]
 *     outcomePrices: ["0.60", "0.40"]   → Yes = 60 %, No = 40 %
 *     volume 4.2M, liquidity 850K, active, not closed
 *
 * Both the raw Gamma host and the Vite dev-proxy path (the "gamma-api" prefix)
 * are stubbed via the globs in `stubGamma()` below, covering either
 * `VITE_GAMMA_BASE_URL` wiring. Two endpoints are served:
 *   - `/markets`        → browse list (array of raw Gamma markets)
 *   - `/public-search`  → search results (events[].markets[])
 * Betting is the app's own `MockBettingService` (no network) — never stubbed.
 *
 * EXPECTED MATH (amount = $100 on "Yes" @ 0.60, taker builder 100 bps, platform 0):
 *   cost   = 100 × 0.60            = $60.00
 *   shares = 100 ÷ 0.60            = 166.67
 *   payout = shares × $1           = $166.67
 *   builder fee = 60 × 100 / 10000 = $0.60
 *   total  = 60 + 0.60 + 0         = $60.60   (toast + position)
 */

const E2E_MARKET = {
  id: '900001',
  question: 'Will the E2E test outcome resolve YES by 2099?',
  slug: 'e2e-test-market-2099',
  outcomes: '["Yes","No"]',
  outcomePrices: '["0.60","0.40"]',
  clobTokenIds: '["1000001","1000002"]',
  volumeNum: 4_200_000,
  liquidityNum: 850_000,
  active: true,
  closed: false,
}

/** Fulfil any Gamma request with our controlled market. */
async function stubGamma(page: Page): Promise<void> {
  const handler = async (route: import('@playwright/test').Route) => {
    const url = route.request().url()
    const json = url.includes('/public-search')
      ? { events: [{ markets: [E2E_MARKET] }] } // search shape
      : [E2E_MARKET] // /markets browse shape
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(json),
    })
  }
  // Raw Gamma host + the dev-proxy path — whichever base URL the build uses.
  await page.route('**gamma-api.polymarket.com**', handler)
  await page.route('**/gamma-api/**', handler)
}

test('primary flow: search → detail → outcome → amount → bet → position', async ({ page }) => {
  await stubGamma(page)
  await page.goto('/')

  // The browse list loads on mount from the stubbed /markets — the card appears.
  const card = page.getByRole('button', { name: /Open market: Will the E2E test/ })
  await expect(card).toBeVisible()

  // 1) SEARCH — typing triggers a debounced /public-search (also stubbed).
  await page.getByLabel('Search markets').fill('E2E test')
  await expect(page.getByRole('heading', { name: /Search results/ })).toBeVisible()
  await expect(card).toBeVisible()

  // 2) OPEN DETAIL — the market detail dialog opens, titled by the question.
  await card.click()
  const dialog = page.getByRole('dialog', { name: E2E_MARKET.question })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Open for betting')).toBeVisible()

  // 3) SELECT OUTCOME — pick "Yes" (60%) from the radiogroup.
  const yesOutcome = dialog.getByRole('radio', { name: /Yes/ })
  await yesOutcome.click()
  await expect(yesOutcome).toHaveAttribute('aria-checked', 'true')

  // 4) ENTER AMOUNT — live cost/payout/fees update from the snapshot price.
  const amountInput = dialog.getByLabel('Amount (USD)')
  await amountInput.fill('100')
  // "To win" = (100 / 0.60) × $1  (Polymarket label; value unique in the dialog)
  await expect(dialog.getByText('To win')).toBeVisible()
  await expect(dialog.getByText('$166.67')).toBeVisible()

  // 4b) QUICK-ADD CHIP — "+$100" *increments* the stake (100 → 200), and the
  //     "To win" recomputes live: 200 / 0.60 = $333.33.
  await dialog.getByRole('button', { name: 'Add $100' }).click()
  await expect(amountInput).toHaveValue('200')
  await expect(dialog.getByText('$333.33')).toBeVisible()
  // Reset to the canonical $100 stake for the rest of the happy path.
  await amountInput.fill('100')
  await expect(dialog.getByText('$166.67')).toBeVisible()

  // additive builder fee shown BEFORE confirmation (AC5.8) — unique in the dialog
  await expect(dialog.getByText('$0.60')).toBeVisible()

  // 5) PLACE THE (MOCK) BET.
  await dialog.getByRole('button', { name: 'Place bet' }).click()

  // 6a) RECEIPT / TOAST — announced via a polite live region (AC5.6).
  const toast = page.getByRole('status').filter({ hasText: 'Bet filled' })
  await expect(toast).toBeVisible()
  await expect(toast).toContainText('$100.00')
  await expect(toast).toContainText('Yes')
  await expect(toast).toContainText('$60.60') // total (notional + builder fee)

  // 6b) POSITION — the detail closed and the position is reflected in the list.
  await expect(dialog).toBeHidden()
  const positions = page.getByRole('region', { name: 'Your positions' })
  await expect(positions.getByRole('heading', { name: /Your positions/ })).toContainText('(1)')

  const position = positions.getByRole('listitem').first()
  await expect(position.getByText(E2E_MARKET.question)).toBeVisible()
  // Outcome badge "Yes" (exact — the question also contains "YES").
  await expect(position.getByText('Yes', { exact: true })).toBeVisible()
  // Size $100.00 (amount), Price 60%, Cost $60.00, Total $60.60.
  await expect(position.getByText('$100.00')).toBeVisible()
  await expect(position.getByText('60%')).toBeVisible()
  await expect(position.getByText('$60.00')).toBeVisible() // cost (unique here)
  await expect(position.getByText(/Total:\s*\$60\.60/)).toBeVisible()
})
