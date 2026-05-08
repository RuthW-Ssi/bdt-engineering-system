/*
  Warnings:

  - Added the required column `write_date` to the `res_users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "res_users" ADD COLUMN     "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "email" VARCHAR(120),
ADD COLUMN     "lang" VARCHAR(10) DEFAULT 'th_TH',
ADD COLUMN     "partner_id" INTEGER,
ADD COLUMN     "password" VARCHAR(128) NOT NULL DEFAULT '',
ADD COLUMN     "role" VARCHAR(20) NOT NULL DEFAULT 'user',
ADD COLUMN     "tz" VARCHAR(40) DEFAULT 'Asia/Bangkok',
ADD COLUMN     "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Remove the transient default after backfill (Prisma @updatedAt manages this at app level)
ALTER TABLE "res_users" ALTER COLUMN "write_date" DROP DEFAULT;
