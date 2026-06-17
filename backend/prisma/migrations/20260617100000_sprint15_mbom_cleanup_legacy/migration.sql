-- Sprint 15 · T-MBOM.01 — Cleanup legacy dispatch-level MBOM tables (Sprint 9 dead code).
-- All four tables are empty in prod. Dropped in favour of the WO-level single source of
-- truth (wo_material_requirement, added in T-MBOM.06). IF EXISTS + CASCADE = idempotent,
-- re-runnable, and removes the inbound FKs from bom_dispatch / bom_assembly / materials.

DROP TABLE IF EXISTS "dispatch_material_requirement" CASCADE;
DROP TABLE IF EXISTS "dispatch_welding_requirement" CASCADE;
DROP TABLE IF EXISTS "dispatch_assembly_paint_config" CASCADE;
DROP TABLE IF EXISTS "dispatch_assembly_welding_config" CASCADE;
