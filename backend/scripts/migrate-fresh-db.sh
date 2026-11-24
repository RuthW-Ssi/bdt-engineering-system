#!/usr/bin/env bash
# Build a NEW, empty local database from migrations (CI and staging keep using `prisma migrate deploy`).
#
# One historical migration only inserts mock rows that reference `activity` rows which exist on the
# shared staging database but are never created by migrations:
#   20260622060000_mock_activity_labor  (FK activity_labor.activity_id -> activity.id)
# On an empty database (no _prisma_migrations table yet) it is marked as applied, i.e. skipped,
# before the normal deploy. Nothing else is skipped; any other failure stops the script.
#
# Usage (from backend/, with DATABASE_URL and DIRECT_URL set, e.g. in backend/.env):
#   bash scripts/migrate-fresh-db.sh
set -euo pipefail
MOCK=20260622060000_mock_activity_labor
if pnpm exec prisma db execute --schema prisma/schema.prisma --stdin <<<'SELECT 1 FROM "_prisma_migrations" LIMIT 1;' >/dev/null 2>&1; then
  echo "Database already has migration history - running a normal deploy."
else
  echo "Empty database: marking $MOCK as applied (staging-only mock data)."
  pnpm exec prisma migrate resolve --applied "$MOCK"
fi
pnpm exec prisma migrate deploy
