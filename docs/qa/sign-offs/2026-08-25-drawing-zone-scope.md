# QA Sign-off — Drawing Zone-Scope Rescope

- **feature:** Drawing (re-scoped Project → Zone required + Sub-zone optional)
- **branch:** `dev-t-drawing-zone-scope`
- **date:** 2026-08-25
- **decision:** **WARN** (qa) · **PASS** (security, dispatched in parallel — see `docs/security/findings/2026-08-25-drawing-zone-scope.md`, 0 Critical/High/Medium, 1 Low/INFO hardening note F-01) · combined `/release-gate` decision = **WARN**, driven solely by QA-01
- **approved_for_ship:** true — user explicitly confirmed proceeding despite QA-01 ("y" in chat, 2026-08-25), matching this project's WARN-override pattern
- **user_overrode:** true — user will perform their own live click-through once this ships (their own words: "เอาขึ้นเลยจะได้ไปลอง test" / "push it up so I can go test it"), which is expected to close QA-01 retroactively
- **note on scope:** security ran in parallel as part of the same `/release-gate` pass (not omitted) — see the security findings file for the full OWASP-mapped review.

## checks_performed

| # | check | performed | result |
|---|---|---|---|
| 1 | Notion task DoD all checked | substituted — no Notion task exists; matched against `drawing-zone-scope-plan.md`'s "Confirmed decisions" + "Architecture" sections | pass — every architecture bullet (schema, migration, GCS key format, backend API shape, frontend pickers) verified byte-for-byte against the actual `git diff origin/main..dev-t-drawing-zone-scope`. See QA-02 for the process-deviation note (Low). |
| 2 | Wiki test summary exists at `wiki/tech/testing/per-feature/drawing.md` | yes | pass — dated 2026-08-25 (current), present |
| 3 | Wiki summary DoD coverage map = 100% PASS | yes | pass — all 9 rows ✅; 3 of the strongest claims independently re-verified this session (12/12 Jest tests re-run, migration SQL byte-matched, full-suite 606/623 regression-free claim reproduced against an isolated `origin/main` worktree) |
| 4 | Raw test report exists with current date | no dedicated `docs/test-scripts/drawing/` report | pass, explained — `drawings.service.spec.ts` is 160 lines / 12 tests, comparable in size to `bom-matching.service.spec.ts` (175 lines) and `cycle-time.service.spec.ts` (138 lines); small-test-surface rationale checked and reasonable, not a gap |
| 5 | Backend coverage on changed files (90% svc · 80% ctrl · 100% DTO) | yes | pass w/ Low finding — `drawings.service.ts` 100%, `create-drawing.dto.ts` 100% (both meet/exceed target); `drawings.controller.ts` and 2 simple query DTOs 0%, but this is a codebase-wide pre-existing convention (0/38 controllers anywhere in this repo have dedicated spec files) — see QA-04 |
| 6 | CI on branch is green | n/a | branch not yet pushed to `origin` (`git ls-remote --heads origin dev-t-drawing-zone-scope` empty) — no CI run exists, not a red-CI signal. See QA-06. |
| 7 | Wiki diff present for changed area | yes | pass — `wiki/features/drawing.md`, `tech/backend/api.md`, `tech/data-model.md`, `tech/backend/decisions.md` all substantively + accurately updated in knowledge-base commit `496366a`, consistent with the actual code diff |
| 8 | Manual test evidence (user-provided) | evidence exists but is implementer/subagent-reported, not user-confirmed | **WARN — Medium finding QA-01** |
| 9 | Smoke test (playwright, if E2E exists) | in-session Playwright MCP run cited (not a committed `.spec.ts` E2E suite) | same caveat as #8 — detailed and specific (network responses 201/200/200, 0 console errors, independent per-zone version counters exercised) but not independently checkable by QA and not user-witnessed |
| 10 | No active BLOCK from security subagent | not performed in this run (qa-only dispatch) | n/a — out of scope for this review; `/release-gate` must still run `security` in parallel before merge |

## findings

- `docs/qa/findings/2026-08-25-drawing-zone-scope.md` — 6 findings: 0 Critical, 0 High, 1 Medium (QA-01), 3 Low (QA-02, QA-03, QA-04), 2 Info (QA-05, QA-06)

## summary

No Critical/High defects. Every checkable claim in the plan's "Confirmed decisions"/"Architecture" sections and the wiki test summary's DoD coverage map was independently re-verified in this pass and found accurate: the schema/migration match the plan byte-for-byte (including the `DELETE FROM "drawing"` — not `TRUNCATE` — and the `RESTRICT`/`SET NULL` FK referential actions), the 12 `drawings.service.spec.ts` tests re-run clean, the full backend suite's 606/623-passing claim reproduced exactly with the same 17 pre-existing failures confirmed by reproducing them against an isolated `origin/main` worktree, both `tsc --noEmit` checks are clean, and all 4 wiki pages were substantively updated in a matching knowledge-base commit.

The one substantive gap is **QA-01**: the manual/smoke test evidence in the wiki summary comes from an implementer subagent's own Playwright session report, not a human-user-confirmed scenario (screenshot, chat confirmation, or Notion completion note). The detail is specific and internally consistent with everything else independently checked in this pass, which raises confidence it's a faithful report — but `qa.md`'s own anti-pattern list is explicit that "trust me" from an agent is not sufficient; this needs to come from the user. This alone is a Medium finding, calibrated as **WARN**, not BLOCK — nothing here contradicts the implementation or suggests the flow doesn't work, this is a provenance/evidence-quality gap, not a correctness gap.

Two additional Low findings (QA-02: no Notion task filed for this SDD run; QA-03: wiki test summary self-authored by the controller rather than a dedicated `tester` subagent) are process deviations from this project's normal `/release-gate` flow. Per this run's explicit scope, these are not auto-BLOCKed — the underlying artifact content was judged on its own merits and found accurate under independent re-verification, so these are logged for audit-trail hygiene rather than treated as coverage gaps.

**Recommendation:** get explicit user confirmation of the manual flow (either "yes I watched/reviewed this" or a quick fresh click-through: project → zone → sub-zone → upload → download → delete) before flipping this to PASS. Everything else is ship-ready. If the user confirms, re-run this sign-off with `approved_for_ship: true` and `user_overrode: true` (WARN-accepted), following the pattern already established in `docs/qa/sign-offs/2026-08-24-drawing-gcs-dxf.md`.

**Process note:** file a retroactive Notion Task + Feature for this SDD run (matching the `2026-08-24-drawing-gcs-dxf.md` precedent) so this shipped work is discoverable from the sprint board.
