-- Sprint 27: descriptive-only user profile fields, no permission effect.
ALTER TABLE "res_users" ADD COLUMN "level" VARCHAR(60);
ALTER TABLE "res_users" ADD COLUMN "job_title" VARCHAR(120);
