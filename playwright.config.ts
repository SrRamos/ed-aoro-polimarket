import { defineConfig, devices } from '@playwright/test'

// Dedicated port so the E2E server never collides with the always-on dev
// server on 5173 (this branch runs in its own git worktree). Override with
// PLAYWRIGHT_PORT if needed. `--strictPort` makes a clash fail loudly instead
// of silently drifting to a port the baseURL wouldn't match.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4290)
const baseURL = `http://localhost:${PORT}`

// https://playwright.dev/docs/test-configuration
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Vite dev server on the dedicated port; the E2E deterministically stubs
    // all Gamma network traffic via page.route, so no live Polymarket access
    // (or dev proxy) is ever needed.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
