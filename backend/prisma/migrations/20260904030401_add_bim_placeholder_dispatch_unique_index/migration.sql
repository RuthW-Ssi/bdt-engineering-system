-- Prevent a race between concurrent BIM extraction completions from
-- creating two placeholder dispatches for the same project. A plain
-- (project_id, source) unique constraint would be wrong — a project
-- legitimately has MANY 'BOM_UPLOAD' dispatches (one per zone/revision)
-- over time; only 'BIM_PLACEHOLDER' must be singular per project. Prisma
-- schema syntax doesn't support partial/filtered unique indexes on
-- PostgreSQL, so this is hand-written SQL — see the matching comment on
-- bom_dispatch.source in schema.prisma.
CREATE UNIQUE INDEX "bom_dispatch_project_placeholder_unique" ON "bom_dispatch"("project_id") WHERE "source" = 'BIM_PLACEHOLDER';
