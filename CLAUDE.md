# BDT App — Claude Code Project Instructions

## Project Overview
NestJS (backend) + React 19 + Vite (frontend) monorepo.
- Backend: `backend/` — NestJS, Prisma, PostgreSQL
- Frontend: `frontend/` — React 19, Vite, TypeScript, Tailwind
- Local dev: backend `http://localhost:3000`, frontend `http://localhost:5173`
- Auth: JWT, credentials `admin / BdtDev2026!`, login via `POST /api/v1/auth/login`

## Wiki & Knowledge Base
Full project knowledge lives at:
```
~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/
```
Read before coding. Key pages:
- `features/bom.md` — BOM Upload + Diff (Sprint 7)
- `tech/data-model.md` — Prisma schema overview
- `tech/backend/api.md` — all API endpoints
- `tech/backend/decisions.md` — architecture decisions

Sprint state (Notion snapshot):
```
~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/pm/_snapshots/
```

## Testing Conventions

### Folder structure
```
docs/test-scripts/
  <feature-name>/
    <feature>-test-report-template.md   ← reusable template
    <feature>-test-report-YYYY-MM-DD.md ← filled report per run
```

### Skill per feature
Every testable feature should have a matching test skill:
```
.claude/commands/test-<feature-name>.md
```
The skill must include:
1. Environment verification (servers up, auth token)
2. Full test steps (upload/call API/assert)
3. Python assertion script with all expected values
4. Report generation step (copy template → fill → present summary)
5. Expected values reference section (source of truth from raw files)
6. Re-run notes (how to avoid zone/dispatch collisions)

### Currently available test skills
| Skill | Feature | Report folder |
|-------|---------|---------------|
| `/test-bom-diff` | BOM Upload + Diff (Batch 1-3) | `docs/test-scripts/bom_upload/` |

### Naming rules
- Report files: `<feature>-test-report-YYYY-MM-DD.md`
- Template files: `<feature>-test-report-template.md`
- Skill files: `test-<feature-name>.md` (kebab-case)

### When to create a new test skill
Create a `.claude/commands/test-<feature>.md` whenever:
- A feature has an API that returns computed/diffed data
- The feature involves file parsing or external data ingestion
- Re-running the test manually would take > 5 minutes

## After Every Feature / Bug Fix
1. Update wiki pages that changed (features, decisions, data-model, api)
2. Append entry to `~/Documents/bdt/knowledge-base/log.md`
3. Update Notion tasks: Status=Done + Completion Notes
4. If test skill exists for the feature — verify it still passes

## Available Slash Commands
| Command | Purpose |
|---------|---------|
| `/test-bom-diff` | Run BOM Diff end-to-end test + generate report |
| `/wiki-update` | Run 4-step wiki integration protocol |
| `/sync-sprint` | Pull latest Notion sprint snapshot |
| `/promote-to-wiki` | Promote raw notes to wiki |
| `/wiki-doctor` | Check wiki for broken links / orphan pages |
| `/new-project` | Scaffold new project in knowledge-base |
| `/blocking-questions` | Surface blocking questions before coding |
