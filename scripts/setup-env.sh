#!/usr/bin/env bash
# Fetch DATABASE_URL from GCP Secret Manager and write it to backend/.env.
# Run once after cloning or when the DB password rotates.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../backend/.env"

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"

if [ -z "${PROJECT_ID:-}" ]; then
  echo "ERROR: GCP_PROJECT_ID not set and gcloud default project not configured."
  echo "  Fix: export GCP_PROJECT_ID=<your-project-id>"
  exit 1
fi

echo "Fetching DATABASE_URL from Secret Manager (project: $PROJECT_ID)..."
DB_URL=$(gcloud secrets versions access latest \
  --secret="DATABASE_URL" \
  --project="$PROJECT_ID" \
  --quiet)

if [ -z "$DB_URL" ]; then
  echo "ERROR: Secret Manager returned empty value for DATABASE_URL."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  cp "$SCRIPT_DIR/../backend/.env.example" "$ENV_FILE"
  echo "Created backend/.env from .env.example"
fi

if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"$DB_URL\"|" "$ENV_FILE"
else
  echo "DATABASE_URL=\"$DB_URL\"" >> "$ENV_FILE"
fi

echo "Done — backend/.env updated with DATABASE_URL from Secret Manager."
