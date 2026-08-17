/// <reference types="vite/client" />

// @ramoslabs/tokens ships a CSS subpath export with no type declarations.
declare module '@ramoslabs/tokens/css'

// Typed environment surface (T004 / NFR-ENV-1). Values are raw strings (or
// undefined) as delivered by Vite; `src/config.ts` validates + narrows them
// into the typed `AppConfig`. Keep this in sync with `.env.example`.
interface ImportMetaEnv {
  /** Polymarket Gamma REST base URL (HTTPS only). */
  readonly VITE_GAMMA_BASE_URL?: string
  /** OpenRouter API base URL (HTTPS only). */
  readonly VITE_OPENROUTER_BASE_URL?: string
  /** Betting execution mode: `mock` (default) | `real`. */
  readonly VITE_BET_MODE?: string
  /** AI request path: `user-key` (default) | `proxy`. */
  readonly VITE_AI_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
