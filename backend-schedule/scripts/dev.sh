#!/usr/bin/env bash
# Local dev: run prod-scheduler on http://localhost:8100 against the SAME database as the
# NestJS backend — DATABASE_URL is read from ../backend/.env (Prisma's "?schema=…" stripped),
# so the two can never point at different DBs. Point NestJS at it with
# SCHEDULER_API_URL=http://localhost:8100 in backend/.env (no Cloud Run ID token for localhost).
#
#   cd backend-schedule && ./scripts/dev.sh        # PORT=8101 ./scripts/dev.sh to change the port
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=../backend/.env
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
url=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -n "$url" ] || { echo "DATABASE_URL not set in $ENV_FILE" >&2; exit 1; }
export DATABASE_URL="${url%%\?*}"

[ -x .venv/bin/uvicorn ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements-dev.txt; }

echo "prod-scheduler → $(sed -E 's#://([^:]+):[^@]*@#://\1:***@#' <<<"$DATABASE_URL") on :${PORT:-8100}"
exec .venv/bin/uvicorn app.main:app --reload --port "${PORT:-8100}"
