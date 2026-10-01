# QA Sign-off — MO/WO user-entered actual dates + WO On Plan/Delayed

- **feature:** Start no longer stamps actual_start; MO/WO Complete opens a Confirm modal where the user types Actual Start/Finish (WO also On Plan/Delayed + required delay reason); DONE-only edit via `PATCH /mo|wo/:id/actual-dates`, audited in `mail_message`
- **commit:** `b5e7b74` on `dev-t-mo-wo-actual-dates`
- **date:** 2026-10-01
- **qa decision:** not run — user waived `/release-gate` ("ยังไม่ต้อง release-gate push commit merg dev staging main ได้เลย")
- **security decision:** not run — same waiver
- **approved_for_ship:** true · **forced_ship:** true
- **migration:** `20261001100000_wo_timeliness_delay_note` — additive only (CREATE TYPE + 2 nullable columns). Read-only Supabase check before merge: latest applied `20260930120000_res_users_user_type`, no unfinished migrations, no existing `WoTimeliness` type/columns, 2 work_order rows, none in flight.
- **evidence (pre-waiver):**
  - backend jest 1045 tests — same 17 pre-existing failures as the `origin/dev` baseline, 0 new; MO/WO/common 369/369
  - frontend vitest 177/177; `pnpm run build` passes
  - multi-lens review (backend, frontend, contract, security, qa) with adversarial verify: 1 Low confirmed (3 masked WO `done()` negative tests), fixed
  - live Playwright run on local (DB snapshot, restored afterwards): API 400/409, customer 403 on both new routes, WO and MO Start → Complete → edit flows, timezone round-trip, audit rows, 0 console errors
  - wiki: `tech/testing/per-feature/mo-wo-actual-dates.md`

## Follow-ups
- Run the skipped qa/security review if wanted.
- One new `react-refresh/only-export-components` lint error in `ActualDatesModal.tsx` (same pattern as `WoDetail.tsx`).
