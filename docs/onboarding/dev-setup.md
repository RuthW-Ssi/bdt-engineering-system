# Dev Setup Guide — BDT Engineering System

> [!warning] Superseded 2026-05-20
> This Cloud SQL Auth Proxy onboarding is **historical**. The dev Cloud SQL instance was
> deleted — **local dev now uses Docker Compose Postgres**, staging uses **Supabase**.
> For the current setup see the wiki `ops/infra.md` and `docs/DEV_SETUP_LOCAL_MACOS.md`.
> Kept for history.

Target: new dev fully connected and running CRUD in **< 30 min**.

GCP project (historical): `building-technology-493907`
Cloud SQL instance (deleted): `building-technology-493907:asia-southeast1:dev-bdt-engineering-db`

---

## Prerequisites

- macOS (Intel or Apple Silicon) or Linux
- `git`, `node` 20+, `pnpm` 9+
- A Google account with access to the BDT GCP project (ask BDT lead if not yet granted)

---

## Step 1 — Get GCP access

Ask BDT lead (`bdtapp@ssi-steel.com`) to grant your Google account:

| Role | Purpose |
|------|---------|
| `roles/cloudsql.client` | Connect via Auth Proxy |
| `roles/secretmanager.secretAccessor` | Fetch DATABASE_URL via `setup-env.sh` |

You will receive confirmation when access is granted (usually < 5 min).

---

## Step 2 — Install gcloud CLI

```bash
# macOS (Homebrew)
brew install --cask google-cloud-sdk

# Or download directly
# https://cloud.google.com/sdk/docs/install
```

Verify: `gcloud version`

---

## Step 3 — Authenticate

```bash
# Personal login (for Secret Manager + ADC)
gcloud auth login
gcloud auth application-default login

# Set default project
gcloud config set project building-technology-493907
```

---

## Step 4 — Install Cloud SQL Auth Proxy

```bash
# macOS Apple Silicon
curl -fsSL -o cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.15.2/cloud-sql-proxy.darwin.arm64
chmod +x cloud-sql-proxy && sudo mv cloud-sql-proxy /usr/local/bin/

# macOS Intel
curl -fsSL -o cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.15.2/cloud-sql-proxy.darwin.amd64
chmod +x cloud-sql-proxy && sudo mv cloud-sql-proxy /usr/local/bin/

# Linux (amd64)
curl -fsSL -o cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.15.2/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy && sudo mv cloud-sql-proxy /usr/local/bin/
```

Verify: `cloud-sql-proxy --version`

---

## Step 5 — Clone the repo

```bash
git clone https://github.com/RuthW-Ssi/bdt-engineering-system.git bdt-app
cd bdt-app
```

---

## Step 6 — Fetch DATABASE_URL from Secret Manager

```bash
GCP_PROJECT_ID=building-technology-493907 bash scripts/setup-env.sh
```

This fetches the secret `bdt-dev-database-url` from GCP Secret Manager and writes
`DATABASE_URL` into `backend/.env`. Run again whenever the DB password rotates.

**GCP Secret naming convention:** `bdt-dev-<variable-name>`
(e.g., `bdt-dev-database-url`, `bdt-dev-storage-key`)

---

## Step 7 — Start Cloud SQL Auth Proxy

Open a **dedicated terminal** and keep it running:

```bash
bash scripts/proxy-up.sh
```

Expected output:
```
Starting Cloud SQL Auth Proxy for building-technology-493907:asia-southeast1:dev-bdt-engineering-db
Proxy listening on 127.0.0.1:5432
```

---

## Step 8 — Start the backend

```bash
cd backend
pnpm install
npx prisma migrate deploy   # apply any pending migrations
pnpm start:dev
```

Swagger: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

---

## Step 9 — Start the frontend

```bash
cd ..          # bdt-app root
pnpm install
pnpm dev       # http://localhost:5173
```

---

## Verify — CRUD smoke test

```bash
# List materials (should return data if seed ran)
curl http://localhost:3000/api/v1/materials | jq '.total'
```

If you see a number > 0, setup is complete.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Permission denied on secret bdt-dev-database-url` | IAM not propagated yet — wait 5 min or ask BDT lead to verify role assignment |
| `Connection refused 127.0.0.1:5432` | Auth Proxy not running — re-run `scripts/proxy-up.sh` |
| `could not connect to server` | ADC not configured — run `gcloud auth application-default login` |
| `DATABASE_URL not set` | `setup-env.sh` not run or failed — re-run Step 6 |
| `Prisma migrate diff` warnings | Normal if no pending migrations — `already up to date` is OK |
| Windows Auth Proxy issues | Use WSL2 or connect via public IP + IP allowlist (contact BDT lead) |

---

## Daily workflow

```bash
# Terminal 1 — keep running
bash scripts/proxy-up.sh

# Terminal 2 — backend
cd backend && pnpm start:dev

# Terminal 3 — frontend
pnpm dev
```

No need to re-run `setup-env.sh` unless the DB password rotates.
