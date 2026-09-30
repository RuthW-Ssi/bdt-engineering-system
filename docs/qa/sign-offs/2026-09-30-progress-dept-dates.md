# QA Sign-off — Progress Plan/Actual dates shared with BCD

- **feature:** each section's Plan/Actual dates (Fabrication, Transport, Erection) editable by the section owner AND BCD; map = 7 field groups
- **commit:** `d0ad81d` on `dev-t-progress-dept-dates` (PR #206)
- **date:** 2026-09-30
- **qa decision:** PASS — findings `docs/qa/findings/2026-09-30-progress-dept-dates.md` (F-001 Low wiki rollout note, fixed in wiki; F-002 Low no per-input group test)
- **security decision:** PASS — findings `docs/security/findings/2026-09-30-progress-dept-dates.md` (F-001 Low: a field in no group is unrestricted; not exploitable today, coverage test guards it)
- **approved_for_ship:** true · **forced_ship:** false
- **evidence:** wiki/tech/testing/per-feature/progress-dept-perms-and-change-password.md § 2026-09-30

## Follow-ups
- Deny-by-default for changed fields outside any group (security F-001, optional).
- Production: `erection-member` BCD → BTC; Material Payment owner → BCD.
