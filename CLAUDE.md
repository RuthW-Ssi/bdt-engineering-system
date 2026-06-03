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
Cloud Run (backend) · Supabase Postgres (db).

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
| `/release-gate` | Release-readiness gate + post-ship doc cascade — dispatches `qa` + `security` in parallel before `devops` commits/pushes. After commit, cascades doc updates via `wiki-integrator` (wiki pages) + `notion-mirror` (Task → Feature → Sprint rollup) + sign-off + log.md + `/sync-sprint` + `/wiki-doctor` verification. Critical/High = BLOCK · Medium = WARN · Low = INFO. Emergency: `--force-ship reason="..."` (logged) |

**Subagents** (`.claude/agents/`):

| Agent | Use for |
|---|---|
| `wiki-integrator` | Heavy wiki integration (large transcripts) without bloating main context |
| `notion-mirror` | Notion ↔ snapshot mirroring tasks |
| `frontend` / `backend` / `data` / `tester` / `devops` | Role implementation subagents dispatched by `/bdt-session-driver` at implement time; each loads its role card in `wiki/tech/roles/` |
| `security` | **Review-only** role subagent (OWASP API Top 10 2023 baseline) — audits auth, input validation, secrets, file upload, audit log. Does NOT implement fixes; writes findings to `docs/security/findings/` + routes back to fe/be/data/devops |
| `orchestrator` | **Plan-mode router** — analyzes work request → outputs execution plan YAML. Activated automatically in Plan mode (Shift+Tab). Skipped in Accept-edits mode where `/bdt-session-driver` runs directly. Outputs plan to `outputs/plans/<date>-<slug>.yaml` for user review before exit-plan-mode |
| `qa` | **Release-readiness reviewer** — dispatched at `/release-gate` (parallel with `security`). Reads `wiki/tech/testing/per-feature/<feature>.md` + Notion DoD + manual test evidence. Returns PASS/WARN/BLOCK with findings to `docs/qa/findings/` + sign-off to `docs/qa/sign-offs/`. Critical/High = BLOCK · Medium = WARN · Low = INFO |

Closure uses the global `/wrap-up` skill (not a project command).

> The session-driver system is **live**: `/bdt-session-driver` (command) + 8 subagents
> (5 implementation + 2 review-only [security + qa] + 1 plan-mode router) + role cards
> in `wiki/tech/roles/` + the Wiki Write Gate. Design spec:
> `docs/superpowers/specs/2026-05-29-bdt-session-driver-skill-design.md`.

## 5.1 Mode-aware dispatch

The agent system respects Claude Code's mode signal:

- **Accept edits mode (⏵⏵)** → `/bdt-session-driver` invoked directly · fast path · no orchestrator hop
- **Plan mode (⏸)** → `orchestrator` subagent activated first · returns execution plan YAML
  → user reviews plan → exits Plan mode → executes via `/bdt-session-driver` with plan as
  pre-loaded context

Mode signal = user intent: "ลุยเลย" vs "วางแผนก่อน". Orchestrator never executes;
session-driver never plans without execution. The two roles are non-overlapping.

## 5.2 Release Gate workflow

Commit/push to `main` is gated by `/release-gate` — never direct git commit/push.

**Flow:**
```
P0-P5 done → user manual test → user: "commit + push"
   ↓
[/release-gate triggered]
   ↓
qa subagent + security subagent (parallel)
  - qa reads:  wiki/tech/testing/per-feature/<feature>.md + Notion DoD + manual evidence
  - security reads:  changed code + OWASP API Top 10 2023 checklist
  ↓
Aggregate findings:
  - Critical/High from either → BLOCK · route fix back · ABORT
  - Medium → WARN · ask user · proceed only if explicit OK
  - Low/none → PASS
  ↓
devops subagent: git add <explicit paths> · git commit · git push
   ↓
Update Notion task: Done + completion notes · Append log.md
```

**Severity rules:**
- 🔴 **Critical** (data leak · auth bypass · RCE · hardcoded creds) → BLOCK
- 🟠 **High** (missing JWT guard · DTO validation absent · file upload missing checks) → BLOCK
- 🟡 **Medium** (no rate limit · console.log of PII · weak error handling) → WARN
- 🟢 **Low** (style · naming · doc gap) → INFO

**Emergency override:** `/release-gate --force-ship reason="..."` — logged in `log.md` with reason · reviewed in retrospective.

**Tester ↔ QA hand-off:**
- Tester writes wiki summary at `wiki/tech/testing/per-feature/<feature>.md` (mandatory per tester DoD)
- QA reads this single page (not `*.spec.ts` line-by-line)
- If wiki summary missing → QA returns BLOCK + routes fix to tester (tester DoD violation)

**Post-ship docs cascade (Step 6 of `/release-gate`):**

After devops commits/pushes successfully, `/release-gate` automatically cascades doc updates:

| sub-step | action | who does it |
|---|---|---|
| 6.1 | Wiki page updates (features · api · data-model · decisions · risk-register) | `wiki-integrator` via Wiki Write Gate |
| 6.2 | Notion 3-level cascade (Task → Feature → Sprint rollup) | `notion-mirror` |
| 6.3 | Sign-off file + log.md audit entry | release-gate command directly |
| 6.4 | `/sync-sprint` to refresh Notion snapshot | command call |
| 6.5 | `/wiki-doctor` verification (broken links · orphans) | command call |
| 6.6 | Final summary panel to user | release-gate command directly |

No doc layer is left behind — commit is necessary but not sufficient. The full
ship is "code committed + Notion Done + wiki updated + audited".

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
