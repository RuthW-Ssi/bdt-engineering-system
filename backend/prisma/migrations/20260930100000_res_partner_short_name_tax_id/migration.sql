-- Customer: add short_name, replace free-text vat with Thai 13-digit tax_id
ALTER TABLE "res_partner" ADD COLUMN "short_name" VARCHAR(50);
ALTER TABLE "res_partner" ADD COLUMN "tax_id" VARCHAR(13);

-- Carry over any existing vat that normalises to 13 digits; anything else is dropped with the column
UPDATE "res_partner"
SET "tax_id" = regexp_replace("vat", '\D', '', 'g')
WHERE "vat" IS NOT NULL AND regexp_replace("vat", '\D', '', 'g') ~ '^\d{13}$';

ALTER TABLE "res_partner" DROP COLUMN "vat";
