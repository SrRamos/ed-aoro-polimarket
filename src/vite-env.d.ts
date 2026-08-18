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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
