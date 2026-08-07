-- Sprint 27: per-user, per-module write permission. Additive only — no
-- data mapping needed, brand new table.
CREATE TABLE "user_module_permission" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "module" VARCHAR(40) NOT NULL,
    "can_write" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_module_permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_module_permission_user_id_module_key" ON "user_module_permission"("user_id", "module");

ALTER TABLE "user_module_permission" ADD CONSTRAINT "user_module_permission_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "res_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
