-- F-MO follow-up · MO envelope dates store DATE only (no time).
-- Safe in-place narrow: existing timestamptz values truncated to their date.
ALTER TABLE "manufacturing_order" ALTER COLUMN "earliest_start_at" TYPE DATE USING "earliest_start_at"::date;
ALTER TABLE "manufacturing_order" ALTER COLUMN "due_date" TYPE DATE USING "due_date"::date;
