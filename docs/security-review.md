# Security Review — Polymarket Widget

> Read-only verification of the widget's secret-handling and read-path posture against the spec's security NFRs (NFR-SEC-1…5, AC8.3/AC8.4). Scope: `src/`, config, and env handling. **Result: no violations found.**

## Summary

| #   | Claim verified                                                                    | Result | Evidence                                  |
| --- | --------------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| 1   | AI key travels only in the `Authorization` header — never in a URL, never logged  | PASS   | `openrouter.service.ts`                   |
| 2   | No API key is bundled, hardcoded, or committed                                    | PASS   | repo-wide grep                            |
| 3   | `builderCode` is configurable (not a secret), placeholder default                 | PASS   | `config/builder.config.ts`, `lib/fees.ts` |
| 4   | Polymarket reads use no secrets                                                   | PASS   | `polymarket.service.ts`, `.env.example`   |
| 5   | All `fetch` is funneled through `http.ts` (single caller, no header/body logging) | PASS   | repo-wide grep, `http.ts`                 |

## Findings

### 1. OpenRouter key — header-only, never URL/log (NFR-SEC-2)

The user-supplied key is attached exclusively in `authHeaders()` in `openrouter.service.ts`:

```ts
Authorization: `Bearer ${apiKey}` // key travels ONLY here (NFR-SEC-2)
```

- It is never interpolated into a request URL — the OpenRouter calls hit fixed paths (`/models`, `/chat/completions`) with no key in the query string.
- It is never logged. `http.ts` (the sole `fetch` caller) logs no request headers or bodies. A grep for `console.*` referencing key/token/auth/bearer across `src/` returns nothing.
- On error, `toAiError()` normalizes failures to generic user-facing messages (rate-limited / rejected / timed out) and never echoes the key.
- Persistence (`settings.store.ts`) writes the key to `localStorage` only and never logs it.

### 2. No bundled or hardcoded key (NFR-SEC-1, AC8.4)

- Repo-wide grep for real key shapes (`sk-or-…`, inline `apiKey = '…'`, `secret = '…'`) found **only** the input placeholder string `"sk-or-v1-…"` in `WSettings.vue` (a UI hint, not a value).
- `settings.store.ts` initializes `openRouterKey` to `null`; there is no fallback/default key anywhere. The only key ever used is the one the user enters at runtime.
- `.env` files are gitignored (`.env`, `.env.*`, with `!.env.example`); `.env.example` carries no secret and documents that the AI key is user-supplied at runtime, never bundled.

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
grep -rniE "sk-or-|Bearer [A-Za-z0-9]|apiKey *= *['\"]|secret *= *['\"]" src/   # only the WSettings placeholder
grep -rn  "fetch(" src/ | grep -v http.ts                                        # empty — single caller
grep -rniE "console\.(log|error|warn|info)" src/ | grep -iE "key|token|bearer"   # empty — key never logged
```

## Conclusion

All five security invariants hold. The only key ever used is the user-supplied OpenRouter key, confined to `localStorage` and the `Authorization` header; the builderCode is public configuration with a safe placeholder; reads are secret-free; and every network call is funneled through a single non-logging fetch wrapper. No remediation required.
