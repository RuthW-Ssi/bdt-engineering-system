-- wo_code gains an IN/EX tag from the WO's team (2026-10-01): WO-26000001 →
-- WO-IN-26000001 (internal team) / WO-EX-26000001 (external team). The running
-- number is kept, so codes stay unique. Only codes still in the old
-- WO-NNNNNNNN shape are touched, so a re-run is a no-op. No team → IN.
UPDATE "work_order" AS wo
SET "wo_code" = 'WO-'
  || CASE WHEN (SELECT t."team_type" FROM "team" AS t WHERE t."id" = wo."subcontractor_id") = 'external'
       THEN 'EX' ELSE 'IN' END
  || '-' || substr(wo."wo_code", 4)
WHERE wo."wo_code" ~ '^WO-[0-9]{8}$';
