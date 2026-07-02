# QA Findings — F-Customer/Project/Zone Error Handling
_Date: 2026-07-02 · Branch: dev-t-customer-project-zone-error-handling (local only, not yet pushed) · Feature: F-Customer/Project/Zone Error Handling (T-S18.12–15) · Sprint 18_
_Reviewer: qa subagent · Dispatched by /release-gate · Review-only_

---

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 |

**Decision: PASS** — no Medium/High/Critical findings. Two Low/informational findings, both already disclosed by the tester in the wiki summary's "Known gaps" section; neither blocks ship.

---

## Findings

### F-01 · LOW — 2 of 7 mutations' success paths verified via code review only, not independently re-run live

- **where:** `src/pages/ProjectList.tsx` (`handleSubmit`, project create) and `src/pages/CustomerList.tsx` (`handleSubmit`, customer update branch) — verified in wiki summary `wiki/tech/testing/per-feature/customer-project-zone-error-handling.md` DoD coverage map, rows 1 and 3; also disclosed in "Known gaps."
- **what:** Project create and the customer-update branch of `CustomerList.handleSubmit` were live-tested on the failure path (Playwright, backend down → toast + modal stays open) but not independently re-run live on the success path (Playwright, backend up → toast + modal closes). Time-boxed rather than skipped for cause.
- **evidence:** Direct code read (`git diff dev...dev-t-customer-project-zone-error-handling -- src/pages/CustomerList.tsx src/pages/ProjectList.tsx`) confirms both sites share a byte-identical control-flow shape with `CustomerList.tsx`'s customer-create branch, which *was* round-tripped live both ways (wiki summary row 1): `try { await mutateAsync(...); toast.success('<copy>'); <close modal / reset state> } catch { /* empty, relies on global handler */ }`. No divergent logic, no unique error-path branching in either unverified site.
- **severity:** Low — much smaller and better-mitigated gap than the same category of finding raised for the BOM feature (2/7 here vs. 5/8 there): the unverified sites are structurally identical (not just "similar") to a site that was live-tested both ways, the reason is a deliberate time-box (not a discovered environment gap), and the gap is disclosed with clear reasoning in the tester's wiki summary.
- **fix_route:** tester — optional follow-up, not blocking: live-verify these 2 success paths in a future session if time allows; not required before ship.

---

### F-02 · LOW — One test artifact left in dev DB from live success-path testing

- **where:** Zone `B1 / Regression Test Zone` on project `0X123` (dev database) — disclosed in wiki summary `wiki/tech/testing/per-feature/customer-project-zone-error-handling.md` "Known gaps."
- **what:** Created during the live success-path check for zone create; no zone-delete/archive UI exists in this app (only sub-zones support archive), so it can't be cleaned up through normal app flows and is left in place as harmless dev-environment data.
- **evidence:** Wiki summary "Known gaps" section: "One test artifact left in the dev DB: zone `B1 / Regression Test Zone` on project `0X123`... left in place as harmless dev-environment data, flagged to the user."
- **severity:** Low — dev-environment-only data, no user-facing or production impact, already flagged.
- **fix_route:** devops/data — optional dev-DB cleanup (manual delete or a future zone-delete admin script); not scoped to this feature and not blocking.

---

## Notes (non-findings, for context)

- **Implementation matches plan exactly, line for line.** Diffed `src/hooks/useCustomers.ts`, `useProjects.ts`, `useProjectZones.ts`, `useSubZones.ts`, `src/pages/CustomerList.tsx`, `ProjectList.tsx`, `ZoneList.tsx` against `docs/superpowers/plans/2026-07-02-customer-project-zone-error-handling.md` — every step (meta flags, try/catch shapes, the `finally` in `saveReorder`, the inline `onSuccess` for the fire-and-forget sub-zone delete, the `getErrorMessage` migration in `handleDelete`) matches the plan's code blocks exactly.
- **`meta: { showGlobalErrorToast: true }` applied to exactly the 7 intended mutations, no more, no less.** `grep -rn "showGlobalErrorToast" src/` confirms 7 call sites (`useCreateCustomer`, `useUpdateCustomer`, `useCreateProject`, `useCreateZone`, `useUpdateZone`, `useCreateSubZone`, `useDeleteSubZone`) plus the `main.tsx` declaration/handler. `useDeleteCustomer` (has its own local error handling) and `useUpdateSubZone` (no call site) correctly excluded, matching the design's explicit non-goals.
- **`useUpdateSubZone` confirmed zero call sites** via `grep -rn "useUpdateSubZone" src/` — only its own definition appears. Matches the design spec's and wiki summary's claim.
- **No double-toast risk.** Read `src/main.tsx`'s `MutationCache.onError` (lines 32–37) directly: it fires `toast.error(...)` only when `mutation.meta?.showGlobalErrorToast` is set, and every guarded call site's local catch block is empty (or, for `saveReorder`, only does `finally { setSavingReorder(false) }` with no `toast.error`) — exactly one error-signaling mechanism per mutation, consistent with the wiki summary's claim and the double-toast regression class the tester says they specifically checked for (this was a real bug class found during BOM).
- **Security-relevant migration verified.** `CustomerList.tsx`'s `handleDelete` catch no longer does `console.error(e)` on the raw caught error — removed per the design's stated rationale (leak risk: `AxiosError.config` can carry the `Authorization` header). Consistent with the Login/BOM-established convention. (Full security posture is security subagent's call, not re-litigated here.)
- **Scope discipline confirmed.** `git diff dev...dev-t-customer-project-zone-error-handling --stat` touches only the 7 source files the plan named (+ 2 docs: design spec, implementation plan) — zero `backend/` files, consistent with "frontend-only" framing throughout Notion/spec/wiki.
- **`npx tsc -p tsconfig.app.json` reproduced independently → exit code 0, no output**, matching the wiki summary's claim.
- **CI genuinely N/A for this branch, not just unpushed.** `gh run list --limit 1 --branch dev-t-customer-project-zone-error-handling` returns no runs (branch not yet pushed). Beyond that, both configured workflows (`deploy-backend.yml`, `migrate-deploy.yml`) trigger only on `push` to `staging` with `backend/**` or `backend/prisma/**` paths — this is a frontend-only change on a feature branch, so no workflow would fire even after merge to `dev`. Treated as N/A per role-card guidance for this repo, not a red flag.
- **Wiki feature-page update correctly not yet present** — `wiki/features/error-handling.md` has sections for Login and BOM but not yet this feature. Per `bdt-app/CLAUDE.md` §5.2, this is Step 6.1 of the post-ship docs cascade (`wiki-integrator`, after commit/push), not a pre-gate item. Not raised as a finding, per explicit dispatch instructions for this run.
