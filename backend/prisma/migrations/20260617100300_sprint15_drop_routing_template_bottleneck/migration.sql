-- Sprint 15 · T-MBOM.04 — Drop forward-looking column routing_template.bottleneck_op_id
-- (never implemented; no code usage). Idempotent: IF EXISTS guard makes this safe to re-run.

ALTER TABLE "routing_template" DROP COLUMN IF EXISTS "bottleneck_op_id";
