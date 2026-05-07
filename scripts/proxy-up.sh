#!/usr/bin/env bash
# Start Cloud SQL Auth Proxy for dev — run this before starting the backend.
# Requires: cloud-sql-proxy binary in PATH and INSTANCE_CONNECTION_NAME set.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../backend/.env"

if [ -f "$ENV_FILE" ]; then
  export $(grep -E '^(INSTANCE_CONNECTION_NAME|GOOGLE_APPLICATION_CREDENTIALS)=' "$ENV_FILE" | xargs)
fi

if [ -z "${INSTANCE_CONNECTION_NAME:-}" ]; then
  echo "ERROR: INSTANCE_CONNECTION_NAME not set. Check backend/.env or set it as an env var."
  echo "  Hint: gcloud sql instances describe bdt-dev-postgres --format='value(connectionName)'"
  exit 1
fi

if ! command -v cloud-sql-proxy &>/dev/null; then
  echo "ERROR: cloud-sql-proxy not found in PATH."
  echo "  Install (macOS Apple Silicon):"
  echo "    curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.15.2/cloud-sql-proxy.darwin.arm64"
  echo "    chmod +x cloud-sql-proxy && sudo mv cloud-sql-proxy /usr/local/bin/"
  exit 1
fi

echo "Starting Cloud SQL Auth Proxy -> $INSTANCE_CONNECTION_NAME on 127.0.0.1:5432"
exec cloud-sql-proxy "$INSTANCE_CONNECTION_NAME" --address 127.0.0.1 --port 5432
