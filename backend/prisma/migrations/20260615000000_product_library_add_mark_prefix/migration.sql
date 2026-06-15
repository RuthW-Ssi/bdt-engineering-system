-- Add mark_prefix fields to product_library (nullable — existing rows pre-date this requirement)
ALTER TABLE product_library ADD COLUMN IF NOT EXISTS mark_prefix          VARCHAR(10);
ALTER TABLE product_library ADD COLUMN IF NOT EXISTS mark_prefix_label    VARCHAR(40);
ALTER TABLE product_library ADD COLUMN IF NOT EXISTS mark_prefix_category VARCHAR(20);
