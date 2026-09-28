-- Team: classify as internal or external. Existing rows all predate this
-- field and are historically "subcontractor" (SUB-FAB-* codes) — backfill
-- them as 'external', then drop the default so every future insert must
-- specify it explicitly (matches CreateTeamDto's required team_type).
ALTER TABLE "team" ADD COLUMN "team_type" VARCHAR(20) NOT NULL DEFAULT 'external';

ALTER TABLE "team" ALTER COLUMN "team_type" DROP DEFAULT;
