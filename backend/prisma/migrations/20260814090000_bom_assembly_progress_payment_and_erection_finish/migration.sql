-- Project Progress v3: Material Payment (parallel phase, 3-state status
-- matching the site team's own tracking sheet: Not Disbursed/Disbursed/Paid,
-- weighted rollup by weight_kg like fab_pct — only "Paid" counts as passed)
-- + Erection actual finish date (mirrors Transport's plan/actual date pair)
-- + claimed/delivered weight tracking. Additive only — no backfill needed,
-- defaults keep existing rows valid.
ALTER TABLE "bom_assembly_progress"
  ADD COLUMN "erection_actual_finish_date" DATE,
  ADD COLUMN "payment_status" VARCHAR(20) NOT NULL DEFAULT 'Not Disbursed',
  ADD COLUMN "claimed_weight_kg" DECIMAL(12,3),
  ADD COLUMN "delivered_weight_kg" DECIMAL(12,3);
