-- Sprint 15 · T-MBOM.02 — Drop orphan column products.legacy_codes (no code usage).
-- Idempotent: IF EXISTS guard makes this safe to re-run.

ALTER TABLE "products" DROP COLUMN IF EXISTS "legacy_codes";
