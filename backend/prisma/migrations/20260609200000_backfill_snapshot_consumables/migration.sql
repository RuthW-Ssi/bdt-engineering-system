-- Backfill activities_snapshot with consumable resources from activity_consume
-- For each activity in the snapshot that has a source_activity_id, joins activity_consume + equipment_resource
UPDATE mrp_routing_workcenter w
SET activities_snapshot = (
  SELECT jsonb_agg(
    CASE
      WHEN act->>'source_activity_id' IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM activity_consume ac
          WHERE ac.activity_id = (act->>'source_activity_id')::int
        )
      THEN act || jsonb_build_object('consumables', (
        SELECT jsonb_agg(jsonb_build_object(
          'resource_id', er.id,
          'code',        er.code,
          'name',        er.name
        ))
        FROM activity_consume ac
        JOIN equipment_resource er ON er.id = ac.resource_id
        WHERE ac.activity_id = (act->>'source_activity_id')::int
      ))
      ELSE act || '{"consumables":[]}'::jsonb
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(w.activities_snapshot) WITH ORDINALITY AS t(act, ordinality)
)
WHERE activities_snapshot IS NOT NULL
  AND jsonb_array_length(activities_snapshot) > 0;
