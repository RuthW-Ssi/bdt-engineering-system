-- Employee vs customer users. Customers see only their company's projects (view-only).
ALTER TABLE "res_users" ADD COLUMN "user_type" VARCHAR(20) NOT NULL DEFAULT 'employee';

-- partner_id existed as an unused placeholder; clear dangling values before adding the FK
UPDATE "res_users" SET "partner_id" = NULL
WHERE "partner_id" IS NOT NULL AND "partner_id" NOT IN (SELECT "id" FROM "res_partner");

ALTER TABLE "res_users" ADD CONSTRAINT "res_users_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "res_partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
