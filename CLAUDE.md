# BDT App — Claude Code Project Instructions

> This file is the **agent's map of the repo**: what each thing is, where it
> lives, and how to manage it. Keep it accurate — if reality changes, fix this
> file first. Deep project knowledge lives in the wiki (second brain), not here.

---

## 1. What this project is

BDT Engineering System for SSI Steel  — engineering data management:
Material Register → Products → BOM + Shop Drawings → Routing.

**Stack:** React 19 + Vite + TS + Tailwind (frontend) · NestJS 10 + Prisma 6 +
PostgreSQL 16 (backend) · Docker Compose · deployed via Vercel (frontend) + GCP
Cloud SQL (db).

**Run locally:**
- Frontend (repo root): `npm run dev` → http://localhost:5173
- Backend (`backend/`): `npm run start:dev` → http://localhost:3000
- Auth (dev): JWT, `admin / BdtDev2026!`, `POST /api/v1/auth/login`

---

## 2. Where is what (repo map)

> ⚠️ **Frontend lives at the repo ROOT, not in `frontend/`.** The root
> `package.json` is the Vite/React app; `src/` is the frontend source.

| Path | What it is | Manage how |
|---|---|---|
| `src/` (root) | **Frontend** — React 19/Vite (`api/`, `components/`, `context/`, `hooks/`, `lib/`, `data/`) | edit here for UI/client work |
| `backend/` | **Backend** — NestJS modules, `backend/prisma/` schema + seeds | `npm run start:dev`, `npm run prisma:*` |
| `public/` | Static assets served by Vite (favicon, icons) | static only |
| `document/` | **Raw source data** (xlsx/pdf from the plant) — READ-ONLY input | never edit; clean → wiki |
| `storage/drawings/` | Uploaded shop drawings (runtime files) | app-managed, not source |
| `scripts/` | Dev helpers (`proxy-up.sh`, `setup-env.sh`) | run as needed |
| `.github/workflows/` | CI — `deploy-backend.yml`, `migrate-deploy.yml` | see §6 CI safety |
| `docs/` | Project docs (see §3) | — |
| `dist/`, `node_modules/`, `.vercel/` | build output / deps / deploy config | ignore (generated) |

---

## 3. Docs (`docs/`)

| Folder | Holds |
|---|---|
| `docs/adr/` | Architecture Decision Records (0005–0014: routing, JWT, GCP Cloud SQL, hierarchy) |
| `docs/runbooks/` | Operational runbooks (`connection-pool.md`, `migration-rollback.md`) |
| `docs/onboarding/` | `dev-setup.md` |
| `docs/superpowers/specs/` | Design specs (e.g. `2026-05-29-bdt-session-driver-skill-design.md`) |
| `docs/test-scripts/` | Filled test reports per feature (see §5) |
| `docs/archive/` | Superseded files kept for history (old docker-compose, sprint4_2 audit) |

---

## 4. The second brain — wiki + Notion

Durable knowledge does **not** live in this repo or in chat. It lives in the
shared second brain, read by both Claude cowork and Claude Code:

```
~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/
  wiki/          ← cleaned, synthesized knowledge  (READ before coding)
  pm/_snapshots/ ← read-only mirror of Notion sprint state
  raw/           ← READ-ONLY source material — never edit
```

**Source-of-truth boundary:** raw/uncleaned → `bdt-app/document/` (this repo) ·
cleaned → `wiki/` · plan & live status → Notion (mirrored to `pm/_snapshots/`).

**Key wiki pages:** `features/bom.md` · `tech/data-model.md` ·
`tech/backend/api.md` · `tech/backend/decisions.md`.

**Protocol — do NOT duplicate it here. Read the authoritative files:**
- `knowledge-base/CLAUDE.md` — root 4-step integration protocol + style rules
- `knowledge-base/projects/bdt-engineering-system/CLAUDE.md` — Agent Quick Start, code map, update triggers

---

## 5. Agent toolkit (`.claude/`)

**Slash commands** (`.claude/commands/`):

| Command | Purpose |
|---|---|
| `/sync-sprint` | Pull latest Notion sprint state → `pm/_snapshots/` (one-way) |
| `/wiki-update` | Run the 4-step wiki integration protocol |
| `/promote-to-wiki` | Promote raw notes into the wiki |
| `/wiki-doctor` | Lint wiki — broken links, orphan pages |
| `/blocking-questions` | Surface blocking questions/contradictions before coding |
| `/new-project` | Scaffold a new project in the knowledge-base |
| `/test-bom-diff` | Run BOM Diff end-to-end test + generate report |
| `/bdt-session-driver` | Drive a full work session P0–P5 (recap→gate→select→implement→backfill→close) |

**Subagents** (`.claude/agents/`):

| Agent | Use for |
|---|---|
| `wiki-integrator` | Heavy wiki integration (large transcripts) without bloating main context |
| `notion-mirror` | Notion ↔ snapshot mirroring tasks |
| `frontend` / `backend` / `data` / `tester` / `devops` | Role implementation subagents dispatched by `/bdt-session-driver` at implement time; each loads its role card in `wiki/tech/roles/` |

Closure uses the global `/wrap-up` skill (not a project command).

> The session-driver system is **live**: `/bdt-session-driver` (command) + 5 role
> subagents + role cards in `wiki/tech/roles/` + the Wiki Write Gate. Design spec:
> `docs/superpowers/specs/2026-05-29-bdt-session-driver-skill-design.md`.

---

## 6. How to manage work (conventions)

**Branching:** one branch per feature — `dev-t-<feature-name>`. Never commit
features straight to `main`.

**Commits:** `[S<N>-<task-id>] subject` (e.g. `[S7-T03] add BOM diff endpoint`).

**Before commit / push / marking a task Done:** ask the user to review first.

**After every feature / bug fix:**
1. Update wiki pages that changed (features, decisions, data-model, api) — via `/wiki-update`
2. Append an entry to `~/Documents/bdt/knowledge-base/log.md`
3. Update Notion: Status=Done + Completion Notes (+ flip Feature/Sprint when all children done)
4. If a test skill exists for the feature — verify it still passes

**CI safety:** never interpolate `${{ github.event.* }}` directly inside a
`run:` block — pass through an `env:` var first (injection risk; a hook blocks it).

**Test skills:** every testable feature gets `.claude/commands/test-<feature>.md`
containing: (1) env verification, (2) full test steps, (3) Python assertion
script with expected values, (4) report generation, (5) expected-values
reference, (6) re-run notes. Reports → `docs/test-scripts/<feature>/`
(`<feature>-test-report-YYYY-MM-DD.md`, template `*-template.md`). Create one
whenever a feature returns computed/diffed data, parses files, or takes >5 min to
test manually.
