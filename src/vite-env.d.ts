/// <reference types="vite/client" />

// @ramoslabs/tokens ships a CSS subpath export with no type declarations.
declare module '@ramoslabs/tokens/css'

interface ImportMetaEnv {
  /**
   * Base URL for Polymarket Gamma reads. Defaults to the public host; point it
   * at the Vite dev proxy path (e.g. `/gamma-api`) to route around CORS with no
   * service-layer changes (NFR-SVC-2).
   */
  readonly VITE_GAMMA_BASE_URL?: string
  /** Builder code (`bytes32`) carried on the mock/real order (AC5.9, NFR-SEC-4). */
  readonly VITE_BUILDER_CODE?: string
  /** Builder taker fee in bps (≤100). Default 100. */
  readonly VITE_BUILDER_TAKER_BPS?: string
  /** Builder maker fee in bps (≤50). Default 50. */
  readonly VITE_BUILDER_MAKER_BPS?: string
  /** Platform fee in bps. Default 0. */
  readonly VITE_PLATFORM_BPS?: string
  /** '1' opts into the gated real CLOB order path (AC10.2). Off by default. */
  readonly VITE_ENABLE_REAL_ORDERS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
