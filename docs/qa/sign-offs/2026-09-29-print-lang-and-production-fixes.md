# QA Sign-off — Print Packet Language Toggle + Production Fixes

- **feature:** MO/WO print packet TH/EN toggle + Thai tone-mark fix (subset
  font embedding) · OperationBuilder: library-activity consumables no longer
  re-saved (publish 500) · MO Complete records `actual_finish`
- **commits:** `78d2ab9` (PR #193) · `f626b69` (PR #194) · `b4edbba` (PR #195)
  — all on `dev` at `37c01d0`; scope = `git diff origin/staging origin/dev`
- **date:** 2026-09-29
- **qa decision:** **PASS** (5 Low/INFO)
- **security decision:** **PASS** (1 Low pre-existing, 3 Info)
- **approved_for_ship:** true
- **user_overrode:** false
- **forced_ship:** false
- **reviewers:** qa + security run as `general-purpose` agents loaded with
  `wiki/tech/roles/{qa,security}.md` (named agent types unavailable here —
  same as prior sign-offs)

## Evidence

- Tester summaries: `wiki/tech/testing/per-feature/mo-print-lang.md`,
  `wiki/tech/testing/per-feature/production-fixes-20260929.md`
- QA re-ran on clean `dev` @ `37c01d0`: backend `manufacturing-orders` jest
  151/151, `OperationBuilder.test.ts` 2/2, `tsc -b`, backend `tsc --noEmit`,
  real `pnpm run build` — all clean. Rendered the same Thai-data packet on
  `dev` (th + en) vs `origin/staging`: tone marks fixed, page count / watermark /
  QR icon / drawing pages unchanged, Thai text still extractable.
- Live manual: MO-26000001 print in th/en, OP-DEMO-PAINT publish (201/200),
  MO-26000003 Start→Complete shows Actual Finish.

## Findings

- QA: `docs/qa/findings/2026-09-29-print-lang-and-production-fixes.md`
  (QA-F-001..005, all Low — label/value overprint pre-existing (Q21); api.md
  note for actual_finish; optional prod SQL check for stray `op_act_material`
  rows; no CI test workflow; taller headers may add a "(cont.)" page)
- Security: `docs/security/findings/2026-09-29-print-lang-and-production-fixes.md`
  (F-001 Low: server still accepts consumables on library-linked activities
  and doesn't pre-validate `resource_id` → 500 instead of 400 for a crafted
  client; F-002..004 Info)

## Follow-ups (not blocking)

- Security F-001: server-side guard for consumables on library-linked
  activities + `resource_id` existence check → 400.
- QA-F-002: document `actual_finish` on DONE in `wiki/tech/backend/api.md`;
  MOs completed before this deploy keep Actual Finish "—" (no backfill).
