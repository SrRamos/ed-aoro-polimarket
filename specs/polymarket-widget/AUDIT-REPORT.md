# AUDIT-REPORT — polymarket-widget
Generated: 2026-08-17
Auditor: cross-tier adversarial (programmatic-first + semantic)
Iteration: 1

<!--
  Consumed by /spec-harden Phase 0.5. The Verdict row below MUST keep this exact
  shape so its grep works:
    grep -m1 -E '^\| Verdict \|' AUDIT-REPORT.md
  Verdict token is backtick-wrapped, one of:
    PASS | PASS-WITH-CONCERNS | FAIL | INCONCLUSIVE-COST-CEILING
  Defect headings MUST be `### D<NNN> — <title>` (parsed by the loop guard and by
  harden's targeted-fix-list builder).
-->

| Field | Value |
|---|---|
| Verdict | `PASS-WITH-CONCERNS` |
| Status action | Status left at `ready-for-dev (with warnings)`. NOT reverted to draft. Promotion permitted after acknowledging the concerns below (all are documentation/traceability-level, none block core development). |
| Blockers | 0 high-severity / blocks-promotion defects |
| Concerns | 1 medium (false NFR-coverage claim in tasks.md), 3 low (task-count inconsistency, timezone/locale omission, rate-limit-header partial). |

## Verdict reasoning

The spec is unusually well-grounded. The two failure modes `/spec-audit` exists to
catch — **hallucinated dependencies/CVEs** and **cross-cutting omissions** — are largely
absent:

- **Programmatic dependency verification is a clean pass.** Every one of the 5 new
  gate/deploy tooling deps the plan names resolves in the npm registry at the *exact*
  version claimed (eslint 10.8.1, prettier 3.9.6, wrangler 4.123.0, eslint-plugin-vue
  10.10.0, @vue/eslint-config-typescript 14.9.0). The 3 core runtime deps are installed
  and match (vue 3.5.41, pinia 4.0.3, @ramoslabs/tokens 0.1.0). **Zero hallucinated
  packages, zero version mismatches.**
- **CVE claim verified.** OSV.dev version-specific queries return **0 vulns affecting the
  pinned versions** for all 7 packages. The plan's "CLEAN / 0 CVEs" claim is accurate
  (a naive version-agnostic OSV query returns historical vulns for vue/wrangler, but none
  fall in the pinned ranges — the harden's claim survives scrutiny).
- **Traceability of acceptance criteria is complete.** All 55 EARS ACs (AC1.1–AC9.8) are
  referenced by ≥1 task once wildcards (`AC1.*`) and en-dash ranges (`AC4.1–AC4.5`) are
  expanded. All 81 anchors are defined; all task `refs:` resolve.
- **The 6 intentional constraints the reviewer flagged are all verified as deliberate
  design, not defects:** simulated betting behind `BettingService` (D2, corroborated by
  the research doc's analysis that real CLOB trading needs wallet + EIP-712 + HMAC +
  backend and is geoblocked); opt-in user-supplied-key AI (D4 / research Approach B);
  real betting / AI proxy / live CLOB pricing deferred to Phase 2 (spec §6, plan §8);
  light-theme-only (D6, DS v0.1.0 ships no dark palette); DS governs all custom components
  (D7–D8); mobile-first under DS conditions (D9). None of these are audit findings.

Why not a clean PASS: the tasks.md **"Coverage check" (line 119) makes a provably false
claim** — it asserts "every NFR (DS/MF/A11Y/THEME/SEC/SVC/TEST) is referenced by ≥1 task",
but **4 NFRs (NFR-DS-2, NFR-DS-6, NFR-DS-7, NFR-SEC-3) have zero task references.** That
is exactly the kind of over-confident self-assessment in harden output this gate exists to
flag. It is medium (not high) because the *substance* of DS-6 and DS-7 is enforced across
task content (radius/shadow-by-role appears in T501/T503/T505/T506; SJ*/W* naming is the
literal structure of Groups 5–6), and DS-2/SEC-3 are cross-cutting invariants — so the
gap is a traceability/label gap, not a missing capability. Combined with two minor
cross-cutting partials, the rubric lands on **PASS-WITH-CONCERNS** (≥1 medium / ≥1 partial,
0 high-blocks). Per the default-conservative rule this is still promotable — the concerns
are corrections to make, not a re-derivation of the design.

## Programmatic verification ledger (Phases 3–6, 9)

| Check | Phase | Result |
|---|---|---|
| New dependencies vs registry | 3 | **PASS.** 5/5 tooling deps exist at exact claimed versions (eslint 10.8.1, prettier 3.9.6, wrangler 4.123.0, eslint-plugin-vue 10.10.0, @vue/eslint-config-typescript 14.9.0); 3/3 runtime deps match installed (vue 3.5.41, pinia 4.0.3, @ramoslabs/tokens 0.1.0). 0 hallucinations, 0 mismatches. |
| CVE / GHSA re-fetch | 4 | **PASS.** OSV.dev version-specific queries: 0 vulns affecting pinned versions across all 7 packages. Harden's "CLEAN" claim verified. |
| External URL re-fetch + substring | 5 | Not independently re-fetched (endpoints `gamma-api.polymarket.com`, `openrouter.ai/api/v1/*` are live third-party hosts; the spec's use of them matches the research docs verbatim). Model IDs in AC7.4 (`z-ai/glm-5.2:free` etc.) are acknowledged-volatile and resolved at runtime by design (AC7.4 discovery + fallback to `openrouter/free`) — not a falsifiable hardcode. No URL defect. |
| Anchor resolution | 6 | **PASS.** 81/81 anchors defined; all AC/NFR/plan-section `refs:` in tasks.md resolve. |
| Cost arithmetic | 9.1 | **PASS (trivial).** Cost table is all-free-tier; total ≈ $0/month is arithmetically consistent (0+0+0+0). |
| Mermaid reachability / sequence | 9.2/9.3 | N/A — no mermaid graphs/sequence diagrams in spec.md or plan.md. Execution-order graph (tasks.md) is a text topological list; groups 0→9 are acyclic and each group's predecessors exist. |

## Traceability matrix (Phase 6)

- **Requirements → task:** 55/55 ACs covered by ≥1 task (wildcards + ranges expanded). No `uncovered_requirement` among ACs.
- **Requirements → task (NFRs):** 22/26 NFRs referenced. **4 NFRs UNREFERENCED by any task:** NFR-DS-2 (mono-indigo accent), NFR-DS-6 (radius/shadow/motion by role), NFR-DS-7 (SJ*/W* naming + DS patterns), NFR-SEC-3 (public unauthenticated reads). See D001.
- **Requirements → test:** Automated unit tests target AC1.*, AC5.2–5.3, AC6.*, AC7.5/7.6/7.10 (matches NFR-TEST-1 scope exactly); E2E covers the search→bet happy path (NFR-TEST-2); a11y/perf/security verification tasks T706–T708; manual QA T709 spans US1–US9. US2/US3/US4/US8/US9 have no dedicated *automated* unit test — but this matches the spec's own deliberately-scoped NFR-TEST-1 and is covered by E2E + T709. Not a defect.
- **Task → anchor:** all `refs:` resolve. No `broken_ref`.
- **Design element → requirement:** all §7 service contracts forward-link to ACs. No `extraneous`.

## CoVe blind re-derivation deltas (Phase 7)

Blind re-derivation was run mentally against the lowest-evidence-density sections. No
material disagreements — the harden's answers are re-derivable from the source docs.

| Section | Harden answer | Auditor blind answer | Match? |
|---|---|---|---|
| Rollback | `wrangler rollback`/versions for deploy; localStorage schemaVersion + defensive parse; no DB migration | Same — Cloudflare Worker versions are immutable and rollback-able; only destructive surface is localStorage, mitigated by AC6.4 | yes |
| Cost projection | ≈ $0/mo (all free tiers), +$5 ceiling if Workers paid | Same — Gamma public GET, OpenRouter user-key free tier, Workers static free, GH Actions free | yes |
| Observability | 9 log fields / 7 metrics / 6 spans / 3 alerts, never log apiKey | Re-derivable and internally consistent; field set is typed and ≥5; apiKey exclusion aligns with NFR-SEC-2 | yes |
| Perf budgets | bundle ≤150KB gz, LCP ≤2.5s, INP ≤200ms, debounce ~300ms | Reasonable for a no-UI-lib Vue+Pinia SPA; consistent with web.dev norms (flagged in plan as un-ratified pending constitution) | yes (budgets un-ratified but sound) |
| Security threat model | 10 threats; HIGH T1/T2/T5 → gate tasks; 0 CRITICAL-unmitigated | Re-derived; key-exfil/XSS/secret-in-bundle are the real HIGHs and each maps to a concrete task (T708/T803) + CSP | yes |

## Cross-cutting Top-7 (Phase 8)

| # | Concern | Status | Evidence |
|---|---|---|---|
| 1 | Idempotency keys | n/a | No server POST. Mock bet is a local operation; double-submit guarded by AC5.4 (disabled-until-valid button) + AC5.7 (store unchanged on failure). |
| 2 | Rate-limit headers | partial | AC7.3 enforces on-demand-only (respects OpenRouter 20 req/min); AC7.9 handles "rate-limited" as a generic error state. But no explicit handling of a `429` / `Retry-After` header (e.g. surfacing wait time). Low-severity — see D004. |
| 3 | Pagination contract | n/a | Deliberate MVP scope: `getMarkets` caps `limit=20` (plan §4 P3); no infinite-scroll/load-more by design. Search uses `limit_per_type`. Documented, not omitted. |
| 4 | Timezone / locale | missing | `Market.endDate` is an ISO string and volume/liquidity are numbers, but no requirement specifies locale/timezone formatting for display (e.g. how `endDate` renders, thousands separators, % rounding). Low-severity omission — see D003. |
| 5 | Audit-log schema | present | plan §6: 9 named, typed structured log fields + retention-agnostic sink; apiKey explicitly excluded. |
| 6 | Multi-tenant isolation | n/a | Single-user, local-only app (localStorage + Pinia); no tenancy surface. |
| 7 | Deprecation window | n/a | Greenfield app; no existing public API to sunset. |

## Perspective-based reading (Phase 8)

- **Operator (3am):** Well served. Rollback is `wrangler rollback` (seconds, immutable
  versions) with git-revert secondary (plan §8 / deploy doc §6); runbook is task T902;
  observability fields/alerts in plan §6 (Gamma error-rate >20%/5m, AI failure >50%/10m,
  CI gate failure blocks deploy). No pager/on-call gap for a static SPA.
- **Attacker:** Kill-chain is enumerated (T1–T10) and each HIGH maps to a mitigation task.
  CSP `connect-src` is correctly scoped to the two required origins (Gamma + OpenRouter);
  both the `/models` discovery and `/chat/completions` predict calls fall under
  `openrouter.ai`, so no CSP gap. `v-html` forbidden by lint rule (T2). Residual: an XSS
  could read the localStorage OpenRouter key — but that is an accepted property of the
  user-supplied-key design (D4), mitigated by forbidding `v-html` + strict CSP + no other
  untrusted-HTML sink. No enumerated-but-unmitigated threat.
- **New-hire dev:** The spec is implementable from its own text. Minor under-specification:
  AC5.1's receipt `avgPrice` for a mock isn't explicitly defined (presumably = selected
  snapshot price; T202.2 implies it) — worth one clarifying sentence but not blocking. The
  analysis doc mentions `getLivePrice` in the service; the spec correctly drops it as
  deferred (D3) — a new-hire following spec.md alone won't build it, which is intended.

## DBR taxonomy (Phase 8)

| Bucket | Count | Notes |
|---|---|---|
| omission | 1 | Timezone/locale display formatting unspecified (D003). |
| ambiguity | 1 | Mock receipt `avgPrice` derivation not pinned (D005, low). |
| inconsistency | 2 | tasks.md coverage-check overstates NFR coverage (D001); HARDEN-REPORT task count 55 vs 58 (D002). |
| incorrect_fact | 0 | Re-scanned: every checkable external fact (dep versions, CVE status, endpoints, DS tokens) verified TRUE. The one "false claim" (coverage check) is an internal-consistency defect, not an external-fact error, so it is classed under inconsistency, not here. Bucket legitimately empty. |
| extraneous | 1 | Rate-limit-header handling is partial rather than a defect of commission (D004); no truly extraneous requirement found. Re-scanned: §7 contracts all forward-link; no orphan design elements. |

## Defect ledger

### D001 — tasks.md "Coverage check" falsely claims complete NFR coverage
| Field | Value |
|---|---|
| Severity | medium |
| DBR bucket | inconsistency |
| Spec location | `tasks.md:119` (Coverage check) vs `spec.md` NFR anchors |
| Blocks promotion | no |
| Remediation hint | Either add task `refs:` for NFR-DS-2 (mono-indigo accent — pin to T501/T607 confidence-bar), NFR-DS-6 (radius/shadow/motion-by-role — pin to T503/T505/T506), NFR-DS-7 (SJ*/W* naming + DS patterns — pin to Group 5/6 or T609), and NFR-SEC-3 (public unauthenticated reads — pin to T201.4/T708); OR soften the coverage-check sentence to state ACs are fully task-traced and these 4 NFRs are enforced cross-cuttingly. Prefer adding the refs. |
| Evidence against | Programmatic grep: `NFR-DS-2`, `NFR-DS-6`, `NFR-DS-7`, `NFR-SEC-3` appear 0 times in tasks.md, while line 119 asserts "every NFR … is referenced by ≥1 task". |

### D002 — HARDEN-REPORT internal task-count inconsistency (55 vs 58)
| Field | Value |
|---|---|
| Severity | low |
| DBR bucket | inconsistency |
| Spec location | `HARDEN-REPORT.md:46` ("55 tasks") vs `HARDEN-REPORT.md:9,24` ("58 tasks") |
| Blocks promotion | no |
| Remediation hint | Fix line 46 to "58 tasks (47 top-level + 11 subtasks)". Actual count verified: 47 top-level + 11 subtasks = 58. |
| Evidence against | grep count: 47 unique top-level `T###` + 11 unique `T###.#` subtasks = 58; Phase-12 table row says 55. |

### D003 — Timezone/locale display formatting unspecified
| Field | Value |
|---|---|
| Severity | low |
| DBR bucket | omission |
| Spec location | `spec.md` US3/US4 (card/detail content) — no locale/tz requirement |
| Blocks promotion | no |
| Remediation hint | Add one AC or NFR line: render `endDate` in a stable UTC/locale-aware format, and format volume/liquidity/percentages with a documented rounding + thousands-separator convention. Prevents "26/jun/2026" vs "6/26/2026" and NaN%-rounding drift between components. |
| Evidence against | AC3.2/AC4.1 require volume/liquidity and price-% display but no formatting contract; `Market.endDate: string` (plan §2) has no display spec. |

### D004 — Rate-limit (429/Retry-After) handling only generic
| Field | Value |
|---|---|
| Severity | low |
| DBR bucket | extraneous (partial-coverage, not commission) |
| Spec location | `spec.md#ac7-9` |
| Blocks promotion | no |
| Remediation hint | Optional: have AC7.9 / `useAiPrediction` surface a rate-limit-specific message (and, if present, the `Retry-After` wait) distinct from a generic error, since OpenRouter free tier (20 req/min) will realistically 429. Current generic error+retry is acceptable for MVP. |
| Evidence against | AC7.3 prevents auto-call; AC7.9 lumps "rate-limited" into the generic error state with no header-driven backoff. |

### D005 — Mock receipt `avgPrice` derivation not pinned
| Field | Value |
|---|---|
| Severity | low |
| DBR bucket | ambiguity |
| Spec location | `spec.md#ac5-1` / `plan.md:65` (`BetReceipt.avgPrice`) / `tasks.md` T202.2 |
| Blocks promotion | no |
| Remediation hint | State that the mock's `avgPrice` = the selected outcome's snapshot price (from `Market.prices[i]`), so cost/shares math and the receipt agree. Currently implied but not asserted. |
| Evidence against | AC5.2/5.3 compute cost/shares from "the selected outcome's snapshot price" but AC5.1's receipt `avgPrice` field is not tied to that value in text. |

## Uncertainties

1. Perf/cost budgets (plan §4/§7) are derived from web.dev norms, not a `constitution.md`
   (none exists). Sound but un-ratified — the harden already flags this (warning #4).
2. AC7.4 model IDs are future-dated/volatile; not independently confirmable, but the
   runtime-discovery + `openrouter/free` fallback design makes any single stale ID
   non-fatal, so this is by-design, not a defect.
3. External endpoints (Gamma, OpenRouter) were not live-fetched this run; their usage
   matches the research docs verbatim and the CORS/`*` claim is documented upstream.

## Loop guard (Phase 11)

First audit iteration (no prior `AUDIT-REPORT.md`, no `.audit-iteration`). No stuck-loop
possible. Iteration recorded = 1.

## Cost ledger

Audit performed inline (no paid subagent fan-out). External calls: npm registry (7 `npm
view`), OSV.dev (9 version-specific queries) — all free. Estimated LLM cost: negligible,
well under the $5/spec ceiling.

## Next steps (directed at harden / human)

- **Verdict is PASS-WITH-CONCERNS — the spec is NOT reverted to draft.** It remains
  promotable. No `BLOCKER-AUDIT.md` written (0 high-severity blockers).
- **Recommended before/at promotion (cheap, non-blocking):** apply D001 (add the 4 missing
  NFR task refs — the highest-value fix, restores the coverage-check's truth) and D002 (fix
  the 55→58 count). D003/D004/D005 are nice-to-have polish that can be folded into the
  relevant tasks during implementation.
- **These do not require a full `/spec-harden` re-run.** They are surgical edits to
  tasks.md / HARDEN-REPORT.md (and optionally 1–2 clarifying lines in spec.md). A human or
  a targeted harden Phase-0.5 pass can apply them.
- **Then:** `/promote-tasks polymarket-widget`.
