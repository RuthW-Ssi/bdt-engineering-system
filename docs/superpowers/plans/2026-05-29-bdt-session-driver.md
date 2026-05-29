# bdt-session-driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `bdt-session-driver` slash command + 5 role subagents + shared wiki gate/role-card/handoff artifacts that drive a full Claude Code work session (recap → consistency gate → select → implement → drift backfill → close) with hard gates.

**Architecture:** A position-agnostic driver command sequences existing commands (`/sync-sprint`, `/wiki-update`, `/wrap-up`) and dispatches 5 role subagents (frontend/backend/data/tester/devops) at implement time. Position expertise lives in shared **role cards** in the wiki (second brain); a shared **Wiki Write Gate** rule governs every write back to wiki/Notion. Cowork and Claude Code communicate only through wiki + Notion; a `pm/handoff.md` cover page keeps cowork in sync.

**Tech Stack:** Markdown artifacts only — Claude Code slash commands (`.claude/commands/`), subagents (`.claude/agents/`), and Obsidian/LLM-wiki pages. No application code changes.

**Spec:** `docs/superpowers/specs/2026-05-29-bdt-session-driver-skill-design.md`

---

## Artifact-type note (read before executing)

These deliverables are **prose/config**, not unit-testable code. So each task's
"verify" step is a **structural acceptance check** (file exists, required
sections present, referenced paths resolve, no placeholders), and the plan ends
with one **manual smoke test**. There is no pytest. Do not invent fake unit tests.

## Two repositories

| Repo | Branch | Holds |
|---|---|---|
| `bdt-app` (`/Users/michel-angelo/Desktop/test555/bdt-app`) | `dev-t-session-driver-skill` | driver command, 5 role subagents, this plan |
| `bdt-knowledge-base` (`~/Documents/bdt/knowledge-base`) | `master` | role cards, wiki-write-gate, `pm/handoff.md` |

`WIKI` below = `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system`.
Commit wiki artifacts in the wiki repo; commit `.claude/` artifacts in `bdt-app`.

## File structure (decomposition locked here)

```
# bdt-app repo (branch dev-t-session-driver-skill)
.claude/commands/bdt-session-driver.md        ← Task 5 (the driver, P0–P5)
.claude/agents/frontend.md                     ← Task 4
.claude/agents/backend.md                      ← Task 4
.claude/agents/data.md                         ← Task 4
.claude/agents/tester.md                       ← Task 4
.claude/agents/devops.md                       ← Task 4
CLAUDE.md                                       ← Task 6 (flip "planned" → available)

# wiki repo (branch master), under WIKI/
wiki/tech/roles/_wiki-write-gate.md            ← Task 1
wiki/tech/roles/frontend.md                    ← Task 2
wiki/tech/roles/backend.md                     ← Task 2
wiki/tech/roles/data.md                        ← Task 2
wiki/tech/roles/tester.md                      ← Task 2
wiki/tech/roles/devops.md                      ← Task 2
pm/handoff.md                                  ← Task 3
```

Build order: gate → role cards → handoff → subagents → driver → CLAUDE.md → smoke.
(Subagents reference role cards; the driver references all of them, so they exist first.)

---

### Task 1: Wiki Write Gate (shared rule)

**Files:**
- Create: `WIKI/wiki/tech/roles/_wiki-write-gate.md` (wiki repo)

- [ ] **Step 1: Create the roles dir and the gate file**

```bash
mkdir -p ~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles
```

Write `WIKI/wiki/tech/roles/_wiki-write-gate.md`:

```markdown
# Wiki Write Gate

> Shared rule. Every agent — the session driver, every role subagent, and Claude
> cowork — obeys this before writing to the wiki or Notion. Linked from the
> driver (P4, P5) and from every role card's "Definition-of-Done".

## The rule

Before writing to wiki or Notion:

1. **PROPOSE the diff** — say exactly: which page/row, which lines change, and why.
2. **GET user approval** — wait for an explicit yes. Do not write on assumption.
3. **THEN write** — apply only what was approved.

Never write to the second brain before discussing it. This applies to mid-flight
drift backfill (driver P4) and the cowork-sync close (driver P5) alike.

## Contradictions

If the change conflicts with existing wiki content, do NOT overwrite. Append to
`_contradictions.md` and flag the user (driver P1 tiered rule).
```

- [ ] **Step 2: Verify structure**

Run:
```bash
F=~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/_wiki-write-gate.md
test -f "$F" && grep -q "PROPOSE the diff" "$F" && grep -q "GET user approval" "$F" && echo OK
```
Expected: `OK`

- [ ] **Step 3: Commit (wiki repo)**

```bash
cd ~/Documents/bdt/knowledge-base
git add projects/bdt-engineering-system/wiki/tech/roles/_wiki-write-gate.md
git commit -m "wiki: add shared Wiki Write Gate rule (propose->approve->write)"
```

---

### Task 2: Five role cards

**Files (wiki repo):**
- Create: `WIKI/wiki/tech/roles/frontend.md`
- Create: `WIKI/wiki/tech/roles/backend.md`
- Create: `WIKI/wiki/tech/roles/data.md`
- Create: `WIKI/wiki/tech/roles/tester.md`
- Create: `WIKI/wiki/tech/roles/devops.md`

Each card has exactly these 5 sections: `## Owns`, `## Conventions`,
`## Definition-of-Done`, `## Review criteria`, `## Must NOT touch`.

- [ ] **Step 1: Write `frontend.md`**

```markdown
# Role: Frontend

React 19 / Vite / TypeScript / Tailwind. The frontend lives at the **repo root**
(`src/`), not in a `frontend/` folder.

## Owns
- `src/` — `components/`, `hooks/`, `context/`, `lib/`, `api/` (axios client), `data/`
- `public/` static assets

## Conventions
- React 19 function components; server state via @tanstack/react-query; client
  state via zustand; forms via react-hook-form + zod; routing via react-router-dom v7
- All HTTP through the `src/api` axios client — never hardcode base URLs
- Tailwind for styling; lucide-react for icons

## Definition-of-Done
- Component + hook + types; wired to API with loading + error states
- Frontend wiki page updated if a page/pattern was added — under the Wiki Write Gate
  (`tech/roles/_wiki-write-gate.md`)

## Review criteria
- No business logic inside components (push to hooks/`lib/`)
- No hardcoded API URLs; no `any`; basic a11y on interactive elements

## Must NOT touch
- `backend/`, Prisma schema, `bdt-app/document/` (raw), `_contradictions.md` (never overwrite)
```

- [ ] **Step 2: Write `backend.md`**

```markdown
# Role: Backend

NestJS 10 / Prisma 6 / PostgreSQL. Source in `backend/src/`.

## Owns
- `backend/src/**` — NestJS modules (controller + service + module + DTO)
- REST API under `/api/v1`

## Conventions
- NestJS module pattern; DTO validation via class-validator
- Auth via `JwtAuthGuard` — never read `x-user-id`
- Schema changes are co-owned with the **data** role (see `data.md`)

## Definition-of-Done
- Controller + service + DTO + spec test
- If schema changed: coordinate with data role for the migration
- `tech/backend/api.md` + `tech/backend/decisions.md` updated under the Wiki Write
  Gate (`tech/roles/_wiki-write-gate.md`)

## Review criteria
- No `x-user-id`; `JwtAuthGuard` on protected routes
- No secrets in code; DTO validation present on inputs

## Must NOT touch
- `src/` (frontend), `bdt-app/document/` (raw), `_contradictions.md` (never overwrite)
```

- [ ] **Step 3: Write `data.md`**

```markdown
# Role: Data

Prisma schema, migrations, seeds, and data import. Source in `backend/prisma/`.

## Owns
- `backend/prisma/schema.prisma`, `backend/prisma/migrations/**`
- Seed scripts (`seed*.ts`) and import scripts (e.g. `import-odoo-data.ts`)

## Conventions
- Prisma 6; migrations via `npm run prisma:migrate`
- Model/table naming follows existing snake_case convention (e.g. `res_partner`,
  `sub_zone`, `bom_line`)
- Respect connection pool: Cloud SQL `max_connections=25`, Prisma `connection_limit=5`

## Definition-of-Done
- Schema change + migration generated; seed updated if needed
- `tech/data-model.md` updated under the Wiki Write Gate
  (`tech/roles/_wiki-write-gate.md`)

## Review criteria
- Migration is reversible; no destructive change without an explicit flag
- Naming matches existing convention; `data-model.md` reflects the change

## Must NOT touch
- `src/` (frontend), controller/service logic (backend role), `bdt-app/document/`
  (raw), `_contradictions.md` (never overwrite)
```

- [ ] **Step 4: Write `tester.md`**

```markdown
# Role: Tester

Tests, coverage, and per-feature test skills.

## Owns
- Backend `*.spec.ts` tests and coverage
- Test skills `.claude/commands/test-<feature>.md`
- Reports in `docs/test-scripts/<feature>/`

## Conventions
- Each testable feature gets a `test-<feature>.md` skill with the 6-part structure
  (env verify, test steps, assertion script, report gen, expected-values reference,
  re-run notes) — see `bdt-app/CLAUDE.md` §6
- Reports named `<feature>-test-report-YYYY-MM-DD.md`

## Definition-of-Done
- Test skill exists and passes; report generated; coverage for new endpoints
- `tech/testing/*` wiki updated if a testing pattern changed, under the Wiki Write
  Gate (`tech/roles/_wiki-write-gate.md`)

## Review criteria
- Assertion expected-values trace to raw source; re-run notes present
- No flaky ordering/zone/dispatch collisions

## Must NOT touch
- Production `src/` and `backend/src/` logic (tests only), `bdt-app/document/`
  (raw), `_contradictions.md` (never overwrite)
```

- [ ] **Step 5: Write `devops.md`**

```markdown
# Role: DevOps

Docker, CI/CD, GCP Cloud SQL, Vercel, env/secrets.

## Owns
- `docker-compose*.yml`, `backend/Dockerfile`
- `.github/workflows/**` (`deploy-backend.yml`, `migrate-deploy.yml`)
- `scripts/` (`proxy-up.sh`, `setup-env.sh`)

## Conventions
- GH Actions: never interpolate `${{ github.event.* }}` directly in `run:` —
  pass through an `env:` var first (injection risk; a hook blocks it)
- Secret naming `bdt-dev-<var-name>`; Secret Manager migration deferred until prod
  (env plaintext for now)
- DB: `max_connections=25`, Prisma `connection_limit=5`

## Definition-of-Done
- CI green; deploy succeeds; `docs/runbooks/*` updated if an ops procedure changed,
  under the Wiki Write Gate (`tech/roles/_wiki-write-gate.md`)

## Review criteria
- No secret in code or CI logs; event data passed via `env:`
- `migrate-deploy` ordering correct relative to `deploy-backend`

## Must NOT touch
- Feature business logic (fe/be roles), `bdt-app/document/` (raw),
  `_contradictions.md` (never overwrite)
```

- [ ] **Step 6: Verify all five cards have the 5 required sections**

Run:
```bash
R=~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles
for f in frontend backend data tester devops; do
  for s in "## Owns" "## Conventions" "## Definition-of-Done" "## Review criteria" "## Must NOT touch"; do
    grep -q "$s" "$R/$f.md" || echo "MISSING [$s] in $f.md"
  done
done
echo "check done"
```
Expected: `check done` with **no** `MISSING` lines.

- [ ] **Step 7: Commit (wiki repo)**

```bash
cd ~/Documents/bdt/knowledge-base
git add projects/bdt-engineering-system/wiki/tech/roles/
git commit -m "wiki: add 5 role cards (frontend/backend/data/tester/devops)"
```

---

### Task 3: Handoff cover page

**Files (wiki repo):**
- Create: `WIKI/pm/handoff.md`

- [ ] **Step 1: Write the handoff template**

Write `WIKI/pm/handoff.md`:

```markdown
# Handoff — updated <date> by claude-code

> Cover page for Claude cowork. Rewritten (not appended) at each close. Full
> history lives in `pm/log.md` and root `log.md`.

## What this round did
- [S<N>-T<id>] <one line> → see wiki: <page>

## Wiki changed
- <page> (<what changed>)

## Notion closed
- <Feature/Task> → Done

## Pending cowork decision
- <open question / assumption logged this round>
```

- [ ] **Step 2: Verify structure**

Run:
```bash
F=~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/pm/handoff.md
test -f "$F" && grep -q "## What this round did" "$F" && grep -q "## Pending cowork decision" "$F" && echo OK
```
Expected: `OK`

- [ ] **Step 3: Commit (wiki repo)**

```bash
cd ~/Documents/bdt/knowledge-base
git add projects/bdt-engineering-system/pm/handoff.md
git commit -m "wiki: add pm/handoff.md cover page for cowork sync"
```

---

### Task 4: Five role subagents

**Files (bdt-app repo):**
- Create: `.claude/agents/frontend.md`, `backend.md`, `data.md`, `tester.md`, `devops.md`

Each subagent loads its role card and obeys the driver's gates. They follow the
existing `wiki-integrator.md` agent format (frontmatter `name`/`description`/
`tools`/`model`, then an operating contract).

- [ ] **Step 1: Write `.claude/agents/frontend.md`**

```markdown
---
name: frontend
description: Frontend implementation subagent (React 19 / Vite / TS / Tailwind). Dispatched by /bdt-session-driver at implement time for UI/client work in src/. Loads its role card and returns a concise change report.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

You are the **BDT Frontend** implementation subagent.

## Operating contract
1. Read your role card first:
   `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/frontend.md`.
   Treat its 5 sections (Owns / Conventions / Definition-of-Done / Review criteria /
   Must NOT touch) as binding.
2. Stay inside `Owns`. If the task needs a file under another role's `Owns`, stop
   and report it to the driver — do not cross the boundary.
3. Any wiki/Notion write goes through the Wiki Write Gate
   (`tech/roles/_wiki-write-gate.md`): propose → approve → write. Never write the
   second brain yourself without that.
4. Return a concise report: files changed, what was built, Definition-of-Done
   status, anything that needs the driver's Review Gate before commit.
```

- [ ] **Step 2: Write `.claude/agents/backend.md`**

```markdown
---
name: backend
description: Backend implementation subagent (NestJS 10 / Prisma 6 / PostgreSQL). Dispatched by /bdt-session-driver for API/module work in backend/src. Loads its role card and returns a concise change report.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

You are the **BDT Backend** implementation subagent.

## Operating contract
1. Read your role card first:
   `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/backend.md`.
   Treat its 5 sections as binding.
2. Stay inside `Owns`. Schema changes are co-owned with the data role — coordinate,
   do not unilaterally edit `schema.prisma` beyond what the task requires; report to
   the driver so it can dispatch the data subagent if needed.
3. Any wiki/Notion write goes through the Wiki Write Gate
   (`tech/roles/_wiki-write-gate.md`): propose → approve → write.
4. Return a concise report: files changed, what was built, Definition-of-Done
   status, anything that needs the driver's Review Gate before commit.
```

- [ ] **Step 3: Write `.claude/agents/data.md`**

```markdown
---
name: data
description: Data/schema subagent (Prisma schema, migrations, seeds, imports). Dispatched by /bdt-session-driver for backend/prisma work. Loads its role card and returns a concise change report.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

You are the **BDT Data** subagent.

## Operating contract
1. Read your role card first:
   `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/data.md`.
   Treat its 5 sections as binding.
2. Stay inside `Owns` (schema, migrations, seeds, imports). Do not edit
   controller/service logic — that is the backend role; report instead.
3. Any wiki/Notion write (especially `tech/data-model.md`) goes through the Wiki
   Write Gate (`tech/roles/_wiki-write-gate.md`): propose → approve → write.
4. Return a concise report: schema/migration changes, reversibility, Definition-of-Done
   status, anything needing the driver's Review Gate before commit.
```

- [ ] **Step 4: Write `.claude/agents/tester.md`**

```markdown
---
name: tester
description: Test subagent (specs, coverage, per-feature test skills). Dispatched by /bdt-session-driver to add/verify tests. Loads its role card and returns a concise change report.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

You are the **BDT Tester** subagent.

## Operating contract
1. Read your role card first:
   `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/tester.md`.
   Treat its 5 sections as binding.
2. Stay inside `Owns` (tests + test skills + reports). Do not change production
   logic — only tests; report needed production fixes to the driver.
3. Any wiki/Notion write goes through the Wiki Write Gate
   (`tech/roles/_wiki-write-gate.md`): propose → approve → write.
4. Return a concise report: tests/skills added, pass/fail, coverage notes,
   anything needing the driver's Review Gate before commit.
```

- [ ] **Step 5: Write `.claude/agents/devops.md`**

```markdown
---
name: devops
description: DevOps subagent (Docker, CI/CD, GCP Cloud SQL, Vercel, env/secrets). Dispatched by /bdt-session-driver for infra/pipeline work. Loads its role card and returns a concise change report.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

You are the **BDT DevOps** subagent.

## Operating contract
1. Read your role card first:
   `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/devops.md`.
   Treat its 5 sections as binding.
2. Stay inside `Owns` (Docker, workflows, scripts, infra). Never put secrets in
   code or CI logs; pass `${{ github.event.* }}` through `env:` first.
3. Any wiki/Notion write (e.g. `docs/runbooks/*`) goes through the Wiki Write Gate
   (`tech/roles/_wiki-write-gate.md`): propose → approve → write.
4. Return a concise report: infra/CI changes, deploy status, Definition-of-Done
   status, anything needing the driver's Review Gate before commit.
```

- [ ] **Step 6: Verify frontmatter + role-card references**

Run:
```bash
cd /Users/michel-angelo/Desktop/test555/bdt-app
for f in frontend backend data tester devops; do
  A=".claude/agents/$f.md"
  grep -q "^name: $f" "$A" || echo "BAD name in $A"
  grep -q "roles/$f.md" "$A" || echo "MISSING role-card ref in $A"
  grep -q "_wiki-write-gate.md" "$A" || echo "MISSING gate ref in $A"
done
echo "check done"
```
Expected: `check done` with no `BAD`/`MISSING` lines.

- [ ] **Step 7: Commit (bdt-app repo)**

```bash
cd /Users/michel-angelo/Desktop/test555/bdt-app
git add .claude/agents/frontend.md .claude/agents/backend.md .claude/agents/data.md .claude/agents/tester.md .claude/agents/devops.md
git commit -m "feat: add 5 role subagents for bdt-session-driver"
```

---

### Task 5: The driver command

**Files (bdt-app repo):**
- Create: `.claude/commands/bdt-session-driver.md`

Follows the existing command format (frontmatter `description` + `argument-hint`,
then numbered steps), like `.claude/commands/sync-sprint.md`.

- [ ] **Step 1: Write `.claude/commands/bdt-session-driver.md`**

````markdown
---
description: Drive a full BDT work session — recap, consistency gate, select, implement, drift backfill, close — taking the handoff from Claude cowork via wiki + Notion
argument-hint: [task-id or feature name | empty = pick from sprint]
---

# /bdt-session-driver — BDT work-session driver (P0–P5)

Drives one Claude Code work session from the cowork handoff to close. Cowork has
already written architecture/design to the wiki and created Sprint/Feature/Task in
Notion. This command walks P0→P5. **Communicate with cowork only through wiki +
Notion** — no durable knowledge stays in chat.

**Target:** $ARGUMENTS (optional — a task id / feature; empty = recap then pick).

Shared rules referenced below:
- Wiki Write Gate: `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/_wiki-write-gate.md`
- Role cards: same `roles/` dir — `frontend.md`, `backend.md`, `data.md`, `tester.md`, `devops.md`
- Role subagents: `.claude/agents/{frontend,backend,data,tester,devops}.md`

---

## P0 — Recap

1. Run `/sync-sprint` to refresh the Notion snapshot.
2. Dispatch Explore subagents in parallel to read: the relevant wiki design pages
   (`tech/`, `features/`), the Notion task(s) for `$ARGUMENTS`, and the matching
   code area in `src/` or `backend/`.
3. Present a short **"here is what I understand"** recap and ask the user to
   confirm before going further. Do not start work until confirmed.

## P1 — Consistency Gate (tiered)

Compare wiki ↔ Notion ↔ codebase for gaps/contradictions.
- **Hard stop + flag** when the conflict touches **principle / architecture /
  data model**: append to `_contradictions.md` (never overwrite) and/or run
  `/blocking-questions`, then ask the user before proceeding. Do not guess.
- **Log assumption + continue** for small ambiguity (naming, ordering): record the
  assumption and surface it in the P5 handoff.

## P2 — Select + Plan

1. Pick the task (from `$ARGUMENTS` or the sprint), set its level/scope.
2. Tag which role(s) it spans (frontend/backend/data/tester/devops).
3. Draft a short plan and **get user approval before implementing**.

## P3 — Implement

1. For each role the task spans, dispatch that role subagent
   (`.claude/agents/<role>.md`). Multi-role tasks → dispatch in parallel.
2. Each subagent stays inside its role card's `Owns`; boundary crossings come back
   to you to re-dispatch the right role.
3. Do the code / rewrite / fixbug work through the subagents; integrate results.

## P4 — Drift Backfill (immediate)

If the design changed mid-flight, backfill **in this same round** — do not defer:
1. Apply the **Wiki Write Gate**: propose the diff (which wiki page / Notion row,
   which lines, why) → get user approval → then write (via `/wiki-update` or the
   `wiki-integrator` subagent for large edits).
2. Never leave drift unrecorded for "later".

## P5 — Close

1. **Review Gate** — before any `commit`, `push`, or marking a Notion task
   **Done**: stop and ask the user to review. Every time. No exceptions.
2. **Cowork-Sync** — under the Wiki Write Gate: update changed wiki pages, then
   rewrite `pm/handoff.md` (What this round did / Wiki changed / Notion closed /
   Pending cowork decision).
3. Hand off to `/wrap-up` for the existing 8-step closure protocol.
````

- [ ] **Step 2: Verify all phases + gates present**

Run:
```bash
cd /Users/michel-angelo/Desktop/test555/bdt-app
C=.claude/commands/bdt-session-driver.md
for s in "## P0 — Recap" "## P1 — Consistency Gate" "## P2 — Select" "## P3 — Implement" "## P4 — Drift Backfill" "## P5 — Close" "Review Gate" "Wiki Write Gate" "/sync-sprint" "/wrap-up"; do
  grep -q "$s" "$C" || echo "MISSING [$s]"
done
echo "check done"
```
Expected: `check done` with no `MISSING` lines.

- [ ] **Step 3: Verify no placeholder tokens**

Run:
```bash
grep -nE "TODO|TBD|FIXME|fill in|implement later" .claude/commands/bdt-session-driver.md && echo "FOUND PLACEHOLDER" || echo "clean"
```
Expected: `clean`

- [ ] **Step 4: Commit (bdt-app repo)**

```bash
git add .claude/commands/bdt-session-driver.md
git commit -m "feat: add /bdt-session-driver command (P0-P5 with hard gates)"
```

---

### Task 6: Flip CLAUDE.md "planned" → available

**Files (bdt-app repo):**
- Modify: `CLAUDE.md` (§5 — the "Planned (in design)" note and command/subagent tables)

- [ ] **Step 1: Update the command table**

In `CLAUDE.md` §5, add `/bdt-session-driver` to the slash-commands table:

```markdown
| `/bdt-session-driver` | Drive a full work session P0–P5 (recap→gate→select→implement→backfill→close) |
```

- [ ] **Step 2: Add the 5 role subagents to the subagents table**

```markdown
| `frontend` / `backend` / `data` / `tester` / `devops` | Role implementation subagents dispatched by `/bdt-session-driver` at implement time; each loads its role card in `wiki/tech/roles/` |
```

- [ ] **Step 3: Replace the "Planned (in design)" block**

Replace the blockquote that starts `> **Planned (in design):**` with:

```markdown
> The session-driver system is **live**: `/bdt-session-driver` (command) + 5 role
> subagents + role cards in `wiki/tech/roles/` + the Wiki Write Gate. Design spec:
> `docs/superpowers/specs/2026-05-29-bdt-session-driver-skill-design.md`.
```

- [ ] **Step 4: Verify**

Run:
```bash
cd /Users/michel-angelo/Desktop/test555/bdt-app
grep -q "/bdt-session-driver" CLAUDE.md && ! grep -q "Planned (in design)" CLAUDE.md && echo OK
```
Expected: `OK`

- [ ] **Step 5: Commit (bdt-app repo)**

```bash
git add CLAUDE.md
git commit -m "docs: mark bdt-session-driver system live in CLAUDE.md"
```

---

### Task 7: End-to-end smoke test (manual)

No automated harness can fully exercise a slash command non-interactively, so
verify by hand.

- [ ] **Step 1: Confirm all artifacts resolve**

Run:
```bash
WIKI=~/Documents/bdt/knowledge-base/projects/bdt-engineering-system
APP=/Users/michel-angelo/Desktop/test555/bdt-app
ls "$WIKI"/wiki/tech/roles/{_wiki-write-gate,frontend,backend,data,tester,devops}.md \
   "$WIKI"/pm/handoff.md \
   "$APP"/.claude/agents/{frontend,backend,data,tester,devops}.md \
   "$APP"/.claude/commands/bdt-session-driver.md \
&& echo "ALL ARTIFACTS PRESENT"
```
Expected: all paths listed, then `ALL ARTIFACTS PRESENT`.

- [ ] **Step 2: Live smoke test**

In a fresh Claude Code session in `bdt-app`, run `/bdt-session-driver` with a real
task id. Confirm it: (a) runs `/sync-sprint`, (b) dispatches Explore to read wiki +
Notion + code, (c) presents a recap and waits for confirmation. Stop there — that
proves P0→P1 wiring. Do not let it proceed to writes during the smoke test.

- [ ] **Step 3: Push both repos (after user review — Review Gate applies)**

```bash
cd /Users/michel-angelo/Desktop/test555/bdt-app && git push origin dev-t-session-driver-skill
cd ~/Documents/bdt/knowledge-base && git push origin master
```

---

## Self-Review (completed by plan author)

**Spec coverage:** bidirectional loop → driver P0/P5 + handoff (T3,T5); P0–P5 →
T5; tiered consistency gate → T5 P1; Wiki Write Gate → T1 + referenced in T4/T5;
Review Gate → T5 P5; Cowork-Sync → T5 P5 + T3; 5 role cards → T2; 5 subagents →
T4; file layout → T1–T6; handoff format → T3; composition with existing commands →
T5 (sync-sprint/wiki-update/wrap-up/blocking-questions). §10 future (hook) is
explicitly out of scope — no task, by design. **No gaps.**

**Placeholder scan:** `<date>`, `<page>`, `<N>` in the handoff template (T3) and
recap are intentional template tokens inside the artifact, not plan placeholders.
No "TODO/TBD/implement later" in plan instructions.

**Type consistency:** section names (`## Owns`, `## Conventions`,
`## Definition-of-Done`, `## Review criteria`, `## Must NOT touch`) and phase
headings (`## P0 — Recap` … `## P5 — Close`) are used identically in the artifacts
and in the verify greps. Gate names ("Wiki Write Gate", "Review Gate") consistent
across T1, T4, T5. Role-card filename refs (`roles/<role>.md`) match T2 outputs.
