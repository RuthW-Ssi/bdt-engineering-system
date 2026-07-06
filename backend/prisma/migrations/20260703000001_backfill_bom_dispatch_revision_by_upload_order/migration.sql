-- Backfill bom_dispatch.revision for rows that predate this feature.
--
-- The preceding migration (20260703000000) added `revision` with a flat
-- DEFAULT 1, which is correct for schema completeness but would collapse
-- every dispatch in any zone/sub-zone that already has more than one
-- dispatch (e.g. a real multi-upload history in staging/production) down
-- to "revision 1" — silently erasing the apparent version history those
-- dispatches already showed in BomList before this feature existed.
--
-- This migration renumbers every existing dispatch per (project_id,
-- zone_id, sub_zone_id) by upload order, replicating exactly the
-- position-based "v1, v2, v3..." numbering the UI already showed for
-- these rows. It intentionally does NOT attempt to guess which pre-
-- existing dispatches "should" have shared a revision (e.g. a Main+Acc
-- pair uploaded close together) — the old system never recorded that
-- intent, so preserving the already-visible ordering is the only
-- non-destructive choice. Going forward, only dispatches created via the
-- new revision-choice upload flow can intentionally share a revision.
UPDATE "bom_dispatch" AS d
SET "revision" = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY project_id, zone_id, sub_zone_id
    ORDER BY uploaded_at ASC, id ASC
  ) AS rn
  FROM "bom_dispatch"
) AS sub
WHERE d.id = sub.id;
