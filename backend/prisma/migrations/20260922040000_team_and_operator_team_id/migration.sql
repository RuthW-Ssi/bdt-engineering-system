-- Rename subcontractor -> team (same concept, broader now that operators
-- belong to one too, not just WOs) — data preserved (2026-09-22).
ALTER TABLE "subcontractor" RENAME TO "team";
ALTER TABLE "team" RENAME CONSTRAINT "subcontractor_pkey" TO "team_pkey";
ALTER TABLE "team" RENAME CONSTRAINT "subcontractor_code_key" TO "team_code_key";

-- operator.team_id — which team an operator belongs to (nullable: an
-- operator can exist before being placed on a team).
ALTER TABLE "operator" ADD COLUMN "team_id" INTEGER;
ALTER TABLE "operator" ADD CONSTRAINT "operator_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
