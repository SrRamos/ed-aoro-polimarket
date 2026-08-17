# HARDEN-REPORT — polymarket-widget

Generated: 2026-08-17
Mode: autonomous (default) · Layout: single-repo · Prior audit: none (first harden run)
Status transition: **draft → ready-for-dev (with warnings)**

Artifacts written/updated:
- `specs/polymarket-widget/plan.md` — **new** (design, threat models, observability, cost, flags, rollback)
- `specs/polymarket-widget/tasks.md` — **new** (executable breakdown, 58 tasks = 47 top-level + 11 subtasks, topological order)
- `specs/polymarket-widget/spec.md` — **updated** (Status → ready-for-dev; D10 + deployment doc linked)
- `specs/polymarket-widget/HARDEN-REPORT.md` — **new** (this file)

## Production Readiness Checklist

✅ Open questions resolved — 0 unresolved (the analysis doc's "confirm TS/JS" and dark-mode-scope notes were already closed in-doc: §9→TypeScript, D6→light-only). No web research required, no BLOCKED.
✅ Codebase integration plan — 6 target dirs (all pre-scaffolded, `.gitkeep`), 0 hard conflicts; seams: `http.ts`, betting factory, AI-mode switch, central `config.ts`.
✅ Dependency validation — 0 new **runtime** deps (vue/pinia/@ramoslabs/tokens already installed, OSV CLEAN); 5 gate/deploy tooling deps validated (exist + 0 CVEs) but gated on `--allow-new-dep` (bonus scope).
✅ Security gates added — 10 threats modeled; HIGH T1/T2/T5 covered by `security:` gate tasks (T708, T803); 0 CRITICAL-unmitigated.
✅ Performance threat model — 6 bottlenecks, all with feasible mitigations; budgets set (bundle ≤150KB gz, LCP ≤2.5s, INP ≤200ms); 0 PERF-IMPOSSIBLE.
✅ Observability concrete — 9 structured log fields, 7 metrics, 6 spans, 3 alerts (plan §6).
✅ Migration plan — N/A (no DB; `localStorage` only, versioned + defensive parse per AC6.4).
✅ Rollback executability — no destructive DB change; `wrangler rollback`/versions for deploy; env switches default-safe (plan §8).
✅ Cost projection — ≈ **$0/month** at demo usage (all free tiers); ceiling +$5/mo if Workers paid tier.
✅ Task breakdown — 3 service epics expanded into atomic subtasks (T201/T202/T203); 58 tasks total (47 top-level + 11 subtasks).
✅ Dependency graph — 10 groups, topological order, 7 parallel-safe groups, critical path documented.
✅ Feature flags — `bet.mode` (`mock`|`real`), `ai.mode` (`user-key`|`proxy`), runtime AI-enable; all default-safe.
✅ Infrastructure detail — `wrangler.jsonc` Phase-1 SPA + GitHub Actions gate→build→deploy specified (from deploy doc).
✅ QA tasks — unit (T701–T704), E2E (T705), a11y (T706), perf (T707), security (T708), manual per-US (T709).
✅ Documentation tasks — README (T901), runbook (T902), flags doc (T903).

## Phases run

| Phase | Notes |
|---|---|
| 0 Layout | single-repo. |
| 0.5 Prior-audit | none — full pipeline. |
| 2 Gap audit | gaps [2,4,5,6,7,8,9,11,12,13,15]. |
| 3 Research | 0 open questions (resolved in source docs). |
| 4 Codebase cross-check | 0 conflicts; integration seams mapped (plan §1–2). |
| 5 Dep validation | 0 new runtime deps; 5 tooling deps CVE-clean (registry + OSV.dev). |
| 6 Security | 10 threats; 2 gate tasks; 0 CRITICAL-unmitigated. |
| 7 Performance | 6 bottlenecks mitigated. |
| 8 Observability | fields/metrics/spans/alerts (plan §6). |
| 9–10 Migration/Rollback | N/A DB; deploy + localStorage rollback documented. |
| 11 Cost | ≈ $0/month. |
| 12 Task breakdown | 58 tasks (47 top-level + 11 subtasks); service epics → subtasks. |
| 13 Dep graph | topological, 7 parallel groups. |
| 14 Feature flags | 3 flags, default-safe. |
| 15 Infra detail | wrangler + Actions from deploy doc. |
| 16 QA tasks | 9 test/security tasks. |
| 17 Docs tasks | 3 docs tasks. |
| 18 Spec rewrite | Status → ready-for-dev; every AC referenced by ≥1 task. |
| 19 Report | this file. |

## Decisions taken autonomously

- **No new runtime dependency introduced** — the entire core widget builds on the already-scaffolded stack; new deps are confined to lint/format gate + `wrangler` (bonus/infra), surfaced as warnings rather than silently added.
- **`pricingReliable` flag added to `Market`** — to satisfy AC1.5 (clamp + flag unreliable pricing) without a separate error channel.
- **Runtime model id cached per session** — mitigates the extra `/models` round-trip on the first AI call (plan §4 P2).
- **CSP `connect-src` restricted to Gamma + OpenRouter** — mitigates T1/T2 key-exfil/XSS blast radius while allowing the two required origins.
- **Budgets derived from web.dev norms** — no `constitution.md` exists to source them from; flagged for later ratification.

## Warnings (ready-with-warnings)

1. ⚠ **New gate/deploy tooling deps** (eslint, prettier, eslint-plugin-vue, @vue/eslint-config-typescript, wrangler) — all validated (exist, 0 CVEs) but require `--allow-new-dep` approval when tasks `setup:T003` / `deploy:T801` are picked up. **Core widget needs none of these.**
2. **Missing `package.json` scripts** referenced by the deploy gate (`lint`, `format:check`, `test:unit`) — added by `setup:T003`.
3. **Bonus / Phase-2 kept as documented future extensions, not blockers** (per spec §6 + task constraints): real on-chain betting (`VITE_BET_MODE=real` + `/api/bet`), server-side AI proxy (`VITE_AI_MODE=proxy` + `/api/ai/predict`), live CLOB pricing. Deploy ships static SPA with `mock` + user-supplied key.
4. **No `constitution.md`** → perf/cost budgets (plan §4/§7) derived from research + web.dev norms; ratify if a constitution is later added.

## Hard blockers

**None.** No missing core deps, no unmitigated CRITICAL, no PERF-IMPOSSIBLE, no BLOCKED research, cost ≈ $0.

## Next steps

- Optional gate before promotion: `/spec-audit polymarket-widget` (adversarial audit).
- Promote to backlog: `/promote-tasks polymarket-widget`.
- When implementing gate/deploy tasks (Group 8 + `setup:T003`), re-run with `--allow-new-dep` to approve the tooling deps.

## Cost ledger

Hardening performed inline (no paid subagents spawned); external calls limited to npm registry + OSV.dev lookups (free). Estimated LLM cost: negligible (single-agent, no Opus subagent fan-out).
