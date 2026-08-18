# Security Review — Polymarket Widget

> Read-only verification of the widget's secret-handling and read-path posture against the spec's security NFRs (NFR-SEC-1…5, AC8.3/AC8.4). Scope: `src/`, config, and env handling.
>
> **Model change (2026-08):** AI config moved from _user-supplied at runtime_ to _deploy-time env config_ (`VITE_OPENROUTER_API_KEY`, `VITE_OPENROUTER_MODEL`); the end user only flips an **Enable AI** toggle. This changes the posture of NFR-SEC-1: the key is **no longer bundle-free** — `VITE_*` vars are inlined into the client bundle at build time, so a public build exposes the key. This is documented honestly below with the production mitigation (a backend proxy). All other invariants still hold.

## Summary

| #   | Claim verified                                                                    | Result   | Evidence                                  |
| --- | --------------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| 1   | AI key travels only in the `Authorization` header — never in a URL, never logged  | PASS     | `openrouter.service.ts`                   |
| 2   | AI key/model come from env; the key is inlined into the build (see mitigation)    | TRADEOFF | `openrouter.service.ts`, `.env.example`   |
| 3   | `builderCode` is configurable (not a secret), placeholder default                 | PASS     | `config/builder.config.ts`, `lib/fees.ts` |
| 4   | Polymarket reads use no secrets                                                   | PASS     | `polymarket.service.ts`, `.env.example`   |
| 5   | All `fetch` is funneled through `http.ts` (single caller, no header/body logging) | PASS     | repo-wide grep, `http.ts`                 |

## Findings

### 1. OpenRouter key — header-only, never URL/log (NFR-SEC-2)

The env-configured key is attached exclusively in `authHeaders()` in `openrouter.service.ts`:

```ts
Authorization: `Bearer ${apiKey}` // key travels ONLY here (NFR-SEC-2)
```

- It is never interpolated into a request URL — the OpenRouter call hits the fixed `/chat/completions` path with no key in the query string. (Runtime model discovery `/models` was removed; the model now comes from `VITE_OPENROUTER_MODEL`.)
- It is never logged. `http.ts` (the sole `fetch` caller) logs no request headers or bodies. A grep for `console.*` referencing key/token/auth/bearer across `src/` returns nothing.
- On error, `toAiError()` normalizes failures to generic user-facing messages (rate-limited / rejected / timed out) and never echoes the key.
- It is **never persisted client-side.** `settings.store.ts` holds only the `aiEnabled` boolean and the builder override — no key, no secret ever reaches `localStorage`.

### 2. AI key is deploy-time env config, inlined into the build — tradeoff + mitigation (NFR-SEC-1, AC8.4)

This is the one place the posture regressed relative to the earlier user-supplied model, and it is stated honestly:

- `openrouter.service.ts` reads `import.meta.env.VITE_OPENROUTER_API_KEY` / `VITE_OPENROUTER_MODEL`. Vite **inlines `VITE_*` vars into the client bundle at build time**, so a production build made with a real key ships that key inside the JS served to every visitor — it is recoverable by anyone who inspects the bundle. There is no way to make a `VITE_*` value secret in a purely client-side app.
- **Mitigation for production:** front OpenRouter with a **backend proxy** that holds the key server-side and forwards chat-completion requests; the browser calls the proxy (same-origin, no key) instead of OpenRouter. The client code already funnels the AI call through `http.ts`, so only the base URL + header wiring would move server-side. For a local/demo build a free-tier key is an acceptable, disposable exposure.
- The key is **not committed to source.** `.env` files are gitignored (`.env`, `.env.*`, with `!.env.example`); `.env.example` carries no real value and documents the inlining caveat. No hardcoded/fallback key exists in `src/` — with no env set, `isAiConfigured()` is `false` and the widget shows a labelled sample suggestion without any network call.

### 3. `builderCode` — configurable, not a secret (NFR-SEC-4)

- `builder.config.ts` resolves the builderCode as `settings override > VITE_BUILDER_CODE > PLACEHOLDER_BUILDER_CODE`, where the placeholder is the all-zero, visibly-invalid `0x000…000`.
- It is treated as **public configuration** (it travels inside a signed order to attribute volume/fees), never as a security secret — correctly, and it is never committed as a real value.
- No builder **secret** (the relayer/gasless API key) exists anywhere in the client. The gated real-order path (`createBettingService`) is a stub that never submits and only warns in dev.

### 4. Reads use no secrets (NFR-SEC-3)

- `polymarket.service.ts` issues plain unauthenticated GETs to the public Gamma host (`VITE_GAMMA_BASE_URL`, default `https://gamma-api.polymarket.com`). No `Authorization`/API-key header is attached to any read.
- `.env.example` states no keys or secrets are required for the real read path; the demo runs with no env set.

### 5. Single fetch caller, no leaky logging (NFR-SVC-1)

- Grep for `fetch(` outside `http.ts` returns nothing — components, stores, and the other services all route through `fetchJson`.
- `http.ts` logs neither request headers (where the key lives) nor response bodies. Dev-only `console.error` in the stores/services logs failure _reasons_ (URL, HTTP status, parse stage), never payloads or the key.

## Verification commands

```bash
grep -rniE "sk-or-|Bearer [A-Za-z0-9]|apiKey *= *['\"]|secret *= *['\"]" src/   # no hardcoded key
grep -rn  "fetch(" src/ | grep -v http.ts                                        # empty — single caller
grep -rniE "console\.(log|error|warn|info)" src/ | grep -iE "key|token|bearer"   # empty — key never logged
```

## Conclusion

Four of five invariants hold unchanged: the AI key travels only in the `Authorization` header (never a URL, never logged, and now never persisted client-side), the builderCode is public configuration with a safe placeholder, reads are secret-free, and every network call is funneled through a single non-logging fetch wrapper. The one deliberate tradeoff is **#2**: moving AI config to `VITE_*` env vars means the key is inlined into the client bundle at build time and is therefore exposed in a public deploy. This is acceptable for a demo with a disposable free-tier key; the **production-correct remediation is a backend proxy** so the key never reaches the browser. No secret is committed to source.
