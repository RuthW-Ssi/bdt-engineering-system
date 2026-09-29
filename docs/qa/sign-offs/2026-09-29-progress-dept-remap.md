# QA Sign-off — Progress Department Remap (same-day correction)

- **feature:** remap of the already-shipped progress department sections (PR #199, gated in
  `2026-09-29-progress-dept-perms-and-change-password.md`): Material Payment = **BCD**,
  Transport = **BSC** (now separate sections), Erection = **BTC**, Fabrication = BDP unchanged;
  `BTC` added to the Users-page department list
- **commit:** `71a1cfa` on `dev-t-progress-dept-remap`
- **date:** 2026-09-29
- **qa decision:** not run · **security decision:** not run
- **approved_for_ship:** true
- **forced_ship:** **true** — reason: "user explicitly waived qa + security for this remap"
  (user, 2026-09-29: "ไม่ต้อง qa secure แล้ว"). Context: the mechanism (enforcement paths,
  live DB role, UI locks) is unchanged and was gated PASS/WARN earlier the same day; this
  change only edits the section → department map and splits one section in two. Production
  was running the wrong mapping, so the fix was treated as urgent.

## Evidence (tester, not reviewer)
- backend `projects` jest 149/150 (1 pre-existing `getProjectRows` failure); frontend vitest 155/155; `tsc` both sides.
- Live API matrix, 6 roles × 4 sections: BDP→Fab, BCD→Payment, BSC→Transport, BTC→Erection, BTE none, admin all.
- Live UI as BSC: Payment "Editable by BCD only *", Erection "Editable by BTC only *", Transport editable.
- Spec updated: `wiki/features/progress-department-permissions.md`.

## Required after deploy
- Production users: `erection-member` BCD → **BTC**; whoever handles Material Payment → **BCD**; `supply-chain-member` (BSC) now edits Transport only.
