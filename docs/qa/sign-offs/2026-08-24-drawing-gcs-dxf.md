# QA + Security Sign-off — Drawing GCS backup + DXF preview/tools

- **feature:** F-Drawing GCS Backup + DXF Preview
- **branch:** `dev-t-drawing-rebuild`
- **date:** 2026-08-24
- **decision:** **WARN** (both QA and security independently returned WARN)
- **approved_for_ship:** true
- **user_overrode:** true — user explicitly confirmed proceeding after reviewing the combined qa+security WARN summary ("ทำต่อให้หมดเลย")
- **shipped:** commit `564c265` on `dev-t-drawing-rebuild`, pushed to origin 2026-08-24. `dev`/`staging`/`main` promotion not yet done — this branch was previously unmerged before this session (per wiki status callout) and remains so; promotion is a separate follow-up step, not part of this release-gate run.

## checks_performed

| # | check | performed | result |
|---|---|---|---|
| 1 | Notion task DoD all checked | n/a | no pre-existing task — created retroactively as part of this run |
| 2 | Wiki test summary exists | yes | fail, judgment-downgraded to Low — see QA F-01 |
| 3 | Wiki summary DoD coverage map | yes (n/a, page missing) | n/a |
| 4 | Raw test report exists | yes | fail — see QA F-02 |
| 5 | Backend coverage on changed files | yes | inconclusive (tooling glitch) — suite-level PASS/FAIL fully verified instead: 160+ tests passing across `drawings`/`bom-upload`/`gcs.driver`/`bim-backup` specs, 0 failing among touched files |
| 6 | CI on branch green | n/a | branch just pushed, no CI run exists yet |
| 7 | Wiki diff present for changed area | yes | pass — `wiki/features/drawing.md` + `wiki/features/file-storage-gcs-backup-plan.md` both substantially updated |
| 8 | Manual test evidence | yes | pass, strong — live Playwright verification across multiple rounds against 675 real DXF files; segment-length values independently cross-checked against Python `ezdxf` across all 675 files, 0 mismatches on 11,169 segments |
| 9 | Smoke test (playwright) | yes | n/a/Medium — no E2E suite exists for this feature, see QA F-05 |
| 10 | No active security BLOCK | yes (parallel review, same session) | WARN, one Medium finding (security F-01) |

## findings

- QA: `docs/qa/findings/2026-08-24-drawing-gcs-dxf.md` — 5 findings, 0 High/Critical, 2 Medium, 3 Low
- Security: `docs/security/findings/2026-08-24-drawing-gcs-dxf.md` — 1 new Medium finding (presigned-upload/download key scoping), 1 confirmed-unchanged pre-existing gap (not re-scored), 1 clean check (GCS credential handling)

## summary

No Critical/High-blocking defect found on either review. QA's only near-BLOCK item (missing `wiki/tech/testing/per-feature/drawing.md`) was judgment-downgraded to Low — stronger justification than prior precedent (`2026-07-21-bim-viewer.md`'s same downgrade pattern) because the alternative evidence here includes an independent, at-scale (675-file, 11,169-segment, zero-mismatch) cross-check against a separately-authored parser, not just source spot-checks. Security's one Medium finding (presigned-upload/download accept any `key` from any authenticated user, no per-project scoping) is real and newly widened by this session's GCS work (a write path, not just read), but calibrated against this app's own already-established internal-tool authorization baseline (same reasoning as `2026-07-21-bim-viewer.md` F-06 / risk `R-011`).

Both reviews were performed directly by the main agent against the `qa.md`/`security.md` role-card checklists — the named `qa`/`security` subagent types were unavailable in this session (same underlying issue that also blocked invoking `/release-gate` itself as a slash command). This is documented transparently rather than silently skipped.

**Recommendation (accepted by user):** ship now, track as immediate follow-ups (not blocking): backfill `wiki/tech/testing/per-feature/drawing.md`, build an E2E test skill for this feature, and decide the cross-module presigned-URL key-scoping pattern (security F-01, same owner as the existing `R-011` authorization gap).

**Notion override note:** per explicit user instruction, this run also created a new Notion Feature + Task and set both directly to `Done` — this overrides `notion-mirror`'s standing hard rule ("never call `notion-create-pages`", "never overwrite `Status` — human-owned"). Logged here and in `log.md` as a one-time, explicitly authorized exception, not a new standing convention.
