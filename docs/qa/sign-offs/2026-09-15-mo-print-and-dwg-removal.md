# Release Sign-off — MO Print Packet + DWG Removal (PDF-only) + WoVisualTab split fix

- **feature:** MO Print Packet (new) · Drawing DWG removal, `.pdf`-only (removal) · WoVisualTab 3D/Drawing split (UX tweak) — three logically distinct pieces landing together in one branch/ship at explicit user request
- **branch:** `dev-t-mo-print-packet` (based on `dev` @ `9eaa78f`)
- **date:** 2026-09-15
- **qa decision:** PASS (0 Critical/High/Medium, 3 Low/Info — see below)
- **security decision:** WARN (0 Critical/High, 1 Medium — `docs/security/findings/2026-09-15-mo-print-and-dwg-removal.md`)
- **aggregate decision (per CLAUDE.md §5.2, worst-of-both):** **WARN**
- **approved_for_ship:** true
- **user_overrode:** true — user explicitly accepted the Medium finding and directed ship to proceed (see "Security WARN — user override" below)
- **ship target:** `dev` → `staging` → `main` (explicit user request — broader than this same-day branch's earlier BOM PRs #176/#178, which were dev+staging only)

## Security WARN — user override

**F-001 (Medium, OWASP API1:2023 BOLA):** `GET /mo/:id/print-packet` checks
only the `orders:view` role permission, not per-project/customer object-level
access — identical in shape to every other `:id` route already on
`manufacturing-orders.controller.ts` (pre-existing, unchanged by this branch;
maps to already-open `R-001`/`R-011`).

Explained to the user in plain terms (any logged-in user with the `orders`
role permission can already view/access any MO in any project today — this
is true of every existing MO endpoint, not something this new endpoint
introduces) and asked whether to proceed or fix first. User's response,
verbatim reasoning: **"ไม่ยังไม่ถึงขนาดแบ่ง project กันแค่มีสิทธิ์เข้าถึงแค่นั้นพอ"**
("no, it's not at the point of needing per-project separation — role-based
access alone is enough for now") — an explicit, reasoned accept, not a
default/uninformed override. Confirms the same precedent already set for
BIM Viewer and Drawing APS Preview: per-project/customer scoping (OWASP
API1:2023 fix) is deferred, tracked app-wide at `R-001`/`R-011`, not
patched per-endpoint.

## checks_performed

Adapted checklist per task framing — Step 1 (Notion DoD check) explicitly skipped (no Notion task exists for this same-day fast-tracked work, precedented earlier the same day by PR #176/#178); `wiki/features/drawing.md`'s dated `### 2026-09-15 removal` section substituted as the tester-equivalent artifact.

| # | check | performed | result |
|---|---|---|---|
| 1 | Notion task DoD all checked | skipped (no task exists, by design) | n/a |
| 2 | Wiki narrative (tester-equivalent artifact) read + claims independently verified against the diff | yes | pass — every claim in the dated section traced to real code, see findings file "Independent verification" |
| 3 | Backend test suite | yes, re-ran (`npx jest`) | pass — 707 total, 690 passed, 17 failed in 4 pre-existing unrelated suites (`cycle-time.service.spec.ts`, `template-binding.service.spec.ts`, `project-progress.service.spec.ts`, `bom-matching.service.spec.ts`), none touched by this branch; all touched-file suites (drawings, mo-print×3, file-storage drivers/controller) 100% pass |
| 4 | Frontend test suite | yes, re-ran (`npx vitest run`) | pass — 60/60, 0 failures |
| 5 | Backend build | yes, re-ran (`pnpm run build`) | pass — clean |
| 6 | Frontend build | yes, re-ran (`pnpm run build`, root) | pass — clean (pre-existing chunk-size advisory only) |
| 7 | Backend coverage on changed files | yes (`npx jest --coverage`) | services/DTOs ≥97.4% (mostly 100%), meets 90%/100% targets; controllers at 0% but confirmed pre-existing repo-wide pattern (28/29 controllers), not a regression — see QA-02 (Low/Info) |
| 8 | High-risk spot-check: Dockerfile ships vendored font to Cloud Run image | yes | pass — `COPY --from=builder /app/assets ./assets` present in runtime stage |
| 9 | High-risk spot-check: `getLatestVersion` hardcodes `.pdf` filter in Prisma `where` | yes | pass — confirmed, not accidentally dropped with `fileType` param removal |
| 10 | High-risk spot-check: `.pdf`-only `@Matches` is real server-side enforcement | yes | pass — case-insensitive, end-anchored, correctly imported, rejects `.dwg` at DTO validation |
| 11 | Dead-code grep for removed DWG-APS symbols | yes | pass — 0 live-code hits, 2 explanatory-comment hits only |
| 12 | `ApsClientService`/`ApsModule` isolation (BIM not broken) | yes | pass — only the dead `drawingBucketKey` getter removed; zero diff in `backend/src/modules/bim/` |
| 13 | `ProgressDrawingPanel.tsx` + `MobileDrawingSheet.tsx` reuse not broken | yes | pass — filter logic updated correctly; `MobileDrawingSheet.tsx` has 0 diff, confirming unchanged reuse |
| 14 | Nothing accidentally staged for commit | yes (`git diff --cached --stat`) | pass — empty; pre-existing untracked debris (per documented repo convention) not staged |
| 15 | Wiki updated for the change | yes (read in full) | pass — dated section exists, coherent, internally consistent with the diff |
| 16 | No active BLOCK from security subagent | not run in this dispatch | n/a — security review out of scope for this task; recommend confirming a parallel security pass exists before/at ship if not already run |

## findings

- QA: `docs/qa/findings/2026-09-15-mo-print-and-dwg-removal.md` — 3 findings, 0 Critical/High, 0 Medium, 3 Low/Info:
  - QA-01: stale comment in `DrawingList.tsx` still describes a removed browse-side DWG/PDF toggle — **fixed in this same commit** (comment rewritten to describe current state, fix_route: fe, already applied)
  - QA-02: `drawings.controller.ts`/`manufacturing-orders.controller.ts` at 0% test coverage, confirmed pre-existing repo-wide pattern (28/29 controllers), not new debt from this branch (fix_route: none required)
  - QA-03: "46 `.dwg` rows deleted, scoped to `project_id=7`" is a data-layer claim — **independently re-verified directly by the implementer this same session** via `SELECT count(*) FROM drawing WHERE project_id=7 AND file_name ILIKE '%.dwg'` (0 remaining) + storage directory listing (0 `.dwg` files, 46 `.pdf` files intact) before this sign-off was written
- Security: `docs/security/findings/2026-09-15-mo-print-and-dwg-removal.md` — 1 finding, 0 Critical/High, 1 Medium (F-001, see above), 0 Low. All other reviewed areas (path traversal, `@Res()` exception handling, PDF injection/DoS, `.pdf`-only enforcement, bulk-delete auth guard, dependency supply-chain, removed-route guard parity) PASS.

## summary

No Critical/High/Medium defect found. All three specifically-flagged high-risk spot-checks (Dockerfile font-shipping, `getLatestVersion`'s `.pdf` filter, `.pdf`-only DTO enforcement) pass on direct inspection — these were the items most likely to pass every unit test while still breaking in a real deploy, and none did. Both test suites and both builds are clean, with the only test failures matching the exact pre-existing 17-test/4-suite baseline (confirmed unrelated by diff, not just by count — none of the 4 failing spec files, or their corresponding services, appear anywhere in `git diff dev --stat`). The DWG-removal's escalating rounds (1 → 2 → 3 → 3b) all check out against the actual diff: dead code fully removed, `ApsClientService`/BIM isolation intact, `ProgressDrawingPanel`/`MobileDrawingSheet` reuse correctly updated/unbroken, and the deliberately-kept `aps_urn`/`aps_translation_status`/`aps_translation_error` columns confirmed to have zero remaining code references anywhere. The MO Print Packet feature's DI wiring (`DrawingsModule` now exports `DrawingsService`), 409 zero-partial-output gate, `getObject`-not-`getDownloadUrl` fix, and frontend blob-error-reparse handling all verified correct by direct source read, not just by trusting the wiki. The wiki (`wiki/features/drawing.md`'s `### 2026-09-15 removal` section) is internally consistent with the diff — no drift found.

**Final decision: WARN, accepted as-is — ready to ship dev → staging → main.**
Security's parallel pass (dispatched alongside this one, not sequentially)
returned WARN on a single Medium finding (F-001) that traces to a
pre-existing, already-tracked, already-precedented app-wide gap — not a
defect introduced by this branch. QA-01 fixed in this same commit. QA-03
independently re-confirmed via direct DB/storage query. No Critical/High
from either pass. User reviewed F-001 in plain language and explicitly
directed ship to proceed.
