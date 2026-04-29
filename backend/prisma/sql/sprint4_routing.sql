-- Sprint 4: Routing + Std Time — manual SQL constraints
-- Run: npx prisma db execute --file prisma/sql/sprint4_routing.sql

-- ── Only one active routing per product ──
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_active_routing
  ON mrp_routing_workcenter (product_id)
  WHERE state = 'active' AND product_id IS NOT NULL;

-- ── OEE components must be in [0, 100] ──
DO $$ BEGIN
  ALTER TABLE mrp_workcenter
    ADD CONSTRAINT ck_wc_oee_components CHECK (
      availability BETWEEN 0 AND 100
      AND performance BETWEEN 0 AND 100
      AND quality BETWEEN 0 AND 100
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Labor mix must sum to ~100 ──
DO $$ BEGIN
  ALTER TABLE mrp_workcenter
    ADD CONSTRAINT ck_wc_labor_mix_sum CHECK (
      (labor_mix->>'operator')::numeric
    + (labor_mix->>'skilled')::numeric
    + (labor_mix->>'group_head')::numeric
    BETWEEN 99.5 AND 100.5
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Cost components non-negative ──
DO $$ BEGIN
  ALTER TABLE mrp_workcenter
    ADD CONSTRAINT ck_wc_costs_nonneg CHECK (
      labor_cost_per_min       >= 0
      AND electricity_cost_per_min >= 0
      AND consumable_cost_per_min  >= 0
      AND overhead_cost_per_min    >= 0
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Activity template: per_minute & std_measure positive ──
DO $$ BEGIN
  ALTER TABLE routing_activity_template
    ADD CONSTRAINT ck_act_pos CHECK (per_minute > 0 AND std_measure > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
