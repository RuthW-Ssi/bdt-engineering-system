-- Sprint 15 · T-MBOM.03 — Drop orphan column materials.priority (no code usage;
-- the routing_template_binding_rule.priority column is unrelated and retained).
-- Idempotent: IF EXISTS guard makes this safe to re-run.

ALTER TABLE "materials" DROP COLUMN IF EXISTS "priority";
