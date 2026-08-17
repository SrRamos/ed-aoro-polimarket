/**
 * Vitest global setup (Group 5 component tier · T18/T711).
 * Registers vitest-axe matchers (`toHaveNoViolations`) for automated a11y
 * assertions on representative renders. jsdom skips layout-dependent rules
 * (e.g. color-contrast) automatically; structural rules still run.
 */
import * as matchers from 'vitest-axe/matchers'
import { expect } from 'vitest'

expect.extend(matchers)
