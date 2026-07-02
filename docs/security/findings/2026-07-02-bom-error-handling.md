# Security Review — F-BOM Error Handling (Sprint 18)

- **Date:** 2026-07-02
- **Reviewer:** security subagent (OWASP API Top 10 2023 + Top 10 2021 baseline)
- **Branch:** `dev-t-bom-error-handling` (base `dev`)
- **Feature:** Toast-based error handling for 4 BOM pages + global react-query error handler (`src/main.tsx`)
- **Verdict:** **PASS** — no Critical/High/Medium findings against this diff; 1 new Low risk-register item logged (pre-existing, out of scope for this branch)

---

## Scope confirmation

| Check | Result |
|---|---|
| Backend/auth files touched (`JwtAuthGuard`, DTOs, `auth.service.ts`, any `backend/**`) | **None** — `git diff dev...dev-t-bom-error-handling --name-only` returns zero files under `backend/`; no guard or validation logic changed |
| Does this feature touch `bom-upload.service.ts` / `bom-matching.service.ts` / `product-derivation.service.ts` (R-009, log-injection, logged during F-Login review)? | **No** — none of the 3 files appear in the diff; R-009 is unaffected/not relevant to this feature |
| 6 "unrelated" files (`BindingRuleManager.tsx`, `OperationLibraryList.tsx`, `OperationBuilder.tsx`, `ResourceList.tsx`, `RoutingList.tsx`, `RoutingBuilder.tsx`) — net-zero `meta` add/remove claim | **Confirmed at diff level**, not just by reading commits: `git diff dev...dev-t-bom-error-handling -- <these 6 files>` returns **empty output** (exit 0). Traced the pair: commit `144ee2e` added `meta: { skipGlobalErrorToast: true }` to 8 mutation sites across these files; commit `dc5e0da` ("mutation global toast is opt-in, not opt-out") reverted all 8 verbatim after discovering ~25 more `mutateAsync`-style call sites elsewhere that the opt-out design would have double-toasted. Final tree byte-identical to `dev` for all 6 files. |
| New `console.*` / `logger.*` calls anywhere in diff | **None** — `git diff dev...dev-t-bom-error-handling -- src/ \| grep 'console\.'` and `\| grep 'logger\.'` both empty. The one `console.error` mention in the diff is prose inside `docs/superpowers/plans/2026-07-02-bom-error-handling.md`, explicitly contrasting this feature's toast-only approach with the Login feature's (already-fixed) `console.error` pattern — not executable code. |
| Secret/credential grep on diff (`password\|secret\|credential\|DATABASE_URL`) | Clean — only hit is the same prose sentence above ("these errors don't carry credentials") |

---

## `getErrorMessage` reuse (unchanged, shared w/ Login) — leak risk re-check

`src/lib/getErrorMessage.ts` is untouched by this diff (0 hunks). Re-verified its behavior in this feature's new call sites (`useBom.ts`, `useBomDiff.ts`, `BomEditor.tsx`, `main.tsx`'s global handler):

- Returns `error.response.data.message` (string) or joins an array of strings — both **backend-controlled**, already present in the HTTP response body the requesting user's own browser already received. No new data is surfaced that wasn't already delivered to that same authenticated user.
- Never touches `error.config` (headers/request body — where a leaked JWT or request payload would live), never logs, never persists.
- Falls back to a static, feature-supplied string for network errors / non-Axios errors / <500 status without a `message` field — no raw error object ever reaches the fallback path.

**Conclusion: same as the Login review's finding — clean.** No behavior change since `getErrorMessage.ts` isn't in this diff.

## `main.tsx` global handler — new attack surface check

- `QueryCache.onError` / `MutationCache.onError` both route through `getErrorMessage()` → `toast.error(string)` (sonner). No `dangerouslySetInnerHTML` / `innerHTML` anywhere in the diff or in `sonner`'s consumption pattern here — `toast.error` takes a `ReactNode`/string and sonner renders it as a text node, so even a maximally adversarial backend `message` string (e.g. containing `<script>` markup) cannot execute — React's default text-node escaping applies, same as any other JSX text child.
- Query handler is **opt-out** (`query.meta?.skipGlobalErrorToast`), mutation handler is **opt-in** (`mutation.meta?.showGlobalErrorToast`) — asymmetry is intentional (commit `dc5e0da`) and doesn't create a security gap, only a UX one (avoids double-toasting); reviewed for correctness, not a security concern.
- Handler surfaces only what the backend already sent in the response body to this same authenticated request — no cross-origin, no cross-user data mixing possible via `QueryClient`'s per-browser-tab cache.

**Conclusion: no new attack surface introduced.**

---

## Findings

_None against this diff._ No Critical/High/Medium/Low findings attributable to the changes in `dev-t-bom-error-handling`.

## Observation (not a finding against this diff — logged to risk register)

While applying the "does any error path leak something it shouldn't" lens (per this review's brief), found that the pattern the Login feature was flagged and fixed for (raw error object → `console.error`) **still exists pre-existing on `dev`**, in ~19 frontend files unrelated to this branch (including the 6 "net-zero" files touched transiently by this branch — `ResourceList.tsx:59`, `OperationBuilder.tsx:197/212/222`, `OperationLibraryList.tsx:63`, `BindingRuleManager.tsx:55`, `RoutingBuilder.tsx:2172`, `RoutingList.tsx:94`, plus 12 more files). None of these lines are touched by this diff (confirmed via net-zero check above) — out of scope to block this PR. Logged as **R-010** in the risk register (see below) so it isn't lost, mirroring how R-009 was logged during the Login review for an adjacent-but-out-of-scope issue.

---

## OWASP API Top 10 (2023) table

No change — this feature adds no backend endpoints, so the table in `wiki/tech/roles/security.md` is unaffected this cycle.

---

## Definition-of-Done checklist

- [x] All `POST`/`PATCH`/`DELETE` endpoints reviewed for `JwtAuthGuard` — N/A, no backend endpoints in this diff
- [x] DTO validation present on every input — N/A, no backend DTOs in this diff
- [x] Grep clean: `password|secret|key|credential|DATABASE_URL` in diff — clean
- [x] File upload endpoints have all 3 checks — N/A, not touched
- [x] Findings written to `docs/security/findings/` with OWASP category, severity, fix route — this file (no findings to tag; risk register entry tagged below)
- [x] Risk register updated — R-010 appended (append-only)
- [x] Wiki update — deferred to `/release-gate` step 6.1 (`wiki-integrator`, Wiki Write Gate) per standard post-ship cascade; no direct wiki edit made by this review

---

## Decision: **PASS**

No blocking findings. Frontend-only, toast-only feature; reuses an already-reviewed `getErrorMessage` helper unchanged; net-zero confirmed at the diff level for the 6 incidental files; no new logging/console calls; no backend/auth surface touched; R-009 not implicated. One pre-existing, out-of-scope observation logged as R-010 for future frontend follow-up.
