CREATE TABLE IF NOT EXISTS "labor_skill" (
  "id"          SERIAL        PRIMARY KEY,
  "skill"       VARCHAR(80)   UNIQUE NOT NULL,
  "headcount"   INTEGER       NOT NULL DEFAULT 1,
  "rate"        DECIMAL(10,4),
  "rate_unit"   VARCHAR(20),
  "active"      BOOLEAN       NOT NULL DEFAULT true,
  "create_date" TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "write_date"  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Migrate from equipment_resource.skills[] → one row per unique skill
INSERT INTO "labor_skill" ("skill", "headcount", "rate", "rate_unit", "write_date")
SELECT
  skill_value::VARCHAR(80)          AS skill,
  count(*)::INT                     AS headcount,
  ROUND(AVG(rate)::NUMERIC, 4)      AS rate,
  MAX(rate_unit)                    AS rate_unit,
  now()                             AS write_date
FROM equipment_resource er,
  LATERAL jsonb_array_elements_text(er.skills) AS skill_value
WHERE er.type = 'labor'
  AND er.skills IS NOT NULL
  AND er.active = true
GROUP BY skill_value
ON CONFLICT (skill) DO NOTHING;

-- Remove orphaned labor rows (activity_labor now uses skill string, no FK here)
DELETE FROM equipment_resource WHERE type = 'labor';
