-- AlterTable
ALTER TABLE "mail_message" ADD COLUMN     "partner_id" INTEGER;

-- CreateTable
CREATE TABLE "res_partner" (
    "id" SERIAL NOT NULL,
    "ref" VARCHAR(20),
    "name" VARCHAR(200) NOT NULL,
    "vat" VARCHAR(40),
    "email" VARCHAR(120),
    "phone" VARCHAR(40),
    "street" VARCHAR(200),
    "city" VARCHAR(80),
    "country_id" INTEGER,
    "is_company" BOOLEAN NOT NULL DEFAULT true,
    "parent_id" INTEGER,
    "customer_rank" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_date" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "res_partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_zone" (
    "id" SERIAL NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(20),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_date" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sub_zone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "res_partner_ref_key" ON "res_partner"("ref");

-- AddForeignKey
ALTER TABLE "mail_message" ADD CONSTRAINT "mail_message_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "res_partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "res_partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_zone" ADD CONSTRAINT "sub_zone_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "project_zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
