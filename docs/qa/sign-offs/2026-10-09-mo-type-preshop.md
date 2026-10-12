# Release gate sign-off · mo-type-preshop (2026-10-09)

Branch `dev-t-mo-preshop` → `dev`. Reviewers: qa + security as separate general-purpose agents loaded with the role cards (named subagent types unavailable in this environment).

| Reviewer | Verdict | Findings |
|---|---|---|
| qa | WARN | 4 Medium · 6 Low — `docs/qa/findings/2026-10-09-mo-type-preshop.md` |
| security | WARN | 3 Medium · 5 Low — `docs/security/findings/2026-10-09-mo-type-preshop.md` |

## Fixed before merge (each with a test that failed first)
- **Security M1** — a Full shop MO's `POST /mo/:id/preshop` refuses pre-shop rows even with `source: 'BOM'`.
- **Security M2** — `bom-link` checks the target BOM row has the sets left (`assertQtyWithinRemaining`) before moving a line onto it (Full shop new version, keep-same switch, pre-shop link).
- **Security M3** — PDF import: `.pdf` + `%PDF-` header required, ≤ 50 MB per request, ≤ 200 pages per file, `doc.destroy()` in `finally`; Dispatch Note import `.xls/.xlsx` only.
- **Security L3 / L5** — `assembly_lines` ArrayMaxSize 2000; `LinkBomFinalDto` numbers capped; upload `notes` ≤ 50 × 300 chars (frontend trims to match).
- **Body limit** — JSON body 5 MB (Express default 100 KB would 413 a large pre-shop save).
- **QA F-001** — SYS-PRESHOP / OP-000 seeds skip themselves on an empty DB (shadow / fresh test DB). Not yet applied anywhere but local.
- **QA F-002** — Complete QC check matches WOs to operations by sequence, not op id (a re-created op no longer blocks Complete forever).
- **QA F-004** — `linkBom` Rev bump is an explicit flag (no Thai-text regex); test: a plain keep bumps no Rev.
- **QA F-005** — pre-shop rows can never be picked as BOM lines (server side, `resolveZone`).
- **QA F-007** — no empty prefix chip on WOs of MOs without a prefix.

## Deferred / accepted
- **QA F-003** — before the dev → staging PR: read-only SELECT on Supabase for IN_PROGRESS MOs that the new Complete gates (BOM compare + QC) would now block.
- **Security L1** — `xlsx@0.18.5` CVEs (pre-existing dependency; now also used by the pre-shop DN import). Upgrade to SheetJS ≥ 0.20.2 as its own task.
- **Security L2** — `pdfjs-dist@3.11.174` (CVE-2024-4367 mitigated: `isEvalSupported: false`, text extraction only).
- **Security L4** — zone-bom / zone-check readable by any logged-in user (same as the existing API1 entry in the risk register).
- **QA F-006 / F-008 / F-009** — remaining-qty cap covered by its own pre-existing tests, not re-tested per suite; no `docs/test-scripts` report; Notion tasks created in this release.

## Evidence
- Backend jest: MO + WO suites 621/621; full suite 17 failures in 4 suites (`cycle-time`, `template-binding`, `bom-matching`, `project-progress`) — identical on a clean `origin/dev` worktree (pre-existing).
- Frontend vitest 362/362; `pnpm run build` (tsc -b + vite) OK; backend `tsc --noEmit` clean.
- Live (local): Celestica DN + PDF import, fake PDF rejected; user's manual test of pre-shop and Full shop ("แจ่มตามที่คุยกันไว้เลย ok มาก").

Result: **PASS after fixes** (no Critical/High; every Medium fixed except F-003, which is a pre-staging step).
