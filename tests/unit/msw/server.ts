/**
 * Shared MSW server for unit tests (NFR-TEST-3 / T18).
 *
 * All Gamma / OpenRouter traffic is intercepted here — NO live network is hit in
 * unit or component tests. Individual tests add per-case handlers with
 * `server.use(...)`.
 */
import { setupServer } from 'msw/node'

export const server = setupServer()
