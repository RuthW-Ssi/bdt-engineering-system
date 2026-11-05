-- Login lockout (2026-11-05): additive only — four columns with defaults, no data touched.
-- 5 wrong passwords = 1 round; round 1 → 1 min, round 2 → 5 min, round 3 → blocked
-- until an admin unlocks (admins only ever get the 5-min lock). A correct login clears them.
ALTER TABLE "res_users"
  ADD COLUMN IF NOT EXISTS "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "login_strikes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "login_locked_until" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "login_blocked_at" TIMESTAMPTZ;
